import { LiveGuardError } from "../../../src/features/guard/live/model";
import {
  validateExecution,
  type ExecutionPacket,
  type ExecutionApproval,
} from "./approval";
export interface CaseObservation {
  bindingMatches: boolean;
  scanCount: number;
  queueCount: number;
  scanState: string | null;
  queueState: string | null;
  attempts: number;
  fence: number;
  leaseActive: boolean;
  hasLeaseOwner?: boolean;
  heartbeat: string | null;
  foundation: boolean;
  sandboxAudit: boolean;
  coverage: boolean;
  sourceAbsent: boolean;
  containerAbsent: boolean;
  sentinelPreserved: boolean;
  originalRowsPreserved: boolean;
  fault?: string;
  staleWriteDenied?: boolean;
  physicalOverlapDenied?: boolean;
  actualAgeMs?: number;
  markerUnchanged?: boolean;
  ddlStatements?: number;
  actualElapsedMs?: number;
  realExpiryReached?: boolean;
  controlsComplete?: boolean;
  syntheticFixtureRetained?: boolean;
  deferredSourceOrphan?: boolean;
}
export interface CasePorts {
  /** Each implementation reserves its durable quota BEFORE effects, and does not retry failures. */
  qualify(): Promise<CaseObservation>;
  denyEvidence(): Promise<CaseObservation>;
  enqueue(): Promise<void>;
  launch(slot: number, afterClaim?: () => Promise<void>): Promise<void>;
  cancel(): Promise<void>;
  fault(): Promise<void>;
  waitLeaseExpiry(): Promise<void>;
  staleWrite(): Promise<void>;
  cleanupContainer(): Promise<void>;
  reapSource(): Promise<CaseObservation>;
  schema(): Promise<CaseObservation>;
  observe(): Promise<CaseObservation>;
}
function check(ok: unknown) {
  if (!ok) throw new LiveGuardError("execution_not_ready");
}
/** Independent assertions: an HTTP error/exit0 alone cannot produce PASS. */
export function assertCase(p: ExecutionPacket, o: CaseObservation) {
  check(o.sentinelPreserved && o.originalRowsPreserved);
  if (p.caseId === "Q00") {
    check(
      o.controlsComplete && o.containerAbsent && o.syntheticFixtureRetained,
    );
    return;
  }
  if (p.caseId === "N00") {
    check(
      o.fault === "evidence_denied" &&
        o.scanCount === 0 &&
        o.queueCount === 0 &&
        o.containerAbsent,
    );
    return;
  }
  if (p.caseId === "L01" || p.caseId === "L02") {
    check(
      o.ddlStatements === 0 &&
        o.fault ===
          (p.caseId === "L01"
            ? "already_applied"
            : "guard_rollback_requires_empty_inactive_scope"),
    );
    return;
  }
  if (p.caseId === "C02B") {
    check(
      o.sourceAbsent &&
        o.markerUnchanged &&
        o.actualAgeMs !== undefined &&
        o.actualAgeMs >= 3600000,
    );
    return;
  }
  check(
    o.bindingMatches &&
      o.scanCount === 1 &&
      o.queueCount === 1 &&
      o.containerAbsent &&
      !o.leaseActive &&
      o.hasLeaseOwner === false &&
      o.heartbeat === "stopped",
  );
  check(
    p.caseId === "C02A"
      ? !o.sourceAbsent && o.deferredSourceOrphan === true
      : o.sourceAbsent,
  );
  if (p.caseId === "I01" || p.caseId === "C01" || p.caseId === "C02A") {
    check(
      o.scanState === "failed" &&
        o.queueState === "completed" &&
        o.foundation &&
        o.sandboxAudit &&
        o.coverage,
    );
    check(
      o.attempts === (p.caseId === "I01" ? 1 : p.caseId === "C01" ? 2 : 3) &&
        o.fence === o.attempts,
    );
    if (p.caseId === "C01") check(o.staleWriteDenied);
    if (p.caseId === "C02A") check(o.physicalOverlapDenied);
  } else {
    const expected = {
      N01: "session_revoked",
      N02: "cancelled",
      N03: "permit_expired",
      N04: "grant_expired",
      N05: "container_timeout",
      N06: "source_timeout",
      N07: "container_cleanup_failed_then_rescued",
      N08: "source_cleanup_failed_then_rescued",
    }[p.caseId];
    check(
      !o.foundation &&
        !o.sandboxAudit &&
        o.fault === expected &&
        o.attempts === 1,
    );
    check(o.scanState === "cancelled" && o.queueState === "cancelled");
    if (p.caseId === "N03" || p.caseId === "N04") check(o.realExpiryReached);
    if (p.caseId === "N04")
      check(o.actualElapsedMs !== undefined && o.actualElapsedMs >= 60000);
    if (p.caseId === "N06")
      check(o.actualElapsedMs !== undefined && o.actualElapsedMs >= 45000);
  }
}
/** Sequencing shared by the real composition and injected OFFLINE tests. No dependency is a ready boolean. */
export async function runCase(
  packet: ExecutionPacket,
  approval: ExecutionApproval,
  ports: CasePorts,
) {
  const p = validateExecution(packet, approval).packet;
  let observed: CaseObservation;
  if (p.caseId === "Q00") observed = await ports.qualify();
  else if (p.caseId === "N00") observed = await ports.denyEvidence();
  else if (p.caseId === "C02B") observed = await ports.reapSource();
  else if (p.caseId.startsWith("L")) observed = await ports.schema();
  else {
    const before = await ports.observe();
    check(
      before.sentinelPreserved &&
        before.originalRowsPreserved &&
        before.scanCount === 0 &&
        before.queueCount === 0,
    );
    await ports.enqueue();
    const queued = await ports.observe();
    check(
      queued.bindingMatches &&
        queued.scanCount === 1 &&
        queued.queueCount === 1 &&
        queued.attempts === 0,
    );
    if (p.caseId === "I01") await ports.launch(0);
    else if (p.caseId === "C01") {
      await ports.fault();
      await ports.launch(0);
      await ports.waitLeaseExpiry();
      await ports.launch(1, () => ports.staleWrite());
    } else if (p.caseId === "C02A") {
      await ports.fault();
      await ports.launch(0);
      await ports.waitLeaseExpiry();
      await ports.launch(1);
      await ports.cleanupContainer();
      await ports.launch(2);
    } else {
      await ports.fault();
      await ports.launch(0);
      await ports.cancel();
    }
    observed = await ports.observe();
  }
  assertCase(p, observed);
  return {
    caseId: p.caseId,
    status: "PASS" as const,
    execution: "foundation_probe_only" as const,
    scannerExecution: "NOT_RUN" as const,
    observation: observed,
  };
}
