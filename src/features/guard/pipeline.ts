import {
  engines,
  type Engine,
  type EngineRun,
  type Finding,
  type Grant,
  type JobStatus,
  type PersistencePort,
  type ScanJob,
  type ScanRequest,
  type Scope,
} from "./contracts";
import { authorize, digest, GuardError, redact } from "./security";
import { engineBacklog } from "./adapters";
export const profiles: Record<ScanJob["profile"], readonly Engine[]> = {
  quick: ["sast", "sca", "secrets"],
  standard: ["sast", "sca", "secrets", "iac", "sbom", "integrity"],
  full: engines,
};
const transitions: Record<JobStatus, readonly JobStatus[]> = {
  queued: ["preparing", "cancelled"],
  preparing: ["running", "failed", "cancelled"],
  running: ["normalizing", "failed", "cancelled"],
  normalizing: ["completed", "completed_partial", "failed", "cancelled"],
  completed: [],
  completed_partial: [],
  failed: [],
  cancelled: [],
};
export function transition(
  job: ScanJob,
  next: JobStatus,
  actorId: string,
  at = new Date().toISOString(),
): ScanJob {
  if (!transitions[job.status].includes(next))
    throw new GuardError("invalid_transition", "Invalid scan transition.");
  return {
    ...job,
    status: next,
    ...(transitions[next].length === 0 ? { finishedAt: at } : {}),
    audit: [
      ...job.audit,
      {
        actorId,
        at,
        action: next,
        subjectId: job.id,
        reason: "Scan lifecycle",
      },
    ],
  };
}
export function planRuns(request: ScanRequest): EngineRun[] {
  return engines.map((engine) => ({
    engine,
    status: request.engines.includes(engine) ? "not_configured" : "skipped",
    reason: request.engines.includes(engine)
      ? `Authorized snapshot, isolated worker and configured scanner required (${engineBacklog[engine]}).`
      : "Excluded by scan configuration.",
    scanner: "unavailable",
    version: "not_configured",
    rulePack: "not_configured",
  }));
}
export async function createJob(
  grant: Grant,
  request: ScanRequest,
): Promise<ScanJob> {
  authorize(grant, request, "scan");
  if (
    !request.idempotencyKey ||
    request.idempotencyKey.length > 128 ||
    !request.engines.length ||
    new Set(request.engines).size !== request.engines.length ||
    request.engines.some((e) => !engines.includes(e)) ||
    !["github", "gitlab"].includes(request.repository.provider) ||
    !/^[a-f0-9]{40,64}$/i.test(request.repository.commit) ||
    !request.repository.repositoryId ||
    !request.repository.branch
  )
    throw new GuardError(
      "invalid_input",
      "Select a permitted repository and exact commit.",
    );
  const id = await digest(
    JSON.stringify([
      request.workspaceId,
      request.projectId,
      request.mode,
      request.idempotencyKey,
    ]),
  );
  return {
    ...request,
    requestedEngines: [...request.engines],
    id,
    status: "queued",
    createdAt: new Date().toISOString(),
    runs: planRuns(request),
    findings: [],
    audit: [
      {
        actorId: grant.actorId,
        at: new Date().toISOString(),
        action: "queued",
        subjectId: id,
        reason: "Requested scan",
      },
    ],
  };
}
/** Test/demo only. Never use as durable multi-instance storage. */
export class DemoMemoryStore implements PersistencePort {
  private jobs = new Map<string, ScanJob>();
  async create(grant: Grant, job: ScanJob): Promise<ScanJob> {
    authorize(grant, job, "scan");
    this.demo(job);
    const existing = this.jobs.get(job.id);
    if (
      existing &&
      JSON.stringify([
        existing.repository,
        existing.profile,
        existing.requestedEngines,
      ]) !== JSON.stringify([job.repository, job.profile, job.requestedEngines])
    )
      throw new GuardError(
        "invalid_input",
        "Idempotency key reused with different scan configuration.",
      );
    if (!existing) this.jobs.set(job.id, structuredClone(job));
    return structuredClone(existing ?? job);
  }
  async get(
    grant: Grant,
    scope: Scope,
    jobId: string,
  ): Promise<ScanJob | null> {
    authorize(grant, scope, "read");
    this.demo(scope);
    const job = this.jobs.get(jobId);
    if (!job) return null;
    authorize(grant, job, "read");
    return structuredClone(job);
  }
  async save(grant: Grant, job: ScanJob): Promise<void> {
    authorize(grant, job, "scan");
    this.demo(job);
    const old = this.jobs.get(job.id);
    if (
      !old ||
      old.workspaceId !== job.workspaceId ||
      old.projectId !== job.projectId ||
      old.mode !== job.mode ||
      JSON.stringify(old.repository) !== JSON.stringify(job.repository)
    )
      throw new GuardError("forbidden", "Existing scan scope is immutable.");
    this.jobs.set(job.id, structuredClone(job));
  }
  private demo(scope: Scope) {
    if (scope.mode !== "demo")
      throw new GuardError(
        "not_configured",
        "Durable live storage is not configured.",
      );
  }
}
export function triage(
  grant: Grant,
  finding: Finding,
  status:
    "under_review" | "fix_pending_retest" | "false_positive" | "risk_accepted",
  reason: string,
): { finding: Finding; audit: ScanJob["audit"][number] } {
  authorize(grant, finding, "triage");
  if (reason.trim().length < 8 || reason.length > 1000)
    throw new GuardError(
      "invalid_input",
      "Record a meaningful review reason (8-1000 characters).",
    );
  return {
    finding: { ...finding, status },
    audit: {
      actorId: grant.actorId,
      at: new Date().toISOString(),
      action: status,
      subjectId: finding.id,
      reason: redact(reason.trim()),
    },
  };
}
