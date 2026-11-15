import { isAbsolute } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import type { ProjectAuthority, SourceAccess } from "./model";
import { LiveGuardError, repositoryFor } from "./model";
import { GuardSnapshotAdapter, snapshotPolicy } from "./snapshot";
import { fingerprint } from "../../../platform/identity";
export interface SourceAcceptanceApproval {
  schemaVersion: 1;
  module: "guard-source-acceptance";
  status: "APPROVED";
  approvedBy: string;
  approvedAt: string;
  expiresAt: string;
  origin: string;
  workspaceId: string;
  projectId: string;
  actorId: string;
  repositoryId: string;
  commit: string;
  operations: string[];
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}
export function validateSourceAcceptance(
  input: unknown,
  authority: ProjectAuthority,
  commit: string,
  origin: string,
  now = Date.now(),
): SourceAcceptanceApproval {
  const p = input as SourceAcceptanceApproval;
  if (
    !p ||
    p.schemaVersion !== 1 ||
    p.module !== "guard-source-acceptance" ||
    p.status !== "APPROVED" ||
    typeof p.approvedBy !== "string" ||
    !p.approvedBy.trim() ||
    !Number.isFinite(Date.parse(p.approvedAt)) ||
    Date.parse(p.approvedAt) > now + 60000 ||
    !Number.isFinite(Date.parse(p.expiresAt)) ||
    Date.parse(p.expiresAt) <= now ||
    Date.parse(p.expiresAt) > now + 3600000 ||
    p.origin !== origin ||
    p.workspaceId !== authority.grant.workspaceId ||
    p.projectId !== authority.grant.projectId ||
    p.actorId !== authority.grant.actorId ||
    p.repositoryId !== authority.repositoryId ||
    p.commit !== commit ||
    !Array.isArray(p.operations) ||
    ["snapshot_read", "temporary_artifact_write", "cleanup"].some(
      (op) => !p.operations.includes(op),
    ) ||
    p.operations.some(
      (op) =>
        !["snapshot_read", "temporary_artifact_write", "cleanup"].includes(op),
    ) ||
    p.maxFiles !== snapshotPolicy.maxFiles ||
    p.maxFileBytes !== snapshotPolicy.maxFileBytes ||
    p.maxTotalBytes !== snapshotPolicy.maxTotalBytes
  )
    throw new LiveGuardError("approval_required");
  return p;
}
/** Separate, one-attempt read-only GitHub acceptance. No DB, job, engine, script or raw source response. */
export async function sourceAcceptance(
  authority: ProjectAuthority,
  input: unknown,
  origin: string,
  source: SourceAccess,
  approvalPath: string | undefined,
) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => key !== "commit") ||
    !("commit" in input) ||
    typeof input.commit !== "string" ||
    !/^[a-f0-9]{40}$/.test(input.commit)
  )
    throw new LiveGuardError("invalid_input", 400);
  if (!approvalPath || !isAbsolute(approvalPath))
    throw new LiveGuardError("approval_required");
  let permit: SourceAcceptanceApproval;
  try {
    permit = validateSourceAcceptance(
      JSON.parse(await readFile(approvalPath, "utf8")),
      authority,
      input.commit,
      origin,
    );
  } catch {
    throw new LiveGuardError("approval_required");
  }
  // Exclusive filesystem reservation persists across web-process restarts. Failure consumes the attempt too.
  try {
    await writeFile(
      approvalPath + ".used",
      JSON.stringify({
        module: "guard-source-acceptance",
        approvalDigest: fingerprint(permit),
        at: new Date().toISOString(),
      }),
      { flag: "wx", mode: 0o600 },
    );
  } catch {
    throw new LiveGuardError("approval_required");
  }
  const snapshots = new GuardSnapshotAdapter(source),
    snapshot = await snapshots.acquire(authority.grant, {
      mode: "live",
      workspaceId: authority.grant.workspaceId,
      projectId: authority.grant.projectId,
      repository: repositoryFor(authority, input.commit),
      profile: "quick",
      engines: ["sast"],
      idempotencyKey: "source-acceptance-only",
    });
  const result = {
    kind: "github_source_acceptance",
    repositoryId: authority.repositoryId,
    commit: snapshot.repository.commit,
    tree: snapshot.tree,
    snapshotDigest: snapshot.digest,
    coverage: snapshot.coverage,
    sourceFiles: snapshot.files.length,
    sourceBytes: snapshot.coverage.bytes,
    scannerExecution: "NOT_RUN",
    scanAccepted: false,
  };
  await snapshots.dispose(snapshot);
  return { ...result, cleanup: "verified" };
}
