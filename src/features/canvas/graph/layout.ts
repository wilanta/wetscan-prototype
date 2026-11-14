import dagre from "@dagrejs/dagre";
import type { ArchitectureGraph, ComponentNode, Point } from "../types";
import { routeAroundNodes } from "./routing";
export const layoutVersion = "dagre-lr/1";
type Input = Pick<ArchitectureGraph, "nodes" | "edges">;
export interface NodeSize {
  width: number;
  height: number;
}
export interface GraphLayout {
  positions: Record<string, Point>;
  sizes: Record<string, NodeSize>;
  routes: Record<string, Point[]>;
  routingLimited?: boolean;
}
export function nodeSize(node: ComponentNode): NodeSize {
  return {
    width: node.label.length > 30 ? 276 : 232,
    height: node.label.length > 30 ? 194 : 170,
  };
}
export function topologyKey(graph: Input) {
  return JSON.stringify([
    layoutVersion,
    graph.nodes
      .map((n) => [n.id, n.groupId ?? "", nodeSize(n)])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    graph.edges
      .map((e) => [e.id, e.source, e.target])
      .sort((a, b) => a[0].localeCompare(b[0])),
  ]);
}
const layouts = new Map<string, GraphLayout>();
/** Deterministic dimension-aware Sugiyama layout. Cached by topology, never selection/notes/lens. */
export function detailedLayout(graph: Input): GraphLayout {
  const key = topologyKey(graph);
  const cached = layouts.get(key);
  if (cached) return cached;
  const result: GraphLayout = { positions: {}, sizes: {}, routes: {} };
  if (!graph.nodes.length) return result;
  const model = new dagre.graphlib.Graph({ multigraph: true, compound: true });
  model.setGraph({
    rankdir: "LR",
    ranksep: 110,
    nodesep: 56,
    edgesep: 24,
    marginx: 48,
    marginy: 48,
    ranker: "network-simplex",
    acyclicer: "greedy",
  });
  model.setDefaultEdgeLabel(() => ({}));
  const nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set(nodes.map((n) => n.id));
  const groups = new Set(
    nodes.filter((n) => n.kind === "service_group").map((n) => n.id),
  );
  const containers = new Set(
    nodes
      .filter((n) => n.groupId && groups.has(n.groupId))
      .map((n) => n.groupId!),
  );
  for (const node of nodes) model.setNode(node.id, nodeSize(node));
  for (const node of nodes)
    if (node.groupId && groups.has(node.groupId) && !groups.has(node.id))
      model.setParent(node.id, node.groupId);
  for (const edge of [...graph.edges].sort((a, b) => a.id.localeCompare(b.id)))
    if (
      ids.has(edge.source) &&
      ids.has(edge.target) &&
      !containers.has(edge.source) &&
      !containers.has(edge.target)
    )
      model.setEdge(
        edge.source,
        edge.target,
        { minlen: 1, weight: 1 },
        edge.id,
      );
  dagre.layout(model);
  for (const node of nodes) {
    const value = model.node(node.id);
    result.sizes[node.id] = { width: value.width, height: value.height };
    result.positions[node.id] = {
      x: value.x - value.width / 2,
      y: value.y - value.height / 2,
    };
  }
  for (const edge of model.edges())
    result.routes[edge.name!] = model
      .edge(edge)
      .points.map((p: Point) => ({ x: p.x, y: p.y }));
  routeAroundNodes(graph, result);
  if (layouts.size >= 24) layouts.delete(layouts.keys().next().value!);
  layouts.set(key, result);
  return result;
}
export function layoutGraph(graph: Input): Record<string, Point> {
  return structuredClone(detailedLayout(graph).positions);
}

/** Keep explicit manual positions. New nodes are nudged into free space beside their dependencies. */
const placements = new Map<string, GraphLayout>();
export function placeGraph(graph: Input, manual: Record<string, Point>) {
  const layout = detailedLayout(graph);
  const key = JSON.stringify([
    topologyKey(graph),
    Object.entries(manual).sort((a, b) => a[0].localeCompare(b[0])),
  ]);
  const existing = placements.get(key);
  if (existing) return existing;
  const positions = { ...layout.positions, ...manual };
  const fixed = graph.nodes.filter((n) => manual[n.id]);
  const free = graph.nodes.filter((n) => !manual[n.id]);
  const placed = [...fixed];
  for (const node of free) {
    let point = positions[node.id];
    const size = layout.sizes[node.id];
    for (let attempt = 0; attempt < graph.nodes.length * 2; attempt++) {
      const collision = placed.find((other) => {
        if (other.kind === "service_group" || node.kind === "service_group")
          return false;
        const p = positions[other.id],
          s = layout.sizes[other.id];
        return (
          point.x < p.x + s.width + 24 &&
          point.x + size.width + 24 > p.x &&
          point.y < p.y + s.height + 24 &&
          point.y + size.height + 24 > p.y
        );
      });
      if (!collision) break;
      point = {
        ...point,
        y: positions[collision.id].y + layout.sizes[collision.id].height + 56,
      };
    }
    positions[node.id] = point;
    placed.push(node);
  }
  const result = {
    ...layout,
    positions,
    routes: structuredClone(layout.routes),
  };
  for (const edge of graph.edges) {
    const source = positions[edge.source],
      target = positions[edge.target],
      points = result.routes[edge.id];
    if (!source || !target || !points?.length) continue;
    if (
      [edge.source, edge.target].some(
        (id) =>
          positions[id].x !== layout.positions[id].x ||
          positions[id].y !== layout.positions[id].y,
      )
    ) {
      const forward = target.x >= source.x;
      result.routes[edge.id] = [
        {
          x: source.x + (forward ? result.sizes[edge.source].width : 0),
          y: source.y + result.sizes[edge.source].height / 2,
        },
        ...points.slice(1, -1),
        {
          x: target.x + (forward ? 0 : result.sizes[edge.target].width),
          y: target.y + result.sizes[edge.target].height / 2,
        },
      ];
    }
  }
  routeAroundNodes(graph, result);
  if (placements.size >= 24) placements.delete(placements.keys().next().value!);
  placements.set(key, result);
  return result;
}
