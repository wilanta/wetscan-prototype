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
const nodeTypes = { component: GraphNode };
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
}) {
  const flowNodes = useMemo<FlowComponent[]>(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: "component",
        position: positions[n.id] ?? { x: 0, y: 0 },
        data: {
          component: n,
          security: lens === "Security",
          findingCount: findings.filter(
            (f) => f.nodeId === n.id && f.priority === "review",
          ).length,
          demo: graph.mode === "demo",
          boundary: overlay.trustModel.boundaryNodeIds.includes(n.id),
        },
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
    ],
  );
  const flowEdges = useMemo(
    () =>
      edges.map((e) => {
        const source = nodes.find((n) => n.id === e.source);
        const target = nodes.find((n) => n.id === e.target);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: "smoothstep",
          label: e.description ?? e.relationship,
          selected: e.id === edgeId,
          sourceHandle:
            source?.kind === "auth" && target?.kind === "api"
              ? "source-bottom"
              : source?.kind === "api" && target?.kind === "telemetry"
                ? "source-top"
                : "source-right",
          targetHandle:
            source?.kind === "auth" && target?.kind === "api"
              ? "target-top"
              : target?.kind === "telemetry"
                ? "target-bottom"
                : "target-left",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: "#8392ad",
          },
          style: {
            stroke: "var(--graph-edge)",
            strokeWidth: 1.5,
            strokeDasharray: e.origin !== "verified" ? "5 5" : undefined,
          },
          labelStyle: { fontSize: 10, fill: "var(--ink-muted)" },
          labelBgStyle: { fill: "var(--surface)" },
          ariaLabel: `${source?.label} to ${target?.label}, ${e.description ?? e.relationship}`,
        };
      }),
    [edges, nodes, edgeId],
  );
  return (
    <ReactFlow<FlowComponent>
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
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
      onNodeDragStop={(_, n) => onPosition(n.id, n.position)}
      nodesConnectable={false}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.1}
      maxZoom={1.5}
      colorMode={dark ? "dark" : "light"}
    >
      <Background color={dark ? "#364157" : "#d7dfec"} gap={22} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
