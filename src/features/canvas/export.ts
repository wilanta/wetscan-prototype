import type { ArchitectureGraph, UserCanvasOverlay } from "./types";
import { redactText, safePath } from "./discovery/safety";
/** Explicit projections exclude raw source and arbitrary provider metadata. */
export function architectureExport(
  graph: ArchitectureGraph,
  overlay: UserCanvasOverlay,
) {
  return sanitize({
    schemaVersion: 1,
    projectRef: graph.projectRef,
    mode: graph.mode,
    revision: graph.revision,
    analyzerVersion: graph.analyzerVersion,
    generatedAt: graph.generatedAt,
    disclaimer:
      "Static source observations and user annotations only. Partial coverage; no proof of deployment, connectivity or security. Raw source and security overlays excluded.",
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      label: n.label,
      technology: n.technology,
      description: n.description,
      evidenceIds: n.evidenceIds,
      origin: n.origin,
      status: n.status,
      groupId: n.groupId,
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      relationship: e.relationship,
      evidenceIds: e.evidenceIds,
      origin: e.origin,
      description: e.description,
    })),
    evidence: graph.evidence.map((e) => ({
      id: e.id,
      kind: e.kind,
      sourcePath:
        e.sourcePath && safePath(e.sourcePath) ? e.sourcePath : undefined,
      startLine: e.startLine,
      summary: e.summary,
      origin: e.origin,
      sourceRevision: e.sourceRevision,
    })),
    coverage: graph.coverage,
    diagnostics: graph.diagnostics,
    userOverlay: overlay,
  });
}
export function sanitize(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/^(?:rawSource|content|snippet|token|password|secret|credentials|cookie)$/i.test(
              key,
            ),
        )
        .map(([key, val]) => [key, sanitize(val)]),
    );
  return value;
}
export function readableSummary(graph: ArchitectureGraph) {
  return redactText(
    [
      `WetScan Canvas · ${graph.projectRef}`,
      `Mode: ${graph.mode} · Revision: ${graph.revision}`,
      "Source observations only. Deployment, runtime connectivity and security are unverified.",
      ...graph.nodes.map(
        (n) => `${n.label} (${n.kind}) · ${n.origin}: ${n.description ?? ""}`,
      ),
      ...graph.coverage.map((c) => `${c.capability}: ${c.status}. ${c.detail}`),
    ].join("\n"),
  );
}
export function download(name: string, value: unknown, plain = false) {
  const blob = new Blob(
    [plain ? String(value) : JSON.stringify(sanitize(value), null, 2)],
    { type: plain ? "text/plain" : "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
