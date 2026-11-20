import type { Finding, Grant, ScanJob } from "../contracts";
import { authorize, redact } from "../security";
import { guidance } from "../evidence";
import { fingerprint } from "../../../platform/identity";
import { requireOperationalJob } from "./product-policy";
import { LiveGuardError } from "./model";

export interface RemediationAdvice {
  explanation: string;
  recommendation: string;
  risks: string;
  verification: string;
}
export interface RemediationRecord {
  version: 1;
  id: string;
  findingId: string;
  baseCommit: string;
  evidenceSha256: string;
  requestKey: string;
  aiConsent: boolean;
  actorId: string;
  createdAt: string;
  state: "reserved" | "completed" | "failed";
  source: "deterministic" | "provider";
  advice?: RemediationAdvice;
  provider?: { name: string; model: string; promptVersion: string };
  failure?: "provider_unavailable" | "authorization_changed";
  review: "pending" | "approved" | "rejected";
  reviewedBy?: string;
  reviewedAt?: string;
  reviewReason?: string;
  untrusted: true;
  patchApplied: false;
  retest: "NOT_EXECUTED";
}
export interface RemediationProvider {
  configured: boolean;
  explain(
    input: {
      engine: string;
      ruleId: string;
      severity: string;
      confidence: string;
    },
    signal: AbortSignal,
  ): Promise<{
    advice: RemediationAdvice;
    provenance: NonNullable<RemediationRecord["provider"]>;
  }>;
}
export function remediationFinding(
  grant: Grant,
  job: ScanJob,
  findingId: string,
  operation: "read" | "triage" = "triage",
) {
  authorize(grant, job, operation);
  requireOperationalJob(grant, job);
  if (
    job.repository.provider !== "github" ||
    job.projectId !== "github-" + job.repository.repositoryId ||
    !/^[a-f0-9]{40}$/.test(job.repository.commit)
  )
    throw new LiveGuardError("source_integrity");
  const finding = job.findings.find((f) => f.id === findingId);
  if (
    !finding ||
    !finding.evidence.length ||
    finding.evidence.some(
      (e) =>
        e.synthetic ||
        e.commit !== job.repository.commit ||
        !/^[a-f0-9]{64}$/.test(e.artifactDigest),
    )
  )
    throw new LiveGuardError("source_integrity");
  authorize(grant, finding, operation);
  return finding;
}
export function evidenceIdentity(finding: Finding) {
  return fingerprint({ source: finding.source, evidence: finding.evidence });
}
export function adviceInput(finding: Finding) {
  if (!/^[A-Za-z0-9._:/-]{1,256}$/.test(finding.source.ruleId))
    throw new LiveGuardError("source_integrity");
  // No source, title, path, repository/commit identity, excerpt, package name or matched secret leaves the server.
  return {
    engine: finding.source.engine,
    ruleId: finding.source.ruleId,
    severity: finding.severityKnown === false ? "unknown" : finding.severity,
    confidence: finding.confidence,
  };
}
export function validateAdvice(value: unknown): RemediationAdvice {
  const v = value as RemediationAdvice;
  if (
    !v ||
    Object.keys(v).sort().join() !==
      "explanation,recommendation,risks,verification" ||
    Object.values(v).some(
      (s) => typeof s !== "string" || !s.trim() || s.length > 2000,
    )
  )
    throw new LiveGuardError("source_integrity");
  return Object.fromEntries(
    Object.entries(v).map(([key, val]) => [key, redact(val)]),
  ) as unknown as RemediationAdvice;
}
export function deterministicAdvice(finding: Finding): RemediationAdvice {
  return {
    explanation:
      "Recorded scanner rule " +
      redact(finding.source.ruleId) +
      " requires review at the recorded location.",
    recommendation: guidance(finding),
    risks:
      "No source was supplied to an AI provider. Compatibility and the exact patch require review of the authorized pinned source.",
    verification:
      "Run the relevant real scanner on an authorized changed commit. Missing coverage is inconclusive; advice or approval is not proof of a fix.",
  };
}
export function compareRecordedRetest(
  grant: Grant,
  before: ScanJob,
  after: ScanJob,
  findingId: string,
) {
  const finding = remediationFinding(grant, before, findingId);
  requireOperationalJob(grant, after);
  authorize(grant, after, "read");
  if (
    before.repository.provider !== after.repository.provider ||
    before.repository.repositoryId !== after.repository.repositoryId ||
    before.repository.branch !== after.repository.branch ||
    before.id === after.id ||
    before.repository.commit === after.repository.commit ||
    !["completed", "completed_partial"].includes(after.status)
  )
    throw new LiveGuardError("revision_conflict", 409);
  if (
    after.findings.some(
      (f) =>
        f.mode !== "live" ||
        f.workspaceId !== after.workspaceId ||
        f.projectId !== after.projectId ||
        f.evidence.some(
          (e) => e.synthetic || e.commit !== after.repository.commit,
        ),
    )
  )
    throw new LiveGuardError("source_integrity");
  const run = after.runs.find((r) => r.engine === finding.source.engine);
  const valid =
    run?.status === "completed" &&
    !!run.artifactDigest?.match(/^[a-f0-9]{64}$/) &&
    run.executionEvidence?.cleanup === "VERIFIED" &&
    run.version === finding.source.version &&
    run.rulePack === finding.source.rulePack &&
    after.sourceCoverage?.status === "complete" &&
    !after.sourceCoverage.treeTruncated &&
    after.sourceCoverage.excludedFiles === 0;
  const reproduced = after.findings.some(
    (f) =>
      f.source.engine === finding.source.engine &&
      f.source.ruleId === finding.source.ruleId &&
      f.location.path === finding.location.path &&
      f.location.package === finding.location.package &&
      f.location.endpoint === finding.location.endpoint &&
      f.evidence.length > 0 &&
      f.evidence.every(
        (e) => !e.synthetic && e.commit === after.repository.commit,
      ),
  );
  return {
    version: 1 as const,
    findingId,
    beforeScanId: before.id,
    afterScanId: after.id,
    beforeCommit: before.repository.commit,
    afterCommit: after.repository.commit,
    engine: finding.source.engine,
    engineArtifactSha256: run?.artifactDigest ?? null,
    outcome: valid
      ? reproduced
        ? ("reproduced" as const)
        : ("not_detected" as const)
      : ("inconclusive" as const),
    verifiedFixed: false as const,
    reason: valid
      ? "Recorded scanner comparison only; targeted behavioral proof is still required for verified_fixed."
      : "Scanner/version/rules, complete source coverage or verified cleanup evidence is missing.",
    recordedAt: new Date().toISOString(),
  };
}
