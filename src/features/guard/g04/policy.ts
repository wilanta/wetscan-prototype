import type { Engine, ScanJob, Severity } from "../contracts";
import { fingerprint } from "../../../platform/identity";
import { validGuardBranch } from "../live/revision";
import { repositoryProfiles } from "../live/scan-profiles";

/** G04 security gate decision. This is a POLICY outcome; whether anything was ENFORCED is a separate fact (see Enforcement). */
export type Decision = "PASS" | "WARN" | "BLOCK" | "INCOMPLETE";
export const decisions: readonly Decision[] = ["PASS", "WARN", "BLOCK", "INCOMPLETE"];
export type Confidence = "low" | "medium" | "high";
export const severities: readonly Severity[] = ["critical", "high", "medium", "low", "info"];
/** Repository engines the G02 product path can actually run (no DAST/API/integrity/container here). */
export const gateEngines: readonly Engine[] = ["sast", "sca", "secrets", "iac", "sbom"];

export interface SecurityPolicy {
  version: 1;
  enabled: boolean;
  /** Exact branch names or one trailing "/*" wildcard ("release/*"). Pull requests are matched on their BASE branch. */
  protectedBranches: string[];
  triggers: { pullRequest: boolean; push: boolean; manual: boolean; schedule: boolean };
  scanProfile: ScanJob["profile"];
  requiredEngines: Engine[];
  blockSeverities: Severity[];
  warnSeverities: Severity[];
  /** Findings below this confidence can never block; they are downgraded to WARN. */
  minBlockConfidence: Confidence;
  /** Also block on "potential" (unverified) findings. */
  blockPotential: boolean;
  requireCompleteSourceCoverage: boolean;
  /** What a failed/unavailable/partial required engine produces. There is deliberately no "pass" option. */
  onMissingCoverage: "incomplete" | "block";
  onUnknownSeverity: "incomplete" | "warn" | "block";
  /** GitHub conclusion for WARN. "neutral" and "success" both let a required check pass: WARN never blocks a merge. */
  warnConclusion: "neutral" | "success";
  incompleteConclusion: "action_required" | "failure";
}

export const defaultPolicy: SecurityPolicy = {
  version: 1,
  enabled: false,
  protectedBranches: ["main"],
  triggers: { pullRequest: true, push: true, manual: true, schedule: false },
  scanProfile: "standard",
  requiredEngines: ["sast", "sca", "secrets", "iac", "sbom"],
  blockSeverities: ["critical", "high"],
  warnSeverities: ["medium"],
  minBlockConfidence: "medium",
  blockPotential: true,
  requireCompleteSourceCoverage: true,
  onMissingCoverage: "incomplete",
  onUnknownSeverity: "incomplete",
  warnConclusion: "neutral",
  incompleteConclusion: "action_required",
};

export class PolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
const fail = (code: string): never => {
  throw new PolicyError(code);
};
const only = <T extends string>(v: unknown, allowed: readonly T[], code: string): T =>
  allowed.includes(v as T) ? (v as T) : fail(code);
const list = <T extends string>(v: unknown, allowed: readonly T[], code: string, max = 16): T[] => {
  if (!Array.isArray(v) || v.length > max || new Set(v).size !== v.length || v.some((x) => !allowed.includes(x as T))) fail(code);
  return [...(v as T[])];
};
export function validBranchPattern(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (v.endsWith("/*")) return v.length > 2 && validGuardBranch(v.slice(0, -2));
  return validGuardBranch(v);
}
/** Strict, closed-schema validation: unknown keys are rejected, never silently stored. */
export function validatePolicy(input: unknown): SecurityPolicy {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("policy_invalid");
  const v = input as Record<string, unknown>,
    keys = Object.keys(defaultPolicy);
  if (Object.keys(v).some((k) => !keys.includes(k))) fail("policy_unknown_field");
  const t = (v.triggers ?? {}) as Record<string, unknown>;
  if (!v.triggers || typeof t !== "object" || Object.keys(t).some((k) => !["pullRequest", "push", "manual", "schedule"].includes(k)) || ["pullRequest", "push", "manual", "schedule"].some((k) => typeof t[k] !== "boolean")) fail("policy_triggers");
  if (v.version !== 1 || typeof v.enabled !== "boolean" || typeof v.blockPotential !== "boolean" || typeof v.requireCompleteSourceCoverage !== "boolean") fail("policy_invalid");
  if (!Array.isArray(v.protectedBranches) || !v.protectedBranches.length || v.protectedBranches.length > 20 || new Set(v.protectedBranches).size !== v.protectedBranches.length || !v.protectedBranches.every(validBranchPattern)) fail("policy_branches");
  const profile = only(v.scanProfile, ["quick", "standard", "full"] as const, "policy_profile");
  const required = list(v.requiredEngines, gateEngines, "policy_engines", 5);
  if (!required.length) fail("policy_engines_empty");
  const profileEngines = repositoryProfiles[profile];
  // A policy may not require an engine its own scan profile will never run: that would be permanently INCOMPLETE by design.
  if (required.some((e) => !profileEngines.includes(e))) fail("policy_engine_not_in_profile");
  const block = list(v.blockSeverities, severities, "policy_block_severities", 5),
    warn = list(v.warnSeverities, severities, "policy_warn_severities", 5);
  if (block.some((s) => warn.includes(s))) fail("policy_severity_overlap");
  return {
    version: 1,
    enabled: v.enabled as boolean,
    protectedBranches: [...(v.protectedBranches as string[])],
    triggers: { pullRequest: t.pullRequest as boolean, push: t.push as boolean, manual: t.manual as boolean, schedule: t.schedule as boolean },
    scanProfile: profile,
    requiredEngines: required,
    blockSeverities: block,
    warnSeverities: warn,
    minBlockConfidence: only(v.minBlockConfidence, ["low", "medium", "high"] as const, "policy_confidence"),
    blockPotential: v.blockPotential as boolean,
    requireCompleteSourceCoverage: v.requireCompleteSourceCoverage as boolean,
    onMissingCoverage: only(v.onMissingCoverage, ["incomplete", "block"] as const, "policy_missing_coverage"),
    onUnknownSeverity: only(v.onUnknownSeverity, ["incomplete", "warn", "block"] as const, "policy_unknown_severity"),
    warnConclusion: only(v.warnConclusion, ["neutral", "success"] as const, "policy_warn_conclusion"),
    incompleteConclusion: only(v.incompleteConclusion, ["action_required", "failure"] as const, "policy_incomplete_conclusion"),
  };
}
export const policyDigest = (p: SecurityPolicy) => fingerprint(p);

export function branchProtected(policy: SecurityPolicy, branch: string) {
  return policy.protectedBranches.some((p) => (p.endsWith("/*") ? branch.startsWith(p.slice(0, -1)) && branch.length > p.length - 1 : p === branch));
}
export type TriggerSource = "pull_request" | "push" | "manual" | "schedule" | "check_rerun";
/** Whether this policy wants a scan for this source/branch. Manual rechecks of an exact commit are always allowed when manual is on. */
export function triggerAllowed(policy: SecurityPolicy, source: TriggerSource, branch: string) {
  if (!policy.enabled) return false;
  if (source === "manual" || source === "check_rerun") return policy.triggers.manual && branchProtected(policy, branch);
  if (!branchProtected(policy, branch)) return false;
  return source === "pull_request" ? policy.triggers.pullRequest : source === "push" ? policy.triggers.push : policy.triggers.schedule;
}

export interface Reason {
  code:
    | "stale_commit"
    | "scan_not_finished"
    | "scan_failed"
    | "engine_missing"
    | "engine_partial"
    | "source_partial"
    | "unknown_severity"
    | "blocking_findings"
    | "warning_findings"
    | "clean";
  message: string;
}
export interface PolicyEvaluation {
  version: 1;
  decision: Decision;
  reasons: Reason[];
  commit: string;
  scanId: string;
  policyRevision: number;
  policyDigest: string;
  counts: Record<Severity, number> & { active: number; blocking: number; warning: number; unknownSeverity: number };
  coverage: { required: Engine[]; completed: Engine[]; missing: Engine[]; partial: Engine[]; source: "complete" | "partial" | "unverified" };
  /** Digest of every input that determined the decision; identical inputs give identical digests. */
  digest: string;
}
const rank: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const resolved = ["verified_fixed", "false_positive", "risk_accepted"];

/**
 * Deterministic and pure. `expectedCommit` is the commit the check/deployment is FOR: a scan of any other commit can never
 * decide the result (it is reported as INCOMPLETE/stale), so findings from an older or newer revision are never reused.
 */
export function evaluatePolicy(
  job: ScanJob,
  policy: SecurityPolicy,
  ctx: { expectedCommit: string; policyRevision: number },
): PolicyEvaluation {
  const reasons: Reason[] = [],
    counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0, active: 0, blocking: 0, warning: 0, unknownSeverity: 0 };
  const coverage: PolicyEvaluation["coverage"] = { required: [...policy.requiredEngines], completed: [], missing: [], partial: [], source: "unverified" };
  const finish = (decision: Decision): PolicyEvaluation => {
    const body = { decision, reasons, commit: ctx.expectedCommit, scanId: job.id, policyRevision: ctx.policyRevision, policyDigest: policyDigest(policy), counts, coverage };
    return { version: 1, ...body, digest: fingerprint(body) };
  };
  if (job.repository.commit !== ctx.expectedCommit) {
    reasons.push({ code: "stale_commit", message: "The scan is for a different commit than the one being gated; its findings were not used." });
    return finish("INCOMPLETE");
  }
  if (!["completed", "completed_partial"].includes(job.status)) {
    reasons.push({ code: job.status === "failed" || job.status === "cancelled" ? "scan_failed" : "scan_not_finished", message: "The scan is " + job.status + "; no security conclusion exists for this commit." });
    return finish("INCOMPLETE");
  }
  const sc = job.sourceCoverage;
  coverage.source = !sc ? "unverified" : sc.status === "complete" && sc.excludedFiles === 0 && !sc.treeTruncated ? "complete" : "partial";
  let incomplete = false;
  for (const e of policy.requiredEngines) {
    const run = job.runs.find((r) => r.engine === e);
    if (run?.status === "completed" && (!run.coverage || run.coverage.status === "complete")) coverage.completed.push(e);
    else if (run?.status === "completed") {
      coverage.partial.push(e);
      reasons.push({ code: "engine_partial", message: e + " completed with partial file coverage." });
    } else {
      coverage.missing.push(e);
      reasons.push({ code: "engine_missing", message: e + " did not complete (" + (run?.status ?? "not run") + ")." });
    }
  }
  if (coverage.missing.length || coverage.partial.length) incomplete = true;
  if (policy.requireCompleteSourceCoverage && coverage.source !== "complete") {
    incomplete = true;
    reasons.push({ code: "source_partial", message: "Source coverage is " + coverage.source + "; files were excluded or the repository tree was truncated." });
  }
  const active = job.findings.filter((f) => !resolved.includes(f.status));
  counts.active = active.length;
  let unknown = false,
    block = false,
    warn = false;
  for (const f of active) {
    counts[f.severity]++;
    if (f.severityKnown === false) {
      counts.unknownSeverity++;
      unknown = true;
      continue;
    }
    if (policy.blockSeverities.includes(f.severity)) {
      const qualifies = rank[f.confidence] >= rank[policy.minBlockConfidence] && (f.status === "verified" || policy.blockPotential);
      if (qualifies) {
        counts.blocking++;
        block = true;
      } else {
        counts.warning++;
        warn = true;
      }
    } else if (policy.warnSeverities.includes(f.severity)) {
      counts.warning++;
      warn = true;
    }
  }
  if (unknown) {
    const how = policy.onUnknownSeverity;
    reasons.push({ code: "unknown_severity", message: counts.unknownSeverity + " finding(s) have no trusted severity assessment (" + how + ")." });
    if (how === "incomplete") incomplete = true;
    else if (how === "block") block = true;
    else warn = true;
  }
  if (block) reasons.push({ code: "blocking_findings", message: counts.blocking + " finding(s) match the blocking policy." });
  if (warn && !block) reasons.push({ code: "warning_findings", message: counts.warning + " finding(s) need review." });
  // BLOCK outranks INCOMPLETE: both fail the gate, but a known blocking finding is the more useful fact to report.
  if (block || (incomplete && policy.onMissingCoverage === "block")) {
    if (!block) reasons.push({ code: "engine_missing", message: "Policy treats missing coverage as blocking." });
    return finish("BLOCK");
  }
  if (incomplete) return finish("INCOMPLETE");
  if (warn) return finish("WARN");
  reasons.push({ code: "clean", message: "Configured checks completed within this scope. This is not a guarantee of security." });
  return finish("PASS");
}
