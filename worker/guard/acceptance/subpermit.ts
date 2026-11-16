import {
  validateExecution,
  type ExecutionPacket,
  type ExecutionApproval,
} from "./approval";
import {
  preparationActions,
  workerActions,
  type GuardWorkerApproval,
  type GuardPreparationApproval,
} from "../approval";
import { LiveGuardError } from "../../../src/features/guard/live/model";
/** In-memory source-only subcapability. It cannot add Docker authority to any historical permit. */
export function sourcePermit(
  packet: ExecutionPacket,
  approval: ExecutionApproval,
  slot: number,
): GuardWorkerApproval {
  const { packet: p, approval: a } = validateExecution(packet, approval);
  if (!p.binding || !p.workerIds[slot] || !p.repositoryName)
    throw new LiveGuardError("approval_required");
  return {
    schemaVersion: 1,
    module: "guard-worker",
    status: "APPROVED",
    approvedBy: a.approvedBy,
    approvedAt: a.approvedAt,
    expiresAt: new Date(
      Math.min(
        Date.parse(a.expiresAt),
        p.caseId === "N03" ? Date.now() + 55000 : Date.parse(a.expiresAt),
      ),
    ).toISOString(),
    workerId: p.workerIds[slot],
    target: p.target,
    migrationPlanSha256: p.migrationPlanSha256,
    binding: p.binding,
    actions: workerActions,
    execution: "prepare_only",
    repositoryName: p.repositoryName,
  };
}
export function enqueuePermit(
  packet: ExecutionPacket,
  approval: ExecutionApproval,
): GuardPreparationApproval {
  const source = sourcePermit(packet, approval, 0);
  return {
    ...source,
    module: "guard-preparation",
    expiresAt: approval.expiresAt,
    actions: preparationActions,
  };
}
