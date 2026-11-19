import type { Engine, Grant, ScanJob, Scope } from "../contracts";
import { engines } from "../contracts";
import { createJob } from "../pipeline";
import { authorize } from "../security";
import {
  LiveGuardError,
  repositoryFor,
  type GuardStorage,
  type ProjectAuthority,
} from "./model";
import { validGuardBranch } from "./revision";
import type { ProductAdmission } from "./product-admission";
import type { PostgresGuardArtifacts } from "./product-artifacts";
import { storedScanView } from "./product-view";
import { requireOperationalJob } from "./product-policy";
export interface FoundationReadiness {
  database: "approved" | "approval_required" | "not_configured";
  schema: "verified" | "unverified";
  queue: "verified" | "unverified";
  sandbox: "verified" | "BLOCKED";
  workerAuthorization: "configured" | "not_configured";
  execution: "G02_NOT_CONFIGURED" | "REPOSITORY_SCAN_CONFIGURED";
}
export const defaultReadiness: FoundationReadiness = {
  database: "approval_required",
  schema: "unverified",
  queue: "unverified",
  sandbox: "BLOCKED",
  workerAuthorization: "not_configured",
  execution: "G02_NOT_CONFIGURED",
};
export function scanInput(value: unknown): {
  profile: ScanJob["profile"];
  engines: Engine[];
  commit?: string;
  branch?: string;
  idempotencyKey: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new LiveGuardError("invalid_input", 400);
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (k) =>
        !["profile", "engines", "commit", "branch", "idempotencyKey"].includes(
          k,
        ),
    ) ||
    !["quick", "standard", "full"].includes(String(v.profile)) ||
    !Array.isArray(v.engines) ||
    !v.engines.length ||
    v.engines.length > 9 ||
    new Set(v.engines).size !== v.engines.length ||
    v.engines.some((e) => !engines.includes(e)) ||
    typeof v.idempotencyKey !== "string" ||
    !/^[a-zA-Z0-9_-]{8,128}$/.test(v.idempotencyKey) ||
    (v.branch !== undefined && !validGuardBranch(v.branch)) ||
    (v.commit !== undefined &&
      (typeof v.commit !== "string" || !/^[a-f0-9]{40}$/.test(v.commit)))
  )
    throw new LiveGuardError("invalid_input", 400);
  return v as ReturnType<typeof scanInput>;
}
export class GuardLiveService {
  constructor(
    private readonly storage: GuardStorage | undefined,
    readonly readiness: FoundationReadiness = defaultReadiness,
    private readonly product?: ProductAdmission,
    private readonly artifacts?: PostgresGuardArtifacts,
  ) {}
  capabilities() {
    return {
      repositoryScanning:
        this.product && this.storage ? "CONFIGURED" : "BLOCKED",
      reason: this.product
        ? null
        : "qualified_scanner_and_owner_session_broker_not_configured",
      operationalApprovalWindow: false,
    };
  }
  private store(
    authority: ProjectAuthority,
    operation: Grant["operations"][number],
  ) {
    authorize(authority.grant, authority.grant, operation);
    if (authority.grant.mode !== "live")
      throw new LiveGuardError("not_found", 404);
    if (
      !this.storage ||
      this.readiness.database !== "approved" ||
      this.readiness.schema !== "verified"
    )
      throw new LiveGuardError("approval_required");
    return this.storage;
  }
  async create(
    authority: ProjectAuthority,
    input: unknown,
    signal = new AbortController().signal,
  ) {
    scanInput(input);
    this.store(authority, "scan");
    if (this.product) return this.product.create(authority, input, signal);
    // Missing qualified production composition never accepts a scan.
    throw new LiveGuardError("execution_not_ready");
  }
  async resumeProduct(
    authority: ProjectAuthority,
    id: string,
    signal: AbortSignal,
  ) {
    this.store(authority, "scan");
    if (!this.product?.resume) throw new LiveGuardError("execution_not_ready");
    return this.product.resume(authority, id, signal);
  }
  async list(authority: ProjectAuthority, params: URLSearchParams) {
    if (
      [...params.keys()].some((k) => !["limit", "after"].includes(k)) ||
      ["limit", "after"].some((k) => params.getAll(k).length > 1)
    )
      throw new LiveGuardError("invalid_input", 400);
    const raw = params.get("limit") ?? "20",
      after = params.get("after") ?? undefined;
    if (
      !/^[1-9]\d?$/.test(raw) ||
      Number(raw) > 50 ||
      (after !== undefined && !/^[a-f0-9]{64}$/.test(after))
    )
      throw new LiveGuardError("invalid_input", 400);
    return this.store(authority, "read").list(
      authority.grant,
      authority.grant,
      Number(raw),
      after,
    );
  }
  async get(authority: ProjectAuthority, id: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new LiveGuardError("not_found", 404);
    const value = await this.store(authority, "read").get(
      authority.grant,
      authority.grant,
      id,
    );
    if (!value) throw new LiveGuardError("not_found", 404);
    return value;
  }
  async view(authority: ProjectAuthority, id: string) {
    return storedScanView(authority, await this.get(authority, id));
  }
  async triage(authority: ProjectAuthority, id: string, value: unknown) {
    this.store(authority, "triage");
    if (!this.artifacts) throw new LiveGuardError("not_configured");
    return this.artifacts.triage(authority.grant, authority.grant, id, value);
  }
  async createReport(authority: ProjectAuthority, id: string, value: unknown) {
    this.store(authority, "report");
    if (!this.artifacts) throw new LiveGuardError("not_configured");
    return this.artifacts.createReport(
      authority.grant,
      authority.grant,
      id,
      value,
    );
  }
  async reports(authority: ProjectAuthority, id: string) {
    this.store(authority, "report");
    if (!this.artifacts) throw new LiveGuardError("not_configured");
    return this.artifacts.reports(authority.grant, authority.grant, id);
  }
  async cancelProduct(authority: ProjectAuthority, id: string) {
    const current = await this.get(authority, id);
    requireOperationalJob(authority.grant, current.job);
    return this.cancel(authority, id);
  }
  async cancel(authority: ProjectAuthority, id: string) {
    const current = await this.get(authority, id);
    const store = this.store(authority, "scan") as GuardStorage & {
      cancel?: (grant: Grant, scope: Scope, id: string) => Promise<void>;
    };
    if (!store.cancel) throw new LiveGuardError("not_configured");
    if (
      ["completed", "completed_partial", "failed", "cancelled"].includes(
        current.job.status,
      )
    )
      return { status: current.job.status, cancelRequested: false };
    await store.cancel(authority.grant, authority.grant, current.job.id);
    const actual = await this.get(authority, id);
    return {
      status: actual.job.status,
      cancelRequested: actual.job.status === "cancelled",
    };
  }
}
/** Shared preparation metadata for review drafts and approved producer; scope/repository remain server-derived. */
export async function prepareAuthorizedScan(
  authority: ProjectAuthority,
  input: unknown,
  head: string,
) {
  const v = scanInput(input);
  if (
    !/^[a-f0-9]{40}$/.test(head) ||
    (v.commit !== undefined && v.commit !== head)
  )
    throw new LiveGuardError("revision_conflict", 409);
  return createJob(authority.grant, {
    mode: authority.grant.mode,
    workspaceId: authority.grant.workspaceId,
    projectId: authority.grant.projectId,
    repository: repositoryFor(authority, head),
    profile: v.profile,
    engines: v.engines,
    idempotencyKey: v.idempotencyKey,
  });
}
