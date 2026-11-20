import { fingerprint } from "../../../platform/identity";
import type {
  G05CaseOutcome,
  G05CaseResult,
  G05Finding,
  G05InvariantFamily,
  G05PlannedCase,
  G05Scope,
  G05TargetRecord,
} from "./contracts";
import { EgressBlockedError, EnforcedHttpClient } from "./egress";
import {
  buildG05FindingId,
  type ActiveSyntheticSession,
  type G05SessionManager,
} from "./dast-engine";
import { redactG05Text, redactHeaders } from "./vault";

interface OrderPayload {
  id: string;
  ownerId: string;
  state: string;
  amount: number;
  note: string;
  submittedCount: number;
  revision: number;
}

function parseOrder(bodyJson: unknown): OrderPayload | null {
  if (!bodyJson || typeof bodyJson !== "object") return null;
  const o = (bodyJson as { order?: unknown }).order;
  if (!o || typeof o !== "object") return null;
  const rec = o as Record<string, unknown>;
  if (
    typeof rec.id !== "string" ||
    typeof rec.ownerId !== "string" ||
    typeof rec.state !== "string" ||
    typeof rec.amount !== "number" ||
    typeof rec.note !== "string" ||
    typeof rec.submittedCount !== "number" ||
    typeof rec.revision !== "number"
  )
    return null;
  return {
    id: rec.id,
    ownerId: rec.ownerId,
    state: rec.state,
    amount: rec.amount,
    note: rec.note,
    submittedCount: rec.submittedCount,
    revision: rec.revision,
  };
}

/**
 * GRD-016: Live Integrity Runner executing all five invariant families against an authorized staging target
 * with explicit pre/post persisted state comparison and verified synthetic resource cleanup.
 */
export async function executeIntegrityCases(input: {
  scope: G05Scope;
  target: G05TargetRecord;
  runId: string;
  client: EnforcedHttpClient;
  sessions: G05SessionManager;
  cases: G05PlannedCase[];
  retestSourceFindingId?: Map<string, string>;
  onCase: (result: G05CaseResult) => Promise<void>;
  onFinding: (finding: Omit<G05Finding, "revision" | "createdAt" | "updatedAt">) => Promise<void>;
}): Promise<{ executedCases: G05CaseResult[]; cleanupFailed: boolean; abortedReason?: string }> {
  const results: G05CaseResult[] = [];
  let cleanupFailed = false;
  const { scope, target, runId, client, sessions } = input;

  async function createSyntheticOrder(
    ownerSession: ActiveSyntheticSession,
    note: string,
    amount = 100,
  ): Promise<OrderPayload | null> {
    const resp = await client.request({
      method: "POST",
      path: "/api/orders",
      headers: {
        ...sessions.authHeaders(ownerSession),
        "content-type": "application/json",
      },
      body: JSON.stringify({ amount, note }),
    });
    if (resp.status !== 201) return null;
    return parseOrder(resp.bodyJson);
  }

  async function readSyntheticOrder(
    session: ActiveSyntheticSession,
    orderId: string,
  ): Promise<{ status: number; order: OrderPayload | null }> {
    const resp = await client.request({
      method: "GET",
      path: `/api/orders/${orderId}`,
      headers: sessions.authHeaders(session),
    });
    return { status: resp.status, order: parseOrder(resp.bodyJson) };
  }

  async function cleanupSyntheticOrder(
    ownerSession: ActiveSyntheticSession,
    orderId: string,
  ): Promise<{ verified: boolean; receipt: Record<string, unknown> }> {
    try {
      const del = await client.request({
        method: "DELETE",
        path: `/api/orders/${orderId}`,
        headers: sessions.authHeaders(ownerSession),
      });
      const verify = await client.request({
        method: "GET",
        path: `/api/orders/${orderId}`,
        headers: sessions.authHeaders(ownerSession),
      });
      const verified = del.status === 200 && verify.status === 404;
      return {
        verified,
        receipt: { orderId, deleteStatus: del.status, postDeleteGetStatus: verify.status },
      };
    } catch (error) {
      return {
        verified: false,
        receipt: {
          orderId,
          error: error instanceof Error ? error.message : "cleanup_exception",
        },
      };
    }
  }

  for (const planned of input.cases) {
    if (!planned.invariantFamily) continue;
    const family: G05InvariantFamily = planned.invariantFamily;
    const startedAt = new Date().toISOString();
    const startRequests = client.executedRequests;
    let createdOrder: { id: string; owner: ActiveSyntheticSession } | null = null;

    const persistCase = async (params: {
      status: G05CaseOutcome;
      httpStatus: number | null;
      observedSummary: string;
      preState: Record<string, unknown> | null;
      postState: Record<string, unknown> | null;
      redactedHeaders?: Record<string, string>;
      cleanupStatus: "not_needed" | "verified" | "failed";
      cleanupReceipt: Record<string, unknown> | null;
      errorCode?: string;
      findingTitle?: string;
    }) => {
      const finishedAt = new Date().toISOString();
      const expectedBehavior = {
        statusCodes: planned.expectedStatus,
        summary: planned.expectedBehavior,
        stateInvariant: family,
      };
      const observedBehavior = {
        httpStatus: params.httpStatus,
        summary: redactG05Text(params.observedSummary, sessions.issuedSecrets),
        ...(params.redactedHeaders ? { redactedHeaders: params.redactedHeaders } : {}),
        ...(params.errorCode ? { errorCode: params.errorCode } : {}),
      };
      const evidenceDigest = fingerprint({
        runId,
        caseId: planned.caseId,
        family,
        expectedBehavior,
        observedBehavior,
        preState: params.preState,
        postState: params.postState,
        cleanupStatus: params.cleanupStatus,
      });
      const result: G05CaseResult = {
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        runId,
        caseId: planned.caseId,
        category: planned.category,
        invariantFamily: family,
        actorRole: planned.actorRole,
        httpMethod: planned.method,
        requestPath: planned.path,
        status: params.status,
        severity: params.status === "VERIFIED_FAIL" ? "critical" : "info",
        expectedBehavior,
        observedBehavior,
        preState: params.preState,
        postState: params.postState,
        cleanupStatus: params.cleanupStatus,
        cleanupReceipt: params.cleanupReceipt,
        evidenceDigest,
        executedRequests: Math.max(0, client.executedRequests - startRequests),
        startedAt,
        finishedAt,
      };
      results.push(result);
      await input.onCase(result);

      if (params.status === "VERIFIED_FAIL") {
        const findingId = buildG05FindingId({
          scope,
          targetId: target.id,
          caseId: planned.caseId,
          endpoint: `${planned.method} ${planned.path}`,
        });
        await input.onFinding({
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          id: findingId,
          runId,
          caseId: planned.caseId,
          engine: "integrity",
          title: params.findingTitle || planned.title,
          severity: "critical",
          confidence: "high",
          status: "verified",
          endpoint: `${planned.method} ${planned.path}`,
          invariantFamily: family,
          summary: observedBehavior.summary,
          evidence: [
            {
              runId,
              caseId: planned.caseId,
              recordedAt: finishedAt,
              expected: planned.expectedBehavior,
              observed: observedBehavior.summary,
              evidenceDigest,
              syntheticTarget: target.environment === "local_synthetic",
            },
          ],
          retestOfFindingId: input.retestSourceFindingId?.get(planned.caseId) ?? null,
          triageReason: null,
          triagedBy: null,
          triagedAt: null,
        });
      }
    };

    try {
      const userA = await sessions.acquire("user_a");
      if (!userA) {
        await persistCase({
          status: "NOT_EXECUTED",
          httpStatus: null,
          observedSummary: "Synthetic user_a account unavailable or unconfigured.",
          preState: null,
          postState: null,
          cleanupStatus: "not_needed",
          cleanupReceipt: null,
        });
        continue;
      }

      if (family === "ownership") {
        const userB = await sessions.acquire("user_b");
        if (!userB) {
          await persistCase({
            status: "NOT_EXECUTED",
            httpStatus: null,
            observedSummary: "Synthetic user_b account required for ownership invariant.",
            preState: null,
            postState: null,
            cleanupStatus: "not_needed",
            cleanupReceipt: null,
          });
          continue;
        }
        const order = await createSyntheticOrder(userA, `syn-ownership-${runId.slice(0, 8)}`);
        if (!order) {
          await persistCase({
            status: "INCONCLUSIVE",
            httpStatus: null,
            observedSummary: "Failed to provision synthetic order owned by user_a.",
            preState: null,
            postState: null,
            cleanupStatus: "not_needed",
            cleanupReceipt: null,
          });
          continue;
        }
        createdOrder = { id: order.id, owner: userA };
        const ownerRead = await readSyntheticOrder(userA, order.id);
        const crossRead = await client.request({
          method: "GET",
          path: `/api/orders/${order.id}`,
          headers: sessions.authHeaders(userB),
        });
        const cleanup = await cleanupSyntheticOrder(userA, order.id);
        createdOrder = null;
        if (!cleanup.verified) cleanupFailed = true;

        if (ownerRead.status !== 200 || !ownerRead.order) {
          await persistCase({
            status: cleanup.verified ? "INCONCLUSIVE" : "CLEANUP_FAILED",
            httpStatus: crossRead.status,
            observedSummary: `Positive control failed: owner read returned HTTP ${ownerRead.status}.`,
            preState: { ...order },
            postState: null,
            cleanupStatus: cleanup.verified ? "verified" : "failed",
            cleanupReceipt: cleanup.receipt,
          });
          continue;
        }

        const passed = crossRead.status === 403 && !parseOrder(crossRead.bodyJson);
        const outcome: G05CaseOutcome = !cleanup.verified
          ? "CLEANUP_FAILED"
          : crossRead.status >= 500
            ? "INCONCLUSIVE"
            : passed
              ? "VERIFIED_PASS"
              : "VERIFIED_FAIL";

        await persistCase({
          status: outcome,
          httpStatus: crossRead.status,
          redactedHeaders: redactHeaders(crossRead.headers, sessions.issuedSecrets),
          observedSummary: passed
            ? `Owner user_a read 200; cross-actor user_b denied with HTTP ${crossRead.status}.`
            : `Ownership bypass: user_b received HTTP ${crossRead.status} reading user_a order ${order.id}.`,
          preState: { ...order },
          postState: { crossActorHttpStatus: crossRead.status, crossActorReadOrder: Boolean(parseOrder(crossRead.bodyJson)) },
          cleanupStatus: cleanup.verified ? "verified" : "failed",
          cleanupReceipt: cleanup.receipt,
          findingTitle: "Ownership invariant violated: cross-actor resource access permitted",
        });
      } else if (family === "workflow_bypass") {
        const priv = await sessions.acquire("privileged");
        if (!priv) {
          await persistCase({
            status: "NOT_EXECUTED",
            httpStatus: null,
            observedSummary: "Privileged synthetic role required for workflow_bypass invariant.",
            preState: null,
            postState: null,
            cleanupStatus: "not_needed",
            cleanupReceipt: null,
          });
          continue;
        }
        const order = await createSyntheticOrder(userA, `syn-wf-bypass-${runId.slice(0, 8)}`);
        if (!order) {
          await persistCase({
            status: "INCONCLUSIVE",
            httpStatus: null,
            observedSummary: "Failed to provision synthetic order in draft state.",
            preState: null,
            postState: null,
            cleanupStatus: "not_needed",
            cleanupReceipt: null,
          });
          continue;
        }
        createdOrder = { id: order.id, owner: userA };
        const pre = await readSyntheticOrder(userA, order.id);
        // Attempt illegal skip: draft -> lock without approve
        const bypassAttempt = await client.request({
          method: "POST",
          path: `/api/orders/${order.id}/lock`,
          headers: sessions.authHeaders(priv),
        });
        const afterBypass = await readSyntheticOrder(userA, order.id);

        // Positive control when bypass was rejected: approve -> lock should succeed
        let positiveOk = false;
        if (bypassAttempt.status !== 200 && afterBypass.order?.state === "draft") {
          const appResp = await client.request({
            method: "POST",
            path: `/api/orders/${order.id}/approve`,
            headers: sessions.authHeaders(priv),
          });
          const lockResp = await client.request({
            method: "POST",
            path: `/api/orders/${order.id}/lock`,
            headers: sessions.authHeaders(priv),
          });
          positiveOk = appResp.status === 200 && lockResp.status === 200;
        }
        const cleanup = await cleanupSyntheticOrder(userA, order.id);
        createdOrder = null;
        if (!cleanup.verified) cleanupFailed = true;

        const bypassed =
          bypassAttempt.status === 200 || afterBypass.order?.state !== "draft";
        const outcome: G05CaseOutcome = !cleanup.verified
          ? "CLEANUP_FAILED"
          : bypassed
            ? "VERIFIED_FAIL"
            : positiveOk
              ? "VERIFIED_PASS"
              : "INCONCLUSIVE";

        await persistCase({
          status: outcome,
          httpStatus: bypassAttempt.status,
          redactedHeaders: redactHeaders(bypassAttempt.headers, sessions.issuedSecrets),
          observedSummary: bypassed
            ? `Workflow bypass detected: direct draft->lock returned HTTP ${bypassAttempt.status} and state became ${afterBypass.order?.state ?? "unknown"}.`
            : positiveOk
              ? `Direct draft->lock denied (${bypassAttempt.status}, state remained draft); approved->locked positive control succeeded.`
              : "Direct bypass was denied, but positive control approve->lock failed; marked inconclusive.",
          preState: pre.order ? { ...pre.order } : null,
          postState: afterBypass.order ? { ...afterBypass.order } : null,
          cleanupStatus: cleanup.verified ? "verified" : "failed",
          cleanupReceipt: cleanup.receipt,
          findingTitle: "Workflow bypass: prerequisite approval step skipped",
        });
      } else if (family === "state_transition") {
        const priv = await sessions.acquire("privileged");
        if (!priv) {
          await persistCase({
            status: "NOT_EXECUTED",
            httpStatus: null,
            observedSummary: "Privileged synthetic role required to lock synthetic workflow order.",
            preState: null,
            postState: null,
            cleanupStatus: "not_needed",
            cleanupReceipt: null,
          });
          continue;
        }
        const order = await createSyntheticOrder(userA, `syn-state-lock-${runId.slice(0, 8)}`, 100);
        if (!order) {
          await persistCase({
            status: "INCONCLUSIVE",
            httpStatus: null,
            observedSummary: "Failed to create synthetic order.",
            preState: null,
            postState: null,
            cleanupStatus: "not_needed",
            cleanupReceipt: null,
          });
          continue;
        }
        createdOrder = { id: order.id, owner: userA };
        const approved = await client.request({
          method: "POST",
          path: `/api/orders/${order.id}/approve`,
          headers: sessions.authHeaders(priv),
        });
        const locked = await client.request({
          method: "POST",
          path: `/api/orders/${order.id}/lock`,
          headers: sessions.authHeaders(priv),
        });
        const pre = await readSyntheticOrder(userA, order.id);
        if (approved.status !== 200 || locked.status !== 200 || pre.order?.state !== "locked") {
          const cleanup = await cleanupSyntheticOrder(userA, order.id);
          createdOrder = null;
          if (!cleanup.verified) cleanupFailed = true;
          await persistCase({
            status: cleanup.verified ? "INCONCLUSIVE" : "CLEANUP_FAILED",
            httpStatus: locked.status,
            observedSummary: `Precondition failed: could not transition synthetic order to locked (approve=${approved.status}, lock=${locked.status}).`,
            preState: pre.order ? { ...pre.order } : null,
            postState: null,
            cleanupStatus: cleanup.verified ? "verified" : "failed",
            cleanupReceipt: cleanup.receipt,
          });
          continue;
        }
        const forbiddenEdit = await client.request({
          method: "POST",
          path: `/api/orders/${order.id}/edit`,
          headers: {
            ...sessions.authHeaders(userA),
            "content-type": "application/json",
          },
          body: JSON.stringify({ amount: 999, note: "forbidden-locked-edit" }),
        });
        const post = await readSyntheticOrder(userA, order.id);
        const cleanup = await cleanupSyntheticOrder(userA, order.id);
        createdOrder = null;
        if (!cleanup.verified) cleanupFailed = true;

        const mutated =
          !post.order ||
          post.order.state !== "locked" ||
          post.order.amount !== pre.order.amount ||
          post.order.note !== pre.order.note;
        const rejected = [403, 409].includes(forbiddenEdit.status);
        const passed = rejected && !mutated;
        const outcome: G05CaseOutcome = !cleanup.verified
          ? "CLEANUP_FAILED"
          : forbiddenEdit.status >= 500
            ? "INCONCLUSIVE"
            : passed
              ? "VERIFIED_PASS"
              : "VERIFIED_FAIL";

        await persistCase({
          status: outcome,
          httpStatus: forbiddenEdit.status,
          redactedHeaders: redactHeaders(forbiddenEdit.headers, sessions.issuedSecrets),
          observedSummary: passed
            ? `Forbidden edit on locked order denied (${forbiddenEdit.status}) and persisted state/amount remained locked & unchanged.`
            : `Forbidden state transition detected: HTTP ${forbiddenEdit.status}, postState=${post.order?.state}, amount=${post.order?.amount} (was ${pre.order.amount}).`,
          preState: { ...pre.order },
          postState: post.order ? { ...post.order } : null,
          cleanupStatus: cleanup.verified ? "verified" : "failed",
          cleanupReceipt: cleanup.receipt,
          findingTitle: "Forbidden state transition: locked synthetic resource allowed edit",
        });
      } else if (family === "replay") {
        const order = await createSyntheticOrder(userA, `syn-replay-${runId.slice(0, 8)}`, 100);
        if (!order) {
          await persistCase({
            status: "INCONCLUSIVE",
            httpStatus: null,
            observedSummary: "Failed to provision synthetic order for replay check.",
            preState: null,
            postState: null,
            cleanupStatus: "not_needed",
            cleanupReceipt: null,
          });
          continue;
        }
        createdOrder = { id: order.id, owner: userA };
        const pre = await readSyntheticOrder(userA, order.id);
        const idemKey = `syn-idem-${runId.slice(0, 12)}-${Date.now()}`;
        const first = await client.request({
          method: "POST",
          path: `/api/orders/${order.id}/submit`,
          headers: {
            ...sessions.authHeaders(userA),
            "idempotency-key": idemKey,
          },
        });
        const replay = await client.request({
          method: "POST",
          path: `/api/orders/${order.id}/submit`,
          headers: {
            ...sessions.authHeaders(userA),
            "idempotency-key": idemKey,
          },
        });
        const post = await readSyntheticOrder(userA, order.id);
        const cleanup = await cleanupSyntheticOrder(userA, order.id);
        createdOrder = null;
        if (!cleanup.verified) cleanupFailed = true;

        const firstOk = first.status === 200;
        const replayRejected = replay.status === 409 && post.order?.submittedCount === 1;
        const replayExecuted = (post.order?.submittedCount ?? 0) > 1 || replay.status === 200;
        const outcome: G05CaseOutcome = !cleanup.verified
          ? "CLEANUP_FAILED"
          : !firstOk
            ? "INCONCLUSIVE"
            : replayExecuted
              ? "VERIFIED_FAIL"
              : replayRejected
                ? "VERIFIED_PASS"
                : "INCONCLUSIVE";

        await persistCase({
          status: outcome,
          httpStatus: replay.status,
          redactedHeaders: redactHeaders(replay.headers, sessions.issuedSecrets),
          observedSummary:
            outcome === "VERIFIED_PASS"
              ? "First submission succeeded (submittedCount=1); identical replay denied with HTTP 409 and submittedCount remained 1."
              : `Replay protection failure: first=${first.status}, replay=${replay.status}, submittedCount=${post.order?.submittedCount ?? "unknown"}.`,
          preState: pre.order ? { ...pre.order } : null,
          postState: post.order ? { ...post.order } : null,
          cleanupStatus: cleanup.verified ? "verified" : "failed",
          cleanupReceipt: cleanup.receipt,
          findingTitle: "Replay invariant violated: duplicate submission re-executed",
        });
      } else if (family === "unauthorized_modification") {
        const userB = await sessions.acquire("user_b");
        if (!userB) {
          await persistCase({
            status: "NOT_EXECUTED",
            httpStatus: null,
            observedSummary: "Synthetic user_b account required for unauthorized_modification invariant.",
            preState: null,
            postState: null,
            cleanupStatus: "not_needed",
            cleanupReceipt: null,
          });
          continue;
        }
        const order = await createSyntheticOrder(userA, `syn-unauth-mod-${runId.slice(0, 8)}`, 100);
        if (!order) {
          await persistCase({
            status: "INCONCLUSIVE",
            httpStatus: null,
            observedSummary: "Failed to provision synthetic order for unauthorized modification check.",
            preState: null,
            postState: null,
            cleanupStatus: "not_needed",
            cleanupReceipt: null,
          });
          continue;
        }
        createdOrder = { id: order.id, owner: userA };
        const pre = await readSyntheticOrder(userA, order.id);
        const modAttempt = await client.request({
          method: "PATCH",
          path: `/api/orders/${order.id}`,
          headers: {
            ...sessions.authHeaders(userB),
            "content-type": "application/json",
          },
          body: JSON.stringify({ amount: 888, note: "tampered-by-user-b" }),
        });
        const post = await readSyntheticOrder(userA, order.id);
        const cleanup = await cleanupSyntheticOrder(userA, order.id);
        createdOrder = null;
        if (!cleanup.verified) cleanupFailed = true;

        const stateChanged =
          !pre.order ||
          !post.order ||
          post.order.amount !== pre.order.amount ||
          post.order.note !== pre.order.note ||
          post.order.revision !== pre.order.revision;
        const httpDenied = modAttempt.status === 403 || modAttempt.status === 401;
        const falseDenialWithMutation = httpDenied && stateChanged;

        const outcome: G05CaseOutcome = !cleanup.verified
          ? "CLEANUP_FAILED"
          : !pre.order || !post.order
            ? "INCONCLUSIVE"
            : stateChanged || !httpDenied
              ? "VERIFIED_FAIL"
              : "VERIFIED_PASS";

        await persistCase({
          status: outcome,
          httpStatus: modAttempt.status,
          redactedHeaders: redactHeaders(modAttempt.headers, sessions.issuedSecrets),
          observedSummary:
            outcome === "VERIFIED_PASS"
              ? `Unauthorized PATCH by user_b denied (${modAttempt.status}) and persisted pre/post state matched unchanged.`
              : falseDenialWithMutation
                ? `False HTTP denial (${modAttempt.status}) with actual persisted state mutation detected: amount ${pre.order?.amount} -> ${post.order?.amount}, revision ${pre.order?.revision} -> ${post.order?.revision}.`
                : `Unauthorized modification allowed (HTTP ${modAttempt.status}): amount ${pre.order?.amount} -> ${post.order?.amount}.`,
          preState: pre.order ? { ...pre.order } : null,
          postState: post.order ? { ...post.order } : null,
          cleanupStatus: cleanup.verified ? "verified" : "failed",
          cleanupReceipt: cleanup.receipt,
          findingTitle: falseDenialWithMutation
            ? "False HTTP denial with actual persisted state mutation"
            : "Unauthorized modification invariant violated across actors",
        });
      }
    } catch (error) {
      if (createdOrder) {
        const c = await cleanupSyntheticOrder(createdOrder.owner, createdOrder.id).catch(() => ({
          verified: false,
          receipt: { orderId: createdOrder!.id, error: "cleanup_aborted" },
        }));
        if (!c.verified) cleanupFailed = true;
      }
      if (error instanceof EgressBlockedError) {
        const isCancel = error.reason === "cancelled";
        await persistCase({
          status: isCancel ? "CANCELLED" : "NOT_EXECUTED",
          httpStatus: null,
          observedSummary: `Halted by runtime/egress boundary: ${error.reason} (${error.message}).`,
          preState: null,
          postState: null,
          cleanupStatus: "not_needed",
          cleanupReceipt: null,
          errorCode: error.reason,
        });
        if (isCancel || error.reason === "request_limit_exceeded" || error.reason === "timeout" || error.reason === "grant_invalid") {
          return { executedCases: results, cleanupFailed, abortedReason: error.reason };
        }
        continue;
      }
      await persistCase({
        status: "INCONCLUSIVE",
        httpStatus: null,
        observedSummary: "Integrity check encountered an unexpected execution error; marked inconclusive.",
        preState: null,
        postState: null,
        cleanupStatus: "not_needed",
        cleanupReceipt: null,
        errorCode: "unexpected_error",
      });
    }
  }

  return { executedCases: results, cleanupFailed };
}
