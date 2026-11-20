import "server-only";
import type { PlatformDatabase } from "../../../platform/database";
import type { ProjectAuthority } from "../live/model";
import { remediationFinding } from "../live/product-remediation";
import { authorize } from "../security";
import {
  G03Error,
  emptyState,
  type G03Job,
  type G03State,
  type ProviderPlan,
  type Snapshot,
} from "./contracts";
import { isSha, safeValue } from "./safety";
import { fingerprint } from "../../../platform/identity";
import { evidenceIdentity } from "../live/product-remediation";
import { requireOperationalJob } from "../live/product-policy";

export interface StorePort {
  get(authority: ProjectAuthority, scanId: string): Promise<Snapshot>;
  change<T>(
    authority: ProjectAuthority,
    scanId: string,
    revision: number | null,
    operation: "triage" | "report",
    apply: (snapshot: Snapshot, state: G03State) => T,
    budget?: ProviderPlan,
  ): Promise<{ value: T; revision: number }>;
}
export function validateJob(authority: ProjectAuthority, job: G03Job) {
  authorize(authority.grant, job, "read");
  requireOperationalJob(authority.grant, job);
  if (
    job.repository.repositoryId !== authority.repositoryId ||
    job.projectId !== "github-" + authority.repositoryId ||
    job.mode !== "live" ||
    !["completed", "completed_partial"].includes(job.status)
  )
    throw new G03Error("scan_not_ready");
  for (const f of job.findings)
    remediationFinding(authority.grant, job, f.id, "read");
}
export function stateFor(job: G03Job) {
  const s = job.guardG03 ?? emptyState();
  if (
    s.version !== 1 ||
    !Array.isArray(s.proposals) ||
    s.proposals.length > 12 ||
    !Array.isArray(s.retests) ||
    s.retests.length > 24 ||
    !Array.isArray(s.reports) ||
    s.reports.length > 3 ||
    !Array.isArray(s.audit) ||
    s.audit.length > 250
  )
    throw new G03Error("stored_state_invalid", 503);
  for (const p of s.proposals) {
    if (
      p.version !== 1 ||
      !isSha(p.id, 64) ||
      !isSha(p.requestSha256, 64) ||
      !isSha(p.evidenceSha256, 64) ||
      p.baseCommit !== job.repository.commit ||
      !["reserved", "completed", "failed"].includes(p.state) ||
      !p.consent ||
      typeof p.consent.ai !== "boolean" ||
      typeof p.consent.source !== "boolean" ||
      (p.binding &&
        (p.binding.repositoryId !== job.repository.repositoryId ||
          p.binding.baseCommit !== job.repository.commit)) ||
      (p.patch &&
        (!isSha(p.patch.digest, 64) ||
          p.patch.sourceSha256 !== p.binding?.sourceSha256 ||
          p.patch.baseCommit !== job.repository.commit))
    )
      throw new G03Error("stored_state_invalid", 503);
    const finding = job.findings.find((f) => f.id === p.findingId);
    if (
      !finding ||
      evidenceIdentity(finding) !== p.evidenceSha256 ||
      (p.patch &&
        (!p.consent.source || !p.consent.ai || p.state !== "completed"))
    )
      throw new G03Error("stored_state_invalid", 503);
    if (p.patch) {
      const { digest, ...body } = p.patch;
      if (
        fingerprint(body) !== digest ||
        p.patch.path !== finding.location.path ||
        p.patch.repositoryId !== job.repository.repositoryId
      )
        throw new G03Error("stored_state_invalid", 503);
    }
    if (
      p.review &&
      (p.review.patchDigest !== p.patch?.digest ||
        !["approved", "rejected"].includes(p.review.decision))
    )
      throw new G03Error("stored_state_invalid", 503);
    if (
      p.pr &&
      (p.review?.decision !== "approved" ||
        p.pr.patchDigest !== p.patch?.digest ||
        !/^wetscan\/g03-[a-f0-9]{32}$/.test(p.pr.branch))
    )
      throw new G03Error("stored_state_invalid", 503);
  }
  for (const t of s.retests)
    if (
      t.beforeCommit !== job.repository.commit ||
      !s.proposals.some(
        (p) => p.id === t.proposalId && p.findingId === t.findingId,
      ) ||
      t.afterCommit === t.beforeCommit ||
      !isSha(t.afterCommit) ||
      !["fixed", "still_present", "inconclusive", "not_verified"].includes(
        t.outcome,
      ) ||
      t.verifiedFixed !== (t.evidenceOutcome === "verified_fixed") ||
      (t.verifiedFixed && t.outcome !== "fixed") ||
      (t.observations?.length ?? 0) > 20
    )
      throw new G03Error("stored_state_invalid", 503);
  for (const r of s.reports)
    if (
      r.id !== fingerprint(r.body) ||
      !Number.isFinite(Date.parse(r.expiresAt)) ||
      r.body.expiresAt !== r.expiresAt ||
      r.body.createdAt !== r.createdAt ||
      (r.body.provenance as { sourceRevision?: number })?.sourceRevision !==
        r.sourceRevision ||
      (
        r.body.scope as {
          mode?: string;
          workspaceId?: string;
          projectId?: string;
        }
      )?.mode !== "live" ||
      (r.body.scope as { workspaceId?: string })?.workspaceId !==
        job.workspaceId ||
      (r.body.scope as { projectId?: string })?.projectId !== job.projectId
    )
      throw new G03Error("stored_state_invalid", 503);
  return s;
}
/** Additive JSONB only; existing G02 tables, grants, FORCE RLS and queue lease discipline. */
export class PostgresG03Store implements StorePort {
  constructor(private readonly db: PlatformDatabase) {
    if (db.module !== "guard" || db.worker)
      throw new G03Error("not_configured", 503);
  }
  async get(authority: ProjectAuthority, scanId: string): Promise<Snapshot> {
    authorize(authority.grant, authority.grant, "read");
    if (!isSha(scanId, 64)) throw new G03Error("not_found", 404);
    return this.db.scoped(authority.grant, async (tx) => {
      const r = await this.db.query(
        tx,
        "SELECT job,revision,retention_until FROM guard.scans WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND scan_id=$4 AND retention_until>clock_timestamp()",
        [
          authority.grant.mode,
          authority.grant.workspaceId,
          authority.grant.projectId,
          scanId,
        ],
      );
      const row = r.rows[0];
      if (!row) throw new G03Error("not_found", 404);
      validateJob(authority, row.job);
      stateFor(row.job);
      return {
        job: row.job,
        revision: row.revision,
        retentionUntil: new Date(row.retention_until).toISOString(),
      };
    });
  }
  async change<T>(
    authority: ProjectAuthority,
    scanId: string,
    revision: number | null,
    operation: "triage" | "report",
    apply: (snapshot: Snapshot, state: G03State) => T,
    budget?: ProviderPlan,
  ) {
    authorize(authority.grant, authority.grant, operation);
    if (
      !isSha(scanId, 64) ||
      (revision !== null && (!Number.isSafeInteger(revision) || revision < 1))
    )
      throw new G03Error("invalid_input", 400);
    return this.db.scoped(authority.grant, async (tx) => {
      const g = authority.grant,
        k = [g.mode, g.workspaceId, g.projectId, scanId];
      // Cross-process/project budget serialization before row locks (consistent order).
      if (budget)
        await this.db.query(
          tx,
          "SELECT pg_advisory_xact_lock(hashtextextended($1,7342003))",
          [JSON.stringify(k.slice(0, 3))],
        );
      const queue = await this.db.query(
        tx,
        "SELECT kind,state,lease_owner,lease_token FROM platform.jobs WHERE module='guard' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND job_id=$4 FOR UPDATE",
        k,
      );
      const q = queue.rows[0];
      if (
        !q ||
        q.kind !== "guard.scan.repository" ||
        q.state !== "completed" ||
        q.lease_owner ||
        q.lease_token
      )
        throw new G03Error("scan_not_ready");
      const r = await this.db.query(
        tx,
        "SELECT job,revision,retention_until FROM guard.scans WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND scan_id=$4 AND retention_until>clock_timestamp() FOR UPDATE",
        k,
      );
      const row = r.rows[0];
      if (!row) throw new G03Error("not_found", 404);
      validateJob(authority, row.job);
      if (revision !== null && row.revision !== revision)
        throw new G03Error("revision_conflict");
      if (budget) {
        // Failed/unknown reservations are charged at the worst-case cost. No automatic retry/refund.
        const b = await this.db.query(
          tx,
          `SELECT count(*)::int AS requests, coalesce(sum((p->'consent'->'plan'->>'reservedMicroUsd')::bigint),0)::text AS cost, count(*) FILTER (WHERE p->>'actorId'=$4 AND (p->>'createdAt')::timestamptz>clock_timestamp()-interval '60 seconds')::int AS recent FROM guard.scans s CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.job->'guardG03'->'proposals','[]'::jsonb)) p WHERE s.mode=$1 AND s.workspace_id=$2 AND s.project_id=$3 AND p->'consent'->>'ai'='true' AND (p->>'createdAt')::timestamptz>clock_timestamp()-interval '24 hours'`,
          [g.mode, g.workspaceId, g.projectId, g.actorId],
        );
        const usage = b.rows[0];
        if (
          !usage ||
          usage.requests >= 20 ||
          usage.recent >= 1 ||
          Number(usage.cost) + budget.reservedMicroUsd > 500000
        )
          throw new G03Error("provider_budget_exhausted", 429);
      }
      const snapshot: Snapshot = {
        job: structuredClone(row.job),
        revision: row.revision,
        retentionUntil: new Date(row.retention_until).toISOString(),
      };
      const state = structuredClone(stateFor(snapshot.job));
      const value = apply(snapshot, state);
      snapshot.job.guardG03 = state;
      stateFor(snapshot.job);
      // Update only G03 data: original scanner findings/evidence/audit and historic G01 fields are immutable here.
      if (Buffer.byteLength(JSON.stringify(snapshot.job)) > 490000)
        throw new G03Error("storage_limit", 413);
      const updated = await this.db.query(
        tx,
        "UPDATE guard.scans SET job=jsonb_set(job,'{guardG03}',$6::jsonb,true),revision=revision+1,updated_at=clock_timestamp() WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND scan_id=$4 AND revision=$5",
        [...k, row.revision, JSON.stringify(state)],
      );
      if (updated.rowCount !== 1) throw new G03Error("revision_conflict");
      return { value: safeValue(value), revision: row.revision + 1 };
    });
  }
}
