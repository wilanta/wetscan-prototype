import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  ApprovedPool,
  PlatformDatabase,
} from "../../src/platform/database";
import {
  approvedDatabaseConfig,
  parseApproval,
  type ApprovedDatabaseConfig,
} from "../../src/platform/config";
import { migrationPlan, applyMigrations } from "../../src/platform/migrations";
import { DetectionStore } from "../../src/features/sentinel/detection/store";
import { retainDetection } from "../../src/features/sentinel/detection/retention";
import { IncidentStore } from "../../src/features/sentinel/incidents/store";
import { retainIncidents } from "../../src/features/sentinel/incidents/retention";
import {
  TelemetryStore,
  retainTelemetry,
} from "../../src/features/sentinel/telemetry/store";
import { PostgresQueue } from "../../src/platform/queue";
import type { SentinelProjectContext } from "../../src/features/sentinel/types";
import { seedRules } from "../../src/features/sentinel/detection/seeds";
import { executeLease } from "../../worker/sentinel/executor";
import {
  evidenceSnapshot,
  type EvidenceSnapshot,
} from "./telemetry-retest-safety";
import {
  fullS04EvidenceSnapshot,
  incidentAcceptancePermission,
  preserveAllS04CommittedRows,
  preserveS03,
  snapshotDigest,
  reviewedS04Plan,
  verifyPopulatedS04DownRefusal,
  type FullS04Snapshot,
} from "./incident-acceptance-safety";

/** Never run destructive setup here. Requires explicit owner H04B approval and SENTINEL_S04_ACCEPTANCE_RUN=1. */
describe.skipIf(process.env.SENTINEL_S04_ACCEPTANCE_RUN !== "1")(
  "S04 real PostgreSQL - BLOCKED until fresh exact-target approval",
  () => {
    let configs: Record<"app" | "worker" | "migration", ApprovedDatabaseConfig>;
    let pools: Record<"app" | "worker" | "migration", ApprovedPool>;
    let app: PlatformDatabase;
    let worker: PlatformDatabase;
    let detection: DetectionStore;
    let incidents: IncidentStore;
    let telemetry: TelemetryStore;
    let context: SentinelProjectContext;
    let before: EvidenceSnapshot;
    let beforeFull: FullS04Snapshot;
    let createdIncidentId = "";
    const planPromise = migrationPlan("0004_incidents");

    beforeAll(async () => {
      const plan = await planPromise;
      expect(plan.sha256).toBe(reviewedS04Plan);
      configs = {
        app: await approvedDatabaseConfig(
          process.env,
          "app",
          "integration_test",
          plan.sha256,
        ),
        worker: await approvedDatabaseConfig(
          process.env,
          "worker",
          "integration_test",
          plan.sha256,
        ),
        migration: await approvedDatabaseConfig(
          process.env,
          "migration",
          "integration_test",
          plan.sha256,
        ),
      };
      parseApproval(
        configs.migration.approval,
        configs.migration.target,
        "migrate_up",
        plan.sha256,
      );
      const perm = await incidentAcceptancePermission(
        configs.migration.approval,
      );
      pools = {
        app: new ApprovedPool(configs.app),
        worker: new ApprovedPool(configs.worker),
        migration: new ApprovedPool(configs.migration),
      };
      before = await evidenceSnapshot(pools.migration);
      expect(snapshotDigest(before)).toBe(perm.baselineSha256);
      beforeFull = await fullS04EvidenceSnapshot(pools.migration);
      await applyMigrations(pools.migration, plan.migrations, "up");
      await applyMigrations(pools.migration, plan.migrations, "up");
      app = new PlatformDatabase(pools.app, false);
      worker = new PlatformDatabase(pools.worker, true);
      detection = new DetectionStore(app);
      incidents = new IncidentStore(app);
      telemetry = new TelemetryStore(app);
      context = {
        scope: {
          mode: "live",
          workspaceId: perm.workspaceId,
          projectId: "github-998736528",
        },
        actorId: "github-user-7",
        repositoryId: "998736528",
        canvasProjectRef: "github-user-7/github-998736528",
      };
    });

    afterAll(async () => {
      if (pools) {
        const after = await evidenceSnapshot(pools.migration);
        preserveS03(before, after);
        if (beforeFull) {
          preserveAllS04CommittedRows(
            beforeFull,
            await fullS04EvidenceSnapshot(pools.migration),
          );
        }
        await Promise.all([
          pools.app.end(),
          pools.worker.end(),
          pools.migration.end(),
        ]);
      }
    });

    it("correlates a persisted S03 alert into a durable S04 incident with append-only timeline and RLS isolation", async () => {
      const key = await telemetry.create(context, {
        name: "S04 controlled fixture",
        environment: "local",
        origin: "controlled_test",
        retentionDays: 7,
        rateLimit: 1000,
      });
      const createdRule = await detection.command(context, {
        action: "create",
        definition: {
          ...seedRules[3].definition,
          threshold: 1,
          windowSeconds: 3600,
          cooldownSeconds: 0,
        },
      });
      const ruleId = (createdRule as { ruleId: string }).ruleId;
      await detection.command(context, {
        action: "enable",
        ruleId,
        expectedRevision: 1,
      });
      const now = new Date().toISOString();
      const eventId = randomUUID();
      await telemetry.ingest(key.credential, {
        schemaVersion: 1,
        batchId: randomUUID(),
        sentAt: now,
        events: [
          {
            schemaVersion: 1,
            eventId,
            projectId: context.scope.projectId,
            occurredAt: now,
            kind: "http.request",
            request: { method: "GET", routeTemplate: "/api/test", statusCode: 500 },
          },
        ],
      });
      const queue = new PostgresQueue(worker, context.scope, [
        "sentinel.telemetry.accepted",
      ]);
      const [lease] = await queue.claim({
        module: "sentinel",
        workerId: "s04-fixture-worker",
        limit: 1,
        leaseMs: 30000,
      });
      expect(
        await executeLease(
          queue,
          lease,
          async (_j, sig, cur) => {
            await new DetectionStore(worker).process(cur(), sig, {
              correlateIncidents: true,
            });
          },
          {
            heartbeatMs: 5000,
            timeoutMs: 15000,
            signal: new AbortController().signal,
          },
        ),
      ).toBe("completed");

      const page = await incidents.incidents(context, new URLSearchParams());
      expect(page.items.length).toBeGreaterThanOrEqual(1);
      const inc = page.items[0];
      createdIncidentId = inc.incidentId;
      expect(inc.status).toBe("open");
      expect(inc.verificationStatus).toBe("not_requested");
      expect(inc.origin).toBe("controlled_test");

      const detail = await incidents.incidentDetails(context, inc.incidentId);
      expect(detail.timeline.map((t) => t.type)).toEqual([
        "alert_created",
        "incident_opened",
      ]);

      await incidents.command(context, {
        action: "investigate",
        incidentId: inc.incidentId,
        expectedRevision: 1,
        note: "Controlled PostgreSQL integration triage.",
      });
      await incidents.command(context, {
        action: "close",
        incidentId: inc.incidentId,
        expectedRevision: 2,
        reason: "Controlled PostgreSQL integration close.",
      });

      const updated = await incidents.incidentDetails(context, inc.incidentId);
      expect(updated.incident.status).toBe("closed");
      expect(updated.incident.verificationStatus).toBe("not_requested");
      expect(updated.timeline).toHaveLength(4);

      expect(await retainIncidents(worker, context.scope)).toEqual({
        incidents: 0,
        timeline: 0,
      });
      await retainDetection(worker, context.scope, true);
      await retainTelemetry(worker, context.scope, true, true);
    });

    it("populated 0004_incidents reversal is refused before any destructive statement and preserves all committed records", async () => {
      expect(createdIncidentId).toBeTruthy();
      const beforeRefusal = await incidents.incidentDetails(
        context,
        createdIncidentId,
      );
      expect(beforeRefusal.incident.incidentId).toBe(createdIncidentId);
      expect(beforeRefusal.alerts).toHaveLength(1);
      expect(beforeRefusal.evidence).toHaveLength(1);
      expect(beforeRefusal.timeline).toHaveLength(4);

      const plan = await planPromise;
      const audit = await verifyPopulatedS04DownRefusal(
        pools.migration,
        plan.migrations,
      );
      expect(audit.blockedStatements).toEqual([]);
      expect(audit.lockTimeoutConfigured).toBe(true);
      expect(audit.clientReleased).toBe(true);
      expect(audit.inTransaction).toBe(false);
      expect(audit.statements[0]).toBe("BEGIN");
      expect(audit.statements.at(-1)).toBe("ROLLBACK");
      expect(
        audit.statements.some((s) =>
          /\b(DROP|DELETE|TRUNCATE|ALTER|INSERT|UPDATE|CREATE|GRANT|REVOKE|COMMIT)\b/i.test(
            s,
          ),
        ),
      ).toBe(false);

      const afterRefusal = await incidents.incidentDetails(
        context,
        createdIncidentId,
      );
      expect(afterRefusal).toEqual(beforeRefusal);
      preserveS03(before, await evidenceSnapshot(pools.migration));
    });

    it("reuses the correlated incident across duplicate same-window worker executions without timeline FK errors and preserves lifecycle", async () => {
      const dupKey = await telemetry.create(context, {
        name: "S04 duplicate correlation fixture",
        environment: "local",
        origin: "controlled_test",
        retentionDays: 7,
        rateLimit: 1000,
      });
      const nowMs = Date.now();
      const baseMs = nowMs % 3_600_000 > 3_540_000 ? nowMs - 60_000 : nowMs - 1_000;
      const firstAt = new Date(baseMs).toISOString();
      const secondAt = new Date(baseMs + 50).toISOString();
      const thirdAt = new Date(baseMs + 100).toISOString();
      const ev1Id = randomUUID();
      const ev2Id = randomUUID();
      const ev3Id = randomUUID();

      await telemetry.ingest(dupKey.credential, {
        schemaVersion: 1,
        batchId: randomUUID(),
        sentAt: firstAt,
        events: [
          {
            schemaVersion: 1,
            eventId: ev1Id,
            projectId: context.scope.projectId,
            occurredAt: firstAt,
            kind: "http.request",
            request: { method: "GET", routeTemplate: "/api/dup", statusCode: 500 },
          },
        ],
      });

      const queue = new PostgresQueue(worker, context.scope, [
        "sentinel.telemetry.accepted",
      ]);
      const [lease1] = await queue.claim({
        module: "sentinel",
        workerId: "s04-fixture-worker",
        limit: 1,
        leaseMs: 30000,
      });
      expect(lease1?.job.subjectRef).toBe(`${dupKey.sourceId}/${ev1Id}`);
      expect(
        await executeLease(
          queue,
          lease1,
          async (_j, sig, cur) => {
            await new DetectionStore(worker).process(cur(), sig, {
              correlateIncidents: true,
            });
          },
          {
            heartbeatMs: 5000,
            timeoutMs: 15000,
            signal: new AbortController().signal,
          },
        ),
      ).toBe("completed");

      await telemetry.ingest(dupKey.credential, {
        schemaVersion: 1,
        batchId: randomUUID(),
        sentAt: secondAt,
        events: [
          {
            schemaVersion: 1,
            eventId: ev2Id,
            projectId: context.scope.projectId,
            occurredAt: secondAt,
            kind: "http.request",
            request: { method: "GET", routeTemplate: "/api/dup", statusCode: 500 },
          },
        ],
      });

      const [lease2] = await queue.claim({
        module: "sentinel",
        workerId: "s04-fixture-worker",
        limit: 1,
        leaseMs: 30000,
      });
      expect(lease2?.job.subjectRef).toBe(`${dupKey.sourceId}/${ev2Id}`);
      expect(
        await executeLease(
          queue,
          lease2,
          async (_j, sig, cur) => {
            await new DetectionStore(worker).process(cur(), sig, {
              correlateIncidents: true,
            });
          },
          {
            heartbeatMs: 5000,
            timeoutMs: 15000,
            signal: new AbortController().signal,
          },
        ),
      ).toBe("completed");

      const page = await incidents.incidents(
        context,
        new URLSearchParams({ sourceId: dupKey.sourceId }),
      );
      expect(page.items).toHaveLength(1);
      const inc = page.items[0];
      expect(inc.status).toBe("open");
      expect(inc.revision).toBe(1);

      const detail = await incidents.incidentDetails(context, inc.incidentId);
      expect(detail.alerts).toHaveLength(1);
      expect(detail.evidence.map((e) => e.event.eventId)).toEqual([
        ev1Id,
        ev2Id,
      ]);
      expect(
        detail.timeline.map((t) => [t.sequence, t.type, t.incidentRevision]),
      ).toEqual([
        [1, "alert_created", 1],
        [2, "incident_opened", 1],
      ]);
      const expectedDupEventIds = [ev1Id, ev2Id].sort();
      expect(
        detail.timeline.every(
          (t) =>
            t.evidenceRefs.length === 2 &&
            JSON.stringify(
              t.evidenceRefs.map((r) => r.id.split(":").at(-1)).sort(),
            ) === JSON.stringify(expectedDupEventIds),
        ),
      ).toBe(true);

      // Direct PostgreSQL check: single incident row, 0 orphaned timeline_evidence rows, and active FK constraint.
      const workerIncidents = new IncidentStore(worker);
      await worker.scoped(context.scope, async (tx) => {
        const dupIncCount = Number(
          (
            await worker.query(
              tx,
              "SELECT count(*)::int AS n FROM sentinel.incidents WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND source_id=$4",
              [
                context.scope.mode,
                context.scope.workspaceId,
                context.scope.projectId,
                dupKey.sourceId,
              ],
            )
          ).rows[0]?.n ?? -1,
        );
        expect(dupIncCount).toBe(1);
        const orphanCount = Number(
          (
            await worker.query(
              tx,
              "SELECT count(*)::int AS n FROM sentinel.incident_timeline_evidence ite LEFT JOIN sentinel.incident_timeline t USING(mode,workspace_id,project_id,incident_id,timeline_id) WHERE ite.mode=$1 AND ite.workspace_id=$2 AND ite.project_id=$3 AND ite.incident_id=$4 AND t.timeline_id IS NULL",
              [
                context.scope.mode,
                context.scope.workspaceId,
                context.scope.projectId,
                inc.incidentId,
              ],
            )
          ).rows[0]?.n ?? -1,
        );
        expect(orphanCount).toBe(0);
      });

      const rawWorker = await pools.worker.connect();
      try {
        await rawWorker.query("BEGIN");
        await rawWorker.query(
          "SELECT set_config('wetscan.workspace',$1,true),set_config('wetscan.project',$2,true),set_config('wetscan.mode',$3,true),set_config('wetscan.module','sentinel',true)",
          [
            context.scope.workspaceId,
            context.scope.projectId,
            context.scope.mode,
          ],
        );
        let fkError: { code?: string; constraint?: string } | undefined;
        try {
          await rawWorker.query(
            "INSERT INTO sentinel.incident_timeline_evidence(mode,workspace_id,project_id,incident_id,timeline_id,source_id,event_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [
              context.scope.mode,
              context.scope.workspaceId,
              context.scope.projectId,
              inc.incidentId,
              randomUUID(),
              dupKey.sourceId,
              ev1Id,
            ],
          );
        } catch (err) {
          fkError = err as { code?: string; constraint?: string };
        }
        expect(fkError?.code).toBe("23503");
        expect(fkError?.constraint).toBe(
          "incident_timeline_evidence_mode_workspace_id_project_id_in_fkey",
        );
        await rawWorker.query("ROLLBACK");
      } finally {
        rawWorker.release();
      }

      // Idempotency: repeated correlation calls leave counts, timeline, and revision untouched.
      expect(
        await workerIncidents.correlateAlertById(
          context.scope,
          detail.alerts[0].alertId,
        ),
      ).toEqual({ incidentId: inc.incidentId, created: false });
      expect(
        await workerIncidents.correlateAlertById(
          context.scope,
          detail.alerts[0].alertId,
        ),
      ).toEqual({ incidentId: inc.incidentId, created: false });
      const afterIdempotent = await incidents.incidentDetails(
        context,
        inc.incidentId,
      );
      expect(afterIdempotent.timeline).toHaveLength(2);
      expect(afterIdempotent.evidence).toHaveLength(2);
      expect(afterIdempotent.incident.revision).toBe(1);

      // Lifecycle + mid-investigation duplicate 3rd event + revision conflict + reopen.
      await incidents.command(context, {
        action: "investigate",
        incidentId: inc.incidentId,
        expectedRevision: 1,
        note: "Duplicate-window PostgreSQL integration triage.",
      });
      await telemetry.ingest(dupKey.credential, {
        schemaVersion: 1,
        batchId: randomUUID(),
        sentAt: thirdAt,
        events: [
          {
            schemaVersion: 1,
            eventId: ev3Id,
            projectId: context.scope.projectId,
            occurredAt: thirdAt,
            kind: "http.request",
            request: { method: "GET", routeTemplate: "/api/dup", statusCode: 500 },
          },
        ],
      });
      const [lease3] = await queue.claim({
        module: "sentinel",
        workerId: "s04-fixture-worker",
        limit: 1,
        leaseMs: 30000,
      });
      expect(lease3?.job.subjectRef).toBe(`${dupKey.sourceId}/${ev3Id}`);
      expect(
        await executeLease(
          queue,
          lease3,
          async (_j, sig, cur) => {
            await new DetectionStore(worker).process(cur(), sig, {
              correlateIncidents: true,
            });
          },
          {
            heartbeatMs: 5000,
            timeoutMs: 15000,
            signal: new AbortController().signal,
          },
        ),
      ).toBe("completed");
      const midInvestigating = await incidents.incidentDetails(
        context,
        inc.incidentId,
      );
      expect(midInvestigating.incident.status).toBe("investigating");
      expect(midInvestigating.incident.revision).toBe(2);
      expect(midInvestigating.evidence.map((e) => e.event.eventId)).toEqual([
        ev1Id,
        ev2Id,
        ev3Id,
      ]);
      expect(midInvestigating.timeline).toHaveLength(3);

      await expect(
        incidents.command(context, {
          action: "close",
          incidentId: inc.incidentId,
          expectedRevision: 1,
          reason: "Stale revision check.",
        }),
      ).rejects.toThrow("revision_conflict");

      await incidents.command(context, {
        action: "close",
        incidentId: inc.incidentId,
        expectedRevision: 2,
        reason: "Duplicate-window PostgreSQL integration close.",
      });
      await incidents.command(context, {
        action: "reopen",
        incidentId: inc.incidentId,
        expectedRevision: 3,
        reason: "Duplicate-window PostgreSQL integration reopen.",
      });

      const reopened = await incidents.incidentDetails(context, inc.incidentId);
      expect(reopened.incident.status).toBe("investigating");
      expect(reopened.incident.revision).toBe(4);
      expect(
        reopened.timeline.map((t) => [t.sequence, t.type, t.incidentRevision]),
      ).toEqual([
        [1, "alert_created", 1],
        [2, "incident_opened", 1],
        [3, "incident_opened", 2],
        [4, "incident_closed", 3],
        [5, "incident_opened", 4],
      ]);

      // Transactional atomicity: failure inside worker.scoped rolls back all incident/timeline writes.
      await expect(
        worker.scoped(context.scope, async (tx) => {
          await worker.query(
            tx,
            "UPDATE sentinel.incidents SET revision=revision+1 WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND incident_id=$4",
            [
              context.scope.mode,
              context.scope.workspaceId,
              context.scope.projectId,
              inc.incidentId,
            ],
          );
          await worker.query(
            tx,
            "INSERT INTO sentinel.incident_timeline(mode,workspace_id,project_id,incident_id,timeline_id,sequence,schema_version,event_type,actor_id,actor_type,from_status,to_status,summary,metadata,idempotency_key,incident_revision,occurred_at) VALUES($1,$2,$3,$4,$5,99,1,'alert_created','system:sentinel-worker','system',NULL,NULL,'atomic rollback probe','{}'::jsonb,$6,4,clock_timestamp())",
            [
              context.scope.mode,
              context.scope.workspaceId,
              context.scope.projectId,
              inc.incidentId,
              randomUUID(),
              "a".repeat(64),
            ],
          );
          throw new Error("forced_atomic_rollback");
        }),
      ).rejects.toThrow("forced_atomic_rollback");

      const afterRollback = await incidents.incidentDetails(
        context,
        inc.incidentId,
      );
      expect(afterRollback.incident.revision).toBe(4);
      expect(afterRollback.timeline).toHaveLength(5);

      preserveS03(before, await evidenceSnapshot(pools.migration));
      preserveAllS04CommittedRows(
        beforeFull,
        await fullS04EvidenceSnapshot(pools.migration),
      );
    });
  },
);
