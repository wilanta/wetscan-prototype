import type { ExecutionPacket } from "./approval";
import { n04HoldMs, type N04Denial } from "./n04";
/** Pure independent predicate, shared by cancellation and finalization. Never accepts pre-authorize checkpoints. */
export function validN04Denial(
  value: unknown,
): value is N04Denial & { realExpiryReached: true; actualElapsedMs: number } {
  const b = value as N04Denial & {
    realExpiryReached?: boolean;
    actualElapsedMs?: number;
  };
  return (
    !!b &&
    b.boundary === "grant_expired" &&
    b.realExpiryReached === true &&
    Number.isFinite(b.issuedAt) &&
    Number.isFinite(b.expiresAt) &&
    Number.isFinite(b.authorizationCheckedAt) &&
    Number.isFinite(b.observedAt) &&
    b.expiresAt - b.issuedAt === 60000 &&
    b.authorizationCheckedAt - b.issuedAt >= n04HoldMs &&
    b.observedAt >= b.authorizationCheckedAt &&
    b.observedAt <= Date.now() &&
    b.actualElapsedMs === b.authorizationCheckedAt - b.issuedAt &&
    b.authorization?.operation === "scan" &&
    b.authorization.outcome === "denied" &&
    b.authorization.errorCode === "forbidden"
  );
}
export function validN04Evidence(
  p: ExecutionPacket,
  boundary: unknown,
  retry: unknown,
  launch: unknown,
) {
  if (p.caseId !== "N04" || !validN04Denial(boundary)) return false;
  const r = retry as Record<string, unknown> | null,
    l = launch as Record<string, unknown> | null;
  return (
    !!r &&
    r.jobId === p.binding?.jobId &&
    r.workerId === p.workerIds[0] &&
    r.attempt === 1 &&
    r.retryScheduled === false &&
    r.failureCode === "handler_failed" &&
    typeof r.observedAt === "number" &&
    r.observedAt >= boundary.observedAt &&
    r.observedAt <= Date.now() &&
    !!l &&
    l.exitCode === 0 &&
    typeof l.endedAt === "number" &&
    Number.isFinite(l.endedAt) &&
    l.endedAt >= r.observedAt &&
    l.endedAt <= Date.now()
  );
}
