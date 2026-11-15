/** Exact-job READ ONLY operator observer. It does not create an Auth session/grant or start work. */
import { createHash } from "node:crypto";
import { readFile, writeFile, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ApprovedPool, type SqlClient } from "../../../src/platform/database";
import { guardDatabaseConfig } from "../../../src/features/guard/live/database-config";
import { guardMigrationPlan } from "../../../src/features/guard/live/migrations";
import { validateWorkerApproval } from "../../../worker/guard/approval";
import { fingerprint } from "../../../src/platform/identity";
import { LiveGuardError } from "../../../src/features/guard/live/model";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
async function main() {
  const document = JSON.parse(
      await readFile(
        resolve("docs/acceptance/guard-g01/worker-auth-request.json"),
        "utf8",
      ),
    ),
    packet = document.packet;
  if (sha(JSON.stringify(packet)) !== document.requestSha256)
    throw new LiveGuardError("approval_required");
  if (!process.argv.includes("--observe")) {
    console.log(
      JSON.stringify({
        status: "READY_PENDING_EXECUTION_APPROVAL",
        requestSha256: document.requestSha256,
        readOnly: true,
        databaseConnections: 0,
        authSessionCreated: false,
        workerStarted: false,
      }),
    );
    return;
  }
  if (!process.argv.includes("--request-sha=" + document.requestSha256))
    throw new LiveGuardError("approval_required");
  for (const artifact of packet.implementationFiles) {
    if (
      !/^(?:src\/features\/guard\/live|worker\/guard|tests\/guard\/g01)\/[a-z0-9.-]+\.ts$/.test(
        artifact.file,
      ) ||
      sha(
        (await readFile(resolve(artifact.file), "utf8")).replace(/\r\n/g, "\n"),
      ) !== artifact.sha256
    )
      throw new LiveGuardError("approval_required");
  }
  const folder = resolve(packet.operatorFolder),
    privateRoot = resolve(".local/sentinel/guard-g01-unblock");
  if (
    !folder.startsWith(privateRoot + "\\") &&
    !folder.startsWith(privateRoot + "/")
  )
    throw new LiveGuardError("approval_required");
  const info = await lstat(folder);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new LiveGuardError("approval_required");
  const plan = await guardMigrationPlan();
  if (plan.sha256 !== packet.migrationPlanSha256)
    throw new LiveGuardError("approval_required");
  const permit = validateWorkerApproval(
    JSON.parse(await readFile(join(folder, "worker-approval.json"), "utf8")),
    packet.binding,
    plan.sha256,
  );
  if (
    fingerprint(permit.target) !== fingerprint(packet.target) ||
    permit.workerId !== packet.workerId
  )
    throw new LiveGuardError("approval_required");
  const environment = {
    GUARD_DB_APP_APPROVAL_FILE: join(folder, "db-app-approval.json"),
    GUARD_DB_APP_PASSWORD_FILE: join(privateRoot, "app.password"),
    GUARD_DB_WORKER_APPROVAL_FILE: join(folder, "db-worker-approval.json"),
    GUARD_DB_WORKER_PASSWORD_FILE: join(privateRoot, "worker.password"),
  };
  const app = await guardDatabaseConfig(
      environment,
      "app",
      plan.sha256,
      permit.target,
    ),
    worker = await guardDatabaseConfig(
      environment,
      "worker",
      plan.sha256,
      permit.target,
    );
  const appPool = new ApprovedPool(app),
    workerPool = new ApprovedPool(worker),
    b = permit.binding;
  async function scoped<T>(
    pool: ApprovedPool,
    work: (client: SqlClient) => Promise<T>,
  ) {
    const client = await pool.connect();
    let destroy = false;
    try {
      await client.query("BEGIN READ ONLY");
      await client.query(
        "SELECT set_config('wetscan.module','guard',true),set_config('wetscan.mode',$1,true),set_config('wetscan.workspace',$2,true),set_config('wetscan.project',$3,true)",
        [b.mode, b.workspaceId, b.projectId],
      );
      return await work(client);
    } finally {
      try {
        await client.query("ROLLBACK");
      } catch {
        destroy = true;
      }
      client.release(destroy);
    }
  }
  try {
    const data = await scoped(appPool, async (client) => ({
      scan: (
        await client.query(
          "SELECT scan_id,status,revision,repository_id,commit_sha,coverage,job->'repository' AS repository,job->'requestedEngines' AS engines,job->>'profile' AS profile,job->>'idempotencyKey' AS idempotency_key,(SELECT jsonb_agg(jsonb_build_object('action',e->>'action','actorId',e->>'actorId','subjectId',e->>'subjectId','at',e->>'at')) FROM jsonb_array_elements(job->'audit') e) AS audit FROM guard.scans WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND scan_id=$4",
          [b.mode, b.workspaceId, b.projectId, b.jobId],
        )
      ).rows[0],
      queue: (
        await client.query(
          "SELECT job_id,state,attempts,fence,lease_owner,lease_until,cancel_requested FROM platform.jobs WHERE module='guard' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND job_id=$4",
          [b.mode, b.workspaceId, b.projectId, b.jobId],
        )
      ).rows,
      attempts: (
        await client.query(
          "SELECT attempt,worker_id,outcome,started_at,finished_at FROM platform.job_attempts WHERE module='guard' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND job_id=$4 ORDER BY attempt",
          [b.mode, b.workspaceId, b.projectId, b.jobId],
        )
      ).rows,
    }));
    const heartbeats = await scoped(
      workerPool,
      async (client) =>
        (
          await client.query(
            "SELECT worker_id,status,last_seen_at FROM platform.worker_heartbeats WHERE module='guard' AND worker_id=$1",
            [permit.workerId],
          )
        ).rows,
    );
    const scan = data.scan,
      first = scan?.audit?.[0];
    const matches =
      !scan ||
      (scan.scan_id === b.jobId &&
        scan.repository_id === b.repository.repositoryId &&
        scan.commit_sha === b.repository.commit &&
        fingerprint(scan.repository) === fingerprint(b.repository) &&
        fingerprint(scan.engines) === fingerprint(b.engines) &&
        scan.profile === b.profile &&
        scan.idempotency_key === b.idempotencyKey &&
        first?.actorId === b.actorId &&
        first?.subjectId === b.jobId &&
        first?.action === "queued");
    if (!matches) throw new LiveGuardError("revision_conflict", 409);
    const prepared = !!scan?.audit?.some(
      (a: { action: string; actorId: string; subjectId: string }) =>
        a.action === "foundation_prepared" &&
        a.actorId === b.actorId &&
        a.subjectId === b.jobId,
    );
    const coverage = scan?.coverage;
    const reasonCounts: Record<string, number> = {};
    for (const item of coverage?.exclusions ?? []) {
      if (typeof item.reason === "string" && /^[a-z_]{1,64}$/.test(item.reason))
        reasonCounts[item.reason] = (reasonCounts[item.reason] ?? 0) + 1;
    }
    const result = {
      kind: "guard_exact_job_operator_observer",
      requestSha256: document.requestSha256,
      observedAt: new Date().toISOString(),
      readOnly: true,
      currentAuthProof: "SEPARATE_EXISTING_BACKEND_RESPONSE_REQUIRED",
      jobId: b.jobId,
      scope: {
        mode: b.mode,
        workspaceId: b.workspaceId,
        projectId: b.projectId,
        actorId: b.actorId,
      },
      bindingMatches: scan ? matches : null,
      scan: scan
        ? {
            status: scan.status,
            revision: scan.revision,
            repositoryId: scan.repository_id,
            commit: scan.commit_sha,
            audit: scan.audit,
          }
        : null,
      queue: data.queue,
      attempts: data.attempts,
      heartbeats,
      foundationPrepared: prepared,
      coverage: coverage
        ? {
            status: coverage.status,
            retrievedFiles: coverage.retrievedFiles,
            eligibleFiles: coverage.eligibleFiles,
            bytes: coverage.bytes,
            treeTruncated: coverage.treeTruncated,
            exclusionCounts: reasonCounts,
          }
        : null,
      storedPreparationVerified:
        prepared &&
        !!coverage &&
        data.queue.length === 1 &&
        data.queue[0].state === "completed" &&
        heartbeats.some((h) => h.status === "stopped"),
      scannerExecution: "NOT_RUN",
      sandboxExecution: "NOT_RUN",
      authSessionCreated: false,
      leaseTokensSelected: false,
    };
    const file = join(folder, "observer-" + Date.now() + ".json");
    await writeFile(file, JSON.stringify(result, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    console.log(JSON.stringify({ ...result, artifact: file }));
  } finally {
    await Promise.all([appPool.end(), workerPool.end()]);
  }
}
main().catch((error) => {
  const code = (error as { code?: unknown })?.code;
  console.error(
    JSON.stringify({
      status: "BLOCKED_OR_FAILED",
      reason:
        error instanceof LiveGuardError ? error.code : "observer_unavailable",
      sqlState:
        typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)
          ? code
          : undefined,
      readOnly: true,
      secretsLogged: false,
    }),
  );
  process.exitCode = 2;
});
