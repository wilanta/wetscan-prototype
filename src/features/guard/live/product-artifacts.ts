import type { QueryResultRow } from "pg";
import type { Grant, ScanJob, Scope } from "../contracts";
import { PlatformDatabase } from "../../../platform/database";
import { fingerprint } from "../../../platform/identity";
import { authorize, redact } from "../security";
import {
  remediationFinding,
  evidenceIdentity,
  validateAdvice,
  compareRecordedRetest,
  type RemediationAdvice,
  type RemediationRecord,
} from "./product-remediation";
import { integrationBundle } from "./product-integrations";
import { triage } from "../pipeline";
import { report } from "../release";
import { LiveGuardError } from "./model";
import { requireOperationalJob, repositoryScanKind } from "./product-policy";
import { releasePolicy } from "./product-view";
export interface StoredGuardReport {
  id: string;
  createdAt: string;
  sourceRevision: number;
  body: ReturnType<typeof report> & {
    remediation?: RemediationRecord[];
    retests?: ReturnType<typeof compareRecordedRetest>[];
    integrations?: Pick<
      ReturnType<typeof integrationBundle>,
      "id" | "source" | "delivery" | "acknowledged"
    >[];
  };
}
interface ArtifactJob extends ScanJob {
  guardRemediation?: RemediationRecord[];
  guardRetests?: ReturnType<typeof compareRecordedRetest>[];
  guardIntegrationBundles?: ReturnType<typeof integrationBundle>[];
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
      this.analysis(grant, row.job, row.revision);
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
  private analysis(grant: Grant, job: ArtifactJob, revision: number) {
    const proposals = job.guardRemediation ?? [];
    if (
      proposals.length > 3 ||
      proposals.some(
        (p) =>
          p.version !== 1 ||
          p.baseCommit !== job.repository.commit ||
          !/^[a-f0-9]{64}$/.test(p.id) ||
          !["reserved", "completed", "failed"].includes(p.state) ||
          !["pending", "approved", "rejected"].includes(p.review) ||
          p.untrusted !== true ||
          p.patchApplied !== false ||
          p.retest !== "NOT_EXECUTED" ||
          typeof p.aiConsent !== "boolean",
      )
    )
      throw new LiveGuardError("source_integrity");
    for (const p of proposals) {
      if (
        Object.keys(p).some(
          (k) =>
            ![
              "version",
              "id",
              "findingId",
              "baseCommit",
              "evidenceSha256",
              "requestKey",
              "aiConsent",
              "actorId",
              "createdAt",
              "state",
              "source",
              "advice",
              "provider",
              "failure",
              "review",
              "reviewedBy",
              "reviewedAt",
              "reviewReason",
              "untrusted",
              "patchApplied",
              "retest",
            ].includes(k),
        )
      )
        throw new LiveGuardError("source_integrity");
      const finding = remediationFinding(grant, job, p.findingId, "read");
      if (p.evidenceSha256 !== evidenceIdentity(finding))
        throw new LiveGuardError("source_integrity");
      if (p.state === "completed" && !p.advice)
        throw new LiveGuardError("source_integrity");
      if (
        p.provider &&
        (Object.keys(p.provider).sort().join() !== "model,name,promptVersion" ||
          Object.values(p.provider).some(
            (v) => typeof v !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(v),
          ))
      )
        throw new LiveGuardError("source_integrity");
      if (
        p.reviewReason !== undefined &&
        (typeof p.reviewReason !== "string" || p.reviewReason.length > 500)
      )
        throw new LiveGuardError("source_integrity");
      if (p.advice) validateAdvice(p.advice);
    }
    const retests = job.guardRetests ?? [],
      bundles = job.guardIntegrationBundles ?? [];
    if (
      retests.length > 10 ||
      retests.some(
        (r) =>
          r.verifiedFixed !== false ||
          !["reproduced", "not_detected", "inconclusive"].includes(r.outcome) ||
          r.beforeCommit !== job.repository.commit,
      )
    )
      throw new LiveGuardError("source_integrity");
    if (
      bundles.length > 3 ||
      bundles.some(
        (b) =>
          b.acknowledged !== false ||
          b.source.workspaceId !== job.workspaceId ||
          b.source.projectId !== job.projectId ||
          b.source.commit !== job.repository.commit ||
          Object.values(b.delivery).some(
            (v) => v !== "PENDING_CONSUMER_NOT_CONFIGURED",
          ),
      )
    )
      throw new LiveGuardError("source_integrity");
    return {
      revision: revision,
      proposals: proposals.map((p) => ({
        ...p,
        ...(p.advice ? { advice: validateAdvice(p.advice) } : {}),
        ...(p.reviewReason ? { reviewReason: redact(p.reviewReason) } : {}),
      })),
      retests: retests.map((r) => ({
        version: r.version,
        findingId: r.findingId,
        beforeScanId: r.beforeScanId,
        afterScanId: r.afterScanId,
        beforeCommit: r.beforeCommit,
        afterCommit: r.afterCommit,
        engine: r.engine,
        engineArtifactSha256: r.engineArtifactSha256,
        outcome: r.outcome,
        verifiedFixed: false as const,
        reason: r.reason,
        recordedAt: r.recordedAt,
      })),
      bundles: bundles.map((b) => ({
        id: b.id,
        source: {
          provider: b.source.provider,
          repositoryId: b.source.repositoryId,
          commit: b.source.commit,
          scanId: b.source.scanId,
          workspaceId: b.source.workspaceId,
          projectId: b.source.projectId,
          mode: b.source.mode,
        },
        delivery: {
          canvas: b.delivery.canvas,
          intelligence: b.delivery.intelligence,
          sentinel: b.delivery.sentinel,
        },
        acknowledged: false as const,
      })),
    };
  }
  async extensions(grant: Grant, scope: Scope, id: string) {
    authorize(grant, scope, "read");
    if (!/^[a-f0-9]{64}$/.test(id)) throw new LiveGuardError("not_found", 404);
    return this.db.scoped(scope, async (tx) => {
      const r = await this.db.query<ArtifactRow>(
        tx,
        "SELECT job,revision FROM guard.scans WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND scan_id=$4 AND retention_until>clock_timestamp()",
        [scope.mode, scope.workspaceId, scope.projectId, id],
      );
      const row = r.rows[0];
      if (!row) throw new LiveGuardError("not_found", 404);
      requireOperationalJob(grant, row.job);
      return this.analysis(grant, row.job, row.revision);
    });
  }
  async reserveAdvice(grant: Grant, scope: Scope, id: string, input: unknown) {
    const v = input as {
      revision: number;
      findingId: string;
      requestKey: string;
      aiConsent: boolean;
    };
    if (
      !v ||
      Object.keys(v).sort().join() !==
        "aiConsent,findingId,requestKey,revision" ||
      typeof v.findingId !== "string" ||
      !/^g03-[A-Za-z0-9_-]{8,80}$/.test(v.requestKey) ||
      typeof v.aiConsent !== "boolean"
    )
      throw new LiveGuardError("invalid_input", 400);
    return this.mutate(grant, scope, id, v.revision, "triage", (job) => {
      const finding = remediationFinding(grant, job, v.findingId);
      const records = job.guardRemediation ?? [];
      const identity = evidenceIdentity(finding);
      const existing = records.find((p) => p.requestKey === v.requestKey);
      if (existing) {
        if (
          existing.findingId !== v.findingId ||
          existing.aiConsent !== v.aiConsent ||
          existing.evidenceSha256 !== identity
        )
          throw new LiveGuardError("revision_conflict", 409);
        return {
          value: {
            record: existing,
            finding,
            reused: true,
            revision: v.revision,
          },
        };
      }
      if (records.length >= 3) throw new LiveGuardError("source_limit", 429);
      const record: RemediationRecord = {
        version: 1,
        id: fingerprint({
          scanId: id,
          requestKey: v.requestKey,
          findingId: v.findingId,
          evidenceSha256: identity,
          aiConsent: v.aiConsent,
        }),
        findingId: v.findingId,
        baseCommit: job.repository.commit,
        evidenceSha256: identity,
        requestKey: v.requestKey,
        aiConsent: v.aiConsent,
        actorId: grant.actorId,
        createdAt: new Date().toISOString(),
        state: "reserved",
        source: v.aiConsent ? "provider" : "deterministic",
        review: "pending",
        untrusted: true,
        patchApplied: false,
        retest: "NOT_EXECUTED",
      };
      job.guardRemediation = [...records, record];
      job.audit.push({
        actorId: grant.actorId,
        at: record.createdAt,
        action: "remediation_reserved",
        subjectId: record.id,
        reason: v.aiConsent
          ? "Owner consented to rule metadata only; reserved one bounded provider request."
          : "Deterministic advice; no external provider.",
      });
      return {
        job,
        value: { record, finding, reused: false, revision: v.revision + 1 },
      };
    });
  }
  async finishAdvice(
    grant: Grant,
    scope: Scope,
    id: string,
    revision: number,
    recordId: string,
    result: {
      advice: RemediationAdvice;
      provider?: NonNullable<RemediationRecord["provider"]>;
    } | null,
  ) {
    return this.mutate(grant, scope, id, revision, "triage", (job) => {
      const record = job.guardRemediation?.find((p) => p.id === recordId);
      if (
        !record ||
        record.state !== "reserved" ||
        record.actorId !== grant.actorId
      )
        throw new LiveGuardError("revision_conflict", 409);
      if (
        evidenceIdentity(remediationFinding(grant, job, record.findingId)) !==
        record.evidenceSha256
      )
        throw new LiveGuardError("source_integrity");
      if (result) {
        if (!!result.provider !== record.aiConsent)
          throw new LiveGuardError("source_integrity");
        record.advice = validateAdvice(result.advice);
        record.provider = result.provider;
        record.state = "completed";
      } else {
        record.state = "failed";
        record.failure = "provider_unavailable";
      }
      job.audit.push({
        actorId: grant.actorId,
        at: new Date().toISOString(),
        action: "remediation_" + record.state,
        subjectId: record.id,
        reason:
          "Advice only; no patch applied, GitHub write or verified fix. No automatic provider retry.",
      });
      return {
        job,
        value: { recordId, revision: revision + 1, state: record.state },
      };
    });
  }
  async reviewAdvice(grant: Grant, scope: Scope, id: string, input: unknown) {
    const v = input as {
      revision: number;
      proposalId: string;
      decision: "approved" | "rejected";
      reason: string;
    };
    if (
      !v ||
      Object.keys(v).sort().join() !== "decision,proposalId,reason,revision" ||
      !["approved", "rejected"].includes(v.decision) ||
      typeof v.reason !== "string" ||
      v.reason.trim().length < 8 ||
      v.reason.length > 500
    )
      throw new LiveGuardError("invalid_input", 400);
    return this.mutate(grant, scope, id, v.revision, "triage", (job) => {
      const p = job.guardRemediation?.find((p) => p.id === v.proposalId);
      if (!p || p.state !== "completed" || p.review !== "pending")
        throw new LiveGuardError("revision_conflict", 409);
      if (
        evidenceIdentity(remediationFinding(grant, job, p.findingId)) !==
        p.evidenceSha256
      )
        throw new LiveGuardError("source_integrity");
      p.review = v.decision;
      p.reviewedBy = grant.actorId;
      p.reviewedAt = new Date().toISOString();
      p.reviewReason = redact(v.reason);
      job.audit.push({
        actorId: grant.actorId,
        at: p.reviewedAt,
        action: "remediation_reviewed",
        subjectId: p.id,
        reason:
          "Advice " +
          p.review +
          ": " +
          p.reviewReason +
          "; no permission to apply or publish a patch.",
      });
      return {
        job,
        value: { proposalId: p.id, revision: v.revision + 1, review: p.review },
      };
    });
  }
  async recordRetest(
    grant: Grant,
    scope: Scope,
    id: string,
    revision: number,
    after: ScanJob,
    findingId: string,
  ) {
    return this.mutate(grant, scope, id, revision, "triage", (job) => {
      const result = compareRecordedRetest(grant, job, after, findingId);
      if ((job.guardRetests?.length ?? 0) >= 10)
        throw new LiveGuardError("source_limit", 429);
      job.guardRetests = [...(job.guardRetests ?? []), result];
      job.audit.push({
        actorId: grant.actorId,
        at: result.recordedAt,
        action: "remediation_retest_compared",
        subjectId: findingId,
        reason:
          result.outcome +
          "; compares recorded scanner evidence only; verifiedFixed=false.",
      });
      return { job, value: { ...result, revision: revision + 1 } };
    });
  }
  async prepareIntegration(
    grant: Grant,
    scope: Scope,
    id: string,
    input: unknown,
  ) {
    const v = input as { revision: number };
    if (!v || Object.keys(v).join() !== "revision")
      throw new LiveGuardError("invalid_input", 400);
    return this.mutate(grant, scope, id, v.revision, "report", (job) => {
      const bundle = integrationBundle(grant, job);
      if (job.guardIntegrationBundles?.some((b) => b.id === bundle.id))
        return {
          value: {
            bundleId: bundle.id,
            revision: v.revision,
            acknowledged: false,
          },
        };
      if ((job.guardIntegrationBundles?.length ?? 0) >= 3)
        throw new LiveGuardError("source_limit", 429);
      job.guardIntegrationBundles = [
        ...(job.guardIntegrationBundles ?? []),
        bundle,
      ];
      job.audit.push({
        actorId: grant.actorId,
        at: new Date().toISOString(),
        action: "integration_bundle_prepared",
        subjectId: bundle.id,
        reason:
          "Durable pending producer envelope only. Canvas/Intelligence/Sentinel consumers unavailable; no acknowledgment.",
      });
      return {
        job,
        value: {
          bundleId: bundle.id,
          revision: v.revision + 1,
          acknowledged: false,
        },
      };
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
      const analysis = this.analysis(grant, job, v.revision);
      const body = {
        ...report(
          grant,
          job,
          releasePolicy({ job, revision: v.revision, coverage: null }),
        ),
        remediation: analysis.proposals,
        retests: analysis.retests,
        integrations: analysis.bundles,
      };
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
