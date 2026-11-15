import type { JobLease } from "../../src/features/sentinel/platform-contracts";
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
  resolve(
    lease: JobLease,
    signal?: AbortSignal,
  ): Promise<{ grant: Grant; snapshots: SnapshotPort }>;
}
export async function prepareGuardJob(
  store: PostgresGuardStore,
  resolver: WorkerAuthorizationResolver,
  lease: JobLease,
  signal: AbortSignal,
  currentLease: () => JobLease = () => lease,
  foundationProbe?: {
    execute(snapshot: import("../../src/features/guard/contracts").AuthorizedSnapshot, lease: JobLease, signal: AbortSignal): Promise<{ manifest: string; specDigest: string }>;
  },
) {
  const activeLease = () => {
    const fresh = currentLease();
    if (
      signal.aborted ||
      fresh.job.jobId !== lease.job.jobId ||
      fresh.workerId !== lease.workerId ||
      fresh.leaseToken !== lease.leaseToken ||
      fresh.job.cancelRequested ||
      !Number.isFinite(Date.parse(fresh.expiresAt)) ||
      Date.parse(fresh.expiresAt) <= Date.now()
    )
      throw new LiveGuardError("lease_lost", 409);
    return fresh;
  };
  if (lease.job.module !== "guard" || lease.job.kind !== "guard.scan.prepare")
    throw new LiveGuardError("not_found", 404);
  const { grant, snapshots } = await resolver.resolve(activeLease(), signal);
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
      mode: current.job.mode,
      workspaceId: current.job.workspaceId,
      projectId: current.job.projectId,
      repository: current.job.repository,
      profile: current.job.profile,
      idempotencyKey: current.job.idempotencyKey,
      engines: current.job.requestedEngines,
    },
    signal,
  );
  let probe: { manifest: string; specDigest: string } | undefined;
  let writeGrant = grant;
  try {
    if (signal.aborted) throw new LiveGuardError("execution_not_ready");
    if (foundationProbe) probe = await foundationProbe.execute(snapshot,activeLease(),signal);
    const again = await resolver.resolve(activeLease(), signal);
    authorize(again.grant, current.job, "scan");
    if (again.grant.actorId !== grant.actorId)
      throw new LiveGuardError("not_found", 404);
    if (foundationProbe) writeGrant = again.grant;
  } finally {
    await snapshots.dispose(snapshot);
  }
  // G01 prepare outcome only. Never manufacture engine completion. G02 must install a separately approved handler.
  const job = transition(current.job, "failed", grant.actorId);
  if (probe) {
    if (!/^[a-f0-9]{64}$/.test(probe.manifest) || !/^[a-f0-9]{64}$/.test(probe.specDigest)) throw new LiveGuardError("source_integrity");
    job.audit.push({actorId:grant.actorId,at:new Date().toISOString(),action:"foundation_sandbox_verified",subjectId:job.id,reason:`G01 trusted probe ${probe.specDigest}; manifest ${probe.manifest}; no scanner ran.`});
  }
  job.audit.push({
    actorId: grant.actorId,
    at: new Date().toISOString(),
    action: "foundation_prepared",
    subjectId: job.id,
    reason: "G02 execution not configured; no scanner ran.",
  });
  const coverage =
    "coverage" in snapshot ? (snapshot as GuardSnapshot).coverage : undefined;
  activeLease();
  await store.update(writeGrant, job, current.revision, fence, coverage);
}
