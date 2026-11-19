import type { QueryResultRow } from "pg";
import type { Grant, ScanJob, Scope } from "../contracts";
import { PlatformDatabase } from "../../../platform/database";
import { fingerprint } from "../../../platform/identity";
import { authorize } from "../security";
import { triage } from "../pipeline";
import { report } from "../release";
import { LiveGuardError } from "./model";
import { requireOperationalJob, repositoryScanKind } from "./product-policy";
import { releasePolicy } from "./product-view";
export interface StoredGuardReport {
  id: string;
  createdAt: string;
  sourceRevision: number;
  body: ReturnType<typeof report>;
}
interface ArtifactJob extends ScanJob {
  guardReports?: StoredGuardReport[];
}
interface ArtifactRow extends QueryResultRow {
  job: ArtifactJob;
  revision: number;
}
export class PostgresGuardArtifacts {
  constructor(private readonly db: PlatformDatabase) {
    if (db.module !== "guard" || db.worker)
      throw new LiveGuardError("not_configured");
  }
  private async mutate<T>(
    grant: Grant,
    scope: Scope,
    id: string,
    revision: number,
    operation: "triage" | "report",
    apply: (job: ArtifactJob) => { value: T; job?: ArtifactJob },
  ) {
    authorize(grant, scope, operation);
    if (
      !/^[a-f0-9]{64}$/.test(id) ||
      !Number.isInteger(revision) ||
      revision < 1
    )
      throw new LiveGuardError("invalid_input", 400);
    return this.db.scoped(scope, async (tx) => {
      const k = [scope.mode, scope.workspaceId, scope.projectId, id];
      const queue = await this.db.query(
        tx,
        "SELECT kind,state,lease_owner,lease_token FROM platform.jobs WHERE module='guard' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND job_id=$4 FOR UPDATE",
        k,
      );
      const q = queue.rows[0];
      if (
        !q ||
        q.kind !== repositoryScanKind ||
        !["completed", "failed", "cancelled"].includes(q.state) ||
        q.lease_owner ||
        q.lease_token
      )
        throw new LiveGuardError("execution_not_ready", 409);
      const result = await this.db.query<ArtifactRow>(
        tx,
        "SELECT job,revision FROM guard.scans WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND scan_id=$4 AND retention_until>clock_timestamp() FOR UPDATE",
        k,
      );
      const row = result.rows[0];
      if (!row) throw new LiveGuardError("not_found", 404);
      if (
        row.job.findings.some(
          (f) =>
            f.mode !== "live" ||
            f.workspaceId !== scope.workspaceId ||
            f.projectId !== scope.projectId ||
            f.evidence.some(
              (e) => e.synthetic || e.commit !== row.job.repository.commit,
            ),
        )
      )
        throw new LiveGuardError("source_integrity");
      requireOperationalJob(grant, row.job);
      if (row.revision !== revision)
        throw new LiveGuardError("revision_conflict", 409);
      if (
        !["completed", "completed_partial", "failed", "cancelled"].includes(
          row.job.status,
        )
      )
        throw new LiveGuardError("execution_not_ready", 409);
      const change = apply(structuredClone(row.job));
      if (change.job) {
        if (Buffer.byteLength(JSON.stringify(change.job)) > 512000)
          throw new LiveGuardError("source_limit", 413);
        const updated = await this.db.query(
          tx,
          "UPDATE guard.scans SET job=$6::jsonb,revision=revision+1,updated_at=clock_timestamp() WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND scan_id=$4 AND revision=$5",
          [...k, revision, JSON.stringify(change.job)],
        );
        if (updated.rowCount !== 1)
          throw new LiveGuardError("revision_conflict", 409);
      }
      return change.value;
    });
  }
  async triage(grant: Grant, scope: Scope, id: string, input: unknown) {
    const v = input as {
      revision: number;
      findingId: string;
      status:
        | "under_review"
        | "fix_pending_retest"
        | "false_positive"
        | "risk_accepted";
      reason: string;
    };
    if (
      !v ||
      Object.keys(v).sort().join() !== "findingId,reason,revision,status" ||
      typeof v.findingId !== "string" ||
      typeof v.reason !== "string" ||
      ![
        "under_review",
        "fix_pending_retest",
        "false_positive",
        "risk_accepted",
      ].includes(v.status)
    )
      throw new LiveGuardError("invalid_input", 400);
    return this.mutate(grant, scope, id, v.revision, "triage", (job) => {
      const target = job.findings.find((f) => f.id === v.findingId);
      if (!target) throw new LiveGuardError("not_found", 404);
      const changed = triage(grant, target, v.status, v.reason);
      job.findings = job.findings.map((f) =>
        f.id === target.id ? changed.finding : f,
      );
      job.audit.push(changed.audit);
      return {
        job,
        value: {
          findingId: target.id,
          status: changed.finding.status,
          revision: v.revision + 1,
        },
      };
    });
  }
  async createReport(grant: Grant, scope: Scope, id: string, input: unknown) {
    const v = input as { revision: number };
    if (!v || Object.keys(v).join() !== "revision")
      throw new LiveGuardError("invalid_input", 400);
    return this.mutate(grant, scope, id, v.revision, "report", (job) => {
      const body = report(
        grant,
        job,
        releasePolicy({ job, revision: v.revision, coverage: null }),
      );
      const key = fingerprint({ body, sourceRevision: v.revision });
      const artifact: StoredGuardReport = {
        id: key,
        createdAt: new Date().toISOString(),
        sourceRevision: v.revision,
        body,
      };
      if ((job.guardReports?.length ?? 0) >= 3)
        throw new LiveGuardError("source_limit", 413);
      job.guardReports = [...(job.guardReports ?? []), artifact];
      job.audit.push({
        actorId: grant.actorId,
        at: artifact.createdAt,
        action: "report_created",
        subjectId: key,
        reason:
          "Persisted exact-revision Guard report; evaluation only, no deployment enforcement.",
      });
      return {
        job,
        value: {
          reportId: key,
          revision: v.revision + 1,
          createdAt: artifact.createdAt,
        },
      };
    });
  }
  async reports(grant: Grant, scope: Scope, id: string) {
    authorize(grant, scope, "report");
    if (!/^[a-f0-9]{64}$/.test(id)) throw new LiveGuardError("not_found", 404);
    return this.db.scoped(scope, async (tx) => {
      const rows = await this.db.query<ArtifactRow>(
        tx,
        "SELECT job,revision FROM guard.scans WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND scan_id=$4 AND retention_until>clock_timestamp()",
        [scope.mode, scope.workspaceId, scope.projectId, id],
      );
      const row = rows.rows[0];
      if (!row) throw new LiveGuardError("not_found", 404);
      requireOperationalJob(grant, row.job);
      const reports = row.job.guardReports ?? [];
      if (
        reports.length > 3 ||
        reports.some(
          (r) =>
            !/^[a-f0-9]{64}$/.test(r.id) ||
            r.body.scope.mode !== "live" ||
            r.body.scope.workspaceId !== scope.workspaceId ||
            r.body.scope.projectId !== scope.projectId ||
            r.body.findings.some((f) => f.evidence.some((e) => e.synthetic)),
        )
      )
        throw new LiveGuardError("source_integrity");
      return reports;
    });
  }
}
