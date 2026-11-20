import type { PlatformDatabase } from "../../../platform/database";
import type { TransactionContext } from "../../sentinel/platform-contracts";
import type { Scope } from "../contracts";
import { fingerprint } from "../../../platform/identity";
import type { Decision, SecurityPolicy, TriggerSource } from "./policy";
import { policyDigest, validatePolicy } from "./policy";

/** Fixed, secret-free error codes (the HTTP layer maps these; no SQL/driver text ever leaves this module). */
export class G04Error extends Error {
  constructor(
    readonly code: "not_found" | "revision_conflict" | "invalid_input" | "limit_exceeded" | "ambiguous_route",
    readonly status = 400,
  ) {
    super(code);
  }
}
export type TriggerStatus = "pending" | "running" | "completed" | "failed" | "superseded" | "skipped" | "cancelled";
export interface PolicyRecord {
  workspaceId: string;
  projectId: string;
  repositoryId: string;
  repositoryName: string;
  installationId: number;
  installationState: "active" | "suspended" | "deleted" | "repository_removed";
  ownerActor: string;
  ownerUserId: number;
  policy: SecurityPolicy;
  policyDigest: string;
  revision: number;
  updatedAt: string;
  updatedBy: string;
}
export interface TriggerRecord {
  id: string;
  source: TriggerSource;
  deliveryId: string | null;
  scheduleId: string | null;
  repositoryId: string;
  installationId: number;
  branch: string;
  protectBranch: string;
  commit: string;
  prNumber: number | null;
  policyRevision: number;
  status: TriggerStatus;
  scanId: string | null;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  note: string | null;
  idempotencyKey: string;
  actor: string;
  createdAt: string;
  updatedAt: string;
}
export interface NewTrigger {
  source: TriggerSource;
  deliveryId?: string;
  scheduleId?: string;
  repositoryId: string;
  installationId: number;
  branch: string;
  protectBranch: string;
  commit: string;
  prNumber?: number;
  policyRevision: number;
  idempotencyKey: string;
  actor: string;
  status?: "pending" | "skipped";
  note?: string;
}
export interface EvaluationRecord {
  id: string;
  triggerId: string;
  scanId: string;
  commit: string;
  branch: string;
  policyRevision: number;
  decision: Decision;
  evaluation: unknown;
  enforcement: unknown;
  supersededBy: string | null;
  createdAt: string;
}
export interface CheckRecord {
  commit: string;
  externalId: string;
  checkRunId: string | null;
  htmlUrl: string | null;
  status: "queued" | "in_progress" | "completed";
  conclusion: string | null;
  decision: Decision | null;
  triggerId: string | null;
  evaluationId: string | null;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  published: boolean;
  updatedAt: string;
}
export interface ScheduleRecord {
  id: string;
  enabled: boolean;
  cadence: unknown;
  branch: string;
  profile: "quick" | "standard" | "full";
  nextRunAt: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastTriggerId: string | null;
  consecutiveFailures: number;
  revision: number;
  createdBy: string;
}
export interface DeploymentRecord {
  provider: string;
  deploymentId: string;
  environment: string;
  commit: string | null;
  state: string;
  evaluationId: string | null;
  decision: string | null;
  info: unknown;
  enforcement: unknown;
  providerError: string | null;
  verifiedAt: string;
}
export interface Work {
  kind: "trigger" | "check" | "schedule";
  workspaceId: string;
  projectId: string;
  ref: string;
}
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? null : String(v));
const sc = (s: Pick<Scope, "workspaceId" | "projectId">): Scope => ({ mode: "live", workspaceId: s.workspaceId, projectId: s.projectId });
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- pg rows, mapped explicitly below

export class G04Store {
  constructor(private readonly db: PlatformDatabase) {}
  private q<T>(scope: Pick<Scope, "workspaceId" | "projectId">, work: (run: (sql: string, v?: unknown[]) => Promise<Row[]>) => Promise<T>) {
    return this.db.scoped(sc(scope), (tx: TransactionContext) => work(async (sql, v = []) => (await this.db.query(tx, sql, v)).rows as Row[]));
  }
  private intake<T>(work: (run: (sql: string, v?: unknown[]) => Promise<Row[]>) => Promise<T>) {
    return this.db.transaction((tx) => work(async (sql, v = []) => (await this.db.query(tx, sql, v)).rows as Row[]));
  }

  // ---- intake (unscoped): deliveries, routing, audit -------------------------------------------------------
  async recordDelivery(d: { deliveryId: string; event: string; action: string | null; payloadSha256: string; repositoryId: string | null; installationId: number | null }): Promise<{ state: "new" | "duplicate" | "conflict"; outcome: string }> {
    return this.intake(async (run) => {
      const ins = await run("INSERT INTO guard.g04_deliveries(delivery_id,event,action,payload_sha256,repository_id,installation_id,outcome) VALUES($1,$2,$3,$4,$5,$6,'received') ON CONFLICT(delivery_id) DO NOTHING RETURNING delivery_id", [d.deliveryId, d.event, d.action, d.payloadSha256, d.repositoryId, d.installationId]);
      if (ins.length) return { state: "new" as const, outcome: "received" };
      const row = (await run("SELECT payload_sha256, outcome FROM guard.g04_deliveries WHERE delivery_id=$1 FOR UPDATE", [d.deliveryId]))[0];
      if (row.payload_sha256.trim() !== d.payloadSha256) return { state: "conflict" as const, outcome: row.outcome as string }; // same delivery id, different bytes: tampering or a replay of a forged body
      await run("UPDATE guard.g04_deliveries SET attempts=least(attempts+1,20) WHERE delivery_id=$1", [d.deliveryId]);
      return { state: "duplicate" as const, outcome: row.outcome as string };
    });
  }
  async finishDelivery(deliveryId: string, outcome: "accepted" | "duplicate" | "ignored" | "rejected" | "failed", reason: string, scope?: Pick<Scope, "workspaceId" | "projectId">) {
    await this.intake((run) => run("UPDATE guard.g04_deliveries SET outcome=$2, reason=$3, workspace_id=coalesce($4,workspace_id), project_id=coalesce($5,project_id) WHERE delivery_id=$1", [deliveryId, outcome, reason.slice(0, 200), scope?.workspaceId ?? null, scope?.projectId ?? null]));
  }
  async route(repositoryId: string) {
    const rows = await this.intake((run) => run("SELECT * FROM guard.g04_route($1)", [repositoryId]));
    if (rows.length > 1) throw new G04Error("ambiguous_route", 409);
    return rows[0] ? { workspaceId: rows[0].workspace_id as string, projectId: rows[0].project_id as string, installationId: Number(rows[0].installation_id), installationState: rows[0].installation_state as PolicyRecord["installationState"], revision: rows[0].revision as number } : null;
  }
  async installationScopes(installationId: number) {
    return (await this.intake((run) => run("SELECT * FROM guard.g04_installation_scopes($1)", [installationId]))).map((r) => ({ workspaceId: r.workspace_id as string, projectId: r.project_id as string, repositoryId: r.repository_id as string }));
  }
  async audit(scope: Pick<Scope, "workspaceId" | "projectId"> | null, actor: string, action: string, subject: string | null, detail: Record<string, unknown> = {}) {
    const text = JSON.stringify(detail);
    if (text.length > 7000) detail = { truncated: true };
    const run = (r: (sql: string, v?: unknown[]) => Promise<Row[]>) => r("INSERT INTO guard.g04_audit(workspace_id,project_id,actor,action,subject,detail) VALUES($1,$2,$3,$4,$5,$6)", [scope?.workspaceId ?? null, scope?.projectId ?? null, actor, action.slice(0, 80), subject?.slice(0, 200) ?? null, detail]);
    await (scope ? this.q(scope, run) : this.intake(run));
  }
  async recentAudit(scope: Pick<Scope, "workspaceId" | "projectId">, limit = 50) {
    return this.q(scope, async (run) => (await run("SELECT id::text,at,actor,action,subject,detail FROM guard.g04_audit WHERE workspace_id=$1 AND project_id=$2 ORDER BY id DESC LIMIT $3", [scope.workspaceId, scope.projectId, limit])).map((r) => ({ id: r.id as string, at: iso(r.at)!, actor: r.actor as string, action: r.action as string, subject: r.subject as string | null, detail: r.detail as unknown })));
  }
  async recentDeliveries(scope: Pick<Scope, "workspaceId" | "projectId">, limit = 20) {
    return this.q(scope, async (run) => (await run("SELECT delivery_id,event,action,outcome,reason,attempts,received_at FROM guard.g04_deliveries WHERE workspace_id=$1 AND project_id=$2 ORDER BY received_at DESC LIMIT $3", [scope.workspaceId, scope.projectId, limit])).map((r) => ({ deliveryId: r.delivery_id as string, event: r.event as string, action: r.action as string | null, outcome: r.outcome as string, reason: r.reason as string | null, attempts: r.attempts as number, receivedAt: iso(r.received_at)! })));
  }

  // ---- policy ---------------------------------------------------------------------------------------------
  private policyRow(r: Row): PolicyRecord {
    return { workspaceId: r.workspace_id, projectId: r.project_id, repositoryId: r.repository_id, repositoryName: r.repository_name, installationId: Number(r.installation_id), installationState: r.installation_state, ownerActor: r.owner_actor, ownerUserId: Number(r.owner_user_id), policy: validatePolicy(r.policy), policyDigest: r.policy_digest.trim(), revision: r.revision, updatedAt: iso(r.updated_at)!, updatedBy: r.updated_by };
  }
  getPolicy(scope: Pick<Scope, "workspaceId" | "projectId">) {
    return this.q(scope, async (run) => {
      const r = (await run("SELECT * FROM guard.g04_policies WHERE workspace_id=$1 AND project_id=$2", [scope.workspaceId, scope.projectId]))[0];
      return r ? this.policyRow(r) : null;
    });
  }
  /** Optimistic: `expectedRevision` is 0 for creation. Every change appends an immutable revision row in the same transaction. */
  savePolicy(scope: Pick<Scope, "workspaceId" | "projectId">, identity: { repositoryId: string; repositoryName: string; installationId: number; ownerActor: string; ownerUserId: number }, policy: SecurityPolicy, expectedRevision: number, actor: string, reason: string) {
    const valid = validatePolicy(policy),
      digest = policyDigest(valid);
    return this.q(scope, async (run) => {
      const cur = (await run("SELECT revision FROM guard.g04_policies WHERE workspace_id=$1 AND project_id=$2 FOR UPDATE", [scope.workspaceId, scope.projectId]))[0];
      if ((cur?.revision ?? 0) !== expectedRevision) throw new G04Error("revision_conflict", 409);
      const revision = expectedRevision + 1;
      try {
        if (!cur) await run("INSERT INTO guard.g04_policies(workspace_id,project_id,repository_id,repository_name,installation_id,owner_actor,owner_user_id,policy,policy_digest,revision,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10)", [scope.workspaceId, scope.projectId, identity.repositoryId, identity.repositoryName, identity.installationId, identity.ownerActor, identity.ownerUserId, valid, digest, actor]);
        else await run("UPDATE guard.g04_policies SET policy=$3, policy_digest=$4, revision=$5, updated_at=clock_timestamp(), updated_by=$6, installation_id=$7, repository_name=$8, installation_state='active' WHERE workspace_id=$1 AND project_id=$2", [scope.workspaceId, scope.projectId, valid, digest, revision, actor, identity.installationId, identity.repositoryName]);
      } catch (e) {
        // unique index: another workspace already automates this repository
        if ((e as { code?: string }).code === "23505") throw new G04Error("limit_exceeded", 409);
        throw e;
      }
      await run("INSERT INTO guard.g04_policy_revisions(workspace_id,project_id,revision,policy,policy_digest,changed_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7)", [scope.workspaceId, scope.projectId, revision, valid, digest, actor, reason.slice(0, 500)]);
      return revision;
    });
  }
  policyHistory(scope: Pick<Scope, "workspaceId" | "projectId">, limit = 30) {
    return this.q(scope, async (run) => (await run("SELECT revision,policy_digest,changed_by,changed_at,reason,policy FROM guard.g04_policy_revisions WHERE workspace_id=$1 AND project_id=$2 ORDER BY revision DESC LIMIT $3", [scope.workspaceId, scope.projectId, limit])).map((r) => ({ revision: r.revision as number, digest: r.policy_digest.trim() as string, changedBy: r.changed_by as string, changedAt: iso(r.changed_at)!, reason: r.reason as string, policy: r.policy as SecurityPolicy })));
  }
  setInstallationState(scope: Pick<Scope, "workspaceId" | "projectId">, state: PolicyRecord["installationState"]) {
    return this.q(scope, async (run) => {
      await run("UPDATE guard.g04_policies SET installation_state=$3, updated_at=clock_timestamp() WHERE workspace_id=$1 AND project_id=$2", [scope.workspaceId, scope.projectId, state]);
    });
  }

  // ---- triggers --------------------------------------------------------------------------------------------
  private triggerRow(r: Row): TriggerRecord {
    return { id: r.id.trim(), source: r.source, deliveryId: r.delivery_id, scheduleId: r.schedule_id, repositoryId: r.repository_id, installationId: Number(r.installation_id), branch: r.branch, protectBranch: r.protect_branch, commit: r.commit_sha.trim(), prNumber: r.pr_number, policyRevision: r.policy_revision, status: r.status, scanId: r.scan_id?.trim() ?? null, attempts: r.attempts, nextAttemptAt: iso(r.next_attempt_at)!, lastError: r.last_error, note: r.note, idempotencyKey: r.idempotency_key, actor: r.actor, createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)! };
  }
  /**
   * Idempotent on (scope, idempotencyKey). A new pending trigger supersedes older pending/running triggers of the SAME
   * pull request (or, for pushes/schedules, the same branch) at a different commit, so only the newest revision is gated.
   */
  insertTrigger(scope: Pick<Scope, "workspaceId" | "projectId">, t: NewTrigger) {
    const id = fingerprint({ scope: [scope.workspaceId, scope.projectId], key: t.idempotencyKey });
    return this.q(scope, async (run) => {
      const ins = await run(
        "INSERT INTO guard.g04_triggers(workspace_id,project_id,id,source,delivery_id,schedule_id,repository_id,installation_id,branch,protect_branch,commit_sha,pr_number,policy_revision,status,idempotency_key,actor,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT(workspace_id,project_id,idempotency_key) DO NOTHING RETURNING *",
        [scope.workspaceId, scope.projectId, id, t.source, t.deliveryId ?? null, t.scheduleId ?? null, t.repositoryId, t.installationId, t.branch, t.protectBranch, t.commit, t.prNumber ?? null, t.policyRevision, t.status ?? "pending", t.idempotencyKey, t.actor, t.note ?? null],
      );
      if (!ins.length) return { created: false, trigger: this.triggerRow((await run("SELECT * FROM guard.g04_triggers WHERE workspace_id=$1 AND project_id=$2 AND idempotency_key=$3", [scope.workspaceId, scope.projectId, t.idempotencyKey]))[0]), superseded: [] as string[] };
      let superseded: string[] = [];
      if (t.source !== "manual" && t.source !== "check_rerun" && (t.status ?? "pending") === "pending") {
        const older = await run(
          t.prNumber
            ? "UPDATE guard.g04_triggers SET status='superseded', note='superseded_by:'||$3, updated_at=clock_timestamp() WHERE workspace_id=$1 AND project_id=$2 AND status IN('pending','running') AND pr_number=$4 AND commit_sha<>$3 AND id<>$5 RETURNING id,commit_sha"
            : "UPDATE guard.g04_triggers SET status='superseded', note='superseded_by:'||$3, updated_at=clock_timestamp() WHERE workspace_id=$1 AND project_id=$2 AND status IN('pending','running') AND pr_number IS NULL AND branch=$4 AND commit_sha<>$3 AND id<>$5 RETURNING id,commit_sha",
          [scope.workspaceId, scope.projectId, t.commit, t.prNumber ?? t.branch, id],
        );
        superseded = older.map((r) => r.id.trim());
        for (const o of older) await run("UPDATE guard.g04_evaluations SET superseded_by=$3 WHERE workspace_id=$1 AND project_id=$2 AND commit_sha=$4 AND superseded_by IS NULL", [scope.workspaceId, scope.projectId, t.commit, o.commit_sha]);
      }
      return { created: true, trigger: this.triggerRow(ins[0]), superseded };
    });
  }
  getTrigger(scope: Pick<Scope, "workspaceId" | "projectId">, id: string) {
    return this.q(scope, async (run) => {
      const r = (await run("SELECT * FROM guard.g04_triggers WHERE workspace_id=$1 AND project_id=$2 AND id=$3", [scope.workspaceId, scope.projectId, id]))[0];
      return r ? this.triggerRow(r) : null;
    });
  }
  listTriggers(scope: Pick<Scope, "workspaceId" | "projectId">, limit = 30) {
    return this.q(scope, async (run) => (await run("SELECT * FROM guard.g04_triggers WHERE workspace_id=$1 AND project_id=$2 ORDER BY created_at DESC LIMIT $3", [scope.workspaceId, scope.projectId, limit])).map((r) => this.triggerRow(r)));
  }
  /** Atomic lease: only a pending-and-due or lease-expired trigger can be claimed, and only up to maxAttempts. */
  claimTrigger(scope: Pick<Scope, "workspaceId" | "projectId">, id: string, leaseMs: number, maxAttempts: number) {
    return this.q(scope, async (run) => {
      const r = (await run("UPDATE guard.g04_triggers SET status='running', attempts=attempts+1, lease_until=clock_timestamp()+($4||' milliseconds')::interval, updated_at=clock_timestamp() WHERE workspace_id=$1 AND project_id=$2 AND id=$3 AND attempts<$5 AND ((status='pending' AND next_attempt_at<=clock_timestamp()) OR (status='running' AND lease_until<clock_timestamp())) RETURNING *", [scope.workspaceId, scope.projectId, id, String(leaseMs), maxAttempts]))[0];
      return r ? this.triggerRow(r) : null;
    });
  }
  failExhausted(scope: Pick<Scope, "workspaceId" | "projectId">, id: string, maxAttempts: number) {
    return this.q(scope, async (run) => {
      const r = (await run("UPDATE guard.g04_triggers SET status='failed', last_error='retries_exhausted', lease_until=NULL, updated_at=clock_timestamp() WHERE workspace_id=$1 AND project_id=$2 AND id=$3 AND attempts>=$4 AND ((status='running' AND lease_until<clock_timestamp()) OR (status='pending' AND next_attempt_at<=clock_timestamp())) RETURNING *", [scope.workspaceId, scope.projectId, id, maxAttempts]))[0];
      return r ? this.triggerRow(r) : null;
    });
  }
  /** One automatic replacement scan after a stranded scan was recovered: new scan identity on the next claim, attempt refunded. */
  resetScanForRecovery(scope: Pick<Scope, "workspaceId" | "projectId">, id: string) {
    return this.q(scope, async (run) => (await run("UPDATE guard.g04_triggers SET status='pending', scan_id=NULL, note='scan_recovery:1', attempts=greatest(attempts-1,0), next_attempt_at=clock_timestamp(), lease_until=NULL, updated_at=clock_timestamp() WHERE workspace_id=$1 AND project_id=$2 AND id=$3 AND status='running' RETURNING id", [scope.workspaceId, scope.projectId, id])).length === 1);
  }
  /** Only while still `running`: a superseded/cancelled trigger is never resurrected by a late worker. */
  finishTrigger(scope: Pick<Scope, "workspaceId" | "projectId">, id: string, patch: { status: "pending" | "completed" | "failed" | "skipped"; scanId?: string | null; lastError?: string | null; retryInMs?: number; note?: string | null; /** waiting for a running scan is not a failed attempt */ refundAttempt?: boolean }) {
    return this.q(scope, async (run) => {
      const r = await run("UPDATE guard.g04_triggers SET status=$4, attempts=CASE WHEN $9 THEN greatest(attempts-1,0) ELSE attempts END, scan_id=coalesce($5,scan_id), last_error=$6, next_attempt_at=clock_timestamp()+($7||' milliseconds')::interval, lease_until=NULL, note=coalesce($8,note), updated_at=clock_timestamp() WHERE workspace_id=$1 AND project_id=$2 AND id=$3 AND status='running' RETURNING id", [scope.workspaceId, scope.projectId, id, patch.status, patch.scanId ?? null, patch.lastError ?? null, String(patch.retryInMs ?? 0), patch.note ?? null, patch.refundAttempt === true]);
      return r.length === 1;
    });
  }
  setScan(scope: Pick<Scope, "workspaceId" | "projectId">, id: string, scanId: string) {
    return this.q(scope, async (run) => {
      await run("UPDATE guard.g04_triggers SET scan_id=$4, updated_at=clock_timestamp() WHERE workspace_id=$1 AND project_id=$2 AND id=$3 AND status='running'", [scope.workspaceId, scope.projectId, id, scanId]);
    });
  }
  cancelTrigger(scope: Pick<Scope, "workspaceId" | "projectId">, id: string) {
    return this.q(scope, async (run) => (await run("UPDATE guard.g04_triggers SET status='cancelled', lease_until=NULL, updated_at=clock_timestamp() WHERE workspace_id=$1 AND project_id=$2 AND id=$3 AND status IN('pending','running') RETURNING id", [scope.workspaceId, scope.projectId, id])).length === 1);
  }
  /** Closed pull request: nothing queued for it should run. */
  cancelPullRequest(scope: Pick<Scope, "workspaceId" | "projectId">, prNumber: number) {
    return this.q(scope, async (run) => (await run("UPDATE guard.g04_triggers SET status='cancelled', note='pull_request_closed', lease_until=NULL, updated_at=clock_timestamp() WHERE workspace_id=$1 AND project_id=$2 AND pr_number=$3 AND status IN('pending','running') RETURNING id", [scope.workspaceId, scope.projectId, prNumber])).length);
  }
  cancelAllOpen(scope: Pick<Scope, "workspaceId" | "projectId">, note: string) {
    return this.q(scope, async (run) => (await run("UPDATE guard.g04_triggers SET status='cancelled', note=$3, lease_until=NULL, updated_at=clock_timestamp() WHERE workspace_id=$1 AND project_id=$2 AND status IN('pending','running') RETURNING id", [scope.workspaceId, scope.projectId, note])).length);
  }
  /** Concurrency/rate bounds for admission: running triggers and triggers created in the last hour. */
  load(scope: Pick<Scope, "workspaceId" | "projectId">) {
    return this.q(scope, async (run) => {
      const r = (await run("SELECT count(*) FILTER (WHERE status='running')::int running, count(*) FILTER (WHERE status='pending')::int pending, count(*) FILTER (WHERE created_at>clock_timestamp()-interval '1 hour')::int lasthour FROM guard.g04_triggers WHERE workspace_id=$1 AND project_id=$2", [scope.workspaceId, scope.projectId]))[0];
      return { running: r.running as number, pending: r.pending as number, lastHour: r.lasthour as number };
    });
  }

  // ---- evaluations / checks ---------------------------------------------------------------------------------
  private evalRow(r: Row): EvaluationRecord {
    return { id: r.id.trim(), triggerId: r.trigger_id.trim(), scanId: r.scan_id.trim(), commit: r.commit_sha.trim(), branch: r.branch, policyRevision: r.policy_revision, decision: r.decision, evaluation: r.evaluation, enforcement: r.enforcement, supersededBy: r.superseded_by?.trim() ?? null, createdAt: iso(r.created_at)! };
  }
  saveEvaluation(scope: Pick<Scope, "workspaceId" | "projectId">, e: Omit<EvaluationRecord, "id" | "supersededBy" | "createdAt"> & { digest: string }) {
    const id = fingerprint({ scope: [scope.workspaceId, scope.projectId], trigger: e.triggerId, scan: e.scanId, digest: e.digest });
    return this.q(scope, async (run) => {
      await run("INSERT INTO guard.g04_evaluations(workspace_id,project_id,id,trigger_id,scan_id,commit_sha,branch,policy_revision,decision,evaluation,enforcement) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(workspace_id,project_id,trigger_id,scan_id) DO UPDATE SET id=excluded.id, decision=excluded.decision, evaluation=excluded.evaluation, policy_revision=excluded.policy_revision", [scope.workspaceId, scope.projectId, id, e.triggerId, e.scanId, e.commit, e.branch, e.policyRevision, e.decision, e.evaluation, e.enforcement ?? {}]);
      return (await run("SELECT * FROM guard.g04_evaluations WHERE workspace_id=$1 AND project_id=$2 AND trigger_id=$3 AND scan_id=$4", [scope.workspaceId, scope.projectId, e.triggerId, e.scanId])).map((r) => this.evalRow(r))[0];
    });
  }
  updateEnforcement(scope: Pick<Scope, "workspaceId" | "projectId">, evaluationId: string, enforcement: unknown) {
    return this.q(scope, async (run) => {
      await run("UPDATE guard.g04_evaluations SET enforcement=$4 WHERE workspace_id=$1 AND project_id=$2 AND id=$3", [scope.workspaceId, scope.projectId, evaluationId, enforcement]);
    });
  }
  latestEvaluation(scope: Pick<Scope, "workspaceId" | "projectId">, commit: string) {
    return this.q(scope, async (run) => {
      const r = (await run("SELECT * FROM guard.g04_evaluations WHERE workspace_id=$1 AND project_id=$2 AND commit_sha=$3 ORDER BY created_at DESC LIMIT 1", [scope.workspaceId, scope.projectId, commit]))[0];
      return r ? this.evalRow(r) : null;
    });
  }
  listEvaluations(scope: Pick<Scope, "workspaceId" | "projectId">, limit = 30) {
    return this.q(scope, async (run) => (await run("SELECT * FROM guard.g04_evaluations WHERE workspace_id=$1 AND project_id=$2 ORDER BY created_at DESC LIMIT $3", [scope.workspaceId, scope.projectId, limit])).map((r) => this.evalRow(r)));
  }
  private checkRow(r: Row): CheckRecord {
    return { commit: r.commit_sha.trim(), externalId: r.external_id, checkRunId: r.github_check_run_id, htmlUrl: r.html_url, status: r.status, conclusion: r.conclusion, decision: r.decision, triggerId: r.trigger_id?.trim() ?? null, evaluationId: r.evaluation_id?.trim() ?? null, attempts: r.attempts, lastError: r.last_error, nextAttemptAt: iso(r.next_attempt_at)!, published: r.published, updatedAt: iso(r.updated_at)! };
  }
  /** Records the INTENT to publish (published=false) so a crash between GitHub and the database is retried, not lost. */
  planCheck(scope: Pick<Scope, "workspaceId" | "projectId">, c: { commit: string; externalId: string; status: CheckRecord["status"]; conclusion?: string | null; decision?: Decision | null; triggerId?: string | null; evaluationId?: string | null }) {
    return this.q(scope, async (run) => {
      const r = await run(
        "INSERT INTO guard.g04_check_runs(workspace_id,project_id,commit_sha,external_id,status,conclusion,decision,trigger_id,evaluation_id,published,attempts,next_attempt_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,false,0,clock_timestamp()) ON CONFLICT(workspace_id,project_id,commit_sha) DO UPDATE SET status=excluded.status, conclusion=excluded.conclusion, decision=excluded.decision, trigger_id=excluded.trigger_id, evaluation_id=excluded.evaluation_id, published=false, attempts=0, last_error=NULL, next_attempt_at=clock_timestamp(), updated_at=clock_timestamp() WHERE NOT (guard.g04_check_runs.status='completed' AND excluded.status<>'completed') AND NOT (guard.g04_check_runs.status='completed' AND guard.g04_check_runs.evaluation_id IS NOT NULL AND excluded.evaluation_id IS NULL) RETURNING *",
        [scope.workspaceId, scope.projectId, c.commit, c.externalId, c.status, c.conclusion ?? null, c.decision ?? null, c.triggerId ?? null, c.evaluationId ?? null],
      );
      return r.length ? this.checkRow(r[0]) : this.checkRow((await run("SELECT * FROM guard.g04_check_runs WHERE workspace_id=$1 AND project_id=$2 AND commit_sha=$3", [scope.workspaceId, scope.projectId, c.commit]))[0]);
    });
  }
  checkPublished(scope: Pick<Scope, "workspaceId" | "projectId">, commit: string, p: { checkRunId: string; htmlUrl: string | null }) {
    return this.q(scope, async (run) => {
      await run("UPDATE guard.g04_check_runs SET github_check_run_id=$4, html_url=$5, published=true, last_error=NULL, updated_at=clock_timestamp() WHERE workspace_id=$1 AND project_id=$2 AND commit_sha=$3", [scope.workspaceId, scope.projectId, commit, p.checkRunId, p.htmlUrl]);
    });
  }
  /** Exponential backoff, capped; `retryInMs` from GitHub (rate limit) wins when larger. */
  checkFailed(scope: Pick<Scope, "workspaceId" | "projectId">, commit: string, error: string, retryInMs?: number) {
    return this.q(scope, async (run) => {
      await run("UPDATE guard.g04_check_runs SET attempts=attempts+1, last_error=$4, next_attempt_at=clock_timestamp()+(greatest($5::bigint, least(3600000, 30000*power(2,least(attempts,6))::bigint))||' milliseconds')::interval, updated_at=clock_timestamp() WHERE workspace_id=$1 AND project_id=$2 AND commit_sha=$3", [scope.workspaceId, scope.projectId, commit, error.slice(0, 120), String(retryInMs ?? 0)]);
    });
  }
  getCheck(scope: Pick<Scope, "workspaceId" | "projectId">, commit: string) {
    return this.q(scope, async (run) => {
      const r = (await run("SELECT * FROM guard.g04_check_runs WHERE workspace_id=$1 AND project_id=$2 AND commit_sha=$3", [scope.workspaceId, scope.projectId, commit]))[0];
      return r ? this.checkRow(r) : null;
    });
  }
  listChecks(scope: Pick<Scope, "workspaceId" | "projectId">, limit = 30) {
    return this.q(scope, async (run) => (await run("SELECT * FROM guard.g04_check_runs WHERE workspace_id=$1 AND project_id=$2 ORDER BY updated_at DESC LIMIT $3", [scope.workspaceId, scope.projectId, limit])).map((r) => this.checkRow(r)));
  }

  // ---- provider mapping & deployments -----------------------------------------------------------------------
  getMapping(scope: Pick<Scope, "workspaceId" | "projectId">, provider = "vercel") {
    return this.q(scope, async (run) => {
      const r = (await run("SELECT config,enabled,updated_at,updated_by FROM guard.g04_provider_mappings WHERE workspace_id=$1 AND project_id=$2 AND provider=$3", [scope.workspaceId, scope.projectId, provider]))[0];
      return r ? { config: r.config as Record<string, unknown>, enabled: r.enabled as boolean, updatedAt: iso(r.updated_at)!, updatedBy: r.updated_by as string } : null;
    });
  }
  saveMapping(scope: Pick<Scope, "workspaceId" | "projectId">, provider: "vercel", config: Record<string, unknown>, actor: string) {
    return this.q(scope, async (run) => {
      await run("INSERT INTO guard.g04_provider_mappings(workspace_id,project_id,provider,config,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(workspace_id,project_id,provider) DO UPDATE SET config=excluded.config, enabled=true, updated_at=clock_timestamp(), updated_by=excluded.updated_by", [scope.workspaceId, scope.projectId, provider, config, actor]);
    });
  }
  saveDeployment(scope: Pick<Scope, "workspaceId" | "projectId">, d: Omit<DeploymentRecord, "verifiedAt">) {
    return this.q(scope, async (run) => {
      await run(
        "INSERT INTO guard.g04_deployments(workspace_id,project_id,provider,deployment_id,environment,commit_sha,state,evaluation_id,decision,info,enforcement,provider_error) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(workspace_id,project_id,provider,deployment_id) DO UPDATE SET environment=excluded.environment, commit_sha=excluded.commit_sha, state=excluded.state, evaluation_id=excluded.evaluation_id, decision=excluded.decision, info=excluded.info, enforcement=excluded.enforcement, provider_error=excluded.provider_error, verified_at=clock_timestamp()",
        [scope.workspaceId, scope.projectId, d.provider, d.deploymentId, d.environment, d.commit, d.state, d.evaluationId, d.decision, d.info, d.enforcement, d.providerError],
      );
    });
  }
  listDeployments(scope: Pick<Scope, "workspaceId" | "projectId">, limit = 20) {
    return this.q(scope, async (run) => (await run("SELECT * FROM guard.g04_deployments WHERE workspace_id=$1 AND project_id=$2 ORDER BY verified_at DESC LIMIT $3", [scope.workspaceId, scope.projectId, limit])).map((r): DeploymentRecord => ({ provider: r.provider, deploymentId: r.deployment_id, environment: r.environment, commit: r.commit_sha?.trim() ?? null, state: r.state, evaluationId: r.evaluation_id?.trim() ?? null, decision: r.decision, info: r.info, enforcement: r.enforcement, providerError: r.provider_error, verifiedAt: iso(r.verified_at)! })));
  }

  // ---- schedules -------------------------------------------------------------------------------------------
  private schedRow(r: Row): ScheduleRecord {
    return { id: r.id, enabled: r.enabled, cadence: r.cadence, branch: r.branch, profile: r.profile, nextRunAt: iso(r.next_run_at)!, lastRunAt: iso(r.last_run_at), lastStatus: r.last_status, lastTriggerId: r.last_trigger_id?.trim() ?? null, consecutiveFailures: r.consecutive_failures, revision: r.revision, createdBy: r.created_by };
  }
  listSchedules(scope: Pick<Scope, "workspaceId" | "projectId">) {
    return this.q(scope, async (run) => (await run("SELECT * FROM guard.g04_schedules WHERE workspace_id=$1 AND project_id=$2 ORDER BY id", [scope.workspaceId, scope.projectId])).map((r) => this.schedRow(r)));
  }
  getSchedule(scope: Pick<Scope, "workspaceId" | "projectId">, id: string) {
    return this.q(scope, async (run) => {
      const r = (await run("SELECT * FROM guard.g04_schedules WHERE workspace_id=$1 AND project_id=$2 AND id=$3", [scope.workspaceId, scope.projectId, id]))[0];
      return r ? this.schedRow(r) : null;
    });
  }
  saveSchedule(scope: Pick<Scope, "workspaceId" | "projectId">, s: { id: string; enabled: boolean; cadence: unknown; branch: string; profile: ScheduleRecord["profile"]; nextRunAt: Date; actor: string }, maxPerProject = 5) {
    return this.q(scope, async (run) => {
      const n = (await run("SELECT count(*)::int n, bool_or(id=$3) has FROM guard.g04_schedules WHERE workspace_id=$1 AND project_id=$2", [scope.workspaceId, scope.projectId, s.id]))[0];
      if (!n.has && n.n >= maxPerProject) throw new G04Error("limit_exceeded", 409);
      await run("INSERT INTO guard.g04_schedules(workspace_id,project_id,id,enabled,cadence,branch,profile,next_run_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(workspace_id,project_id,id) DO UPDATE SET enabled=excluded.enabled, cadence=excluded.cadence, branch=excluded.branch, profile=excluded.profile, next_run_at=excluded.next_run_at, revision=guard.g04_schedules.revision+1, consecutive_failures=0, updated_at=clock_timestamp()", [scope.workspaceId, scope.projectId, s.id, s.enabled, s.cadence, s.branch, s.profile, s.nextRunAt.toISOString(), s.actor]);
    });
  }
  /** Atomically advances next_run_at BEFORE enqueueing so overlapping dispatchers cannot both fire the same slot. */
  claimSchedule(scope: Pick<Scope, "workspaceId" | "projectId">, id: string, nextRunAt: Date) {
    return this.q(scope, async (run) => {
      const r = (await run("UPDATE guard.g04_schedules SET next_run_at=$4, last_run_at=clock_timestamp(), updated_at=clock_timestamp() WHERE workspace_id=$1 AND project_id=$2 AND id=$3 AND enabled AND next_run_at<=clock_timestamp() RETURNING *", [scope.workspaceId, scope.projectId, id, nextRunAt.toISOString()]))[0];
      return r ? this.schedRow(r) : null;
    });
  }
  scheduleResult(scope: Pick<Scope, "workspaceId" | "projectId">, id: string, status: string, triggerId: string | null, failed: boolean, maxFailures = 5) {
    return this.q(scope, async (run) => {
      await run("UPDATE guard.g04_schedules SET last_status=$4, last_trigger_id=coalesce($5,last_trigger_id), consecutive_failures=CASE WHEN $6 THEN consecutive_failures+1 ELSE 0 END, enabled=CASE WHEN $6 AND consecutive_failures+1>=$7 THEN false ELSE enabled END, updated_at=clock_timestamp() WHERE workspace_id=$1 AND project_id=$2 AND id=$3", [scope.workspaceId, scope.projectId, id, status.slice(0, 40), triggerId, failed, maxFailures]);
    });
  }
  disableSchedules(scope: Pick<Scope, "workspaceId" | "projectId">) {
    return this.q(scope, async (run) => (await run("UPDATE guard.g04_schedules SET enabled=false, last_status='authorization_revoked', updated_at=clock_timestamp() WHERE workspace_id=$1 AND project_id=$2 AND enabled RETURNING id", [scope.workspaceId, scope.projectId])).length);
  }

  // ---- worker discovery ------------------------------------------------------------------------------------
  async work(limit = 20): Promise<Work[]> {
    return (await this.intake((run) => run("SELECT kind,workspace_id,project_id,ref FROM guard.g04_work($1)", [limit]))).map((r) => ({ kind: r.kind, workspaceId: r.workspace_id, projectId: r.project_id, ref: r.ref }));
  }
}
