import type { Grant, ScanJob } from "../contracts";
import type { ArchitectureGraph } from "../../canvas/types";
import { authorize, safePath, redact, text } from "../security";
import { fingerprint } from "../../../platform/identity";
import { requireOperationalJob } from "./product-policy";
import { LiveGuardError } from "./model";
import { evaluate } from "../release";
import { releasePolicy } from "./product-view";
export function integrationBundle(grant: Grant, job: ScanJob) {
  authorize(grant, job, "report");
  requireOperationalJob(grant, job);
  if (
    job.projectId !== "github-" + job.repository.repositoryId ||
    job.findings.some(
      (f) =>
        f.mode !== "live" ||
        f.workspaceId !== job.workspaceId ||
        f.projectId !== job.projectId ||
        !f.evidence.length ||
        f.evidence.some(
          (e) =>
            e.synthetic ||
            e.commit !== job.repository.commit ||
            !/^[a-f0-9]{64}$/.test(e.artifactDigest),
        ),
    )
  )
    throw new LiveGuardError("source_integrity");
  const source = {
    provider: job.repository.provider,
    repositoryId: job.repository.repositoryId,
    commit: job.repository.commit,
    scanId: job.id,
    workspaceId: job.workspaceId,
    projectId: job.projectId,
    mode: "live" as const,
  };
  const inventory = (job.inventory ?? []).map((p) => ({
    name: text(p.name),
    version: text(p.version),
    ecosystem: text(p.ecosystem),
    sourcePath: safePath(p.sourcePath),
    license: p.license === null ? null : text(p.license),
    exposure: "DEPENDENCY_PRESENT_NOT_RUNTIME_REACHABILITY" as const,
  }));
  const payload = {
    version: 1 as const,
    producer: "wetscan.guard" as const,
    source,
    findings: job.findings.map((f) => ({
      id: f.id,
      title: redact(f.title),
      severity: f.severity,
      confidence: f.confidence,
      severityKnown: f.severityKnown !== false,
      status: f.status,
      location: {
        path: f.location.path ?? null,
        line: f.location.line ?? null,
        package: f.location.package ?? null,
        installedVersion: f.location.installedVersion ?? null,
        endpoint: f.location.endpoint ?? null,
      },
      provenance: {
        engine: f.source.engine,
        scanner: f.source.scanner,
        version: f.source.version,
        ruleId: f.source.ruleId,
        rulePack: f.source.rulePack,
      },
      evidence: f.evidence.map((e) => ({
        id: e.id,
        commit: e.commit,
        recordedAt: e.recordedAt,
        summary: redact(e.summary),
        artifactDigest: e.artifactDigest,
        synthetic: false as const,
      })),
    })),
    inventory,
    inventoryRevision: fingerprint({ source, inventory }),
    events: [
      {
        version: 1 as const,
        type: "release_evaluated" as const,
        producer: "wetscan.guard" as const,
        source,
        evaluation: evaluate(
          job,
          releasePolicy({ job, revision: 1, coverage: null }),
        ),
        securityIncident: false as const,
      },
    ],
  };
  return {
    ...payload,
    id: fingerprint(payload),
    delivery: {
      canvas: "PENDING_CONSUMER_NOT_CONFIGURED" as const,
      intelligence: "PENDING_CONSUMER_NOT_CONFIGURED" as const,
      sentinel: "PENDING_CONSUMER_NOT_CONFIGURED" as const,
    },
    acknowledged: false as const,
  };
}
export function mapCanvasFindings(
  grant: Grant,
  job: ScanJob,
  graph: ArchitectureGraph,
) {
  const bundle = integrationBundle(grant, job);
  // The caller must supply the authorized graph; no fabricated or fuzzy node mapping.
  if (
    graph.projectRef !== job.projectId ||
    graph.revision !== job.repository.commit ||
    graph.mode !== "live"
  )
    throw new LiveGuardError("revision_conflict", 409);
  const mapped: { findingId: string; nodeId: string }[] = [],
    unmatched: string[] = [];
  for (const f of bundle.findings) {
    const evidenceIds = new Set(
      graph.evidence
        .filter(
          (e) =>
            e.sourcePath === f.location.path &&
            e.sourceRevision === job.repository.commit,
        )
        .map((e) => e.id),
    );
    const nodes = graph.nodes.filter(
      (n) =>
        n.origin !== "user_added" &&
        n.evidenceIds.some((id) => evidenceIds.has(id)),
    );
    if (nodes.length === 1)
      mapped.push({ findingId: f.id, nodeId: nodes[0].id });
    else unmatched.push(f.id);
  }
  return {
    version: 1 as const,
    source: bundle.source,
    mapped,
    unmatched,
    acknowledged: false as const,
  };
}
