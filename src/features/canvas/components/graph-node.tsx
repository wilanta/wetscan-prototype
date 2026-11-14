"use client";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  AppWindow,
  Braces,
  Cloud,
  Database,
  GitBranch,
  KeyRound,
  Radio,
  Workflow,
} from "lucide-react";
import type { ComponentNode } from "../types";
export const icons: Record<string, typeof Braces> = {
  frontend: AppWindow,
  api: Braces,
  auth: KeyRound,
  database: Database,
  repository: GitBranch,
  ci: Workflow,
  hosting: Cloud,
  telemetry: Radio,
};
export type FlowComponent = Node<
  {
    component: ComponentNode;
    security: boolean;
    findingCount: number;
    demo: boolean;
    boundary: boolean;
  },
  "component"
>;
export function GraphNode({ data, selected }: NodeProps<FlowComponent>) {
  const n = data.component;
  const Icon = icons[n.kind] ?? Braces;
  return (
    <div
      className={`graph-node ${selected ? "selected" : ""} ${data.findingCount ? "at-risk" : ""} ${data.security && data.findingCount ? "security-highlight" : ""}`}
      style={
        data.boundary ? { border: "2px dashed var(--primary)" } : undefined
      }
    >
      <Handle type="target" position={Position.Left} id="target-left" />
      {n.kind === "api" && (
        <>
          <Handle
            type="target"
            position={Position.Top}
            id="target-top"
            style={{ left: "35%" }}
          />
          <Handle
            type="source"
            position={Position.Top}
            id="source-top"
            style={{ left: "75%" }}
          />
        </>
      )}
      {n.kind === "auth" && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="source-bottom"
          style={{ left: "35%" }}
        />
      )}
      {n.kind === "telemetry" && (
        <Handle type="target" position={Position.Bottom} id="target-bottom" />
      )}
      <div className="graph-node-top">
        <span className={`node-icon ${n.kind}`}>
          <Icon size={20} />
        </span>
        <span className="node-kind">{n.kind}</span>
      </div>
      <strong>{n.label}</strong>
      <small>{n.technology ?? "User-defined component"}</small>
      <div className="graph-node-footer">
        {data.findingCount ? (
          <>
            <span className="severity-dot high" />
            {data.findingCount} finding{data.findingCount > 1 ? "s" : ""} to
            review
          </>
        ) : (
          <>
            <span className={`origin-dot ${n.origin}`} />
            {n.origin.replace("_", " ")}
            {data.demo && <span className="demo-origin"> · demo</span>}
          </>
        )}
        {data.boundary && " · trust boundary"}
      </div>
      <Handle type="source" position={Position.Right} id="source-right" />
    </div>
  );
}
