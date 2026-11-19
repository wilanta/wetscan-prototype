import type { ScanJob } from "../contracts";
import { backoffMs } from "../../../platform/identity";

/**
 * Retry is a NEW linked scan (new job, new lease, fresh authorization and pin check), never a re-run of a used attempt.
 * The failed job and its audit/attempt history stay untouched; the queue keeps maxAttempts=1 because the owner session
 * that authorizes source access lives only in process memory.
 */
export const MAX_RETRY_DEPTH = 3;
/** Provider/infrastructure conditions that can disappear on their own. Everything else (authz, integrity, cleanup, config) is terminal. */
const transientCodes = new Set([
  "source_timeout",
  "source_unavailable",
  "github_unavailable",
  "github_rate_limited",
  "execution_not_ready",
]);
const linkPattern = /\bretry_of:([a-f0-9]{64});depth:([1-9])\b/;

export interface FailureView {
  stage: string;
  component: string;
  code: string;
  cleanup?: string;
}
/** Reads the last recorded worker diagnostic; unparsable or absent means "unknown", which is never retryable. */
export function failureDiagnostic(job: ScanJob): FailureView | undefined {
  const last = [...job.audit].reverse().find((a) => a.action === "worker_stopped");
  if (!last?.reason) return;
  try {
    const v = JSON.parse(last.reason) as {
      stage?: unknown;
      component?: unknown;
      code?: unknown;
      source?: { cleanup?: unknown };
    };
    if (v.stage === undefined || typeof v.code !== "string") return;
    return {
      stage: String(v.stage),
      component: String(v.component),
      code: v.code,
      cleanup:
        typeof v.source?.cleanup === "string" ? v.source.cleanup : undefined,
    };
  } catch {
    return;
  }
}
export function retryLink(job: Pick<ScanJob, "audit">) {
  const m = job.audit
    .find((a) => a.action === "repository_scan_requested")
    ?.reason?.match(linkPattern);
  return m ? { of: m[1], depth: Number(m[2]) } : undefined;
}
export const retryIdempotencyKey = (job: Pick<ScanJob, "id">) =>
  "g02-live-retry-" + job.id.slice(0, 32);
/** Deterministic per-job jitter so every viewer and the server agree on the same instant. */
export function retryNotBefore(job: ScanJob) {
  const depth = (retryLink(job)?.depth ?? 0) + 1,
    jitter = parseInt(job.id.slice(0, 2), 16) / 255;
  return (
    Date.parse(job.finishedAt ?? job.createdAt) +
    backoffMs(depth, () => jitter)
  );
}
export type RetryDecision =
  | { eligible: true; depth: number; notBefore: number }
  | { eligible: false; reason: string; notBefore?: number };
export function retryDecision(job: ScanJob, now = Date.now()): RetryDecision {
  if (job.status !== "failed")
    return { eligible: false, reason: "only_failed_scans_can_be_retried" };
  if (job.findings.length || job.runs.some((r) => r.status === "completed"))
    return { eligible: false, reason: "scan_has_recorded_results" };
  const depth = (retryLink(job)?.depth ?? 0) + 1;
  if (depth > MAX_RETRY_DEPTH)
    return { eligible: false, reason: "retry_limit_reached" };
  const d = failureDiagnostic(job);
  if (!d) return { eligible: false, reason: "failure_cause_unknown" };
  if (d.cleanup === "UNKNOWN" || d.code === "cleanup_failed")
    return { eligible: false, reason: "cleanup_not_verified" };
  if (!transientCodes.has(d.code))
    return { eligible: false, reason: "failure_not_transient" };
  const notBefore = retryNotBefore(job);
  if (now < notBefore)
    return { eligible: false, reason: "retry_backoff_active", notBefore };
  return { eligible: true, depth, notBefore };
}
