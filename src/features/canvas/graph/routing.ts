import type { ArchitectureGraph, Point } from "../types";
import type { GraphLayout } from "./layout";
type Box = { x: number; y: number; width: number; height: number };
function intersects(a: Point, b: Point, box: Box) {
  let low = 0,
    high = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, box.x, box.x + box.width],
    [a.y, b.y - a.y, box.y, box.y + box.height],
  ]) {
    if (Math.abs(delta) < 0.0001) {
      if (start <= min || start >= max) return false;
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
function port(box: Box, toward: Point) {
  const distances = [
    Math.abs(toward.x - box.x),
    Math.abs(toward.x - box.x - box.width),
    Math.abs(toward.y - box.y),
    Math.abs(toward.y - box.y - box.height),
  ];
  const side = distances.indexOf(Math.min(...distances));
  const point =
    side < 2
      ? { x: box.x + (side === 1 ? box.width : 0), y: box.y + box.height / 2 }
      : { x: box.x + box.width / 2, y: box.y + (side === 3 ? box.height : 0) };
  return {
    point,
    stub: {
      x: point.x + (side === 0 ? -24 : side === 1 ? 24 : 0),
      y: point.y + (side === 2 ? -24 : side === 3 ? 24 : 0),
    },
  };
}
/** Bounded rectilinear A* repair for Dagre segments that intersect unrelated nodes. */
export function routeAroundNodes(
  graph: Pick<ArchitectureGraph, "nodes" | "edges">,
  layout: GraphLayout,
) {
  const containers = new Set(graph.nodes.map((n) => n.groupId).filter(Boolean));
  const boxes = new Map(
    graph.nodes
      .filter((n) => !containers.has(n.id))
      .map((n) => [n.id, { ...layout.positions[n.id], ...layout.sizes[n.id] }]),
  );
  for (const edge of graph.edges) {
    const original = layout.routes[edge.id];
    if (!original?.length) continue;
    const unrelated = [...boxes]
      .filter(([id]) => id !== edge.source && id !== edge.target)
      .map(([, box]) => box);
    if (
      !original
        .slice(1)
        .some((p, i) =>
          unrelated.some((box) => intersects(original[i], p, box)),
        )
    )
      continue;
    const source = boxes.get(edge.source),
      target = boxes.get(edge.target);
    if (!source || !target) continue;
    const start = port(source, original[0]),
      end = port(target, original.at(-1)!);
    const obstacles = [...boxes.values()].map((b) => ({
      x: b.x - 12,
      y: b.y - 12,
      width: b.width + 24,
      height: b.height + 24,
    }));
    const xs = [
      ...new Set([
        start.stub.x,
        end.stub.x,
        ...obstacles.flatMap((b) => [b.x, b.x + b.width]),
      ]),
    ].sort((a, b) => a - b);
    const ys = [
      ...new Set([
        start.stub.y,
        end.stub.y,
        ...obstacles.flatMap((b) => [b.y, b.y + b.height]),
      ]),
    ].sort((a, b) => a - b);
    if (xs.length * ys.length > 100000) {
      layout.routingLimited = true;
      continue;
    }
    const begin =
        ys.indexOf(start.stub.y) * xs.length + xs.indexOf(start.stub.x),
      finish = ys.indexOf(end.stub.y) * xs.length + xs.indexOf(end.stub.x);
    const point = (cell: number): Point => ({
      x: xs[cell % xs.length],
      y: ys[Math.floor(cell / xs.length)],
    });
    type Step = {
      cell: number;
      dir: number;
      cost: number;
      score: number;
      key: number;
    };
    const open: Step[] = [
        { cell: begin, dir: 0, cost: 0, score: 0, key: begin * 3 },
      ],
      costs = new Map<number, number>([[begin * 3, 0]]),
      parents = new Map<number, number>();
    let completed: number | undefined,
      visited = 0;
    while (open.length && visited++ < 100000) {
      // Repairs are rare; a sorted frontier keeps this implementation bounded and inspectable.
      open.sort((a, b) => a.score - b.score || a.key - b.key);
      const current = open.shift()!;
      if (current.cost !== (costs.get(current.key) ?? Infinity)) continue;
      if (current.cell === finish) {
        completed = current.key;
        break;
      }
      const x = current.cell % xs.length,
        y = Math.floor(current.cell / xs.length),
        a = point(current.cell);
      for (const [nx, ny, dir] of [
        [x - 1, y, 1],
        [x + 1, y, 1],
        [x, y - 1, 2],
        [x, y + 1, 2],
      ]) {
        if (nx < 0 || nx >= xs.length || ny < 0 || ny >= ys.length) continue;
        const cell = ny * xs.length + nx,
          b = point(cell);
        if (obstacles.some((box) => intersects(a, b, box))) continue;
        const cost =
            current.cost +
            Math.abs(a.x - b.x) +
            Math.abs(a.y - b.y) +
            (current.dir && current.dir !== dir ? 24 : 0),
          key = cell * 3 + dir;
        if (cost >= (costs.get(key) ?? Infinity)) continue;
        costs.set(key, cost);
        parents.set(key, current.key);
        open.push({
          cell,
          dir,
          cost,
          key,
          score: cost + Math.abs(b.x - end.stub.x) + Math.abs(b.y - end.stub.y),
        });
      }
    }
    if (completed === undefined) {
      layout.routingLimited = true;
      continue;
    }
    const path: Point[] = [];
    for (
      let key: number | undefined = completed;
      key !== undefined;
      key = parents.get(key)
    )
      path.push(point(Math.floor(key / 3)));
    const raw = [start.point, ...path.reverse(), end.point];
    layout.routes[edge.id] = raw.filter(
      (p, i) =>
        i === 0 ||
        i === raw.length - 1 ||
        !(
          (raw[i - 1].x === p.x && p.x === raw[i + 1].x) ||
          (raw[i - 1].y === p.y && p.y === raw[i + 1].y)
        ),
    );
  }
}
