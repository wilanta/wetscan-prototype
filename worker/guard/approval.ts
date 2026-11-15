import { validGuardBranch } from "../../src/features/guard/live/revision";
import type { ScanJob } from "../../src/features/guard/contracts";
import type { Target } from "../../src/platform/config";
import { fingerprint } from "../../src/platform/identity";
import { scanInput } from "../../src/features/guard/live/service";
import { LiveGuardError } from "../../src/features/guard/live/model";
export const workerActions = [
  "worker_start",
  "queue_claim",
  "heartbeat",
  "snapshot_read",
  "scan_metadata_write",
  "cleanup",
] as const;
export interface GuardJobBinding {
  mode: "live";
  workspaceId: string;
  projectId: string;
  jobId: string;
  actorId: string;
  repository: ScanJob["repository"];
  profile: ScanJob["profile"];
  engines: ScanJob["requestedEngines"];
  idempotencyKey: string;
}
export function bindGuardJob(job: ScanJob): GuardJobBinding {
  const actorId = job.audit[0]?.actorId;
  if (
    job.mode !== "live" ||
    !/^[a-f0-9]{64}$/.test(job.id) ||
    !/^github-user-[1-9]\d*$/.test(actorId ?? "") ||
    !job.workspaceId.startsWith(actorId + ":") ||
    job.repository.provider !== "github" ||
    !/^[1-9]\d{0,15}$/.test(job.repository.repositoryId) ||
    job.projectId !== "github-" + job.repository.repositoryId ||
    !validGuardBranch(job.repository.branch) ||
    job.audit[0]?.action !== "queued" ||
    job.audit[0]?.subjectId !== job.id
  )
    throw new LiveGuardError("not_found", 404);
  scanInput({
    profile: job.profile,
    engines: job.requestedEngines,
    commit: job.repository.commit,
    idempotencyKey: job.idempotencyKey,
  });
  return structuredClone({
    mode: "live",
    workspaceId: job.workspaceId,
    projectId: job.projectId,
    jobId: job.id,
    actorId,
    repository: {
      provider: job.repository.provider,
      repositoryId: job.repository.repositoryId,
      branch: job.repository.branch,
      commit: job.repository.commit,
    },
    profile: job.profile,
    engines: job.requestedEngines,
    idempotencyKey: job.idempotencyKey,
  });
}
export interface GuardWorkerApproval {
  schemaVersion: 1;
  module: "guard-worker";
  status: "APPROVED";
  approvedBy: string;
  approvedAt: string;
  expiresAt: string;
  workerId: string;
  target: Target;
  migrationPlanSha256: string;
  binding: GuardJobBinding;
  actions: readonly string[];
  execution: "prepare_only";
  repositoryName: string;
}
export const preparationActions = [
  "queue_enqueue",
  "snapshot_read",
  "scan_metadata_write",
  "cleanup",
] as const;
export interface GuardPreparationApproval extends Omit<
  GuardWorkerApproval,
  "module" | "actions"
> {
  module: "guard-preparation";
  actions: readonly string[];
}
/** A general review message is never substituted for this exact-target, exact-job runtime permit. */
function validateBoundApproval(
  value: unknown,
  binding: GuardJobBinding,
  plan: string,
  now: number,
  module: "guard-worker" | "guard-preparation",
  actions: readonly string[],
): GuardWorkerApproval | GuardPreparationApproval {
  const p = value as GuardWorkerApproval | GuardPreparationApproval;
  if (
    !binding ||
    binding.mode !== "live" ||
    !/^[a-f0-9]{64}$/.test(binding.jobId) ||
    !/^github-user-[1-9]\d*$/.test(binding.actorId) ||
    typeof binding.workspaceId !== "string" ||
    !binding.workspaceId.startsWith(binding.actorId + ":") ||
    binding.projectId !== "github-" + binding.repository?.repositoryId ||
    binding.repository?.provider !== "github" ||
    !validGuardBranch(binding.repository.branch) ||
    !/^[a-f0-9]{40}$/.test(binding.repository.commit)
  )
    throw new LiveGuardError("approval_required");

  if (
    !p ||
    p.schemaVersion !== 1 ||
    p.module !== module ||
    p.status !== "APPROVED" ||
    typeof p.approvedBy !== "string" ||
    !p.approvedBy.trim() ||
    !Number.isFinite(Date.parse(p.approvedAt)) ||
    Date.parse(p.approvedAt) > now + 60000 ||
    !Number.isFinite(Date.parse(p.expiresAt)) ||
    Date.parse(p.expiresAt) <= now ||
    Date.parse(p.expiresAt) > now + 3600000 ||
    Date.parse(p.expiresAt) <= Date.parse(p.approvedAt) ||
    Date.parse(p.expiresAt) - Date.parse(p.approvedAt) > 3600000 ||
    typeof p.workerId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(p.workerId) ||
    !/^[a-f0-9]{64}$/.test(plan) ||
    p.migrationPlanSha256 !== plan ||
    !p.target ||
    !["localhost", "127.0.0.1"].includes(p.target.host) ||
    !Number.isInteger(p.target.port) ||
    p.target.port < 1024 ||
    p.target.port > 65535 ||
    ![
      "wetscan_dev",
      "wetscan_dev_guardg01",
      "wetscan_s01_test_guardg01",
    ].includes(p.target.database) ||
    !/^wetscan-s01:[a-f0-9-]{36}$/.test(p.target.marker) ||
    p.execution !== "prepare_only" ||
    typeof p.repositoryName !== "string" ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(p.repositoryName) ||
    Object.keys(p).some(
      (key) =>
        ![
          "schemaVersion",
          "module",
          "status",
          "approvedBy",
          "approvedAt",
          "expiresAt",
          "workerId",
          "target",
          "migrationPlanSha256",
          "binding",
          "actions",
          "execution",
          "repositoryName",
        ].includes(key),
    ) ||
    !Array.isArray(p.actions) ||
    p.actions.length !== actions.length ||
    new Set(p.actions).size !== actions.length ||
    actions.some((a) => !p.actions.includes(a)) ||
    fingerprint(p.binding) !== fingerprint(binding)
  )
    throw new LiveGuardError("approval_required");
  return structuredClone(p);
}

export function validateWorkerApproval(
  value: unknown,
  binding: GuardJobBinding,
  plan: string,
  now = Date.now(),
): GuardWorkerApproval {
  return validateBoundApproval(
    value,
    binding,
    plan,
    now,
    "guard-worker",
    workerActions,
  ) as GuardWorkerApproval;
}
export function validatePreparationApproval(
  value: unknown,
  binding: GuardJobBinding,
  plan: string,
  now = Date.now(),
): GuardPreparationApproval {
  return validateBoundApproval(
    value,
    binding,
    plan,
    now,
    "guard-preparation",
    preparationActions,
  ) as GuardPreparationApproval;
}
