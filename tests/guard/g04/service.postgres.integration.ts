import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import type { G04Runtime } from "../../../src/features/guard/g04/db";
import { GhError, installationTokens, type GhTransport } from "../../../src/features/guard/g04/github";
import { GithubChecks, CHECK_NAME } from "../../../src/features/guard/g04/checks";
import { defaultPolicy } from "../../../src/features/guard/g04/policy";
import { G04Service, LIMITS, rerunNumber, type AccessReport, type ScanPort } from "../../../src/features/guard/g04/service";
import type { PolicyRecord, TriggerRecord } from "../../../src/features/guard/g04/store";
import type { Envelope } from "../../../src/features/guard/g04/webhook";
import type { ScanJob } from "../../../src/features/guard/contracts";
import { COMMIT, OTHER, engineSet, finding, job, run } from "./fixtures";
import { cancelLeftovers, freshScope, openTestRuntime } from "./pg-env";

let rt: G04Runtime;
beforeAll(async () => {
  rt = await openTestRuntime();
});
afterAll(async () => {
  if (rt) await cancelLeftovers(rt);
  await rt?.close();
});

const APP = 777,
  INST = 9;
const hex = (v: string) => createHash("sha256").update(v).digest("hex");
const sha40 = (n: number) => String(n).padStart(40, "a");

/** Everything external is a double; everything internal (SQL, RLS, leases, service logic) is real. */
function harness(over: { access?: Partial<AccessReport>; permissions?: Partial<AccessReport["permissions"]> } = {}) {
  const heads = new Map<string, string>(),
    scans = new Map<string, ScanJob>(),
    ensured: string[] = [],
    ghCalls: { method: string; path: string; body?: any }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  let ghFail: GhError | null = null,
    ensureFail: Error | null = null,
    access: AccessReport = { ok: true, permissions: { contents: true, metadata: true, checks: true, ...over.permissions }, ...over.access };
  const port: ScanPort = {
    verifyAccess: async () => access,
    branchHead: async (_r: PolicyRecord, b: string) => heads.get(b) ?? COMMIT,
    ensureScan: async (_r: PolicyRecord, t: TriggerRecord, rerun: number) => {
      if (ensureFail) throw ensureFail;
      const id = hex(t.commit + ":" + rerun + ":" + t.branch);
      ensured.push(id);
      return { scanId: id };
    },
    readScan: async (_r: PolicyRecord, id: string) => {
      const j = scans.get(id);
      return j ? { job: j, revision: 1, coverage: null } : null;
    },
  };
  const transport: GhTransport = async (method, path, _t, body) => {
    ghCalls.push({ method, path, body });
    if (ghFail && path.includes("/check-runs") && method !== "GET") throw ghFail;
    if (path.endsWith("/access_tokens")) return { status: 201, headers: new Headers(), json: { token: "tok", expires_at: new Date(Date.now() + 3600000).toISOString(), permissions: { checks: "write", metadata: "read" } } };
    if (method === "DELETE") return { status: 204, headers: new Headers(), json: null };
    if (path.includes("/check-runs?")) return { status: 200, headers: new Headers(), json: { check_runs: [] } };
    return { status: 201, headers: new Headers(), json: { id: 1000 + ghCalls.length, html_url: "https://github.com/o/r/runs/1" } };
  };
  const service = new G04Service({ store: rt.workerStore, scans: port, checks: new GithubChecks(transport, installationTokens(transport, () => "jwt"), APP), appId: APP, baseUrl: "http://localhost:3000" });
  const intake = new G04Service({ store: rt.appStore, scans: port, checks: new GithubChecks(transport, installationTokens(transport, () => "jwt"), APP), appId: APP });
  return {
    service, intake, heads, scans, ensured, ghCalls,
    setGhFail: (e: GhError | null) => (ghFail = e),
    setEnsureFail: (e: Error | null) => (ensureFail = e),
    setAccess: (a: AccessReport) => (access = a),
    checkWrites: () => ghCalls.filter((c) => c.path.includes("/check-runs") && c.method !== "GET" && c.body),
  };
}
async function setup(policy = { ...defaultPolicy, enabled: true }) {
  const s = freshScope(),
    h = harness();
  await rt.appStore.savePolicy(s, { repositoryId: s.repositoryId, repositoryName: "o/r", installationId: INST, ownerActor: "github-user-1", ownerUserId: 1 }, policy, 0, "u1", "init");
  return { s, h };
}
const delivery = (event: Envelope["event"], payload: unknown): Envelope => ({ event, deliveryId: crypto.randomUUID(), payloadSha256: hex(JSON.stringify(payload) + Math.random()), payload });
const push = (s: { repositoryId: string }, commit: string, branch = "main", inst = INST) => delivery("push", { ref: "refs/heads/" + branch, after: commit, installation: { id: inst }, repository: { id: Number(s.repositoryId), full_name: "o/r" } });
const complete = (commit: string, over: Partial<ScanJob> = {}) => job({ repository: { provider: "github", repositoryId: "42", branch: "main", commit }, ...over });
const drain = async (h: ReturnType<typeof harness>, s: { workspaceId: string; projectId: string }, n = 6) => {
  for (let i = 0; i < n; i++) {
    for (const w of (await rt.workerStore.work(50)).filter((w) => w.workspaceId === s.workspaceId)) await (w.kind === "trigger" ? h.service.runTrigger(s, w.ref) : w.kind === "check" ? h.service.publishCheck(s, w.ref) : h.service.runSchedule(s, w.ref));
  }
};
const lastCheck = (h: ReturnType<typeof harness>) => h.checkWrites().at(-1)?.body;

describe("G04 pipeline: webhook → trigger → scan → policy → GitHub check (real PostgreSQL, doubled GitHub/G02)", () => {
  it("BLOCK: a vulnerable commit produces a failing check bound to the exact commit", async () => {
    const { s, h } = await setup();
    expect(await h.intake.ingest(push(s, COMMIT))).toMatchObject({ status: 202, outcome: "enqueued" });
    expect((await rt.appStore.getCheck(s, COMMIT))?.status).toBe("queued"); // visible before any scan
    h.scans.set(hex(COMMIT + ":0:main"), complete(COMMIT, { findings: [finding("critical"), finding("medium")] }));
    await drain(h, s);
    const trig = (await rt.appStore.listTriggers(s))[0];
    expect(trig).toMatchObject({ status: "completed", commit: COMMIT, source: "push" });
    const ev = (await rt.appStore.listEvaluations(s))[0];
    expect(ev).toMatchObject({ decision: "BLOCK", commit: COMMIT, policyRevision: 1 });
    const w = lastCheck(h);
    expect(w).toMatchObject({ name: CHECK_NAME, head_sha: COMMIT, status: "completed", conclusion: "failure" });
    expect(w.output.summary).toContain("BLOCK");
    expect((await rt.appStore.getCheck(s, COMMIT))).toMatchObject({ published: true, conclusion: "failure", decision: "BLOCK" });
    expect((await rt.appStore.recentAudit(s)).map((a) => a.action)).toEqual(expect.arrayContaining(["trigger_enqueued", "evaluation_recorded", "check_published"]));
  });
  it("PASS and WARN publish passing conclusions; INCOMPLETE (missing engine) never does", async () => {
    for (const [findings, runs, concl] of [
      [[], engineSet.map((e) => run(e)), "success"],
      [[finding("medium")], engineSet.map((e) => run(e)), "neutral"],
      [[], engineSet.filter((e) => e !== "iac").map((e) => run(e)), "action_required"],
    ] as const) {
      const { s, h } = await setup();
      await h.intake.ingest(push(s, COMMIT));
      h.scans.set(hex(COMMIT + ":0:main"), complete(COMMIT, { findings: [...findings], runs: [...runs] }));
      await drain(h, s);
      expect(lastCheck(h).conclusion).toBe(concl);
    }
  });
  it("replayed delivery is a no-op; same delivery id with different bytes is a conflict; wrong installation is rejected", async () => {
    const { s, h } = await setup();
    const d = push(s, COMMIT);
    expect((await h.intake.ingest(d)).outcome).toBe("enqueued");
    expect(await h.intake.ingest(d)).toMatchObject({ status: 200, outcome: "duplicate" });
    expect(await h.intake.ingest({ ...d, payloadSha256: hex("tampered") })).toMatchObject({ status: 409, outcome: "delivery_conflict" });
    expect(await rt.appStore.listTriggers(s)).toHaveLength(1);
    expect(await h.intake.ingest(push(s, OTHER, "main", 1234))).toMatchObject({ outcome: "installation_mismatch" });
    expect(await rt.appStore.listTriggers(s)).toHaveLength(1);
  });
  it("ignores unprotected branches, disabled policy, unknown repositories and Guard's own check events", async () => {
    const { s, h } = await setup();
    expect((await h.intake.ingest(push(s, COMMIT, "feature/x"))).outcome).toBe("policy_does_not_match");
    expect((await h.intake.ingest(push({ repositoryId: "999999999999" }, COMMIT))).outcome).toBe("no_policy_for_repository");
    const own = delivery("check_run", { action: "completed", installation: { id: INST }, repository: { id: Number(s.repositoryId), full_name: "o/r" }, check_run: { head_sha: COMMIT, app: { id: APP }, check_suite: { head_branch: "main" }, pull_requests: [] } });
    expect((await h.intake.ingest(own)).outcome).toMatch(/own_check_event/);
    expect(await rt.appStore.listTriggers(s)).toHaveLength(0);
    await rt.appStore.savePolicy(s, { repositoryId: s.repositoryId, repositoryName: "o/r", installationId: INST, ownerActor: "github-user-1", ownerUserId: 1 }, { ...defaultPolicy, enabled: false }, 1, "u1", "off");
    expect((await h.intake.ingest(push(s, COMMIT))).outcome).toBe("no_policy_for_repository");
  });
  it("a newer commit supersedes the older one: only the newest revision is gated, the old check is cancelled", async () => {
    const { s, h } = await setup();
    const c1 = sha40(1),
      c2 = sha40(2);
    h.heads.set("main", c2);
    await h.intake.ingest(push(s, c1));
    await h.intake.ingest(push(s, c2));
    const triggers = await rt.appStore.listTriggers(s);
    expect(triggers.find((t) => t.commit === c1)?.status).toBe("superseded");
    h.scans.set(hex(c2 + ":0:main"), complete(c2));
    await drain(h, s);
    expect(h.ensured).toHaveLength(1); // the stale revision was never scanned
    expect(await rt.appStore.getCheck(s, c1)).toMatchObject({ conclusion: "cancelled", published: true });
    expect(await rt.appStore.getCheck(s, c2)).toMatchObject({ conclusion: "success" });
  });
  it("stale/out-of-order: a trigger for a commit that is no longer the branch head is not scanned", async () => {
    const { s, h } = await setup();
    await h.intake.ingest(push(s, COMMIT));
    h.heads.set("main", OTHER); // branch already moved on
    await drain(h, s);
    expect(h.ensured).toHaveLength(0);
    expect((await rt.appStore.listTriggers(s))[0]).toMatchObject({ status: "skipped", note: "not_branch_head" });
    expect(await rt.appStore.getCheck(s, COMMIT)).toMatchObject({ conclusion: "cancelled" });
  });
  it("a scan that never finishes fails closed; scan result for another commit never decides the gate", async () => {
    const { s, h } = await setup();
    await h.intake.ingest(push(s, COMMIT));
    h.scans.set(hex(COMMIT + ":0:main"), complete(OTHER, { findings: [] })); // scan record says another commit
    await drain(h, s);
    expect(await rt.appStore.getCheck(s, COMMIT)).toMatchObject({ decision: "INCOMPLETE", conclusion: "action_required" });
    expect((await rt.appStore.listEvaluations(s))[0].decision).toBe("INCOMPLETE");
  });
  it("transient scan failures retry with backoff and then fail closed as INCOMPLETE (never PASS)", async () => {
    const { s, h } = await setup();
    await h.intake.ingest(push(s, COMMIT));
    h.setEnsureFail(new Error("boom"));
    const t = (await rt.appStore.listTriggers(s))[0];
    for (let i = 0; i < LIMITS.maxAttempts; i++) {
      await rt.workerStore.work(1); // discovery only
      await rt.app.scoped({ mode: "live", ...s }, (tx) => rt.app.query(tx, "UPDATE guard.g04_triggers SET next_attempt_at=clock_timestamp() WHERE id=$3 AND workspace_id=$1 AND project_id=$2", [s.workspaceId, s.projectId, t.id]));
      await h.service.runTrigger(s, t.id);
    }
    expect((await rt.appStore.getTrigger(s, t.id))).toMatchObject({ status: "failed", attempts: LIMITS.maxAttempts });
    expect(await rt.appStore.getCheck(s, COMMIT)).toMatchObject({ decision: "INCOMPLETE", conclusion: "action_required" });
  });
  it("waiting for a RUNNING scan does not consume retry attempts (regression: a long scan must not become INCOMPLETE)", async () => {
    const { s, h } = await setup();
    await h.intake.ingest(push(s, COMMIT));
    const t = (await rt.appStore.listTriggers(s))[0],
      id = hex(COMMIT + ":0:main");
    h.scans.set(id, complete(COMMIT, { status: "running" }));
    for (let i = 0; i < LIMITS.maxAttempts + 3; i++) {
      await rt.app.scoped({ mode: "live", ...s }, (tx) => rt.app.query(tx, "UPDATE guard.g04_triggers SET next_attempt_at=clock_timestamp() WHERE id=$3 AND workspace_id=$1 AND project_id=$2", [s.workspaceId, s.projectId, t.id]));
      await h.service.runTrigger(s, t.id);
    }
    expect(await rt.appStore.getTrigger(s, t.id)).toMatchObject({ status: "pending", attempts: 0, scanId: id });
    h.scans.set(id, complete(COMMIT, { findings: [finding("high")] }));
    await rt.app.scoped({ mode: "live", ...s }, (tx) => rt.app.query(tx, "UPDATE guard.g04_triggers SET next_attempt_at=clock_timestamp() WHERE id=$3 AND workspace_id=$1 AND project_id=$2", [s.workspaceId, s.projectId, t.id]));
    await h.service.runTrigger(s, t.id);
    expect(await rt.appStore.getCheck(s, COMMIT)).toMatchObject({ decision: "BLOCK", conclusion: "failure" });
  });
  it("missing GitHub permission or revoked access: INCOMPLETE and no scan starts", async () => {
    const { s, h } = await setup();
    h.setAccess({ ok: false, reason: "permissions_missing", permissions: { contents: false, metadata: true, checks: true } });
    await h.intake.ingest(push(s, COMMIT));
    await drain(h, s);
    expect(h.ensured).toHaveLength(0);
    expect(await rt.appStore.getCheck(s, COMMIT)).toMatchObject({ decision: "INCOMPLETE" });
  });
  it("GitHub permission-denied / rate-limit / outage on check publication is recorded, retried and eventually published", async () => {
    const { s, h } = await setup();
    await h.intake.ingest(push(s, COMMIT));
    h.scans.set(hex(COMMIT + ":0:main"), complete(COMMIT));
    h.setGhFail(new GhError("rate_limited", 403, 90_000));
    const t = (await rt.appStore.listTriggers(s))[0];
    await h.service.runTrigger(s, t.id);
    const failed = await rt.appStore.getCheck(s, COMMIT);
    expect(failed).toMatchObject({ published: false, lastError: "rate_limited" });
    expect(Date.parse(failed!.nextAttemptAt)).toBeGreaterThan(Date.now() + 60_000); // honours Retry-After
    h.setGhFail(new GhError("permission_denied", 403));
    await h.service.publishCheck(s, COMMIT);
    expect((await rt.appStore.getCheck(s, COMMIT))?.lastError).toBe("permission_denied");
    h.setGhFail(null);
    expect(await h.service.retryCheck(s, COMMIT, "u1")).toBe(true);
    expect(await rt.appStore.getCheck(s, COMMIT)).toMatchObject({ published: true, conclusion: "success" });
    expect(h.checkWrites().filter((c) => c.body.status === "completed").length).toBeGreaterThanOrEqual(1);
  });
  it("crash recovery: a trigger whose lease expired is picked up again", async () => {
    const { s, h } = await setup();
    await h.intake.ingest(push(s, COMMIT));
    const t = (await rt.appStore.listTriggers(s))[0];
    expect(await rt.workerStore.claimTrigger(s, t.id, 1, 5)).toBeTruthy(); // "worker" claims then dies
    await new Promise((r) => setTimeout(r, 30));
    h.scans.set(hex(COMMIT + ":0:main"), complete(COMMIT));
    await drain(h, s);
    expect((await rt.appStore.getTrigger(s, t.id))).toMatchObject({ status: "completed", attempts: 2 });
  });
  it("fork pull requests are never fetched: immediate INCOMPLETE check", async () => {
    const { s, h } = await setup();
    const d = delivery("pull_request", { action: "opened", installation: { id: INST }, repository: { id: Number(s.repositoryId), full_name: "o/r" }, pull_request: { number: 3, draft: false, head: { sha: COMMIT, ref: "x", repo: { id: 555, full_name: "f/r" } }, base: { ref: "main" } } });
    await h.intake.ingest(d);
    expect((await rt.appStore.listTriggers(s))[0]).toMatchObject({ status: "skipped", note: "fork_pull_request_not_scanned" });
    expect(await rt.appStore.getCheck(s, COMMIT)).toMatchObject({ decision: "INCOMPLETE", conclusion: "action_required", status: "completed" });
    await drain(h, s);
    expect(h.ensured).toHaveLength(0);
  });
  it("pull request: head commit scanned, closing the PR cancels pending work, protection matched on base branch", async () => {
    const { s, h } = await setup();
    const pr = (action: string) => delivery("pull_request", { action, installation: { id: INST }, repository: { id: Number(s.repositoryId), full_name: "o/r" }, pull_request: { number: 8, draft: false, head: { sha: COMMIT, ref: "feat/y", repo: { id: Number(s.repositoryId), full_name: "o/r" } }, base: { ref: "main" } } });
    expect((await h.intake.ingest(pr("opened"))).outcome).toBe("enqueued");
    expect((await rt.appStore.listTriggers(s))[0]).toMatchObject({ source: "pull_request", branch: "feat/y", protectBranch: "main", prNumber: 8 });
    await h.intake.ingest(pr("closed"));
    expect((await rt.appStore.listTriggers(s))[0].status).toBe("cancelled");
    await drain(h, s);
    expect(h.ensured).toHaveLength(0);
  });
  it("Check rerun request re-evaluates the same commit without a duplicate GitHub check", async () => {
    const { s, h } = await setup();
    h.scans.set(hex(COMMIT + ":0:main"), complete(COMMIT));
    await h.intake.ingest(push(s, COMMIT));
    await drain(h, s);
    const rerun = delivery("check_run", { action: "rerequested", installation: { id: INST }, repository: { id: Number(s.repositoryId), full_name: "o/r" }, check_run: { head_sha: COMMIT, app: { id: APP }, check_suite: { head_branch: "main" }, pull_requests: [] } });
    expect((await h.intake.ingest(rerun)).outcome).toBe("enqueued");
    const ensuredBefore = h.ensured.length;
    // rerun uses its own scan identity (fresh scan), keyed to the trigger
    for (const t of await rt.appStore.listTriggers(s)) if (t.source === "check_rerun") h.scans.set(hex(t.commit + ":" + rerunNumber(t.idempotencyKey) + ":" + t.branch), complete(COMMIT, { findings: [finding("high")] }));
    await drain(h, s);
    expect(h.ensured.length).toBe(ensuredBefore + 1);
    expect(await rt.appStore.getCheck(s, COMMIT)).toMatchObject({ decision: "BLOCK", conclusion: "failure" });
  });
  it("installation suspension disables automation, cancels open work and schedules", async () => {
    const { s, h } = await setup();
    await h.intake.ingest(push(s, COMMIT));
    await rt.appStore.saveSchedule(s, { id: "nightly-1", enabled: true, cadence: { kind: "interval", minutes: 60 }, branch: "main", profile: "standard", nextRunAt: new Date(Date.now() - 1000), actor: "u1" });
    await h.intake.ingest(delivery("installation", { action: "suspend", installation: { id: INST } }));
    expect((await rt.appStore.getPolicy(s))?.installationState).toBe("suspended");
    expect((await rt.appStore.listTriggers(s))[0].status).toBe("cancelled");
    expect((await rt.appStore.getSchedule(s, "nightly-1"))?.enabled).toBe(false);
    expect((await h.intake.ingest(push(s, OTHER))).outcome).toBe("installation_suspended");
  });
  it("schedules: due slot enqueues exactly one trigger, advances atomically, revocation disables", async () => {
    const { s, h } = await setup({ ...defaultPolicy, enabled: true, triggers: { ...defaultPolicy.triggers, schedule: true } });
    await rt.appStore.saveSchedule(s, { id: "nightly-1", enabled: true, cadence: { kind: "interval", minutes: 120 }, branch: "main", profile: "standard", nextRunAt: new Date(Date.now() - 1000), actor: "u1" });
    h.scans.set(hex(COMMIT + ":0:main"), complete(COMMIT));
    const [a, b] = await Promise.all([h.service.runSchedule(s, "nightly-1"), h.service.runSchedule(s, "nightly-1")]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const sch = (await rt.appStore.getSchedule(s, "nightly-1"))!;
    expect(sch).toMatchObject({ lastStatus: "enqueued", consecutiveFailures: 0 });
    expect(Date.parse(sch.nextRunAt)).toBeGreaterThan(Date.now() + 3_000_000);
    expect((await rt.appStore.listTriggers(s)).filter((t) => t.source === "schedule")).toHaveLength(1);
    await drain(h, s);
    expect(await rt.appStore.getCheck(s, COMMIT)).toMatchObject({ conclusion: "success" });
    // revoked authorization
    await rt.appStore.saveSchedule(s, { id: "nightly-2", enabled: true, cadence: { kind: "interval", minutes: 120 }, branch: "main", profile: "standard", nextRunAt: new Date(Date.now() - 1000), actor: "u1" });
    h.setAccess({ ok: false, reason: "repository_not_accessible", permissions: { contents: false, metadata: false, checks: false } });
    await h.service.runSchedule(s, "nightly-2");
    expect((await rt.appStore.getSchedule(s, "nightly-2"))).toMatchObject({ lastStatus: "access_repository_not_accessible", consecutiveFailures: 1 });
  });
  it("admission is bounded: too many pending triggers are refused with 429", async () => {
    const { s, h } = await setup();
    for (let i = 0; i < LIMITS.maxPending; i++) await rt.appStore.insertTrigger(s, { source: "manual", repositoryId: s.repositoryId, installationId: INST, branch: "main", protectBranch: "main", commit: sha40(i + 100), policyRevision: 1, idempotencyKey: "fill-" + i + "-" + Math.random(), actor: "u" });
    expect(await h.intake.ingest(push(s, COMMIT))).toMatchObject({ status: 429, outcome: "rate_limited" });
    await rt.appStore.cancelAllOpen(s, "test_cleanup"); // no DELETE exists; do not leave 50 runnable rows in the shared dev database
  });
});
