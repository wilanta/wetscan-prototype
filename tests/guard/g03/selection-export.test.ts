import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  exportSastSelection,
  exportUnavailableSelection,
} from "../../../src/features/guard/g03/selection-export";
import { fixture } from "./fixture";
async function input() {
  const f = await fixture();
  return {
    ...f,
    view: {
      scanId: f.job.id,
      revision: 1,
      execution: "repository_scan" as const,
      status: f.job.status,
      repository: f.job.repository,
      sourceCoverage: f.job.sourceCoverage!,
      engines: f.job.runs,
      findings: f.job.findings,
    },
  };
}
it("exports stored SAST provenance without excerpts, titles, advice or a current-HEAD claim", async () => {
  const f = await input();
  f.view.findings[0].title = "PRIVATE_TITLE_SENTINEL";
  f.view.findings[0].evidence[0].summary = "PRIVATE_SUMMARY_SENTINEL";
  Reflect.set(f.view.repository, "privateState", "PRIVATE_BACKEND_SENTINEL");
  Reflect.set(
    f.view.engines[0].executionEvidence!,
    "privateReceipt",
    "PRIVATE_RECEIPT_SENTINEL",
  );
  const value = exportSastSelection(
    f.grant.projectId,
    "fixture/repository",
    f.view,
  );
  expect(value.candidates[0]).toMatchObject({
    findingId: f.job.findings[0].id,
    evidenceMetadataValid: true,
    path: "route.ts",
    blockers: [],
  });
  expect(value).toMatchObject({
    currentHeadVerified: false,
    sourceRead: false,
    providerCalled: false,
    githubWritten: false,
    scannerStarted: false,
  });
  expect(JSON.stringify(value)).not.toContain("PRIVATE_TITLE_SENTINEL");
  expect(JSON.stringify(value)).not.toContain("PRIVATE_SUMMARY_SENTINEL");
  expect(JSON.stringify(value)).not.toContain("PRIVATE_BACKEND_SENTINEL");
  expect(JSON.stringify(value)).not.toContain("PRIVATE_RECEIPT_SENTINEL");
});
it.each([
  "synthetic",
  "stale_evidence",
  "missing_cleanup",
  "wrong_project",
  "false_positive",
  "private_path",
  "unsupported_path",
])("labels invalid metadata %s without claiming eligibility", async (fault) => {
  const f = await input(),
    finding = f.view.findings[0];
  if (fault === "synthetic") finding.evidence[0].synthetic = true;
  if (fault === "stale_evidence") finding.evidence[0].commit = "f".repeat(40);
  if (fault === "missing_cleanup")
    f.view.engines[0].executionEvidence = undefined;
  if (fault === "wrong_project") finding.projectId = "github-999";
  if (fault === "false_positive") finding.status = "false_positive";
  if (fault === "private_path")
    finding.location.path = "src/owner@example.test/route.ts";
  if (fault === "unsupported_path") finding.location.path = "src/route.py";
  const value = exportSastSelection(
    f.grant.projectId,
    "fixture/repository",
    f.view,
  );
  expect(value.candidates[0].evidenceMetadataValid).toBe(false);
  expect(value.candidates[0].blockers.length).toBeGreaterThan(0);
  expect(JSON.stringify(value)).not.toContain("owner@example.test");
});
it("refuses a different project/repository export scope", async () => {
  const f = await input();
  expect(() =>
    exportSastSelection("github-999", "fixture/repository", f.view),
  ).toThrow("selection_scope_mismatch");
});
it("empty stored results remain metadata only and never claim a clean revision", async () => {
  const f = await input();
  f.view.findings = [];
  const value = exportSastSelection(
    f.grant.projectId,
    "fixture/repository",
    f.view,
  );
  expect(value.candidates).toEqual([]);
  expect(value.currentHeadVerified).toBe(false);
});
it("exports unavailability separately from empty scan history without claiming a clean repository", () => {
  expect(
    exportUnavailableSelection("github-123", "fixture/repository", [], true),
  ).toMatchObject({
    scanId: null,
    candidates: [],
    storageStatus: "UNAVAILABLE",
    currentHeadVerified: false,
    sourceRead: false,
  });
  expect(
    exportUnavailableSelection("github-123", "fixture/repository", [], false),
  ).toMatchObject({
    scanId: null,
    candidates: [],
    storageStatus: "NO_SCAN_VIEW_LOADED",
  });
});
