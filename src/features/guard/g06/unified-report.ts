import { createHash } from "node:crypto";
import { escapeHtml } from "../release";
import type {
  G06CanvasCoverage,
  G06CanvasOverlayRecord,
  G06DeliveryAttemptRecord,
  G06ExtendedScanJob,
  G06IntelligenceSyncRecord,
  G06OutboxRecord,
  G06ReportStatus,
  G06Severity,
  G06UnifiedReportBody,
  G06UnifiedReportRecord,
} from "./contracts";
import { redactG06Text } from "./redaction";
import type {
  G06PersistedG04Snapshot,
  G06PersistedG05Snapshot,
} from "./store";

const ACTIVE_STATUSES = new Set([
  "verified",
  "potential",
  "under_review",
  "fix_pending_retest",
]);

function countSeverity(severities: readonly string[]): Record<G06Severity, number> {
  const counts: Record<G06Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const s of severities) {
    if (
      s === "critical" ||
      s === "high" ||
      s === "medium" ||
      s === "low" ||
      s === "info"
    ) {
      counts[s] += 1;
    } else {
      counts.medium += 1;
    }
  }
  return counts;
}

export function buildUnifiedGuardReport(input: {
  projectId: string;
  repositoryName: string | null;
  branch: string | null;
  scan: { id: string; status: string; updatedAt: string; coverage?: unknown; job: G06ExtendedScanJob } | null;
  g04: G06PersistedG04Snapshot;
  g05: G06PersistedG05Snapshot;
  latestOverlay: G06CanvasOverlayRecord | null;
  intelligenceSync: G06IntelligenceSyncRecord | null;
  intelligenceOutbox: G06OutboxRecord[];
  sentinelOutbox: G06OutboxRecord[];
  sentinelAttempts: G06DeliveryAttemptRecord[];
  sentinelConsumerConfigured: boolean;
  now?: string;
}): G06UnifiedReportBody {
  const generatedAt = input.now ?? new Date().toISOString();
  const scan = input.scan;
  const commitSha = scan?.job.repository.commit ?? null;
  const branch = input.branch ?? scan?.job.repository.branch ?? null;
  const statusReasons: string[] = [];
  const limitations: string[] = [];
  const evidenceRefs: string[] = [];

  if (scan) evidenceRefs.push(`guard-scan:${scan.id}`);

  // 1. Static scanning (G02)
  const findings = scan?.job.findings ?? [];
  const activeFindings = findings.filter((f) => ACTIVE_STATUSES.has(f.status));
  const sc = scan?.job.sourceCoverage;
  const scIncomplete = Boolean(sc && (sc.status === "partial" || sc.treeTruncated || sc.excludedFiles > 0));
  let staticStatus: G06ReportStatus = "NOT_CONFIGURED";
  if (scan) {
    if (scan.status === "failed") {
      staticStatus = "FAILED";
      statusReasons.push("Latest Guard repository scan failed.");
    } else if (
      scan.status === "completed_partial" ||
      scIncomplete ||
      scan.job.runs.some(
        (r) =>
          r.coverage?.status === "partial" ||
          r.status === "failed" ||
          r.status === "timed_out" ||
          r.status === "not_configured" ||
          r.status === "skipped",
      )
    ) {
      staticStatus = "PARTIAL";
      statusReasons.push("Static scanning completed with partial engine or source coverage.");
    } else if (scan.status === "queued" || scan.status === "preparing" || scan.status === "running" || scan.status === "normalizing") {
      staticStatus = "INCOMPLETE";
      statusReasons.push(`Latest Guard scan is still ${scan.status}.`);
    } else {
      staticStatus = "VERIFIED";
    }
  } else {
    statusReasons.push("No operational GitHub repository scan exists yet for this project.");
  }

  // 2. SBOM & Inventory
  const inventory = scan?.job.inventory ?? [];
  const unsupportedCount = inventory.filter(
    (i) => i.ecosystem.toLowerCase() !== "npm",
  ).length;
  const unknownLicenseCount = inventory.filter((i) => !i.license).length;
  const sbomDigest =
    scan?.job.sbom?.metadata.properties.find(
      (p) => p.name === "wetscan:scanner-artifact-sha256",
    )?.value ?? null;
  let sbomStatus: G06ReportStatus = "NOT_CONFIGURED";
  if (scan) {
    if (scan.job.sbom && inventory.length > 0) {
      sbomStatus = unsupportedCount > 0 || unknownLicenseCount > 0 ? "PARTIAL" : "VERIFIED";
      if (unknownLicenseCount > 0) {
        limitations.push(
          `${unknownLicenseCount} of ${inventory.length} dependency items have unknown license metadata (preserved as null, never assumed open-source).`,
        );
      }
      if (sbomDigest) evidenceRefs.push(`sbom:${sbomDigest}`);
    } else if (scan.job.sbom) {
      sbomStatus = "PARTIAL";
    } else {
      sbomStatus = "INCOMPLETE";
      limitations.push("No CycloneDX SBOM artifact recorded on the latest scan.");
    }
  }

  // 3. Remediation & Retest (G02 partial vs G03 unmerged)
  const g02GuidanceCount = scan?.job.guardRemediation?.length ?? 0;
  const g02RetestCount = scan?.job.guardRetests?.length ?? 0;
  const g02VerifiedFixed = findings.filter((f) => f.status === "verified_fixed").length;
  const g05VerifiedFixed = input.g05.findings.filter(
    (f) => f.status === "verified_fixed",
  ).length;
  limitations.push(
    "Independent G03 AI Remediation (patch generation, PR proposals, behavioral retest) is NOT merged on this branch; remediation section preserves G03 integration boundaries.",
  );

  // 4. CI/CD Policy (G04)
  const latestEval = input.g04.evaluations[0] ?? null;
  const latestCheck = input.g04.checks[0] ?? null;
  if (latestEval) evidenceRefs.push(`g04-eval:${latestEval.id}`);
  let cicdStatus: G06ReportStatus = "NOT_CONFIGURED";
  let cicdNote = "G04 CI/CD evaluations not recorded for this project.";
  let enforced = false;

  if (input.g04.available && latestEval) {
    const evalStale = Boolean(commitSha && latestEval.commit !== commitSha);
    const enforcementObj = latestEval.enforcement as
      | { enforced?: boolean; detail?: string }
      | undefined;
    enforced = enforcementObj?.enforced === true;

    if (evalStale) {
      cicdStatus = "STALE";
      cicdNote = `Latest CI evaluation is for commit ${latestEval.commit.slice(0, 12)}, whereas latest scan is at ${commitSha?.slice(0, 12)}.`;
      statusReasons.push(cicdNote);
    } else if (latestEval.decision === "BLOCK") {
      cicdStatus = "BLOCKED";
      cicdNote = `Policy evaluation ${latestEval.id} returned BLOCK (policy revision ${latestEval.policyRevision}).`;
      statusReasons.push(cicdNote);
    } else if (!enforced || !latestCheck?.published) {
      cicdStatus = "PARTIAL";
      cicdNote = enforced
        ? "Policy passed and provider check recorded."
        : "Deterministic policy evaluation recorded, but external promotion/required-check enforcement is not verified (enforced=false).";
      limitations.push(cicdNote);
    } else {
      cicdStatus = "VERIFIED";
      cicdNote = `Policy ${latestEval.decision} with published GitHub check run ${latestCheck.checkRunId ?? latestCheck.externalId}.`;
    }
  }

  // 5. DAST & Integrity (G05)
  const latestG05Run = input.g05.runs[0] ?? null;
  if (latestG05Run) evidenceRefs.push(`g05-run:${latestG05Run.id}`);
  let dastStatus: G06ReportStatus = "NOT_CONFIGURED";
  let dastNote = "No G05 scoped staging DAST or Integrity run has executed.";
  if (input.g05.available && latestG05Run) {
    const cleanupOk =
      latestG05Run.cleanupStatus === "verified" ||
      latestG05Run.cleanupStatus === "not_needed";
    if (latestG05Run.status === "failed" || latestG05Run.status === "timed_out") {
      dastStatus = "FAILED";
      dastNote = `Latest G05 run ${latestG05Run.id} finished as ${latestG05Run.status}.`;
      statusReasons.push(dastNote);
    } else if (
      latestG05Run.status === "completed_partial" ||
      !cleanupOk
    ) {
      dastStatus = "PARTIAL";
      dastNote = `G05 run ${latestG05Run.id} completed (${latestG05Run.status}), cleanup=${latestG05Run.cleanupStatus}.`;
      limitations.push(dastNote);
    } else if (latestG05Run.status === "completed") {
      dastStatus = "VERIFIED";
      dastNote = `G05 run ${latestG05Run.id} completed with ${input.g05.findings.length} persisted finding(s) and verified cleanup.`;
    } else {
      dastStatus = "INCOMPLETE";
      dastNote = `G05 run ${latestG05Run.id} is ${latestG05Run.status}.`;
    }
  }

  // 6. Canvas Overlay (GRD-013)
  let canvasStatus: G06CanvasCoverage = input.latestOverlay?.coverageStatus ?? "unavailable";
  const canvasStale = [...(input.latestOverlay?.staleReasons ?? [])];
  if (
    input.latestOverlay &&
    commitSha &&
    input.latestOverlay.commitSha !== "unscanned" &&
    input.latestOverlay.commitSha !== commitSha
  ) {
    canvasStatus = "stale";
    canvasStale.push(
      `Canvas overlay reflects commit ${input.latestOverlay.commitSha.slice(0, 12)}, while latest scan is ${commitSha.slice(0, 12)}.`,
    );
  }
  if (input.latestOverlay) evidenceRefs.push(`canvas-overlay:${input.latestOverlay.id}`);

  // 7. Intelligence Bridge (GRD-020)
  const intelSync = input.intelligenceSync;
  const latestIntelOutbox = input.intelligenceOutbox[0] ?? null;
  let intelStatus: G06ReportStatus = "NOT_CONFIGURED";
  if (intelSync) {
    evidenceRefs.push(`intel-sync:${intelSync.syncId}`);
    if (commitSha && intelSync.commitSha !== commitSha) {
      intelStatus = "STALE";
      statusReasons.push("Intelligence inventory sync lags behind latest scan commit.");
    } else if (intelSync.syncStatus === "acknowledged") {
      intelStatus = unsupportedCount > 0 ? "PARTIAL" : "VERIFIED";
      if (intelSync.sentinelSnapshotId) {
        evidenceRefs.push(`sentinel-snapshot:${intelSync.sentinelSnapshotId}`);
      }
    } else if (intelSync.syncStatus === "failed") {
      intelStatus = "FAILED";
      statusReasons.push("Intelligence inventory delivery failed.");
    } else {
      intelStatus = "INCOMPLETE";
      limitations.push(
        `Intelligence sync state is ${intelSync.syncStatus}; exposure assessment awaits consumer acknowledgment.`,
      );
    }
  } else if (latestIntelOutbox) {
    intelStatus = latestIntelOutbox.state === "failed" ? "FAILED" : "INCOMPLETE";
  }

  // 8. Sentinel Pipeline Outbox (GRD-021)
  const latestSentinel = input.sentinelOutbox[0] ?? null;
  const lastSentinelAttempt = input.sentinelAttempts[0] ?? null;
  const pendingSentinel = input.sentinelOutbox.filter(
    (o) =>
      o.state === "pending" ||
      o.state === "retry_scheduled" ||
      o.state === "leased",
  ).length;
  const ackedSentinel = input.sentinelOutbox.filter(
    (o) => o.state === "acknowledged",
  ).length;

  let sentinelStatus: G06ReportStatus = "NOT_CONFIGURED";
  let sentinelNote =
    "No Guard pipeline audit events enqueued yet.";
  if (latestSentinel) {
    evidenceRefs.push(`sentinel-outbox:${latestSentinel.deliveryId}`);
    if (latestSentinel.state === "acknowledged") {
      sentinelStatus = "VERIFIED";
      sentinelNote = `Event ${latestSentinel.deliveryId} acknowledged by configured Sentinel consumer (${latestSentinel.consumerAckRef ?? "ok"}); zero runtime intrusion incidents generated.`;
    } else if (latestSentinel.state === "failed" || latestSentinel.state === "conflict") {
      sentinelStatus = "FAILED";
      sentinelNote = `Event ${latestSentinel.deliveryId} stopped in ${latestSentinel.state}: ${latestSentinel.lastError ?? "delivery failure"}.`;
      statusReasons.push(sentinelNote);
    } else {
      sentinelStatus = input.sentinelConsumerConfigured ? "INCOMPLETE" : "PARTIAL";
      sentinelNote = input.sentinelConsumerConfigured
        ? `Event ${latestSentinel.deliveryId} queued (${latestSentinel.state}) awaiting delivery acknowledgment.`
        : "Sentinel core pipeline_audit consumer is not configured in this environment (0001..0009 ingests runtime telemetry only); delivery stays durable in outbox without false incidents.";
      limitations.push(sentinelNote);
    }
  }

  // Overall status aggregation (strict honesty)
  let overallStatus: G06ReportStatus = "PARTIAL";
  if (!scan && !latestG05Run) {
    overallStatus = "NOT_CONFIGURED";
  } else if (cicdStatus === "BLOCKED") {
    overallStatus = "BLOCKED";
  } else if (
    staticStatus === "FAILED" ||
    dastStatus === "FAILED" ||
    intelStatus === "FAILED" ||
    sentinelStatus === "FAILED"
  ) {
    overallStatus = "FAILED";
  } else if (
    cicdStatus === "STALE" ||
    canvasStatus === "stale" ||
    intelStatus === "STALE"
  ) {
    overallStatus = "STALE";
  } else if (
    staticStatus === "INCOMPLETE" ||
    dastStatus === "INCOMPLETE"
  ) {
    overallStatus = "INCOMPLETE";
  } else if (
    staticStatus === "VERIFIED" &&
    cicdStatus === "VERIFIED" &&
    intelStatus === "VERIFIED" &&
    sentinelStatus === "VERIFIED" &&
    (dastStatus === "VERIFIED" || dastStatus === "NOT_CONFIGURED")
  ) {
    // Still highlight if G03 AI remediation isn't connected; overall verification reflects full connected Guard + bridges
    overallStatus = "VERIFIED";
  } else {
    overallStatus = "PARTIAL";
  }

  const hashSeed = createHash("sha256")
    .update(
      JSON.stringify({
        projectId: input.projectId,
        commitSha,
        scanId: scan?.id ?? null,
        evalId: latestEval?.id ?? null,
        g05RunId: latestG05Run?.id ?? null,
        overlayId: input.latestOverlay?.id ?? null,
        syncId: intelSync?.syncId ?? null,
        sentinelDeliveryId: latestSentinel?.deliveryId ?? null,
        generatedAt,
      }),
    )
    .digest("hex")
    .slice(0, 20);

  return {
    version: "guard.unified-report.v1",
    reportId: `gre_${hashSeed}`,
    generatedAt,
    projectId: input.projectId,
    repositoryName: input.repositoryName ? redactG06Text(input.repositoryName) : null,
    commitSha,
    branch,
    overallStatus,
    statusReasons: [...new Set(statusReasons)],
    source: {
      acquisitionMethod: "github_only",
      excludedMethods: ["gitlab", "zip_upload"],
      latestScanId: scan?.id ?? null,
      latestScanStatus: scan?.status ?? null,
      profile: scan?.job.profile ?? null,
      sourceCoverage: sc
        ? {
            totalFiles: sc.retrievedFiles + sc.excludedFiles,
            scannedFiles: sc.retrievedFiles,
            skippedFiles: sc.excludedFiles,
            omittedReasons: sc.treeTruncated ? ["tree_truncated"] : [],
            incomplete: scIncomplete,
          }
        : null,
    },
    staticScanning: {
      status: staticStatus,
      engines: (scan?.job.runs ?? []).map((r) => ({
        engine: r.engine,
        status: r.status,
        findings: findings.filter((f) => f.source.engine === r.engine).length,
        version: r.version,
        rulesHash: r.rulePack,
        summary: redactG06Text(r.reason),
      })),
      findingsTotal: findings.length,
      activeFindings: activeFindings.length,
      bySeverity: countSeverity(activeFindings.map((f) => f.severity)),
    },
    sbomAndInventory: {
      status: sbomStatus,
      format: scan?.job.sbom ? `${scan.job.sbom.bomFormat} ${scan.job.sbom.specVersion}` : null,
      itemCount: inventory.length,
      unsupportedCount,
      unknownLicenseCount,
      digest: sbomDigest,
      samplePackages: inventory.slice(0, 15).map((i) => ({
        ecosystem: i.ecosystem,
        name: redactG06Text(i.name),
        version: redactG06Text(i.version),
        license: i.license ? redactG06Text(i.license) : null,
      })),
    },
    remediationAndRetest: {
      status: "NOT_CONNECTED",
      g03Merged: false,
      guidanceCount: g02GuidanceCount,
      retestCount: g02RetestCount,
      verifiedFixedCount: g02VerifiedFixed + g05VerifiedFixed,
      note:
        g02GuidanceCount > 0
          ? `G02 deterministic rule guidance present (${g02GuidanceCount}); full G03 AI remediation PR is NOT_CONNECTED.`
          : "Full G03 AI remediation is NOT_CONNECTED (branch not merged).",
    },
    cicdPolicy: {
      status: cicdStatus,
      policyDecision: latestEval?.decision ?? null,
      enforced,
      evaluationId: latestEval?.id ?? null,
      checkRunId: latestCheck?.checkRunId ?? null,
      checkPublished: Boolean(latestCheck?.published),
      deploymentCount: input.g04.deployments.length,
      note: redactG06Text(cicdNote),
    },
    dastAndIntegrity: {
      status: dastStatus,
      enabled: input.g05.available,
      runId: latestG05Run?.id ?? null,
      runStatus: latestG05Run?.status ?? null,
      findingsTotal: input.g05.findings.length,
      verifiedFixedCount: g05VerifiedFixed,
      cleanupStatus: latestG05Run?.cleanupStatus ?? null,
      note: redactG06Text(dastNote),
    },
    integrations: {
      canvas: {
        status: canvasStatus,
        overlayId: input.latestOverlay?.id ?? null,
        mappedCount: input.latestOverlay?.mappedCount ?? 0,
        unmatchedCount: input.latestOverlay?.unmatchedCount ?? 0,
        staleReasons: canvasStale.map(redactG06Text),
      },
      intelligence: {
        status: intelStatus,
        syncStatus: intelSync?.syncStatus ?? null,
        deliveryState: latestIntelOutbox?.state ?? null,
        snapshotId: intelSync?.sentinelSnapshotId ?? null,
        exposureAssessment: intelSync?.exposureAssessment ?? null,
        exposureCount: intelSync?.exposureCount ?? 0,
        itemCount: intelSync?.itemCount ?? inventory.length,
      },
      sentinel: {
        status: sentinelStatus,
        deliveryState: latestSentinel?.state ?? null,
        lastAttemptOutcome: lastSentinelAttempt?.outcome ?? null,
        attempts: latestSentinel?.attempts ?? 0,
        pendingCount: pendingSentinel,
        acknowledgedCount: ackedSentinel,
        securityIncidentGenerated: false,
        note: redactG06Text(sentinelNote),
      },
    },
    limitations: [...new Set(limitations)],
    evidenceRefs: [...new Set(evidenceRefs)],
  };
}

export function renderUnifiedReportHtml(record: G06UnifiedReportRecord): string {
  const b = record.body;
  const e = (v: unknown) => escapeHtml(String(v ?? ""));

  const engineRows = b.staticScanning.engines
    .map(
      (eng) =>
        `<tr><td>${e(eng.engine)}</td><td>${e(eng.status)}</td><td>${e(eng.findings)}</td><td>${e(eng.version ?? "-")}</td><td>${e(eng.summary)}</td></tr>`,
    )
    .join("");

  const limitationItems = b.limitations.map((l) => `<li>${e(l)}</li>`).join("");
  const reasonItems = b.statusReasons.map((r) => `<li>${e(r)}</li>`).join("");
  const evidenceItems = b.evidenceRefs
    .map((ref) => `<li><code>${e(ref)}</code></li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>WetScan Guard Security Report - ${e(b.projectId)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; color: #16181d; background: #ffffff; max-width: 960px; margin: 24px auto; padding: 0 20px; line-height: 1.5; }
  h1, h2 { border-bottom: 1px solid #d7dfec; padding-bottom: 6px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; background: #eef2ff; font-weight: 600; font-size: 0.9em; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.92em; }
  th, td { border: 1px solid #d7dfec; padding: 8px 10px; text-align: left; }
  th { background: #f8fafc; }
  .meta { color: #475569; font-size: 0.9em; }
</style>
</head>
<body>
  <h1>WetScan Guard Unified Security Report</h1>
  <p class="meta">
    Report ID: <code>${e(b.reportId)}</code> · Digest: <code>${e(record.reportDigest.slice(0, 16))}</code><br>
    Project: <code>${e(b.projectId)}</code> (${e(b.repositoryName ?? "repository")}) · Source: <strong>GitHub-only</strong><br>
    Commit: <code>${e(b.commitSha ?? "unscanned")}</code> · Branch: <code>${e(b.branch ?? "unknown")}</code><br>
    Generated: ${e(b.generatedAt)} · Retention until: ${e(record.retentionUntil)}
  </p>
  <p>Overall Status: <span class="badge">${e(b.overallStatus)}</span></p>
  ${reasonItems ? `<h2>Status Summary</h2><ul>${reasonItems}</ul>` : ""}

  <h2>Static Scanning &amp; SBOM (G02)</h2>
  <p>Static status: <span class="badge">${e(b.staticScanning.status)}</span> · Active findings: ${e(b.staticScanning.activeFindings)} / ${e(b.staticScanning.findingsTotal)} · SBOM (${e(b.sbomAndInventory.format ?? "none")}): ${e(b.sbomAndInventory.itemCount)} items (${e(b.sbomAndInventory.unknownLicenseCount)} unknown licenses)</p>
  <table>
    <thead><tr><th>Engine</th><th>Status</th><th>Findings</th><th>Version</th><th>Summary</th></tr></thead>
    <tbody>${engineRows || "<tr><td colspan='5'>No engine runs recorded</td></tr>"}</tbody>
  </table>

  <h2>Remediation, CI/CD Gate &amp; DAST</h2>
  <table>
    <tbody>
      <tr><th>G03 Remediation Boundary</th><td><span class="badge">${e(b.remediationAndRetest.status)}</span></td><td>${e(b.remediationAndRetest.note)}</td></tr>
      <tr><th>G04 CI/CD Policy</th><td><span class="badge">${e(b.cicdPolicy.status)}</span></td><td>Decision: ${e(b.cicdPolicy.policyDecision ?? "none")} · Enforced: ${e(b.cicdPolicy.enforced)} · ${e(b.cicdPolicy.note)}</td></tr>
      <tr><th>G05 DAST &amp; Integrity</th><td><span class="badge">${e(b.dastAndIntegrity.status)}</span></td><td>${e(b.dastAndIntegrity.note)}</td></tr>
    </tbody>
  </table>

  <h2>Cross-Module Integrations</h2>
  <table>
    <tbody>
      <tr><th>GRD-013 Canvas Overlay</th><td><span class="badge">${e(b.integrations.canvas.status)}</span></td><td>Mapped: ${e(b.integrations.canvas.mappedCount)} · Unmatched: ${e(b.integrations.canvas.unmatchedCount)}</td></tr>
      <tr><th>GRD-020 Intelligence Sync</th><td><span class="badge">${e(b.integrations.intelligence.status)}</span></td><td>Sync: ${e(b.integrations.intelligence.syncStatus ?? "none")} · Assessment: ${e(b.integrations.intelligence.exposureAssessment ?? "none")} · Exposures: ${e(b.integrations.intelligence.exposureCount)}</td></tr>
      <tr><th>GRD-021 Sentinel Outbox</th><td><span class="badge">${e(b.integrations.sentinel.status)}</span></td><td>State: ${e(b.integrations.sentinel.deliveryState ?? "none")} · Security Incident: false · ${e(b.integrations.sentinel.note)}</td></tr>
    </tbody>
  </table>

  <h2>Explicit Limitations &amp; Exclusions</h2>
  <ul>
    <li>GitLab repository reading (GRD-002) and ZIP upload scanning are OUT_OF_SCOPE_BY_OWNER_DECISION.</li>
    ${limitationItems}
  </ul>

  <h2>Evidence References</h2>
  <ul>${evidenceItems || "<li>None</li>"}</ul>
</body>
</html>`;
}
