import { expect, it } from "vitest";
import {
  detailedLayout,
  layoutGraph,
  nodeSize,
  placeGraph,
} from "../../src/features/canvas/graph/layout";
import { visualGraph, visualScenarios } from "./visual-graphs";
function crosses(
  a: { x: number; y: number },
  b: { x: number; y: number },
  p: { x: number; y: number },
  size: { width: number; height: number },
) {
  let low = 0,
    high = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, p.x + 2, p.x + size.width - 2],
    [a.y, b.y - a.y, p.y + 2, p.y + size.height - 2],
  ]) {
    if (Math.abs(delta) < 0.0001) {
      if (start < min || start > max) return false;
    } else {
      const values = [(min - start) / delta, (max - start) / delta].sort(
        (x, y) => x - y,
      );
      low = Math.max(low, values[0]);
      high = Math.min(high, values[1]);
      if (low >= high) return false;
    }
  }
  return low < high;
}
for (const scenario of visualScenarios)
  it(`${scenario} has finite deterministic dimensions and no unrelated node overlap`, () => {
    const graph = visualGraph(scenario),
      layout = detailedLayout(graph);
    expect(layout.positions).toEqual(
      layoutGraph({
        nodes: [...graph.nodes].reverse(),
        edges: [...graph.edges].reverse(),
      }),
    );
    for (const a of graph.nodes) {
      const p = layout.positions[a.id],
        size = layout.sizes[a.id];
      expect(
        Number.isFinite(p.x) &&
          Number.isFinite(p.y) &&
          size.width > 0 &&
          size.height > 0,
      ).toBe(true);
      if (a.kind === "service_group") continue;
      for (const b of graph.nodes.filter(
        (n) => n.id > a.id && n.kind !== "service_group",
      )) {
        const q = layout.positions[b.id],
          s = layout.sizes[b.id];
        expect(
          p.x < q.x + s.width &&
            p.x + size.width > q.x &&
            p.y < q.y + s.height &&
            p.y + size.height > q.y,
          `${a.id} overlaps ${b.id}`,
        ).toBe(false);
      }
    }
    for (const points of Object.values(layout.routes))
      expect(
        points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      ).toBe(true);
    for (const edge of graph.edges) {
      const points = layout.routes[edge.id] ?? [];
      for (const node of graph.nodes.filter(
        (n) =>
          n.id !== edge.source &&
          n.id !== edge.target &&
          n.kind !== "service_group",
      )) {
        for (let i = 1; i < points.length; i++)
          expect(
            crosses(
              points[i - 1],
              points[i],
              layout.positions[node.id],
              layout.sizes[node.id],
            ),
            `${scenario} ${edge.id} crosses ${node.id}`,
          ).toBe(false);
      }
    }
  });
it("does not recalculate on notes, selection, security or description changes", () => {
  const a = visualGraph("medium"),
    b = structuredClone(a);
  b.nodes[0].description = "A new note without a topology change";
  expect(detailedLayout(a)).toBe(detailedLayout(b));
});
it("preserves explicit manual coordinates and places a new node without colliding with them", () => {
  const graph = visualGraph("small"),
    original = layoutGraph(graph);
  const manual = { [graph.nodes[0].id]: { x: 50, y: 50 } };
  const placed = placeGraph(graph, manual);
  expect(placed.positions[graph.nodes[0].id]).toEqual(
    manual[graph.nodes[0].id],
  );
  expect(original).not.toBe(placed.positions);
  expect(nodeSize(visualGraph("long-titles").nodes[0]).height).toBeGreaterThan(
    nodeSize(graph.nodes[0]).height,
  );
});
