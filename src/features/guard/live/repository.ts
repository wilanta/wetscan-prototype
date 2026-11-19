import "server-only";
import { randomUUID } from "node:crypto";
import { prepareAuthorizedScan } from "./service";
import { guardMigrationPlan } from "./migrations";
import { bindGuardJob } from "../../../../worker/guard/approval";
import { guardRevision } from "./revision";
import { githubSourceAccess } from "./github-source";
import { authorize } from "../security";
import { LiveGuardError } from "./model";
/** Metadata only; uses exactly the existing Auth/Canvas repository selection, never client owner/installation IDs. */
export async function verifyGuardRevision(
  token: string | undefined,
  projectId: string,
  input: unknown,
  signal: AbortSignal,
) {
  const { authority, head, current } = await authorizedRevision(
    token,
    projectId,
    input,
    signal,
  );
  const request = {
    branch: authority.branch,
    commit: head.commit,
    profile: "quick" as const,
    engines: ["sast" as const],
    idempotencyKey: randomUUID(),
  };
  const job = await prepareAuthorizedScan(current, request, head.commit);
  const plan = await guardMigrationPlan();
  return {
    preparation: {
      status: "REVIEW_REQUIRED",
      execution: "prepare_only",
      request,
      binding: bindGuardJob(job),
      repositoryName: authority.repositoryName,
      migrationPlanSha256: plan.sha256,
    },
    repository: {
      id: authority.repositoryId,
      name: authority.repositoryName,
      branch: authority.branch,
    },
    commit: head.commit,
    tree: head.tree,
    verifiedAt: new Date().toISOString(),
    sourceRead: false,
    scanAccepted: false,
  };
}

async function authorizedRevision(
  token: string | undefined,
  projectId: string,
  input: unknown,
  signal: AbortSignal,
) {
  const revision = guardRevision(input),
    source = githubSourceAccess(token, projectId, revision);
  const authority = await source.authorize();
  authorize(authority.grant, authority.grant, "scan");
  const lease = await source.open(authority, signal);
  try {
    const head = await lease.head(signal);
    const current = await source.authorize();
    authorize(current.grant, authority.grant, "scan");
    if (
      current.grant.actorId !== authority.grant.actorId ||
      current.repositoryId !== authority.repositoryId ||
      current.repositoryName !== authority.repositoryName ||
      current.installationId !== authority.installationId
    )
      throw new LiveGuardError("not_found", 404);
    return { authority, head, current };
  } finally {
    await lease.close();
  }
}
export async function resolveRepositoryRevision(
  token: string | undefined,
  projectId: string,
  input: unknown,
  signal: AbortSignal,
) {
  const { authority, head } = await authorizedRevision(
    token,
    projectId,
    input,
    signal,
  );
  return {
    repository: {
      id: authority.repositoryId,
      name: authority.repositoryName,
      branch: authority.branch,
    },
    commit: head.commit,
    tree: head.tree,
    verifiedAt: new Date().toISOString(),
    sourceRead: false,
    scanAccepted: false,
  };
}
