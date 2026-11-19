import type { ScanJob } from "../contracts";
import { createJob } from "../pipeline";
import { orderedRepositoryEngines } from "./scan-profiles";
import { authorize } from "../security";
import {
  LiveGuardError,
  type GuardStorage,
  type ProjectAuthority,
  type SourceAccess,
} from "./model";
import { scanInput } from "./service";
import {
  requireOperationalJob,
  validateProductPolicy,
  type RepositoryScanPolicy,
} from "./product-policy";

export interface ProductAdmission {
  readonly imageReference?: string;
  readonly allowedEngines?: readonly import("../contracts").Engine[];
  resume?(
    authority: ProjectAuthority,
    id: string,
    signal: AbortSignal,
  ): Promise<{
    scanId: string;
    status: "queued";
    execution: "repository_scan";
    scannerExecution: "QUEUED";
  }>;
  create(
    authority: ProjectAuthority,
    input: unknown,
    signal: AbortSignal,
  ): Promise<{
    scanId: string;
    status: ScanJob["status"];
    execution: "repository_scan";
    scannerExecution: "QUEUED" | "RECORDED";
  }>;
}
/** Source/qualification implementations are server-owned; no client scope, token, image or command enters here. */
export function repositoryAdmission(input: {
  storage: GuardStorage;
  source(branch: string, commit: string): SourceAccess;
  policy: RepositoryScanPolicy;
  verifyReady(): Promise<void>;
  onQueued?(job: ScanJob): Promise<void>;
}): ProductAdmission {
  return {
    allowedEngines: [...input.policy.engines],
    imageReference: input.policy.image?.reference,
    async resume(authority, id, signal) {
      await input.verifyReady();
      const stored = await input.storage.get(
        authority.grant,
        authority.grant,
        id,
      );
      if (!stored) throw new LiveGuardError("not_found", 404);
      const job = stored.job;
      requireOperationalJob(authority.grant, job);
      validateProductPolicy(input.policy, job);
      if (
        job.status !== "queued" ||
        job.audit[0]?.actorId !== authority.grant.actorId ||
        signal.aborted
      )
        throw new LiveGuardError("execution_not_ready");
      const source = input.source(job.repository.branch, job.repository.commit),
        a = await source.authorize();
      authorize(a.grant, job, "scan");
      if (
        a.grant.actorId !== authority.grant.actorId ||
        a.repositoryId !== authority.repositoryId ||
        a.installationId !== authority.installationId ||
        a.branch !== job.repository.branch
      )
        throw new LiveGuardError("not_found", 404);
      const lease = await source.open(a, signal);
      try {
        if ((await lease.head(signal)).commit !== job.repository.commit)
          throw new LiveGuardError("revision_conflict", 409);
      } finally {
        await lease.close();
      }
      const fresh = await source.authorize();
      authorize(fresh.grant, job, "scan");
      if (
        fresh.grant.actorId !== a.grant.actorId ||
        fresh.installationId !== a.installationId ||
        fresh.repositoryId !== a.repositoryId ||
        fresh.branch !== a.branch ||
        signal.aborted
      )
        throw new LiveGuardError("not_found", 404);
      await input.verifyReady();
      if (!input.onQueued) throw new LiveGuardError("execution_not_ready");
      await input.onQueued(job);
      return {
        scanId: job.id,
        status: "queued",
        execution: "repository_scan",
        scannerExecution: "QUEUED",
      };
    },
    async create(authority, value, signal) {
      const v = scanInput(value);
      // Reject unsupported engines before canonicalizing their order.
      if (v.engines.some((e) => !input.policy.engines.includes(e as never)))
        throw new LiveGuardError("execution_not_ready");
      v.engines = orderedRepositoryEngines(v.engines);
      if (!v.commit || !v.branch || signal.aborted)
        throw new LiveGuardError("invalid_input", 400);
      const draft = {
        mode: authority.grant.mode,
        workspaceId: authority.grant.workspaceId,
        projectId: authority.grant.projectId,
        repository: {
          provider: "github" as const,
          repositoryId: authority.repositoryId,
          branch: v.branch,
          commit: v.commit,
        },
        requestedEngines: v.engines,
        idempotencyKey: v.idempotencyKey,
      };
      validateProductPolicy(input.policy, draft);
      authorize(authority.grant, authority.grant, "scan");
      // Qualification failure precedes provider access, persistence and queue admission.
      await input.verifyReady();
      const source = input.source(v.branch, v.commit),
        current = await source.authorize();
      const same = (a: ProjectAuthority) => {
        authorize(a.grant, authority.grant, "scan");
        if (
          a.grant.actorId !== authority.grant.actorId ||
          a.repositoryId !== authority.repositoryId ||
          a.installationId !== authority.installationId ||
          a.branch !== v.branch
        )
          throw new LiveGuardError("not_found", 404);
      };
      same(current);
      const lease = await source.open(current, signal);
      try {
        const head = await lease.head(signal);
        if (head.commit !== v.commit)
          throw new LiveGuardError("revision_conflict", 409);
      } finally {
        await lease.close();
      }
      const fresh = await source.authorize();
      same(fresh);
      await input.verifyReady();
      if (signal.aborted) throw new LiveGuardError("source_unavailable");
      const job = await createJob(fresh.grant, {
        ...draft,
        engines: v.engines,
        profile: v.profile,
      });
      job.runs = job.runs.map((r) =>
        job.requestedEngines.includes(r.engine)
          ? {
              ...r,
              status: "queued",
              reason:
                "Qualified operational engine queued; no execution result yet.",
            }
          : r,
      );
      job.audit.push({
        actorId: fresh.grant.actorId,
        at: new Date().toISOString(),
        action: "repository_scan_requested",
        subjectId: job.id,
        reason:
          "Authorized pinned repository scan; policy " +
          input.policy.id +
          "; no source execution.",
      });
      const stored = await input.storage.create(fresh.grant, job);
      if (stored.job.status === "queued") await input.onQueued?.(stored.job);
      return {
        scanId: stored.job.id,
        status: stored.job.status,
        execution: "repository_scan",
        scannerExecution:
          stored.job.status === "queued" ? "QUEUED" : "RECORDED",
      };
    },
  };
}
