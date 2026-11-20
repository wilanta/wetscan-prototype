"use client";
import { useMemo } from "react";
import { Background, Controls, MarkerType, ReactFlow } from "@xyflow/react";
import type {
  ArchitectureGraph,
  ComponentEdge,
  ComponentNode,
  FindingSummary,
  Point,
  UserCanvasOverlay,
} from "../types";
import { GraphNode, type FlowComponent } from "./graph-node";
import { detailedLayout, type GraphLayout } from "../graph/layout";
import { GraphEdge, type RoutedEdge } from "./graph-edge";
const nodeTypes = { component: GraphNode };
const edgeTypes = { architecture: GraphEdge };
export function ArchitectureFlow({
  graph,
  nodes,
  edges,
  positions,
  selected,
  edgeId,
  lens,
  dark,
  overlay,
  findings,
  onSelect,
  onEdge,
  onPosition,
  geometry,
  trace = "direct",
}: {
  graph: ArchitectureGraph;
  nodes: ComponentNode[];
  edges: ComponentEdge[];
  positions: Record<string, Point>;
  selected: string;
  edgeId: string;
  lens: string;
  dark: boolean;
  overlay: UserCanvasOverlay;
  findings: FindingSummary[];
  onSelect(id: string): void;
  onEdge(id: string): void;
  onPosition(id: string, point: Point): void;
  geometry?: GraphLayout;
  trace?: "direct" | "upstream" | "downstream";
}) {
  const automatic = geometry ?? detailedLayout(graph);
  const related = useMemo(() => {
    const values = new Set(selected ? [selected] : []);
    const queue = selected ? [selected] : [];
    while (queue.length) {
      const current = queue.shift()!;
      for (const e of edges) {
        const next =
          e.source === current && trace !== "upstream"
            ? e.target
            : e.target === current && trace !== "downstream"
              ? e.source
              : "";
        if (next && !values.has(next)) {
          values.add(next);
          if (trace !== "direct") queue.push(next);
        }
      }
    }
    return values;
  }, [edges, selected, trace]);
  const flowNodes = useMemo<FlowComponent[]>(
    () =>
      [...nodes]
        .sort(
          (a, b) =>
            Number(b.kind === "service_group") -
            Number(a.kind === "service_group"),
        )
        .map((n) => ({
          id: n.id,
          type: "component",
          position:
            n.groupId &&
            nodes.some((g) => g.id === n.groupId && g.kind === "service_group")
              ? {
                  x: (positions[n.id]?.x ?? 0) - (positions[n.groupId]?.x ?? 0),
                  y: (positions[n.id]?.y ?? 0) - (positions[n.groupId]?.y ?? 0),
                }
              : (positions[n.id] ?? { x: 0, y: 0 }),
          parentId:
            n.groupId &&
            nodes.some((g) => g.id === n.groupId && g.kind === "service_group")
              ? n.groupId
              : undefined,
          draggable: n.kind !== "service_group",
          width: automatic.sizes[n.id]?.width,
          height: automatic.sizes[n.id]?.height,
          className:
            selected && !related.has(n.id) && n.kind !== "service_group"
              ? "canvas-unrelated"
              : "canvas-related",
          data: (() => {
            const nodeFindings = findings.filter(
              (f) => f.nodeId === n.id && f.priority === "review",
            );
            const rank: Record<string, number> = {
              critical: 5,
              high: 4,
              medium: 3,
              low: 2,
              info: 1,
            };
            const topSeverity = nodeFindings
              .map((f) => f.severity)
              .sort((a, b) => (rank[b] ?? 0) - (rank[a] ?? 0))[0];
            return {
              component: n,
              security: lens === "Security",
              findingCount: nodeFindings.length,
              topSeverity,
              demo: graph.mode === "demo",
              boundary: overlay.trustModel.boundaryNodeIds.includes(n.id),
              size: automatic.sizes[n.id],
            };
          })(),
          selected: selected === n.id,
          ariaLabel: `${n.label}, ${n.kind}, ${n.origin}${graph.mode === "demo" ? " in demo" : " in source snapshot"}`,
        })),
    [
      nodes,
      positions,
      selected,
      lens,
      findings,
      graph.mode,
      overlay.trustModel.boundaryNodeIds,
      automatic,
      related,
    ],
  );
  const flowEdges = useMemo<RoutedEdge[]>(
    () =>
      edges.map((e) => {
        const source = nodes.find((n) => n.id === e.source);
        const target = nodes.find((n) => n.id === e.target);
        const points = automatic.routes[e.id] ?? [];
        const side = (point: Point | undefined, id: string) => {
          const p = automatic.positions[id],
            s = automatic.sizes[id];
          if (!point || !p || !s) return "right";
          return (
            [
              ["left", Math.abs(point.x - p.x)],
              ["right", Math.abs(point.x - p.x - s.width)],
              ["top", Math.abs(point.y - p.y)],
              ["bottom", Math.abs(point.y - p.y - s.height)],
            ] as [string, number][]
          ).sort((a, b) => a[1] - b[1])[0][0];
        };
        const moved = [e.source, e.target].some(
          (id) =>
            positions[id]?.x !== automatic.positions[id]?.x ||
            positions[id]?.y !== automatic.positions[id]?.y,
        );
        const labelPoint = points
          .slice(1)
          .map((p, i) => ({
            x: (p.x + points[i].x) / 2,
            y: (p.y + points[i].y) / 2,
            length: Math.hypot(p.x - points[i].x, p.y - points[i].y),
          }))
          .sort((a, b) => b.length - a.length)
          .find(
            (p) =>
              !nodes.some((n) => {
                if (n.kind === "service_group") return false;
                const q = positions[n.id],
                  s = automatic.sizes[n.id];
                return (
                  q &&
                  s &&
                  p.x - 50 < q.x + s.width &&
                  p.x + 50 > q.x &&
                  p.y - 12 < q.y + s.height &&
                  p.y + 12 > q.y
                );
              }),
          );
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: "architecture",
          data: {
            points: moved ? [] : points,
            shortLabel:
              graph.mode === "demo"
                ? (e.description ?? e.relationship)
                : e.relationship.replaceAll("_", " "),
            demo: graph.mode === "demo",
            dense: edges.length > 8,
            labelPoint,
            selectedElsewhere: !!edgeId && edgeId !== e.id,
          },
          label: e.description ?? e.relationship,
          selected: e.id === edgeId,
          sourceHandle: `source-${side(points[0], e.source)}`,
          targetHandle: `target-${side(points.at(-1), e.target)}`,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: "#8392ad",
          },
          style: {
            stroke: "var(--graph-edge)",
            strokeWidth:
              e.id === edgeId ||
              (selected && related.has(e.source) && related.has(e.target))
                ? 2.5
                : 1.5,
            opacity:
              selected && !(related.has(e.source) && related.has(e.target))
                ? 0.2
                : 1,
            strokeDasharray: e.origin !== "verified" ? "5 5" : undefined,
          },
          labelStyle: { fontSize: 10, fill: "var(--ink-muted)" },
          labelBgStyle: { fill: "var(--surface)" },
          ariaLabel: `${source?.label} to ${target?.label}, ${e.description ?? e.relationship}`,
        };
      }),
    [edges, nodes, edgeId, automatic, positions, selected, related, graph.mode],
  );
  return (
    <ReactFlow<FlowComponent, RoutedEdge>
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={(_, n) => onSelect(n.id)}
      onEdgeClick={(_, e) => onEdge(e.id)}
      onNodesChange={(changes) => {
        for (const c of changes)
          if (c.type === "select" && c.selected) onSelect(c.id);
      }}
      onEdgesChange={(changes) => {
        for (const c of changes)
          if (c.type === "select" && c.selected) onEdge(c.id);
      }}
      onNodeDragStop={(_, n) =>
        onPosition(
          n.id,
          n.parentId
            ? {
                x: n.position.x + positions[n.parentId].x,
                y: n.position.y + positions[n.parentId].y,
              }
            : n.position,
        )
      }
      nodesConnectable={false}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.1}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
      colorMode={dark ? "dark" : "light"}
    >
      <Background color={dark ? "#364157" : "#d7dfec"} gap={22} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
