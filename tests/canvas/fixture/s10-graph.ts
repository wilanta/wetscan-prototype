import type { ArchitectureGraph } from "../../../src/features/canvas/types";

/** Self-contained live-mode graph (no JSON import so Playwright's node loader can read it): one source-observed API node. */
export const S10_REVISION = "a".repeat(40);
export const S10_PROJECT_REF = "github-user-7/github-123";
const p = encodeURIComponent(S10_PROJECT_REF);
const ev = (id: string, path: string, summary: string) => ({
  id: `${p}:evidence:${id}`,
  kind: "source_file" as const,
  sourcePath: path,
  startLine: 1,
  summary,
  origin: "verified" as const,
  sourceRevision: S10_REVISION,
});
const node = (
  kind: "frontend" | "api" | "database",
  key: string,
  label: string,
  evidenceId: string,
  metadata?: Record<string, string>,
) => ({
  id: `${p}:${kind}:${key}`,
  kind,
  label,
  technology: kind === "api" ? "App Router" : "Next.js",
  evidenceIds: [`${p}:evidence:${evidenceId}`],
  origin: "verified" as const,
  status: "observed_in_source" as const,
  description:
    "Observed in this source revision. Availability, deployment and runtime behavior have not been verified.",
  ...(metadata ? { metadata } : {}),
});
export function s10Graph(): ArchitectureGraph {
  const api = node("api", "orders", "/api/orders/[id]", "orders", {
    route: "/api/orders/[id]",
    methods: "GET, PATCH",
  });
  const web = node("frontend", "app", "Web application", "web");
  const db = node("database", "prisma", "Prisma", "db");
  return {
    schemaVersion: 1,
    analyzerVersion: "s10-fixture/1.0.0",
    projectRef: S10_PROJECT_REF,
    mode: "live",
    revision: S10_REVISION,
    branch: "main",
    environment: "unknown",
    generatedAt: "2026-11-19T00:00:00.000Z",
    nodes: [web, api, db],
    edges: [
      {
        id: `${p}:edge:web-api`,
        source: web.id,
        target: api.id,
        relationship: "http_call",
        evidenceIds: [`${p}:evidence:orders`],
        origin: "verified",
      },
      {
        id: `${p}:edge:api-db`,
        source: api.id,
        target: db.id,
        relationship: "reads",
        evidenceIds: [`${p}:evidence:db`],
        origin: "verified",
      },
    ],
    evidence: [
      ev(
        "orders",
        "src/app/api/orders/[id]/route.ts",
        "App Router: /api/orders/[id]; exported methods GET, PATCH.",
      ),
      ev(
        "web",
        "package.json",
        "Package manifest identifies framework dependencies.",
      ),
      ev("db", "src/lib/db.ts", "Prisma imported and referenced in source."),
    ],
    diagnostics: [],
    coverage: [
      {
        capability: "API routes",
        status: "supported",
        detail: "App Router routes observed in source.",
      },
    ],
  };
}
export const s10ApiNodeId = () =>
  s10Graph().nodes.find((n) => n.kind === "api")!.id;
