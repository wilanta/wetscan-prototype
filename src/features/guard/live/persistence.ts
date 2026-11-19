import type { QueryResultRow } from "pg";
import { PlatformDatabase } from "../../../platform/database";
import { fingerprint } from "../../../platform/identity";
import type { Grant, PersistencePort, ScanJob, Scope } from "../contracts";
import { authorize, redact, safePath } from "../security";
import { transition } from "../pipeline";
import { GuardPostgresQueue } from "./queue";
import { operationalJob, repositoryScanKind } from "./product-policy";
import {
  LiveGuardError,
  type GuardStorage,
  type LeaseFence,
  type SourceCoverage,
  type StoredScan,
  type ScanSummary,
} from "./model";
interface ScanRow extends QueryResultRow {
  job: ScanJob;
  revision: number;
  coverage: SourceCoverage | null;
  fingerprint: string;
}
function key(scope: Scope) {
  return [scope.mode, scope.workspaceId, scope.projectId];
}
function immutable(job: ScanJob) {
  return fingerprint({
    scope: key(job),
    repository: job.repository,
    profile: job.profile,
    engines: job.requestedEngines,
    idempotencyKey: job.idempotencyKey,
  });
}
function bounded(job: ScanJob): ScanJob {
  if (
    job.mode !== "live" ||
    job.projectId !== `github-${job.repository.repositoryId}` ||
    job.repository.provider !== "github" ||
    !/^[a-f0-9]{40}$/.test(job.repository.commit) ||
    !/^[a-f0-9]{64}$/.test(job.id) ||
    job.findings.length > 1000 ||
    job.audit.length > 1000 ||
    job.runs.length > 9
  )
    throw new LiveGuardError("invalid_input", 400);
  if (
    operationalJob(job) &&
    job.runs.some(
      (r) =>
        r.status === "completed" &&
        (!/^[a-f0-9]{64}$/.test(r.artifactDigest ?? "") ||
          r.executionEvidence?.cleanup !== "VERIFIED"),
    )
  )
    throw new LiveGuardError("source_integrity");
  const copy: ScanJob = structuredClone({
    mode: job.mode,
    workspaceId: job.workspaceId,
    projectId: job.projectId,
    id: job.id,
    idempotencyKey: job.idempotencyKey,
    requestedEngines: job.requestedEngines,
    repository: job.repository,
    profile: job.profile,
    status: job.status,
    createdAt: job.createdAt,
    ...(job.finishedAt ? { finishedAt: job.finishedAt } : {}),
    ...(job.sourceCoverage ? { sourceCoverage: job.sourceCoverage } : {}),
    ...(job.inventory
      ? {
          inventory: job.inventory.map((item) => {
            safePath(item.sourcePath);
            if (
              !item.name ||
              !item.version ||
              item.ecosystem !== "npm" ||
              item.name.length > 512 ||
              item.version.length > 128
            )
              throw new LiveGuardError("invalid_input", 400);
            return {
              ...item,
              name: redact(item.name),
              version: redact(item.version),
              license: item.license ? redact(item.license) : null,
            };
          }),
        }
      : {}),
    runs: job.runs,
    findings: job.findings,
    audit: job.audit,
  });
  copy.audit = copy.audit.map((a) => ({ ...a, reason: redact(a.reason) }));
  copy.runs = copy.runs.map((r) => ({ ...r, reason: redact(r.reason) }));
  copy.findings = copy.findings.map((f) => {
    if (
      f.mode !== copy.mode ||
      f.workspaceId !== copy.workspaceId ||
      f.projectId !== copy.projectId ||
      f.evidence.length > 20 ||
      f.evidence.some((e) => e.synthetic)
    )
      throw new LiveGuardError("invalid_input", 400);
    return {
      ...f,
      title: redact(f.title),
      evidence: f.evidence.map((e) => ({ ...e, summary: redact(e.summary) })),
    };
  });
  if (Buffer.byteLength(JSON.stringify(copy)) > 512000)
    throw new LiveGuardError("invalid_input", 413);
  return copy;
}
function stored(row: ScanRow): StoredScan {
  return {
    job: row.job,
    revision: Number(row.revision),
    coverage: row.coverage,
  };
}
export class PostgresGuardStore implements GuardStorage {
  constructor(
    readonly db: PlatformDatabase,
    private readonly queueKind:
      "guard.scan.prepare" | "guard.scan.repository" = "guard.scan.prepare",
  ) {
    if (db.module !== "guard") throw new LiveGuardError("not_configured");
  }
  private allowed(
    grant: Grant,
    scope: Scope,
    operation: Grant["operations"][number],
  ) {
    authorize(grant, scope, operation);
    if (scope.mode !== "live") throw new LiveGuardError("not_found", 404);
  }
  /** Scan metadata and durable queue admission commit or roll back together. */
  async create(grant: Grant, input: ScanJob): Promise<StoredScan> {
    this.allowed(grant, input, "scan");
    const job = bounded(input);
    if (this.queueKind === repositoryScanKind && !operationalJob(job))
      throw new LiveGuardError("invalid_input", 400);
    if (job.status !== "queued") throw new LiveGuardError("invalid_input", 400);
    return this.db.scoped(job, async (tx) => {
      await this.db.query(
        tx,
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [fingerprint([...key(job), "guard-project-admission"])],
      );
      const found = await this.db.query<ScanRow>(
        tx,
        "SELECT job,revision,coverage,fingerprint FROM guard.scans WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND idempotency_key=$4 FOR UPDATE",
        [...key(job), job.idempotencyKey],
      );
      if (found.rows[0]) {
        if (found.rows[0].fingerprint !== immutable(job))
          throw new LiveGuardError("revision_conflict", 409);
        return stored(found.rows[0]);
      }
      const inserted = await this.db.query<ScanRow>(
        tx,
        `INSERT INTO guard.scans(mode,workspace_id,project_id,scan_id,idempotency_key,fingerprint,repository_id,commit_sha,status,job,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) RETURNING job,revision,coverage,fingerprint`,
        [
          ...key(job),
          job.id,
          job.idempotencyKey,
          immutable(job),
          job.repository.repositoryId,
          job.repository.commit,
          job.status,
          JSON.stringify(job),
          job.createdAt,
        ],
      );
      await new GuardPostgresQueue(this.db, job, job.id, {
        kind: this.queueKind,
      }).enqueue(tx, {
        ...job,
        schemaVersion: 1,
        module: "guard",
        jobId: job.id,
        kind: this.queueKind,
        subjectRef: job.id,
        revision: 1,
        attempts: 0,
        maxAttempts: this.queueKind === repositoryScanKind ? 1 : 3,
        availableAt: job.createdAt,
        cancelRequested: false,
      });
      return stored(inserted.rows[0]);
    });
  }
  async get(
    grant: Grant,
    scope: Scope,
    id: string,
  ): Promise<StoredScan | null> {
    this.allowed(grant, scope, "read");
    if (!/^[a-f0-9]{64}$/.test(id)) throw new LiveGuardError("not_found", 404);
    return this.db.scoped(scope, async (tx) => {
      const r = await this.db.query<ScanRow>(
        tx,
        "SELECT job,revision,coverage,fingerprint FROM guard.scans WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND scan_id=$4 AND retention_until>clock_timestamp()",
        [...key(scope), id],
      );
      return r.rows[0] ? stored(r.rows[0]) : null;
    });
  }
  async list(
    grant: Grant,
    scope: Scope,
    limit: number,
    after?: string,
  ): Promise<ScanSummary[]> {
    this.allowed(grant, scope, "read");
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      (after !== undefined && !/^[a-f0-9]{64}$/.test(after))
    )
      throw new LiveGuardError("invalid_input", 400);
    return this.db.scoped(scope, async (tx) => {
      const rows = await this.db.query(
        tx,
        "SELECT scan_id,status,job->'repository' AS repository,created_at,job->>'finishedAt' AS finished_at,job->'sourceCoverage' AS source_coverage,revision FROM guard.scans WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND retention_until>clock_timestamp() AND ($4::text IS NULL OR scan_id>$4) ORDER BY scan_id LIMIT $5",
        [...key(scope), after ?? null, limit],
      );
      return rows.rows.map((row) => ({
        id: String(row.scan_id),
        status: row.status as ScanJob["status"],
        repository: {
          provider: "github" as const,
          repositoryId: String(row.repository.repositoryId),
          branch: String(row.repository.branch),
          commit: String(row.repository.commit),
        },
        createdAt: new Date(row.created_at).toISOString(),
        ...(row.finished_at ? { finishedAt: String(row.finished_at) } : {}),
        ...(row.source_coverage
          ? { sourceCoverage: row.source_coverage as ScanJob["sourceCoverage"] }
          : {}),
        revision: Number(row.revision),
      }));
    });
  }
  async update(
    grant: Grant,
    input: ScanJob,
    revision: number,
    fence?: LeaseFence,
    coverage?: SourceCoverage,
  ): Promise<StoredScan> {
    this.allowed(grant, input, "scan");
    const job = bounded(input);
    if (!Number.isInteger(revision) || revision < 1)
      throw new LiveGuardError("invalid_input", 400);
    return this.db.scoped(job, async (tx) => {
      // Lock/validate the live lease in the SAME transaction as every result write. Heartbeats may change queue revision; token + owner remain stable.
      if (this.db.worker) {
        if (!fence) throw new LiveGuardError("lease_lost", 409);
        const active = await this.db.query(
          tx,
          "SELECT job_id FROM platform.jobs WHERE module='guard' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND job_id=$4 AND lease_owner=$5 AND lease_token=$6 AND lease_until>clock_timestamp() AND state='leased' AND NOT cancel_requested FOR UPDATE",
          [...key(job), job.id, fence.workerId, fence.leaseToken],
        );
        if (!active.rowCount) throw new LiveGuardError("lease_lost", 409);
      } else if (!["cancelled"].includes(job.status))
        throw new LiveGuardError("lease_lost", 409);
      const old = await this.db.query<ScanRow>(
        tx,
        "SELECT job,revision,coverage,fingerprint FROM guard.scans WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND scan_id=$4 FOR UPDATE",
        [...key(job), job.id],
      );
      if (
        !old.rows[0] ||
        old.rows[0].revision !== revision ||
        old.rows[0].fingerprint !== immutable(job)
      )
        throw new LiveGuardError("revision_conflict", 409);
      const before = old.rows[0].job;
      if (
        job.audit.length < before.audit.length ||
        fingerprint(job.audit.slice(0, before.audit.length)) !==
          fingerprint(before.audit)
      )
        throw new LiveGuardError("revision_conflict", 409);
      for (const finding of before.findings) {
        const key = (f: ScanJob["findings"][number]) =>
          fingerprint([f.id, f.source, f.severity, f.location]);
        const next = job.findings.find((f) => key(f) === key(finding));
        if (
          !next ||
          finding.evidence.some(
            (e) =>
              !next.evidence.some(
                (current) =>
                  current.id === e.id &&
                  fingerprint(current) === fingerprint(e),
              ),
          )
        )
          throw new LiveGuardError("revision_conflict", 409);
      }
      if (old.rows[0].job.status !== job.status)
        transition(old.rows[0].job, job.status, grant.actorId);
      const currentCoverage = coverage ?? old.rows[0].coverage;
      if (currentCoverage)
        job.sourceCoverage = {
          status: currentCoverage.status,
          retrievedFiles: currentCoverage.retrievedFiles,
          excludedFiles: currentCoverage.exclusions.length,
          treeTruncated: currentCoverage.treeTruncated,
        };
      if (coverage && Buffer.byteLength(JSON.stringify(coverage)) > 2000000)
        throw new LiveGuardError("invalid_input", 413);
      const rows = await this.db.query<ScanRow>(
        tx,
        "UPDATE guard.scans SET job=$6::jsonb,status=$7,coverage=COALESCE($8::jsonb,coverage),revision=revision+1,updated_at=clock_timestamp() WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND scan_id=$4 AND revision=$5 RETURNING job,revision,coverage,fingerprint",
        [
          ...key(job),
          job.id,
          revision,
          JSON.stringify(job),
          job.status,
          coverage ? JSON.stringify(coverage) : null,
        ],
      );
      if (!rows.rows[0]) throw new LiveGuardError("revision_conflict", 409);
      return stored(rows.rows[0]);
    });
  }
  async cancel(grant: Grant, scope: Scope, id: string): Promise<void> {
    this.allowed(grant, scope, "scan");
    if (!/^[a-f0-9]{64}$/.test(id)) throw new LiveGuardError("not_found", 404);
    await this.db.scoped(scope, async (tx) => {
      await this.db.query(
        tx,
        "SELECT job_id FROM platform.jobs WHERE module='guard' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND job_id=$4 FOR UPDATE",
        [...key(scope), id],
      );
      const rows = await this.db.query<ScanRow>(
        tx,
        "SELECT job,revision,coverage,fingerprint FROM guard.scans WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND scan_id=$4 FOR UPDATE",
        [...key(scope), id],
      );
      if (!rows.rows[0]) throw new LiveGuardError("not_found", 404);
      if (
        ["completed", "completed_partial", "failed", "cancelled"].includes(
          rows.rows[0].job.status,
        )
      )
        return;
      const job = transition(rows.rows[0].job, "cancelled", grant.actorId);
      await this.db.query(
        tx,
        "UPDATE platform.jobs SET state='cancelled',cancel_requested=true,finished_at=clock_timestamp(),lease_owner=NULL,lease_token=NULL,lease_until=NULL,revision=revision+1 WHERE module='guard' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND job_id=$4 AND state IN ('queued','leased')",
        [...key(scope), id],
      );
      await this.db.query(
        tx,
        "UPDATE platform.job_attempts SET outcome='cancelled',finished_at=clock_timestamp() WHERE module='guard' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND job_id=$4 AND finished_at IS NULL",
        [...key(scope), id],
      );
      await this.db.query(
        tx,
        "UPDATE guard.scans SET status='cancelled',job=$5::jsonb,revision=revision+1,updated_at=clock_timestamp() WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND scan_id=$4 AND retention_until>clock_timestamp()",
        [...key(scope), id, JSON.stringify(job)],
      );
    });
  }
  /** Compatible orchestrator port: keep revision private and bind every save to this lease. */
  persistence(
    fence: LeaseFence,
    sourceCoverage?: () => SourceCoverage | undefined,
  ): PersistencePort {
    const revisions = new Map<string, number>();
    return {
      create: async (g, j) => {
        const value = await this.create(g, j);
        revisions.set(j.id, value.revision);
        return value.job;
      },
      get: async (g, s, id) => {
        const value = await this.get(g, s, id);
        if (value) revisions.set(id, value.revision);
        return value?.job ?? null;
      },
      save: async (g, j) => {
        const rev = revisions.get(j.id);
        if (!rev) throw new LiveGuardError("revision_conflict", 409);
        const value = await this.update(g, j, rev, fence, sourceCoverage?.());
        revisions.set(j.id, value.revision);
      },
    };
  }
}
