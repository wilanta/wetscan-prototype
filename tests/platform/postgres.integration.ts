import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
} from "vitest";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { approvedDatabaseConfig } from "../../src/platform/config";
import { ApprovedPool, PlatformDatabase } from "../../src/platform/database";
import { migrationPlan, applyMigrations } from "../../src/platform/migrations";
import { PostgresQueue } from "../../src/platform/queue";
import { PostgresOutbox } from "../../src/platform/outbox";
import {
  bindProject,
  disableProject,
} from "../../src/features/sentinel/storage/projects";
import {
  retainInfrastructure,
  retainWorkerHeartbeats,
} from "../../src/platform/retention";
import { heartbeatWorker, platformHealth } from "../../src/platform/health";
import type {
  DurableJob,
  JobLease,
} from "../../src/features/sentinel/platform-contracts";
import type { SentinelProjectContext } from "../../src/features/sentinel/types";

if (process.env.SENTINEL_POSTGRES_TEST_APPROVED !== "1")
  throw new Error(
    "Use the H01-gated test:platform:postgres runner; no direct database tests",
  );
const prefix = `s01-${randomUUID()}`,
  at = new Date(Date.now() - 1000).toISOString();
const contexts: SentinelProjectContext[] = [123, 456].map((id) => ({
  scope: {
    mode: "live",
    workspaceId: `github-user-7:${prefix}`,
    projectId: `github-${id}`,
  },
  actorId: "github-user-7",
  repositoryId: String(id),
  canvasProjectRef: `github-user-7/github-${id}`,
}));
let app: PlatformDatabase,
  worker: PlatformDatabase,
  pools: ApprovedPool[] = [];
const makeJob = (i = 0, override: Partial<DurableJob> = {}): DurableJob => ({
  ...contexts[i].scope,
  schemaVersion: 1,
  module: "sentinel",
  jobId: randomUUID(),
  kind: "sentinel.maintenance",
  subjectRef: "approved-test-maintenance",
  idempotencyKey: randomUUID(),
  revision: 1,
  attempts: 0,
  maxAttempts: 3,
  availableAt: at,
  cancelRequested: false,
  ...override,
});
const q = (i = 0, kinds = ["sentinel.maintenance"]) =>
  new PostgresQueue(worker, contexts[i].scope, kinds);
const enqueue = (j: DurableJob) =>
  app.scoped(j, (tx) => new PostgresQueue(app).enqueue(tx, j));
const claim = (i = 0, limit = 1) =>
  q(i).claim({ module: "sentinel", workerId: prefix, limit, leaseMs: 5000 });
async function expire(l: JobLease) {
  await worker.scoped(l.job, (tx) =>
    worker.query(
      tx,
      `UPDATE platform.jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE module='sentinel' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND job_id=$4`,
      [l.job.mode, l.job.workspaceId, l.job.projectId, l.job.jobId],
    ),
  );
}
async function row(j: DurableJob) {
  return app.scoped(
    j,
    async (tx) =>
      (
        await app.query(tx, "SELECT * FROM platform.jobs WHERE job_id=$1", [
          j.jobId,
        ])
      ).rows[0],
  );
}
beforeAll(async () => {
  const plan = await migrationPlan();
  const ac = await approvedDatabaseConfig(
      process.env,
      "app",
      "integration_test",
      plan.sha256,
    ),
    wc = await approvedDatabaseConfig(
      process.env,
      "worker",
      "integration_test",
      plan.sha256,
    ),
    mc = await approvedDatabaseConfig(
      process.env,
      "migration",
      "migrate_up",
      plan.sha256,
    );
  await approvedDatabaseConfig(
    process.env,
    "migration",
    "migrate_down",
    plan.sha256,
  );
  pools = [new ApprovedPool(ac), new ApprovedPool(wc), new ApprovedPool(mc)];
  // Only a separately approved EMPTY test database is accepted; down refuses any existing runtime records.
  await applyMigrations(pools[2], plan.migrations, "up");
  await applyMigrations(pools[2], plan.migrations, "up");
  await applyMigrations(pools[2], plan.migrations, "down");
  await applyMigrations(pools[2], plan.migrations, "up");
  app = new PlatformDatabase(pools[0]);
  worker = new PlatformDatabase(pools[1], true);
});
beforeEach(async () => {
  for (const c of contexts)
    await app.scoped(c.scope, (tx) => bindProject(app, tx, c));
});
afterEach(async () => {
  if (!worker) return;
  for (const c of contexts) {
    await worker.scoped(c.scope, async (tx) => {
      const s = [c.scope.mode, c.scope.workspaceId, c.scope.projectId];
      await worker.query(
        tx,
        "DELETE FROM platform.notification_outbox WHERE module='sentinel' AND mode=$1 AND workspace_id=$2 AND project_id=$3",
        s,
      );
      await worker.query(
        tx,
        "DELETE FROM platform.jobs WHERE module='sentinel' AND mode=$1 AND workspace_id=$2 AND project_id=$3",
        s,
      );
    });
    await app.scoped(c.scope, (tx) =>
      app.query(
        tx,
        "UPDATE sentinel.project_bindings SET retention_hold=false,last_cleanup_at=NULL WHERE mode=$1 AND workspace_id=$2 AND project_id=$3",
        [c.scope.mode, c.scope.workspaceId, c.scope.projectId],
      ),
    );
  }
});
afterAll(async () => {
  try {
    if (worker) {
      await worker.transaction((tx) =>
        worker.query(
          tx,
          "DELETE FROM platform.worker_heartbeats WHERE module='sentinel' AND worker_id=$1",
          [prefix],
        ),
      );
      for (const c of contexts)
        await app.scoped(c.scope, (tx) =>
          app.query(
            tx,
            "DELETE FROM sentinel.project_bindings WHERE mode=$1 AND workspace_id=$2 AND project_id=$3",
            [c.scope.mode, c.scope.workspaceId, c.scope.projectId],
          ),
        );
    }
  } finally {
    await Promise.all(pools.map((p) => p.end()));
  }
});
describe("REAL PostgreSQL S01 acceptance - BLOCKED until explicit H01 test-target/migration approval", () => {
  it("uses committed reversible/checksummed migrations twice; altered ledger is refused", async () => {
    const plan = await migrationPlan();
    const client = await pools[2].connect();
    try {
      expect(
        (await client.query("SELECT version FROM platform.schema_migrations"))
          .rows,
      ).toHaveLength(1);
    } finally {
      client.release();
    }
    const bad = plan.migrations.map((m) => ({
      ...m,
      checksum: "0".repeat(64),
    }));
    await expect(applyMigrations(pools[2], bad, "up")).rejects.toThrow(
      "target_denied",
    );
  });
  it("transaction rollback loses neither a partial project change nor an orphan job/outbox", async () => {
    const j = makeJob();
    await expect(
      app.scoped(j, async (tx) => {
        await new PostgresQueue(app).enqueue(tx, j);
        throw new Error("approved test rollback");
      }),
    ).rejects.toThrow();
    expect(await row(j)).toBeUndefined();
  });
  it("same idempotency payload returns original receipt; conflicting payload is denied", async () => {
    const j = makeJob(),
      a = await enqueue(j),
      b = await enqueue({ ...j, jobId: randomUUID() });
    expect(a.jobId).toBe(b.jobId);
    expect(b.duplicate).toBe(true);
    await expect(enqueue({ ...j, subjectRef: "different" })).rejects.toThrow(
      "idempotency_conflict",
    );
  });
  it("concurrent enqueue produces one durable job", async () => {
    const j = makeJob();
    const receipts = await Promise.all([
      enqueue(j),
      enqueue({ ...j, jobId: randomUUID() }),
    ]);
    expect(new Set(receipts.map((r) => r.jobId)).size).toBe(1);
  });
  it("concurrent independent claims honor cross-process module capacity without duplicate leases", async () => {
    await Promise.all([
      enqueue(makeJob()),
      enqueue(makeJob()),
      enqueue(makeJob(1)),
    ]);
    const leases = (
      await Promise.all([claim(0, 2), claim(1, 2), claim(0, 2)])
    ).flat();
    expect(leases).toHaveLength(2);
    expect(new Set(leases.map((l) => l.job.jobId)).size).toBe(2);
  });
  it("heartbeat renews revision; old revisions and expired/reclaimed tokens cannot settle", async () => {
    await enqueue(makeJob());
    const first = (await claim())[0],
      renewed = await q().heartbeat(first);
    await expect(q().complete(first)).rejects.toThrow("lease_lost");
    await expire(renewed);
    const reclaimed = (await claim())[0];
    expect(reclaimed.leaseToken).not.toBe(first.leaseToken);
    expect(reclaimed.job.attempts).toBe(2);
    await expect(
      q().retry(renewed, { availableAt: at, redactedError: "handler_failed" }),
    ).rejects.toThrow("lease_lost");
    await q().complete(reclaimed);
  });
  it("an exited worker process leaves a durable lease reclaimed by a fresh process", async () => {
    const j = makeJob();
    await enqueue(j);
    const child = (id: string, complete = false) =>
      spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "tests/platform/claim-process.ts",
          JSON.stringify(contexts[0].scope),
          id,
          ...(complete ? ["--complete"] : []),
        ],
        {
          env: process.env,
          encoding: "utf8",
          windowsHide: true,
          timeout: 20000,
        },
      );
    const a = child(`${prefix}-a`);
    expect(a.status).toBe(0);
    const first = (JSON.parse(a.stdout) as JobLease[])[0];
    await expire(first);
    const b = child(`${prefix}-b`, true);
    expect(b.status).toBe(0);
    const second = (JSON.parse(b.stdout) as JobLease[])[0];
    expect(second.job.jobId).toBe(j.jobId);
    expect(second.leaseToken).not.toBe(first.leaseToken);
    expect((await row(j)).state).toBe("completed");
  });
  it("retries become due later and exhaust into a durable failed state", async () => {
    const j = makeJob(0, { maxAttempts: 1 });
    await enqueue(j);
    const l = (await claim())[0];
    await q().retry(l, {
      availableAt: new Date(Date.now() + 60000).toISOString(),
      redactedError: "handler_failed",
    });
    expect((await row(j)).state).toBe("failed");
    expect(await claim()).toEqual([]);
  });
  it("persisted cancellation and disabled binding invalidate an active lease", async () => {
    const j = makeJob();
    await enqueue(j);
    const l = (await claim())[0];
    await app.scoped(j, (tx) => disableProject(app, tx, j));
    expect((await row(j)).state).toBe("cancelled");
    await expect(q().complete(l)).rejects.toThrow("lease_lost");
    expect(await claim()).toEqual([]);
    const attempts = await app.scoped(j, (tx) =>
      app.query(
        tx,
        "SELECT outcome,finished_at FROM platform.job_attempts WHERE job_id=$1",
        [j.jobId],
      ),
    );
    expect(attempts.rows[0].outcome).toBe("cancelled");
    expect(attempts.rows[0].finished_at).not.toBeNull();
  });
  it("RLS denies a different project/workspace and the demo namespace", async () => {
    const a = makeJob(),
      b = makeJob(1);
    await enqueue(a);
    await enqueue(b);
    const rows = await app.scoped(contexts[0].scope, (tx) =>
      app.query(tx, "SELECT job_id FROM platform.jobs WHERE project_id=$1", [
        contexts[1].scope.projectId,
      ]),
    );
    expect(rows.rows).toEqual([]);
    const wrong = await app.scoped(
      { ...a, workspaceId: "github-user-8:other" },
      (tx) => app.query(tx, "SELECT job_id FROM platform.jobs"),
    );
    expect(wrong.rows).toEqual([]);
    await expect(
      app.scoped(a, (tx) =>
        app.query(
          tx,
          "UPDATE platform.jobs SET project_id=$1 WHERE job_id=$2",
          [b.projectId, a.jobId],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      app.scoped(a, (tx) =>
        app.query(tx, "UPDATE platform.jobs SET mode='demo' WHERE job_id=$1", [
          a.jobId,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
    expect(() => app.scoped({ ...a, mode: "demo" }, async () => {})).toThrow(
      "scope_denied",
    );
  });
  it("Guard jobs cannot be enrolled under Sentinel runtime roles", async () => {
    await expect(
      app.scoped(contexts[0].scope, (tx) =>
        new PostgresQueue(app).enqueue(tx, makeJob(0, { module: "guard" })),
      ),
    ).rejects.toThrow("scope_denied");
    const rows = await worker.transaction((tx) =>
      worker.query(tx, "SELECT job_id FROM platform.jobs WHERE module='guard'"),
    );
    expect(rows.rows).toEqual([]);
    const j = makeJob();
    await enqueue(j);
    await expect(
      app.scoped(j, (tx) =>
        app.query(
          tx,
          "UPDATE platform.jobs SET module='guard' WHERE job_id=$1",
          [j.jobId],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
  it("outbox entry and job commit atomically; provider remains unavailable", async () => {
    const entry = {
      ...contexts[0].scope,
      module: "sentinel" as const,
      schemaVersion: 1 as const,
      deliveryId: randomUUID(),
      idempotencyKey: randomUUID(),
      topic: "notification.requested",
      subjectRef: "future-case-ref",
      availableAt: at,
    };
    await expect(
      app.scoped(entry, async (tx) => {
        await new PostgresOutbox(new PostgresQueue(app)).append(tx, entry);
        throw new Error("rollback");
      }),
    ).rejects.toThrow();
    expect(
      (
        await app.scoped(entry, (tx) =>
          app.query(tx, "SELECT delivery_id FROM platform.notification_outbox"),
        )
      ).rows,
    ).toEqual([]);
    await app.scoped(entry, (tx) =>
      new PostgresOutbox(new PostgresQueue(app)).append(tx, entry),
    );
    expect(await claim()).toEqual([]); // Main Sentinel worker does not claim provider/outbox jobs.
    const receipt = (
      await q(0, ["sentinel.outbox"]).claim({
        module: "sentinel",
        workerId: prefix,
        limit: 1,
        leaseMs: 5000,
      })
    )[0];
    await worker.scoped(receipt.job, (tx) =>
      new PostgresOutbox(q()).recordAttempt(
        tx,
        receipt,
        entry.deliveryId,
        "not_configured",
      ),
    );
    await q().retry(receipt, {
      availableAt: at,
      redactedError: "not_configured",
    });
    const attempts = await app.scoped(entry, (tx) =>
      app.query(tx, "SELECT outcome FROM platform.notification_attempts"),
    );
    expect(attempts.rows[0].outcome).toBe("not_configured");
  });
  it("bounded retention respects project holds and never removes active jobs", async () => {
    const j = makeJob();
    await enqueue(j);
    const l = (await claim())[0];
    await q().complete(l);
    await worker.scoped(j, (tx) =>
      worker.query(
        tx,
        "UPDATE platform.jobs SET finished_at=clock_timestamp()-interval '40 days' WHERE job_id=$1",
        [j.jobId],
      ),
    );
    await app.scoped(j, (tx) =>
      app.query(
        tx,
        "UPDATE sentinel.project_bindings SET retention_hold=true WHERE project_id=$1",
        [j.projectId],
      ),
    );
    expect((await retainInfrastructure(worker, j)).deletedJobs).toBe(0);
    await app.scoped(j, (tx) =>
      app.query(
        tx,
        "UPDATE sentinel.project_bindings SET retention_hold=false WHERE project_id=$1",
        [j.projectId],
      ),
    );
    expect((await retainInfrastructure(worker, j)).deletedJobs).toBe(1);
    const active = makeJob();
    await enqueue(active);
    expect((await retainInfrastructure(worker, active)).deletedJobs).toBe(0);
    expect(await row(active)).toBeDefined();
  });
  it("health separates stale workers and queue state from telemetry/provider availability", async () => {
    await heartbeatWorker(worker, prefix, "running");
    expect(await retainWorkerHeartbeats(worker)).toBe(0);
    const health = await platformHealth(worker, prefix);
    expect(health.database).toBe("connected");
    expect(health.telemetry).toBe("not_implemented");
    await heartbeatWorker(worker, prefix, "stopped");
    expect((await platformHealth(worker, prefix)).worker).toBe(
      "stale_or_stopped",
    );
    await worker.transaction((tx) =>
      worker.query(
        tx,
        "UPDATE platform.worker_heartbeats SET last_seen_at=clock_timestamp()-interval '40 days' WHERE module='sentinel' AND worker_id=$1",
        [prefix],
      ),
    );
    expect(await retainWorkerHeartbeats(worker)).toBe(1);
  });
});
