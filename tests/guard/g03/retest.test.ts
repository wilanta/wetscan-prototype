import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fixture, fileFixture, content, edit } from "./fixture";
import { compareTargeted } from "../../../src/features/guard/g03/retest";
import type { Retest } from "../../../src/features/guard/g03/contracts";
async function comparison() {
  const f = await fixture(),
    p = await f.proposed(),
    file = fileFixture(
      content.replace(edit.oldText, edit.newText),
      f.after.repository.commit,
    );
  const t: Retest = {
    id: "d".repeat(64),
    proposalId: p.id,
    findingId: p.findingId,
    actorId: f.grant.actorId,
    beforeCommit: p.baseCommit,
    afterCommit: f.after.repository.commit,
    targetBranch: "main",
    engine: "sast",
    createdAt: new Date().toISOString(),
    state: "queued",
    outcome: "not_verified",
    evidenceOutcome: "not_verified",
    verifiedFixed: false,
    reason: "unit only",
    scanId: f.after.id,
  };
  return {
    ...f,
    p,
    file,
    t,
    compare: () => compareTargeted(f.job, f.after, p, t, file),
  };
}
it("requires exact patch bytes, targeted evidence and complete matching scanner coverage", async () => {
  const f = await comparison();
  expect(f.compare()).toMatchObject({
    outcome: "fixed",
    evidenceOutcome: "verified_fixed",
    verifiedFixed: true,
  });
});
it.each([
  "partial_source",
  "excluded",
  "truncated",
  "partial_engine",
  "zero_files",
  "changed_version",
  "changed_rules",
  "missing_cleanup",
  "failed",
  "missing_artifact",
  "missing_source_count",
  "changed_image",
  "changed_spec",
  "unversioned_execution",
])("does not verify when %s", async (fault) => {
  const f = await comparison(),
    r = f.after.runs[0];
  switch (fault) {
    case "partial_source":
      f.after.sourceCoverage!.status = "partial";
      break;
    case "excluded":
      f.after.sourceCoverage!.excludedFiles = 1;
      break;
    case "truncated":
      f.after.sourceCoverage!.treeTruncated = true;
      break;
    case "partial_engine":
      r.coverage!.status = "partial";
      break;
    case "zero_files":
      r.coverage!.scannedFiles = 0;
      break;
    case "changed_version":
      r.version = "other";
      break;
    case "changed_rules":
      r.rulePack = "other";
      break;
    case "missing_cleanup":
      r.executionEvidence = undefined;
      break;
    case "failed":
      r.status = "failed";
      break;
    case "missing_artifact":
      r.artifactDigest = undefined;
      break;
    case "missing_source_count":
      f.after.sourceCoverage!.retrievedFiles = 0;
      break;
    case "changed_image":
      r.executionEvidence!.imageId = "sha256:" + "f".repeat(64);
      break;
    case "changed_spec":
      r.executionEvidence!.specDigest = "e".repeat(64);
      break;
    case "unversioned_execution":
      Reflect.deleteProperty(r.executionEvidence!, "version");
      break;
  }
  expect(f.compare()).toMatchObject({
    outcome: "inconclusive",
    verifiedFixed: false,
  });
});
it.each(["proposal", "finding", "before", "engine", "scan"])(
  "rejects mismatched retest identity: %s",
  async (fault) => {
    const f = await comparison();
    if (fault === "proposal") f.t.proposalId = "e".repeat(64);
    if (fault === "finding") f.t.findingId = "e".repeat(64);
    if (fault === "before") f.t.beforeCommit = "e".repeat(40);
    if (fault === "engine") f.t.engine = "secrets";
    if (fault === "scan") f.t.scanId = "e".repeat(64);
    expect(f.compare).toThrow("retest_revision_mismatch");
  },
);
it("rule still present is reproduced despite changed line numbers", async () => {
  const f = await comparison();
  f.after.findings = structuredClone(f.job.findings);
  f.after.findings[0].location.line = 8;
  f.after.findings[0].evidence[0].commit = f.after.repository.commit;
  expect(f.compare()).toMatchObject({
    outcome: "still_present",
    evidenceOutcome: "reproduced",
    verifiedFixed: false,
  });
});
it("a generic clean scan with different patch bytes is not proof", async () => {
  const f = await comparison();
  const source = fileFixture(
    "export const x = 3;\n",
    f.after.repository.commit,
  );
  expect(compareTargeted(f.job, f.after, f.p, f.t, source)).toMatchObject({
    outcome: "not_verified",
    verifiedFixed: false,
  });
});
it("rejects synthetic after evidence or a different source revision", async () => {
  const f = await comparison();
  f.after.repository.commit = "d".repeat(40);
  expect(f.compare).toThrow("retest_revision_mismatch");
});
it("false-positive triage does not become a verified fix", async () => {
  const f = await comparison();
  f.job.findings[0].status = "false_positive";
  expect(f.compare()).toMatchObject({
    outcome: "not_verified",
    evidenceOutcome: "not_detected",
    verifiedFixed: false,
  });
});
