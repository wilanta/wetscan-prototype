import { LiveGuardError } from "../../src/features/guard/live/model";
import { safeGithubDiagnostic } from "../../src/lib/auth/provider-diagnostics";
export type SourcePhase =
  | "authorize"
  | "open"
  | "head"
  | "tree"
  | "blob"
  | "final_authorize"
  | "write"
  | "lease_close";
export type PipelinePhase =
  | "broker"
  | "preparing"
  | "sandbox"
  | "snapshot_acquire"
  | "snapshot_validate"
  | "scanner"
  | "normalize"
  | "source_dispose"
  | "final_save";
export interface SourceFailureDiagnostic {
  version: 1;
  phase: SourcePhase;
  elapsedMs: number;
  retrievedFiles: number;
  eligibleFiles: number;
  timedOut: boolean;
  parentCancelled: boolean;
  cleanup: "NOT_CREATED" | "VERIFIED" | "UNKNOWN";
  concurrency: number;
}
const codes = new Set([
  "forbidden",
  "invalid_input",
  "not_configured",
  "invalid_transition",
  "evidence_required",
  "not_found",
  "source_integrity",
  "source_limit",
  "source_unavailable",
  "cleanup_failed",
  "revision_conflict",
  "lease_lost",
  "approval_required",
  "execution_not_ready",
  "source_timeout",
  "github_unavailable",
  "github_response",
  "github_rate_limited",
  "github_expired",
  "repository_denied",
  "installation_denied",
  "unauthenticated",
  "configuration",
  "revision_unavailable",
  "source_response_limit",
  "EACCES",
  "EPERM",
  "ENOENT",
  "EIO",
  "ENOSPC",
]);
export function sourceFailureMetadata(
  error: unknown,
): SourceFailureDiagnostic | undefined {
  const d = (error as { guardSourceDiagnostic?: SourceFailureDiagnostic })
    ?.guardSourceDiagnostic;
  if (
    !d ||
    d.version !== 1 ||
    ![
      "authorize",
      "open",
      "head",
      "tree",
      "blob",
      "final_authorize",
      "write",
      "lease_close",
    ].includes(d.phase) ||
    !["NOT_CREATED", "VERIFIED", "UNKNOWN"].includes(d.cleanup) ||
    typeof d.timedOut !== "boolean" ||
    typeof d.parentCancelled !== "boolean" ||
    !Number.isFinite(d.elapsedMs) ||
    d.elapsedMs < 0 ||
    d.elapsedMs > 600000 ||
    !Number.isInteger(d.retrievedFiles) ||
    d.retrievedFiles < 0 ||
    d.retrievedFiles > 1000 ||
    !Number.isInteger(d.eligibleFiles) ||
    d.eligibleFiles < 0 ||
    d.eligibleFiles > 10000 ||
    !Number.isInteger(d.concurrency) ||
    d.concurrency < 1 ||
    d.concurrency > 3
  )
    return;
  return {
    version: 1,
    phase: d.phase,
    elapsedMs: d.elapsedMs,
    retrievedFiles: d.retrievedFiles,
    eligibleFiles: d.eligibleFiles,
    timedOut: d.timedOut,
    parentCancelled: d.parentCancelled,
    cleanup: d.cleanup,
    concurrency: d.concurrency,
  };
}
export function pipelineFailureReason(error: unknown, stage: PipelinePhase) {
  const raw = (error as { code?: unknown })?.code;
  const code = typeof raw === "string" && codes.has(raw) ? raw : "unknown";
  const provider = safeGithubDiagnostic(error),
    source = sourceFailureMetadata(error);
  const marked = (error as { guardFailureComponent?: string })
    ?.guardFailureComponent;
  const component = source
    ? "source"
    : marked && components.has(marked)
      ? marked
      : stage === "broker"
        ? "broker"
        : stage === "sandbox"
          ? "sandbox"
          : stage === "scanner"
            ? "scanner"
            : "pipeline";
  return JSON.stringify({
    version: 1,
    stage,
    component,
    code,
    ...(provider ? { provider } : {}),
    ...(source ? { source } : {}),
  });
}

export type FailureComponent =
  "source" | "broker" | "sandbox" | "scanner" | "pipeline";
const components = new Set([
  "source",
  "broker",
  "sandbox",
  "scanner",
  "pipeline",
]);
export function tagFailure(error: unknown, component: FailureComponent): Error {
  const raw = (error as { code?: unknown })?.code;
  const e =
    error instanceof Error && Object.isExtensible(error)
      ? error
      : raw === "cleanup_failed"
        ? new LiveGuardError("cleanup_failed")
        : new Error("operation_failed");
  if (
    typeof raw === "string" &&
    codes.has(raw) &&
    !(error instanceof Error && Object.isExtensible(error))
  )
    Object.assign(e, { code: raw });
  const current = (e as Error & { guardFailureComponent?: string })
    .guardFailureComponent;
  if (!current || !components.has(current))
    Object.assign(e, { guardFailureComponent: component });
  return e;
}
