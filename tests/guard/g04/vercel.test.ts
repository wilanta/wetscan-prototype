import { describe, expect, it } from "vitest";
import { ProviderError, assessEnforcement, type DeploymentInfo, type GateRegistration } from "../../../src/features/guard/g04/provider";
import { vercelProvider, vercelToken, type VercelFetch } from "../../../src/features/guard/g04/vercel";
import { COMMIT, OTHER } from "./fixtures";

const mapping = { projectId: "prj_abc123", teamId: "team_xyz", repositoryId: "42" };
const dep = (over: Record<string, unknown> = {}) => ({ id: "dpl_1", projectId: "prj_abc123", readyState: "READY", target: "production", gitSource: { type: "github", repoId: 42, sha: COMMIT, ref: "main" }, readySubstate: "STAGED", checksState: "completed", checksConclusion: "failed", createdAt: 1, url: "x.vercel.app", ...over });
function provider(handler: (url: URL, init: Parameters<VercelFetch>[1]) => Response | Promise<Response>) {
  const seen: { url: URL; method: string; auth: string }[] = [];
  const f: VercelFetch = async (u, init) => {
    const url = new URL(u);
    seen.push({ url, method: init.method, auth: init.headers.Authorization });
    return handler(url, init);
  };
  return { seen, p: vercelProvider(mapping, async () => "tok_0123456789abcdef", f) };
}
const json = (o: unknown, status = 200, h: Record<string, string> = {}) => new Response(JSON.stringify(o), { status, headers: h });

describe("Vercel adapter (recorded-shape doubles; real provider acceptance is separate)", () => {
  it("reads a deployment with commit/repo/environment/promotion/check state, scoped to the mapped team", async () => {
    const { p, seen } = provider(() => json(dep()));
    const d = await p.getDeployment("dpl_1");
    expect(d).toMatchObject({ deploymentId: "dpl_1", commit: COMMIT, repositoryId: "42", environment: "production", state: "READY", promoted: false, checks: { state: "completed", conclusion: "failed" } });
    expect(seen[0].url.pathname).toBe("/v13/deployments/dpl_1");
    expect(seen[0].url.searchParams.get("teamId")).toBe("team_xyz");
    expect(seen[0].method).toBe("GET");
    expect(seen[0].auth).toBe("Bearer tok_0123456789abcdef");
  });
  it("never accepts a deployment of another project or another repository", async () => {
    await expect(provider(() => json(dep({ projectId: "prj_other" }))).p.getDeployment("dpl_1")).rejects.toMatchObject({ kind: "not_found" });
    await expect(provider(() => json(dep({ gitSource: { type: "github", repoId: 99, sha: COMMIT } }))).p.getDeployment("dpl_1")).rejects.toMatchObject({ kind: "not_found" });
  });
  it("rejects malformed provider data and bad identifiers", async () => {
    await expect(provider(() => json({ nope: 1 })).p.getDeployment("dpl_1")).rejects.toMatchObject({ kind: "invalid_response" });
    await expect(provider(() => json(dep({ gitSource: { repoId: 42, sha: "XYZ" } }))).p.getDeployment("dpl_1")).rejects.toMatchObject({ kind: "invalid_response" });
    await expect(provider(() => json(dep())).p.getDeployment("../etc")).rejects.toMatchObject({ kind: "not_found" });
  });
  it.each([
    [401, "unauthorized"],
    [403, "permission_denied"],
    [404, "not_found"],
    [429, "rate_limited"],
    [500, "unavailable"],
  ] as const)("maps HTTP %i to %s (credential revocation/permission/outage are explicit)", async (status, kind) => {
    await expect(provider(() => json({}, status, { "retry-after": "5" })).p.getDeployment("dpl_1")).rejects.toMatchObject({ kind });
  });
  it("network failure is 'unavailable'; a missing token is 'not_configured' and nothing is called", async () => {
    await expect(provider(() => { throw new Error("net"); }).p.getDeployment("dpl_1")).rejects.toMatchObject({ kind: "unavailable" });
    const f: VercelFetch = async () => { throw new Error("must not be called"); };
    await expect(vercelProvider(mapping, async () => { throw new ProviderError("not_configured"); }, f).getDeployment("dpl_1")).rejects.toMatchObject({ kind: "not_configured" });
    await expect(vercelToken({})).rejects.toMatchObject({ kind: "not_configured" });
    await expect(vercelToken({ GUARD_VERCEL_TOKEN_FILE: "relative/token" })).rejects.toMatchObject({ kind: "not_configured" });
    expect(await vercelToken({ GUARD_VERCEL_TOKEN: "abcdefghijklmnop1234" })).toBe("abcdefghijklmnop1234");
  });
  it("verifies the project link and refuses a project linked to another repository", async () => {
    expect(await provider(() => json({ id: "prj_abc123", name: "app", framework: "nextjs", link: { repoId: 42 } })).p.verifyConnection()).toMatchObject({ projectName: "app", linkedRepositoryId: "42" });
    await expect(provider(() => json({ id: "prj_abc123", link: { repoId: 7 } })).p.verifyConnection()).rejects.toMatchObject({ kind: "permission_denied" });
  });
  it("observeGate is read-only (GET); registerGate is a POST to the project checks endpoint with a git-provider source", async () => {
    const o = provider(() => json({ checks: [{ id: "chk_1", name: "WetScan Guard / Security gate", blocks: "deployment-alias", targets: ["production"] }] }));
    expect(await o.p.observeGate("WetScan Guard / Security gate")).toMatchObject({ registered: true, blocks: "deployment-alias", providerCheckId: "chk_1" });
    expect(o.seen.every((s) => s.method === "GET")).toBe(true);
    expect(await provider(() => json({ checks: [] })).p.observeGate("WetScan Guard / Security gate")).toMatchObject({ registered: false });
    let body: unknown;
    const r = provider((_u, init) => { body = JSON.parse(init.body!); return json({ id: "chk_2", name: "G", blocks: "deployment-alias", targets: ["production"] }); });
    await r.p.registerGate({ checkName: "G", blocks: "deployment-alias", targets: ["production"] });
    expect(r.seen[0].method).toBe("POST");
    expect(body).toMatchObject({ source: { kind: "git-provider", provider: "github", externalCheckName: "G" }, blocks: "deployment-alias" });
  });
});

const info = (over: Partial<DeploymentInfo> = {}): DeploymentInfo => ({ provider: "vercel", deploymentId: "dpl_1", projectId: "prj_abc123", url: null, state: "READY", environment: "production", commit: COMMIT, branch: "main", repositoryId: "42", createdAt: 1, promoted: false, checks: { state: "completed", conclusion: "failed" }, ...over });
const gate: GateRegistration = { registered: true, blocks: "deployment-alias", targets: ["production"], providerCheckId: "c" };
const base = { commit: COMMIT, github: { checkPublished: true, requiredCheckObserved: null as boolean | null } };

describe("enforcement assessment: decision is never enforcement", () => {
  it("a local BLOCK with nothing observed is NOT enforced", () => {
    const r = assessEnforcement({ ...base, decision: "BLOCK", deployment: null });
    expect(r).toMatchObject({ decision: "BLOCK", enforced: false, level: "CHECK_PUBLISHED_NOT_REQUIRED" });
    expect(r.claims).toMatchObject({ githubMerge: "NOT_VERIFIED", vercelPromotion: "NOT_VERIFIED", deploymentCreation: "NOT_CLAIMED" });
    expect(r.notes.join(" ")).toMatch(/not a required branch rule/);
  });
  it("a registered gate alone is 'registered', not enforced", () => {
    const r = assessEnforcement({ ...base, decision: "BLOCK", deployment: { info: info({ promoted: null, checks: { state: null, conclusion: null }, state: "BUILDING" }), gate } });
    expect(r).toMatchObject({ enforced: false, level: "DEPLOYMENT_GATE_REGISTERED" });
  });
  it("enforced only with provider evidence: production, this commit, READY, not promoted, checks not succeeded, gate registered", () => {
    expect(assessEnforcement({ ...base, decision: "BLOCK", deployment: { info: info(), gate } })).toMatchObject({ enforced: true, level: "PROMOTION_HELD_OBSERVED", claims: { vercelPromotion: "HELD_OBSERVED" } });
    expect(assessEnforcement({ ...base, decision: "INCOMPLETE", deployment: { info: info(), gate } }).enforced).toBe(true);
    expect(assessEnforcement({ ...base, decision: "BLOCK", deployment: { info: info({ environment: "preview" }), gate } }).enforced).toBe(false);
    expect(assessEnforcement({ ...base, decision: "BLOCK", deployment: { info: info(), gate: { ...gate, registered: false } } }).enforced).toBe(false);
  });
  it("wrong commit, stale deployment and provider outage are never enforcement", () => {
    const wrong = assessEnforcement({ ...base, decision: "BLOCK", deployment: { info: info({ commit: OTHER }), gate } });
    expect(wrong).toMatchObject({ enforced: false, wrongCommit: true });
    expect(assessEnforcement({ ...base, decision: "BLOCK", deployment: { info: info(), gate, latestCommitOnBranch: OTHER } })).toMatchObject({ enforced: false, stale: true });
    expect(assessEnforcement({ ...base, decision: "BLOCK", deployment: null, providerError: "unavailable" })).toMatchObject({ enforced: false, claims: { vercelPromotion: "UNAVAILABLE" } });
    expect(assessEnforcement({ ...base, decision: "BLOCK", deployment: { info: info({ commit: null }), gate } }).enforced).toBe(false);
  });
  it("a promoted deployment under BLOCK is reported as a visible mismatch, not hidden", () => {
    const r = assessEnforcement({ ...base, decision: "BLOCK", deployment: { info: info({ promoted: true, checks: { state: "completed", conclusion: "succeeded" } }), gate } });
    expect(r).toMatchObject({ enforced: false, level: "PROMOTION_RELEASED_OBSERVED" });
    expect(r.notes.join(" ")).toMatch(/MISMATCH/);
  });
  it("merge-rule observation is its own claim and does not imply promotion enforcement", () => {
    const r = assessEnforcement({ ...base, decision: "BLOCK", github: { checkPublished: true, requiredCheckObserved: true }, deployment: null });
    expect(r.claims).toMatchObject({ githubMerge: "RULE_OBSERVED", vercelPromotion: "NOT_VERIFIED" });
    expect(r.enforced).toBe(false);
  });
});
