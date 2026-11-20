import type { EngineRun, Finding, ScanJob, Severity } from "../../../src/features/guard/contracts";

export const COMMIT = "c1330c63" + "a".repeat(32);
export const OTHER = "3c6a99ec" + "b".repeat(32);
export const engineSet = ["sast", "sca", "secrets", "iac", "sbom"] as const;

export function run(engine: EngineRun["engine"], status: EngineRun["status"] = "completed", coverage?: EngineRun["coverage"]): EngineRun {
  return { engine, status, reason: "test", scanner: "t", version: "1", rulePack: "r", ...(coverage ? { coverage } : {}) };
}
export function finding(severity: Severity, over: Partial<Finding> = {}): Finding {
  return {
    mode: "live",
    workspaceId: "github-user-1:w",
    projectId: "github-42",
    id: "f" + Math.random().toString(16).slice(2, 10),
    title: "t",
    severity,
    confidence: "high",
    status: "verified",
    source: { engine: "sast", scanner: "t", version: "1", ruleId: "r", rulePack: "p" },
    location: { path: "a.js", line: 1 },
    evidence: [],
    ...over,
  };
}
export function job(over: Partial<ScanJob> = {}): ScanJob {
  return {
    mode: "live",
    workspaceId: "github-user-1:w",
    projectId: "github-42",
    id: "a".repeat(64),
    idempotencyKey: "k-12345678",
    requestedEngines: [...engineSet],
    repository: { provider: "github", repositoryId: "42", branch: "main", commit: COMMIT },
    profile: "standard",
    status: "completed",
    createdAt: "2026-11-20T00:00:00.000Z",
    sourceCoverage: { status: "complete", retrievedFiles: 10, excludedFiles: 0, treeTruncated: false },
    runs: engineSet.map((e) => run(e)),
    findings: [],
    audit: [],
    ...over,
  };
}
