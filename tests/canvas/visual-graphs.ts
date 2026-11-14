import type {
  ArchitectureGraph,
  ComponentNode,
  NodeKind,
} from "../../src/features/canvas/types";
export const visualScenarios = [
  "small",
  "medium",
  "large",
  "api-only",
  "next-fullstack",
  "monorepo",
  "long-titles",
  "dense",
  "cycles",
  "unknown",
] as const;
export function visualGraph(scenario: string): ArchitectureGraph {
  const count =
    scenario === "large"
      ? 80
      : scenario === "medium"
        ? 26
        : scenario === "monorepo"
          ? 30
          : scenario === "dense"
            ? 24
            : scenario === "small"
              ? 7
              : 12;
  const kinds: NodeKind[] =
    scenario === "api-only"
      ? ["api", "database", "cache", "external_service"]
      : ["frontend", "api", "auth", "database", "queue", "external_service"];
  const nodes: ComponentNode[] = Array.from({ length: count }, (_, i) => ({
    id: `node-${i.toString().padStart(3, "0")}`,
    kind:
      scenario === "unknown" && i % 3 === 0
        ? "unknown"
        : kinds[i % kinds.length],
    label:
      scenario === "long-titles"
        ? `Very long component ${i} with unbroken-path-abcdefghijklmnopqrstuvwxyz-0123456789-and-important-details`
        : `${kinds[i % kinds.length].replaceAll("_", " ")} ${i + 1}`,
    technology: "Synthetic visual test fixture",
    origin: "inferred",
    status: "inferred",
    evidenceIds: [],
  }));
  if (scenario === "monorepo" || scenario === "large") {
    for (let i = 0; i < Math.ceil(count / 10); i++) {
      const id = `package-${i}`;
      for (const member of nodes.slice(i * 10, i * 10 + 10))
        member.groupId = id;
      nodes.push({
        id,
        kind: "service_group",
        label: `packages/service-${i + 1}`,
        technology: "Visual fixture source boundary",
        origin: "inferred",
        status: "inferred",
        evidenceIds: [],
      });
    }
  }
  const edges: ArchitectureGraph["edges"] = [];
  const connect = (a: number, b: number) => {
    if (
      a === b ||
      edges.some((e) => e.source === nodes[a].id && e.target === nodes[b].id)
    )
      return;
    edges.push({
      id: `edge-${a}-${b}`,
      source: nodes[a].id,
      target: nodes[b].id,
      relationship: "imports",
      origin: "inferred",
      evidenceIds: [],
      description: `Synthetic source import ${a} to ${b}; no runtime claim.`,
    });
  };
  for (let i = 0; i < count - 1; i++) {
    if (scenario === "dense")
      for (let n = 1; n <= 4 && i + n < count; n++) connect(i, i + n);
    else if (scenario === "api-only") {
      if (i % 4 === 0)
        for (let n = 1; n < 4 && i + n < count; n++) connect(i, i + n);
    } else if (scenario === "monorepo" || scenario === "large") {
      if (i % 10 !== 9) connect(i, i + 1);
      if (i % 10 === 0 && i + 10 < count) connect(i, i + 10);
    } else {
      connect(Math.floor(i / 3), i + 1);
    }
  }
  if (scenario === "cycles") {
    connect(5, 0);
    connect(9, 3);
    connect(11, 7);
  }
  return {
    schemaVersion: 1,
    analyzerVersion: "visual-fixture/1",
    projectRef: `internal:visual-${scenario}`,
    mode: "snapshot",
    revision: "visual-fixture-v1",
    generatedAt: "2026-11-14T00:00:00.000Z",
    environment: "unknown",
    nodes,
    edges,
    evidence: [],
    diagnostics: [],
    coverage: [
      {
        capability: "visual-fixture",
        status: "unsupported",
        detail:
          "Synthetic layout test only; no repository or runtime evidence.",
      },
    ],
  };
}
