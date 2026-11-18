import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it, expect, vi, afterEach } from "vitest";
import { isKnownDegradedWorkerHealth } from "./dev-acceptance-safety";
import {
  PlatformError,
  workerConfig,
  type ApprovedDatabaseConfig,
} from "../../src/platform/config";
import { PlatformDatabase } from "../../src/platform/database";
import { PostgresQueue } from "../../src/platform/queue";
import { detectionActivation } from "../../src/features/sentinel/detection/activation";
import { incidentActivation } from "../../src/features/sentinel/incidents/activation";
import {
  requestedAcceptanceIsolation,
  verifyAcceptanceJobs,
} from "../../worker/sentinel/acceptance";
import { runSentinelWorker } from "../../worker/sentinel/runtime";
import {
  captureReadOnlyDevState,
  executeContainRule,
  readOnlyDevStateQueries,
} from "../../scripts/sentinel-dev-acceptance";
import { RecordingClient, fakePool } from "../platform/helpers";
import { reviewedS04Plan } from "./incident-acceptance-safety";
import {
  assertPinnedContainRuleOutcome,
  assertPinnedContainRuleTarget,
  assertSafeDevArtifactDir,
  assertSingleTableSelectColumns,
  assertWorkerHealthPayload,
  buildPreRecoverySnapshot,
  buildSealedS04RuntimeApproval,
  incidentColumns,
  parseH04CB2PhaseApproval,
  requireH04CB2ExecutionGate,
  selectRecoveryIncident,
  s04DevBaseline,
  s04DevContainRulePin,
  s04DevPriorAttemptDefaults,
  s04DevProjectScope,
  s04DevTarget,
  s04Tables,
  verifyCleanShutdownAndPostflight,
  verifyHistoricalMultisetPreserved,
  verifyPreRecoverySnapshot,
  verifyWorkerHeartbeatsClean,
  workerHeartbeatColumns,
  withRollbackOnlyDatabase,
  type PreRecoverySnapshot,
  type ProtectedJobBaselineRow,
  type WorkerHeartbeatBaselineRow,
} from "./dev-acceptance-safety";

const execFileAsync = promisify(execFile);

const sampleProtectedIds = Array.from(
  { length: 8 },
  (_, i) => `00000000-0000-4000-8000-00000000001${i}`,
);
const sampleSourceId = "26b6b537-c016-4dc7-8007-4e839e8b838f";
const sampleAdmittedIds = ["11111111-1111-4111-8111-111111111111"];
const validS04Migrations = [
  {
    version: "0001_platform",
    checksum: "1".repeat(64),
    up: "",
    down: "",
  },
  {
    version: "0002_telemetry",
    checksum: "2".repeat(64),
    up: "",
    down: "",
  },
  {
    version: "0003_detection",
    checksum: "3".repeat(64),
    up: "",
    down: "",
  },
  {
    version: "0004_incidents",
    checksum: s04DevBaseline.migration0004Sha256,
    up: "",
    down: "",
  },
];

function validPhaseApproval(
  phase: Parameters<typeof parseH04CB2PhaseApproval>[2]["phase"] = "preflight",
  ttlMs = 300_000,
  nowMs = Date.now(),
) {
  const approvedAt = new Date(nowMs - 5000).toISOString();
  const expiresAt = new Date(Date.parse(approvedAt) + ttlMs).toISOString();
  return {
    schemaVersion: 1 as const,
    status: "APPROVED" as const,
    approvedBy: "owner",
    approvedAt,
    target: { ...s04DevTarget },
    actions: ["runtime" as const],
    migrationPlanSha256: reviewedS04Plan,
    h04cB2: { phase, expiresAt },
  };
}

function makeBaselineJob(
  id: string,
  state = "queued",
  subjectRef = `${sampleSourceId}/evt-old`,
): ProtectedJobBaselineRow {
  return {
    job_id: id,
    kind: "sentinel.telemetry.accepted",
    mode: "live",
    workspace_id: s04DevProjectScope.workspaceId,
    project_id: s04DevProjectScope.projectId,
    state,
    revision: 1,
    attempts: state === "completed" ? 1 : 0,
    max_attempts: 3,
    cancel_requested: false,
    fence: 0,
    lease_owner: null,
    subject_ref: subjectRef,
    created_at: "2026-11-14T08:00:00Z",
    available_at: "2026-11-14T08:00:00Z",
    finished_at: state === "completed" ? "2026-11-15T10:00:00Z" : null,
    last_error: null,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("H04C-B2 DEV runtime acceptance safety controls", () => {
  it("fails closed when execution opt-in or role separation is missing", async () => {
    await expect(
      requireH04CB2ExecutionGate({}, "worker", "runtime", {
        phase: "worker-run",
        maxTtlMs: 600_000,
      }),
    ).rejects.toThrow("approval_required");

    await expect(
      requireH04CB2ExecutionGate(
        {
          SENTINEL_H04C_B2_EXECUTION: "1",
          SENTINEL_DB_MIGRATION_PASSWORD_FILE: "C:/private/mig.txt",
        },
        "worker",
        "runtime",
        { phase: "worker-run", maxTtlMs: 600_000 },
      ),
    ).rejects.toThrow("target_denied");

    expect(() =>
      assertSafeDevArtifactDir(
        join(process.cwd(), ".local/sentinel"),
        process.cwd(),
      ),
    ).toThrow("target_denied");
    expect(() =>
      assertSafeDevArtifactDir("relative/dir", process.cwd()),
    ).toThrow("invalid_input");
  });

  it("rejects wrong target, wrong plan, migrate_down, integration_test, wrong phase, expired, or oversized TTL approvals", () => {
    const now = Date.now();
    const base = validPhaseApproval("worker-run", 300_000, now);

    expect(() =>
      parseH04CB2PhaseApproval(base, "runtime", {
        phase: "worker-run",
        maxTtlMs: 600_000,
        nowMs: now,
      }),
    ).not.toThrow();

    expect(() =>
      parseH04CB2PhaseApproval(base, "migrate_down", {
        phase: "worker-run",
        maxTtlMs: 600_000,
        nowMs: now,
      }),
    ).toThrow("target_denied");

    for (const mutate of [
      (a: Record<string, unknown>) => {
        (a.actions as string[]).push("migrate_down");
      },
      (a: Record<string, unknown>) => {
        (a.actions as string[]).push("integration_test");
      },
      (a: Record<string, unknown>) => {
        (a.target as { database: string }).database = "wetscan_s01_test";
      },
      (a: Record<string, unknown>) => {
        (a.target as { port: number }).port = 5432;
      },
      (a: Record<string, unknown>) => {
        (a.target as { marker: string }).marker = "wetscan-s01:wrong";
      },
      (a: Record<string, unknown>) => {
        a.migrationPlanSha256 = "0".repeat(64);
      },
      (a: Record<string, unknown>) => {
        (a.h04cB2 as { phase: string }).phase = "cleanup";
      },
      (a: Record<string, unknown>) => {
        (a.h04cB2 as { expiresAt: string }).expiresAt = new Date(
          now - 1000,
        ).toISOString();
      },
      (a: Record<string, unknown>) => {
        (a.h04cB2 as { expiresAt: string }).expiresAt = new Date(
          Date.parse(String(a.approvedAt)) + 600_001,
        ).toISOString();
      },
    ]) {
      const copy = structuredClone(base) as Record<string, unknown>;
      mutate(copy);
      expect(() =>
        parseH04CB2PhaseApproval(copy, "runtime", {
          phase: "worker-run",
          maxTtlMs: 600_000,
          nowMs: now,
        }),
      ).toThrow(PlatformError);
    }
  });

  it("builds sealed s04RuntimeAcceptance approvals and enforces 8 protected jobs, disjoint admission, and 0004 checksum", () => {
    const approvedAt = new Date().toISOString();
    const earliestJobCreatedAt = new Date(
      Date.parse(approvedAt) + 2000,
    ).toISOString();

    const sealed = buildSealedS04RuntimeApproval({
      approvedBy: "owner",
      approvedAt,
      ttlMs: 300_000,
      sourceId: sampleSourceId,
      protectedJobIds: sampleProtectedIds,
      jobIds: sampleAdmittedIds,
      earliestJobCreatedAt,
      migrations: validS04Migrations,
    });
    expect(sealed.s04RuntimeAcceptance.pauseMaintenance).toBe(true);
    expect(sealed.s04RuntimeAcceptance.protectedJobIds).toHaveLength(8);
    expect(sealed.s04RuntimeAcceptance.jobIds).toEqual(sampleAdmittedIds);

    expect(() =>
      buildSealedS04RuntimeApproval({
        approvedBy: "owner",
        approvedAt,
        ttlMs: 600_001,
        sourceId: sampleSourceId,
        protectedJobIds: sampleProtectedIds,
        jobIds: sampleAdmittedIds,
        migrations: validS04Migrations,
      }),
    ).toThrow("invalid_input");

    expect(() =>
      buildSealedS04RuntimeApproval({
        approvedBy: "owner",
        approvedAt,
        ttlMs: 300_000,
        sourceId: sampleSourceId,
        protectedJobIds: sampleProtectedIds.slice(0, 7),
        jobIds: sampleAdmittedIds,
        migrations: validS04Migrations,
      }),
    ).toThrow("invalid_input");

    expect(() =>
      buildSealedS04RuntimeApproval({
        approvedBy: "owner",
        approvedAt,
        ttlMs: 300_000,
        sourceId: sampleSourceId,
        protectedJobIds: sampleProtectedIds,
        jobIds: [sampleProtectedIds[0]],
        migrations: validS04Migrations,
      }),
    ).toThrow("target_denied");

    expect(() =>
      buildSealedS04RuntimeApproval({
        approvedBy: "owner",
        approvedAt,
        ttlMs: 300_000,
        sourceId: sampleSourceId,
        protectedJobIds: sampleProtectedIds,
        jobIds: sampleAdmittedIds,
        detectionNotBefore: new Date(
          Date.parse(approvedAt) - 1000,
        ).toISOString(),
        migrations: validS04Migrations,
      }),
    ).toThrow("invalid_input");

    expect(() =>
      buildSealedS04RuntimeApproval({
        approvedBy: "owner",
        approvedAt,
        ttlMs: 300_000,
        sourceId: sampleSourceId,
        protectedJobIds: sampleProtectedIds,
        jobIds: sampleAdmittedIds,
        earliestJobCreatedAt: new Date(
          Date.parse(approvedAt) - 10,
        ).toISOString(),
        migrations: validS04Migrations,
      }),
    ).toThrow("invalid_input");

    expect(() =>
      buildSealedS04RuntimeApproval({
        approvedBy: "owner",
        approvedAt,
        ttlMs: 300_000,
        sourceId: sampleSourceId,
        protectedJobIds: sampleProtectedIds,
        jobIds: sampleAdmittedIds,
        migrations: validS04Migrations.slice(0, 3),
      }),
    ).toThrow("approval_required");
  });

  it("pins PostgresQueue claim SQL to admitted jobIds and preserves all 8 protected historical jobs", async () => {
    const now = Date.now();
    const approvedAt = new Date(now - 2000).toISOString();
    const approval = buildSealedS04RuntimeApproval({
      approvedBy: "owner",
      approvedAt,
      ttlMs: 300_000,
      sourceId: sampleSourceId,
      protectedJobIds: sampleProtectedIds,
      jobIds: sampleAdmittedIds,
      migrations: validS04Migrations,
    });
    const config: ApprovedDatabaseConfig = {
      target: s04DevTarget,
      purpose: "worker",
      user: "wetscan_sentinel_worker",
      password: "offline-test-password-placeholder",
      max: 3,
      approval,
    };
    const detection = detectionActivation(config.approval, true)!;
    const incidents = incidentActivation(config.approval, true, detection)!;
    const isolation = requestedAcceptanceIsolation(
      config,
      detection,
      true,
      incidents,
      validS04Migrations,
    )!;

    const client = new RecordingClient();
    client.authorizedProject = s04DevProjectScope.projectId;
    client.respond = async (sql) => {
      if (sql.includes("SELECT max_running")) {
        return { rows: [{ max_running: 2 }], rowCount: 1 };
      }
      if (sql.includes("FROM sentinel.project_bindings")) {
        return {
          rows: [{ project_id: s04DevProjectScope.projectId }],
          rowCount: 1,
        };
      }
      if (sql.includes("AS n")) {
        return { rows: [{ n: 0 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    };
    const db = new PlatformDatabase(fakePool(client), true, "sentinel");
    const queue = new PostgresQueue(
      db,
      s04DevProjectScope,
      ["sentinel.telemetry.accepted"],
      incidents.notBefore,
      isolation.admission,
    );

    await queue.claim({
      module: "sentinel",
      workerId: "w-1",
      limit: 2,
      leaseMs: 30000,
    });

    const candidateQuery = client.calls.find((c) =>
      c.sql.startsWith("WITH candidates"),
    );
    expect(candidateQuery).toBeDefined();
    expect(candidateQuery!.sql).toContain("job_id=ANY(");
    expect(candidateQuery!.values.at(-2)).toEqual(sampleAdmittedIds);
    for (const protectedId of sampleProtectedIds) {
      expect(candidateQuery!.values.at(-2)).not.toContain(protectedId);
    }

    await expect(
      queue.claim({
        module: "guard",
        workerId: "w-1",
        limit: 1,
        leaseMs: 30000,
      }),
    ).rejects.toThrow("scope_denied");
  });

  it("shuts down bounded isolated worker cleanly on expiry without falling back to unrestricted maintenance", async () => {
    const approvedAt = new Date().toISOString();
    const approval = buildSealedS04RuntimeApproval({
      approvedBy: "owner",
      approvedAt,
      ttlMs: 1200,
      sourceId: sampleSourceId,
      protectedJobIds: sampleProtectedIds,
      jobIds: sampleAdmittedIds,
      migrations: validS04Migrations,
    });
    const config: ApprovedDatabaseConfig = {
      target: s04DevTarget,
      purpose: "worker",
      user: "wetscan_sentinel_worker",
      password: "offline-test-password-placeholder",
      max: 3,
      approval,
    };
    const detection = detectionActivation(config.approval, true)!;
    const incidents = incidentActivation(config.approval, true, detection)!;
    const isolation = requestedAcceptanceIsolation(
      config,
      detection,
      true,
      incidents,
      validS04Migrations,
    )!;

    const client = new RecordingClient();
    client.respond = async (sql) => {
      if (
        sql.startsWith(
          "SELECT version,checksum FROM platform.schema_migrations",
        )
      ) {
        return {
          rows: validS04Migrations.map((m) => ({
            version: m.version,
            checksum: m.checksum,
          })),
          rowCount: 4,
        };
      }
      if (
        sql.startsWith("SELECT EXISTS(SELECT 1 FROM platform.worker_heartbeats")
      ) {
        return { rows: [{ present: false }], rowCount: 1 };
      }
      if (sql.includes("FROM platform.jobs WHERE job_id=ANY(")) {
        return {
          rows: [
            ...sampleProtectedIds.map((id) => ({
              job_id: id,
              module: "sentinel",
              mode: "live",
              workspace_id: s04DevProjectScope.workspaceId,
              project_id: s04DevProjectScope.projectId,
              kind: "sentinel.telemetry.accepted",
              subject_ref: `${sampleSourceId}/hist`,
              state: "queued",
              new_enough: false,
              incident_eligible: false,
              unexpired: true,
            })),
            ...sampleAdmittedIds.map((id) => ({
              job_id: id,
              module: "sentinel",
              mode: "live",
              workspace_id: s04DevProjectScope.workspaceId,
              project_id: s04DevProjectScope.projectId,
              kind: "sentinel.telemetry.accepted",
              subject_ref: `${sampleSourceId}/new-1`,
              state: "queued",
              new_enough: true,
              incident_eligible: true,
              unexpired: true,
            })),
          ],
          rowCount: 9,
        };
      }
      if (
        sql.startsWith(
          "SELECT origin,environment FROM sentinel.telemetry_sources",
        )
      ) {
        return {
          rows: [{ origin: "controlled_test", environment: "local" }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    };

    const pool = fakePool(client);
    const db = new PlatformDatabase(pool, true, "sentinel");
    const workerId = randomUUID();
    await verifyAcceptanceJobs(pool, isolation, detection, workerId, incidents);

    const control = Object.assign(new EventEmitter(), {
      connected: true,
      disconnect: vi.fn(),
    });
    const reasons: string[] = [];
    await runSentinelWorker({
      db,
      pool,
      migrations: validS04Migrations,
      options: { ...workerConfig({}), healthPort: 0, pollMs: 100 },
      workerId,
      control,
      detection,
      incidents,
      isolation,
      report: (event) => {
        if (event.reason) reasons.push(String(event.reason));
      },
    });

    expect(reasons).toContain("acceptance_expired");
    expect(client.calls.some((c) => c.sql.startsWith("DELETE "))).toBe(false);
    const beats = client.calls.filter((c) =>
      c.sql.startsWith("INSERT INTO platform.worker_heartbeats"),
    );
    expect(beats.at(-1)?.values[2]).toBe("stopped");
    expect(pool.end).toHaveBeenCalledOnce();
  });

  it("verifies historical multiset preservation, postflight cleanliness, and rollback-only DB boundary", async () => {
    const beforeHashes: Record<string, string[]> = {};
    for (let i = 0; i < 20; i++) {
      beforeHashes[`sentinel.t_${i}`] = i === 0 ? ["h1", "h2"] : ["h0"];
    }
    const afterHashes = {
      ...beforeHashes,
      "sentinel.t_0": ["h1", "h2", "h3"],
    };
    const protectedRows = sampleProtectedIds.map((id) => makeBaselineJob(id));
    const afterJobs = [
      ...protectedRows,
      makeBaselineJob(sampleAdmittedIds[0], "completed"),
    ];

    expect(() =>
      verifyHistoricalMultisetPreserved({
        beforeRowHashesByTable: beforeHashes,
        afterRowHashesByTable: afterHashes,
        protectedJobsBefore: protectedRows,
        allJobsAfter: afterJobs,
        admittedJobIds: sampleAdmittedIds,
        sourceId: sampleSourceId,
      }),
    ).not.toThrow();

    expect(() =>
      verifyHistoricalMultisetPreserved({
        beforeRowHashesByTable: beforeHashes,
        afterRowHashesByTable: { ...afterHashes, "sentinel.t_0": ["h1"] },
        protectedJobsBefore: protectedRows,
        allJobsAfter: afterJobs,
        admittedJobIds: sampleAdmittedIds,
        sourceId: sampleSourceId,
      }),
    ).toThrow("target_denied");

    expect(() =>
      verifyHistoricalMultisetPreserved({
        beforeRowHashesByTable: beforeHashes,
        afterRowHashesByTable: afterHashes,
        protectedJobsBefore: protectedRows,
        allJobsAfter: [
          ...protectedRows.slice(0, 7),
          makeBaselineJob(sampleProtectedIds[7], "completed"),
          makeBaselineJob(sampleAdmittedIds[0], "completed"),
        ],
        admittedJobIds: sampleAdmittedIds,
        sourceId: sampleSourceId,
      }),
    ).toThrow("target_denied");

    expect(() =>
      assertWorkerHealthPayload({
        acceptanceIsolation: true,
        maintenance: "paused_for_expiring_local_acceptance",
        jobAdmission: "sealed_job_ids",
        incidents: "enabled_for_approved_new_alerts",
      }),
    ).not.toThrow();
    expect(() =>
      assertWorkerHealthPayload({ acceptanceIsolation: false }),
    ).toThrow("scope_denied");

    expect(() =>
      verifyCleanShutdownAndPostflight({
        activeLeases: 0,
        expiredLeases: 0,
        liveSessions: [],
        runningProcesses: [],
        workerHeartbeats: [{ worker_id: "w1", status: "stopped" }],
        backupBytes: s04DevBaseline.backupSizeBytes,
        backupSha256: s04DevBaseline.backupSha256,
        sources: [
          { source_id: sampleSourceId, enabled: false, active_credentials: 0 },
        ],
        rules: [{ rule_id: "r1", status: "DISABLED" }],
        persistedTextSamples: ['{"routeTemplate":"/api/users/:redacted"}'],
        canarySecrets: ["secretCanary"],
      }),
    ).not.toThrow();

    expect(() =>
      verifyCleanShutdownAndPostflight({
        activeLeases: 0,
        expiredLeases: 0,
        liveSessions: [],
        runningProcesses: [],
        workerHeartbeats: [{ worker_id: "w1", status: "stopped" }],
        backupBytes: s04DevBaseline.backupSizeBytes,
        backupSha256: s04DevBaseline.backupSha256,
        sources: [
          { source_id: sampleSourceId, enabled: false, active_credentials: 0 },
        ],
        rules: [{ rule_id: "r1", status: "DISABLED" }],
        persistedTextSamples: ["leaked secretCanary here"],
        canarySecrets: ["secretCanary"],
      }),
    ).toThrow("invalid_input");

    // Verify rollback-only proxy never sends COMMIT to real client and always finishes with ROLLBACK.
    const rawClient = new RecordingClient();
    rawClient.authorizedProject = s04DevProjectScope.projectId;
    await withRollbackOnlyDatabase(fakePool(rawClient), true, async (db) => {
      await db.scoped(s04DevProjectScope, async (tx) => {
        await db.query(tx, "DELETE FROM sentinel.telemetry_batches WHERE 1=0");
      });
    });
    const sqls = rawClient.calls.map((c) => c.sql);
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls.some((s) => s.startsWith("SAVEPOINT "))).toBe(true);
    expect(sqls.some((s) => s.startsWith("RELEASE SAVEPOINT "))).toBe(true);
    expect(sqls).not.toContain("COMMIT");
    expect(sqls.at(-1)).toBe("ROLLBACK");
  });

  it("supports offline plan mode and rejects live CLI phases without SENTINEL_H04C_B2_EXECUTION=1", async () => {
    const planOut = await execFileAsync(
      process.execPath,
      ["--import", "tsx", "scripts/sentinel-dev-acceptance.ts", "plan"],
      { cwd: process.cwd() },
    );
    const parsed = JSON.parse(planOut.stdout) as {
      databaseConnections: number;
      planSha256: string;
      phases: string[];
      supportsPartialDevRecovery: boolean;
      priorAttemptDefaultRuleId: string;
    };
    expect(parsed.databaseConnections).toBe(0);
    expect(parsed.planSha256).toBe(reviewedS04Plan);
    expect(parsed.supportsPartialDevRecovery).toBe(true);
    expect(parsed.priorAttemptDefaultRuleId).toBe(
      s04DevPriorAttemptDefaults.ruleId,
    );
    expect(parsed.phases).toContain("contain-rule");

    await expect(
      execFileAsync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/sentinel-dev-acceptance.ts",
          "preflight",
          "--artifact-dir=C:/Windows/Temp/h04cb2-test",
          "--backup-file=C:/Windows/Temp/backup.dump",
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            SENTINEL_H04C_B2_EXECUTION: "0",
          },
        },
      ),
    ).rejects.toThrow();

    await expect(
      execFileAsync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/sentinel-dev-acceptance.ts",
          "contain-rule",
          "--artifact-dir=C:/Windows/Temp/h04cb2-test",
          "--cookie-file=C:/Windows/Temp/cookie.txt",
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            SENTINEL_H04C_B2_EXECUTION: "0",
          },
        },
      ),
    ).rejects.toThrow();
  }, 15_000);
});

describe("H04C-B2 partial DEV recovery harness adaptations", () => {
  function makePreS04Hashes(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (let i = 0; i < 18; i++) {
      out[`sentinel.t_${i}`] = i === 0 ? ["h1", "h2"] : ["h0"];
    }
    out["sentinel.telemetry_sources"] = ["src-h04ca"];
    out["sentinel.detection_rules"] = [];
    return out;
  }

  function make25TableHashes(
    base: Record<string, string[]>,
    populateS04: boolean,
  ): Record<string, string[]> {
    const out: Record<string, string[]> = { ...base };
    for (const tbl of s04Tables) {
      out[`sentinel.${tbl}`] = populateS04 ? [`attempt1-${tbl}-row1`] : [];
    }
    if (populateS04) {
      out["sentinel.detection_rules"] = [
        ...(out["sentinel.detection_rules"] ?? []),
        "rule-attempt1-enabled-hash",
      ];
    }
    return out;
  }

  function makeAttempt1Jobs(): {
    completed: ProtectedJobBaselineRow;
    exhaustedFailed: ProtectedJobBaselineRow;
  } {
    const oldSourceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    return {
      completed: {
        ...makeBaselineJob(
          "22222222-2222-4222-8222-222222222201",
          "completed",
          `${oldSourceId}/batch-1`,
        ),
        attempts: 1,
        max_attempts: 5,
      },
      exhaustedFailed: {
        ...makeBaselineJob(
          "22222222-2222-4222-8222-222222222202",
          "failed",
          `${oldSourceId}/batch-2`,
        ),
        attempts: 5,
        max_attempts: 5,
        revision: 6,
        finished_at: "2026-11-15T12:00:00Z",
        last_error: "23503: incident_timeline_evidence FK",
      },
    };
  }

  function makeValidSnapshot(populateS04 = true): PreRecoverySnapshot {
    const preS04 = makePreS04Hashes();
    const all25 = make25TableHashes(preS04, populateS04);
    const { completed, exhaustedFailed } = makeAttempt1Jobs();
    const staleHeartbeat = {
      module: "sentinel",
      worker_id: "790e660d-408d-4f8f-8897-91b906a426e7",
      status: "running",
      started_at: "2026-11-14T11:00:00Z",
      last_seen_at: "2026-11-14T11:05:00Z",
    };
    return buildPreRecoverySnapshot({
      schemaVersion: 1,
      recordedAt: "2026-11-15T20:00:00Z",
      target: s04DevTarget,
      historicalDigest: s04DevBaseline.historicalDigest,
      tableCount: 25,
      s04Empty: !populateS04,
      recoveryMode: populateS04,
      tableCounts: Object.fromEntries(
        Object.entries(all25).map(([k, v]) => [k, v.length]),
      ),
      preRecoveryRowHashesByTable: all25,
      protectedJobIds: sampleProtectedIds,
      historicalCompletedJobIds: ["33333333-3333-4333-8333-333333333333"],
      priorAttemptJobs: populateS04 ? [completed, exhaustedFailed] : [],
      priorSources: populateS04
        ? [
            {
              source_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              enabled: false,
              active_credentials: 0,
            },
          ]
        : [],
      priorRules: populateS04
        ? [
            {
              rule_id: s04DevPriorAttemptDefaults.ruleId,
              status: "ENABLED",
              revision: 2,
            },
          ]
        : [],
      priorRuleRowHashesById: populateS04
        ? { [s04DevPriorAttemptDefaults.ruleId]: "rule-attempt1-enabled-hash" }
        : {},
      historicalHeartbeats: [staleHeartbeat],
      existingIncidentIds: populateS04
        ? ["44444444-4444-4444-8444-444444444401"]
        : [],
      orphanedTimelineEvidenceCount: 0,
    });
  }

  it("validates pre-recovery snapshots for empty-S04 and partial DEV state and rejects missing/tampered snapshots", () => {
    const emptySnap = makeValidSnapshot(false);
    const partialSnap = makeValidSnapshot(true);
    expect(() => verifyPreRecoverySnapshot(emptySnap)).not.toThrow();
    expect(() => verifyPreRecoverySnapshot(partialSnap)).not.toThrow();

    expect(() => verifyPreRecoverySnapshot(null)).toThrow("target_denied");
    expect(() =>
      verifyPreRecoverySnapshot({
        ...partialSnap,
        preRecoverySha256: "0".repeat(64),
      }),
    ).toThrow("target_denied");
    expect(() =>
      verifyPreRecoverySnapshot({
        ...partialSnap,
        target: { ...s04DevTarget, database: "wetscan_s01_test" },
      }),
    ).toThrow("target_denied");
    expect(() =>
      verifyPreRecoverySnapshot({
        ...partialSnap,
        orphanedTimelineEvidenceCount: 1,
      }),
    ).toThrow("target_denied");
  });

  it("preserves attempt-1 S04 rows, failed exhausted job, and historical queued jobs while allowing bounded rule containment", () => {
    const preS04 = makePreS04Hashes();
    const partialSnap = makeValidSnapshot(true);
    const protectedRows = sampleProtectedIds.map((id) => makeBaselineJob(id));
    const histDone = makeBaselineJob(
      "33333333-3333-4333-8333-333333333333",
      "completed",
    );
    const { completed, exhaustedFailed } = makeAttempt1Jobs();
    const recoveryAdmitted = makeBaselineJob(
      sampleAdmittedIds[0],
      "completed",
      `${sampleSourceId}/batch-r1`,
    );

    const after25 = {
      ...partialSnap.preRecoveryRowHashesByTable,
      "sentinel.detection_rules": [
        "rule-attempt1-disabled-hash",
        "rule-recovery-disabled-hash",
      ],
      "sentinel.incidents": [
        ...(partialSnap.preRecoveryRowHashesByTable["sentinel.incidents"] ??
          []),
        "recovery-incident-row",
      ],
    };

    // Empty-S04 pre-recovery baseline remains valid with priorAttemptJobs=[].
    expect(() =>
      verifyHistoricalMultisetPreserved({
        beforeRowHashesByTable: preS04,
        afterRowHashesByTable: make25TableHashes(preS04, false),
        preRecoveryRowHashesByTable:
          makeValidSnapshot(false).preRecoveryRowHashesByTable,
        protectedJobsBefore: protectedRows,
        historicalCompletedJobIds: [histDone.job_id],
        priorAttemptJobs: [],
        allJobsAfter: [...protectedRows, histDone],
        admittedJobIds: [],
        sourceId: sampleSourceId,
      }),
    ).not.toThrow();

    // Valid recovery with authorized 7ad1deb8-... ENABLED -> DISABLED transition.
    expect(() =>
      verifyHistoricalMultisetPreserved({
        beforeRowHashesByTable: preS04,
        afterRowHashesByTable: after25,
        preRecoveryRowHashesByTable: partialSnap.preRecoveryRowHashesByTable,
        authorizedRuleTransition: {
          ruleId: s04DevPriorAttemptDefaults.ruleId,
          ruleRowBeforeHash: "rule-attempt1-enabled-hash",
          finalStatus: "DISABLED",
        },
        protectedJobsBefore: protectedRows,
        historicalCompletedJobIds: [histDone.job_id],
        priorAttemptJobs: [completed, exhaustedFailed],
        allJobsAfter: [
          ...protectedRows,
          histDone,
          completed,
          exhaustedFailed,
          recoveryAdmitted,
        ],
        admittedJobIds: [recoveryAdmitted.job_id],
        sourceId: sampleSourceId,
      }),
    ).not.toThrow();

    // Reject if old rule transitioned WITHOUT authorizedRuleTransition.
    expect(() =>
      verifyHistoricalMultisetPreserved({
        beforeRowHashesByTable: preS04,
        afterRowHashesByTable: after25,
        preRecoveryRowHashesByTable: partialSnap.preRecoveryRowHashesByTable,
        protectedJobsBefore: protectedRows,
        historicalCompletedJobIds: [histDone.job_id],
        priorAttemptJobs: [completed, exhaustedFailed],
        allJobsAfter: [
          ...protectedRows,
          histDone,
          completed,
          exhaustedFailed,
          recoveryAdmitted,
        ],
        admittedJobIds: [recoveryAdmitted.job_id],
        sourceId: sampleSourceId,
      }),
    ).toThrow("target_denied");

    // Reject deleting or mutating committed attempt-1 incident/timeline evidence row.
    expect(() =>
      verifyHistoricalMultisetPreserved({
        beforeRowHashesByTable: preS04,
        afterRowHashesByTable: {
          ...after25,
          "sentinel.incident_timeline_evidence": [],
        },
        preRecoveryRowHashesByTable: partialSnap.preRecoveryRowHashesByTable,
        authorizedRuleTransition: {
          ruleId: s04DevPriorAttemptDefaults.ruleId,
          ruleRowBeforeHash: "rule-attempt1-enabled-hash",
          finalStatus: "DISABLED",
        },
        protectedJobsBefore: protectedRows,
        historicalCompletedJobIds: [histDone.job_id],
        priorAttemptJobs: [completed, exhaustedFailed],
        allJobsAfter: [
          ...protectedRows,
          histDone,
          completed,
          exhaustedFailed,
          recoveryAdmitted,
        ],
        admittedJobIds: [recoveryAdmitted.job_id],
        sourceId: sampleSourceId,
      }),
    ).toThrow("target_denied");

    // Reject requeueing, retrying, or mutating prior exhausted failed job.
    expect(() =>
      verifyHistoricalMultisetPreserved({
        beforeRowHashesByTable: preS04,
        afterRowHashesByTable: after25,
        preRecoveryRowHashesByTable: partialSnap.preRecoveryRowHashesByTable,
        authorizedRuleTransition: {
          ruleId: s04DevPriorAttemptDefaults.ruleId,
          ruleRowBeforeHash: "rule-attempt1-enabled-hash",
          finalStatus: "DISABLED",
        },
        protectedJobsBefore: protectedRows,
        historicalCompletedJobIds: [histDone.job_id],
        priorAttemptJobs: [completed, exhaustedFailed],
        allJobsAfter: [
          ...protectedRows,
          histDone,
          completed,
          { ...exhaustedFailed, state: "queued", attempts: 0 },
          recoveryAdmitted,
        ],
        admittedJobIds: [recoveryAdmitted.job_id],
        sourceId: sampleSourceId,
      }),
    ).toThrow("target_denied");

    // Reject trying to admit exhausted failed job ID in sealed worker input or multiset input.
    expect(() =>
      buildSealedS04RuntimeApproval({
        approvedBy: "owner",
        approvedAt: new Date().toISOString(),
        ttlMs: 120_000,
        sourceId: sampleSourceId,
        protectedJobIds: sampleProtectedIds,
        priorAttemptJobIds: [exhaustedFailed.job_id],
        jobIds: [exhaustedFailed.job_id],
      }),
    ).toThrow("target_denied");

    // Reject unapproved extra queued/completed job.
    expect(() =>
      verifyHistoricalMultisetPreserved({
        beforeRowHashesByTable: preS04,
        afterRowHashesByTable: after25,
        preRecoveryRowHashesByTable: partialSnap.preRecoveryRowHashesByTable,
        authorizedRuleTransition: {
          ruleId: s04DevPriorAttemptDefaults.ruleId,
          ruleRowBeforeHash: "rule-attempt1-enabled-hash",
          finalStatus: "DISABLED",
        },
        protectedJobsBefore: protectedRows,
        historicalCompletedJobIds: [histDone.job_id],
        priorAttemptJobs: [completed, exhaustedFailed],
        allJobsAfter: [
          ...protectedRows,
          histDone,
          completed,
          exhaustedFailed,
          recoveryAdmitted,
          makeBaselineJob("55555555-5555-4555-8555-555555555555", "queued"),
        ],
        admittedJobIds: [recoveryAdmitted.job_id],
        sourceId: sampleSourceId,
      }),
    ).toThrow("scope_denied");
  });

  it("enforces dual-attempt rule/source cleanup, stale historical heartbeat isolation, and new-worker stop checks", () => {
    const partialSnap = makeValidSnapshot(true);
    const oldSourceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const staleHeartbeat = partialSnap.historicalHeartbeats[0];
    const newWorker = {
      module: "sentinel",
      worker_id: "h04cb2-rec01",
      status: "stopped",
      started_at: "2026-11-15T20:05:00Z",
      last_seen_at: "2026-11-15T20:05:10Z",
    };

    const basePostflight = {
      activeLeases: 0,
      expiredLeases: 0,
      liveSessions: [],
      runningProcesses: [],
      workerHeartbeats: [staleHeartbeat, newWorker],
      historicalHeartbeats: [staleHeartbeat],
      requiredStoppedWorkerIds: [newWorker.worker_id],
      backupBytes: s04DevBaseline.backupSizeBytes,
      backupSha256: s04DevBaseline.backupSha256,
      sources: [
        { source_id: oldSourceId, enabled: false, active_credentials: 0 },
        { source_id: sampleSourceId, enabled: false, active_credentials: 0 },
      ],
      rules: [
        { rule_id: s04DevPriorAttemptDefaults.ruleId, status: "DISABLED" },
        { rule_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", status: "DISABLED" },
      ],
      requiredDisabledSourceIds: [sampleSourceId, oldSourceId],
      requiredDisabledRuleIds: [
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        s04DevPriorAttemptDefaults.ruleId,
      ],
      orphanedTimelineEvidenceCount: 0,
      persistedTextSamples: ['{"routeTemplate":"/api/users/:redacted"}'],
      canarySecrets: ["secretCanary"],
    };

    // Passes cleanly despite immutable historical stale heartbeat having status='running'.
    expect(() =>
      verifyCleanShutdownAndPostflight(basePostflight),
    ).not.toThrow();

    // Fails if old prior rule 7ad1deb8-... remains ENABLED or old source stays active.
    expect(() =>
      verifyCleanShutdownAndPostflight({
        ...basePostflight,
        rules: [
          { rule_id: s04DevPriorAttemptDefaults.ruleId, status: "ENABLED" },
          {
            rule_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            status: "DISABLED",
          },
        ],
      }),
    ).toThrow("scope_denied");
    expect(() =>
      verifyCleanShutdownAndPostflight({
        ...basePostflight,
        sources: [
          { source_id: oldSourceId, enabled: false, active_credentials: 1 },
          { source_id: sampleSourceId, enabled: false, active_credentials: 0 },
        ],
      }),
    ).toThrow("scope_denied");

    // Fails if historical heartbeat row was deleted or mutated.
    expect(() =>
      verifyWorkerHeartbeatsClean({
        current: [newWorker],
        historical: [staleHeartbeat],
        requiredStoppedWorkerIds: [newWorker.worker_id],
      }),
    ).toThrow("target_denied");
    expect(() =>
      verifyWorkerHeartbeatsClean({
        current: [{ ...staleHeartbeat, status: "stopped" }, newWorker],
        historical: [staleHeartbeat],
        requiredStoppedWorkerIds: [newWorker.worker_id],
      }),
    ).toThrow("target_denied");
    expect(() =>
      verifyWorkerHeartbeatsClean({
        current: [
          { ...staleHeartbeat, last_seen_at: "2026-11-15T20:05:10Z" },
          newWorker,
        ],
        historical: [staleHeartbeat],
        requiredStoppedWorkerIds: [newWorker.worker_id],
      }),
    ).toThrow("target_denied");

    // Rejects any snapshot containing nonexistent stopped_at column metadata.
    const invalidHeartbeatSnap = buildPreRecoverySnapshot({
      ...partialSnap,
      historicalHeartbeats: [
        {
          ...staleHeartbeat,
          stopped_at: null,
        } as unknown as WorkerHeartbeatBaselineRow,
      ],
    });
    expect(() => verifyPreRecoverySnapshot(invalidHeartbeatSnap)).toThrow(
      "target_denied",
    );

    // Fails if new recovery worker has status !== 'stopped'.
    expect(() =>
      verifyCleanShutdownAndPostflight({
        ...basePostflight,
        workerHeartbeats: [staleHeartbeat, { ...newWorker, status: "running" }],
      }),
    ).toThrow("target_denied");

    // Fails if orphaned timeline evidence exists.
    expect(() =>
      verifyCleanShutdownAndPostflight({
        ...basePostflight,
        orphanedTimelineEvidenceCount: 1,
      }),
    ).toThrow("target_denied");

    // Contain-rule bounded DEV phase approval validation.
    const now = Date.now();
    expect(() =>
      parseH04CB2PhaseApproval(
        {
          ...validPhaseApproval("contain-rule", 300_000, now),
        },
        "runtime",
        { phase: "contain-rule", maxTtlMs: 1_800_000, nowMs: now },
      ),
    ).not.toThrow();
  });

  it("deterministically selects only the matching recovery incident and fails closed on missing or ambiguous lists", () => {
    const items = [
      {
        incidentId: "44444444-4444-4444-8444-444444444401",
        sourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        ruleId: s04DevPriorAttemptDefaults.ruleId,
      },
      {
        incidentId: "44444444-4444-4444-8444-444444444402",
        sourceId: sampleSourceId,
        ruleId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    ];
    expect(
      selectRecoveryIncident(items, {
        sourceId: sampleSourceId,
        ruleId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }).incidentId,
    ).toBe("44444444-4444-4444-8444-444444444402");

    expect(() =>
      selectRecoveryIncident(items, {
        sourceId: sampleSourceId,
        ruleId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      }),
    ).toThrow("target_denied");

    expect(() =>
      selectRecoveryIncident(
        [
          ...items,
          {
            incidentId: "44444444-4444-4444-8444-444444444403",
            sourceId: sampleSourceId,
            ruleId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          },
        ],
        {
          sourceId: sampleSourceId,
          ruleId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        },
      ),
    ).toThrow("target_denied");
  });

  it("enforces migration-defined columns on platform.worker_heartbeats and sentinel.incidents before live DEV execution", async () => {
    function parseMigrationTableColumns(
      sqlPath: string,
      tableName: string,
    ): string[] {
      const ddl = readFileSync(join(process.cwd(), sqlPath), "utf8");
      const header = new RegExp(
        `CREATE TABLE ${tableName.replace(".", "\\.")}\\s*\\(`,
        "i",
      ).exec(ddl);
      if (!header) {
        throw new Error(`missing_table_ddl:${tableName}`);
      }
      const start = header.index + header[0].length;
      let depth = 1;
      let inQuote = false;
      let bodyEnd = start;
      for (let i = start; i < ddl.length && depth > 0; i++) {
        const ch = ddl[i];
        if (ch === "'") inQuote = !inQuote;
        else if (!inQuote && ch === "(") depth++;
        else if (!inQuote && ch === ")") {
          depth--;
          if (depth === 0) {
            bodyEnd = i;
            break;
          }
        }
      }
      const body = ddl.slice(start, bodyEnd);
      const defs: string[] = [];
      depth = 0;
      inQuote = false;
      let tokenStart = 0;
      for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (ch === "'") inQuote = !inQuote;
        else if (!inQuote && ch === "(") depth++;
        else if (!inQuote && ch === ")") depth--;
        else if (!inQuote && depth === 0 && ch === ",") {
          defs.push(body.slice(tokenStart, i).trim());
          tokenStart = i + 1;
        }
      }
      defs.push(body.slice(tokenStart).trim());

      const constraints = new Set([
        "constraint",
        "primary",
        "unique",
        "foreign",
        "check",
      ]);
      const cols: string[] = [];
      for (const def of defs) {
        if (!def) continue;
        const m = /^([a-z_][a-z0-9_]*)\s+/i.exec(def);
        if (m && !constraints.has(m[1].toLowerCase())) {
          cols.push(m[1].toLowerCase());
        }
      }
      return cols;
    }

    const ddlHeartbeatCols = parseMigrationTableColumns(
      "migrations/sentinel/0001_foundation.up.sql",
      "platform.worker_heartbeats",
    );
    const ddlIncidentCols = parseMigrationTableColumns(
      "migrations/sentinel/0004_incidents.up.sql",
      "sentinel.incidents",
    );

    expect(ddlHeartbeatCols).toEqual([...workerHeartbeatColumns]);
    expect(ddlHeartbeatCols).not.toContain("stopped_at");
    expect(ddlIncidentCols).toEqual([...incidentColumns]);
    expect(ddlIncidentCols).toContain("opened_at");
    expect(ddlIncidentCols).not.toContain("created_at");

    expect(() =>
      assertSingleTableSelectColumns(
        readOnlyDevStateQueries.workerHeartbeats,
        "platform.worker_heartbeats",
        ddlHeartbeatCols,
      ),
    ).not.toThrow();
    expect(() =>
      assertSingleTableSelectColumns(
        readOnlyDevStateQueries.existingIncidents,
        "sentinel.incidents",
        ddlIncidentCols,
      ),
    ).not.toThrow();

    expect(() =>
      assertSingleTableSelectColumns(
        "SELECT module,worker_id,status,started_at::text AS started_at,last_seen_at::text AS last_seen_at,stopped_at::text AS stopped_at FROM platform.worker_heartbeats ORDER BY started_at,worker_id",
        "platform.worker_heartbeats",
        ddlHeartbeatCols,
      ),
    ).toThrow("target_denied");
    expect(() =>
      assertSingleTableSelectColumns(
        "SELECT incident_id,source_id,rule_id,status FROM sentinel.incidents ORDER BY created_at,incident_id",
        "sentinel.incidents",
        ddlIncidentCols,
      ),
    ).toThrow("target_denied");

    const staleHeartbeat = {
      module: "sentinel",
      worker_id: "790e660d-408d-4f8f-8897-91b906a426e7",
      status: "running",
      started_at: "2026-11-14T11:00:00Z",
      last_seen_at: "2026-11-14T11:05:00Z",
    };

    const client = new RecordingClient();
    client.respond = async (sql) => {
      if (sql === readOnlyDevStateQueries.identity) {
        return {
          rows: [
            {
              database: s04DevTarget.database,
              role: "wetscan_migrator",
              transaction_read_only: "on",
              marker: s04DevTarget.marker,
              server_port: s04DevTarget.port,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql === readOnlyDevStateQueries.ledger) {
        return {
          rows: validS04Migrations.map((m) => ({
            version: m.version,
            checksum: m.checksum,
          })),
          rowCount: 4,
        };
      }
      if (sql === readOnlyDevStateQueries.tables) {
        return {
          rows: [
            { nspname: "platform", relname: "worker_heartbeats" },
            { nspname: "sentinel", relname: "incidents" },
          ],
          rowCount: 2,
        };
      }
      if (sql === readOnlyDevStateQueries.workerHeartbeats) {
        assertSingleTableSelectColumns(
          sql,
          "platform.worker_heartbeats",
          ddlHeartbeatCols,
        );
        return { rows: [staleHeartbeat], rowCount: 1 };
      }
      if (sql === readOnlyDevStateQueries.existingIncidents) {
        assertSingleTableSelectColumns(
          sql,
          "sentinel.incidents",
          ddlIncidentCols,
        );
        return {
          rows: [
            {
              incident_id: "8e8cc956-88cf-585f-ae59-6d47eb6996dc",
              source_id: "3929f604-0f20-427a-aeb1-54b6eff4e326",
              rule_id: s04DevPriorAttemptDefaults.ruleId,
              status: "open",
            },
          ],
          rowCount: 1,
        };
      }
      if (
        sql === readOnlyDevStateQueries.activeLeases ||
        sql === readOnlyDevStateQueries.expiredLeases ||
        sql === readOnlyDevStateQueries.orphanedTimelineEvidence
      ) {
        return { rows: [{ count: 0 }], rowCount: 1 };
      }
      if (sql === readOnlyDevStateQueries.clockNow) {
        return { rows: [{ now: "2026-11-15T22:00:00Z" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    };

    const captured = await captureReadOnlyDevState(fakePool(client));
    expect(client.calls[0]?.sql).toBe(
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    expect(client.calls.at(-1)?.sql).toBe("COMMIT");
    expect(captured.workerHeartbeats).toEqual([staleHeartbeat]);
    expect("stopped_at" in captured.workerHeartbeats[0]).toBe(false);
    expect(captured.existingIncidents).toHaveLength(1);
    expect(() =>
      verifyWorkerHeartbeatsClean({
        current: [
          ...captured.workerHeartbeats,
          {
            module: "sentinel",
            worker_id: "h04cb2-rec01",
            status: "stopped",
            started_at: "2026-11-15T22:01:00Z",
            last_seen_at: "2026-11-15T22:01:10Z",
          },
        ],
        historical: captured.workerHeartbeats,
        requiredStoppedWorkerIds: ["h04cb2-rec01"],
      }),
    ).not.toThrow();
  });
});

describe("H04C-B2 pinned contain-rule hardening", () => {
  const pinnedRuleId = s04DevContainRulePin.ruleId;
  const validCookie = `wetscan_session=${"a".repeat(64)}`;

  function makePreRecovery(ruleOverrides?: {
    rule_id?: string;
    status?: string;
    revision?: number;
  }): PreRecoverySnapshot {
    const preTables = Object.fromEntries(
      Array.from({ length: s04DevBaseline.tableCount }, (_, i) => [
        `sentinel.tbl_${i}`,
        [`row_${i}`],
      ]),
    );
    return buildPreRecoverySnapshot({
      schemaVersion: 1,
      recordedAt: "2026-11-15T22:10:00Z",
      target: s04DevTarget,
      historicalDigest: s04DevBaseline.historicalDigest,
      tableCount: s04DevBaseline.tableCount,
      s04Empty: false,
      recoveryMode: true,
      tableCounts: Object.fromEntries(
        Object.keys(preTables).map((k) => [k, 1]),
      ),
      preRecoveryRowHashesByTable: preTables,
      protectedJobIds: sampleProtectedIds,
      historicalCompletedJobIds: ["33333333-3333-4333-8333-333333333333"],
      priorAttemptJobs: [],
      priorSources: [
        {
          source_id: "3929f604-0f20-427a-aeb1-54b6eff4e326",
          enabled: false,
          active_credentials: 0,
        },
      ],
      priorRules: [
        {
          rule_id: ruleOverrides?.rule_id ?? pinnedRuleId,
          status: ruleOverrides?.status ?? "ENABLED",
          revision: ruleOverrides?.revision ?? 2,
        },
      ],
      priorRuleRowHashesById: { [pinnedRuleId]: "rule-rev2-row-hash" },
      historicalHeartbeats: [],
      existingIncidentIds: ["8e8cc956-88cf-585f-ae59-6d47eb6996dc"],
      orphanedTimelineEvidenceCount: 0,
    });
  }

  function makeStatePool(
    snapshots: Array<{
      rule?: { rule_id: string; status: string; revision: number };
      sourceEnabled?: boolean;
      activeCredentials?: number;
      activeLeases?: number;
    }>,
  ) {
    let snapshotIndex = -1;
    const client = new RecordingClient();
    client.respond = async (sql) => {
      if (sql === "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY") {
        snapshotIndex = Math.min(snapshotIndex + 1, snapshots.length - 1);
        return { rows: [], rowCount: 0 };
      }
      const current = snapshots[Math.max(0, snapshotIndex)] ?? {};
      if (sql === readOnlyDevStateQueries.identity) {
        return {
          rows: [
            {
              database: s04DevTarget.database,
              role: "wetscan_migrator",
              transaction_read_only: "on",
              marker: s04DevTarget.marker,
              server_port: s04DevTarget.port,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql === readOnlyDevStateQueries.ledger) {
        return {
          rows: validS04Migrations.map((m) => ({
            version: m.version,
            checksum: m.checksum,
          })),
          rowCount: 4,
        };
      }
      if (sql === readOnlyDevStateQueries.activeLeases) {
        return { rows: [{ count: current.activeLeases ?? 0 }], rowCount: 1 };
      }
      if (
        sql === readOnlyDevStateQueries.expiredLeases ||
        sql === readOnlyDevStateQueries.orphanedTimelineEvidence
      ) {
        return { rows: [{ count: 0 }], rowCount: 1 };
      }
      if (sql === readOnlyDevStateQueries.sources) {
        return {
          rows: [
            {
              source_id: "3929f604-0f20-427a-aeb1-54b6eff4e326",
              enabled: current.sourceEnabled ?? false,
              origin: "synthetic",
              environment: "development",
              active_credentials: current.activeCredentials ?? 0,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql === readOnlyDevStateQueries.rules) {
        return {
          rows: current.rule ? [current.rule] : [],
          rowCount: current.rule ? 1 : 0,
        };
      }
      if (sql === readOnlyDevStateQueries.clockNow) {
        return { rows: [{ now: "2026-11-15T22:10:01Z" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    };
    return { client, pool: fakePool(client) };
  }

  it("enforces owner-pinned rule ID, ENABLED rev 2 precondition, and DISABLED rev 3 outcome", () => {
    const sources = [
      {
        source_id: "3929f604-0f20-427a-aeb1-54b6eff4e326",
        enabled: false,
        active_credentials: 0,
      },
    ];
    const validPre = { rule_id: pinnedRuleId, status: "ENABLED", revision: 2 };
    const validLive = { rule_id: pinnedRuleId, status: "ENABLED", revision: 2 };

    expect(() =>
      assertPinnedContainRuleTarget({
        ruleId: pinnedRuleId,
        expectedInitialRevision: 2,
        preRecoveryRule: validPre,
        liveRule: validLive,
        sources,
        activeLeases: 0,
        expiredLeases: 0,
        orphanedTimelineEvidence: 0,
      }),
    ).not.toThrow();

    // Rejects initial revision mismatch in live DB, preRecovery, or expectedInitialRevision.
    for (const badTarget of [
      { liveRule: { ...validLive, revision: 1 } },
      { liveRule: { ...validLive, revision: 3 } },
      { preRecoveryRule: { ...validPre, revision: 1 } },
      { expectedInitialRevision: 3 },
      { ruleId: "11111111-1111-4111-8111-111111111111" },
      // Rejects already-DISABLED or DRAFT rules rather than allowing alreadyDisabled pass.
      { liveRule: { ...validLive, status: "DISABLED" } },
      { liveRule: { ...validLive, status: "DISABLED", revision: 3 } },
      { preRecoveryRule: { ...validPre, status: "DISABLED" } },
      { liveRule: { ...validLive, status: "DRAFT" } },
    ]) {
      expect(() =>
        assertPinnedContainRuleTarget({
          ruleId: badTarget.ruleId ?? pinnedRuleId,
          expectedInitialRevision: badTarget.expectedInitialRevision ?? 2,
          preRecoveryRule: badTarget.preRecoveryRule ?? validPre,
          liveRule: badTarget.liveRule ?? validLive,
          sources,
          activeLeases: 0,
          expiredLeases: 0,
          orphanedTimelineEvidence: 0,
        }),
      ).toThrow("target_denied");
    }

    // Rejects outcome mismatch (wrong status or revision !== 3).
    expect(
      assertPinnedContainRuleOutcome({
        ruleId: pinnedRuleId,
        updatedRule: { rule_id: pinnedRuleId, status: "DISABLED", revision: 3 },
      }).revision,
    ).toBe(3);

    for (const updatedRule of [
      undefined,
      { rule_id: pinnedRuleId, status: "DISABLED", revision: 2 },
      { rule_id: pinnedRuleId, status: "DISABLED", revision: 4 },
      { rule_id: pinnedRuleId, status: "ENABLED", revision: 3 },
    ]) {
      expect(() =>
        assertPinnedContainRuleOutcome({
          ruleId: pinnedRuleId,
          updatedRule,
        }),
      ).toThrow("target_denied");
    }
  });

  it("sends strictly pinned expectedRevision 2 and records revision 2 -> 3 transition without alreadyDisabled bypass", async () => {
    const preRecovery = makePreRecovery();
    const { pool } = makeStatePool([
      { rule: { rule_id: pinnedRuleId, status: "ENABLED", revision: 2 } },
      { rule: { rule_id: pinnedRuleId, status: "DISABLED", revision: 3 } },
    ]);
    const calls: Array<{
      url: string;
      method?: string;
      body?: string;
      headers?: Record<string, string>;
    }> = [];

    const record = await executeContainRule({
      pool,
      preRecovery,
      origin: "http://127.0.0.1:3000",
      cookie: validCookie,
      ruleId: pinnedRuleId,
      expectedRevision: 2,
      httpRequest: async (url, options) => {
        calls.push({ url, ...options });
        return {
          status: 200,
          json: { ruleId: pinnedRuleId, revision: 3, status: "DISABLED" },
          headers: new Headers(),
        };
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      `http://127.0.0.1:3000/api/sentinel/projects/${s04DevProjectScope.projectId}/rules`,
    );
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers?.cookie).toBe(validCookie);
    expect(calls[0]?.headers?.origin).toBe("http://127.0.0.1:3000");
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      action: "disable",
      ruleId: pinnedRuleId,
      expectedRevision: 2,
    });
    expect(record).toMatchObject({
      schemaVersion: 1,
      ruleId: pinnedRuleId,
      previousStatus: "ENABLED",
      previousRevision: 2,
      finalStatus: "DISABLED",
      finalRevision: 3,
      alreadyDisabled: false,
      ruleRowBeforeHash: "rule-rev2-row-hash",
      preRecoverySha256: preRecovery.preRecoverySha256,
    });
  });

  it("aborts before issuing HTTP POST on initial revision mismatch, already-DISABLED rule, wrong ruleId, or invalid cookie", async () => {
    const cases: Array<{
      name: string;
      ruleId?: string;
      expectedRevision?: number;
      cookie?: string;
      preRule?: { rule_id?: string; status?: string; revision?: number };
      liveRule?: { rule_id: string; status: string; revision: number } | null;
      sourceEnabled?: boolean;
      activeLeases?: number;
      expectedError: string;
    }> = [
      {
        name: "live revision 3 mismatch",
        liveRule: { rule_id: pinnedRuleId, status: "ENABLED", revision: 3 },
        expectedError: "target_denied",
      },
      {
        name: "live revision 1 mismatch",
        liveRule: { rule_id: pinnedRuleId, status: "ENABLED", revision: 1 },
        expectedError: "target_denied",
      },
      {
        name: "already DISABLED at revision 2",
        liveRule: { rule_id: pinnedRuleId, status: "DISABLED", revision: 2 },
        expectedError: "target_denied",
      },
      {
        name: "already DISABLED at revision 3",
        liveRule: { rule_id: pinnedRuleId, status: "DISABLED", revision: 3 },
        expectedError: "target_denied",
      },
      {
        name: "pre-recovery revision mismatch",
        preRule: { status: "ENABLED", revision: 1 },
        expectedError: "target_denied",
      },
      {
        name: "wrong target rule ID",
        ruleId: "11111111-1111-4111-8111-111111111111",
        expectedError: "target_denied",
      },
      {
        name: "wrong expectedRevision arg",
        expectedRevision: 3,
        expectedError: "target_denied",
      },
      {
        name: "missing session cookie",
        cookie: "wetscan_session=not-a-64-hex-token",
        expectedError: "approval_required",
      },
      {
        name: "enabled telemetry source",
        sourceEnabled: true,
        expectedError: "scope_denied",
      },
      {
        name: "active worker lease",
        activeLeases: 1,
        expectedError: "target_denied",
      },
      {
        name: "missing live rule",
        liveRule: null,
        expectedError: "scope_denied",
      },
    ];

    const defaultLiveRule = {
      rule_id: pinnedRuleId,
      status: "ENABLED",
      revision: 2,
    };
    for (const c of cases) {
      let httpCalls = 0;
      const liveRule =
        c.liveRule === undefined ? defaultLiveRule : (c.liveRule ?? undefined);
      const { pool } = makeStatePool([
        {
          rule: liveRule,
          sourceEnabled: c.sourceEnabled,
          activeLeases: c.activeLeases,
        },
      ]);
      await expect(
        executeContainRule({
          pool,
          preRecovery: makePreRecovery(c.preRule),
          origin: "http://127.0.0.1:3000",
          cookie: c.cookie ?? validCookie,
          ruleId: c.ruleId ?? pinnedRuleId,
          expectedRevision: c.expectedRevision ?? 2,
          httpRequest: async () => {
            httpCalls += 1;
            return {
              status: 200,
              json: { ruleId: pinnedRuleId, revision: 3, status: "DISABLED" },
              headers: new Headers(),
            };
          },
        }),
      ).rejects.toThrow(c.expectedError);
      expect(httpCalls, c.name).toBe(0);
    }
  });

  it("fails closed when API reports 409 concurrent revision conflict or unexpected final revision", async () => {
    const conflictPool = makeStatePool([
      { rule: { rule_id: pinnedRuleId, status: "ENABLED", revision: 2 } },
    ]);
    let dbQueriesDuringPost = 0;
    await expect(
      executeContainRule({
        pool: {
          connect: async () => {
            dbQueriesDuringPost += 1;
            return conflictPool.pool.connect();
          },
        },
        preRecovery: makePreRecovery(),
        origin: "http://127.0.0.1:3000",
        cookie: validCookie,
        ruleId: pinnedRuleId,
        expectedRevision: 2,
        httpRequest: async () => ({
          status: 409,
          json: { error: "revision_conflict" },
          headers: new Headers(),
        }),
      }),
    ).rejects.toThrow("contain_rule_disable_failed:409");
    expect(dbQueriesDuringPost).toBe(1);

    const driftPool = makeStatePool([
      { rule: { rule_id: pinnedRuleId, status: "ENABLED", revision: 2 } },
      { rule: { rule_id: pinnedRuleId, status: "DISABLED", revision: 4 } },
    ]);
    await expect(
      executeContainRule({
        pool: driftPool.pool,
        preRecovery: makePreRecovery(),
        origin: "http://127.0.0.1:3000",
        cookie: validCookie,
        ruleId: pinnedRuleId,
        expectedRevision: 2,
        httpRequest: async () => ({
          status: 200,
          json: { ruleId: pinnedRuleId, revision: 3, status: "DISABLED" },
          headers: new Headers(),
        }),
      }),
    ).rejects.toThrow("target_denied");
  });
});

describe("known-degraded worker health", () => {
  const degraded = (failed: number, expired = 0, worker = "running") => ({
    status: "degraded",
    worker,
    queue: { failed, expired },
  });
  it("accepts 503/degraded only for exactly the preserved failed jobs", () => {
    expect(isKnownDegradedWorkerHealth(503, degraded(1), 1)).toBe(true);
    expect(isKnownDegradedWorkerHealth(503, degraded(2), 1)).toBe(false);
    expect(isKnownDegradedWorkerHealth(503, degraded(0), 1)).toBe(false);
  });
  it("rejects expired leases, a stopped worker, other statuses and 200", () => {
    expect(isKnownDegradedWorkerHealth(503, degraded(1, 1), 1)).toBe(false);
    expect(
      isKnownDegradedWorkerHealth(503, degraded(1, 0, "stale_or_stopped"), 1),
    ).toBe(false);
    expect(isKnownDegradedWorkerHealth(503, { status: "unavailable" }, 1)).toBe(
      false,
    );
    expect(isKnownDegradedWorkerHealth(200, degraded(1), 1)).toBe(false);
    expect(isKnownDegradedWorkerHealth(undefined, undefined, 1)).toBe(false);
  });
});
