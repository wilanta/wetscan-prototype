import type { QueryResultRow } from "pg";
import { PlatformDatabase } from "../../../platform/database";
import { fingerprint } from "../../../platform/identity";
import type { JobLease, TransactionContext } from "../../sentinel/platform-contracts";
import {
  G05_JOB_KIND,
  G05_SCANNER_VERSION,
  type G05AuditEntry,
  type G05CanvasTrustPlan,
  type G05CaseResult,
  type G05ExecutionGrant,
  type G05Finding,
  type G05FindingStatus,
  type G05Report,
  type G05Run,
  type G05RunCoverage,
  type G05RunStatus,
  type G05RunSummary,
  type G05Scope,
  type G05TargetConfig,
  type G05TargetEnvironment,
  type G05TargetRecord,
  type G05TestAccountView,
  type G05TestPlan,
  type G05WorkflowImport,
} from "./contracts";
import { G05PostgresQueue } from "./queue";
import { redactG05JsonValue, redactG05Text } from "./vault";

export class G05StoreError extends Error {
  constructor(
    public readonly code:
      | "invalid_input"
      | "not_found"
      | "revision_conflict"
      | "forbidden"
      | "lease_lost"
      | "grant_invalid"
      | "limit_exceeded",
    public readonly status = 400,
  ) {
    super(code);
  }
}

const iso = (v: unknown): string => new Date(v as string).toISOString();
const optIso = (v: unknown): string | null =>
  v === null || v === undefined ? null : iso(v);

function liveScope(scope: G05Scope) {
  return { ...scope, mode: "live" as const };
}

function mapTarget(row: QueryResultRow): G05TargetRecord {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    id: row.id,
    revision: Number(row.revision),
    name: row.name,
    environment: row.environment as G05TargetEnvironment,
    origin: row.origin,
    serviceIdentity: row.service_identity ?? null,
    owner: row.owner,
    status: row.status,
    config: row.config as G05TargetConfig,
    targetDigest: row.target_digest,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapGrant(row: QueryResultRow): G05ExecutionGrant {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    id: row.id,
    targetId: row.target_id,
    targetRevision: Number(row.target_revision),
    targetDigest: row.target_digest,
    consentActor: row.consent_actor,
    proofId: row.proof_id,
    authorizationRef: row.authorization_ref,
    approvedCategories: row.approved_categories,
    status: row.status,
    expiresAt: iso(row.expires_at),
    revokedAt: optIso(row.revoked_at),
    revokedBy: row.revoked_by ?? null,
    revokeReason: row.revoke_reason ?? null,
    createdAt: iso(row.created_at),
  };
}

function mapAccountView(row: QueryResultRow): G05TestAccountView {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    id: row.id,
    targetId: row.target_id,
    role: row.role,
    customRoleName: row.custom_role_name ?? null,
    label: row.label,
    synthetic: true,
    usernameRef: row.username_ref,
    authStrategy: row.auth_strategy,
    loginPath: row.login_path ?? null,
    credentialConfigured: Boolean(row.has_ciphertext),
    credentialFingerprint: row.credential_fingerprint ?? null,
    status: row.status,
    expiresAt: iso(row.expires_at),
    lastVerifiedAt: optIso(row.last_verified_at),
    revokedAt: optIso(row.revoked_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapTrustPlan(row: QueryResultRow): G05CanvasTrustPlan {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    id: row.id,
    canvasGraphRevision: row.canvas_graph_revision,
    planVersion: Number(row.plan_version),
    targetCommit: row.target_commit ?? null,
    sourcePlanDigest: row.source_plan_digest,
    integrationStatus: row.integration_status,
    confirmed: Boolean(row.confirmed),
    confirmedBy: row.confirmed_by,
    confirmedAt: optIso(row.confirmed_at),
    expiresAt: optIso(row.expires_at),
    plan: row.plan_json,
    validationErrors: row.validation_errors ?? [],
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  };
}

function mapWorkflow(row: QueryResultRow): G05WorkflowImport {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    id: row.id,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    workflowVersion: Number(row.workflow_version),
    canvasGraphRevision: row.canvas_graph_revision,
    sourceDigest: row.source_digest,
    validationStatus: row.validation_status,
    validationErrors: row.validation_errors ?? [],
    definition: row.definition,
    endpointMappings: row.endpoint_mappings ?? [],
    trustPlanId: row.trust_plan_id ?? null,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  };
}

function mapTestPlan(row: QueryResultRow): G05TestPlan {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    id: row.id,
    version: Number(row.version),
    targetId: row.target_id,
    targetRevision: Number(row.target_revision),
    trustPlanId: row.trust_plan_id ?? null,
    workflowImportId: row.workflow_import_id ?? null,
    profile: row.profile,
    categories: row.categories,
    cases: row.cases,
    planDigest: row.plan_digest,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  };
}

function mapRun(row: QueryResultRow): G05Run {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    id: row.id,
    idempotencyKey: row.idempotency_key,
    fingerprint: row.fingerprint,
    testPlanId: row.test_plan_id,
    targetId: row.target_id,
    targetRevision: Number(row.target_revision),
    grantId: row.grant_id,
    trustPlanId: row.trust_plan_id ?? null,
    workflowImportId: row.workflow_import_id ?? null,
    retestOfRunId: row.retest_of_run_id ?? null,
    retestCaseIds: row.retest_case_ids ?? null,
    status: row.status,
    scannerVersion: row.scanner_version,
    scopeDigest: row.scope_digest,
    evidenceDigest: row.evidence_digest ?? null,
    executedRequests: Number(row.executed_requests),
    maxRequests: Number(row.max_requests),
    cleanupStatus: row.cleanup_status,
    summary: row.summary as G05RunSummary,
    coverage: row.coverage as G05RunCoverage,
    revision: Number(row.revision),
    startedAt: optIso(row.started_at),
    finishedAt: optIso(row.finished_at),
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapCaseResult(row: QueryResultRow): G05CaseResult {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    runId: row.run_id,
    caseId: row.case_id,
    category: row.category,
    invariantFamily: row.invariant_family ?? null,
    actorRole: row.actor_role,
    httpMethod: row.http_method,
    requestPath: row.request_path,
    status: row.status,
    severity: row.severity,
    expectedBehavior: row.expected_behavior,
    observedBehavior: row.observed_behavior,
    preState: row.pre_state ?? null,
    postState: row.post_state ?? null,
    cleanupStatus: row.cleanup_status,
    cleanupReceipt: row.cleanup_receipt ?? null,
    evidenceDigest: row.evidence_digest,
    executedRequests: Number(row.executed_requests),
    startedAt: iso(row.started_at),
    finishedAt: iso(row.finished_at),
  };
}

function mapFinding(row: QueryResultRow): G05Finding {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    id: row.id,
    runId: row.run_id,
    caseId: row.case_id,
    engine: row.engine,
    title: row.title,
    severity: row.severity,
    confidence: row.confidence,
    status: row.status,
    endpoint: row.endpoint,
    invariantFamily: row.invariant_family ?? null,
    summary: row.summary,
    evidence: row.evidence,
    retestOfFindingId: row.retest_of_finding_id ?? null,
    triageReason: row.triage_reason ?? null,
    triagedBy: row.triaged_by ?? null,
    triagedAt: optIso(row.triaged_at),
    revision: Number(row.revision),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapReport(row: QueryResultRow): G05Report {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    id: row.id,
    runId: row.run_id,
    runRevision: Number(row.run_revision),
    targetId: row.target_id,
    targetRevision: Number(row.target_revision),
    reportDigest: row.report_digest,
    body: row.body,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  };
}

export class G05PostgresStore {
  constructor(readonly db: PlatformDatabase) {
    if (db.module !== "guard") throw new G05StoreError("forbidden", 503);
  }

  private async writeAudit(
    tx: TransactionContext,
    scope: G05Scope,
    actor: string,
    action: string,
    subject: string | null,
    detail: Record<string, unknown>,
  ) {
    const safeDetail = redactG05JsonValue(detail);
    await this.db.query(
      tx,
      "INSERT INTO guard.g05_audit(workspace_id,project_id,actor,action,subject,detail) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
      [scope.workspaceId, scope.projectId, actor, action, subject, JSON.stringify(safeDetail)],
    );
  }

  async audit(
    scope: G05Scope,
    actor: string,
    action: string,
    subject: string | null,
    detail: Record<string, unknown> = {},
  ) {
    await this.db.scoped(liveScope(scope), async (tx) => {
      await this.writeAudit(tx, scope, actor, action, subject, detail);
    });
  }

  async listAudit(scope: G05Scope, limit = 30): Promise<G05AuditEntry[]> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        "SELECT id,workspace_id,project_id,at,actor,action,subject,detail FROM guard.g05_audit WHERE workspace_id=$1 AND project_id=$2 ORDER BY id DESC LIMIT $3",
        [scope.workspaceId, scope.projectId, Math.min(100, Math.max(1, limit))],
      );
      return r.rows.map((row) => ({
        id: Number(row.id),
        workspaceId: row.workspace_id,
        projectId: row.project_id,
        at: iso(row.at),
        actor: row.actor,
        action: row.action,
        subject: row.subject ?? null,
        detail: row.detail ?? {},
      }));
    });
  }

  async saveTarget(
    scope: G05Scope,
    input: {
      id: string;
      name: string;
      environment: G05TargetEnvironment;
      origin: string;
      serviceIdentity: string | null;
      owner: string;
      status: "draft" | "active" | "revoked";
      config: G05TargetConfig;
      expectedRevision: number;
      actor: string;
      reason: string;
    },
  ): Promise<G05TargetRecord> {
    const targetDigest = fingerprint({
      id: input.id,
      environment: input.environment,
      origin: input.origin,
      serviceIdentity: input.serviceIdentity,
      config: input.config,
      status: input.status,
    });
    return this.db.scoped(liveScope(scope), async (tx) => {
      const existing = await this.db.query(
        tx,
        "SELECT revision FROM guard.g05_targets WHERE workspace_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE",
        [scope.workspaceId, scope.projectId, input.id],
      );
      const currentRev = existing.rows[0] ? Number(existing.rows[0].revision) : 0;
      if (currentRev !== input.expectedRevision)
        throw new G05StoreError("revision_conflict", 409);
      const nextRev = currentRev + 1;

      const row =
        currentRev === 0
          ? await this.db.query(
              tx,
              `INSERT INTO guard.g05_targets(workspace_id,project_id,id,revision,name,environment,origin,service_identity,owner,status,config,target_digest,created_by,updated_by)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$13) RETURNING *`,
              [
                scope.workspaceId,
                scope.projectId,
                input.id,
                nextRev,
                input.name,
                input.environment,
                input.origin,
                input.serviceIdentity,
                input.owner,
                input.status,
                JSON.stringify(input.config),
                targetDigest,
                input.actor,
              ],
            )
          : await this.db.query(
              tx,
              `UPDATE guard.g05_targets
               SET revision=$4,name=$5,environment=$6,origin=$7,service_identity=$8,owner=$9,status=$10,config=$11::jsonb,target_digest=$12,updated_by=$13,updated_at=clock_timestamp()
               WHERE workspace_id=$1 AND project_id=$2 AND id=$3 AND revision=$14 RETURNING *`,
              [
                scope.workspaceId,
                scope.projectId,
                input.id,
                nextRev,
                input.name,
                input.environment,
                input.origin,
                input.serviceIdentity,
                input.owner,
                input.status,
                JSON.stringify(input.config),
                targetDigest,
                input.actor,
                currentRev,
              ],
            );

      await this.db.query(
        tx,
        `INSERT INTO guard.g05_target_revisions(workspace_id,project_id,target_id,revision,environment,origin,service_identity,config,target_digest,changed_by,reason)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`,
        [
          scope.workspaceId,
          scope.projectId,
          input.id,
          nextRev,
          input.environment,
          input.origin,
          input.serviceIdentity,
          JSON.stringify(input.config),
          targetDigest,
          input.actor,
          redactG05Text(input.reason),
        ],
      );
      await this.writeAudit(tx, scope, input.actor, "target_saved", input.id, {
        revision: nextRev,
        environment: input.environment,
        status: input.status,
        targetDigest,
      });
      return mapTarget(row.rows[0]);
    });
  }

  async getTarget(scope: G05Scope, targetId: string): Promise<G05TargetRecord | null> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_targets WHERE workspace_id=$1 AND project_id=$2 AND id=$3",
        [scope.workspaceId, scope.projectId, targetId],
      );
      return r.rows[0] ? mapTarget(r.rows[0]) : null;
    });
  }

  async listTargets(scope: G05Scope): Promise<G05TargetRecord[]> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_targets WHERE workspace_id=$1 AND project_id=$2 ORDER BY updated_at DESC, id LIMIT 25",
        [scope.workspaceId, scope.projectId],
      );
      return r.rows.map(mapTarget);
    });
  }

  async issueGrant(
    scope: G05Scope,
    input: {
      targetId: string;
      consentActor: string;
      proofId: string;
      authorizationRef: string;
      approvedCategories: G05TargetConfig["approvedCategories"];
      expiresAt: string;
    },
  ): Promise<G05ExecutionGrant> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const tr = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_targets WHERE workspace_id=$1 AND project_id=$2 AND id=$3 FOR SHARE",
        [scope.workspaceId, scope.projectId, input.targetId],
      );
      const targetRow = tr.rows[0];
      if (!targetRow || targetRow.status !== "active")
        throw new G05StoreError("grant_invalid", 409);
      const target = mapTarget(targetRow);
      if (
        !input.approvedCategories.length ||
        input.approvedCategories.some((c) => !target.config.approvedCategories.includes(c))
      )
        throw new G05StoreError("grant_invalid", 422);

      const id = fingerprint({
        scope,
        targetId: target.id,
        targetRevision: target.revision,
        targetDigest: target.targetDigest,
        consentActor: input.consentActor,
        proofId: input.proofId,
        authorizationRef: input.authorizationRef,
        approvedCategories: input.approvedCategories,
        expiresAt: input.expiresAt,
      });
      const existing = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_execution_grants WHERE workspace_id=$1 AND project_id=$2 AND id=$3",
        [scope.workspaceId, scope.projectId, id],
      );
      if (existing.rows[0]) return mapGrant(existing.rows[0]);

      const r = await this.db.query(
        tx,
        `INSERT INTO guard.g05_execution_grants(workspace_id,project_id,id,target_id,target_revision,target_digest,consent_actor,proof_id,authorization_ref,approved_categories,status,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,'active',$11) RETURNING *`,
        [
          scope.workspaceId,
          scope.projectId,
          id,
          target.id,
          target.revision,
          target.targetDigest,
          input.consentActor,
          input.proofId,
          input.authorizationRef,
          JSON.stringify(input.approvedCategories),
          input.expiresAt,
        ],
      );
      await this.writeAudit(tx, scope, input.consentActor, "grant_issued", id, {
        targetId: target.id,
        targetRevision: target.revision,
        expiresAt: input.expiresAt,
      });
      return mapGrant(r.rows[0]);
    });
  }

  async revokeGrant(
    scope: G05Scope,
    grantId: string,
    actor: string,
    reason: string,
  ): Promise<G05ExecutionGrant> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        `UPDATE guard.g05_execution_grants
         SET status='revoked',revoked_at=clock_timestamp(),revoked_by=$4,revoke_reason=$5
         WHERE workspace_id=$1 AND project_id=$2 AND id=$3 RETURNING *`,
        [scope.workspaceId, scope.projectId, grantId, actor, redactG05Text(reason)],
      );
      if (!r.rows[0]) throw new G05StoreError("not_found", 404);
      await this.writeAudit(tx, scope, actor, "grant_revoked", grantId, {
        reason: redactG05Text(reason),
      });
      return mapGrant(r.rows[0]);
    });
  }

  async getGrant(scope: G05Scope, grantId: string): Promise<G05ExecutionGrant | null> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_execution_grants WHERE workspace_id=$1 AND project_id=$2 AND id=$3",
        [scope.workspaceId, scope.projectId, grantId],
      );
      return r.rows[0] ? mapGrant(r.rows[0]) : null;
    });
  }

  async listGrants(scope: G05Scope): Promise<G05ExecutionGrant[]> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_execution_grants WHERE workspace_id=$1 AND project_id=$2 ORDER BY created_at DESC LIMIT 30",
        [scope.workspaceId, scope.projectId],
      );
      return r.rows.map(mapGrant);
    });
  }

  async saveTestAccount(
    scope: G05Scope,
    input: {
      id: string;
      targetId: string;
      role: G05TestAccountView["role"];
      customRoleName: string | null;
      label: string;
      usernameRef: string;
      authStrategy: G05TestAccountView["authStrategy"];
      loginPath: string | null;
      credentialCiphertext: string | null;
      credentialFingerprint: string | null;
      expiresAt: string;
      actor: string;
    },
  ): Promise<G05TestAccountView> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const t = await this.db.query(
        tx,
        "SELECT id FROM guard.g05_targets WHERE workspace_id=$1 AND project_id=$2 AND id=$3",
        [scope.workspaceId, scope.projectId, input.targetId],
      );
      if (!t.rows[0]) throw new G05StoreError("not_found", 404);
      const r = await this.db.query(
        tx,
        `INSERT INTO guard.g05_test_accounts(
          workspace_id,project_id,id,target_id,role,custom_role_name,label,synthetic,username_ref,auth_strategy,login_path,
          credential_ciphertext,credential_fingerprint,status,expires_at,created_by,updated_by
        ) VALUES($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$11,$12,'configured',$13,$14,$14)
        ON CONFLICT(workspace_id,project_id,id) DO UPDATE SET
          target_id=EXCLUDED.target_id,role=EXCLUDED.role,custom_role_name=EXCLUDED.custom_role_name,label=EXCLUDED.label,
          username_ref=EXCLUDED.username_ref,auth_strategy=EXCLUDED.auth_strategy,login_path=EXCLUDED.login_path,
          credential_ciphertext=EXCLUDED.credential_ciphertext,credential_fingerprint=EXCLUDED.credential_fingerprint,
          status='configured',expires_at=EXCLUDED.expires_at,revoked_at=NULL,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp()
        RETURNING workspace_id,project_id,id,target_id,role,custom_role_name,label,synthetic,username_ref,auth_strategy,login_path,(credential_ciphertext IS NOT NULL) AS has_ciphertext,credential_fingerprint,status,expires_at,last_verified_at,revoked_at,created_by,updated_by,created_at,updated_at`,
        [
          scope.workspaceId,
          scope.projectId,
          input.id,
          input.targetId,
          input.role,
          input.customRoleName,
          input.label,
          input.usernameRef,
          input.authStrategy,
          input.loginPath,
          input.credentialCiphertext,
          input.credentialFingerprint,
          input.expiresAt,
          input.actor,
        ],
      );
      await this.writeAudit(tx, scope, input.actor, "test_account_configured", input.id, {
        targetId: input.targetId,
        role: input.role,
        authStrategy: input.authStrategy,
      });
      return mapAccountView(r.rows[0]);
    });
  }

  async revokeTestAccount(
    scope: G05Scope,
    accountId: string,
    actor: string,
  ): Promise<G05TestAccountView> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        `UPDATE guard.g05_test_accounts
         SET status='revoked',revoked_at=clock_timestamp(),updated_by=$4,updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND project_id=$2 AND id=$3
         RETURNING workspace_id,project_id,id,target_id,role,custom_role_name,label,synthetic,username_ref,auth_strategy,login_path,(credential_ciphertext IS NOT NULL) AS has_ciphertext,credential_fingerprint,status,expires_at,last_verified_at,revoked_at,created_by,updated_by,created_at,updated_at`,
        [scope.workspaceId, scope.projectId, accountId, actor],
      );
      if (!r.rows[0]) throw new G05StoreError("not_found", 404);
      await this.writeAudit(tx, scope, actor, "test_account_revoked", accountId, {});
      return mapAccountView(r.rows[0]);
    });
  }

  async listTestAccounts(scope: G05Scope, targetId?: string): Promise<G05TestAccountView[]> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        `SELECT workspace_id,project_id,id,target_id,role,custom_role_name,label,synthetic,username_ref,auth_strategy,login_path,
         (credential_ciphertext IS NOT NULL) AS has_ciphertext,credential_fingerprint,status,expires_at,last_verified_at,revoked_at,created_by,updated_by,created_at,updated_at
         FROM guard.g05_test_accounts
         WHERE workspace_id=$1 AND project_id=$2 AND ($3::text IS NULL OR target_id=$3)
         ORDER BY role, id LIMIT 30`,
        [scope.workspaceId, scope.projectId, targetId ?? null],
      );
      return r.rows.map(mapAccountView);
    });
  }

  /** Worker-only retrieval of sealed credentials for an approved target. App handlers never call this. */
  async loadSealedAccountsForWorker(
    scope: G05Scope,
    targetId: string,
  ): Promise<(G05TestAccountView & { credentialCiphertext: string | null })[]> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      this.db.requireWorker(tx);
      const r = await this.db.query(
        tx,
        `SELECT *,(credential_ciphertext IS NOT NULL) AS has_ciphertext
         FROM guard.g05_test_accounts
         WHERE workspace_id=$1 AND project_id=$2 AND target_id=$3 AND status IN ('configured','active') AND revoked_at IS NULL AND expires_at > clock_timestamp()`,
        [scope.workspaceId, scope.projectId, targetId],
      );
      return r.rows.map((row) => ({
        ...mapAccountView(row),
        credentialCiphertext: row.credential_ciphertext ?? null,
      }));
    });
  }

  async markAccountStateWorker(
    scope: G05Scope,
    accountId: string,
    status: G05TestAccountView["status"],
  ) {
    await this.db.scoped(liveScope(scope), async (tx) => {
      this.db.requireWorker(tx);
      await this.db.query(
        tx,
        `UPDATE guard.g05_test_accounts
         SET status=$4,last_verified_at=CASE WHEN $4='active' THEN clock_timestamp() ELSE last_verified_at END,updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND project_id=$2 AND id=$3 AND status <> 'revoked'`,
        [scope.workspaceId, scope.projectId, accountId, status],
      );
    });
  }

  async saveTrustPlan(
    scope: G05Scope,
    plan: Omit<G05CanvasTrustPlan, "workspaceId" | "projectId" | "createdAt">,
  ): Promise<G05CanvasTrustPlan> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const existing = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_trust_plans WHERE workspace_id=$1 AND project_id=$2 AND id=$3",
        [scope.workspaceId, scope.projectId, plan.id],
      );
      if (existing.rows[0]) return mapTrustPlan(existing.rows[0]);
      const r = await this.db.query(
        tx,
        `INSERT INTO guard.g05_trust_plans(
          workspace_id,project_id,id,canvas_graph_revision,plan_version,target_commit,source_plan_digest,
          integration_status,confirmed,confirmed_by,confirmed_at,expires_at,plan_json,validation_errors,created_by
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15) RETURNING *`,
        [
          scope.workspaceId,
          scope.projectId,
          plan.id,
          plan.canvasGraphRevision,
          plan.planVersion,
          plan.targetCommit,
          plan.sourcePlanDigest,
          plan.integrationStatus,
          plan.confirmed,
          plan.confirmedBy,
          plan.confirmedAt,
          plan.expiresAt,
          JSON.stringify(plan.plan),
          JSON.stringify(plan.validationErrors),
          plan.createdBy,
        ],
      );
      await this.writeAudit(tx, scope, plan.createdBy, "trust_plan_imported", plan.id, {
        integrationStatus: plan.integrationStatus,
        planVersion: plan.planVersion,
        confirmed: plan.confirmed,
      });
      return mapTrustPlan(r.rows[0]);
    });
  }

  async listTrustPlans(scope: G05Scope): Promise<G05CanvasTrustPlan[]> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_trust_plans WHERE workspace_id=$1 AND project_id=$2 ORDER BY created_at DESC LIMIT 20",
        [scope.workspaceId, scope.projectId],
      );
      return r.rows.map(mapTrustPlan);
    });
  }

  async getTrustPlan(scope: G05Scope, id: string): Promise<G05CanvasTrustPlan | null> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_trust_plans WHERE workspace_id=$1 AND project_id=$2 AND id=$3",
        [scope.workspaceId, scope.projectId, id],
      );
      return r.rows[0] ? mapTrustPlan(r.rows[0]) : null;
    });
  }

  async saveWorkflowImport(
    scope: G05Scope,
    wf: Omit<G05WorkflowImport, "workspaceId" | "projectId" | "createdAt">,
  ): Promise<G05WorkflowImport> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const existing = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_workflow_imports WHERE workspace_id=$1 AND project_id=$2 AND id=$3",
        [scope.workspaceId, scope.projectId, wf.id],
      );
      if (existing.rows[0]) return mapWorkflow(existing.rows[0]);
      const r = await this.db.query(
        tx,
        `INSERT INTO guard.g05_workflow_imports(
          workspace_id,project_id,id,workflow_id,workflow_name,workflow_version,canvas_graph_revision,
          source_digest,validation_status,validation_errors,definition,endpoint_mappings,trust_plan_id,created_by
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14) RETURNING *`,
        [
          scope.workspaceId,
          scope.projectId,
          wf.id,
          wf.workflowId,
          wf.workflowName,
          wf.workflowVersion,
          wf.canvasGraphRevision,
          wf.sourceDigest,
          wf.validationStatus,
          JSON.stringify(wf.validationErrors),
          JSON.stringify(wf.definition),
          JSON.stringify(wf.endpointMappings),
          wf.trustPlanId,
          wf.createdBy,
        ],
      );
      await this.writeAudit(tx, scope, wf.createdBy, "workflow_imported", wf.id, {
        workflowId: wf.workflowId,
        validationStatus: wf.validationStatus,
      });
      return mapWorkflow(r.rows[0]);
    });
  }

  async listWorkflowImports(scope: G05Scope): Promise<G05WorkflowImport[]> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_workflow_imports WHERE workspace_id=$1 AND project_id=$2 ORDER BY created_at DESC LIMIT 20",
        [scope.workspaceId, scope.projectId],
      );
      return r.rows.map(mapWorkflow);
    });
  }

  async getWorkflowImport(scope: G05Scope, id: string): Promise<G05WorkflowImport | null> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_workflow_imports WHERE workspace_id=$1 AND project_id=$2 AND id=$3",
        [scope.workspaceId, scope.projectId, id],
      );
      return r.rows[0] ? mapWorkflow(r.rows[0]) : null;
    });
  }

  async saveTestPlan(
    scope: G05Scope,
    plan: Omit<G05TestPlan, "workspaceId" | "projectId" | "createdAt">,
  ): Promise<G05TestPlan> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const existing = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_test_plans WHERE workspace_id=$1 AND project_id=$2 AND id=$3",
        [scope.workspaceId, scope.projectId, plan.id],
      );
      if (existing.rows[0]) return mapTestPlan(existing.rows[0]);
      const r = await this.db.query(
        tx,
        `INSERT INTO guard.g05_test_plans(
          workspace_id,project_id,id,version,target_id,target_revision,trust_plan_id,workflow_import_id,profile,categories,cases,plan_digest,created_by
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13) RETURNING *`,
        [
          scope.workspaceId,
          scope.projectId,
          plan.id,
          plan.version,
          plan.targetId,
          plan.targetRevision,
          plan.trustPlanId,
          plan.workflowImportId,
          plan.profile,
          JSON.stringify(plan.categories),
          JSON.stringify(plan.cases),
          plan.planDigest,
          plan.createdBy,
        ],
      );
      await this.writeAudit(tx, scope, plan.createdBy, "test_plan_generated", plan.id, {
        targetId: plan.targetId,
        targetRevision: plan.targetRevision,
        caseCount: plan.cases.length,
        profile: plan.profile,
      });
      return mapTestPlan(r.rows[0]);
    });
  }

  async getTestPlan(scope: G05Scope, id: string): Promise<G05TestPlan | null> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_test_plans WHERE workspace_id=$1 AND project_id=$2 AND id=$3",
        [scope.workspaceId, scope.projectId, id],
      );
      return r.rows[0] ? mapTestPlan(r.rows[0]) : null;
    });
  }

  async listTestPlans(scope: G05Scope): Promise<G05TestPlan[]> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_test_plans WHERE workspace_id=$1 AND project_id=$2 ORDER BY created_at DESC LIMIT 20",
        [scope.workspaceId, scope.projectId],
      );
      return r.rows.map(mapTestPlan);
    });
  }

  async enqueueRun(
    scope: G05Scope,
    input: {
      idempotencyKey: string;
      testPlanId: string;
      targetId: string;
      targetRevision: number;
      grantId: string;
      trustPlanId: string | null;
      workflowImportId: string | null;
      retestOfRunId: string | null;
      retestCaseIds: string[] | null;
      scopeDigest: string;
      maxRequests: number;
      maxAttempts: number;
      actor: string;
      totalCases: number;
      targetEnvironment: G05TargetEnvironment;
      tlsApplicable: boolean;
      localSyntheticPinned: boolean;
    },
  ): Promise<{ run: G05Run; duplicate: boolean }> {
    const id = fingerprint({
      scope,
      idempotencyKey: input.idempotencyKey,
    });
    const runFp = fingerprint({
      scope,
      testPlanId: input.testPlanId,
      targetId: input.targetId,
      targetRevision: input.targetRevision,
      grantId: input.grantId,
      retestOfRunId: input.retestOfRunId,
      retestCaseIds: input.retestCaseIds,
    });
    const initialSummary: G05RunSummary = {
      totalCases: input.totalCases,
      passed: 0,
      failed: 0,
      inconclusive: 0,
      notExecuted: input.totalCases,
      cancelled: 0,
      cleanupFailed: 0,
      findingsCreated: 0,
      decision: "INCOMPLETE",
    };
    const initialCoverage: G05RunCoverage = {
      executedCategories: [],
      skippedCategories: [],
      invariantsVerified: [],
      invariantsFailed: [],
      targetEnvironment: input.targetEnvironment,
      tlsApplicable: input.tlsApplicable,
      localSyntheticPinned: input.localSyntheticPinned,
    };

    return this.db.scoped(liveScope(scope), async (tx) => {
      await this.db.query(
        tx,
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [fingerprint([scope.workspaceId, scope.projectId, "g05-run-admission"])],
      );
      const existing = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_runs WHERE workspace_id=$1 AND project_id=$2 AND idempotency_key=$3 FOR UPDATE",
        [scope.workspaceId, scope.projectId, input.idempotencyKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].fingerprint !== runFp)
          throw new G05StoreError("revision_conflict", 409);
        return { run: mapRun(existing.rows[0]), duplicate: true };
      }

      const createdAt = new Date().toISOString();
      const inserted = await this.db.query(
        tx,
        `INSERT INTO guard.g05_runs(
          workspace_id,project_id,id,idempotency_key,fingerprint,test_plan_id,target_id,target_revision,grant_id,
          trust_plan_id,workflow_import_id,retest_of_run_id,retest_case_ids,status,scanner_version,scope_digest,
          executed_requests,max_requests,cleanup_status,summary,coverage,created_by,created_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,'queued',$14,$15,0,$16,'pending',$17::jsonb,$18::jsonb,$19,$20) RETURNING *`,
        [
          scope.workspaceId,
          scope.projectId,
          id,
          input.idempotencyKey,
          runFp,
          input.testPlanId,
          input.targetId,
          input.targetRevision,
          input.grantId,
          input.trustPlanId,
          input.workflowImportId,
          input.retestOfRunId,
          input.retestCaseIds ? JSON.stringify(input.retestCaseIds) : null,
          G05_SCANNER_VERSION,
          input.scopeDigest,
          input.maxRequests,
          JSON.stringify(initialSummary),
          JSON.stringify(initialCoverage),
          input.actor,
          createdAt,
        ],
      );
      await new G05PostgresQueue(this.db, scope, id).enqueue(tx, {
        schemaVersion: 1,
        module: "guard",
        mode: "live",
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        jobId: id,
        kind: G05_JOB_KIND,
        subjectRef: id,
        idempotencyKey: input.idempotencyKey,
        revision: 1,
        attempts: 0,
        maxAttempts: input.maxAttempts,
        availableAt: createdAt,
        cancelRequested: false,
      });
      await this.writeAudit(tx, scope, input.actor, "run_queued", id, {
        testPlanId: input.testPlanId,
        targetId: input.targetId,
        targetRevision: input.targetRevision,
        grantId: input.grantId,
        retestOfRunId: input.retestOfRunId,
      });
      return { run: mapRun(inserted.rows[0]), duplicate: false };
    });
  }

  async getRun(scope: G05Scope, runId: string): Promise<G05Run | null> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_runs WHERE workspace_id=$1 AND project_id=$2 AND id=$3 AND retention_until>clock_timestamp()",
        [scope.workspaceId, scope.projectId, runId],
      );
      return r.rows[0] ? mapRun(r.rows[0]) : null;
    });
  }

  async listRuns(scope: G05Scope, limit = 25): Promise<G05Run[]> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_runs WHERE workspace_id=$1 AND project_id=$2 AND retention_until>clock_timestamp() ORDER BY created_at DESC LIMIT $3",
        [scope.workspaceId, scope.projectId, Math.min(50, Math.max(1, limit))],
      );
      return r.rows.map(mapRun);
    });
  }

  async cancelRun(scope: G05Scope, runId: string, actor: string): Promise<G05Run> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_runs WHERE workspace_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE",
        [scope.workspaceId, scope.projectId, runId],
      );
      if (!r.rows[0]) throw new G05StoreError("not_found", 404);
      const current = mapRun(r.rows[0]);
      if (["completed", "completed_partial", "failed", "timed_out", "cancelled"].includes(current.status))
        return current;

      await this.db.query(
        tx,
        `UPDATE platform.jobs SET cancel_requested=true,state='cancelled',finished_at=clock_timestamp(),lease_owner=NULL,lease_token=NULL,lease_until=NULL,revision=revision+1
         WHERE module='guard' AND mode='live' AND workspace_id=$1 AND project_id=$2 AND job_id=$3 AND state IN ('queued','leased')`,
        [scope.workspaceId, scope.projectId, runId],
      );
      await this.db.query(
        tx,
        `UPDATE platform.job_attempts SET outcome='cancelled',finished_at=clock_timestamp()
         WHERE module='guard' AND mode='live' AND workspace_id=$1 AND project_id=$2 AND job_id=$3 AND finished_at IS NULL`,
        [scope.workspaceId, scope.projectId, runId],
      );
      const updated = await this.db.query(
        tx,
        `UPDATE guard.g05_runs SET status='cancelled',finished_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND project_id=$2 AND id=$3 RETURNING *`,
        [scope.workspaceId, scope.projectId, runId],
      );
      await this.writeAudit(tx, scope, actor, "run_cancelled", runId, {});
      return mapRun(updated.rows[0]);
    });
  }

  private async assertActiveLease(tx: TransactionContext, lease: JobLease) {
    this.db.requireWorker(tx);
    const r = await this.db.query(
      tx,
      `SELECT job_id FROM platform.jobs
       WHERE module='guard' AND mode='live' AND workspace_id=$1 AND project_id=$2 AND job_id=$3
       AND lease_owner=$4 AND lease_token=$5 AND lease_until>clock_timestamp() AND state='leased' AND NOT cancel_requested`,
      [
        lease.job.workspaceId,
        lease.job.projectId,
        lease.job.jobId,
        lease.workerId,
        lease.leaseToken,
      ],
    );
    if (!r.rowCount) throw new G05StoreError("lease_lost", 409);
  }

  async startRunWorker(lease: JobLease): Promise<G05Run> {
    const scope = {
      workspaceId: lease.job.workspaceId,
      projectId: lease.job.projectId,
    };
    return this.db.scoped(liveScope(scope), async (tx) => {
      await this.assertActiveLease(tx, lease);
      const r = await this.db.query(
        tx,
        `UPDATE guard.g05_runs
         SET status='running',started_at=COALESCE(started_at,clock_timestamp()),revision=revision+1,updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND project_id=$2 AND id=$3 AND status IN ('queued','running') RETURNING *`,
        [scope.workspaceId, scope.projectId, lease.job.subjectRef],
      );
      if (!r.rows[0]) throw new G05StoreError("revision_conflict", 409);
      await this.writeAudit(tx, scope, lease.workerId, "run_started", lease.job.subjectRef, {
        attempt: lease.job.attempts,
      });
      return mapRun(r.rows[0]);
    });
  }

  async saveCaseResultWorker(lease: JobLease, result: G05CaseResult): Promise<void> {
    const scope = {
      workspaceId: lease.job.workspaceId,
      projectId: lease.job.projectId,
    };
    await this.db.scoped(liveScope(scope), async (tx) => {
      await this.assertActiveLease(tx, lease);
      await this.db.query(
        tx,
        `INSERT INTO guard.g05_case_results(
          workspace_id,project_id,run_id,case_id,category,invariant_family,actor_role,http_method,request_path,status,severity,
          expected_behavior,observed_behavior,pre_state,post_state,cleanup_status,cleanup_receipt,evidence_digest,executed_requests,started_at,finished_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16,$17::jsonb,$18,$19,$20,$21)
        ON CONFLICT(workspace_id,project_id,run_id,case_id) DO NOTHING`,
        [
          scope.workspaceId,
          scope.projectId,
          result.runId,
          result.caseId,
          result.category,
          result.invariantFamily,
          result.actorRole,
          result.httpMethod,
          result.requestPath,
          result.status,
          result.severity,
          JSON.stringify(result.expectedBehavior),
          JSON.stringify(result.observedBehavior),
          result.preState ? JSON.stringify(result.preState) : null,
          result.postState ? JSON.stringify(result.postState) : null,
          result.cleanupStatus,
          result.cleanupReceipt ? JSON.stringify(result.cleanupReceipt) : null,
          result.evidenceDigest,
          result.executedRequests,
          result.startedAt,
          result.finishedAt,
        ],
      );
    });
  }

  async saveFindingWorker(
    lease: JobLease,
    finding: Omit<G05Finding, "revision" | "createdAt" | "updatedAt">,
  ): Promise<void> {
    const scope = {
      workspaceId: lease.job.workspaceId,
      projectId: lease.job.projectId,
    };
    await this.db.scoped(liveScope(scope), async (tx) => {
      await this.assertActiveLease(tx, lease);
      await this.db.query(
        tx,
        `INSERT INTO guard.g05_findings(
          workspace_id,project_id,id,run_id,case_id,engine,title,severity,confidence,status,endpoint,invariant_family,summary,evidence,retest_of_finding_id
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15)
        ON CONFLICT(workspace_id,project_id,id) DO UPDATE SET
          run_id=EXCLUDED.run_id,case_id=EXCLUDED.case_id,severity=EXCLUDED.severity,confidence=EXCLUDED.confidence,
          status=EXCLUDED.status,summary=EXCLUDED.summary,evidence=guard.g05_findings.evidence||EXCLUDED.evidence,
          retest_of_finding_id=COALESCE(EXCLUDED.retest_of_finding_id,guard.g05_findings.retest_of_finding_id),
          revision=guard.g05_findings.revision+1,updated_at=clock_timestamp()`,
        [
          scope.workspaceId,
          scope.projectId,
          finding.id,
          finding.runId,
          finding.caseId,
          finding.engine,
          redactG05Text(finding.title).slice(0, 400),
          finding.severity,
          finding.confidence,
          finding.status,
          finding.endpoint,
          finding.invariantFamily,
          redactG05Text(finding.summary),
          JSON.stringify(finding.evidence),
          finding.retestOfFindingId,
        ],
      );
    });
  }

  async markFindingVerifiedFixedWorker(
    lease: JobLease,
    input: {
      findingId: string;
      caseId: string;
      evidence: Record<string, unknown>;
    },
  ): Promise<void> {
    const scope = {
      workspaceId: lease.job.workspaceId,
      projectId: lease.job.projectId,
    };
    await this.db.scoped(liveScope(scope), async (tx) => {
      await this.assertActiveLease(tx, lease);
      const r = await this.db.query(
        tx,
        `UPDATE guard.g05_findings
         SET status='verified_fixed',
             run_id=$4,
             evidence=evidence||$5::jsonb,
             revision=revision+1,
             updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND project_id=$2 AND id=$3
           AND status IN ('verified','fix_pending_retest','under_review','potential')
         RETURNING id`,
        [
          scope.workspaceId,
          scope.projectId,
          input.findingId,
          lease.job.subjectRef,
          JSON.stringify([input.evidence]),
        ],
      );
      if (r.rowCount) {
        await this.writeAudit(tx, scope, lease.workerId, "finding_verified_fixed", input.findingId, {
          retestRunId: lease.job.subjectRef,
          caseId: input.caseId,
        });
      }
    });
  }

  async listPendingScopes(
    limit = 20,
  ): Promise<{ workspaceId: string; projectId: string; runId: string }[]> {
    return this.db.transaction(async (tx) => {
      this.db.requireWorker(tx);
      const r = await this.db.query(
        tx,
        "SELECT workspace_id, project_id, run_id FROM guard.g05_pending_scopes($1)",
        [Math.min(50, Math.max(1, limit))],
      );
      return r.rows.map((row) => ({
        workspaceId: row.workspace_id,
        projectId: row.project_id,
        runId: row.run_id,
      }));
    });
  }

  async failRunWorker(
    lease: JobLease,
    input: {
      status: "failed" | "timed_out";
      errorCode: string;
      executedRequests: number;
      cleanupStatus: G05Run["cleanupStatus"];
      evidenceDigest: string;
      summary: G05RunSummary;
      coverage: G05RunCoverage;
    },
  ): Promise<G05Run> {
    const scope = {
      workspaceId: lease.job.workspaceId,
      projectId: lease.job.projectId,
    };
    return this.db.scoped(liveScope(scope), async (tx) => {
      await this.assertActiveLease(tx, lease);
      const r = await this.db.query(
        tx,
        `UPDATE guard.g05_runs
         SET status=$4,executed_requests=$5,cleanup_status=$6,evidence_digest=$7,summary=$8::jsonb,coverage=$9::jsonb,
             finished_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND project_id=$2 AND id=$3 AND status IN ('queued','running') RETURNING *`,
        [
          scope.workspaceId,
          scope.projectId,
          lease.job.subjectRef,
          input.status,
          input.executedRequests,
          input.cleanupStatus,
          input.evidenceDigest,
          JSON.stringify(input.summary),
          JSON.stringify(input.coverage),
        ],
      );
      if (!r.rows[0]) throw new G05StoreError("revision_conflict", 409);
      const safeErr = redactG05Text(input.errorCode).slice(0, 64);
      const attemptOutcome =
        input.status === "timed_out"
          ? "handler_timeout"
          : safeErr === "not_configured"
            ? "not_configured"
            : "handler_failed";
      await this.db.query(
        tx,
        `UPDATE platform.jobs SET state='failed',finished_at=clock_timestamp(),last_error=$6,
         lease_owner=NULL,lease_token=NULL,lease_until=NULL,revision=revision+1
         WHERE module='guard' AND mode='live' AND workspace_id=$1 AND project_id=$2 AND job_id=$3
         AND lease_owner=$4 AND lease_token=$5 AND state='leased'`,
        [
          scope.workspaceId,
          scope.projectId,
          lease.job.jobId,
          lease.workerId,
          lease.leaseToken,
          safeErr,
        ],
      );
      await this.db.query(
        tx,
        `UPDATE platform.job_attempts SET outcome=$6,finished_at=clock_timestamp()
         WHERE module='guard' AND mode='live' AND workspace_id=$1 AND project_id=$2 AND job_id=$3 AND attempt=$4 AND lease_token=$5 AND finished_at IS NULL`,
        [
          scope.workspaceId,
          scope.projectId,
          lease.job.jobId,
          lease.job.attempts,
          lease.leaseToken,
          attemptOutcome,
        ],
      );
      await this.writeAudit(tx, scope, lease.workerId, "run_failed", lease.job.subjectRef, {
        status: input.status,
        errorCode: safeErr,
        executedRequests: input.executedRequests,
        cleanupStatus: input.cleanupStatus,
      });
      return mapRun(r.rows[0]);
    });
  }

  async finalizeCancelledRunWorker(
    scope: G05Scope,
    runId: string,
    workerId: string,
    input: {
      executedRequests: number;
      cleanupStatus: G05Run["cleanupStatus"];
      evidenceDigest: string;
      summary: G05RunSummary;
      coverage: G05RunCoverage;
    },
  ): Promise<G05Run | null> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      this.db.requireWorker(tx);
      const r = await this.db.query(
        tx,
        `UPDATE guard.g05_runs
         SET status='cancelled',executed_requests=$3,cleanup_status=$4,evidence_digest=$5,summary=$6::jsonb,coverage=$7::jsonb,
             finished_at=COALESCE(finished_at,clock_timestamp()),revision=revision+1,updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND project_id=$2 AND id=$8 AND status IN ('queued','running','cancelled') RETURNING *`,
        [
          scope.workspaceId,
          scope.projectId,
          input.executedRequests,
          input.cleanupStatus,
          input.evidenceDigest,
          JSON.stringify(input.summary),
          JSON.stringify(input.coverage),
          runId,
        ],
      );
      if (!r.rows[0]) return null;
      await this.writeAudit(tx, scope, workerId, "run_cancelled_finalized", runId, {
        executedRequests: input.executedRequests,
        cleanupStatus: input.cleanupStatus,
      });
      return mapRun(r.rows[0]);
    });
  }

  async finishRunWorker(
    lease: JobLease,
    input: {
      status: G05RunStatus;
      executedRequests: number;
      cleanupStatus: G05Run["cleanupStatus"];
      evidenceDigest: string;
      summary: G05RunSummary;
      coverage: G05RunCoverage;
    },
  ): Promise<G05Run> {
    const scope = {
      workspaceId: lease.job.workspaceId,
      projectId: lease.job.projectId,
    };
    return this.db.scoped(liveScope(scope), async (tx) => {
      await this.assertActiveLease(tx, lease);
      const r = await this.db.query(
        tx,
        `UPDATE guard.g05_runs
         SET status=$4,executed_requests=$5,cleanup_status=$6,evidence_digest=$7,summary=$8::jsonb,coverage=$9::jsonb,
             finished_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND project_id=$2 AND id=$3 AND status IN ('queued','running') RETURNING *`,
        [
          scope.workspaceId,
          scope.projectId,
          lease.job.subjectRef,
          input.status,
          input.executedRequests,
          input.cleanupStatus,
          input.evidenceDigest,
          JSON.stringify(input.summary),
          JSON.stringify(input.coverage),
        ],
      );
      if (!r.rows[0]) throw new G05StoreError("revision_conflict", 409);
      await new G05PostgresQueue(this.db, scope, lease.job.jobId).completeInTransaction(tx, lease);
      await this.writeAudit(tx, scope, lease.workerId, "run_finished", lease.job.subjectRef, {
        status: input.status,
        executedRequests: input.executedRequests,
        cleanupStatus: input.cleanupStatus,
        decision: input.summary.decision,
      });
      return mapRun(r.rows[0]);
    });
  }

  async listCaseResults(scope: G05Scope, runId: string): Promise<G05CaseResult[]> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_case_results WHERE workspace_id=$1 AND project_id=$2 AND run_id=$3 ORDER BY started_at, case_id",
        [scope.workspaceId, scope.projectId, runId],
      );
      return r.rows.map(mapCaseResult);
    });
  }

  async listFindings(scope: G05Scope, runId?: string): Promise<G05Finding[]> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        `SELECT * FROM guard.g05_findings
         WHERE workspace_id=$1 AND project_id=$2 AND ($3::text IS NULL OR run_id=$3)
         ORDER BY updated_at DESC, id LIMIT 100`,
        [scope.workspaceId, scope.projectId, runId ?? null],
      );
      return r.rows.map(mapFinding);
    });
  }

  async triageFinding(
    scope: G05Scope,
    findingId: string,
    input: {
      expectedRevision: number;
      status: G05FindingStatus;
      reason: string;
      actor: string;
    },
  ): Promise<G05Finding> {
    if (input.reason.trim().length < 8 || input.reason.length > 1000)
      throw new G05StoreError("invalid_input", 400);
    return this.db.scoped(liveScope(scope), async (tx) => {
      const safeReason = redactG05Text(input.reason.trim());
      const r = await this.db.query(
        tx,
        `UPDATE guard.g05_findings
         SET status=$5,triage_reason=$6,triaged_by=$7,triaged_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND project_id=$2 AND id=$3 AND revision=$4 RETURNING *`,
        [
          scope.workspaceId,
          scope.projectId,
          findingId,
          input.expectedRevision,
          input.status,
          safeReason,
          input.actor,
        ],
      );
      if (!r.rows[0]) {
        const exists = await this.db.query(
          tx,
          "SELECT id FROM guard.g05_findings WHERE workspace_id=$1 AND project_id=$2 AND id=$3",
          [scope.workspaceId, scope.projectId, findingId],
        );
        throw new G05StoreError(
          exists.rows[0] ? "revision_conflict" : "not_found",
          exists.rows[0] ? 409 : 404,
        );
      }
      await this.writeAudit(tx, scope, input.actor, "finding_triaged", findingId, {
        status: input.status,
      });
      return mapFinding(r.rows[0]);
    });
  }

  async saveReport(
    scope: G05Scope,
    report: Omit<G05Report, "workspaceId" | "projectId" | "createdAt">,
  ): Promise<G05Report> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const existing = await this.db.query(
        tx,
        "SELECT * FROM guard.g05_reports WHERE workspace_id=$1 AND project_id=$2 AND id=$3",
        [scope.workspaceId, scope.projectId, report.id],
      );
      if (existing.rows[0]) return mapReport(existing.rows[0]);
      const r = await this.db.query(
        tx,
        `INSERT INTO guard.g05_reports(workspace_id,project_id,id,run_id,run_revision,target_id,target_revision,report_digest,body,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) RETURNING *`,
        [
          scope.workspaceId,
          scope.projectId,
          report.id,
          report.runId,
          report.runRevision,
          report.targetId,
          report.targetRevision,
          report.reportDigest,
          JSON.stringify(report.body),
          report.createdBy,
        ],
      );
      await this.writeAudit(tx, scope, report.createdBy, "report_saved", report.id, {
        runId: report.runId,
        runRevision: report.runRevision,
      });
      return mapReport(r.rows[0]);
    });
  }

  async listReports(scope: G05Scope, runId?: string): Promise<G05Report[]> {
    return this.db.scoped(liveScope(scope), async (tx) => {
      const r = await this.db.query(
        tx,
        `SELECT * FROM guard.g05_reports
         WHERE workspace_id=$1 AND project_id=$2 AND ($3::text IS NULL OR run_id=$3)
         ORDER BY created_at DESC LIMIT 20`,
        [scope.workspaceId, scope.projectId, runId ?? null],
      );
      return r.rows.map(mapReport);
    });
  }
}
