import type { GuardIpcPort } from "../ipc";
import { guardRpcClient, boundedPacket } from "../ipc";
import type { JobLease } from "../../../src/features/sentinel/platform-contracts";
import type {
  AuthorizedSnapshot,
  Grant,
  SnapshotPort,
} from "../../../src/features/guard/contracts";
import { authorize } from "../../../src/features/guard/security";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import { acceptanceTiming, type CaseId } from "./catalog";
import { realGrantExpiry } from "./checkpoints";
/** Inherited private IPC only. No path/session/token/file credential is returned to the child. */
export function foundationResolver(
  port: GuardIpcPort,
  current: () => JobLease,
  caseId: CaseId,
) {
  const rpc = guardRpcClient(port, acceptanceTiming.acquireRpcMs),
    probeRpc = guardRpcClient(port, acceptanceTiming.probeRpcMs),
    handles = new WeakMap<AuthorizedSnapshot, string>();
  const resolver = {
    async resolve(lease: JobLease, signal?: AbortSignal) {
      const data = boundedPacket(
          await rpc.call({ op: "resolve", lease }, signal),
        ),
        grant = data.grant as Grant;
      if (caseId === "N04") {
        if (
          typeof grant.issuedAt !== "number" ||
          !Number.isFinite(grant.issuedAt) ||
          grant.expiresAt - grant.issuedAt !== 60000
        )
          throw new LiveGuardError("execution_not_ready");
        await realGrantExpiry(
          grant.expiresAt,
          signal ?? new AbortController().signal,
        );
        await port.send({
          type: "guard.acceptance.boundary",
          version: 2,
          boundary: "grant_expired",
          expiresAt: grant.expiresAt,
          issuedAt: grant.issuedAt,
          observedAt: Date.now(),
        });
      }
      authorize(grant, lease.job, "scan");
      const snapshots: SnapshotPort = {
        async acquire(g, request, s) {
          authorize(g, request, "scan");
          const result = boundedPacket(
            await rpc.call({ op: "acquire", lease: current(), request }, s),
          );
          if (
            typeof result.handle !== "string" ||
            !/^[a-f0-9-]{36}$/.test(result.handle)
          )
            throw new LiveGuardError("source_integrity");
          const snapshot = result.snapshot as AuthorizedSnapshot;
          authorize(g, snapshot, "scan");
          handles.set(snapshot, result.handle);
          return snapshot;
        },
        async dispose(snapshot) {
          const handle = handles.get(snapshot);
          if (!handle) throw new LiveGuardError("not_found", 404);
          await rpc.call({ op: "dispose", lease: current(), handle });
          handles.delete(snapshot);
        },
      };
      return { grant, snapshots };
    },
  };
  const probe = {
    async execute(
      snapshot: AuthorizedSnapshot,
      lease: JobLease,
      signal: AbortSignal,
    ) {
      const handle = handles.get(snapshot);
      if (!handle) throw new LiveGuardError("not_found", 404);
      const result = boundedPacket(
        await probeRpc.call({ op: "probe", lease, handle }, signal),
      );
      if (
        typeof result.manifest !== "string" ||
        typeof result.specDigest !== "string"
      )
        throw new LiveGuardError("source_integrity");
      return { manifest: result.manifest, specDigest: result.specDigest };
    },
  };
  return {
    resolver,
    probe,
    claimed: (signal: AbortSignal) =>
      rpc.call(
        { op: "checkpoint", lease: current(), point: "claimed" },
        signal,
      ),
    close: () => {
      rpc.close();
      probeRpc.close();
    },
  };
}
