/** NOT in default tests. Requires a fresh exact-target Guard acceptance approval; retains all its fixture rows. */
import { randomUUID } from "node:crypto";
import { guardMigrationPlan } from "../../../src/features/guard/live/migrations";
import { guardDatabaseConfig } from "../../../src/features/guard/live/database-config";
import { parseApproval } from "../../../src/platform/config";
import { ApprovedPool, PlatformDatabase } from "../../../src/platform/database";
import { PostgresGuardStore } from "../../../src/features/guard/live/persistence";
import { GuardPostgresQueue } from "../../../src/features/guard/live/queue";
import { createJob, transition } from "../../../src/features/guard/pipeline";
import { LiveGuardError } from "../../../src/features/guard/live/model";
async function main() {
  if (process.env.GUARD_POSTGRES_ACCEPTANCE !== "1")
    throw new LiveGuardError("approval_required");
  const plan = await guardMigrationPlan(),
    app = await guardDatabaseConfig(process.env, "app", plan.sha256),
    worker = await guardDatabaseConfig(process.env, "worker", plan.sha256);
  for (const config of [app, worker]) {
    if (config.target.database !== "wetscan_s01_test_guardg01")
      throw new LiveGuardError("approval_required");
    parseApproval(
      config.approval,
      config.target,
      "integration_test",
      plan.sha256,
    );
  }
  if (JSON.stringify(app.target) !== JSON.stringify(worker.target))
    throw new LiveGuardError("approval_required");
  const pool = new ApprovedPool(app),
    workerPool = new ApprovedPool(worker),
    db = new PlatformDatabase(pool, false, "guard"),
    workerDb = new PlatformDatabase(workerPool, true, "guard");
  let passed = 0;
  const check = (ok: unknown) => {
    if (!ok) throw new LiveGuardError("revision_conflict", 409);
    passed++;
  };
  const scope = {
      mode: "live" as const,
      workspaceId: `github-user-7:g01-acceptance-${randomUUID()}`,
      projectId: "github-123",
    },
    grant = {
      ...scope,
      actorId: "github-user-7",
      operations: ["read", "scan"] as const,
      expiresAt: Date.now() + 600000,
    };
  const store = new PostgresGuardStore(db),
    writer = new PostgresGuardStore(workerDb);
  try {
    await db.transaction(async (tx) => {
      const rows = await db.query(
        tx,
        "SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
      );
      check(
        rows.rows.length === 1 &&
          !rows.rows[0].rolsuper &&
          !rows.rows[0].rolbypassrls,
      );
      const privilege = await db.query(
        tx,
        "SELECT has_schema_privilege(current_user,'sentinel','USAGE') AS forbidden",
      );
      check(!privilege.rows[0].forbidden);
      const rls = await db.query(
        tx,
        "SELECT relforcerowsecurity FROM pg_class WHERE oid='guard.scans'::regclass",
      );
      check(rls.rows[0].relforcerowsecurity);
    });
    const job = await createJob(grant, {
      ...scope,
      repository: {
        provider: "github",
        repositoryId: "123",
        branch: "fixture-only",
        commit: "a".repeat(40),
      },
      profile: "quick",
      engines: ["sast"],
      idempotencyKey: randomUUID(),
    });
    const receipt = await store.create(grant, job),
      again = await store.create(grant, job);
    check(
      receipt.job.id === again.job.id && receipt.revision === again.revision,
    );
    check(
      (await store.get(
        { ...grant, workspaceId: "other" },
        { ...scope, workspaceId: "other" },
        job.id,
      )) === null,
    );
    const q1 = new GuardPostgresQueue(workerDb, scope),
      q2 = new GuardPostgresQueue(workerDb, scope);
    const claims = await Promise.all([
      q1.claim({
        module: "guard",
        workerId: "g01-fixture-a",
        limit: 1,
        leaseMs: 30000,
      }),
      q2.claim({
        module: "guard",
        workerId: "g01-fixture-b",
        limit: 1,
        leaseMs: 30000,
      }),
    ]);
    const leases = claims.flat();
    check(leases.length === 1 && leases[0].job.module === "guard");
    const lease = leases[0];
    const preparing = await writer.update(
      grant,
      transition(job, "preparing", grant.actorId),
      receipt.revision,
      { workerId: lease.workerId, leaseToken: lease.leaseToken },
    );
    check(preparing.job.status === "preparing");
    let denied = false;
    try {
      await writer.update(grant, preparing.job, preparing.revision, {
        workerId: lease.workerId,
        leaseToken: "not-a-real-lease",
      });
    } catch {
      denied = true;
    }
    check(denied);
    denied = false;
    try {
      await writer.update(grant, preparing.job, receipt.revision, {
        workerId: lease.workerId,
        leaseToken: lease.leaseToken,
      });
    } catch {
      denied = true;
    }
    check(denied);
    await workerDb.scoped(scope, (tx) =>
      workerDb.query(
        tx,
        "UPDATE platform.jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE module='guard' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND job_id=$4",
        [scope.mode, scope.workspaceId, scope.projectId, job.id],
      ),
    );
    const recovered = await q1.claim({
      module: "guard",
      workerId: "g01-fixture-restart",
      limit: 1,
      leaseMs: 30000,
    });
    check(
      recovered.length === 1 &&
        recovered[0].leaseToken !== lease.leaseToken &&
        recovered[0].job.attempts === 2,
    );
    denied = false;
    try {
      await writer.update(grant, preparing.job, preparing.revision, {
        workerId: lease.workerId,
        leaseToken: lease.leaseToken,
      });
    } catch {
      denied = true;
    }
    check(denied);
    try {
      await db.scoped(scope, async (tx) => {
        await db.query(
          tx,
          "UPDATE guard.scans SET revision=revision+1 WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND scan_id=$4",
          [scope.mode, scope.workspaceId, scope.projectId, job.id],
        );
        throw new Error("intentional rollback");
      });
    } catch {
      /* Expected controlled rollback. */
    }
    check(
      (await store.get(grant, scope, job.id))?.revision === preparing.revision,
    );
    const restartPool = new ApprovedPool(app);
    try {
      check(
        (
          await new PostgresGuardStore(
            new PlatformDatabase(restartPool, false, "guard"),
          ).get(grant, scope, job.id)
        )?.job.id === job.id,
      );
    } finally {
      await restartPool.end();
    }
    await store.cancel(grant, scope, job.id);
    check((await store.get(grant, scope, job.id))?.job.status === "cancelled");
    console.log(
      JSON.stringify({
        group: "guard_g01_postgres",
        passed,
        dependency: "real PostgreSQL with synthetic metadata only",
        retainedFixtures: true,
        providerAcceptance: "NOT_RUN",
        sentinelPreservationObserver: "SEPARATE_OPERATOR_GATE",
      }),
    );
  } finally {
    await Promise.all([pool.end(), workerPool.end()]);
  }
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      group: "guard_g01_postgres",
      status: "BLOCKED_OR_FAILED",
      reason:
        error instanceof LiveGuardError
          ? error.code
          : "database_or_assertion_failure",
      historicalSentinelDatabase: "never_reset",
    }),
  );
  process.exitCode = 2;
});
