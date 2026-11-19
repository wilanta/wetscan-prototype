import { it, expect, vi } from "vitest";
import type { ScanJob } from "../../../src/features/guard/contracts";
import { repositoryAdmission } from "../../../src/features/guard/live/product-admission";
import {
  MAX_RETRY_DEPTH,
  retryDecision,
  retryIdempotencyKey,
  retryLink,
} from "../../../src/features/guard/live/retry";
import { scanInput } from "../../../src/features/guard/live/service";
import {
  authority,
  deploymentFixture,
  operationalJobFixture,
} from "./operational-fixture";

const OLD = "2026-01-01T00:00:00.000Z";
const diagnostic = (code: string, extra: object = {}) =>
  JSON.stringify({
    version: 1,
    stage: "snapshot_acquire",
    component: "source",
    code,
    ...extra,
  });
/** A repository scan that failed before any engine produced a result, with a recorded worker diagnostic. */
async function failed(code = "source_timeout", extra: object = {}) {
  const job = await operationalJobFixture();
  job.status = "failed";
  job.createdAt = OLD;
  job.finishedAt = OLD;
  job.findings = [];
  job.runs = job.runs.map((r) => ({ ...r, status: "failed" as const }));
  job.audit.push({
    actorId: job.audit[0].actorId,
    at: OLD,
    action: "worker_stopped",
    subjectId: job.id,
    reason: diagnostic(code, extra),
  });
  return job;
}

it.each([
  "source_timeout",
  "source_unavailable",
  "github_unavailable",
  "github_rate_limited",
  "execution_not_ready",
])("%s is a retryable transient failure once the backoff has elapsed", async (code) => {
  const job = await failed(code);
  expect(retryDecision(job)).toMatchObject({ eligible: true, depth: 1 });
});
it.each([
  "forbidden",
  "repository_denied",
  "installation_denied",
  "source_integrity",
  "source_limit",
  "revision_conflict",
  "approval_required",
  "not_configured",
  "unknown",
])("%s is terminal and never retryable", async (code) => {
  expect(retryDecision(await failed(code))).toMatchObject({
    eligible: false,
    reason: "failure_not_transient",
  });
});
it("refuses retry when cleanup was not verified, however transient the cause", async () => {
  expect(
    retryDecision(await failed("source_timeout", { source: { cleanup: "UNKNOWN" } })),
  ).toMatchObject({ eligible: false, reason: "cleanup_not_verified" });
  expect(retryDecision(await failed("cleanup_failed"))).toMatchObject({
    eligible: false,
    reason: "cleanup_not_verified",
  });
});
it("never retries an unexplained failure, a non-failed scan, or a scan with recorded results", async () => {
  const unexplained = await failed();
  unexplained.audit = unexplained.audit.filter((a) => a.action !== "worker_stopped");
  expect(retryDecision(unexplained)).toMatchObject({ reason: "failure_cause_unknown" });
  for (const status of ["queued", "running", "completed", "completed_partial", "cancelled"] as const) {
    const j = await failed();
    j.status = status;
    expect(retryDecision(j)).toMatchObject({ eligible: false, reason: "only_failed_scans_can_be_retried" });
  }
  const withRun = await failed();
  withRun.runs[0] = { ...withRun.runs[0], status: "completed" };
  expect(retryDecision(withRun)).toMatchObject({ reason: "scan_has_recorded_results" });
});
it("applies exponential backoff with deterministic jitter and a hard depth limit", async () => {
  const j = await failed();
  const first = retryDecision(j);
  if (!first.eligible) throw Error("expected eligible");
  const wait = (depth: number) => {
    const x = structuredClone(j);
    x.audit[0].reason = "x retry_of:" + "a".repeat(64) + ";depth:" + (depth - 1);
    x.audit[0].action = "repository_scan_requested";
    return retryDecision(x, Date.parse(OLD)); // evaluated at the instant it finished
  };
  const w1 = wait(1),
    w2 = wait(2),
    w3 = wait(3);
  for (const w of [w1, w2, w3]) expect(w).toMatchObject({ eligible: false, reason: "retry_backoff_active" });
  const ms = (w: typeof w1) => (w.eligible ? 0 : w.notBefore! - Date.parse(OLD));
  expect(ms(w2)).toBeGreaterThan(ms(w1));
  expect(ms(w3)).toBeGreaterThan(ms(w2));
  expect(ms(w3)).toBeLessThan(60000 + 250);
  const exhausted = structuredClone(j);
  exhausted.audit[0].action = "repository_scan_requested";
  exhausted.audit[0].reason = "retry_of:" + "a".repeat(64) + ";depth:" + MAX_RETRY_DEPTH;
  expect(retryDecision(exhausted)).toMatchObject({ eligible: false, reason: "retry_limit_reached" });
});
it("retry key is stable per failed scan and valid for the normal scan input contract", async () => {
  const j = await failed();
  expect(retryIdempotencyKey(j)).toBe(retryIdempotencyKey(structuredClone(j)));
  expect(() =>
    scanInput({
      profile: j.profile,
      engines: j.requestedEngines,
      branch: j.repository.branch,
      commit: j.repository.commit,
      idempotencyKey: retryIdempotencyKey(j),
    }),
  ).not.toThrow();
  expect(retryLink({ audit: [] })).toBeUndefined();
});

async function admissionFixture(job: ScanJob) {
  const create = vi.fn(async (_g: unknown, j: ScanJob) => ({ job: j, revision: 1, coverage: null })),
    queued = vi.fn(async () => {}),
    close = vi.fn(async () => {}),
    head = vi.fn(async () => ({ commit: job.repository.commit, tree: "b".repeat(40) })),
    authorize = vi.fn(async () => authority);
  const admission = repositoryAdmission({
    storage: { get: async () => ({ job, revision: 1, coverage: null }), create } as never,
    source: () => ({ authorize, open: async () => ({ head, close }) as never }),
    policy: deploymentFixture().policies[0],
    verifyReady: async () => {},
    onQueued: queued,
  });
  return { create, queued, head, authorize, admission };
}
it("retry creates one NEW linked scan for the same pinned commit after fresh authorization and pin check", async () => {
  const job = await failed();
  const f = await admissionFixture(job);
  const out = await f.admission.retry!(authority, job.id, new AbortController().signal);
  expect(out).toMatchObject({ retryOf: job.id, status: "queued" });
  expect(out.scanId).not.toBe(job.id);
  expect(f.create).toHaveBeenCalledOnce();
  const made = f.create.mock.calls[0][1];
  expect(made.idempotencyKey).toBe(retryIdempotencyKey(job));
  expect(made.repository.commit).toBe(job.repository.commit);
  expect(made.requestedEngines).toEqual(job.requestedEngines);
  expect(retryLink(made)).toEqual({ of: job.id, depth: 1 });
  expect(f.queued).toHaveBeenCalledOnce();
  expect(f.head).toHaveBeenCalled();
  expect(job.status).toBe("failed"); // history untouched
});
it.each(["actor", "revoked", "moved_pin", "terminal_cause", "backoff"])(
  "retry refuses %s without creating or queueing anything",
  async (mode) => {
    const job = await failed(mode === "terminal_cause" ? "forbidden" : "source_timeout");
    if (mode === "actor") job.audit[0].actorId = "github-user-8";
    if (mode === "backoff") job.finishedAt = new Date().toISOString();
    const f = await admissionFixture(job);
    if (mode === "revoked") f.authorize.mockRejectedValue(Error("revoked"));
    if (mode === "moved_pin") f.head.mockResolvedValue({ commit: "c".repeat(40), tree: "b".repeat(40) });
    await expect(f.admission.retry!(authority, job.id, new AbortController().signal)).rejects.toThrow();
    expect(f.create).not.toHaveBeenCalled();
    expect(f.queued).not.toHaveBeenCalled();
  },
);
