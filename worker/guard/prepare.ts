import type {
  DurableJob,
  JobLease,
} from "../../src/features/sentinel/platform-contracts";
import type { Grant, SnapshotPort } from "../../src/features/guard/contracts";
import { authorize } from "../../src/features/guard/security";
import { transition } from "../../src/features/guard/pipeline";
import type { PostgresGuardStore } from "../../src/features/guard/live/persistence";
import {
  LiveGuardError,
  type GuardSnapshot,
} from "../../src/features/guard/live/model";
/** Fresh broker resolution is required on every attempt; never persist session/OAuth tokens in jobs. */
export interface WorkerAuthorizationResolver {
  resolve(job: DurableJob): Promise<{ grant: Grant; snapshots: SnapshotPort }>;
}
export async function prepareGuardJob(
  store: PostgresGuardStore,
  resolver: WorkerAuthorizationResolver,
  lease: JobLease,
  signal: AbortSignal,
) {
  if (lease.job.module !== "guard" || lease.job.kind !== "guard.scan.prepare")
    throw new LiveGuardError("not_found", 404);
  const { grant, snapshots } = await resolver.resolve(lease.job);
  authorize(grant, lease.job, "scan");
  let current = await store.get(grant, lease.job, lease.job.subjectRef);
  if (!current) throw new LiveGuardError("not_found", 404);
  if (
    ["completed", "completed_partial", "failed", "cancelled"].includes(
      current.job.status,
    )
  )
    return;
  const fence = { workerId: lease.workerId, leaseToken: lease.leaseToken };
  if (current.job.status === "queued")
    current = await store.update(
      grant,
      transition(current.job, "preparing", grant.actorId),
      current.revision,
      fence,
    );
  if (current.job.status !== "preparing")
    throw new LiveGuardError("execution_not_ready");
  if (signal.aborted) throw new LiveGuardError("execution_not_ready");
  const snapshot = await snapshots.acquire(
    grant,
    {
      ...current.job,
      engines: current.job.requestedEngines,
    },
    signal,
  );
  try {
    if (signal.aborted) throw new LiveGuardError("execution_not_ready");
    const again = await resolver.resolve(lease.job);
    authorize(again.grant, current.job, "scan");
    if (again.grant.actorId !== grant.actorId)
      throw new LiveGuardError("not_found", 404);
  } finally {
    await snapshots.dispose(snapshot);
  }
  // G01 prepare outcome only. Never manufacture engine completion. G02 must install a separately approved handler.
  const job = transition(current.job, "failed", grant.actorId);
  job.audit.push({
    actorId: grant.actorId,
    at: new Date().toISOString(),
    action: "foundation_prepared",
    subjectId: job.id,
    reason: "G02 execution not configured; no scanner ran.",
  });
  const coverage =
    "coverage" in snapshot ? (snapshot as GuardSnapshot).coverage : undefined;
  await store.update(grant, job, current.revision, fence, coverage);
}
