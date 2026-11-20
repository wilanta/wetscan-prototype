import type { Finding, ScanJob } from "../contracts";
import type { Proposal, Retest, SourceFile } from "./contracts";
import { G03Error } from "./contracts";
import { isSha } from "./safety";
import { validateSource } from "./patch";

export function realFinding(job: ScanJob, findingId: string): Finding {
  const f = job.findings.find((f) => f.id === findingId);
  const r = f && job.runs.find((r) => r.engine === f.source.engine);
  if (
    !f ||
    job.mode !== "live" ||
    f.mode !== job.mode ||
    f.projectId !== job.projectId ||
    f.workspaceId !== job.workspaceId ||
    !isSha(job.repository.commit) ||
    !r ||
    r.status !== "completed" ||
    !isSha(r.artifactDigest, 64) ||
    r.executionEvidence?.cleanup !== "VERIFIED" ||
    r.executionEvidence.version !== 1 ||
    !/^sha256:[a-f0-9]{64}$/.test(r.executionEvidence.imageId) ||
    !isSha(r.executionEvidence.specDigest, 64) ||
    !isSha(r.executionEvidence.installationArtifactSha256, 64) ||
    r.scanner !== f.source.scanner ||
    r.version !== f.source.version ||
    r.rulePack !== f.source.rulePack ||
    !f.evidence.length ||
    f.evidence.some(
      (e) =>
        e.synthetic ||
        e.commit !== job.repository.commit ||
        e.artifactDigest !== r.artifactDigest,
    )
  )
    throw new G03Error("real_evidence_required");
  return f;
}
/** A scanner's absence signal is evidence only with matching patch, revision and complete relevant coverage. */
export function compareTargeted(
  before: ScanJob,
  after: ScanJob,
  proposal: Proposal,
  retest: Retest,
  source: SourceFile,
): Pick<
  Retest,
  | "outcome"
  | "evidenceOutcome"
  | "verifiedFixed"
  | "reason"
  | "beforeArtifact"
  | "afterArtifact"
  | "sourceSha256"
> {
  validateSource(source);
  const f = realFinding(before, proposal.findingId);
  if (
    after.id === before.id ||
    after.repository.repositoryId !== before.repository.repositoryId ||
    after.workspaceId !== before.workspaceId ||
    after.projectId !== before.projectId ||
    after.mode !== "live" ||
    after.repository.commit !== retest.afterCommit ||
    after.repository.branch !== retest.targetBranch ||
    source.baseCommit !== after.repository.commit ||
    source.branch !== after.repository.branch ||
    source.repositoryId !== after.repository.repositoryId ||
    proposal.patch?.path !== source.path ||
    retest.proposalId !== proposal.id ||
    retest.findingId !== proposal.findingId ||
    retest.beforeCommit !== before.repository.commit ||
    proposal.baseCommit !== before.repository.commit ||
    retest.engine !== f.source.engine ||
    (retest.scanId && retest.scanId !== after.id)
  )
    throw new G03Error("retest_revision_mismatch");
  const run = after.runs.find((r) => r.engine === f.source.engine);
  const common = {
    beforeArtifact: f.evidence[0].artifactDigest,
    ...(run?.artifactDigest ? { afterArtifact: run.artifactDigest } : {}),
    sourceSha256: source.sourceSha256,
  };
  const result = (
    outcome: Retest["outcome"],
    evidenceOutcome: Retest["evidenceOutcome"],
    reason: string,
  ) => ({
    ...common,
    outcome,
    evidenceOutcome,
    verifiedFixed: evidenceOutcome === "verified_fixed",
    reason,
  });
  if (source.sourceSha256 !== proposal.patch?.afterSha256)
    return result(
      "not_verified",
      "not_verified",
      "Target source differs from the reviewed patch; no verified fix applies to this revision.",
    );
  if (
    !after.findings.every(
      (g) =>
        g.mode === "live" &&
        g.projectId === after.projectId &&
        g.workspaceId === after.workspaceId &&
        g.evidence.length > 0 &&
        g.evidence.every(
          (e) => !e.synthetic && e.commit === after.repository.commit,
        ),
    )
  )
    throw new G03Error("real_evidence_required");
  const reproduced = after.findings.some(
    (g) =>
      g.source.engine === f.source.engine &&
      g.source.ruleId === f.source.ruleId &&
      g.location.path === f.location.path &&
      g.location.package === f.location.package &&
      g.location.endpoint === f.location.endpoint &&
      g.evidence.some((e) => e.artifactDigest === run?.artifactDigest),
  );
  if (
    reproduced &&
    run?.status === "completed" &&
    run.executionEvidence?.cleanup === "VERIFIED"
  )
    return result(
      "still_present",
      "reproduced",
      "The same scanner rule still reports the original target at the new revision.",
    );
  if (
    !["completed", "completed_partial"].includes(after.status) ||
    run?.status !== "completed" ||
    !isSha(run.artifactDigest, 64) ||
    run.executionEvidence?.cleanup !== "VERIFIED" ||
    run.executionEvidence.version !== 1 ||
    run.executionEvidence.imageId !==
      before.runs.find((r) => r.engine === f.source.engine)?.executionEvidence
        ?.imageId ||
    run.executionEvidence.specDigest !==
      before.runs.find((r) => r.engine === f.source.engine)?.executionEvidence
        ?.specDigest ||
    !isSha(run.executionEvidence.specDigest, 64) ||
    !isSha(run.executionEvidence.installationArtifactSha256, 64) ||
    run.scanner !== f.source.scanner ||
    run.version !== f.source.version ||
    run.rulePack !== f.source.rulePack ||
    run.coverage?.status !== "complete" ||
    run.coverage.scannedFiles < 1 ||
    run.coverage.scannedFiles !== run.coverage.eligibleFiles ||
    after.sourceCoverage?.status !== "complete" ||
    !Number.isSafeInteger(after.sourceCoverage.retrievedFiles) ||
    after.sourceCoverage.retrievedFiles < 1 ||
    after.sourceCoverage.excludedFiles !== 0 ||
    after.sourceCoverage.treeTruncated
  )
    return result(
      "inconclusive",
      "inconclusive",
      "Missing/partial source or rule coverage, changed scanner/rules, failure or unverified cleanup prevents a fix claim.",
    );
  if (
    ["false_positive", "risk_accepted"].includes(f.status) ||
    f.source.engine === "secrets" ||
    !["sast", "sca", "iac"].includes(f.source.engine)
  )
    return result(
      "not_verified",
      "not_detected",
      "Rule no longer detected; credential rotation, false-positive triage or unsupported proof obligations cannot be verified by this scanner result.",
    );
  return result(
    "fixed",
    "verified_fixed",
    "The relevant real scanner no longer detects this rule at the same target. Exact reviewed patch bytes, before/after commits, scanner/rules, complete coverage and cleanup are bound. This proves this scanner finding only, not exploit absence or overall security.",
  );
}
