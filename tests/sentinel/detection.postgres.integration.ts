import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  ApprovedPool,
  PlatformDatabase,
  type SqlPool,
} from "../../src/platform/database";
import {
  approvedDatabaseConfig,
  parseApproval,
  type ApprovedDatabaseConfig,
} from "../../src/platform/config";
import { migrationPlan, applyMigrations } from "../../src/platform/migrations";
import { DetectionStore } from "../../src/features/sentinel/detection/store";
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
  acceptancePermission,
  preserveS02,
  snapshotDigest,
  reviewedS03Plan,
} from "./detection-acceptance-safety";

/** Never run old destructive S01/S02 setup here. Every new committed fixture is retained. */
describe.skipIf(process.env.SENTINEL_S03_ACCEPTANCE_RUN !== "1")(
  "S03 real PostgreSQL - BLOCKED until fresh exact-target approval",
  () => {
    let configs: Record<"app" | "worker" | "migration", ApprovedDatabaseConfig>,
      pools: Record<"app" | "worker" | "migration", ApprovedPool>,
      app: PlatformDatabase,
      worker: PlatformDatabase,
      store: DetectionStore,
      telemetry: TelemetryStore,
      context: SentinelProjectContext,
      before: EvidenceSnapshot;
    let mutationsStarted = false;
    const planPromise = migrationPlan();
    const s = () => [
      context.scope.mode,
      context.scope.workspaceId,
      context.scope.projectId,
    ];
    async function scalar(
      db: PlatformDatabase,
      sql: string,
      values: unknown[] = [],
    ) {
      return db.scoped(
        context.scope,
        async (tx) => (await db.query(tx, sql, values)).rows,
      );
    }
    async function newRule(threshold = 1) {
      const created = await store.command(context, {
        action: "create",
        definition: {
          ...seedRules[3].definition,
          threshold,
          windowSeconds: 3600,
          cooldownSeconds: 0,
        },
      });
      const ruleId = (created as { ruleId: string }).ruleId;
      await store.command(context, {
        action: "enable",
        ruleId,
        expectedRevision: 1,
      });
      return ruleId;
    }
    async function sourceWithEvents(
      count = 1,
      offsets: number[] = [],
      statusCode = 500,
    ) {
      const key = await telemetry.create(context, {
        name: "S03 controlled fixture",
        environment: "local",
        origin: "controlled_test",
        retentionDays: 7,
        rateLimit: 1000,
      });
      const now = (await scalar(app, "SELECT clock_timestamp() AS now"))[0].now;
      const at = new Date(now).toISOString(),
        ids = Array.from({ length: count }, () => randomUUID());
      await telemetry.ingest(key.credential, {
        schemaVersion: 1,
        batchId: randomUUID(),
        sentAt: at,
        events: ids.map((eventId, i) => ({
          schemaVersion: 1,
          eventId,
          projectId: context.scope.projectId,
          occurredAt: new Date(
            Date.parse(at) + (offsets[i] ?? 0),
          ).toISOString(),
          kind: "http.request",
          request: { statusCode },
        })),
      });
      return { sourceId: key.sourceId, ids }; // Plaintext key stays in memory only.
    }
    function queue() {
      return new PostgresQueue(worker, context.scope, [
        "sentinel.telemetry.accepted",
      ]);
    }
    async function claim() {
      return queue().claim({
        module: "sentinel",
        workerId: "s03-fixture-worker",
        limit: 2,
        leaseMs: 30000,
      });
    }
    async function drain() {
      for (let i = 0; i < 20; i++) {
        const leases = await claim();
        if (!leases.length) return;
        for (const l of leases)
          expect(
            await executeLease(
              queue(),
              l,
              async (_j, signal, current) => {
                await new DetectionStore(worker).process(current(), signal);
              },
              {
                signal: new AbortController().signal,
                heartbeatMs: 10000,
                timeoutMs: 20000,
              },
            ),
          ).toBe("completed");
      }
      throw Error("fixture_job_budget_exceeded");
    }
    beforeAll(async () => {
      const plan = await planPromise;
      if (plan.sha256 !== reviewedS03Plan) throw Error("plan_changed");
      configs = {} as typeof configs;
      pools = {} as typeof pools;
      for (const purpose of ["app", "worker", "migration"] as const) {
        const c = await approvedDatabaseConfig(
          process.env,
          purpose,
          "integration_test",
          plan.sha256,
        );
        if (
          c.target.host !== "127.0.0.1" ||
          c.target.port !== 55432 ||
          c.target.database !== "wetscan_s01_test" ||
          c.target.marker !== "wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5"
        )
          throw Error("target_changed");
        parseApproval(c.approval, c.target, "migrate_up", plan.sha256);
        parseApproval(c.approval, c.target, "migrate_down", plan.sha256);
        await acceptancePermission(c.approval);
        configs[purpose] = c;
        pools[purpose] = new ApprovedPool(c);
        const client = await pools[purpose].connect();
        try {
          const version = (
            await client.query(
              "SELECT current_setting('server_version_num')::int AS n",
            )
          ).rows[0].n;
          if (version !== 170012) throw Error("version_changed");
        } finally {
          client.release();
        }
      }
      const permission = await acceptancePermission(configs.app.approval);
      before = await evidenceSnapshot(pools.migration);
      if (
        snapshotDigest(before) !== permission.baselineSha256 ||
        JSON.stringify(before.ledger.map((r) => [r.version, r.checksum])) !==
          JSON.stringify(
            plan.migrations.slice(0, 2).map((m) => [m.version, m.checksum]),
          )
      )
        throw Error("preflight_baseline_changed");
      if (
        before.structure.catalog.some((r) =>
          String(r.relname).startsWith("detection_"),
        )
      )
        throw Error("unexpected_detection_objects");
      app = new PlatformDatabase(pools.app);
      worker = new PlatformDatabase(pools.worker, true);
      store = new DetectionStore(app);
      telemetry = new TelemetryStore(app);
      context = {
        scope: {
          mode: "live",
          workspaceId: permission.workspaceId,
          projectId: "github-123",
        },
        actorId: "github-user-7",
        repositoryId: "123",
        canvasProjectRef: "github-user-7/github-123",
      };
      const c = await pools.migration.connect();
      try {
        const old = await c.query(
          "SELECT EXISTS(SELECT 1 FROM sentinel.project_bindings WHERE workspace_id=$1 OR workspace_id=$2) AS present",
          [permission.workspaceId, permission.workspaceId + "-other"],
        );
        if (old.rows[0].present) throw Error("fixture_scope_already_exists");
        const state = (
          await c.query(
            "SELECT to_regclass('sentinel.telemetry_detection_window') AS unexpected_index,(SELECT count(*)::int FROM pg_default_acl WHERE defaclrole=(SELECT oid FROM pg_roles WHERE rolname='wetscan_migrator')) AS defaults,(SELECT count(*)::int FROM platform.jobs WHERE state='leased' AND lease_until>clock_timestamp()) AS active_leases",
          )
        ).rows[0];
        if (
          state.unexpected_index ||
          state.defaults !== 0 ||
          state.active_leases !== 0
        )
          throw Error("unexpected_schema_permissions_or_active_worker");
        if (
          before.structure.roles.length !== 3 ||
          before.structure.roles.some(
            (r) =>
              r.rolsuper ||
              r.rolcreatedb ||
              r.rolcreaterole ||
              r.rolbypassrls ||
              !r.rolcanlogin,
          )
        )
          throw Error("restricted_roles_changed");
      } finally {
        c.release();
      }
    });
    afterAll(async () => {
      try {
        if (before && mutationsStarted) {
          const after = await evidenceSnapshot(pools.migration);
          preserveS02(before, after);
          console.log(
            JSON.stringify({
              evidence: "S03_TEST_ONLY",
              historicalRowsPreserved: true,
              ledger: after.ledger.map((r) => ({
                version: r.version,
                checksum: r.checksum,
              })),
              retainedCounts: after.counts,
              cleanup: "none",
            }),
          );
        }
      } finally {
        if (pools) await Promise.all(Object.values(pools).map((p) => p.end()));
      }
    });
    it("01 applies only additive0003 to the approved populated TEST", async () => {
      mutationsStarted = true;
      const p = await planPromise;
      await applyMigrations(pools.migration, p.migrations, "up");
      const after = await evidenceSnapshot(pools.migration);
      preserveS02(before, after);
      expect(after.ledger.map((r) => r.version)).toEqual(
        p.migrations.map((m) => m.version),
      );
    });
    it("02 second up is idempotent and checksum-enforced", async () => {
      const p = await planPromise,
        first = await evidenceSnapshot(pools.migration);
      await applyMigrations(pools.migration, p.migrations, "up");
      expect((await evidenceSnapshot(pools.migration)).ledger).toEqual(
        first.ledger,
      );
      await expect(
        applyMigrations(
          pools.migration,
          p.migrations.map((m, i) =>
            i === 2 ? { ...m, checksum: "0".repeat(64) } : m,
          ),
          "up",
        ),
      ).rejects.toThrow("target_denied");
    });
    it("03 verifies eight FORCE-RLS tables, narrow grants and immutable versions", async () => {
      const c = await pools.migration.connect();
      try {
        const rows = (
          await c.query(
            "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='sentinel' AND c.relkind='r' AND c.relname LIKE 'detection_%'",
          )
        ).rows;
        expect(rows).toHaveLength(8);
        expect(
          rows.every((r) => r.relrowsecurity && r.relforcerowsecurity),
        ).toBe(true);
        const grants = (
          await c.query(
            "SELECT has_table_privilege('wetscan_sentinel_worker','sentinel.detection_rule_versions','UPDATE') AS worker_rules,has_table_privilege('wetscan_app','sentinel.detection_alerts','INSERT') AS app_alerts,has_table_privilege('wetscan_sentinel_worker','sentinel.telemetry_credentials','SELECT') AS credentials",
          )
        ).rows[0];
        expect(grants).toEqual({
          worker_rules: false,
          app_alerts: false,
          credentials: false,
        });
      } finally {
        c.release();
      }
    });
    it("04 creates only opt-in drafts and rejects actor-rule enable", async () => {
      await telemetry.create(context, {
        name: "S03 initial source",
        environment: "local",
        origin: "controlled_test",
      });
      const a = await store.command(context, { action: "seed" }),
        b = await store.command(context, { action: "seed" });
      expect(a).toEqual(b);
      const rules = await store.rules(context);
      expect(rules).toHaveLength(4);
      expect(rules.every((r) => r.status === "DRAFT")).toBe(true);
      const actor = rules.find((r) => !r.supported)!;
      await expect(
        store.command(context, {
          action: "enable",
          ruleId: actor.ruleId,
          expectedRevision: actor.revision,
        }),
      ).rejects.toThrow("actor_identity_not_persisted");
    });
    it("05 persists immutable rule history and rejects optimistic conflicts", async () => {
      const id = await newRule();
      await expect(
        store.command(context, {
          action: "disable",
          ruleId: id,
          expectedRevision: 1,
        }),
      ).rejects.toThrow("revision_conflict");
      await store.command(context, {
        action: "disable",
        ruleId: id,
        expectedRevision: 2,
      });
      const history = await store.ruleDetails(context, id);
      expect(history.versions.map((r) => r.status)).toEqual([
        "DISABLED",
        "ENABLED",
        "DRAFT",
      ]);
      expect(history.audit).toHaveLength(3);
    });
    it("06 processes actual stored events into real referenced alerts", async () => {
      const id = await newRule(),
        src = await sourceWithEvents();
      await drain();
      const page = await store.alerts(
        context,
        new URLSearchParams({ ruleId: id, sourceId: src.sourceId }),
      );
      expect(page.items).toHaveLength(1);
      const detail = await store.alertDetails(context, page.items[0].alertId);
      expect(detail.evidence.map((e) => e.event.eventId)).toEqual(src.ids);
      expect(detail.alert.origin).toBe("controlled_test");
    });
    it("07 duplicate delivery and crash-after-persistence do not duplicate alerts", async () => {
      const id = await newRule(),
        src = await sourceWithEvents(),
        leases = await claim();
      expect(leases).toHaveLength(1);
      const l = leases[0];
      await new DetectionStore(worker).process(l, new AbortController().signal);
      const existing = await store.alerts(
        context,
        new URLSearchParams({ ruleId: id, sourceId: src.sourceId }),
      );
      await new DetectionStore(worker).process(l, new AbortController().signal);
      expect(
        (
          await store.alerts(
            context,
            new URLSearchParams({ ruleId: id, sourceId: src.sourceId }),
          )
        ).items.map((a) => a.alertId),
      ).toEqual(existing.items.map((a) => a.alertId));
      await queue().complete(l);
    });
    it("08 concurrent claims/evaluations produce one threshold alert", async () => {
      const id = await newRule(2),
        src = await sourceWithEvents(2);
      const leases = (await Promise.all([claim(), claim()])).flat();
      expect(new Set(leases.map((l) => l.job.jobId)).size).toBe(2);
      expect(leases).toHaveLength(2);
      await Promise.all(
        leases.map(async (l) => {
          await new DetectionStore(worker).process(
            l,
            new AbortController().signal,
          );
          await queue().complete(l);
        }),
      );
      const page = await store.alerts(
        context,
        new URLSearchParams({ ruleId: id, sourceId: src.sourceId }),
      );
      expect(page.items).toHaveLength(1);
      expect(page.items[0].matchedEventCount).toBe(2);
    });
    it("09 active cancellation refuses stale effects", async () => {
      await sourceWithEvents();
      const [l] = await claim();
      await queue().cancel(context.scope, "sentinel", l.job.jobId);
      await expect(
        new DetectionStore(worker).process(l, new AbortController().signal),
      ).rejects.toThrow("lease_lost");
    });
    it("10 expired/reclaimed fencing rejects the old worker", async () => {
      await sourceWithEvents();
      const [old] = await claim();
      await scalar(
        worker,
        "UPDATE platform.jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE module='sentinel' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND job_id=$4",
        [...s(), old.job.jobId],
      );
      const [fresh] = await claim();
      expect(fresh.leaseToken).not.toBe(old.leaseToken);
      await expect(
        new DetectionStore(worker).process(old, new AbortController().signal),
      ).rejects.toThrow("lease_lost");
      await new DetectionStore(worker).process(
        fresh,
        new AbortController().signal,
      );
      await queue().complete(fresh);
    });
    it("11 injected post-alert driver failure rolls back actual PostgreSQL effects", async () => {
      const id = await newRule(),
        src = await sourceWithEvents(),
        [l] = await claim();
      const failing: SqlPool = {
        connect: async () => {
          const c = await pools.worker.connect();
          return {
            query: async (sql, v) => {
              if (sql.startsWith("INSERT INTO sentinel.detection_evidence"))
                throw Error("injected_after_alert_insert");
              return c.query(sql, v);
            },
            release: (d) => c.release(d),
          };
        },
        end: async () => {},
      };
      await expect(
        new DetectionStore(new PlatformDatabase(failing, true)).process(
          l,
          new AbortController().signal,
        ),
      ).rejects.toThrow("injected_after_alert_insert");
      expect(
        (
          await store.alerts(
            context,
            new URLSearchParams({ ruleId: id, sourceId: src.sourceId }),
          )
        ).items,
      ).toHaveLength(0);
      await queue().retry(l, {
        availableAt: new Date().toISOString(),
        redactedError: "handler_failed",
      });
      await drain();
    });
    it("12 fresh pools preserve alerts and acknowledged processing", async () => {
      const id = await newRule(),
        src = await sourceWithEvents();
      await drain();
      const old = (
        await store.alerts(
          context,
          new URLSearchParams({ ruleId: id, sourceId: src.sourceId }),
        )
      ).items;
      const pool = new ApprovedPool(configs.app);
      try {
        expect(
          (
            await new DetectionStore(new PlatformDatabase(pool)).alerts(
              context,
              new URLSearchParams({ ruleId: id, sourceId: src.sourceId }),
            )
          ).items,
        ).toEqual(old);
      } finally {
        await pool.end();
      }
    });
    it("13 wrong project and workspace cannot read real alert rows", async () => {
      const other = {
        ...context,
        scope: { ...context.scope, projectId: "github-456" },
      };
      expect(
        (await store.alerts(other, new URLSearchParams())).items,
      ).toHaveLength(0);
      const wrong = {
        ...context,
        scope: {
          ...context.scope,
          workspaceId: context.scope.workspaceId + "-other",
        },
      };
      expect(await store.rules(wrong)).toHaveLength(0);
      await expect(
        store.alertDetails(
          wrong,
          (await store.alerts(context, new URLSearchParams())).items[0].alertId,
        ),
      ).rejects.toThrow("not_found");
    });
    it("14 actual other-project event cannot link to this project's alert", async () => {
      const other = {
        ...context,
        scope: { ...context.scope, projectId: "github-456" },
        repositoryId: "456",
        canvasProjectRef: "github-user-7/github-456",
      };
      const key = await telemetry.create(other, {
          name: "S03 isolation witness",
          environment: "local",
          origin: "controlled_test",
        }),
        eventId = randomUUID(),
        at = new Date(
          (await scalar(app, "SELECT clock_timestamp() AS now"))[0].now,
        ).toISOString();
      await telemetry.ingest(key.credential, {
        schemaVersion: 1,
        batchId: randomUUID(),
        sentAt: at,
        events: [
          {
            schemaVersion: 1,
            eventId,
            projectId: "github-456",
            occurredAt: at,
            kind: "http.request",
            request: { statusCode: 500 },
          },
        ],
      });
      const a = (
        await scalar(
          worker,
          "SELECT alert_id FROM sentinel.detection_alerts WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 LIMIT 1",
          s(),
        )
      )[0];
      await expect(
        worker.scoped(context.scope, async (tx) => {
          await worker.query(
            tx,
            "INSERT INTO sentinel.detection_evidence(mode,workspace_id,project_id,alert_id,source_id,event_id) VALUES($1,$2,$3,$4,$5,$6)",
            [...s(), a.alert_id, key.sourceId, eventId],
          );
        }),
      ).rejects.toMatchObject({ code: "23503" });
    });
    it("15 disabled rules yield no new alert and no-match jobs complete", async () => {
      const id = await newRule();
      await store.command(context, {
        action: "disable",
        ruleId: id,
        expectedRevision: 2,
      });
      const src = await sourceWithEvents();
      await drain();
      expect(
        (
          await store.alerts(
            context,
            new URLSearchParams({ ruleId: id, sourceId: src.sourceId }),
          )
        ).items,
      ).toHaveLength(0);
      expect(
        (
          await scalar(
            app,
            "SELECT count(*)::int AS n FROM platform.jobs WHERE module='sentinel' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND state='leased'",
            s(),
          )
        )[0].n,
      ).toBe(0);
    });
    it("16 legal hold and real evidence links prevent S02 retention deletion", async () => {
      await scalar(
        app,
        "UPDATE sentinel.project_bindings SET retention_hold=true WHERE mode=$1 AND workspace_id=$2 AND project_id=$3",
        s(),
      );
      expect(await retainTelemetry(worker, context.scope, true)).toEqual({
        events: 0,
        batches: 0,
      });
      await scalar(
        app,
        "UPDATE sentinel.project_bindings SET retention_hold=false WHERE mode=$1 AND workspace_id=$2 AND project_id=$3",
        s(),
      );
      const detail = await store.alertDetails(
        context,
        (await store.alerts(context, new URLSearchParams())).items[0].alertId,
      );
      await expect(
        worker.scoped(context.scope, async (tx) => {
          await worker.query(
            tx,
            "DELETE FROM sentinel.telemetry_events WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND source_id=$4 AND event_id=$5",
            [
              ...s(),
              detail.evidence[0].sourceId,
              detail.evidence[0].event.eventId,
            ],
          );
        }),
      ).rejects.toMatchObject({ code: "23503" });
    });
    it("17 Guard/unregistered job kinds cannot be claimed", async () => {
      await expect(
        queue().claim({
          module: "guard",
          workerId: "not-a-scanner",
          limit: 1,
          leaseMs: 30000,
        }),
      ).rejects.toThrow("scope_denied");
      const leases = await new PostgresQueue(worker, context.scope, [
        "sentinel.maintenance",
      ]).claim({
        module: "sentinel",
        workerId: "maintenance-fixture",
        limit: 1,
        leaseMs: 30000,
      });
      expect(leases).toHaveLength(0);
    });
    it("18 scoped new-job cutoff preserves earlier fixture jobs", async () => {
      await sourceWithEvents();
      const now = (
        await scalar(app, "SELECT clock_timestamp()+interval '1 hour' AS now")
      )[0].now;
      const q = new PostgresQueue(
        worker,
        context.scope,
        ["sentinel.telemetry.accepted"],
        new Date(now).toISOString(),
      );
      expect(
        await q.claim({
          module: "sentinel",
          workerId: "cutoff-fixture",
          limit: 2,
          leaseMs: 30000,
        }),
      ).toHaveLength(0);
      await drain();
    });
    it("19 populated0003 reversal is refused before any destructive statement", async () => {
      const statements: string[] = [];
      const allowed = (sql: string) =>
        [
          "BEGIN",
          "ROLLBACK",
          "COMMIT",
          "SELECT pg_advisory_xact_lock(7342001)",
        ].includes(sql) ||
        sql.startsWith("SELECT to_regclass(") ||
        sql.startsWith(
          "SELECT version,checksum FROM platform.schema_migrations",
        ) ||
        /^SELECT EXISTS\(SELECT 1 FROM sentinel\.detection_[a-z_]+ LIMIT 1\) AS occupied$/.test(
          sql,
        ) ||
        /^LOCK TABLE sentinel\.detection_suppressed_evidence,/.test(sql);
      const guarded: SqlPool = {
        connect: async () => {
          const c = await pools.migration.connect();
          return {
            query: async (sql, v) => {
              if (!allowed(sql)) throw Error("blocked_unapproved_down_sql");
              statements.push(sql);
              return c.query(sql, v);
            },
            release: (d) => c.release(d),
          };
        },
        end: async () => {},
      };
      await expect(
        applyMigrations(guarded, (await planPromise).migrations, "down"),
      ).rejects.toThrow("target_denied");
      expect(statements.at(-1)).toBe("ROLLBACK");
      expect(statements.some((s) => /^(DROP|DELETE|ALTER)/.test(s))).toBe(
        false,
      );
    });
    it("20 all original S01/S02 rows, roles, policies and ledger prefix survive", async () => {
      preserveS02(before, await evidenceSnapshot(pools.migration));
    });
    it("21 explicit suppression retains real match evidence without an alert", async () => {
      const now = new Date(
        (await scalar(app, "SELECT clock_timestamp() AS now"))[0].now,
      ).getTime();
      const created = await store.command(context, {
        action: "create",
        definition: {
          ...seedRules[3].definition,
          threshold: 1,
          suppressionWindows: [
            {
              from: new Date(now - 3600000).toISOString(),
              to: new Date(now + 3600000).toISOString(),
            },
          ],
        },
      });
      const id = (created as { ruleId: string }).ruleId;
      await store.command(context, {
        action: "enable",
        ruleId: id,
        expectedRevision: 1,
      });
      const src = await sourceWithEvents();
      await drain();
      expect(
        (
          await store.alerts(
            context,
            new URLSearchParams({ ruleId: id, sourceId: src.sourceId }),
          )
        ).items,
      ).toHaveLength(0);
      const history = await store.ruleDetails(context, id);
      expect(
        history.evaluations.some((r) => r.outcome === "alert_suppressed"),
      ).toBe(true);
      expect(
        history.suppressedEvidence.some(
          (r) => r.evidence_event_id === src.ids[0],
        ),
      ).toBe(true);
    });
    it("22 database cooldown suppresses a second distinct event-time window", async () => {
      const created = await store.command(context, {
        action: "create",
        definition: {
          ...seedRules[3].definition,
          threshold: 1,
          windowSeconds: 1,
          cooldownSeconds: 600,
        },
      });
      const id = (created as { ruleId: string }).ruleId;
      await store.command(context, {
        action: "enable",
        ruleId: id,
        expectedRevision: 1,
      });
      const src = await sourceWithEvents(2, [-2000, 0]);
      await drain();
      expect(
        (
          await store.alerts(
            context,
            new URLSearchParams({ ruleId: id, sourceId: src.sourceId }),
          )
        ).items,
      ).toHaveLength(1);
      expect(
        (await store.ruleDetails(context, id)).evaluations.some(
          (r) => r.reason === "cooldown",
        ),
      ).toBe(true);
    });
    it("23 nonmatching normalized statuses complete without a fabricated alert", async () => {
      const id = await newRule(),
        src = await sourceWithEvents(1, [], 200);
      await drain();
      expect(
        (
          await store.alerts(
            context,
            new URLSearchParams({ ruleId: id, sourceId: src.sourceId }),
          )
        ).items,
      ).toHaveLength(0);
    });
    it("24 real alert cursor traversal uses stable filters and rejects foreign cursors", async () => {
      const first = await store.alerts(context, new URLSearchParams("limit=1"));
      expect(first.nextCursor).toBeTruthy();
      const next = await store.alerts(
        context,
        new URLSearchParams({ limit: "1", cursor: first.nextCursor! }),
      );
      expect(next.items[0].alertId).not.toBe(first.items[0].alertId);
      expect(next.window).toEqual(first.window);
      await expect(
        store.alerts(
          { ...context, scope: { ...context.scope, projectId: "github-456" } },
          new URLSearchParams({ limit: "1", cursor: first.nextCursor! }),
        ),
      ).rejects.toThrow("invalid_cursor");
    });
  },
);
