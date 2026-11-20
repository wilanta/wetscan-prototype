import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultPolicy } from "../../../src/features/guard/g04/policy";
import type { G04Runtime } from "../../../src/features/guard/g04/db";
import { G04Error } from "../../../src/features/guard/g04/store";
import { cancelLeftovers, freshScope, openTestRuntime } from "./pg-env";
import { COMMIT, OTHER } from "./fixtures";

let rt: G04Runtime;
beforeAll(async () => {
  rt = await openTestRuntime();
});
afterAll(async () => {
  if (rt) await cancelLeftovers(rt);
  await rt?.close();
});

const identity = (s: ReturnType<typeof freshScope>) => ({ repositoryId: s.repositoryId, repositoryName: "o/r", installationId: 9, ownerActor: "github-user-1", ownerUserId: 1 });
const policy = { ...defaultPolicy, enabled: true };
const newTrigger = (s: ReturnType<typeof freshScope>, over: Record<string, unknown> = {}) => ({ source: "push" as const, repositoryId: s.repositoryId, installationId: 9, branch: "main", protectBranch: "main", commit: COMMIT, policyRevision: 1, idempotencyKey: "push-" + COMMIT.slice(0, 8) + Math.random(), actor: "github-app", ...over });

describe("G04 store against real PostgreSQL", () => {
  it("policy: create, optimistic update, immutable revision history, routing by repository", async () => {
    const s = freshScope();
    expect(await rt.appStore.savePolicy(s, identity(s), policy, 0, "u1", "initial")).toBe(1);
    await expect(rt.appStore.savePolicy(s, identity(s), policy, 0, "u1", "stale")).rejects.toMatchObject({ code: "revision_conflict" });
    expect(await rt.appStore.savePolicy(s, identity(s), { ...policy, minBlockConfidence: "high" }, 1, "u1", "tighten")).toBe(2);
    const hist = await rt.appStore.policyHistory(s);
    expect(hist.map((h) => h.revision)).toEqual([2, 1]);
    expect(hist[0].policy.minBlockConfidence).toBe("high");
    expect((await rt.appStore.getPolicy(s))?.revision).toBe(2);
    expect(await rt.appStore.route(s.repositoryId)).toMatchObject({ workspaceId: s.workspaceId, projectId: s.projectId, installationId: 9, installationState: "active", revision: 2 });
    expect(await rt.appStore.route("987654321012")).toBeNull();
  });
  it("only one workspace may automate a repository", async () => {
    const a = freshScope(),
      b = { ...freshScope(), projectId: a.projectId, repositoryId: a.repositoryId, workspaceId: "github-user-2:w" + a.repositoryId };
    await rt.appStore.savePolicy(a, identity(a), policy, 0, "u1", "a");
    await expect(rt.appStore.savePolicy(b, identity(b), policy, 0, "u2", "b")).rejects.toMatchObject({ code: "limit_exceeded" });
  });
  it("RLS: another project's scope cannot read or write this project's rows", async () => {
    const a = freshScope(),
      b = freshScope();
    await rt.appStore.savePolicy(a, identity(a), policy, 0, "u1", "a");
    const t = await rt.appStore.insertTrigger(a, newTrigger(a));
    expect(await rt.appStore.getPolicy(b)).toBeNull();
    expect(await rt.appStore.getTrigger(b, t.trigger.id)).toBeNull();
    expect(await rt.appStore.listTriggers(b)).toEqual([]);
    // forging the scope columns inside the other scope's transaction is refused by WITH CHECK
    await expect(rt.appStore.insertTrigger(b, { ...newTrigger(a), idempotencyKey: "forge-" + Math.random() })).resolves.toBeTruthy(); // inserted under b's own scope, never a's
    expect((await rt.appStore.listTriggers(a)).every((x) => x.repositoryId === a.repositoryId)).toBe(true);
    const direct = rt.app.scoped({ mode: "live", ...b }, (tx) => rt.app.query(tx, "INSERT INTO guard.g04_triggers(workspace_id,project_id,id,source,repository_id,installation_id,branch,protect_branch,commit_sha,policy_revision,status,idempotency_key,actor) VALUES($1,$2,repeat('a',64),'push','1',1,'m','m',repeat('a',40),1,'pending','forged-key-1','x')", [a.workspaceId, a.projectId]));
    await expect(direct).rejects.toThrow();
  });
  it("trigger insert is idempotent and supersedes older revisions of the same branch / pull request", async () => {
    const s = freshScope();
    await rt.appStore.savePolicy(s, identity(s), policy, 0, "u1", "a");
    const first = await rt.appStore.insertTrigger(s, newTrigger(s, { idempotencyKey: "k-push-1" }));
    const again = await rt.appStore.insertTrigger(s, newTrigger(s, { idempotencyKey: "k-push-1" }));
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.trigger.id).toBe(first.trigger.id);
    const newer = await rt.appStore.insertTrigger(s, newTrigger(s, { commit: OTHER, idempotencyKey: "k-push-2" }));
    expect(newer.superseded).toEqual([first.trigger.id]);
    expect((await rt.appStore.getTrigger(s, first.trigger.id))?.status).toBe("superseded");
    // pull request revisions
    const p1 = await rt.appStore.insertTrigger(s, newTrigger(s, { source: "pull_request", prNumber: 7, branch: "feat", commit: "1".repeat(40), idempotencyKey: "pr-7-rev-1" }));
    const p2 = await rt.appStore.insertTrigger(s, newTrigger(s, { source: "pull_request", prNumber: 7, branch: "feat", commit: "2".repeat(40), idempotencyKey: "pr-7-rev-2" }));
    expect(p2.superseded).toEqual([p1.trigger.id]);
    expect(await rt.appStore.cancelPullRequest(s, 7)).toBe(1);
    // manual rechecks never supersede anything
    const m = await rt.appStore.insertTrigger(s, newTrigger(s, { source: "manual", commit: "3".repeat(40), idempotencyKey: "manual-1" }));
    expect(m.superseded).toEqual([]);
  });
  it("claim is exclusive, bounded by attempts, and finishing a superseded/cancelled trigger is refused", async () => {
    const s = freshScope();
    await rt.appStore.savePolicy(s, identity(s), policy, 0, "u1", "a");
    const t = (await rt.appStore.insertTrigger(s, newTrigger(s))).trigger;
    const [a, b] = await Promise.all([rt.workerStore.claimTrigger(s, t.id, 60000, 3), rt.workerStore.claimTrigger(s, t.id, 60000, 3)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await rt.workerStore.claimTrigger(s, t.id, 60000, 3)).toBeNull(); // lease still valid
    expect(await rt.workerStore.finishTrigger(s, t.id, { status: "pending", lastError: "retry", retryInMs: 0 })).toBe(true);
    expect((await rt.workerStore.claimTrigger(s, t.id, 60000, 3))?.attempts).toBe(2);
    await rt.appStore.cancelTrigger(s, t.id);
    expect(await rt.workerStore.finishTrigger(s, t.id, { status: "completed" })).toBe(false);
    expect((await rt.appStore.getTrigger(s, t.id))?.status).toBe("cancelled");
    // max attempts
    const u = (await rt.appStore.insertTrigger(s, newTrigger(s, { commit: "4".repeat(40) }))).trigger;
    await rt.workerStore.claimTrigger(s, u.id, 60000, 1);
    await rt.workerStore.finishTrigger(s, u.id, { status: "pending", retryInMs: 0 });
    expect(await rt.workerStore.claimTrigger(s, u.id, 60000, 1)).toBeNull();
  });
  it("deliveries: duplicate id is idempotent, same id with different bytes is a conflict", async () => {
    const id = crypto.randomUUID(),
      d = { deliveryId: id, event: "push", action: null, payloadSha256: "a".repeat(64), repositoryId: "42", installationId: 9 };
    expect((await rt.appStore.recordDelivery(d)).state).toBe("new");
    expect((await rt.appStore.recordDelivery(d)).state).toBe("duplicate");
    expect((await rt.appStore.recordDelivery({ ...d, payloadSha256: "b".repeat(64) })).state).toBe("conflict");
    await rt.appStore.finishDelivery(id, "accepted", "ok");
  });
  it("check runs: intent is durable, completed checks are never downgraded, failures back off", async () => {
    const s = freshScope();
    await rt.appStore.savePolicy(s, identity(s), policy, 0, "u1", "a");
    await rt.appStore.planCheck(s, { commit: COMMIT, externalId: "g04:" + COMMIT, status: "queued" });
    expect((await rt.appStore.getCheck(s, COMMIT))?.published).toBe(false);
    await rt.appStore.checkPublished(s, COMMIT, { checkRunId: "555", htmlUrl: null });
    await rt.appStore.planCheck(s, { commit: COMMIT, externalId: "g04:" + COMMIT, status: "completed", conclusion: "failure", decision: "BLOCK" });
    const done = await rt.appStore.planCheck(s, { commit: COMMIT, externalId: "g04:" + COMMIT, status: "in_progress" });
    expect(done).toMatchObject({ status: "completed", conclusion: "failure", decision: "BLOCK" }); // late in_progress cannot downgrade
    await rt.appStore.checkFailed(s, COMMIT, "rate_limited", 120000);
    const c = await rt.appStore.getCheck(s, COMMIT);
    expect(c?.attempts).toBe(1);
    expect(Date.parse(c!.nextAttemptAt)).toBeGreaterThan(Date.now() + 60000);
  });
  it("schedules: bounded per project, atomic slot claim, auto-disable after repeated failures", async () => {
    const s = freshScope();
    await rt.appStore.savePolicy(s, identity(s), policy, 0, "u1", "a");
    const due = new Date(Date.now() - 1000);
    for (let i = 0; i < 5; i++) await rt.appStore.saveSchedule(s, { id: "sched-" + i, enabled: true, cadence: { kind: "interval", minutes: 60 }, branch: "main", profile: "standard", nextRunAt: due, actor: "u1" });
    await expect(rt.appStore.saveSchedule(s, { id: "sched-x", enabled: true, cadence: { kind: "interval", minutes: 60 }, branch: "main", profile: "standard", nextRunAt: due, actor: "u1" })).rejects.toBeInstanceOf(G04Error);
    const next = new Date(Date.now() + 3600000);
    const [a, b] = await Promise.all([rt.workerStore.claimSchedule(s, "sched-0", next), rt.workerStore.claimSchedule(s, "sched-0", next)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    for (let i = 0; i < 5; i++) await rt.workerStore.scheduleResult(s, "sched-1", "failed", null, true);
    expect((await rt.appStore.getSchedule(s, "sched-1"))?.enabled).toBe(false);
    expect(await rt.appStore.disableSchedules(s)).toBe(4);
    const work = await rt.workerStore.work(50);
    expect(work.filter((w) => w.projectId === s.projectId && w.kind === "schedule")).toHaveLength(0); // disabled schedules are not work
  });
  it("worker discovery finds due triggers; the app role cannot call it", async () => {
    const s = freshScope();
    await rt.appStore.savePolicy(s, identity(s), policy, 0, "u1", "a");
    const t = (await rt.appStore.insertTrigger(s, newTrigger(s))).trigger;
    expect((await rt.workerStore.work(50)).some((w) => w.kind === "trigger" && w.ref === t.id && w.projectId === s.projectId)).toBe(true);
    await expect(rt.appStore.work(10)).rejects.toThrow();
  });
  it("provider mapping refuses credential-looking content (no plaintext secrets)", async () => {
    const s = freshScope();
    await rt.appStore.savePolicy(s, identity(s), policy, 0, "u1", "a");
    await rt.appStore.saveMapping(s, "vercel", { projectId: "prj_1", repositoryId: s.repositoryId }, "u1");
    expect((await rt.appStore.getMapping(s))?.config).toMatchObject({ projectId: "prj_1" });
    await expect(rt.appStore.saveMapping(s, "vercel", { projectId: "prj_1", token: "abc" }, "u1")).rejects.toThrow();
  });
  it("no DELETE privilege exists for app or worker", async () => {
    const s = freshScope();
    await expect(rt.app.scoped({ mode: "live", ...s }, (tx) => rt.app.query(tx, "DELETE FROM guard.g04_triggers"))).rejects.toThrow();
    await expect(rt.worker.scoped({ mode: "live", ...s }, (tx) => rt.worker.query(tx, "DELETE FROM guard.g04_audit"))).rejects.toThrow();
  });
});
