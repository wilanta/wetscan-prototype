import { fingerprint } from "../../../platform/identity";
import type { JobLease } from "../../sentinel/platform-contracts";
import type {
  G05CaseResult,
  G05Category,
  G05InvariantFamily,
  G05Run,
  G05RunCoverage,
  G05RunStatus,
  G05RunSummary,
  G05Scope,
} from "./contracts";
import {
  executeDastAndAuthCases,
  G05SessionManager,
  type RuntimeSyntheticAccount,
} from "./dast-engine";
import {
  EgressBlockedError,
  EnforcedHttpClient,
  type DnsLookupFn,
  type LocalSyntheticTargetPin,
} from "./egress";
import { executeIntegrityCases } from "./integrity-engine";
import { G05PostgresQueue } from "./queue";
import { verifyTargetAuthorization } from "./service";
import { G05PostgresStore, G05StoreError } from "./store";
import { unsealCredential } from "./vault";

export interface G05WorkerOptions {
  store: G05PostgresStore;
  workerId: string;
  vaultKey: Buffer | null;
  localPin: LocalSyntheticTargetPin | null;
  leaseMs?: number;
  maxRuns?: number;
  onlyScope?: G05Scope;
  onlyRunId?: string;
  dnsLookup?: DnsLookupFn;
}

function summarizeRun(input: {
  plannedCount: number;
  executed: G05CaseResult[];
  sessionCleanupFailed: number;
  sessionCleanupRevoked: number;
  targetEnvironment: G05Run["coverage"]["targetEnvironment"];
  abortedReason?: string;
}): {
  status: G05RunStatus;
  cleanupStatus: G05Run["cleanupStatus"];
  summary: G05RunSummary;
  coverage: G05RunCoverage;
  evidenceDigest: string;
} {
  const executed = input.executed;
  const passed = executed.filter((c) => c.status === "VERIFIED_PASS").length;
  const failed = executed.filter((c) => c.status === "VERIFIED_FAIL").length;
  const inconclusive = executed.filter((c) => c.status === "INCONCLUSIVE").length;
  const cancelledCases = executed.filter((c) => c.status === "CANCELLED").length;
  const explicitNotExecuted = executed.filter((c) => c.status === "NOT_EXECUTED").length;
  const cleanupFailed = executed.filter(
    (c) => c.status === "CLEANUP_FAILED" || c.cleanupStatus === "failed",
  ).length;
  const unstarted = Math.max(0, input.plannedCount - executed.length);
  const notExecuted = explicitNotExecuted + (input.abortedReason === "cancelled" ? 0 : unstarted);
  const cancelled = cancelledCases + (input.abortedReason === "cancelled" ? unstarted : 0);

  const anyCleanupVerified =
    executed.some((c) => c.cleanupStatus === "verified") || input.sessionCleanupRevoked > 0;
  const cleanupStatus: G05Run["cleanupStatus"] =
    cleanupFailed > 0 || input.sessionCleanupFailed > 0
      ? "failed"
      : anyCleanupVerified
        ? "verified"
        : "not_needed";

  const decision: G05RunSummary["decision"] =
    failed > 0 || cleanupFailed > 0 || cleanupStatus === "failed"
      ? "FAIL"
      : notExecuted > 0 || inconclusive > 0 || cancelled > 0 || Boolean(input.abortedReason) || passed === 0
        ? "INCOMPLETE"
        : "PASS";

  let status: G05RunStatus;
  if (input.abortedReason === "cancelled") {
    status = "cancelled";
  } else if (input.abortedReason === "timeout") {
    status = "timed_out";
  } else if (input.abortedReason === "grant_invalid" || (executed.length === 0 && Boolean(input.abortedReason))) {
    status = "failed";
  } else if (notExecuted > 0 || inconclusive > 0 || cleanupStatus === "failed" || Boolean(input.abortedReason)) {
    status = "completed_partial";
  } else {
    status = "completed";
  }

  const executedCategories = [
    ...new Set(
      executed
        .filter((c) => c.status !== "NOT_EXECUTED" && c.status !== "CANCELLED")
        .map((c) => c.category),
    ),
  ] as G05Category[];
  const skippedCategories = [
    ...new Set(
      executed
        .filter((c) => c.status === "NOT_EXECUTED" || c.status === "CANCELLED")
        .map((c) => c.category),
    ),
  ] as G05Category[];

  const invariantsVerified = [
    ...new Set(
      executed
        .filter((c) => c.invariantFamily && c.status === "VERIFIED_PASS")
        .map((c) => c.invariantFamily as G05InvariantFamily),
    ),
  ];
  const invariantsFailed = [
    ...new Set(
      executed
        .filter((c) => c.invariantFamily && (c.status === "VERIFIED_FAIL" || c.status === "CLEANUP_FAILED"))
        .map((c) => c.invariantFamily as G05InvariantFamily),
    ),
  ];

  const evidenceDigest = fingerprint({
    status,
    cleanupStatus,
    cases: executed.map((c) => ({
      caseId: c.caseId,
      status: c.status,
      cleanupStatus: c.cleanupStatus,
      evidenceDigest: c.evidenceDigest,
    })),
  });

  return {
    status,
    cleanupStatus,
    summary: {
      totalCases: input.plannedCount,
      passed,
      failed,
      inconclusive,
      notExecuted,
      cancelled,
      cleanupFailed: cleanupFailed + input.sessionCleanupFailed,
      findingsCreated: failed,
      decision,
    },
    coverage: {
      executedCategories,
      skippedCategories,
      invariantsVerified,
      invariantsFailed,
      targetEnvironment: input.targetEnvironment,
      tlsApplicable: input.targetEnvironment === "staging",
      localSyntheticPinned: input.targetEnvironment === "local_synthetic",
    },
    evidenceDigest,
  };
}

async function processClaimedLease(
  initialLease: JobLease,
  opts: G05WorkerOptions,
): Promise<{ runId: string; status: G05RunStatus }> {
  const { store } = opts;
  const scope: G05Scope = {
    workspaceId: initialLease.job.workspaceId,
    projectId: initialLease.job.projectId,
  };
  const queue = new G05PostgresQueue(store.db, scope, initialLease.job.jobId);
  let activeLease = initialLease;
  const runId = initialLease.job.subjectRef;

  const emptySummary: G05RunSummary = {
    totalCases: 0,
    passed: 0,
    failed: 0,
    inconclusive: 0,
    notExecuted: 0,
    cancelled: 0,
    cleanupFailed: 0,
    findingsCreated: 0,
    decision: "INCOMPLETE",
  };
  const emptyCoverage: G05RunCoverage = {
    executedCategories: [],
    skippedCategories: [],
    invariantsVerified: [],
    invariantsFailed: [],
    targetEnvironment: "staging",
    tlsApplicable: true,
    localSyntheticPinned: false,
  };

  const run = await store.getRun(scope, runId);
  if (!run) {
    await store.failRunWorker(activeLease, {
      status: "failed",
      errorCode: "run_not_found",
      executedRequests: 0,
      cleanupStatus: "not_needed",
      evidenceDigest: fingerprint({ runId, err: "run_not_found" }),
      summary: emptySummary,
      coverage: emptyCoverage,
    });
    return { runId, status: "failed" };
  }

  const [target, grant, testPlan] = await Promise.all([
    store.getTarget(scope, run.targetId),
    store.getGrant(scope, run.grantId),
    store.getTestPlan(scope, run.testPlanId),
  ]);

  if (!target || !grant || !testPlan) {
    await store.failRunWorker(activeLease, {
      status: "failed",
      errorCode: "missing_scope_artifacts",
      executedRequests: 0,
      cleanupStatus: "not_needed",
      evidenceDigest: fingerprint({ runId, err: "missing_scope_artifacts" }),
      summary: { ...run.summary, decision: "INCOMPLETE" },
      coverage: run.coverage,
    });
    return { runId, status: "failed" };
  }

  const casesToRun =
    run.retestCaseIds && run.retestCaseIds.length > 0
      ? testPlan.cases.filter((c) => run.retestCaseIds!.includes(c.caseId))
      : testPlan.cases;

  const authCheck = verifyTargetAuthorization({
    target,
    grant,
    localPin: opts.localPin,
    requiredCategories: [...new Set(casesToRun.map((c) => c.category))],
  });
  if (!authCheck.ok) {
    await store.failRunWorker(activeLease, {
      status: "failed",
      errorCode: authCheck.code,
      executedRequests: 0,
      cleanupStatus: "not_needed",
      evidenceDigest: fingerprint({ runId, err: authCheck.code }),
      summary: {
        ...run.summary,
        notExecuted: casesToRun.length,
        decision: "INCOMPLETE",
      },
      coverage: run.coverage,
    });
    return { runId, status: "failed" };
  }

  await store.startRunWorker(activeLease);

  // Build unsealed synthetic accounts for worker only
  const sealedAccounts = await store.loadSealedAccountsForWorker(scope, target.id);
  const runtimeAccounts: RuntimeSyntheticAccount[] = [];
  for (const acc of sealedAccounts) {
    let secret: string | null = null;
    if (acc.credentialCiphertext) {
      if (!opts.vaultKey) {
        await store.failRunWorker(activeLease, {
          status: "failed",
          errorCode: "vault_not_configured",
          executedRequests: 0,
          cleanupStatus: "not_needed",
          evidenceDigest: fingerprint({ runId, err: "vault_not_configured" }),
          summary: {
            ...run.summary,
            notExecuted: casesToRun.length,
            decision: "INCOMPLETE",
          },
          coverage: run.coverage,
        });
        return { runId, status: "failed" };
      }
      const unsealed = unsealCredential(
        acc.credentialCiphertext,
        {
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          targetId: target.id,
          accountId: acc.id,
        },
        opts.vaultKey,
      );
      secret = unsealed.secret;
    }
    runtimeAccounts.push({ view: acc, secret });
  }

  // Build retest mapping (caseId -> prior finding ID) so PASS updates finding status -> verified_fixed
  const retestSourceFindingId = new Map<string, string>();
  if (run.retestOfRunId) {
    const [priorRunFindings, projectFindings] = await Promise.all([
      store.listFindings(scope, run.retestOfRunId),
      store.listFindings(scope),
    ]);
    for (const f of [...projectFindings, ...priorRunFindings]) {
      if (casesToRun.some((c) => c.caseId === f.caseId)) {
        retestSourceFindingId.set(f.caseId, f.id);
      }
    }
  }

  const abortController = new AbortController();
  let timeoutTriggered = false;
  let cancelTriggered = false;
  let grantInvalidated = false;

  const overallTimeoutMs = Math.max(
    5000,
    Math.min(target.config.timeoutMs * Math.max(4, casesToRun.length), 180000),
  );
  const overallTimer = setTimeout(() => {
    timeoutTriggered = true;
    abortController.abort();
  }, overallTimeoutMs);

  const leaseMs = Math.max(5000, opts.leaseMs ?? 20000);
  const heartbeatEvery = Math.max(1500, Math.floor(leaseMs / 3));
  let heartbeatChain = Promise.resolve();
  const heartbeatTimer = setInterval(() => {
    heartbeatChain = heartbeatChain.then(async () => {
      if (abortController.signal.aborted) return;
      try {
        activeLease = await queue.heartbeat(activeLease);
      } catch {
        const latest = await store.getRun(scope, runId).catch(() => null);
        if (latest?.status === "cancelled") {
          cancelTriggered = true;
        }
        abortController.abort();
      }
    });
  }, heartbeatEvery);

  const client = new EnforcedHttpClient({
    target,
    localPin: opts.localPin,
    dnsLookup: opts.dnsLookup,
    signal: abortController.signal,
    verifyGrantActive: async () => {
      const [latestRun, latestGrant, latestTarget] = await Promise.all([
        store.getRun(scope, runId),
        store.getGrant(scope, run.grantId),
        store.getTarget(scope, run.targetId),
      ]);
      if (!latestRun || latestRun.status === "cancelled") {
        cancelTriggered = true;
        abortController.abort();
        throw new EgressBlockedError("cancelled", "Run was cancelled.");
      }
      if (!latestTarget || !latestGrant) {
        grantInvalidated = true;
        throw new EgressBlockedError("grant_invalid", "Target or grant removed.");
      }
      const recheck = verifyTargetAuthorization({
        target: latestTarget,
        grant: latestGrant,
        localPin: opts.localPin,
      });
      if (!recheck.ok) {
        grantInvalidated = true;
        throw new EgressBlockedError("grant_invalid", recheck.message);
      }
    },
  });

  const sessions = new G05SessionManager(client, runtimeAccounts, async (accountId, st) => {
    await store.markAccountStateWorker(scope, accountId, st);
  });

  const allCases: G05CaseResult[] = [];
  let abortedReason: string | undefined;

  try {
    const dastRes = await executeDastAndAuthCases({
      scope,
      target,
      runId,
      client,
      sessions,
      cases: casesToRun,
      retestSourceFindingId,
      onCase: async (res) => {
        allCases.push(res);
        await store.saveCaseResultWorker(activeLease, res);
      },
      onFinding: async (finding) => {
        await store.saveFindingWorker(activeLease, finding);
      },
    });
    if (dastRes.abortedReason) {
      abortedReason = dastRes.abortedReason;
    } else {
      const intRes = await executeIntegrityCases({
        scope,
        target,
        runId,
        client,
        sessions,
        cases: casesToRun,
        retestSourceFindingId,
        onCase: async (res) => {
          allCases.push(res);
          await store.saveCaseResultWorker(activeLease, res);
        },
        onFinding: async (finding) => {
          await store.saveFindingWorker(activeLease, finding);
        },
      });
      if (intRes.abortedReason) abortedReason = intRes.abortedReason;
    }

    // Update prior findings -> verified_fixed when a targeted retest passes
    for (const c of allCases) {
      if (c.status === "VERIFIED_PASS" && retestSourceFindingId.has(c.caseId)) {
        const priorFindingId = retestSourceFindingId.get(c.caseId)!;
        await store.markFindingVerifiedFixedWorker(activeLease, {
          findingId: priorFindingId,
          caseId: c.caseId,
          evidence: {
            runId,
            caseId: c.caseId,
            recordedAt: c.finishedAt,
            expected: c.expectedBehavior.summary,
            observed: c.observedBehavior.summary,
            evidenceDigest: c.evidenceDigest,
            verifiedFixed: true,
          },
        });
      }
    }
  } catch (error) {
    if (error instanceof G05StoreError && error.code === "lease_lost") {
      const latest = await store.getRun(scope, runId).catch(() => null);
      if (latest?.status === "cancelled") {
        cancelTriggered = true;
        abortedReason = "cancelled";
      } else {
        throw error;
      }
    } else {
      abortedReason = error instanceof EgressBlockedError ? error.reason : "unexpected_error";
    }
  } finally {
    clearTimeout(overallTimer);
    clearInterval(heartbeatTimer);
    await heartbeatChain.catch(() => undefined);
  }

  let sessionCleanup = { revoked: 0, failed: 0 };
  if (!grantInvalidated && !cancelTriggered && !timeoutTriggered) {
    sessionCleanup = await sessions.cleanupAll().catch(() => ({ revoked: 0, failed: 1 }));
  }

  if (cancelTriggered) abortedReason = "cancelled";
  else if (timeoutTriggered && !abortedReason) abortedReason = "timeout";
  else if (grantInvalidated) abortedReason = "grant_invalid";

  const outcome = summarizeRun({
    plannedCount: casesToRun.length,
    executed: allCases,
    sessionCleanupFailed: sessionCleanup.failed,
    sessionCleanupRevoked: sessionCleanup.revoked,
    targetEnvironment: target.environment,
    abortedReason,
  });

  if (outcome.status === "cancelled") {
    await store.finalizeCancelledRunWorker(scope, runId, opts.workerId, {
      executedRequests: client.executedRequests,
      cleanupStatus: outcome.cleanupStatus,
      evidenceDigest: outcome.evidenceDigest,
      summary: outcome.summary,
      coverage: outcome.coverage,
    });
    return { runId, status: "cancelled" };
  }

  if (outcome.status === "failed" || outcome.status === "timed_out") {
    await store.failRunWorker(activeLease, {
      status: outcome.status,
      errorCode: abortedReason ?? outcome.status,
      executedRequests: client.executedRequests,
      cleanupStatus: outcome.cleanupStatus,
      evidenceDigest: outcome.evidenceDigest,
      summary: outcome.summary,
      coverage: outcome.coverage,
    });
    return { runId, status: outcome.status };
  }

  await store.finishRunWorker(activeLease, {
    status: outcome.status,
    executedRequests: client.executedRequests,
    cleanupStatus: outcome.cleanupStatus,
    evidenceDigest: outcome.evidenceDigest,
    summary: outcome.summary,
    coverage: outcome.coverage,
  });
  return { runId, status: outcome.status };
}

/**
 * Claims and executes available G05 jobs (one job per scope claim) up to `maxRuns`.
 */
export async function runG05WorkerOnce(
  opts: G05WorkerOptions,
): Promise<{ processed: number; results: { runId: string; status: G05RunStatus }[] }> {
  const maxRuns = Math.max(1, opts.maxRuns ?? 10);
  const leaseMs = Math.max(5000, opts.leaseMs ?? 20000);
  const results: { runId: string; status: G05RunStatus }[] = [];

  for (let i = 0; i < maxRuns; i++) {
    const candidateScopes = opts.onlyScope
      ? [{ ...opts.onlyScope, runId: opts.onlyRunId }]
      : await opts.store.listPendingScopes(10);
    if (candidateScopes.length === 0) break;

    let claimedLease: JobLease | null = null;
    for (const cand of candidateScopes) {
      const queue = new G05PostgresQueue(
        opts.store.db,
        { workspaceId: cand.workspaceId, projectId: cand.projectId },
        opts.onlyRunId ?? cand.runId,
      );
      const leases = await queue.claim({
        module: "guard",
        workerId: opts.workerId,
        limit: 1,
        leaseMs,
      });
      if (leases[0]) {
        claimedLease = leases[0];
        break;
      }
    }
    if (!claimedLease) break;

    const finished = await processClaimedLease(claimedLease, opts);
    results.push(finished);
  }

  return { processed: results.length, results };
}

export async function runG05WorkerLoop(
  opts: G05WorkerOptions & {
    pollIntervalMs?: number;
    signal?: AbortSignal;
    onProcessed?: (res: { runId: string; status: G05RunStatus }) => void;
  },
) {
  const interval = Math.max(150, opts.pollIntervalMs ?? 500);
  while (!opts.signal?.aborted) {
    const batch = await runG05WorkerOnce({ ...opts, maxRuns: opts.maxRuns ?? 5 });
    for (const r of batch.results) opts.onProcessed?.(r);
    if (batch.processed === 0 && !opts.signal?.aborted) {
      await new Promise((r) => setTimeout(r, interval));
    }
  }
}
