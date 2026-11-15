import type { Engine, Finding, Grant, ScanJob } from "./contracts";
import { authorize, redact } from "./security";
export interface ReleasePolicy {
  id: string;
  required: Engine[];
  blockSeverities: Finding["severity"][];
  blockPotential: boolean;
}
export interface ReleaseEvaluation {
  decision: "PASS" | "WARN" | "BLOCK" | "INCOMPLETE";
  reasons: string[];
  enforced: false;
}
export function evaluate(
  job: ScanJob,
  policy: ReleasePolicy,
): ReleaseEvaluation {
  if (!policy.required.length)
    return {
      decision: "INCOMPLETE",
      reasons: ["Release policy must require explicit engine coverage."],
      enforced: false,
    };
  if (
    job.mode === "live" &&
    (!job.sourceCoverage ||
      job.sourceCoverage.status !== "complete" ||
      job.sourceCoverage.excludedFiles !== 0 ||
      job.sourceCoverage.treeTruncated ||
      !Number.isSafeInteger(job.sourceCoverage.retrievedFiles) ||
      job.sourceCoverage.retrievedFiles < 0)
  )
    return {
      decision: "INCOMPLETE",
      reasons: ["Authorized source coverage is partial or unverified."],
      enforced: false,
    };
  const missing = policy.required.filter(
    (engine) =>
      !job.runs.some((r) => r.engine === engine && r.status === "completed"),
  );
  if (
    !["completed", "completed_partial"].includes(job.status) ||
    missing.length
  )
    return {
      decision: "INCOMPLETE",
      reasons: [
        "Missing required coverage or unfinished scan: " + missing.join(", "),
      ],
      enforced: false,
    };
  const active = job.findings.filter(
    (f) =>
      !["verified_fixed", "false_positive", "risk_accepted"].includes(f.status),
  );
  const blockers = active.filter(
    (f) =>
      policy.blockSeverities.includes(f.severity) &&
      (f.status === "verified" || policy.blockPotential),
  );
  return {
    decision: blockers.length ? "BLOCK" : active.length ? "WARN" : "PASS",
    reasons: blockers.length
      ? ["Unresolved findings match the release policy."]
      : active.length
        ? ["Findings require review."]
        : [
            "Configured checks completed within this scope. This is not a guarantee of security.",
          ],
    enforced: false,
  };
}
export function report(grant: Grant, job: ScanJob, policy: ReleasePolicy) {
  authorize(grant, job, "report");
  for (const finding of job.findings) authorize(grant, finding, "report");
  return {
    schemaVersion: 1,
    scope: {
      workspaceId: job.workspaceId,
      projectId: job.projectId,
      mode: job.mode,
    },
    scanId: job.id,
    repository: job.repository,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt ?? null,
    status: job.status,
    ...(job.sourceCoverage ? { sourceCoverage: job.sourceCoverage } : {}),
    coverage: job.runs.map((r) => ({ ...r, reason: redact(r.reason) })),
    findings: job.findings.map((f) => ({
      ...f,
      title: redact(f.title),
      evidence: f.evidence.map((e) => ({ ...e, summary: redact(e.summary) })),
    })),
    audit: job.audit.map((a) => ({ ...a, reason: redact(a.reason) })),
    release: evaluate(job, policy),
    exclusions: job.runs
      .filter((r) => r.status !== "completed")
      .map((r) => ({
        engine: r.engine,
        status: r.status,
        reason: redact(r.reason),
      })),
    limitations: [
      "Evidence applies only to the recorded commit and configured checks.",
      "No CI/deployment enforcement is connected.",
      "Not a pentest, certification, or assurance of security.",
      ...(job.mode === "demo"
        ? ["Synthetic demonstration only; no customer repository was scanned."]
        : []),
    ],
  };
}
export function escapeHtml(input: string): string {
  return input.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function reportHtml(value: ReturnType<typeof report>): string {
  const e = escapeHtml;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Guard release evidence</title><style>body{font:16px system-ui;max-width:960px;margin:2rem auto;padding:1rem}td,th{padding:.6rem;border:1px solid #aaa;text-align:left}table{border-collapse:collapse;width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media print{body{margin:0}}</style></head><body><h1>Guard release evidence</h1><p>${e(value.scope.mode.toUpperCase())} / ${e(value.scope.projectId)}</p><p>Scan ${e(value.scanId)} / commit ${e(value.repository.commit)}</p><p>${e(value.createdAt)} - ${e(value.finishedAt ?? "unfinished")}</p><h2>Release: ${e(value.release.decision)} (evaluation only)</h2><ul>${value.release.reasons.map((r) => `<li>${e(r)}</li>`).join("")}</ul><h2>Coverage</h2><p>${e(JSON.stringify(value.sourceCoverage ?? "Source coverage not recorded"))}</p><table><caption>Engine coverage and exclusions</caption><thead><tr><th>Engine</th><th>Status</th><th>Scanner/version/rules</th><th>Reason / duration</th></tr></thead><tbody>${value.coverage.map((r) => `<tr><td>${e(r.engine)}</td><td>${e(r.status)}</td><td>${e(r.scanner)} ${e(r.version)} / ${e(r.rulePack)}</td><td>${e(r.reason)} / ${r.durationMs ?? "unknown"} ms</td></tr>`).join("")}</tbody></table><h2>Findings</h2>${value.findings.map((f) => `<article><h3>${e(f.title)}</h3><p>${e(f.id)} / ${e(f.severity)} / ${e(f.status)}</p><p>${e(f.source.scanner)} ${e(f.source.version)} / ${e(f.source.ruleId)} / ${e(JSON.stringify(f.location))}</p>${f.evidence.map((ev) => `<p>${e(ev.recordedAt)} / commit ${e(ev.commit)} / ${e(ev.summary)} / evidence ${e(ev.id)} / artifact SHA256 ${e(ev.artifactDigest)}</p>`).join("")}</article>`).join("")}<h2>Audit</h2><pre>${e(JSON.stringify(value.audit, null, 2))}</pre><h2>Limitations</h2><ul>${value.limitations.map((l) => `<li>${e(l)}</li>`).join("")}</ul></body></html>`;
}
