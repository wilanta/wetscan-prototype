import { describe, expect, it } from "vitest";
import { defaultPolicy, evaluatePolicy, validatePolicy, branchProtected, triggerAllowed, PolicyError } from "../../../src/features/guard/g04/policy";
import { COMMIT, OTHER, engineSet, finding, job, run } from "./fixtures";

const policy = { ...defaultPolicy, enabled: true };
const ev = (j = job(), p = policy, commit = COMMIT) => evaluatePolicy(j, p, { expectedCommit: commit, policyRevision: 3 });

describe("G04 policy evaluator", () => {
  it("defaults: clean complete scan passes and says it is not a guarantee", () => {
    const e = ev();
    expect(e.decision).toBe("PASS");
    expect(e.reasons[0].message).toMatch(/not a guarantee/);
    expect(e.commit).toBe(COMMIT);
    expect(e.policyRevision).toBe(3);
  });
  it.each([
    ["critical", "BLOCK"],
    ["high", "BLOCK"],
    ["medium", "WARN"],
    ["low", "PASS"],
    ["info", "PASS"],
  ] as const)("default severity %s -> %s", (sev, expected) => {
    expect(ev(job({ findings: [finding(sev)] })).decision).toBe(expected);
  });
  it("is deterministic: identical inputs give an identical digest; a changed policy changes it", () => {
    const j = job({ findings: [finding("medium", { id: "x" })] });
    expect(ev(j).digest).toBe(ev(structuredClone(j)).digest);
    expect(ev(j, { ...policy, minBlockConfidence: "high" }).digest).not.toBe(ev(j).digest);
  });
  it("a scan of another commit can never decide the result (stale)", () => {
    const e = ev(job({ findings: [] }), policy, OTHER);
    expect(e.decision).toBe("INCOMPLETE");
    expect(e.reasons[0].code).toBe("stale_commit");
    // even a clean stale scan must not PASS the new commit; and a blocking stale scan must not BLOCK it either
    expect(ev(job({ findings: [finding("critical")] }), policy, OTHER).counts.blocking).toBe(0);
  });
  it("missing / failed / partial required engines are INCOMPLETE, never PASS", () => {
    expect(ev(job({ runs: engineSet.filter((e) => e !== "iac").map((e) => run(e)) })).decision).toBe("INCOMPLETE");
    expect(ev(job({ runs: engineSet.map((e) => run(e, e === "sca" ? "failed" : "completed")) })).decision).toBe("INCOMPLETE");
    expect(ev(job({ runs: engineSet.map((e) => run(e, "completed", e === "sast" ? { status: "partial", scannedFiles: 1, eligibleFiles: 2, scope: "x" } : undefined)) })).decision).toBe("INCOMPLETE");
    for (const status of ["queued", "running", "failed", "cancelled"] as const) expect(ev(job({ status })).decision).toBe("INCOMPLETE");
  });
  it("partial source coverage is INCOMPLETE unless the policy waives it; missing coverage is never PASS", () => {
    const partial = job({ sourceCoverage: { status: "partial", retrievedFiles: 1, excludedFiles: 2, treeTruncated: false } });
    expect(ev(partial).decision).toBe("INCOMPLETE");
    expect(ev(partial, { ...policy, requireCompleteSourceCoverage: false }).decision).toBe("PASS");
    expect(ev(job({ sourceCoverage: undefined })).decision).toBe("INCOMPLETE");
  });
  it("BLOCK outranks INCOMPLETE and INCOMPLETE can be configured to BLOCK", () => {
    const j = job({ status: "completed_partial", runs: engineSet.map((e) => run(e, e === "iac" ? "failed" : "completed")), findings: [finding("critical")] });
    expect(ev(j).decision).toBe("BLOCK");
    const none = job({ runs: [] });
    expect(ev(none).decision).toBe("INCOMPLETE");
    expect(ev(none, { ...policy, onMissingCoverage: "block" }).decision).toBe("BLOCK");
  });
  it("confidence floor and potential findings downgrade a blocker to a warning", () => {
    expect(ev(job({ findings: [finding("high", { confidence: "low" })] })).decision).toBe("WARN");
    expect(ev(job({ findings: [finding("high", { status: "potential" })] }), { ...policy, blockPotential: false }).decision).toBe("WARN");
    expect(ev(job({ findings: [finding("high", { status: "potential" })] })).decision).toBe("BLOCK");
  });
  it("triaged findings do not count; unknown severity follows its configured behaviour", () => {
    expect(ev(job({ findings: [finding("critical", { status: "false_positive" }), finding("high", { status: "verified_fixed" })] })).decision).toBe("PASS");
    const unknown = job({ findings: [finding("medium", { severityKnown: false })] });
    expect(ev(unknown).decision).toBe("INCOMPLETE");
    expect(ev(unknown, { ...policy, onUnknownSeverity: "warn" }).decision).toBe("WARN");
    expect(ev(unknown, { ...policy, onUnknownSeverity: "block" }).decision).toBe("BLOCK");
  });
  it("blocking severities are configurable", () => {
    const p = { ...policy, blockSeverities: ["critical" as const], warnSeverities: ["high" as const, "medium" as const] };
    expect(ev(job({ findings: [finding("high")] }), p).decision).toBe("WARN");
    expect(ev(job({ findings: [finding("critical")] }), p).decision).toBe("BLOCK");
  });
});

describe("G04 not-applicable engines", () => {
  const na = job({ runs: engineSet.map((e) => run(e, e === "iac" ? "not_applicable" : "completed")) });
  it("default: a not_applicable required engine is NOT clean coverage (INCOMPLETE)", () => {
    expect(ev(na).decision).toBe("INCOMPLETE");
  });
  it("opt-in satisfy: vacuously covered, still PASS only if something genuinely completed", () => {
    const p = { ...policy, onNotApplicable: "satisfy" as const };
    expect(ev(na, p)).toMatchObject({ decision: "PASS", coverage: { notApplicable: ["iac"], missing: [] } });
    expect(ev(job({ runs: engineSet.map((e) => run(e, "not_applicable")) }), p).decision).toBe("INCOMPLETE");
    expect(ev(job({ runs: engineSet.map((e) => run(e, e === "iac" ? "not_applicable" : "completed")), findings: [finding("high")] }), p).decision).toBe("BLOCK");
  });
  it("revisions stored before the field existed validate with the conservative default", () => {
    const old: Record<string, unknown> = { ...defaultPolicy };
    delete old.onNotApplicable;
    expect(validatePolicy(old).onNotApplicable).toBe("incomplete");
    expect(() => validatePolicy({ ...defaultPolicy, onNotApplicable: "pass" })).toThrow(PolicyError);
  });
});

describe("G04 policy validation", () => {
  it("accepts the default and rejects unknown fields, overlaps and engines outside the profile", () => {
    expect(validatePolicy(defaultPolicy)).toEqual(defaultPolicy);
    const bad = (o: object) => expect(() => validatePolicy({ ...defaultPolicy, ...o })).toThrow(PolicyError);
    bad({ extra: 1 });
    bad({ blockSeverities: ["high"], warnSeverities: ["high"] });
    bad({ scanProfile: "quick", requiredEngines: ["sast", "iac"] });
    bad({ requiredEngines: [] });
    bad({ requiredEngines: ["dast"] });
    bad({ protectedBranches: ["refs/heads/main"] });
    bad({ protectedBranches: ["a/*/b"] });
    bad({ onMissingCoverage: "pass" });
    bad({ triggers: { pullRequest: true } });
  });
  it("branch protection supports exact names and one trailing wildcard", () => {
    const p = { ...policy, protectedBranches: ["main", "release/*"] };
    expect(branchProtected(p, "main")).toBe(true);
    expect(branchProtected(p, "release/1.2")).toBe(true);
    expect(branchProtected(p, "release/")).toBe(false);
    expect(branchProtected(p, "feature/x")).toBe(false);
  });
  it("trigger gating: disabled policy and unprotected branches never scan", () => {
    expect(triggerAllowed({ ...policy, enabled: false }, "push", "main")).toBe(false);
    expect(triggerAllowed(policy, "push", "main")).toBe(true);
    expect(triggerAllowed(policy, "push", "dev")).toBe(false);
    expect(triggerAllowed({ ...policy, triggers: { ...policy.triggers, pullRequest: false } }, "pull_request", "main")).toBe(false);
    expect(triggerAllowed(policy, "schedule", "main")).toBe(false);
  });
});
