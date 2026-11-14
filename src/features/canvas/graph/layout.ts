import type { ArchitectureGraph, Point } from "../types";
/** Stable layered layout. Cycles share the final layer; bounded relaxation avoids infinite cycles. */
export function layoutGraph(
  graph: Pick<ArchitectureGraph, "nodes" | "edges">,
): Record<string, Point> {
  const ids = graph.nodes.map((n) => n.id).sort();
  const indegree = new Map(
    ids.map((id) => [
      id,
      graph.edges.filter((e) => e.target === id && e.source !== id).length,
    ]),
  );
  const layers = new Map(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => !indegree.get(id));
  const visited = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    visited.add(id);
    for (const edge of graph.edges.filter(
      (e) => e.source === id && e.target !== id,
    )) {
      layers.set(
        edge.target,
        Math.max(layers.get(edge.target) ?? 0, (layers.get(id) ?? 0) + 1),
      );
      indegree.set(edge.target, (indegree.get(edge.target) ?? 1) - 1);
      if (indegree.get(edge.target) === 0) queue.push(edge.target);
    }
  }
  const last = Math.max(0, ...layers.values()) + 1;
  const counts = new Map<number, number>();
  return Object.fromEntries(
    ids.map((id) => {
      const level = visited.has(id) ? layers.get(id)! : last;
      const row = counts.get(level) ?? 0;
      counts.set(level, row + 1);
      return [id, { x: level * 310 + 40, y: row * 190 + 40 }];
    }),
  );
}
