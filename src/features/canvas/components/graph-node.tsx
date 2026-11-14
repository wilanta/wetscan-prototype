"use client";
import { memo, type CSSProperties } from "react";
import {
  Handle,
  Position,
  useStore,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { NodeSize } from "../graph/layout";
import {
  AppWindow,
  Braces,
  Cloud,
  Database,
  GitBranch,
  KeyRound,
  Radio,
  Workflow,
  CheckCircle2,
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
    size: NodeSize;
  },
  "component"
>;
export const GraphNode = memo(function GraphNode({
  data,
  selected,
}: NodeProps<FlowComponent>) {
  const textZoom = useStore((state) =>
    Math.max(0.1, Math.round(state.transform[2] * 10) / 10),
  );
  const compact = !data.demo && textZoom < 0.6;
  const titleSize = Math.max(17, Math.min(44, 12 / textZoom));
  const n = data.component;
  const Icon = icons[n.kind] ?? Braces;
  if (n.kind === "service_group")
    return (
      <div
        className={`architecture-group ${compact ? "compact" : ""} ${n.metadata?.collapsedComponents ? "is-collapsed" : ""}`}
        style={
          {
            ...data.size,
            "--node-title-size": `${titleSize}px`,
          } as CSSProperties
        }
        title={n.label}
      >
        <Handle type="target" position={Position.Left} id="target-left" />
        <Handle type="source" position={Position.Right} id="source-right" />
        <Handle type="target" position={Position.Top} id="target-top" />
        <Handle type="source" position={Position.Top} id="source-top" />
        <Handle type="target" position={Position.Bottom} id="target-bottom" />
        <Handle type="source" position={Position.Bottom} id="source-bottom" />
        <Handle type="source" position={Position.Left} id="source-left" />
        <Handle type="target" position={Position.Right} id="target-right" />
        <span>Source boundary</span>
        <strong>{n.label}</strong>
        <small>Detected package / service group</small>
        {n.metadata?.collapsedComponents && (
          <small>
            {n.metadata.collapsedComponents} components · Expand in explorer
          </small>
        )}
      </div>
    );
  return (
    <div
      className={`graph-node ${compact ? "compact" : ""} ${selected ? "selected" : ""} ${data.findingCount ? "at-risk" : ""} ${data.security && data.findingCount ? "security-highlight" : ""}`}
      style={
        {
          ...data.size,
          "--node-title-size": `${titleSize}px`,
          ...(data.boundary ? { border: "2px dashed var(--primary)" } : {}),
        } as CSSProperties
      }
      title={n.label}
    >
      <Handle type="target" position={Position.Left} id="target-left" />
      <Handle type="target" position={Position.Top} id="target-top" />
      <Handle type="source" position={Position.Top} id="source-top" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" />
      <Handle type="target" position={Position.Bottom} id="target-bottom" />
      <Handle type="source" position={Position.Left} id="source-left" />
      <Handle type="target" position={Position.Right} id="target-right" />
      <div className="graph-node-top">
        <span className={`node-icon ${n.kind}`}>
          <Icon size={20} />
        </span>
        <span className="node-kind">
          {data.demo && n.kind === "ci" ? "release" : n.kind}
        </span>
        {n.origin === "verified" && <CheckCircle2 size={13} />}
      </div>
      <strong>{n.label}</strong>
      <small title={n.technology}>
        {n.technology ?? "User-defined component"}
      </small>
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
});
