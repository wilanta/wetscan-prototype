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
  branch?: string;
  /** Operator-issued attempt identity. Absent retains the original single-use marker. */
  attemptId?: string;
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
    Date.parse(p.expiresAt) - Date.parse(p.approvedAt) > 3600000 ||
    Date.parse(p.expiresAt) <= Date.parse(p.approvedAt) ||
    p.origin !== origin ||
    p.workspaceId !== authority.grant.workspaceId ||
    p.projectId !== authority.grant.projectId ||
    p.actorId !== authority.grant.actorId ||
    p.repositoryId !== authority.repositoryId ||
    p.commit !== commit ||
    (p.branch !== undefined && p.branch !== authority.branch) ||
    (p.attemptId !== undefined &&
      (typeof p.attemptId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          p.attemptId,
        ))) ||
    !Array.isArray(p.operations) ||
    p.operations.length !== 3 ||
    new Set(p.operations).size !== 3 ||
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
  signal?: AbortSignal,
) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !["commit", "branch"].includes(key)) ||
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
    if ("branch" in input && input.branch !== permit.branch)
      throw new LiveGuardError("approval_required");
  } catch {
    throw new LiveGuardError("approval_required");
  }
  // A fresh attempt requires a fresh operator-issued approval, never a client field or marker reset.
  const markerPath =
      approvalPath + ".used" + (permit.attemptId ? "." + permit.attemptId : ""),
    approvalDigest = fingerprint(permit),
    startedAt = new Date().toISOString();
  // Exclusive filesystem reservation persists across web-process restarts. Failure consumes the attempt too.
  try {
    await writeFile(
      markerPath,
      JSON.stringify({
        module: "guard-source-acceptance",
        approvalDigest,
        at: startedAt,
      }),
      { flag: "wx", mode: 0o600 },
    );
  } catch (error) {
    // Fixed diagnostics only: never paths, messages, credentials, provider data or request headers.
    console.warn(
      "[WetScan Guard source acceptance]",
      JSON.stringify({
        reason:
          (error as { code?: unknown })?.code === "EEXIST"
            ? "source_attempt_already_reserved"
            : "source_attempt_reservation_failed",
      }),
    );
    throw new LiveGuardError("approval_required");
  }
  const journal = (value: Record<string, unknown>) =>
    writeFile(
      markerPath + ".result.json",
      JSON.stringify({
        module: permit.module,
        approvalDigest,
        attemptId: permit.attemptId ?? null,
        startedAt,
        finishedAt: new Date().toISOString(),
        scannerExecution: "NOT_RUN",
        ...value,
      }),
      { flag: "wx", mode: 0o600 },
    );
  const snapshots = new GuardSnapshotAdapter(source);
  let phase = "acquiring";
  try {
    const snapshot = await snapshots.acquire(
      authority.grant,
      {
        mode: "live",
        workspaceId: authority.grant.workspaceId,
        projectId: authority.grant.projectId,
        repository: repositoryFor(authority, input.commit),
        profile: "quick",
        engines: ["sast"],
        idempotencyKey: "source-acceptance-only",
      },
      signal,
    );
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
    phase = "cleanup";
    await snapshots.dispose(snapshot);
    phase = "recording";
    const exclusionCounts: Record<string, number> = {};
    for (const item of snapshot.coverage.exclusions)
      exclusionCounts[item.reason] = (exclusionCounts[item.reason] ?? 0) + 1;
    try {
      await journal({
        status: "completed",
        cleanup: "verified",
        repositoryId: result.repositoryId,
        commit: result.commit,
        tree: result.tree,
        snapshotDigest: result.snapshotDigest,
        sourceFiles: result.sourceFiles,
        sourceBytes: result.sourceBytes,
        coverage: {
          status: snapshot.coverage.status,
          eligibleFiles: snapshot.coverage.eligibleFiles,
          retrievedFiles: snapshot.coverage.retrievedFiles,
          treeTruncated: snapshot.coverage.treeTruncated,
          exclusionCounts,
        },
      });
    } catch {
      throw new LiveGuardError("source_unavailable");
    }
    return { ...result, cleanup: "verified" };
  } catch (error) {
    const allowed = [
      "source_unavailable",
      "cleanup_failed",
      "not_found",
      "source_integrity",
      "source_limit",
      "revision_conflict",
      "repository_denied",
      "installation_denied",
      "unauthenticated",
      "github_rate_limited",
      "github_unavailable",
      "source_timeout",
      "github_response",
      "revision_unavailable",
    ];
    const code = (error as { code?: unknown })?.code;
    await journal({
      status: "failed",
      phase,
      cleanup: phase === "recording" ? "verified" : "NOT_VERIFIED",
      error:
        typeof code === "string" && allowed.includes(code)
          ? code
          : "source_unavailable",
    }).catch(() => {
      console.warn(
        "[WetScan Guard source acceptance]",
        JSON.stringify({ reason: "source_attempt_evidence_unavailable" }),
      );
    });
    throw error;
  }
}
