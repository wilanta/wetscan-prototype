import "server-only";
import { ApprovedPool, PlatformDatabase } from "../../../platform/database";
import { fingerprint } from "../../../platform/identity";
import { authorize } from "../security";
import { authorizeGuardProject } from "./project";
import { githubSourceAccess } from "./github-source";
import { prepareAuthorizedScan } from "./service";
import { guardDatabaseConfig } from "./database-config";
import { guardMigrationPlan } from "./migrations";
import { verifyGuardSchema } from "./schema-readiness";
import { PostgresGuardStore } from "./persistence";
import { LiveGuardError } from "./model";
import {
  bindGuardJob,
  validatePreparationApproval,
  type GuardPreparationApproval,
} from "../../../../worker/guard/approval";
/** Explicit Auth-process producer for G01 preparation only. No public route, scanner or auto-launch.
 * Requires a separate exact-job enqueue approval; a worker launch permit cannot enqueue.
 */
export async function enqueueApprovedGuardPreparation(input: {
  approval: unknown;
  sessionToken: string | undefined;
  request: unknown;
  environment: Readonly<Record<string, string | undefined>>;
  signal?: AbortSignal;
}) {
  const plan = await guardMigrationPlan(),
    candidate = input.approval as GuardPreparationApproval;
  const permit = validatePreparationApproval(
    candidate,
    candidate?.binding,
    plan.sha256,
  );
  if (input.signal?.aborted) throw new LiveGuardError("source_unavailable");
  const binding = permit.binding;
  const authority = await authorizeGuardProject(
    input.sessionToken,
    binding.projectId,
  );
  authorize(authority.grant, binding, "scan");
  const job = await prepareAuthorizedScan(
    authority,
    input.request,
    binding.repository.commit,
  );
  if (
    fingerprint(bindGuardJob(job)) !== fingerprint(binding) ||
    authority.repositoryName !== permit.repositoryName
  )
    throw new LiveGuardError("not_found", 404);
  // Validate the independent target/role approval before opening a pool or reading source.
  const config = await guardDatabaseConfig(
    input.environment,
    "app",
    plan.sha256,
    permit.target,
  );
  const check = () => {
    validatePreparationApproval(permit, binding, plan.sha256);
    if (
      input.signal?.aborted ||
      Date.parse(config.approval.expiresAt) <= Date.now()
    )
      throw new LiveGuardError("approval_required");
  };
  check();
  const signal = AbortSignal.any([
    ...(input.signal ? [input.signal] : []),
    AbortSignal.timeout(30000),
  ]);
  const source = await githubSourceAccess(
    input.sessionToken,
    binding.projectId,
  ).open(authority, signal);
  try {
    const head = await source.head(signal);
    if (
      head.commit !== binding.repository.commit ||
      !/^[a-f0-9]{40}$/.test(head.tree)
    )
      throw new LiveGuardError("revision_conflict", 409);
  } finally {
    await source.close();
  }
  check();
  const current = await authorizeGuardProject(
    input.sessionToken,
    binding.projectId,
  );
  authorize(current.grant, binding, "scan");
  if (
    current.grant.actorId !== binding.actorId ||
    current.repositoryId !== binding.repository.repositoryId ||
    current.repositoryName !== permit.repositoryName ||
    current.branch !== binding.repository.branch
  )
    throw new LiveGuardError("not_found", 404);
  const pool = new ApprovedPool(config);
  try {
    const db = new PlatformDatabase(pool, false, "guard");
    await verifyGuardSchema(db, plan);
    check();
    const stored = await new PostgresGuardStore(db).create(current.grant, job);
    return {
      scanId: stored.job.id,
      status: stored.job.status,
      execution: "prepare_only" as const,
      scannerExecution: "NOT_RUN" as const,
    };
  } finally {
    await pool.end();
  }
}
