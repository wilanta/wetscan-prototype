import type {
  ArchitectureGraph,
  ComponentEdge,
  ComponentNode,
  UserCanvasOverlay,
} from "../types";
export function emptyOverlay(projectRef: string): UserCanvasOverlay {
  return {
    schemaVersion: 1,
    projectRef,
    nodePositions: {},
    manualNodes: [],
    manualEdges: [],
    hiddenNodeIds: [],
    unconfirmedEdgeIds: [],
    annotations: {},
    groups: [],
    trustModel: { roles: [], resources: [], policies: [], boundaryNodeIds: [] },
    workflowModels: [],
  };
}
export function normalizeGraph(input: ArchitectureGraph): ArchitectureGraph {
  const graph = structuredClone(input);
  const unique = <T extends { id: string }>(items: T[]) =>
    [...new Map(items.map((item) => [item.id, item])).values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
  graph.evidence = unique(graph.evidence);
  const evidence = new Set(graph.evidence.map((e) => e.id));
  graph.nodes = unique(graph.nodes);
  const ids = new Set(graph.nodes.map((n) => n.id));
  graph.edges = unique(graph.edges).filter((e) => {
    if (ids.has(e.source) && ids.has(e.target)) return true;
    graph.diagnostics.push({
      code: "dangling_edge",
      severity: "warning",
      message: `Relationship ${e.id} references a missing component.`,
    });
    return false;
  });
  for (const item of [...graph.nodes, ...graph.edges]) {
    item.evidenceIds = [
      ...new Set(item.evidenceIds.filter((id) => evidence.has(id))),
    ];
    if (!item.evidenceIds.length && item.origin === "verified") {
      item.origin = "inferred";
      graph.diagnostics.push({
        code: "missing_evidence",
        severity: "warning",
        message: `${item.id} has no supporting evidence; treated as inferred.`,
      });
    }
  }
  return graph;
}
/** Generated IDs win. Stale edits are retained in the overlay for export/reconciliation. */
export function mergeGraph(
  source: ArchitectureGraph,
  overlay: UserCanvasOverlay,
): ArchitectureGraph {
  if (source.projectRef !== overlay.projectRef)
    throw new Error("Canvas project scope mismatch");
  const graph = structuredClone(source);
  const ids = new Set(graph.nodes.map((n) => n.id));
  graph.nodes.push(
    ...overlay.manualNodes
      .filter((n) => !ids.has(n.id))
      .map((n) => ({
        ...n,
        origin: "user_added" as const,
        status: "manual" as const,
        evidenceIds: [],
      })),
  );
  const edgeIds = new Set(graph.edges.map((e) => e.id));
  graph.edges.push(
    ...overlay.manualEdges
      .filter((e) => !edgeIds.has(e.id))
      .map((e) => ({ ...e, origin: "user_added" as const, evidenceIds: [] })),
  );
  graph.edges = graph.edges.map((e) =>
    overlay.unconfirmedEdgeIds.includes(e.id)
      ? {
          ...e,
          origin: "user_added",
          description: `${e.description ?? e.relationship} · User marks this unconfirmed; generated evidence retained.`,
        }
      : e,
  );
  const existing = new Set(graph.nodes.map((n) => n.id));
  const stale = Object.keys(overlay.annotations).filter(
    (id) => !existing.has(id) && !graph.edges.some((e) => e.id === id),
  );
  if (stale.length)
    graph.diagnostics.push({
      code: "orphaned_annotations",
      severity: "warning",
      message: `${stale.length} annotations no longer match this revision; retained in the export.`,
    });
  return normalizeGraph(graph);
}
export interface Filters {
  search: string;
  kind: string;
  origin: string;
  affected: boolean;
  relatedId: string;
  severity: string;
  status: string;
  source: string;
  priority: string;
}
export const emptyFilters: Filters = {
  search: "",
  kind: "",
  origin: "",
  affected: false,
  relatedId: "",
  severity: "",
  status: "",
  source: "",
  priority: "",
};
export function filterGraph(
  graph: ArchitectureGraph,
  filters: Filters,
  affectedIds: string[] = [],
): { nodes: ComponentNode[]; edges: ComponentEdge[] } {
  const related = new Set([
    filters.relatedId,
    ...graph.edges
      .filter(
        (e) => e.source === filters.relatedId || e.target === filters.relatedId,
      )
      .flatMap((e) => [e.source, e.target]),
  ]);
  const nodes = graph.nodes.filter(
    (n) =>
      (!filters.search ||
        `${n.label} ${n.technology ?? ""} ${n.metadata?.route ?? ""}`
          .toLowerCase()
          .includes(filters.search.toLowerCase())) &&
      (!filters.kind || n.kind === filters.kind) &&
      (!filters.origin || n.origin === filters.origin) &&
      (!filters.affected || affectedIds.includes(n.id)) &&
      (!filters.relatedId || related.has(n.id)),
  );
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    edges: graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
  };
}
