import type { Grant, Scope } from "../../src/features/guard/contracts";
import type {
  JobLease,
  DurableJob,
} from "../../src/features/sentinel/platform-contracts";
import { GuardError, authorize } from "../../src/features/guard/security";
import {
  LiveGuardError,
  type GuardStorage,
} from "../../src/features/guard/live/model";
import {
  operationalJob,
  repositoryScanKind,
  validateProductPolicy,
  type RepositoryScanPolicy,
} from "../../src/features/guard/live/product-policy";
import { executeScopedJob, type WorkerPorts } from "./orchestrator";
export interface RepositoryWorkerContext {
  policy: RepositoryScanPolicy;
  freshGrant(): Promise<Grant>;
  verifyLease(lease: JobLease): Promise<void>;
  ports: WorkerPorts;
}
/** Runs under the existing leased executor. The broker owns source/credentials; scanners stay in qualified containers. */
export function repositoryJobHandler(input: {
  storage: GuardStorage;
  resolve(
    job: DurableJob,
    lease: JobLease,
    currentLease: () => JobLease,
  ): Promise<RepositoryWorkerContext>;
}) {
  return async (
    job: DurableJob,
    signal: AbortSignal,
    currentLease: () => JobLease,
  ) => {
    if (
      job.module !== "guard" ||
      job.kind !== repositoryScanKind ||
      job.mode !== "live" ||
      job.attempts !== 1
    )
      throw new LiveGuardError("execution_not_ready");
    const initial = currentLease();
    if (
      initial.job.jobId !== job.jobId ||
      initial.job.kind !== repositoryScanKind
    )
      throw new LiveGuardError("lease_lost", 409);
    const context = await input.resolve(job, initial, currentLease),
      grant = await context.freshGrant(),
      scope: Scope = {
        mode: "live",
        workspaceId: job.workspaceId,
        projectId: job.projectId,
      };
    authorize(grant, scope, "scan");
    await context.verifyLease(initial);
    const stored = await input.storage.get(grant, scope, job.jobId);
    if (
      !stored ||
      !operationalJob(stored.job) ||
      stored.job.status !== "queued"
    )
      throw new LiveGuardError("execution_not_ready");
    validateProductPolicy(context.policy, stored.job);
    const originalActor = stored.job.audit[0]?.actorId;
    const fresh = async () => {
      if (signal.aborted) throw new GuardError("forbidden", "Worker stopped.");
      const lease = currentLease();
      if (
        lease.leaseToken !== initial.leaseToken ||
        lease.workerId !== initial.workerId
      )
        throw new LiveGuardError("lease_lost", 409);
      await context.verifyLease(lease);
      const next = await context.freshGrant();
      authorize(next, scope, "scan");
      if (next.actorId !== originalActor)
        throw new GuardError("forbidden", "Authorization changed.");
      return next;
    };
    const result = await executeScopedJob(
      { ...context.ports, freshGrant: fresh },
      await fresh(),
      scope,
      job.jobId,
      signal,
    );
    if (
      !["completed", "completed_partial", "failed", "cancelled"].includes(
        result.status,
      )
    )
      throw new LiveGuardError("execution_not_ready");
  };
}
