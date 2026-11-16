import type { Grant, Scope } from "../../../src/features/guard/contracts";
import { authorize, GuardError } from "../../../src/features/guard/security";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import type { DurableJobPort } from "../../../src/features/sentinel/platform-contracts";
import type { CaseId } from "./catalog";
export const n04HoldMs = 61000;
export interface N04Denial {
  boundary: "grant_expired";
  issuedAt: number;
  expiresAt: number;
  authorizationCheckedAt: number;
  observedAt: number;
  authorization: {
    operation: "scan";
    outcome: "denied";
    errorCode: "forbidden";
  };
}
/** Only N04 holds a real, initially valid grant. No TTL mutation or caller-supplied delay/clock. */
export async function proveN04Denial(
  grant: Grant,
  scope: Scope,
  signal: AbortSignal,
): Promise<N04Denial> {
  const issuedAt = grant.issuedAt,
    expiresAt = grant.expiresAt;
  if (
    typeof issuedAt !== "number" ||
    !Number.isFinite(issuedAt) ||
    expiresAt - issuedAt !== 60000 ||
    issuedAt > Date.now() ||
    expiresAt <= Date.now()
  )
    throw new LiveGuardError("execution_not_ready");
  authorize(grant, scope, "scan");
  const target = issuedAt + n04HoldMs;
  while (Date.now() < target) {
    await new Promise<void>((done, fail) => {
      const abort = () => {
        clearTimeout(timer);
        fail(new LiveGuardError("source_unavailable"));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        done();
      }, target - Date.now());
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    });
  }
  if (signal.aborted) throw new LiveGuardError("source_unavailable");
  if (grant.issuedAt !== issuedAt || grant.expiresAt !== expiresAt)
    throw new LiveGuardError("execution_not_ready");
  const authorizationCheckedAt = Date.now();
  try {
    authorize(grant, scope, "scan");
  } catch (error) {
    // An unknown exception or code-shaped object is not evidence from the actual authorization function.
    if (!(error instanceof GuardError) || error.code !== "forbidden")
      throw error;
    return {
      boundary: "grant_expired",
      issuedAt,
      expiresAt,
      authorizationCheckedAt,
      observedAt: Date.now(),
      authorization: {
        operation: "scan",
        outcome: "denied",
        errorCode: "forbidden",
      },
    };
  }
  // Unexpected authorization success must never reach snapshot/probe/preparation work.
  throw new LiveGuardError("execution_not_ready");
}
/** Private acceptance wrapper only. Production and all other cases keep their existing retry function. */
export function acceptanceRetry(
  caseId: CaseId,
  retry: DurableJobPort["retry"],
  report: (proof: {
    jobId: string;
    workerId: string;
    attempt: number;
    retryScheduled: false;
    failureCode: string;
    observedAt: number;
  }) => Promise<void>,
): DurableJobPort["retry"] {
  if (caseId !== "N04") return retry;
  return async (lease, failure) => {
    await report({
      jobId: lease.job.jobId,
      workerId: lease.workerId,
      attempt: lease.job.attempts,
      retryScheduled: false,
      failureCode: failure.redactedError,
      observedAt: Date.now(),
    });
    // Do not call the DB retry callback, clear the lease, enqueue, or acknowledge retry_scheduled.
    // The sole worker stops; the exact job remains for explicit approved cancellation/readonly observation.
    throw new LiveGuardError("execution_not_ready");
  };
}
