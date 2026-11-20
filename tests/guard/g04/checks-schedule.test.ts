import { describe, expect, it } from "vitest";
import { CHECK_NAME, GithubChecks, conclusionFor, outputFor, passesRequiredCheck } from "../../../src/features/guard/g04/checks";
import { GhError, fetchTransport, installationTokens, type GhTransport } from "../../../src/features/guard/g04/github";
import { defaultPolicy, evaluatePolicy, decisions } from "../../../src/features/guard/g04/policy";
import { nextRun, validateCadence, ScheduleError } from "../../../src/features/guard/g04/schedule";
import { COMMIT, finding, job } from "./fixtures";

const policy = { ...defaultPolicy, enabled: true };

describe("check conclusion mapping", () => {
  it("only PASS and WARN can pass a required check; BLOCK and INCOMPLETE never can", () => {
    const map = Object.fromEntries(decisions.map((d) => [d, conclusionFor(d, policy)]));
    expect(map).toEqual({ PASS: "success", WARN: "neutral", BLOCK: "failure", INCOMPLETE: "action_required" });
    expect(passesRequiredCheck(map.BLOCK)).toBe(false);
    expect(passesRequiredCheck(map.INCOMPLETE)).toBe(false);
    expect(passesRequiredCheck(conclusionFor("INCOMPLETE", { ...policy, incompleteConclusion: "failure" }))).toBe(false);
  });
  it("output states commit, counts, missing coverage and never claims enforcement", () => {
    const e = evaluatePolicy(job({ runs: [], findings: [finding("high")] }), policy, { expectedCommit: COMMIT, policyRevision: 2 });
    const o = outputFor(e, { findings: [{ severity: "high", title: "Bad thing", path: "src/a.js", line: 3, ruleId: "r1" }, { severity: "high", title: "x", path: "../etc/passwd", line: 1, ruleId: "r" }] });
    expect(o.summary).toContain(COMMIT.slice(0, 12));
    expect(o.summary).toContain("Missing:");
    expect(o.summary).toMatch(/not a guarantee/);
    expect(o.summary).toMatch(/not connected/);
    expect(o.annotations).toHaveLength(1); // traversal path dropped
    expect(o.annotations?.[0]).toMatchObject({ path: "src/a.js", annotation_level: "failure" });
  });
});

type Call = { method: string; path: string; body?: unknown };
function fake(over: Partial<Record<string, (c: Call) => unknown>> = {}, perms: Record<string, string> = { checks: "write", metadata: "read" }) {
  const calls: Call[] = [];
  const transport: GhTransport = async (method, path, _t, body) => {
    calls.push({ method, path, body });
    for (const [k, fn] of Object.entries(over)) if (`${method} ${path}`.startsWith(k)) { const r = fn!({ method, path, body }); if (r instanceof Error) throw r; return { status: 200, headers: new Headers(), json: r }; }
    if (path.endsWith("/access_tokens")) return { status: 201, headers: new Headers(), json: { token: "tok", expires_at: new Date(Date.now() + 3600000).toISOString(), permissions: perms, repository_selection: "selected" } };
    if (method === "DELETE") return { status: 204, headers: new Headers(), json: null };
    if (path.includes("/check-runs?")) return { status: 200, headers: new Headers(), json: { check_runs: [] } };
    return { status: 201, headers: new Headers(), json: { id: 555, html_url: "https://github.com/o/r/runs/555" } };
  };
  const checks = new GithubChecks(transport, installationTokens(transport, () => "jwt"), 777);
  return { calls, checks };
}
const target = { installationId: 9, repositoryId: "42", repositoryName: "o/r", commit: COMMIT };

describe("GitHub Check Runs", () => {
  it("creates a check bound to the exact commit with a repository-scoped, minimal, revoked token", async () => {
    const { calls, checks } = fake();
    const out = await checks.upsert(target, { externalId: "t1", status: "queued", output: { title: "q", summary: "s" } });
    expect(out).toEqual({ checkRunId: "555", htmlUrl: "https://github.com/o/r/runs/555" });
    const tok = calls.find((c) => c.path.endsWith("/access_tokens"))!;
    expect(tok.body).toEqual({ repository_ids: [42], permissions: { checks: "write", metadata: "read" } });
    const post = calls.find((c) => c.method === "POST" && c.path === "/repos/o/r/check-runs")!;
    expect(post.body).toMatchObject({ name: CHECK_NAME, head_sha: COMMIT, status: "queued", external_id: "t1" });
    expect(post.body).not.toHaveProperty("conclusion");
    expect(calls.at(-1)).toMatchObject({ method: "DELETE", path: "/installation/token" });
  });
  it("is idempotent: reuses an existing run with the same external id, updates by PATCH", async () => {
    const { calls, checks } = fake({ "GET /repos/o/r/commits/": () => ({ check_runs: [{ id: 777, external_id: "t1" }] }) });
    await checks.upsert(target, { externalId: "t1", status: "completed", conclusion: "failure", output: { title: "t", summary: "s" } });
    expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/check-runs"))).toBe(false);
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.path).toBe("/repos/o/r/check-runs/777");
    expect(patch.body).toMatchObject({ status: "completed", conclusion: "failure" });
  });
  it("refuses to write when the App was not actually granted checks:write (no personal-token fallback)", async () => {
    const { calls, checks } = fake({}, { metadata: "read" });
    await expect(checks.upsert(target, { externalId: "t", status: "queued", output: { title: "a", summary: "b" } })).rejects.toMatchObject({ kind: "permission_denied" });
    expect(calls.some((c) => c.path.includes("/check-runs"))).toBe(false);
    expect(calls.at(-1)?.method).toBe("DELETE"); // token still revoked
  });
  it("maps GitHub's 422-on-token (permission not granted) and rate limits to fixed categories", async () => {
    const { checks } = fake({ "POST /app/installations/": () => new GhError("validation", 422) });
    await expect(checks.upsert(target, { externalId: "t", status: "queued", output: { title: "a", summary: "b" } })).rejects.toMatchObject({ kind: "permission_denied" });
    const rl = fake({ "POST /repos/o/r/check-runs": () => new GhError("rate_limited", 403, 30000) });
    await expect(rl.checks.upsert(target, { externalId: "t", status: "queued", output: { title: "a", summary: "b" } })).rejects.toMatchObject({ kind: "rate_limited", retryAfterMs: 30000 });
  });
  it("reports required-check enforcement only from observation, never from having published", async () => {
    const rules = [{ type: "required_status_checks", parameters: { required_status_checks: [{ context: CHECK_NAME }] } }];
    const yes = fake({ "GET /repos/o/r/rules/branches/main": () => rules, "GET /repos/o/r/branches/main/protection": () => new GhError("not_found", 404) });
    expect(await yes.checks.requiredChecks({ installationId: 9, repositoryId: "42", repositoryName: "o/r" }, "main")).toMatchObject({ observable: true, requiresGuardCheck: true, sources: { rulesets: "required", classic: "not_required" } });
    const no = fake({ "GET /repos/o/r/rules/branches/main": () => [], "GET /repos/o/r/branches/main/protection": () => new GhError("not_found", 404) });
    expect(await no.checks.requiredChecks({ installationId: 9, repositoryId: "42", repositoryName: "o/r" }, "main")).toMatchObject({ requiresGuardCheck: false });
    const blind = fake({ "GET /repos/o/r/rules": () => new GhError("permission_denied", 403), "GET /repos/o/r/branches": () => new GhError("permission_denied", 403) });
    expect(await blind.checks.requiredChecks({ installationId: 9, repositoryId: "42", repositoryName: "o/r" }, "main")).toMatchObject({ observable: false, requiresGuardCheck: null });
  });
});

describe("GitHub transport", () => {
  const t = (res: Response) => fetchTransport((async () => res) as unknown as typeof fetch);
  it("maps statuses and rate-limit headers to fixed categories", async () => {
    await expect(t(new Response("{}", { status: 401 }))("GET", "/x", "t")).rejects.toMatchObject({ kind: "unauthorized" });
    await expect(t(new Response("{}", { status: 403 }))("GET", "/x", "t")).rejects.toMatchObject({ kind: "permission_denied" });
    await expect(t(new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "retry-after": "12" } }))("GET", "/x", "t")).rejects.toMatchObject({ kind: "rate_limited", retryAfterMs: 12000 });
    await expect(t(new Response("{}", { status: 502 }))("GET", "/x", "t")).rejects.toMatchObject({ kind: "unavailable" });
    await expect(fetchTransport((async () => { throw new Error("net"); }) as unknown as typeof fetch)("GET", "/x", "t")).rejects.toMatchObject({ kind: "unavailable" });
    await expect(t(new Response("{}"))("GET", "/../x", "t")).rejects.toMatchObject({ kind: "validation" });
  });
});

describe("schedules", () => {
  it("validates intervals and the minimum cadence", () => {
    expect(validateCadence({ kind: "interval", minutes: 1440 })).toEqual({ kind: "interval", minutes: 1440 });
    for (const bad of [{ kind: "interval", minutes: 5 }, { kind: "interval", minutes: 99999 }, { kind: "interval", minutes: 60.5 }, { kind: "x" }, null, { kind: "interval", minutes: 60, extra: 1 }]) expect(() => validateCadence(bad)).toThrow(ScheduleError);
  });
  it("cron: accepts hourly-or-slower, rejects malformed and too-frequent expressions", () => {
    expect(validateCadence({ kind: "cron", expr: "15 3 * * 1-5" })).toEqual({ kind: "cron", expr: "15 3 * * 1-5" });
    expect(validateCadence({ kind: "cron", expr: "0 */6 * * *" })).toBeTruthy();
    for (const bad of ["* * * * *", "*/5 * * * *", "0,30 * * * *", "61 * * * *", "0 0 * *", "a b c d e", "0 0 31 2 *x"]) expect(() => validateCadence({ kind: "cron", expr: bad })).toThrow(ScheduleError);
  });
  it("computes the next run strictly after the anchor (UTC)", () => {
    const a = Date.UTC(2026, 10, 20, 10, 30);
    expect(nextRun({ kind: "interval", minutes: 120 }, a)).toBe(a + 7200000);
    expect(nextRun({ kind: "cron", expr: "0 3 * * *" }, a)).toBe(Date.UTC(2026, 10, 21, 3, 0));
    expect(nextRun({ kind: "cron", expr: "0 3 * * *" }, Date.UTC(2026, 10, 21, 3, 0))).toBe(Date.UTC(2026, 10, 22, 3, 0));
    // 2026-11-20 is a Friday; next Monday-only run is the 23rd
    expect(nextRun({ kind: "cron", expr: "0 9 * * 1" }, a)).toBe(Date.UTC(2026, 10, 23, 9, 0));
  });
  it("an impossible date terminates with an error instead of looping", () => {
    expect(() => nextRun({ kind: "cron", expr: "0 0 31 2 *" }, Date.now())).toThrow(ScheduleError);
  });
});
