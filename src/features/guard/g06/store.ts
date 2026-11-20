import { createHash, randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { PlatformDatabase } from "@/platform/database";
import type { TransactionContext } from "@/features/sentinel/platform-contracts";
import type { SentinelScope } from "@/features/sentinel/types";
import type {
  CheckRecord,
  DeploymentRecord,
  EvaluationRecord,
  PolicyRecord,
} from "../g04/store";
import { validatePolicy } from "../g04/policy";
import type { G05Finding, G05Report, G05Run } from "../g05/contracts";
import { operationalJob } from "../live/product-policy";
import {
  G06Error,
  type G06AttemptOutcome,
  type G06AuditRecord,
  type G06CanvasOverlayPayload,
  type G06CanvasOverlayRecord,
  type G06DeliveryAttemptRecord,
  type G06ExtendedScanJob,
  type G06IntelligenceSyncRecord,
  type G06OutboxRecord,
  type G06OutboxState,
  type G06OutboxTopic,
  type G06Scope,
  type G06UnifiedReportBody,
  type G06UnifiedReportRecord,
} from "./contracts";
import { redactG06Text, redactG06Value } from "./redaction";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = QueryResultRow & Record<string, any>;

function liveScope(scope: Pick<G06Scope, "workspaceId" | "projectId">): SentinelScope {
  return {
    mode: "live",
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
  };
}

const iso = (v: unknown) =>
  v instanceof Date ? v.toISOString() : typeof v === "string" ? v : null;

export function stableDigest(value: unknown): string {
  const canonical = JSON.stringify(value, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      );
    }
    return v;
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function mapOverlay(r: Row): G06CanvasOverlayRecord {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    projectId: r.project_id,
    commitSha: r.commit_sha,
    graphRevision: r.graph_revision,
    scanId: r.scan_id,
    g05RunId: r.g05_run_id ?? null,
    coverageStatus: r.coverage_status,
    mappedCount: Number(r.mapped_count),
    unmatchedCount: Number(r.unmatched_count),
    overlayDigest: r.overlay_digest,
    overlay: r.overlay as G06CanvasOverlayPayload,
    staleReasons: (r.stale_reasons ?? []) as string[],
    createdBy: r.created_by,
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
    retentionUntil: iso(r.retention_until)!,
  };
}

function mapOutbox(r: Row): G06OutboxRecord {
  return {
    deliveryId: r.delivery_id,
    workspaceId: r.workspace_id,
    projectId: r.project_id,
    topic: r.topic,
    scanId: r.scan_id,
    commitSha: r.commit_sha,
    idempotencyKey: r.idempotency_key,
    payloadDigest: r.payload_digest,
    eventType: r.event_type,
    schemaVersion: r.schema_version,
    payload: r.payload as Record<string, unknown>,
    state: r.state,
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
    nextAttemptAt: iso(r.next_attempt_at)!,
    leaseOwner: r.lease_owner ?? null,
    leaseToken: r.lease_token ?? null,
    leaseUntil: iso(r.lease_until),
    lastError: r.last_error ?? null,
    consumerStatus: r.consumer_status ?? null,
    consumerAckRef: r.consumer_ack_ref ?? null,
    acknowledgedAt: iso(r.acknowledged_at),
    createdBy: r.created_by,
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
    retentionUntil: iso(r.retention_until)!,
  };
}

function mapAttempt(r: Row): G06DeliveryAttemptRecord {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    projectId: r.project_id,
    deliveryId: r.delivery_id,
    topic: r.topic,
    attempt: Number(r.attempt),
    workerId: r.worker_id,
    outcome: r.outcome,
    httpStatus: r.http_status === null || r.http_status === undefined ? null : Number(r.http_status),
    consumerRef: r.consumer_ref ?? null,
    errorCode: r.error_code ?? null,
    errorDetail: r.error_detail ?? null,
    startedAt: iso(r.started_at)!,
    finishedAt: iso(r.finished_at)!,
  };
}

function mapIntelSync(r: Row): G06IntelligenceSyncRecord {
  return {
    syncId: r.sync_id,
    workspaceId: r.workspace_id,
    projectId: r.project_id,
    deliveryId: r.delivery_id,
    scanId: r.scan_id,
    commitSha: r.commit_sha,
    inventoryDigest: r.inventory_digest,
    lockfilePath: r.lockfile_path,
    itemCount: Number(r.item_count),
    unsupportedCount: Number(r.unsupported_count),
    syncStatus: r.sync_status,
    sentinelSnapshotId: r.sentinel_snapshot_id ?? null,
    exposureAssessment: r.exposure_assessment ?? null,
    exposureCount: Number(r.exposure_count),
    exposureSummary: (r.exposure_summary ?? {}) as G06IntelligenceSyncRecord["exposureSummary"],
    acknowledgedAt: iso(r.acknowledged_at),
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
    retentionUntil: iso(r.retention_until)!,
  };
}

function mapReport(r: Row): G06UnifiedReportRecord {
  return {
    reportId: r.report_id,
    workspaceId: r.workspace_id,
    projectId: r.project_id,
    commitSha: r.commit_sha ?? null,
    scanId: r.scan_id ?? null,
    g05RunId: r.g05_run_id ?? null,
    g04EvaluationId: r.g04_evaluation_id ?? null,
    overallStatus: r.overall_status,
    reportDigest: r.report_digest,
    body: r.body as G06UnifiedReportBody,
    createdBy: r.created_by,
    createdAt: iso(r.created_at)!,
    retentionUntil: iso(r.retention_until)!,
  };
}

function mapAudit(r: Row): G06AuditRecord {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    projectId: r.project_id,
    actor: r.actor,
    action: r.action,
    subjectId: r.subject_id,
    detail: (r.detail ?? {}) as Record<string, unknown>,
    occurredAt: iso(r.occurred_at)!,
  };
}

export interface G06OutboxLease {
  workspaceId: string;
  projectId: string;
  deliveryId: string;
  topic: G06OutboxTopic;
  attempt: number;
  workerId: string;
  leaseToken: string;
}

export interface G06PersistedG04Snapshot {
  available: boolean;
  policy: PolicyRecord | null;
  evaluations: EvaluationRecord[];
  checks: CheckRecord[];
  deployments: DeploymentRecord[];
}

export interface G06PersistedG05Snapshot {
  available: boolean;
  runs: G05Run[];
  findings: G05Finding[];
  reports: G05Report[];
}

export class G06PostgresStore {
  constructor(
    private readonly app: PlatformDatabase,
    private readonly worker?: PlatformDatabase,
  ) {}

  private requireWorkerDb() {
    if (!this.worker) throw new G06Error("not_configured", 503, "worker_db_not_configured");
    return this.worker;
  }

  private async hasTable(tx: TransactionContext, regName: string): Promise<boolean> {
    const r = await this.app.query<{ reg: string | null }>(
      tx,
      "SELECT to_regclass($1)::text AS reg",
      [regName],
    );
    return Boolean(r.rows[0]?.reg);
  }

  async writeAudit(
    tx: TransactionContext,
    db: PlatformDatabase,
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
    actor: string,
    action: string,
    subjectId: string,
    detail: Record<string, unknown>,
  ) {
    await db.query(
      tx,
      `INSERT INTO guard.g06_audit(workspace_id,project_id,id,actor,action,subject_id,detail)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [
        scope.workspaceId,
        scope.projectId,
        randomUUID(),
        redactG06Text(actor).slice(0, 120),
        action,
        subjectId.slice(0, 160),
        JSON.stringify(redactG06Value(detail)),
      ],
    );
  }

  // ---- Cross-batch persisted Guard readers (G02 / G04 / G05) ---------------------------------------------

  async listOperationalScans(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
    limit = 20,
  ): Promise<Array<{ id: string; status: string; updatedAt: string; coverage: unknown; job: G06ExtendedScanJob }>> {
    return this.app.scoped(liveScope(scope), async (tx) => {
      if (!(await this.hasTable(tx, "guard.scans"))) return [];
      const r = await this.app.query<Row>(
        tx,
        `SELECT scan_id, status, updated_at, coverage, job
         FROM guard.scans
         WHERE mode='live' AND workspace_id=$1 AND project_id=$2 AND retention_until>clock_timestamp()
         ORDER BY created_at DESC LIMIT $3`,
        [scope.workspaceId, scope.projectId, Math.min(50, Math.max(1, limit))],
      );
      return r.rows
        .map((row) => ({
          id: String(row.scan_id).trim(),
          status: row.status as string,
          updatedAt: iso(row.updated_at)!,
          coverage: row.coverage as unknown,
          job: row.job as G06ExtendedScanJob,
        }))
        .filter((s) => operationalJob(s.job));
    });
  }

  async getOperationalScan(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
    scanId: string,
  ): Promise<{ id: string; status: string; updatedAt: string; coverage: unknown; job: G06ExtendedScanJob } | null> {
    return this.app.scoped(liveScope(scope), async (tx) => {
      if (!(await this.hasTable(tx, "guard.scans"))) return null;
      const r = await this.app.query<Row>(
        tx,
        `SELECT scan_id, status, updated_at, coverage, job
         FROM guard.scans
         WHERE mode='live' AND workspace_id=$1 AND project_id=$2 AND scan_id=$3 AND retention_until>clock_timestamp()`,
        [scope.workspaceId, scope.projectId, scanId],
      );
      const row = r.rows[0];
      if (!row) return null;
      const job = row.job as G06ExtendedScanJob;
      if (!operationalJob(job)) return null;
      return {
        id: String(row.scan_id).trim(),
        status: row.status as string,
        updatedAt: iso(row.updated_at)!,
        coverage: row.coverage as unknown,
        job,
      };
    });
  }

  async readG04Snapshot(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
  ): Promise<G06PersistedG04Snapshot> {
    return this.app.scoped(liveScope(scope), async (tx) => {
      const hasEval = await this.hasTable(tx, "guard.g04_evaluations");
      if (!hasEval) {
        return {
          available: false,
          policy: null,
          evaluations: [],
          checks: [],
          deployments: [],
        };
      }
      const polRes = await this.app.query<Row>(
        tx,
        "SELECT * FROM guard.g04_policies WHERE workspace_id=$1 AND project_id=$2",
        [scope.workspaceId, scope.projectId],
      );
      const evalRes = await this.app.query<Row>(
        tx,
        "SELECT * FROM guard.g04_evaluations WHERE workspace_id=$1 AND project_id=$2 ORDER BY created_at DESC LIMIT 10",
        [scope.workspaceId, scope.projectId],
      );
      const chkRes = await this.app.query<Row>(
        tx,
        "SELECT * FROM guard.g04_check_runs WHERE workspace_id=$1 AND project_id=$2 ORDER BY updated_at DESC LIMIT 10",
        [scope.workspaceId, scope.projectId],
      );
      const depRes = await this.app.query<Row>(
        tx,
        "SELECT * FROM guard.g04_deployments WHERE workspace_id=$1 AND project_id=$2 ORDER BY verified_at DESC LIMIT 10",
        [scope.workspaceId, scope.projectId],
      );
      const policy: PolicyRecord | null = polRes.rows[0]
        ? {
            workspaceId: polRes.rows[0].workspace_id,
            projectId: polRes.rows[0].project_id,
            repositoryId: polRes.rows[0].repository_id,
            repositoryName: polRes.rows[0].repository_name,
            installationId: Number(polRes.rows[0].installation_id),
            installationState: polRes.rows[0].installation_state,
            ownerActor: polRes.rows[0].owner_actor,
            ownerUserId: Number(polRes.rows[0].owner_user_id),
            policy: validatePolicy(polRes.rows[0].policy),
            policyDigest: String(polRes.rows[0].policy_digest).trim(),
            revision: Number(polRes.rows[0].revision),
            updatedAt: iso(polRes.rows[0].updated_at)!,
            updatedBy: polRes.rows[0].updated_by,
          }
        : null;
      const evaluations: EvaluationRecord[] = evalRes.rows.map((r) => ({
        id: String(r.id).trim(),
        triggerId: String(r.trigger_id).trim(),
        scanId: String(r.scan_id).trim(),
        commit: String(r.commit_sha).trim(),
        branch: r.branch,
        policyRevision: Number(r.policy_revision),
        decision: r.decision,
        evaluation: r.evaluation,
        enforcement: r.enforcement,
        supersededBy: r.superseded_by ? String(r.superseded_by).trim() : null,
        createdAt: iso(r.created_at)!,
      }));
      const checks: CheckRecord[] = chkRes.rows.map((r) => ({
        commit: String(r.commit_sha).trim(),
        externalId: r.external_id,
        checkRunId: r.github_check_run_id,
        htmlUrl: r.html_url,
        status: r.status,
        conclusion: r.conclusion,
        decision: r.decision,
        triggerId: r.trigger_id ? String(r.trigger_id).trim() : null,
        evaluationId: r.evaluation_id ? String(r.evaluation_id).trim() : null,
        attempts: Number(r.attempts),
        lastError: r.last_error,
        nextAttemptAt: iso(r.next_attempt_at)!,
        published: Boolean(r.published),
        updatedAt: iso(r.updated_at)!,
      }));
      const deployments: DeploymentRecord[] = depRes.rows.map((r) => ({
        provider: r.provider,
        deploymentId: r.deployment_id,
        environment: r.environment,
        commit: r.commit_sha ? String(r.commit_sha).trim() : null,
        state: r.state,
        evaluationId: r.evaluation_id ? String(r.evaluation_id).trim() : null,
        decision: r.decision,
        info: r.info,
        enforcement: r.enforcement,
        providerError: r.provider_error,
        verifiedAt: iso(r.verified_at)!,
      }));
      return { available: true, policy, evaluations, checks, deployments };
    });
  }

  async readG05Snapshot(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
  ): Promise<G06PersistedG05Snapshot> {
    return this.app.scoped(liveScope(scope), async (tx) => {
      const hasRuns = await this.hasTable(tx, "guard.g05_runs");
      if (!hasRuns) {
        return { available: false, runs: [], findings: [], reports: [] };
      }
      const runsRes = await this.app.query<Row>(
        tx,
        "SELECT * FROM guard.g05_runs WHERE workspace_id=$1 AND project_id=$2 AND retention_until>clock_timestamp() ORDER BY created_at DESC LIMIT 20",
        [scope.workspaceId, scope.projectId],
      );
      const findRes = await this.app.query<Row>(
        tx,
        "SELECT * FROM guard.g05_findings WHERE workspace_id=$1 AND project_id=$2 ORDER BY updated_at DESC, id LIMIT 100",
        [scope.workspaceId, scope.projectId],
      );
      const repRes = await this.app.query<Row>(
        tx,
        "SELECT * FROM guard.g05_reports WHERE workspace_id=$1 AND project_id=$2 ORDER BY created_at DESC LIMIT 10",
        [scope.workspaceId, scope.projectId],
      );
      const runs: G05Run[] = runsRes.rows.map((r) => ({
        id: r.id,
        workspaceId: r.workspace_id,
        projectId: r.project_id,
        idempotencyKey: r.idempotency_key,
        fingerprint: r.fingerprint,
        testPlanId: r.test_plan_id,
        targetId: r.target_id,
        targetRevision: Number(r.target_revision),
        grantId: r.grant_id,
        trustPlanId: r.trust_plan_id ?? null,
        workflowImportId: r.workflow_import_id ?? null,
        retestOfRunId: r.retest_of_run_id ?? null,
        retestCaseIds: r.retest_case_ids ?? null,
        status: r.status,
        scannerVersion: r.scanner_version,
        scopeDigest: r.scope_digest,
        executedRequests: Number(r.executed_requests),
        maxRequests: Number(r.max_requests),
        cleanupStatus: r.cleanup_status,
        evidenceDigest: r.evidence_digest ?? null,
        summary: r.summary,
        coverage: r.coverage,
        revision: Number(r.revision),
        createdBy: r.created_by,
        createdAt: iso(r.created_at)!,
        startedAt: iso(r.started_at),
        finishedAt: iso(r.finished_at),
        updatedAt: iso(r.updated_at)!,
        retentionUntil: iso(r.retention_until)!,
      }));
      const findings: G05Finding[] = findRes.rows.map((r) => ({
        id: r.id,
        workspaceId: r.workspace_id,
        projectId: r.project_id,
        runId: r.run_id,
        caseId: r.case_id,
        engine: r.engine,
        title: r.title,
        severity: r.severity,
        confidence: r.confidence,
        status: r.status,
        endpoint: r.endpoint,
        invariantFamily: r.invariant_family ?? null,
        summary: r.summary,
        evidence: r.evidence ?? [],
        triageReason: r.triage_reason ?? null,
        triagedBy: r.triaged_by ?? null,
        triagedAt: iso(r.triaged_at),
        retestOfFindingId: r.retest_of_finding_id ?? null,
        revision: Number(r.revision),
        createdAt: iso(r.created_at)!,
        updatedAt: iso(r.updated_at)!,
      }));
      const reports: G05Report[] = repRes.rows.map((r) => ({
        id: r.id,
        workspaceId: r.workspace_id,
        projectId: r.project_id,
        runId: r.run_id,
        runRevision: Number(r.run_revision),
        targetId: r.target_id,
        targetRevision: Number(r.target_revision),
        reportDigest: r.report_digest,
        body: r.body,
        createdBy: r.created_by,
        createdAt: iso(r.created_at)!,
      }));
      return { available: true, runs, findings, reports };
    });
  }

  // ---- GRD-013 Canvas overlay persistence ----------------------------------------------------------------

  async saveCanvasOverlay(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
    input: {
      overlay: G06CanvasOverlayPayload;
      actor: string;
    },
  ): Promise<G06CanvasOverlayRecord> {
    const safeOverlay = redactG06Value(input.overlay);
    const digest = stableDigest({
      projectId: safeOverlay.projectId,
      commitSha: safeOverlay.commitSha,
      graphRevision: safeOverlay.graphRevision,
      scanId: safeOverlay.scanId,
      g05RunId: safeOverlay.g05RunId,
      coverageStatus: safeOverlay.coverageStatus,
      mappedFindings: safeOverlay.mappedFindings,
      unmatchedFindings: safeOverlay.unmatchedFindings,
    });
    const overlayId = createHash("sha256")
      .update(`${scope.projectId}:${safeOverlay.graphRevision}:${digest}`)
      .digest("hex")
      .slice(0, 24);
    const id = `ovl_${overlayId}`;

    return this.app.scoped(liveScope(scope), async (tx) => {
      const existing = await this.app.query<Row>(
        tx,
        `SELECT * FROM guard.g06_canvas_overlays
         WHERE workspace_id=$1 AND project_id=$2 AND id=$3 AND retention_until>clock_timestamp()`,
        [scope.workspaceId, scope.projectId, id],
      );
      if (existing.rows[0]) return mapOverlay(existing.rows[0]);

      const inserted = await this.app.query<Row>(
        tx,
        `INSERT INTO guard.g06_canvas_overlays(
          workspace_id,project_id,id,commit_sha,graph_revision,scan_id,g05_run_id,coverage_status,
          mapped_count,unmatched_count,overlay_digest,overlay,stale_reasons,created_by
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14) RETURNING *`,
        [
          scope.workspaceId,
          scope.projectId,
          id,
          safeOverlay.commitSha ?? "unscanned",
          safeOverlay.graphRevision,
          safeOverlay.scanId ?? "none",
          safeOverlay.g05RunId,
          safeOverlay.coverageStatus,
          safeOverlay.summary.mappedCount,
          safeOverlay.summary.unmatchedCount,
          digest,
          JSON.stringify(safeOverlay),
          JSON.stringify(safeOverlay.staleReasons),
          redactG06Text(input.actor).slice(0, 120),
        ],
      );
      await this.writeAudit(tx, this.app, scope, input.actor, "canvas_overlay_saved", id, {
        graphRevision: safeOverlay.graphRevision,
        commitSha: safeOverlay.commitSha,
        coverageStatus: safeOverlay.coverageStatus,
        mappedCount: safeOverlay.summary.mappedCount,
        unmatchedCount: safeOverlay.summary.unmatchedCount,
      });
      return mapOverlay(inserted.rows[0]);
    });
  }

  async latestCanvasOverlay(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
    graphRevision?: string,
  ): Promise<G06CanvasOverlayRecord | null> {
    return this.app.scoped(liveScope(scope), async (tx) => {
      const r = await this.app.query<Row>(
        tx,
        `SELECT * FROM guard.g06_canvas_overlays
         WHERE workspace_id=$1 AND project_id=$2 AND retention_until>clock_timestamp()
           AND ($3::text IS NULL OR graph_revision=$3)
         ORDER BY updated_at DESC LIMIT 1`,
        [scope.workspaceId, scope.projectId, graphRevision ?? null],
      );
      return r.rows[0] ? mapOverlay(r.rows[0]) : null;
    });
  }

  async listCanvasOverlays(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
    limit = 20,
  ): Promise<G06CanvasOverlayRecord[]> {
    return this.app.scoped(liveScope(scope), async (tx) => {
      const r = await this.app.query<Row>(
        tx,
        `SELECT * FROM guard.g06_canvas_overlays
         WHERE workspace_id=$1 AND project_id=$2 AND retention_until>clock_timestamp()
         ORDER BY updated_at DESC LIMIT $3`,
        [scope.workspaceId, scope.projectId, Math.min(50, Math.max(1, limit))],
      );
      return r.rows.map(mapOverlay);
    });
  }

  // ---- Durable Outbox (GRD-020 / GRD-021) ----------------------------------------------------------------

  async enqueueOutbox(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
    input: {
      topic: G06OutboxTopic;
      scanId: string;
      commitSha: string;
      idempotencyKey: string;
      eventType: string;
      schemaVersion: string;
      payload: Record<string, unknown>;
      actor: string;
      maxAttempts?: number;
    },
  ): Promise<{ record: G06OutboxRecord; duplicate: boolean }> {
    const safePayload = redactG06Value(input.payload);
    const payloadDigest = stableDigest(safePayload);
    const maxAttempts = Math.min(20, Math.max(1, input.maxAttempts ?? 5));

    return this.app.scoped(liveScope(scope), async (tx) => {
      await this.app.query(
        tx,
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`${scope.workspaceId}:${scope.projectId}:${input.topic}:${input.idempotencyKey}`],
      );
      const existing = await this.app.query<Row>(
        tx,
        `SELECT * FROM guard.g06_outbox
         WHERE workspace_id=$1 AND project_id=$2 AND topic=$3 AND idempotency_key=$4 FOR UPDATE`,
        [scope.workspaceId, scope.projectId, input.topic, input.idempotencyKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].payload_digest !== payloadDigest) {
          throw new G06Error(
            "conflict",
            409,
            "outbox_idempotency_digest_mismatch",
          );
        }
        return { record: mapOutbox(existing.rows[0]), duplicate: true };
      }

      const deliveryId = `dlv_${randomUUID().replaceAll("-", "")}`;
      const inserted = await this.app.query<Row>(
        tx,
        `INSERT INTO guard.g06_outbox(
          workspace_id,project_id,delivery_id,topic,scan_id,commit_sha,idempotency_key,
          payload_digest,event_type,schema_version,payload,state,attempts,max_attempts,created_by
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'pending',0,$12,$13) RETURNING *`,
        [
          scope.workspaceId,
          scope.projectId,
          deliveryId,
          input.topic,
          input.scanId,
          input.commitSha,
          input.idempotencyKey,
          payloadDigest,
          input.eventType,
          input.schemaVersion,
          JSON.stringify(safePayload),
          maxAttempts,
          redactG06Text(input.actor).slice(0, 120),
        ],
      );
      await this.writeAudit(tx, this.app, scope, input.actor, "outbox_enqueued", deliveryId, {
        topic: input.topic,
        eventType: input.eventType,
        scanId: input.scanId,
        commitSha: input.commitSha,
        idempotencyKey: input.idempotencyKey,
        payloadDigest,
      });
      return { record: mapOutbox(inserted.rows[0]), duplicate: false };
    });
  }

  async getOutboxDelivery(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
    deliveryId: string,
  ): Promise<G06OutboxRecord | null> {
    return this.app.scoped(liveScope(scope), async (tx) => {
      const r = await this.app.query<Row>(
        tx,
        `SELECT * FROM guard.g06_outbox
         WHERE workspace_id=$1 AND project_id=$2 AND delivery_id=$3 AND retention_until>clock_timestamp()`,
        [scope.workspaceId, scope.projectId, deliveryId],
      );
      return r.rows[0] ? mapOutbox(r.rows[0]) : null;
    });
  }

  async listOutbox(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
    topic?: G06OutboxTopic,
    limit = 30,
  ): Promise<G06OutboxRecord[]> {
    return this.app.scoped(liveScope(scope), async (tx) => {
      const r = await this.app.query<Row>(
        tx,
        `SELECT * FROM guard.g06_outbox
         WHERE workspace_id=$1 AND project_id=$2 AND retention_until>clock_timestamp()
           AND ($3::text IS NULL OR topic=$3)
         ORDER BY created_at DESC LIMIT $4`,
        [
          scope.workspaceId,
          scope.projectId,
          topic ?? null,
          Math.min(50, Math.max(1, limit)),
        ],
      );
      return r.rows.map(mapOutbox);
    });
  }

  async listDeliveryAttempts(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
    deliveryId?: string,
    limit = 50,
  ): Promise<G06DeliveryAttemptRecord[]> {
    return this.app.scoped(liveScope(scope), async (tx) => {
      const r = await this.app.query<Row>(
        tx,
        `SELECT * FROM guard.g06_delivery_attempts
         WHERE workspace_id=$1 AND project_id=$2 AND ($3::text IS NULL OR delivery_id=$3)
         ORDER BY finished_at DESC, attempt DESC LIMIT $4`,
        [
          scope.workspaceId,
          scope.projectId,
          deliveryId ?? null,
          Math.min(100, Math.max(1, limit)),
        ],
      );
      return r.rows.map(mapAttempt);
    });
  }

  async requestManualRetry(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
    deliveryId: string,
    actor: string,
  ): Promise<G06OutboxRecord> {
    return this.app.scoped(liveScope(scope), async (tx) => {
      const r = await this.app.query<Row>(
        tx,
        `SELECT * FROM guard.g06_outbox
         WHERE workspace_id=$1 AND project_id=$2 AND delivery_id=$3 FOR UPDATE`,
        [scope.workspaceId, scope.projectId, deliveryId],
      );
      const current = r.rows[0] ? mapOutbox(r.rows[0]) : null;
      if (!current) throw new G06Error("not_found", 404);
      if (current.state === "acknowledged") return current;
      if (current.state === "conflict") {
        throw new G06Error("conflict", 409, "cannot_retry_conflicted_delivery");
      }
      const nextMax = Math.max(current.maxAttempts, current.attempts + 1);
      const updated = await this.app.query<Row>(
        tx,
        `UPDATE guard.g06_outbox
         SET state='pending', max_attempts=$4, next_attempt_at=clock_timestamp(), updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND project_id=$2 AND delivery_id=$3 RETURNING *`,
        [scope.workspaceId, scope.projectId, deliveryId, nextMax],
      );
      await this.writeAudit(tx, this.app, scope, actor, "outbox_retry_requested", deliveryId, {
        previousState: current.state,
        attempts: current.attempts,
      });
      return mapOutbox(updated.rows[0]);
    });
  }

  // ---- Worker operations (wetscan_guard_worker role only) -------------------------------------------------

  async pendingDeliveriesWorker(
    limit = 25,
  ): Promise<Array<{ workspaceId: string; projectId: string; deliveryId: string }>> {
    const db = this.requireWorkerDb();
    return db.transaction(async (tx) => {
      db.requireWorker(tx);
      const r = await db.query<{
        workspace_id: string;
        project_id: string;
        delivery_id: string;
      }>(tx, "SELECT workspace_id, project_id, delivery_id FROM guard.g06_pending_deliveries($1)", [
        Math.min(100, Math.max(1, limit)),
      ]);
      return r.rows.map((row) => ({
        workspaceId: row.workspace_id,
        projectId: row.project_id,
        deliveryId: row.delivery_id,
      }));
    });
  }

  async claimDeliveryWorker(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
    deliveryId: string,
    workerId: string,
    leaseMs = 30_000,
  ): Promise<{ lease: G06OutboxLease; record: G06OutboxRecord } | null> {
    const db = this.requireWorkerDb();
    return db.scoped(liveScope(scope), async (tx) => {
      db.requireWorker(tx);
      const found = await db.query<Row>(
        tx,
        `SELECT * FROM guard.g06_outbox
         WHERE workspace_id=$1 AND project_id=$2 AND delivery_id=$3
           AND retention_until>clock_timestamp()
           AND (
             (state IN ('pending','retry_scheduled') AND next_attempt_at<=clock_timestamp())
             OR (state='leased' AND lease_until IS NOT NULL AND lease_until<=clock_timestamp())
           )
         FOR UPDATE SKIP LOCKED`,
        [scope.workspaceId, scope.projectId, deliveryId],
      );
      const row = found.rows[0];
      if (!row) return null;

      const wasExpiredLease = row.state === "leased";
      if (wasExpiredLease && Number(row.attempts) > 0) {
        await db.query(
          tx,
          `INSERT INTO guard.g06_delivery_attempts(
            workspace_id,project_id,id,delivery_id,topic,attempt,worker_id,outcome,error_code,error_detail
          ) VALUES($1,$2,$3,$4,$5,$6,$7,'lease_expired','worker_lease_expired','Recovered stale worker lease after timeout')`,
          [
            scope.workspaceId,
            scope.projectId,
            `att_${randomUUID().replaceAll("-", "")}`,
            deliveryId,
            row.topic,
            Math.max(1, Number(row.attempts)),
            String(row.lease_owner ?? workerId).slice(0, 80),
          ],
        );
      }

      const nextAttempt = Number(row.attempts) + 1;
      const leaseToken = randomUUID();
      const updated = await db.query<Row>(
        tx,
        `UPDATE guard.g06_outbox
         SET state='leased',
             attempts=$4,
             lease_owner=$5,
             lease_token=$6,
             lease_until=clock_timestamp() + ($7::bigint || ' milliseconds')::interval,
             updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND project_id=$2 AND delivery_id=$3 RETURNING *`,
        [
          scope.workspaceId,
          scope.projectId,
          deliveryId,
          nextAttempt,
          workerId.slice(0, 80),
          leaseToken,
          String(Math.max(1000, leaseMs)),
        ],
      );
      return {
        lease: {
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          deliveryId,
          topic: updated.rows[0].topic,
          attempt: nextAttempt,
          workerId: workerId.slice(0, 80),
          leaseToken,
        },
        record: mapOutbox(updated.rows[0]),
      };
    });
  }

  private async assertActiveLeaseWorker(
    tx: TransactionContext,
    db: PlatformDatabase,
    lease: G06OutboxLease,
  ) {
    db.requireWorker(tx);
    const r = await db.query(
      tx,
      `SELECT delivery_id FROM guard.g06_outbox
       WHERE workspace_id=$1 AND project_id=$2 AND delivery_id=$3
         AND state='leased' AND lease_owner=$4 AND lease_token=$5
         AND lease_until>clock_timestamp()`,
      [
        lease.workspaceId,
        lease.projectId,
        lease.deliveryId,
        lease.workerId,
        lease.leaseToken,
      ],
    );
    if (!r.rowCount) throw new G06Error("lease_lost", 409);
  }

  async completeDeliveryWorker(
    lease: G06OutboxLease,
    input: {
      consumerStatus: string;
      consumerAckRef: string | null;
      httpStatus?: number | null;
    },
  ): Promise<G06OutboxRecord> {
    const db = this.requireWorkerDb();
    const scope = { workspaceId: lease.workspaceId, projectId: lease.projectId };
    return db.scoped(liveScope(scope), async (tx) => {
      await this.assertActiveLeaseWorker(tx, db, lease);
      const updated = await db.query<Row>(
        tx,
        `UPDATE guard.g06_outbox
         SET state='acknowledged',
             lease_owner=NULL,
             lease_token=NULL,
             lease_until=NULL,
             last_error=NULL,
             consumer_status=$4,
             consumer_ack_ref=$5,
             acknowledged_at=clock_timestamp(),
             updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND project_id=$2 AND delivery_id=$3 RETURNING *`,
        [
          scope.workspaceId,
          scope.projectId,
          lease.deliveryId,
          redactG06Text(input.consumerStatus).slice(0, 80),
          input.consumerAckRef ? redactG06Text(input.consumerAckRef).slice(0, 160) : null,
        ],
      );
      await db.query(
        tx,
        `INSERT INTO guard.g06_delivery_attempts(
          workspace_id,project_id,id,delivery_id,topic,attempt,worker_id,outcome,http_status,consumer_ref
        ) VALUES($1,$2,$3,$4,$5,$6,$7,'acknowledged',$8,$9)`,
        [
          scope.workspaceId,
          scope.projectId,
          `att_${randomUUID().replaceAll("-", "")}`,
          lease.deliveryId,
          lease.topic,
          lease.attempt,
          lease.workerId,
          input.httpStatus ?? null,
          input.consumerAckRef ? redactG06Text(input.consumerAckRef).slice(0, 160) : null,
        ],
      );
      await this.writeAudit(
        tx,
        db,
        scope,
        lease.workerId,
        "outbox_acknowledged",
        lease.deliveryId,
        {
          topic: lease.topic,
          attempt: lease.attempt,
          consumerStatus: input.consumerStatus,
          consumerAckRef: input.consumerAckRef,
        },
      );
      return mapOutbox(updated.rows[0]);
    });
  }

  async failOrRetryDeliveryWorker(
    lease: G06OutboxLease,
    input: {
      outcome: Exclude<G06AttemptOutcome, "acknowledged" | "lease_expired">;
      errorCode: string;
      errorDetail: string;
      httpStatus?: number | null;
      retryDelayMs?: number;
      permanent?: boolean;
    },
  ): Promise<G06OutboxRecord> {
    const db = this.requireWorkerDb();
    const scope = { workspaceId: lease.workspaceId, projectId: lease.projectId };
    const safeCode = redactG06Text(input.errorCode).slice(0, 80);
    const safeDetail = redactG06Text(input.errorDetail).slice(0, 400);

    return db.scoped(liveScope(scope), async (tx) => {
      await this.assertActiveLeaseWorker(tx, db, lease);
      const current = await db.query<Row>(
        tx,
        "SELECT attempts, max_attempts FROM guard.g06_outbox WHERE workspace_id=$1 AND project_id=$2 AND delivery_id=$3",
        [scope.workspaceId, scope.projectId, lease.deliveryId],
      );
      const attempts = Number(current.rows[0]?.attempts ?? lease.attempt);
      const maxAttempts = Number(current.rows[0]?.max_attempts ?? 5);

      let nextState: G06OutboxState;
      if (input.outcome === "conflict") {
        nextState = "conflict";
      } else if (
        input.permanent ||
        input.outcome === "permanent_failure" ||
        input.outcome === "rejected" ||
        attempts >= maxAttempts
      ) {
        nextState = "failed";
      } else {
        nextState = "retry_scheduled";
      }

      const backoffMs =
        input.retryDelayMs ??
        Math.min(3_600_000, Math.round(15_000 * 2 ** Math.min(attempts - 1, 7)));

      const updated = await db.query<Row>(
        tx,
        `UPDATE guard.g06_outbox
         SET state=$4,
             lease_owner=NULL,
             lease_token=NULL,
             lease_until=NULL,
             last_error=$5,
             consumer_status=$6,
             next_attempt_at=clock_timestamp() + ($7::bigint || ' milliseconds')::interval,
             updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND project_id=$2 AND delivery_id=$3 RETURNING *`,
        [
          scope.workspaceId,
          scope.projectId,
          lease.deliveryId,
          nextState,
          `${safeCode}: ${safeDetail}`.slice(0, 400),
          input.outcome,
          String(nextState === "retry_scheduled" ? Math.max(100, backoffMs) : 0),
        ],
      );
      await db.query(
        tx,
        `INSERT INTO guard.g06_delivery_attempts(
          workspace_id,project_id,id,delivery_id,topic,attempt,worker_id,outcome,http_status,error_code,error_detail
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          scope.workspaceId,
          scope.projectId,
          `att_${randomUUID().replaceAll("-", "")}`,
          lease.deliveryId,
          lease.topic,
          lease.attempt,
          lease.workerId,
          input.outcome,
          input.httpStatus ?? null,
          safeCode,
          safeDetail,
        ],
      );
      await this.writeAudit(
        tx,
        db,
        scope,
        lease.workerId,
        nextState === "failed" || nextState === "conflict"
          ? "outbox_delivery_halted"
          : "outbox_retry_scheduled",
        lease.deliveryId,
        {
          topic: lease.topic,
          state: nextState,
          outcome: input.outcome,
          errorCode: safeCode,
          attempts,
        },
      );
      return mapOutbox(updated.rows[0]);
    });
  }

  // ---- GRD-020 Intelligence Sync persistence -------------------------------------------------------------

  async upsertIntelligenceSync(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
    input: {
      deliveryId: string;
      scanId: string;
      commitSha: string;
      inventoryDigest: string;
      lockfilePath: string;
      itemCount: number;
      unsupportedCount: number;
      syncStatus: G06IntelligenceSyncRecord["syncStatus"];
      sentinelSnapshotId: string | null;
      exposureAssessment: G06IntelligenceSyncRecord["exposureAssessment"];
      exposureCount: number;
      exposureSummary: G06IntelligenceSyncRecord["exposureSummary"];
      acknowledgedAt: string | null;
      asWorker?: boolean;
    },
  ): Promise<G06IntelligenceSyncRecord> {
    const db = input.asWorker ? this.requireWorkerDb() : this.app;
    const syncId = `sync_${createHash("sha256")
      .update(`${scope.projectId}:${input.deliveryId}`)
      .digest("hex")
      .slice(0, 24)}`;

    return db.scoped(liveScope(scope), async (tx) => {
      if (input.asWorker) db.requireWorker(tx);
      const r = await db.query<Row>(
        tx,
        `INSERT INTO guard.g06_intelligence_sync(
          workspace_id,project_id,sync_id,delivery_id,scan_id,commit_sha,inventory_digest,lockfile_path,
          item_count,unsupported_count,sync_status,sentinel_snapshot_id,exposure_assessment,exposure_count,
          exposure_summary,acknowledged_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16)
        ON CONFLICT(workspace_id,project_id,sync_id) DO UPDATE SET
          sync_status=EXCLUDED.sync_status,
          sentinel_snapshot_id=COALESCE(EXCLUDED.sentinel_snapshot_id, guard.g06_intelligence_sync.sentinel_snapshot_id),
          exposure_assessment=COALESCE(EXCLUDED.exposure_assessment, guard.g06_intelligence_sync.exposure_assessment),
          exposure_count=EXCLUDED.exposure_count,
          exposure_summary=EXCLUDED.exposure_summary,
          acknowledged_at=COALESCE(EXCLUDED.acknowledged_at, guard.g06_intelligence_sync.acknowledged_at),
          updated_at=clock_timestamp()
        RETURNING *`,
        [
          scope.workspaceId,
          scope.projectId,
          syncId,
          input.deliveryId,
          input.scanId,
          input.commitSha,
          input.inventoryDigest,
          input.lockfilePath,
          input.itemCount,
          input.unsupportedCount,
          input.syncStatus,
          input.sentinelSnapshotId,
          input.exposureAssessment,
          input.exposureCount,
          JSON.stringify(redactG06Value(input.exposureSummary)),
          input.acknowledgedAt,
        ],
      );
      return mapIntelSync(r.rows[0]);
    });
  }

  async latestIntelligenceSync(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
  ): Promise<G06IntelligenceSyncRecord | null> {
    return this.app.scoped(liveScope(scope), async (tx) => {
      const r = await this.app.query<Row>(
        tx,
        `SELECT * FROM guard.g06_intelligence_sync
         WHERE workspace_id=$1 AND project_id=$2 AND retention_until>clock_timestamp()
         ORDER BY updated_at DESC LIMIT 1`,
        [scope.workspaceId, scope.projectId],
      );
      return r.rows[0] ? mapIntelSync(r.rows[0]) : null;
    });
  }

  async listIntelligenceSync(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
    limit = 20,
  ): Promise<G06IntelligenceSyncRecord[]> {
    return this.app.scoped(liveScope(scope), async (tx) => {
      const r = await this.app.query<Row>(
        tx,
        `SELECT * FROM guard.g06_intelligence_sync
         WHERE workspace_id=$1 AND project_id=$2 AND retention_until>clock_timestamp()
         ORDER BY updated_at DESC LIMIT $3`,
        [scope.workspaceId, scope.projectId, Math.min(50, Math.max(1, limit))],
      );
      return r.rows.map(mapIntelSync);
    });
  }

  // ---- Unified Guard Reports & Audit ----------------------------------------------------------------------

  async saveReport(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
    input: {
      body: G06UnifiedReportBody;
      scanId: string | null;
      g05RunId: string | null;
      g04EvaluationId: string | null;
      actor: string;
    },
  ): Promise<G06UnifiedReportRecord> {
    const safeBody = redactG06Value(input.body);
    const reportDigest = stableDigest(safeBody);

    return this.app.scoped(liveScope(scope), async (tx) => {
      const existing = await this.app.query<Row>(
        tx,
        `SELECT * FROM guard.g06_reports
         WHERE workspace_id=$1 AND project_id=$2 AND report_id=$3 AND retention_until>clock_timestamp()`,
        [scope.workspaceId, scope.projectId, safeBody.reportId],
      );
      if (existing.rows[0]) return mapReport(existing.rows[0]);

      const inserted = await this.app.query<Row>(
        tx,
        `INSERT INTO guard.g06_reports(
          workspace_id,project_id,report_id,commit_sha,scan_id,g05_run_id,g04_evaluation_id,
          overall_status,report_digest,body,created_by
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) RETURNING *`,
        [
          scope.workspaceId,
          scope.projectId,
          safeBody.reportId,
          safeBody.commitSha,
          input.scanId,
          input.g05RunId,
          input.g04EvaluationId,
          safeBody.overallStatus,
          reportDigest,
          JSON.stringify(safeBody),
          redactG06Text(input.actor).slice(0, 120),
        ],
      );
      await this.writeAudit(tx, this.app, scope, input.actor, "unified_report_generated", safeBody.reportId, {
        overallStatus: safeBody.overallStatus,
        commitSha: safeBody.commitSha,
        scanId: input.scanId,
        g05RunId: input.g05RunId,
        g04EvaluationId: input.g04EvaluationId,
        reportDigest,
      });
      return mapReport(inserted.rows[0]);
    });
  }

  async getReport(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
    reportId: string,
  ): Promise<G06UnifiedReportRecord | null> {
    return this.app.scoped(liveScope(scope), async (tx) => {
      const r = await this.app.query<Row>(
        tx,
        `SELECT * FROM guard.g06_reports
         WHERE workspace_id=$1 AND project_id=$2 AND report_id=$3 AND retention_until>clock_timestamp()`,
        [scope.workspaceId, scope.projectId, reportId],
      );
      return r.rows[0] ? mapReport(r.rows[0]) : null;
    });
  }

  async listReports(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
    limit = 20,
  ): Promise<G06UnifiedReportRecord[]> {
    return this.app.scoped(liveScope(scope), async (tx) => {
      const r = await this.app.query<Row>(
        tx,
        `SELECT * FROM guard.g06_reports
         WHERE workspace_id=$1 AND project_id=$2 AND retention_until>clock_timestamp()
         ORDER BY created_at DESC LIMIT $3`,
        [scope.workspaceId, scope.projectId, Math.min(50, Math.max(1, limit))],
      );
      return r.rows.map(mapReport);
    });
  }

  async recordDownloadAudit(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
    reportId: string,
    format: "json" | "html",
    actor: string,
  ): Promise<void> {
    await this.app.scoped(liveScope(scope), async (tx) => {
      await this.writeAudit(tx, this.app, scope, actor, "unified_report_downloaded", reportId, {
        format,
      });
    });
  }

  async listAudit(
    scope: Pick<G06Scope, "workspaceId" | "projectId">,
    limit = 50,
  ): Promise<G06AuditRecord[]> {
    return this.app.scoped(liveScope(scope), async (tx) => {
      const r = await this.app.query<Row>(
        tx,
        `SELECT * FROM guard.g06_audit
         WHERE workspace_id=$1 AND project_id=$2
         ORDER BY occurred_at DESC LIMIT $3`,
        [scope.workspaceId, scope.projectId, Math.min(100, Math.max(1, limit))],
      );
      return r.rows.map(mapAudit);
    });
  }
}
