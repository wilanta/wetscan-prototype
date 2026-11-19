import type { PlatformDatabase } from "../../src/platform/database";
import type { Scope } from "../../src/features/guard/contracts";
import { GuardPostgresQueue } from "../../src/features/guard/live/queue";
import { repositoryScanKind } from "../../src/features/guard/live/product-policy";
import { LiveGuardError } from "../../src/features/guard/live/model";
import { executeLease, type LeaseAwareJobHandler } from "../sentinel/executor";
import { within } from "../sentinel/lifecycle";
/** Server scheduler composition only. No HTTP launch, acceptance permit or global historical-job sweep. */
export async function runRepositoryWorkerOnce(input: {
  db: PlatformDatabase;
  scope: Scope;
  jobId: string;
  workerId: string;
  handler: LeaseAwareJobHandler;
  verifyReady(): Promise<void>;
  signal: AbortSignal;
  timeoutMs: number;
}) {
  if (
    input.db.module !== "guard" ||
    !input.db.worker ||
    input.scope.mode !== "live" ||
    !/^[a-f0-9]{64}$/.test(input.jobId) ||
    !Number.isInteger(input.timeoutMs) ||
    input.timeoutMs < 60000 ||
    input.timeoutMs > 600000
  )
    throw new LiveGuardError("execution_not_ready");
  await input.verifyReady();
  if (input.signal.aborted) throw new LiveGuardError("source_unavailable");
  const queue = new GuardPostgresQueue(input.db, input.scope, input.jobId, {
    kind: repositoryScanKind,
  });
  const leases = await queue.claim({
    module: "guard",
    workerId: input.workerId,
    limit: 1,
    leaseMs: 30000,
  });
  if (!leases.length) return { status: "no_claim" as const };
  if (
    leases.length !== 1 ||
    leases[0].job.jobId !== input.jobId ||
    leases[0].job.kind !== repositoryScanKind ||
    leases[0].job.maxAttempts !== 1
  )
    throw new LiveGuardError("lease_lost", 409);
  let task: Promise<void> | undefined;
  const outcome = await executeLease(
    queue,
    leases[0],
    (job, signal, current) => {
      task = Promise.resolve().then(() => input.handler(job, signal, current));
      return task;
    },
    { signal: input.signal, heartbeatMs: 5000, timeoutMs: input.timeoutMs },
  );
  const settled = await within(
    Promise.allSettled(task ? [task] : []),
    12000,
  ).catch(() => {
    throw new LiveGuardError("cleanup_failed");
  });
  if (
    settled.some(
      (s) =>
        s.status === "rejected" &&
        s.reason instanceof LiveGuardError &&
        s.reason.code === "cleanup_failed",
    )
  )
    throw new LiveGuardError("cleanup_failed");
  // Executor outcome is lifecycle metadata, not proof of a security PASS or a retry-guard assertion.
  return { status: "lease_processed" as const, executorOutcome: outcome };
}
