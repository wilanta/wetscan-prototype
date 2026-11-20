import type { StoredScanView } from "../live/product-view";
import { redact, safePath } from "../security";
import {
  safeReadDiagnostics,
  type SelectionReadDiagnostics,
} from "./read-diagnostics";
type SelectionView = Pick<
  StoredScanView,
  | "scanId"
  | "revision"
  | "execution"
  | "status"
  | "repository"
  | "sourceCoverage"
  | "engines"
  | "findings"
>;
const sha = (s: unknown, n: number) =>
  typeof s === "string" && new RegExp("^[a-f0-9]{" + n + "}$").test(s);
const text = (s: string) =>
  redact(s).replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    "[REDACTED EMAIL]",
  );
export function exportUnavailableSelection(
  projectId: string,
  repositoryName: string,
  scanIds: string[],
  storageError: boolean,
  readDiagnostics?: SelectionReadDiagnostics,
) {
  if (!/^github-[0-9]+$/.test(projectId))
    throw Error("selection_scope_mismatch");
  return {
    schema: "guard-g03-selection-metadata-v1",
    classification: "OWNER_EXPORTED_STORED_G02_METADATA_NOT_LIVE_ACCEPTANCE",
    projectId,
    repositoryName: text(repositoryName),
    scanId: null,
    candidates: [],
    recordedScanIds: scanIds.filter((id) => sha(id, 64)).slice(0, 20),
    storageStatus: storageError ? "UNAVAILABLE" : "NO_SCAN_VIEW_LOADED",
    readDiagnostics: safeReadDiagnostics(readDiagnostics),
    currentHeadVerified: false,
    sourceRead: false,
    providerCalled: false,
    githubWritten: false,
    scannerStarted: false,
    limitations: [
      "No scan detail was loaded. This is not evidence of no vulnerabilities or an authorization/readiness proof.",
    ],
  };
}
/** Local metadata export from the already-authorized Live view. No fetch, source, mutation or activation. */
export function exportSastSelection(
  projectId: string,
  repositoryName: string,
  view: SelectionView,
  readDiagnostics?: SelectionReadDiagnostics,
) {
  if (
    projectId !== "github-" + view.repository.repositoryId ||
    !sha(view.scanId, 64) ||
    !sha(view.repository.commit, 40)
  )
    throw Error("selection_scope_mismatch");
  const run = view.engines.find((r) => r.engine === "sast");
  const candidates = view.findings
    .filter((f) => f.source.engine === "sast")
    .map((f) => {
      const blockers: string[] = [];
      if (
        view.execution !== "repository_scan" ||
        !["completed", "completed_partial"].includes(view.status)
      )
        blockers.push("operational_scan_not_ready");
      if (f.mode !== "live" || f.projectId !== projectId)
        blockers.push("finding_scope_mismatch");
      if (["false_positive", "risk_accepted"].includes(f.status))
        blockers.push("finding_triaged_out");
      let path: string | null = null;
      try {
        path = safePath(f.location.path ?? "");
      } catch {
        blockers.push("unsafe_source_path");
      }
      if (path && text(path) !== path) {
        path = null;
        blockers.push("sensitive_path_redacted");
      }
      if (path && !/\.(?:[cm]?[jt]sx?|json)$/.test(path))
        blockers.push("patch_language_unsupported");
      if (
        !run ||
        run.status !== "completed" ||
        run.scanner !== f.source.scanner ||
        run.version !== f.source.version ||
        run.rulePack !== f.source.rulePack ||
        !sha(run.artifactDigest, 64) ||
        run.executionEvidence?.version !== 1 ||
        run.executionEvidence.cleanup !== "VERIFIED" ||
        !/^sha256:[a-f0-9]{64}$/.test(run.executionEvidence.imageId) ||
        !sha(run.executionEvidence.specDigest, 64) ||
        !sha(run.executionEvidence.installationArtifactSha256, 64)
      )
        blockers.push("scanner_provenance_invalid");
      if (
        !f.evidence.length ||
        f.evidence.some(
          (e) =>
            e.synthetic ||
            e.commit !== view.repository.commit ||
            e.artifactDigest !== run?.artifactDigest,
        )
      )
        blockers.push("finding_evidence_invalid");
      return {
        findingId: f.id,
        workspaceId: text(f.workspaceId),
        projectId,
        status: f.status,
        path,
        line: f.location.line ?? null,
        severity: f.severityKnown === false ? "unknown" : f.severity,
        confidence: f.confidence,
        source: {
          engine: "sast",
          scanner: text(f.source.scanner),
          version: text(f.source.version),
          ruleId: text(f.source.ruleId),
          rulePack: text(f.source.rulePack),
        },
        evidence: f.evidence.map((e) => ({
          id: e.id,
          commit: e.commit,
          artifactDigest: e.artifactDigest,
          synthetic: e.synthetic,
          recordedAt: e.recordedAt,
        })),
        evidenceMetadataValid: !blockers.length,
        blockers,
      };
    });
  return {
    schema: "guard-g03-selection-metadata-v1",
    classification: "OWNER_EXPORTED_STORED_G02_METADATA_NOT_LIVE_ACCEPTANCE",
    projectId,
    repositoryName: text(repositoryName),
    repository: {
      provider: view.repository.provider,
      repositoryId: view.repository.repositoryId,
      branch: text(view.repository.branch),
      commit: view.repository.commit,
    },
    scanId: view.scanId,
    revision: view.revision,
    status: view.status,
    execution: view.execution,
    readDiagnostics: safeReadDiagnostics(readDiagnostics),
    sourceCoverage: view.sourceCoverage
      ? {
          status: view.sourceCoverage.status,
          retrievedFiles: view.sourceCoverage.retrievedFiles,
          excludedFiles: view.sourceCoverage.excludedFiles,
          treeTruncated: view.sourceCoverage.treeTruncated,
        }
      : null,
    scanner: run
      ? {
          engine: "sast",
          scanner: text(run.scanner),
          version: text(run.version),
          rulePack: text(run.rulePack),
          status: run.status,
          artifactDigest: run.artifactDigest ?? null,
          coverage: run.coverage
            ? {
                status: run.coverage.status,
                eligibleFiles: run.coverage.eligibleFiles,
                scannedFiles: run.coverage.scannedFiles,
                scope: text(run.coverage.scope),
              }
            : null,
          executionEvidence: run.executionEvidence
            ? {
                version: run.executionEvidence.version,
                runId: run.executionEvidence.runId,
                imageId: run.executionEvidence.imageId,
                specDigest: run.executionEvidence.specDigest,
                installationArtifactSha256:
                  run.executionEvidence.installationArtifactSha256,
                cleanup: run.executionEvidence.cleanup,
              }
            : null,
        }
      : null,
    candidates,
    currentHeadVerified: false,
    sourceRead: false,
    providerCalled: false,
    githubWritten: false,
    scannerStarted: false,
    limitations: [
      "Metadata export is not fresh authorization or source-HEAD proof. Revalidate the original server record, existing session and exact branch HEAD before source/AI approval.",
      "File blob/digest/size require a separately authorized source preview. Missing candidates do not prove a clean repository.",
      "No source content, evidence summary, advice, credential, cookie or private backend receipt is exported.",
    ],
  };
}
