import { randomUUID } from "node:crypto";
import type {
  Grant,
  SnapshotPort,
  ScanRequest,
  AuthorizedSnapshot,
} from "../../src/features/guard/contracts";
import type { JobLease } from "../../src/features/sentinel/platform-contracts";
import type {
  ProjectAuthority,
  StoredScan,
} from "../../src/features/guard/live/model";
import { LiveGuardError } from "../../src/features/guard/live/model";
import { authorize } from "../../src/features/guard/security";
import { fingerprint, validateJob } from "../../src/platform/identity";
import {
  bindGuardJob,
  validateWorkerApproval,
  type GuardWorkerApproval,
} from "./approval";
import type { WorkerAuthorizationResolver } from "./prepare";
import { guardRpcClient, type GuardIpcPort, boundedPacket } from "./ipc";
export interface BrokerDependencies {
  current(): Promise<ProjectAuthority>;
  load(grant: Grant): Promise<StoredScan | null>;
  verifyLease(lease: JobLease): Promise<void>;
  snapshots: SnapshotPort;
}
/** Runs only in the existing Auth process. Injected dependencies are trusted server adapters, never browser input. */
export class GuardSessionBroker {
  private closed = false;
  private handles = new Map<
    string,
    { snapshot: AuthorizedSnapshot; lease: string }
  >();
  private readonly permit: GuardWorkerApproval;
  constructor(
    permit: GuardWorkerApproval,
    private readonly deps: BrokerDependencies,
  ) {
    this.permit = validateWorkerApproval(
      permit,
      permit.binding,
      permit.migrationPlanSha256,
    );
  }
  private check() {
    if (this.closed) throw new LiveGuardError("source_unavailable");
    validateWorkerApproval(
      this.permit,
      this.permit.binding,
      this.permit.migrationPlanSha256,
    );
  }
  async admission() {
    this.check();
    const a = await this.deps.current(),
      b = this.permit.binding;
    authorize(a.grant, b, "scan");
    if (
      a.grant.actorId !== b.actorId ||
      a.repositoryId !== b.repository.repositoryId ||
      a.repositoryName !== this.permit.repositoryName ||
      a.branch !== b.repository.branch
    )
      throw new LiveGuardError("not_found", 404);
    const stored = await this.deps.load(a.grant);
    if (
      !stored ||
      fingerprint(bindGuardJob(stored.job)) !== fingerprint(b) ||
      !["queued", "preparing"].includes(stored.job.status)
    )
      throw new LiveGuardError("not_found", 404);
    this.check();
    return {
      grant: {
        ...a.grant,
        expiresAt: Math.min(
          a.grant.expiresAt,
          Date.parse(this.permit.expiresAt),
        ),
      },
      job: stored.job,
    };
  }
  private lease(value: unknown, cleanup = false): JobLease {
    const lease = value as JobLease,
      b = this.permit.binding;
    if (
      !lease ||
      !lease.job ||
      Object.keys(lease).some(
        (k) => !["job", "workerId", "leaseToken", "expiresAt"].includes(k),
      )
    )
      throw new LiveGuardError("lease_lost", 409);
    // Shared validateJob is an enqueue contract (attempts0/revision1), not a lease validator.
    validateJob({
      ...lease.job,
      attempts: 0,
      revision: 1,
      cancelRequested: false,
    });
    if (
      !Number.isInteger(lease.job.attempts) ||
      lease.job.attempts < 1 ||
      lease.job.attempts > lease.job.maxAttempts ||
      !Number.isInteger(lease.job.revision) ||
      lease.job.revision < 2 ||
      lease.job.cancelRequested
    )
      throw new LiveGuardError("lease_lost", 409);
    if (
      lease.job.module !== "guard" ||
      lease.job.kind !== "guard.scan.prepare" ||
      lease.job.mode !== "live" ||
      lease.job.jobId !== b.jobId ||
      lease.job.subjectRef !== b.jobId ||
      lease.job.workspaceId !== b.workspaceId ||
      lease.job.projectId !== b.projectId ||
      lease.workerId !== this.permit.workerId ||
      typeof lease.leaseToken !== "string" ||
      !/^[a-zA-Z0-9:_-]{1,160}$/.test(lease.leaseToken) ||
      !Number.isFinite(Date.parse(lease.expiresAt)) ||
      (!cleanup && Date.parse(lease.expiresAt) <= Date.now())
    )
      throw new LiveGuardError("lease_lost", 409);
    return lease;
  }
  async handle(
    packet: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<unknown> {
    if (
      Object.keys(packet).some(
        (k) =>
          ![
            "type",
            "version",
            "id",
            "op",
            "lease",
            "request",
            "handle",
          ].includes(k),
      )
    )
      throw new LiveGuardError("invalid_input", 400);
    if (!["resolve", "acquire", "dispose"].includes(String(packet.op)))
      throw new LiveGuardError("invalid_input", 400);
    const lease = this.lease(packet.lease, packet.op === "dispose");
    if (packet.op === "dispose") {
      const entry = this.handles.get(String(packet.handle));
      if (!entry || entry.lease !== lease.leaseToken)
        throw new LiveGuardError("not_found", 404);
      await this.deps.snapshots.dispose(entry.snapshot);
      this.handles.delete(String(packet.handle));
      return { disposed: true };
    }
    this.check();
    if (signal.aborted) throw new LiveGuardError("source_unavailable");
    await this.deps.verifyLease(lease);
    const { grant, job } = await this.admission();
    if (packet.op === "resolve") return { grant };
    const expected: ScanRequest = {
      mode: job.mode,
      workspaceId: job.workspaceId,
      projectId: job.projectId,
      repository: job.repository,
      profile: job.profile,
      engines: job.requestedEngines,
      idempotencyKey: job.idempotencyKey,
    };
    if (
      fingerprint(packet.request) !== fingerprint(expected) ||
      this.handles.size >= 1
    )
      throw new LiveGuardError("invalid_input", 400);
    const snapshot = await this.deps.snapshots.acquire(grant, expected, signal);
    try {
      this.check();
      if (signal.aborted) throw new LiveGuardError("source_unavailable");
      await this.deps.verifyLease(lease);
      await this.admission();
      const handle = randomUUID();
      boundedPacket({ snapshot, handle });
      this.handles.set(handle, { snapshot, lease: lease.leaseToken });
      return { snapshot, handle };
    } catch (error) {
      await this.deps.snapshots.dispose(snapshot);
      throw error;
    }
  }
  async close() {
    this.closed = true;
    let failed = false;
    for (const [id, entry] of this.handles) {
      try {
        await this.deps.snapshots.dispose(entry.snapshot);
        this.handles.delete(id);
      } catch {
        failed = true;
      }
    }
    if (failed) throw new LiveGuardError("cleanup_failed");
  }
}
/** Worker receives grants/metadata only over inherited IPC. No Auth files, session cookie or provider token. */
export function ipcWorkerResolver(port: GuardIpcPort) {
  const rpc = guardRpcClient(port);
  const resolver: WorkerAuthorizationResolver = {
    async resolve(lease, signal) {
      const value = boundedPacket(
        await rpc.call({ op: "resolve", lease }, signal),
      );
      const grant = value.grant as Grant;
      authorize(grant, lease.job, "scan");
      const owned = new WeakMap<AuthorizedSnapshot, string>();
      const snapshots: SnapshotPort = {
        async acquire(g, request, parentSignal) {
          authorize(g, lease.job, "scan");
          authorize(grant, request, "scan");
          const result = boundedPacket(
            await rpc.call({ op: "acquire", lease, request }, parentSignal),
          );
          const snapshot = result.snapshot as AuthorizedSnapshot;
          authorize(grant, snapshot, "scan");
          if (
            typeof result.handle !== "string" ||
            !/^[a-f0-9-]{36}$/.test(result.handle) ||
            fingerprint(snapshot.repository) !==
              fingerprint(request.repository) ||
            !Array.isArray(snapshot.files) ||
            !/^[a-f0-9]{64}$/.test(snapshot.digest)
          )
            throw new LiveGuardError("source_integrity", 502);
          owned.set(snapshot, result.handle);
          return snapshot;
        },
        async dispose(snapshot) {
          const handle = owned.get(snapshot);
          if (!handle) throw new LiveGuardError("not_found", 404);
          await rpc.call({ op: "dispose", lease, handle });
          owned.delete(snapshot);
        },
      };
      return { grant, snapshots };
    },
  };
  return { resolver, close: rpc.close };
}
