import { expect, it } from "vitest";
import { PlatformDatabase } from "../../../src/platform/database";
import { PostgresQueue } from "../../../src/platform/queue";
import { GuardPostgresQueue } from "../../../src/features/guard/live/queue";
import { guardMigrationPlan } from "../../../src/features/guard/live/migrations";
import { applyGuardSchema } from "../../../src/features/guard/live/schema-runner";
import { verifyGuardSchema } from "../../../src/features/guard/live/schema-readiness";
import type { JobLease } from "../../../src/features/sentinel/platform-contracts";
import { RecordingClient, fakePool, scope } from "../../platform/helpers";
const jobId = "a".repeat(64);
function setup() {
  const client = new RecordingClient(),
    pool = fakePool(client),
    db = new PlatformDatabase(pool, true, "guard");
  const lease: JobLease = {
    workerId: "guard-s03-fixture",
    leaseToken: "1:synthetic-lease",
    expiresAt: new Date(Date.now() + 30000).toISOString(),
    job: {
      ...scope,
      schemaVersion: 1,
      module: "guard",
      jobId,
      kind: "guard.scan.prepare",
      subjectRef: jobId,
      idempotencyKey: "s03-compatibility",
      revision: 2,
      attempts: 1,
      maxAttempts: 3,
      availableAt: new Date().toISOString(),
      cancelRequested: false,
    },
  };
  return {
    client,
    pool,
    db,
    lease,
    queue: new GuardPostgresQueue(db, scope, jobId),
  };
}
it("keeps Guard's own job filter separate from S03 timestamp/admission constructor slots", () => {
  const f = setup();
  expect(f.queue).toBeInstanceOf(PostgresQueue);
  expect(
    () =>
      new PostgresQueue(
        f.db,
        scope,
        ["guard.scan.prepare"],
        new Date().toISOString(),
        {
          scope,
          jobIds: [jobId],
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
      ),
  ).toThrow("scope_denied");
  expect(f.pool.connect).not.toHaveBeenCalled();
});
it.each(["heartbeat", "complete", "retry", "cancel"] as const)(
  "inherited S03 %s retains scoped Guard fencing without Sentinel acceptance parameters",
  async (method) => {
    const f = setup(),
      row = {
        module: "guard",
        mode: "live",
        workspace_id: scope.workspaceId,
        project_id: scope.projectId,
        job_id: jobId,
        kind: "guard.scan.prepare",
        subject_ref: jobId,
        idempotency_key: f.lease.job.idempotencyKey,
        revision: 3,
        attempts: 1,
        max_attempts: 3,
        available_at: new Date(),
        cancel_requested: false,
        lease_owner: f.lease.workerId,
        lease_token: f.lease.leaseToken,
        lease_until: new Date(Date.now() + 30000),
        fingerprint: "b".repeat(64),
      };
    f.client.respond = async (sql) => ({
      rows: sql.includes("RETURNING *")
        ? [row]
        : sql.startsWith("UPDATE platform.jobs")
          ? [{ job_id: jobId }]
          : [],
      rowCount: sql.startsWith("UPDATE") ? 1 : 0,
    });
    if (method === "heartbeat") {
      const next = await f.queue.heartbeat(f.lease);
      expect(next.job.revision).toBe(3);
      expect(next.leaseToken).toBe(f.lease.leaseToken);
    } else if (method === "complete") await f.queue.complete(f.lease);
    else if (method === "retry")
      await f.queue.retry(f.lease, {
        availableAt: new Date().toISOString(),
        redactedError: "handler_timeout",
      });
    else await f.queue.cancel(scope, "guard", jobId);
    const writes = f.client.calls.filter((c) => c.sql.startsWith("UPDATE"));
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) {
      expect(write.values[0]).toBe("guard");
      expect(write.values).not.toContain("sentinel");
      expect(write.sql).not.toMatch(/job_id=ANY\(\$\d+::text\[\]\)/);
    }
    const primary = writes.find((c) =>
      c.sql.startsWith("UPDATE platform.jobs"),
    )!;
    if (method !== "cancel") {
      expect(primary.sql).toContain("lease_token=$7");
      expect(primary.sql).toContain("revision=$8");
      expect(primary.values[6]).toBe(f.lease.leaseToken);
      expect(primary.values[7]).toBe(2);
    }
    expect(f.client.calls.at(-1)?.sql).toBe("COMMIT");
  },
);
it("rejects the old two-version aggregate before asking for a migration connection", async () => {
  const f = setup(),
    plan = await guardMigrationPlan();
  expect(plan.platformVersions.map((v) => v.version)).toEqual([
    "0001_foundation",
    "0002_telemetry",
    "0003_detection",
  ]);
  const oldAggregate =
    "444596c4628d94f0824f98afcc960148662f55c691155e1092e0a11698101dfc";
  expect(plan.sha256).not.toBe(oldAggregate);
  await expect(
    applyGuardSchema(f.pool, plan, {
      schemaVersion: 1,
      module: "guard",
      purpose: "migration",
      role: "wetscan_guard_migrator",
      status: "APPROVED",
      approvedBy: "synthetic-compatibility-test-only",
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      actions: ["migrate_up"],
      target: {
        host: "127.0.0.1",
        port: 55432,
        database: "wetscan_s01_test_guardg01",
        marker: "wetscan-s01:11111111-1111-1111-1111-111111111111",
      },
      migrationPlanSha256: oldAggregate,
    }),
  ).rejects.toThrow("approval_required");
  expect(f.pool.connect).not.toHaveBeenCalled();
});
it("accepts the exact three-version readiness ledger and rejects a legacy ledger without DDL", async () => {
  const f = setup(),
    plan = await guardMigrationPlan();
  let legacy = false;
  f.client.respond = async (sql) => ({
    rows: sql.includes("FROM guard.schema_migrations")
      ? [{ version: plan.migration.version, checksum: plan.migration.checksum }]
      : sql.includes("FROM platform.schema_migrations")
        ? legacy
          ? plan.platformVersions.slice(0, 2)
          : plan.platformVersions
        : [],
    rowCount: 0,
  });
  await verifyGuardSchema(f.db, plan);
  legacy = true;
  await expect(verifyGuardSchema(f.db, plan)).rejects.toThrow(
    "approval_required",
  );
  expect(f.client.calls.at(-1)?.sql).toBe("ROLLBACK");
  expect(
    f.client.calls.some((c) =>
      /^(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/.test(c.sql),
    ),
  ).toBe(false);
});
