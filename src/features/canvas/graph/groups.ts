import type { ArchitectureGraph, NodeKind, UserCanvasOverlay } from "../types";
const roles: Partial<Record<NodeKind, string>> = {
  frontend: "Frontend / Client",
  api: "Backend / API",
  backend: "Backend / API",
  auth: "Authentication",
  database: "Data storage",
  cache: "Data storage",
  storage: "Data storage",
  external_service: "External integrations",
  hosting: "Infrastructure",
  telemetry: "Infrastructure",
  ci: "CI/CD",
  queue: "Background processing",
};
/** Presentation categories only; never add architecture nodes or evidence. */
export function architectureGroups(graph: ArchitectureGraph) {
  const groups = new Map<
    string,
    { id: string; label: string; nodeIds: string[] }
  >();
  for (const node of graph.nodes) {
    if (
      node.kind === "repository" ||
      node.kind === "service_group" ||
      node.groupId
    )
      continue;
    const label = roles[node.kind] ?? "Other / Unknown";
    const id = `view-role:${label}`;
    const group = groups.get(id) ?? { id, label, nodeIds: [] };
    group.nodeIds.push(node.id);
    groups.set(id, group);
  }
  return [...groups.values()].filter((g) => g.nodeIds.length >= 2);
}
export function collapseGraph(
  graph: ArchitectureGraph,
  overlay: UserCanvasOverlay,
): ArchitectureGraph {
  const sourceGroups = new Set(
    graph.nodes.filter((n) => n.kind === "service_group").map((n) => n.id),
  );
  const collapsed = overlay.groups.filter((g) => g.collapsed);
  const mapping = new Map(
    collapsed
      .filter((g) => sourceGroups.has(g.id))
      .flatMap((g) => g.nodeIds.map((id) => [id, g.id] as const)),
  );
  const hidden = new Set([
    ...overlay.hiddenNodeIds,
    ...collapsed.flatMap((g) => g.nodeIds),
  ]);
  const nodes = graph.nodes
    .filter((n) => !hidden.has(n.id))
    .map((n) => {
      const group = collapsed.find((g) => g.id === n.id);
      return group
        ? {
            ...n,
            metadata: {
              ...n.metadata,
              collapsedComponents: group.nodeIds.length,
            },
          }
        : n;
    });
  const ids = new Set(nodes.map((n) => n.id));
  const edges = new Map<string, ArchitectureGraph["edges"][number]>();
  for (const edge of graph.edges) {
    const source = mapping.get(edge.source) ?? edge.source,
      target = mapping.get(edge.target) ?? edge.target;
    if (!ids.has(source) || !ids.has(target) || source === target) continue;
    if (source === edge.source && target === edge.target)
      edges.set(edge.id, edge);
    else {
      const id = `view-group:${source}:${target}:${edge.relationship}`;
      const previous = edges.get(id);
      edges.set(id, {
        ...edge,
        id,
        source,
        target,
        evidenceIds: [
          ...new Set([...(previous?.evidenceIds ?? []), ...edge.evidenceIds]),
        ],
        description:
          "Grouped source relationships. Expand this source boundary to inspect individual connections.",
      });
    }
  }
  return { ...graph, nodes, edges: [...edges.values()] };
}
