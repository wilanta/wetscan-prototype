import { nodes, edges, findings, PROJECT } from "@/data/demo";
import type { CanvasGraphSource, CanvasOverlaySource } from "../contracts";
import type { DemoState } from "@/domain/types";
import type { ArchitectureGraph, TrustModel, Origin } from "../types";
export const demoProjectRef = "demo:orderly";
export const demoComponentOrder = nodes.map((node) => node.id);
export const demoPositions = Object.fromEntries(
  nodes.map((n) => [n.id, { x: n.x, y: n.y }]),
);
export const demoGraph: ArchitectureGraph = {
  schemaVersion: 1,
  analyzerVersion: "demo-adapter/1",
  projectRef: demoProjectRef,
  mode: "demo",
  revision: "a1b2c3d (synthetic)",
  branch: "main",
  environment: "staging",
  generatedAt: "2026-11-14T00:00:00.000Z",
  nodes: nodes.map((n) => ({
    id: n.id,
    kind:
      n.kind === "release"
        ? "ci"
        : (n.kind as ArchitectureGraph["nodes"][number]["kind"]),
    label: n.label,
    technology: n.tech,
    description: n.description,
    origin: n.evidenceOrigin,
    status:
      n.evidenceOrigin === "user_added"
        ? "manual"
        : n.evidenceOrigin === "verified"
          ? "observed_in_source"
          : "inferred",
    evidenceIds: [`demo-node:${n.id}`],
  })),
  edges: edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    relationship: "depends_on",
    origin: e.evidenceOrigin as Origin,
    evidenceIds: [`demo-edge:${e.id}`],
    description: e.label,
  })),
  evidence: [
    ...nodes.map((n) => ({
      id: `demo-node:${n.id}`,
      kind: "manual" as const,
      summary: `Synthetic demo definition: ${n.description}`,
      origin: n.evidenceOrigin,
    })),
    ...edges.map((e) => ({
      id: `demo-edge:${e.id}`,
      kind: "manual" as const,
      summary: `Synthetic relationship: ${e.label}. No runtime connection established.`,
      origin: e.evidenceOrigin as Origin,
    })),
  ],
  diagnostics: [],
  coverage: [
    {
      capability: "demo-fixture",
      status: "partial",
      detail:
        "All provenance is scoped to synthetic demo fixtures; no repository, scan or deployment verified.",
    },
  ],
};
export const DemoCanvasSource: CanvasGraphSource = {
  mode: "demo",
  async loadGraph({ projectRef }) {
    if (projectRef !== demoProjectRef)
      throw new Error("Demo source cannot read a real project");
    return structuredClone(demoGraph);
  },
};
export function demoCanvasSource(
  context: Pick<DemoState, "provider" | "branch">,
): CanvasGraphSource {
  return {
    mode: "demo",
    async loadGraph(request) {
      const graph = await DemoCanvasSource.loadGraph(request);
      graph.branch = context.branch;
      graph.nodes = graph.nodes.map((n) =>
        n.kind === "repository"
          ? {
              ...n,
              technology: `${context.provider === "github" ? "GitHub" : "GitLab"} · ${context.branch}`,
            }
          : n,
      );
      return graph;
    },
  };
}
export function DemoGuardOverlay(state: DemoState) {
  return findings.map((f) => ({
    id: f.id,
    nodeId: f.nodeId,
    title: f.title,
    severity: f.severity,
    source: "Guard" as const,
    status: f.id === "FIND-102" ? state.findingStatus : "potential",
    evidenceType: "Synthetic fixture evidence",
    evidence: f.evidence,
    href: `${PROJECT}/guard/findings/${f.id}`,
    simulated: true,
    priority: (f.id === "FIND-102" && state.findingStatus === "verified_fixed"
      ? "resolved"
      : "review") as "resolved" | "review",
  }));
}
export function DemoSentinelOverlay(state: DemoState) {
  return state.incidents.map((i) => ({
    id: i.id,
    nodeId: findings[0].nodeId,
    title: i.title,
    status: i.status,
    href: `${PROJECT}/sentinel/incidents/${i.id}`,
    simulated: true,
  }));
}
export function demoOverlaySource(state: DemoState): CanvasOverlaySource {
  const scoped = (projectRef: string) => {
    if (projectRef !== demoProjectRef)
      throw new Error("Demo overlay cannot read a real project");
  };
  return {
    mode: "demo",
    async getSecurity(projectRef) {
      scoped(projectRef);
      return {
        projectRef,
        mode: "demo",
        guard: "available",
        sentinel: "partial",
        findings: DemoGuardOverlay(state),
        incidents: DemoSentinelOverlay(state),
        message:
          "Demo / Simulated / Fixture Evidence. No real scans or monitoring.",
      };
    },
    async getTrustVerification(projectRef) {
      scoped(projectRef);
      return {
        projectRef,
        status: "simulated",
        observations: [
          {
            policyId: "customer-read",
            result: "Another customer's order is readable (fixture 200)",
            simulated: true,
          },
        ],
      };
    },
    async getWorkflowTests(projectRef) {
      scoped(projectRef);
      return {
        projectRef,
        status: "simulated",
        results: [
          {
            workflowId: "demo-order",
            result:
              state.integrity === "passed"
                ? "Simulated retest passed"
                : "Locked → Edited · fixture accepted (200)",
            simulated: true,
          },
        ],
      };
    },
  };
}
export const demoTrust: TrustModel = {
  roles: ["Customer", "Staff", "Admin"].map((label) => ({
    id: label.toLowerCase(),
    label,
  })),
  resources: [{ id: "order", label: "Order", nodeId: findings[0].nodeId }],
  policies: ["Customer", "Staff", "Admin"].map((label) => ({
    id: `${label.toLowerCase()}-read`,
    roleId: label.toLowerCase(),
    resourceId: "order",
    action: "read",
    ownership:
      label === "Customer"
        ? "own orders only"
        : label === "Staff"
          ? "assigned orders only"
          : "all orders; audited admin role",
    allowed: true,
    confirmed: false,
  })),
  boundaryNodeIds: [],
};
export const demoLinks = {
  integrity: `${PROJECT}/guard/integrity`,
  guard: `${PROJECT}/guard`,
  sentinel: `${PROJECT}/sentinel`,
};
export const demoFocusNode = findings[0].nodeId;
