/** Opt-in real PostgreSQL RLS negatives with synthetic metadata only; never a provider/scanner acceptance. */
import { randomBytes, randomUUID } from "node:crypto";
import { guardMigrationPlan } from "../../../src/features/guard/live/migrations";
import { guardDatabaseConfig } from "../../../src/features/guard/live/database-config";
import { parseApproval } from "../../../src/platform/config";
import { ApprovedPool, PlatformDatabase } from "../../../src/platform/database";
import { PostgresGuardStore } from "../../../src/features/guard/live/persistence";
import { createJob } from "../../../src/features/guard/pipeline";
import { LiveGuardError } from "../../../src/features/guard/live/model";
let stage = "approval";
async function main() {
  if (process.env.GUARD_POSTGRES_ACCEPTANCE !== "1")
    throw new LiveGuardError("approval_required");
  const plan = await guardMigrationPlan();
  const app = await guardDatabaseConfig(process.env, "app", plan.sha256),
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
  const scope = {
    mode: "live" as const,
    workspaceId: "github-user-7:g01-context-" + randomUUID(),
    projectId: "github-123",
  };
  const grant = {
    ...scope,
    actorId: "github-user-7",
    operations: ["read", "scan"] as const,
    expiresAt: Date.now() + 600000,
  };
  const store = new PostgresGuardStore(db),
    checks: string[] = [];
  const check = (ok: unknown, name: string) => {
    if (!ok) throw new Error("assertion_failed");
    checks.push(name);
  };
  try {
    stage = "role_identity";
    for (const [database, expectedRole] of [
      [db, "wetscan_guard_app"],
      [workerDb, "wetscan_guard_worker"],
    ] as const) {
      await database.transaction(async (tx) => {
        const row = (
          await database.query(
            tx,
            "SELECT current_user AS username,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user",
          )
        ).rows[0];
        check(
          row?.username === expectedRole &&
            !row.rolsuper &&
            !row.rolbypassrls &&
            !row.rolcreatedb &&
            !row.rolcreaterole,
          expectedRole + "_least_privilege",
        );
      });
    }
    stage = "scoped_create";
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
    await store.create(grant, job);
    check(
      (await store.get(grant, scope, job.id))?.revision === 1,
      "scoped_row_exists",
    );
    stage = "missing_context";
    for (const [database, name] of [
      [db, "app"],
      [workerDb, "worker"],
    ] as const) {
      await database.transaction(async (tx) => {
        check(
          (
            await database.query(
              tx,
              "SELECT scan_id FROM guard.scans WHERE scan_id=$1",
              [job.id],
            )
          ).rows.length === 0,
          name + "_missing_identity_cannot_read_existing_row",
        );
        check(
          (
            await database.query(
              tx,
              "UPDATE guard.scans SET revision=revision+1 WHERE scan_id=$1",
              [job.id],
            )
          ).rowCount === 0,
          name + "_missing_identity_cannot_update_existing_row",
        );
      });
    }
    stage = "missing_context_insert";
    const id = randomBytes(32).toString("hex"),
      attempt = {
        ...job,
        id,
        idempotencyKey: randomUUID(),
        audit: job.audit.map((a) => ({ ...a, subjectId: id })),
      };
    let denied = false;
    try {
      await db.transaction((tx) =>
        db.query(
          tx,
          "INSERT INTO guard.scans(mode,workspace_id,project_id,scan_id,idempotency_key,fingerprint,repository_id,commit_sha,status,job,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)",
          [
            scope.mode,
            scope.workspaceId,
            scope.projectId,
            id,
            attempt.idempotencyKey,
            id,
            "123",
            job.repository.commit,
            "queued",
            JSON.stringify(attempt),
            job.createdAt,
          ],
        ),
      );
    } catch (e) {
      denied = (e as { code?: string }).code === "42501";
    }
    check(denied, "app_insert_without_identity_rejected_42501");
    check(
      (await store.get(grant, scope, id)) === null,
      "denied_insert_not_persisted",
    );
    check(
      (await store.get(grant, scope, job.id))?.revision === 1,
      "existing_scoped_row_intact",
    );
    stage = "cancellation";
    await store.cancel(grant, scope, job.id);
    check(
      (await store.get(grant, scope, job.id))?.job.status === "cancelled",
      "owned_fixture_cancelled_retained",
    );
    console.log(
      JSON.stringify({
        group: "guard_g01_postgres_context",
        classification: "LIVE_VERIFIED_DATABASE_SYNTHETIC_METADATA",
        passed: checks.length,
        checks,
        retainedFixtures: true,
        workspaceId: scope.workspaceId,
        jobId: job.id,
        providerAcceptance: "NOT_RUN",
        workerProcess: "NOT_RUN",
      }),
    );
  } finally {
    await Promise.all([pool.end(), workerPool.end()]);
  }
}
main().catch((error) => {
  const state = (error as { code?: unknown })?.code;
  console.error(
    JSON.stringify({
      group: "guard_g01_postgres_context",
      status: "BLOCKED_OR_FAILED",
      stage,
      reason:
        error instanceof LiveGuardError
          ? error.code
          : "database_or_assertion_failure",
      sqlState:
        typeof state === "string" && /^[0-9A-Z]{5}$/.test(state)
          ? state
          : undefined,
      secretsLogged: false,
    }),
  );
  process.exitCode = 2;
});
