import type { DurableJob } from "../../src/features/sentinel/platform-contracts";
import type { ResponsePort } from "../../src/features/sentinel/contracts";
import type {
  ResponseProposal,
  SentinelProjectContext,
} from "../../src/features/sentinel/types";
import {
  activeStatuses,
  responseJobKinds,
  type ResponseTarget,
} from "../../src/features/sentinel/response/model";
import { ResponseStore } from "../../src/features/sentinel/response/store";
import { ResponseTargetError } from "../../src/features/sentinel/response/local-rate-limit-adapter";
import type { FixtureVerifier } from "../../src/features/sentinel/response/verifier";

export type ResponseAdapter = ResponsePort &
  Required<Pick<ResponsePort, "inspect">>;
export interface ResponseDeps {
  store: ResponseStore;
  adapter(target: ResponseTarget): ResponseAdapter;
  verifier(target: ResponseTarget): FixtureVerifier;
}
const system = (
  job: Pick<DurableJob, "mode" | "workspaceId" | "projectId">,
): SentinelProjectContext => ({
  scope: {
    mode: job.mode,
    workspaceId: job.workspaceId,
    projectId: job.projectId,
  },
  actorId: "system:response-worker",
  repositoryId: "0",
  canvasProjectRef: "system",
});
const transient = (e: unknown) =>
  e instanceof ResponseTargetError &&
  (e.code === "target_unavailable" || e.code === "target_timeout");
const terminalOrIdle = [
  "denied",
  "apply_failed",
  "rolled_back",
  "expired",
  "awaiting_approval",
];

/** Dispatch one response job. Every handler is idempotent: it re-reads durable state under a row lock and no-ops if already done. */
export async function handleResponseJob(
  job: DurableJob,
  signal: AbortSignal,
  d: ResponseDeps,
) {
  const scope = {
    mode: job.mode,
    workspaceId: job.workspaceId,
    projectId: job.projectId,
  };
  const ctx = system(job);
  const id = job.subjectRef;
  if (signal.aborted) throw new Error("stopping");
  switch (job.kind) {
    case responseJobKinds.apply: {
      const begin = await d.store.beginApply(scope, id);
      if ("skip" in begin) return;
      const { action, target } = begin;
      const adapter = d.adapter(target);
      if (!adapter.configured) {
        await d.store.markApplyFailed(scope, id, "not_configured");
        return;
      }
      // Baseline BEFORE enforcement: without it the verifier can never claim causality.
      if (!(await d.store.getBaseline(scope, id)))
        await d.store.recordBaseline(
          scope,
          id,
          await d.verifier(target).probe(id, signal),
        );
      const proposal: ResponseProposal = {
        ...scope,
        schemaVersion: 1,
        revision: action.revision,
        actionId: id,
        incidentId: action.incidentId,
        targetRef: target.origin,
        operation: "temporary_rate_limit",
        ttlSeconds: action.ttlSeconds,
        idempotencyKey: id,
        approval: action.approvedBy
          ? {
              actorId: action.approvedBy,
              approvedAt: action.approvedAt!,
              expiresAt: action.approvalExpiresAt!,
              proofId: target.h03ProofId,
            }
          : null,
      };
      try {
        const r = await adapter.apply(ctx, proposal);
        if (r.status !== "available") {
          await d.store.markApplyFailed(scope, id, "not_configured");
          return;
        }
        await d.store.markApplied(scope, id, {
          evidenceIds: r.value.evidenceIds,
        });
      } catch (e) {
        if (signal.aborted) throw e;
        // Transient outage: keep `applying` and let the queue retry (the PUT is idempotent). Final attempt ⇒ explicit failure.
        if (transient(e) && job.attempts < job.maxAttempts) throw e;
        await d.store.markApplyFailed(
          scope,
          id,
          e instanceof ResponseTargetError ? e.code : "apply_error",
        );
        await adapter.rollback(ctx, id).catch(() => undefined); // best effort; reconcile is the safety net
      }
      return;
    }
    case responseJobKinds.verify: {
      const begin = await d.store.beginVerify(scope, id);
      if ("skip" in begin || !begin.target) return;
      const baseline = await d.store.getBaseline(scope, id);
      const v = await d
        .verifier(begin.target)
        .verify(ctx, id, baseline, signal);
      const status = v.value.verificationStatus as
        "verified" | "failed" | "inconclusive";
      await d.store.recordVerification(scope, id, {
        status,
        evidence: {
          baseline: baseline ?? null,
          attackStatus: v.after.attackStatus,
          benignStatus: v.after.benignStatus,
          maliciousReplayBlocked: v.value.maliciousReplayBlocked,
          benignControlAllowed: v.value.benignControlAllowed,
          probe: v.value.evidenceIds[0],
          ...(v.after.error ? { error: v.after.error } : {}),
        },
      });
      return;
    }
    case responseJobKinds.expire: {
      const action = await d.store.actionById(scope, id);
      if (!action || !activeStatuses.includes(action.status)) return;
      const target = await d.store.targetById(scope, action.targetId);
      if (!target) throw new Error("target_missing");
      if (action.status === "applying") throw new Error("apply_in_progress"); // retry once apply settles
      // Never touch the target before the TTL is due (or a human asked for rollback).
      if (
        !action.rollbackRequestedBy &&
        !(action.expiresAt && Date.parse(action.expiresAt) <= Date.now())
      )
        throw new Error("not_due_yet");
      // Cleanup stays allowed after the owner disables the target (disable blocks new applies only).
      const adapter = d.adapter({ ...target, enabled: true });
      try {
        const r = await adapter.rollback(ctx, id);
        if (r.status !== "available") throw new Error("not_configured");
      } catch (e) {
        // A different action holding the limit means ours is already gone.
        if (!(e instanceof ResponseTargetError && e.code === "target_conflict"))
          throw e;
      }
      const f = await d.store.finalize(scope, id, "ttl");
      if ("early" in f) throw new Error("not_due_yet");
      return;
    }
    case responseJobKinds.reconcile: {
      for (const { target, active } of await d.store.reconcileView(scope)) {
        if (signal.aborted) throw new Error("stopping");
        const adapter = d.adapter(target);
        if (!adapter.configured) continue;
        let state;
        try {
          const r = await adapter.inspect(ctx);
          if (r.status !== "available") continue;
          state = r.value;
        } catch {
          continue; // target unreachable: never guess; try again next pass
        }
        if (state.active && state.actionId) {
          const act =
            active?.actionId === state.actionId
              ? active
              : await d.store.actionById(scope, state.actionId);
          if (act?.status === "applying")
            await d.store.adopt(scope, act.actionId);
          else if (!act || !activeStatuses.includes(act.status)) {
            await adapter.rollback(ctx, state.actionId).catch(() => undefined);
            if (act)
              await d.store.auditCleanup(scope, act.actionId, {
                targetId: target.targetId,
                was: act.status,
              });
          }
        } else if (active && !terminalOrIdle.includes(active.status)) {
          if (active.status === "applying") {
            if (Date.now() - Date.parse(active.updatedAt) > 5 * 60_000)
              await d.store.markApplyFailed(
                scope,
                active.actionId,
                "target_never_applied",
              );
          } else if (active.status !== "approved") {
            await d.store.finalize(
              scope,
              active.actionId,
              "reconcile_inactive",
            );
          }
        }
      }
      await d.store.ensureReconcile(scope, 30000, 1);
      return;
    }
    default:
      throw new Error("unknown_response_job");
  }
}
