import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { PlatformDatabase } from "../../../platform/database";
import type { TransactionContext } from "../platform-contracts";
import { PlatformError } from "../../../platform/config";
import { fingerprint } from "../../../platform/identity";
import { PostgresQueue } from "../../../platform/queue";
import type { SentinelProjectContext, SentinelScope } from "../types";
import { TelemetryError } from "../telemetry/validation";
import { deterministicUuid } from "../incidents/validation";
import {
  activeStatuses,
  responseJobKinds,
  responseLimits,
  type ResponseAction,
  type ResponseAuditEvent,
  type ResponseAuditRecord,
  type ResponseStatus,
  type ResponseTarget,
} from "./model";
import { approverDenial, assertTransition, evaluatePolicy } from "./policy";
import {
  commandKey,
  responseCommand,
  type ResponseCommand,
} from "./validation";

const where = "mode=$1 AND workspace_id=$2 AND project_id=$3";
const sv = (s: SentinelScope) => [s.mode, s.workspaceId, s.projectId];
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
export const systemActor = "system:response-worker";

export class ResponsePolicyDenied extends TelemetryError {
  constructor(readonly reasons: string[]) {
    super("policy_denied", 422);
  }
}

function actionOf(r: QueryResultRow): ResponseAction {
  return {
    schemaVersion: 1,
    mode: "live",
    workspaceId: r.workspace_id,
    projectId: r.project_id,
    actionId: r.action_id,
    incidentId: r.incident_id,
    targetId: r.target_id,
    incidentOrigin: r.incident_origin,
    operation: r.operation,
    ttlSeconds: Number(r.ttl_seconds),
    status: r.status,
    proposedBy: r.proposed_by,
    approvedBy: r.approved_by ?? null,
    approvedAt: iso(r.approved_at),
    approvalExpiresAt: iso(r.approval_expires_at),
    appliedAt: iso(r.applied_at),
    expiresAt: iso(r.expires_at),
    policyReasons: r.policy_reasons ?? [],
    revision: Number(r.revision),
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
  };
}
function targetOf(r: QueryResultRow): ResponseTarget {
  return {
    mode: "live",
    workspaceId: r.workspace_id,
    projectId: r.project_id,
    targetId: r.target_id,
    kind: r.kind,
    origin: r.origin,
    maxTtlSeconds: Number(r.max_ttl_seconds),
    approverActorIds: r.approver_actor_ids,
    allowSelfApproval: r.allow_self_approval,
    h03ProofId: r.h03_proof_id,
    enabled: r.enabled,
  };
}
function auditOf(r: QueryResultRow): ResponseAuditRecord {
  return {
    auditId: r.audit_id,
    actionId: r.action_id,
    sequence: Number(r.sequence),
    eventType: r.event_type,
    actorId: r.actor_id,
    actorType: r.actor_type,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    summary: r.summary,
    metadata: r.metadata ?? {},
    occurredAt: iso(r.occurred_at)!,
  };
}

export class ResponseStore {
  constructor(readonly db: PlatformDatabase) {}
  private q(tx: TransactionContext, sql: string, v: unknown[] = []) {
    return this.db.query(tx, sql, v);
  }
  /** Same lock order everywhere (binding first) so commands and worker never deadlock. */
  private async lockScope(tx: TransactionContext, s: SentinelScope) {
    const b = await this.q(
      tx,
      `SELECT project_id FROM sentinel.project_bindings WHERE ${where} AND enabled FOR UPDATE`,
      sv(s),
    );
    if (!b.rowCount) throw new TelemetryError("project_not_registered", 409);
  }
  private async lockAction(
    tx: TransactionContext,
    s: SentinelScope,
    id: string,
  ) {
    const r = (
      await this.q(
        tx,
        `SELECT * FROM sentinel.response_actions WHERE ${where} AND action_id=$4 FOR UPDATE`,
        [...sv(s), id],
      )
    ).rows[0];
    if (!r) throw new TelemetryError("not_found", 404);
    return actionOf(r);
  }
  private async target(tx: TransactionContext, s: SentinelScope, id: string) {
    const r = (
      await this.q(
        tx,
        `SELECT * FROM sentinel.response_targets WHERE ${where} AND target_id=$4`,
        [...sv(s), id],
      )
    ).rows[0];
    return r ? targetOf(r) : undefined;
  }
  private async audit(
    tx: TransactionContext,
    a: ResponseAction,
    event: ResponseAuditEvent,
    actor: { id: string; type: "system" | "user" },
    from: ResponseStatus | null,
    to: ResponseStatus | null,
    summary: string,
    metadata: Record<string, unknown>,
    key: string,
  ) {
    const s = sv(a);
    const dup = (
      await this.q(
        tx,
        `SELECT 1 FROM sentinel.response_audit WHERE ${where} AND action_id=$4 AND idempotency_key=$5`,
        [...s, a.actionId, key],
      )
    ).rowCount;
    if (dup) return false;
    const seq =
      Number(
        (
          await this.q(
            tx,
            `SELECT COALESCE(max(sequence),0)::int AS m FROM sentinel.response_audit WHERE ${where} AND action_id=$4`,
            [...s, a.actionId],
          )
        ).rows[0].m,
      ) + 1;
    if (seq > responseLimits.auditPerAction)
      throw new TelemetryError("audit_capacity", 409);
    const meta = JSON.stringify(metadata);
    if (meta.length > 1800) throw new TelemetryError("metadata_too_large");
    await this.q(
      tx,
      `INSERT INTO sentinel.response_audit(mode,workspace_id,project_id,action_id,audit_id,sequence,event_type,actor_id,actor_type,from_status,to_status,summary,metadata,idempotency_key)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        ...s,
        a.actionId,
        deterministicUuid({
          k: "sentinel.response.audit.v1",
          s: sv(a),
          a: a.actionId,
          key,
        }),
        seq,
        event,
        actor.id,
        actor.type,
        from,
        to,
        summary.slice(0, 280),
        meta,
        key,
      ],
    );
    return true;
  }
  private enqueue(
    tx: TransactionContext,
    s: SentinelScope,
    kind: string,
    subjectRef: string,
    idempotencyKey: string,
    availableAt: Date,
  ) {
    return new PostgresQueue(this.db).enqueue(tx, {
      mode: s.mode,
      workspaceId: s.workspaceId,
      projectId: s.projectId,
      schemaVersion: 1,
      module: "sentinel",
      jobId: randomUUID(),
      kind,
      subjectRef,
      idempotencyKey,
      revision: 1,
      attempts: 0,
      maxAttempts: 5,
      availableAt: availableAt.toISOString(),
      cancelRequested: false,
    });
  }
  private async update(
    tx: TransactionContext,
    a: ResponseAction,
    expected: number,
    set: string,
    values: unknown[],
  ) {
    const r = await this.q(
      tx,
      `UPDATE sentinel.response_actions SET ${set},revision=${expected + 1},updated_at=clock_timestamp() WHERE ${where} AND action_id=$4 AND revision=${expected} RETURNING *`,
      [...sv(a), a.actionId, ...values],
    );
    if (!r.rowCount) throw new TelemetryError("revision_conflict", 409);
    return actionOf(r.rows[0]);
  }

  // ---------------------------------------------------------------- app-side
  async propose(
    ctx: SentinelProjectContext,
    cmd: Extract<ResponseCommand, { action: "propose" }>,
  ) {
    return this.db.scoped(ctx.scope, async (tx) => {
      const s = sv(ctx.scope);
      await this.lockScope(tx, ctx.scope);
      const existing = (
        await this.q(
          tx,
          `SELECT * FROM sentinel.response_actions WHERE ${where} AND idempotency_key=$4`,
          [...s, cmd.idempotencyKey],
        )
      ).rows[0];
      if (existing) {
        const a = actionOf(existing);
        if (
          a.incidentId !== cmd.incidentId ||
          a.targetId !== cmd.targetId ||
          a.ttlSeconds !== cmd.ttlSeconds
        )
          throw new TelemetryError("idempotency_conflict", 409);
        return { action: a, replay: true };
      }
      const inc = (
        await this.q(
          tx,
          `SELECT status,origin FROM sentinel.incidents WHERE ${where} AND incident_id=$4 FOR SHARE`,
          [...s, cmd.incidentId],
        )
      ).rows[0];
      if (!inc) throw new TelemetryError("not_found", 404);
      const evidence = Number(
        (
          await this.q(
            tx,
            `SELECT count(*)::int AS n FROM sentinel.incident_evidence WHERE ${where} AND incident_id=$4`,
            [...s, cmd.incidentId],
          )
        ).rows[0].n,
      );
      const target = await this.target(tx, ctx.scope, cmd.targetId);
      const active = Boolean(
        target &&
        (
          await this.q(
            tx,
            `SELECT 1 FROM sentinel.response_actions WHERE ${where} AND target_id=$4 AND status=ANY($5::text[])`,
            [...s, cmd.targetId, activeStatuses],
          )
        ).rowCount,
      );
      const policy = evaluatePolicy({
        incident: { status: inc.status, evidenceCount: evidence },
        target,
        ttlSeconds: cmd.ttlSeconds,
        activeActionOnTarget: active,
      });
      if (!policy.eligible) throw new ResponsePolicyDenied(policy.reasons);
      const actionId = deterministicUuid({
        k: "sentinel.response.v1",
        s,
        key: cmd.idempotencyKey,
      });
      const r = await this.q(
        tx,
        `INSERT INTO sentinel.response_actions(mode,workspace_id,project_id,action_id,incident_id,target_id,incident_origin,operation,ttl_seconds,status,proposed_by,policy_reasons,idempotency_key)
         VALUES($1,$2,$3,$4,$5,$6,$7,'temporary_rate_limit',$8,'awaiting_approval',$9,$10,$11) RETURNING *`,
        [
          ...s,
          actionId,
          cmd.incidentId,
          cmd.targetId,
          inc.origin,
          cmd.ttlSeconds,
          ctx.actorId,
          JSON.stringify(["policy_passed"]),
          cmd.idempotencyKey,
        ],
      );
      const a = actionOf(r.rows[0]);
      await this.audit(
        tx,
        a,
        "response_proposed",
        { id: ctx.actorId, type: "user" },
        null,
        "awaiting_approval",
        `Response proposed by ${ctx.actorId}: ${cmd.ttlSeconds}s rate limit on target.`,
        {
          targetId: a.targetId,
          ttlSeconds: a.ttlSeconds,
          incidentOrigin: a.incidentOrigin,
          policy: "passed",
        },
        commandKey(actionId, "propose", 1),
      );
      return { action: a, replay: false };
    });
  }

  /** approve | deny | rollback */
  async decide(
    ctx: SentinelProjectContext,
    cmd: Exclude<ResponseCommand, { action: "propose" }>,
  ) {
    return this.db.scoped(ctx.scope, async (tx) => {
      await this.lockScope(tx, ctx.scope);
      const a = await this.lockAction(tx, ctx.scope, cmd.actionId);
      const key = commandKey(a.actionId, cmd.action, cmd.expectedRevision);
      const replayed = (
        await this.q(
          tx,
          `SELECT 1 FROM sentinel.response_audit WHERE ${where} AND action_id=$4 AND idempotency_key=$5`,
          [...sv(ctx.scope), a.actionId, key],
        )
      ).rowCount;
      if (replayed) return { action: a, replay: true };
      if (a.revision !== cmd.expectedRevision)
        throw new TelemetryError("revision_conflict", 409);
      if (a.revision >= responseLimits.revisions)
        throw new TelemetryError("revision_capacity", 409);
      const target = await this.target(tx, ctx.scope, a.targetId);
      if (!target) throw new TelemetryError("not_found", 404);
      const user = { id: ctx.actorId, type: "user" as const };
      const note = cmd.note ? ` Note: ${cmd.note}` : "";
      if (cmd.action === "approve" || cmd.action === "deny") {
        if (a.status !== "awaiting_approval")
          throw new TelemetryError("invalid_state", 409);
        const denial = approverDenial({
          actor: ctx.actorId,
          proposer: a.proposedBy,
          target,
        });
        if (denial) throw new TelemetryError("approver_denied", 403);
        if (cmd.action === "deny") {
          assertTransition(a.status, "denied");
          const n = await this.update(tx, a, a.revision, "status='denied'", []);
          await this.audit(
            tx,
            n,
            "approval_denied",
            user,
            a.status,
            "denied",
            `Denied by ${ctx.actorId}.${note}`,
            { targetId: a.targetId },
            key,
          );
          return { action: n, replay: false };
        }
        // Re-evaluate: the world may have changed since proposal (closed incident, new active action, disabled target).
        const inc = (
          await this.q(
            tx,
            `SELECT status FROM sentinel.incidents WHERE ${where} AND incident_id=$4 FOR SHARE`,
            [...sv(ctx.scope), a.incidentId],
          )
        ).rows[0];
        const policy = evaluatePolicy({
          // Evidence rows are RESTRICT-linked and cannot disappear after proposal.
          incident: { status: inc?.status ?? "closed", evidenceCount: 1 },
          target,
          ttlSeconds: a.ttlSeconds,
          activeActionOnTarget: Boolean(
            (
              await this.q(
                tx,
                `SELECT 1 FROM sentinel.response_actions WHERE ${where} AND target_id=$4 AND action_id<>$5 AND status=ANY($6::text[])`,
                [...sv(ctx.scope), a.targetId, a.actionId, activeStatuses],
              )
            ).rowCount,
          ),
        });
        if (!policy.eligible) throw new ResponsePolicyDenied(policy.reasons);
        assertTransition(a.status, "approved");
        const n = await this.update(
          tx,
          a,
          a.revision,
          `status='approved',approved_by=$5,approved_at=clock_timestamp(),approval_expires_at=clock_timestamp()+interval '${responseLimits.approvalWindowMs / 1000} seconds'`,
          [ctx.actorId],
        );
        await this.audit(
          tx,
          n,
          "human_approved",
          user,
          a.status,
          "approved",
          `Approved by ${ctx.actorId} for ${a.ttlSeconds}s on target.${note}`,
          {
            targetId: a.targetId,
            ttlSeconds: a.ttlSeconds,
            selfApproved: ctx.actorId === a.proposedBy,
            approvalExpiresAt: n.approvalExpiresAt,
          },
          key,
        );
        await this.enqueue(
          tx,
          ctx.scope,
          responseJobKinds.apply,
          a.actionId,
          `response:apply:${a.actionId}`,
          new Date(),
        );
        return { action: n, replay: false };
      }
      // rollback: any target approver, idempotent
      if (!target.approverActorIds.includes(ctx.actorId))
        throw new TelemetryError("approver_denied", 403);
      if (a.status === "awaiting_approval")
        throw new TelemetryError("invalid_state", 409);
      const terminal: ResponseStatus[] = [
        "denied",
        "apply_failed",
        "rolled_back",
        "expired",
      ];
      if (terminal.includes(a.status)) return { action: a, replay: true };
      const alreadyRequested = (
        await this.q(
          tx,
          `SELECT rollback_requested_by FROM sentinel.response_actions WHERE ${where} AND action_id=$4`,
          [...sv(ctx.scope), a.actionId],
        )
      ).rows[0].rollback_requested_by;
      if (alreadyRequested) return { action: a, replay: true };
      if (a.status === "approved") {
        // Nothing applied yet; the apply handler re-reads status under lock and no-ops.
        assertTransition(a.status, "rolled_back");
        const n = await this.update(
          tx,
          a,
          a.revision,
          "status='rolled_back',rollback_requested_by=$5,rollback_requested_at=clock_timestamp()",
          [ctx.actorId],
        );
        await this.audit(
          tx,
          n,
          "rollback",
          user,
          a.status,
          "rolled_back",
          `Rolled back before apply by ${ctx.actorId}.${note}`,
          { targetTouched: false },
          key,
        );
        return { action: n, replay: false };
      }
      const n = await this.update(
        tx,
        a,
        a.revision,
        "rollback_requested_by=$5,rollback_requested_at=clock_timestamp()",
        [ctx.actorId],
      );
      await this.audit(
        tx,
        n,
        "rollback",
        user,
        a.status,
        a.status,
        `Rollback requested by ${ctx.actorId}.${note}`,
        { requested: true },
        key,
      );
      await this.enqueue(
        tx,
        ctx.scope,
        responseJobKinds.expire,
        a.actionId,
        `response:rollback:${a.actionId}`,
        new Date(),
      );
      return { action: n, replay: false };
    });
  }

  async command(ctx: SentinelProjectContext, input: unknown) {
    if (this.db.module !== "sentinel") throw new PlatformError("scope_denied");
    const cmd = responseCommand(input);
    return cmd.action === "propose"
      ? this.propose(ctx, cmd)
      : this.decide(ctx, cmd);
  }

  async targets(ctx: SentinelProjectContext) {
    return this.db.scoped(ctx.scope, async (tx) =>
      (
        await this.q(
          tx,
          `SELECT * FROM sentinel.response_targets WHERE ${where} AND enabled ORDER BY target_id LIMIT 20`,
          sv(ctx.scope),
        )
      ).rows.map((r) => {
        const t = targetOf(r);
        return {
          targetId: t.targetId,
          kind: t.kind,
          origin: t.origin,
          maxTtlSeconds: t.maxTtlSeconds,
          allowSelfApproval: t.allowSelfApproval,
        };
      }),
    );
  }
  async list(ctx: SentinelProjectContext, incidentId?: string) {
    return this.db.scoped(ctx.scope, async (tx) =>
      (
        await this.q(
          tx,
          `SELECT * FROM sentinel.response_actions WHERE ${where}${incidentId ? " AND incident_id=$4" : ""} ORDER BY created_at DESC,action_id DESC LIMIT 50`,
          incidentId ? [...sv(ctx.scope), incidentId] : sv(ctx.scope),
        )
      ).rows.map(actionOf),
    );
  }
  async details(ctx: SentinelProjectContext, actionId: string) {
    return this.db.scoped(ctx.scope, async (tx) => {
      const a = (
        await this.q(
          tx,
          `SELECT * FROM sentinel.response_actions WHERE ${where} AND action_id=$4`,
          [...sv(ctx.scope), actionId],
        )
      ).rows[0];
      if (!a) throw new TelemetryError("not_found", 404);
      const audit = (
        await this.q(
          tx,
          `SELECT * FROM sentinel.response_audit WHERE ${where} AND action_id=$4 ORDER BY sequence`,
          [...sv(ctx.scope), actionId],
        )
      ).rows.map(auditOf);
      return { action: actionOf(a), audit };
    });
  }

  // ------------------------------------------------------------ worker-side
  /** Returns the action+target to apply, or a skip reason. Resumes an `applying` row after a crash. */
  async beginApply(scope: SentinelScope, actionId: string) {
    return this.db.scoped(scope, async (tx) => {
      this.db.requireWorker(tx);
      await this.lockScope(tx, scope);
      const a = await this.lockAction(tx, scope, actionId);
      if (a.status === "applying") {
        const t = await this.target(tx, scope, a.targetId);
        return t
          ? { action: a, target: t }
          : { skip: "target_missing" as const };
      }
      if (a.status !== "approved") return { skip: "not_approved" as const };
      const t = await this.target(tx, scope, a.targetId);
      const live = (
        await this.q(
          tx,
          `SELECT approval_expires_at>clock_timestamp() AS ok FROM sentinel.response_actions WHERE ${where} AND action_id=$4`,
          [...sv(scope), actionId],
        )
      ).rows[0].ok;
      if (!live || !t || !t.enabled) {
        assertTransition(a.status, "expired");
        const n = await this.update(tx, a, a.revision, "status='expired'", []);
        await this.audit(
          tx,
          n,
          "expiry",
          { id: systemActor, type: "system" },
          a.status,
          "expired",
          !live
            ? "Approval expired before apply; target untouched."
            : "Target disabled or missing before apply; target untouched.",
          { targetTouched: false },
          fingerprint({ k: "apply-denied", id: actionId }),
        );
        return { skip: "approval_invalid" as const };
      }
      assertTransition(a.status, "applying");
      const n = await this.update(tx, a, a.revision, "status='applying'", []);
      await this.audit(
        tx,
        n,
        "apply_started",
        { id: systemActor, type: "system" },
        a.status,
        "applying",
        "Applying approved response to target.",
        { targetId: a.targetId },
        fingerprint({ k: "apply-start", id: actionId }),
      );
      return { action: n, target: t };
    });
  }
  async markApplied(
    scope: SentinelScope,
    actionId: string,
    receipt: { evidenceIds: string[] },
  ) {
    return this.db.scoped(scope, async (tx) => {
      this.db.requireWorker(tx);
      await this.lockScope(tx, scope);
      const a = await this.lockAction(tx, scope, actionId);
      if (a.status !== "applying") return { action: a, changed: false };
      assertTransition(a.status, "applied");
      const n = await this.update(
        tx,
        a,
        a.revision,
        `status='applied',applied_at=clock_timestamp(),expires_at=clock_timestamp()+interval '${a.ttlSeconds} seconds'`,
        [],
      );
      // `applied` is an adapter receipt only. It never claims neutralization.
      await this.audit(
        tx,
        n,
        "mitigation_applied",
        { id: systemActor, type: "system" },
        a.status,
        "applied",
        "Target accepted the rate limit (action_applied). Not verified.",
        {
          receipt: "action_applied",
          evidenceIds: receipt.evidenceIds.slice(0, 5),
          verified: false,
        },
        fingerprint({ k: "applied", id: actionId }),
      );
      await this.enqueue(
        tx,
        scope,
        responseJobKinds.verify,
        actionId,
        `response:verify:${actionId}`,
        new Date(),
      );
      await this.enqueue(
        tx,
        scope,
        responseJobKinds.expire,
        actionId,
        `response:expire:${actionId}`,
        new Date(n.expiresAt!),
      );
      return { action: n, changed: true };
    });
  }
  async markApplyFailed(scope: SentinelScope, actionId: string, code: string) {
    return this.db.scoped(scope, async (tx) => {
      this.db.requireWorker(tx);
      await this.lockScope(tx, scope);
      const a = await this.lockAction(tx, scope, actionId);
      if (a.status !== "applying") return { action: a, changed: false };
      assertTransition(a.status, "apply_failed");
      const n = await this.update(
        tx,
        a,
        a.revision,
        "status='apply_failed'",
        [],
      );
      await this.audit(
        tx,
        n,
        "apply_failed",
        { id: systemActor, type: "system" },
        a.status,
        "apply_failed",
        `Apply failed (${code}); target not confirmed changed.`,
        { code },
        fingerprint({ k: "apply-failed", id: actionId }),
      );
      return { action: n, changed: true };
    });
  }
  async beginVerify(scope: SentinelScope, actionId: string) {
    return this.db.scoped(scope, async (tx) => {
      this.db.requireWorker(tx);
      await this.lockScope(tx, scope);
      const a = await this.lockAction(tx, scope, actionId);
      if (a.status === "verification_pending")
        return { action: a, target: await this.target(tx, scope, a.targetId) };
      if (a.status !== "applied") return { skip: true as const };
      assertTransition(a.status, "verification_pending");
      const n = await this.update(
        tx,
        a,
        a.revision,
        "status='verification_pending'",
        [],
      );
      await this.audit(
        tx,
        n,
        "verification_pending",
        { id: systemActor, type: "system" },
        a.status,
        "verification_pending",
        "Independent verification started.",
        {},
        fingerprint({ k: "vpending", id: actionId }),
      );
      return { action: n, target: await this.target(tx, scope, a.targetId) };
    });
  }
  /** Only a verifier outcome can produce `verified`. `evidence` is stored immutably in the audit row. */
  async recordVerification(
    scope: SentinelScope,
    actionId: string,
    outcome: {
      status: "verified" | "failed" | "inconclusive";
      evidence: Record<string, unknown>;
    },
  ) {
    return this.db.scoped(scope, async (tx) => {
      this.db.requireWorker(tx);
      await this.lockScope(tx, scope);
      const a = await this.lockAction(tx, scope, actionId);
      if (a.status !== "verification_pending")
        return { action: a, changed: false };
      assertTransition(a.status, outcome.status);
      const n = await this.update(
        tx,
        a,
        a.revision,
        `status='${outcome.status}'`,
        [],
      );
      const event: ResponseAuditEvent =
        outcome.status === "verified"
          ? "neutralization_verified"
          : outcome.status === "failed"
            ? "verification_failed"
            : "verification_inconclusive";
      await this.audit(
        tx,
        n,
        event,
        { id: "system:response-verifier", type: "system" },
        a.status,
        outcome.status,
        outcome.status === "verified"
          ? "Independent verifier: attack blocked and benign control allowed (fixture scope)."
          : `Independent verifier result: ${outcome.status}.`,
        { verifier: "fixture-probe", ...outcome.evidence },
        fingerprint({ k: "verify", id: actionId }),
      );
      return { action: n, changed: true };
    });
  }
  /** Called after the target no longer enforces. Terminal: rolled_back (manual) or expired (TTL/reconcile). */
  async finalize(
    scope: SentinelScope,
    actionId: string,
    reason: "ttl" | "reconcile_inactive",
  ) {
    return this.db.scoped(scope, async (tx) => {
      this.db.requireWorker(tx);
      await this.lockScope(tx, scope);
      const a = await this.lockAction(tx, scope, actionId);
      const live = (
        await this.q(
          tx,
          `SELECT rollback_requested_by,(expires_at IS NULL OR expires_at<=clock_timestamp()) AS due FROM sentinel.response_actions WHERE ${where} AND action_id=$4`,
          [...sv(scope), actionId],
        )
      ).rows[0];
      const manual = Boolean(live.rollback_requested_by);
      if (!activeStatuses.includes(a.status))
        return { action: a, changed: false };
      if (a.status === "applying" && !manual)
        return { action: a, changed: false };
      if (reason === "ttl" && !manual && !live.due)
        return { action: a, changed: false, early: true as const };
      const to: ResponseStatus = manual ? "rolled_back" : "expired";
      assertTransition(a.status, to);
      const n = await this.update(tx, a, a.revision, `status='${to}'`, []);
      await this.audit(
        tx,
        n,
        manual ? "rollback" : "expiry",
        { id: systemActor, type: "system" },
        a.status,
        to,
        manual
          ? "Rollback completed; target limit removed."
          : reason === "ttl"
            ? "TTL elapsed; target limit removed."
            : "Target no longer enforcing; closed by reconcile.",
        { reason, targetRestored: true },
        fingerprint({ k: "final", id: actionId, to }),
      );
      return { action: n, changed: true };
    });
  }
  async adopt(scope: SentinelScope, actionId: string) {
    return this.db.scoped(scope, async (tx) => {
      this.db.requireWorker(tx);
      await this.lockScope(tx, scope);
      const a = await this.lockAction(tx, scope, actionId);
      if (a.status !== "applying") return { action: a, changed: false };
      assertTransition(a.status, "applied");
      const n = await this.update(
        tx,
        a,
        a.revision,
        `status='applied',applied_at=clock_timestamp(),expires_at=clock_timestamp()+interval '${a.ttlSeconds} seconds'`,
        [],
      );
      await this.audit(
        tx,
        n,
        "reconcile_adopted",
        { id: systemActor, type: "system" },
        a.status,
        "applied",
        "Reconcile found the limit active on target; adopted as applied. Not verified.",
        { verified: false },
        fingerprint({ k: "adopt", id: actionId }),
      );
      await this.enqueue(
        tx,
        scope,
        responseJobKinds.verify,
        actionId,
        `response:verify:${actionId}`,
        new Date(),
      );
      await this.enqueue(
        tx,
        scope,
        responseJobKinds.expire,
        actionId,
        `response:expire:${actionId}`,
        new Date(n.expiresAt!),
      );
      return { action: n, changed: true };
    });
  }
  async auditCleanup(
    scope: SentinelScope,
    actionId: string,
    detail: Record<string, unknown>,
  ) {
    return this.db.scoped(scope, async (tx) => {
      this.db.requireWorker(tx);
      await this.lockScope(tx, scope);
      const a = await this.lockAction(tx, scope, actionId);
      await this.audit(
        tx,
        a,
        "reconcile_cleanup",
        { id: systemActor, type: "system" },
        a.status,
        a.status,
        "Reconcile removed an orphan limit from the target.",
        detail,
        fingerprint({
          k: "cleanup",
          id: actionId,
          n: a.revision,
          at: Math.floor(Date.now() / 60000),
        }),
      );
    });
  }
  /** Targets + action rows the reconcile pass must compare against actual target state. */
  async reconcileView(scope: SentinelScope) {
    return this.db.scoped(scope, async (tx) => {
      this.db.requireWorker(tx);
      const targets = (
        await this.q(
          tx,
          `SELECT * FROM sentinel.response_targets WHERE ${where} AND enabled ORDER BY target_id LIMIT ${responseLimits.reconcileBatch}`,
          sv(scope),
        )
      ).rows.map(targetOf);
      const out: {
        target: ResponseTarget;
        active: ResponseAction | undefined;
      }[] = [];
      for (const target of targets) {
        const r = (
          await this.q(
            tx,
            `SELECT * FROM sentinel.response_actions WHERE ${where} AND target_id=$4 AND status=ANY($5::text[]) LIMIT 1`,
            [...sv(scope), target.targetId, activeStatuses],
          )
        ).rows[0];
        out.push({ target, active: r ? actionOf(r) : undefined });
      }
      return out;
    });
  }
  async actionById(scope: SentinelScope, actionId: string) {
    return this.db.scoped(scope, async (tx) => {
      const r = (
        await this.q(
          tx,
          `SELECT * FROM sentinel.response_actions WHERE ${where} AND action_id=$4`,
          [...sv(scope), actionId],
        )
      ).rows[0];
      return r ? actionOf(r) : undefined;
    });
  }
  async ensureReconcile(scope: SentinelScope, everyMs = 30000) {
    return this.db.scoped(scope, async (tx) => {
      this.db.requireWorker(tx);
      await this.lockScope(tx, scope);
      const bucket = Math.floor(Date.now() / everyMs);
      await this.enqueue(
        tx,
        scope,
        responseJobKinds.reconcile,
        `reconcile`,
        `response:reconcile:${bucket}`,
        new Date(),
      );
    });
  }
}
