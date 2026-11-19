import { it, expect } from "vitest";
import { analysisFixture } from "./analysis-fixture";
import {
  integrationBundle,
  mapCanvasFindings,
} from "../../../src/features/guard/live/product-integrations";
import type { ArchitectureGraph } from "../../../src/features/canvas/types";
function graph(projectRef: string, revision: string): ArchitectureGraph {
  return {
    schemaVersion: 1,
    analyzerVersion: "unit",
    projectRef,
    revision,
    mode: "live",
    environment: "unknown",
    generatedAt: new Date().toISOString(),
    nodes: [
      {
        id: "api-node",
        kind: "api",
        label: "Route",
        evidenceIds: ["src-e"],
        origin: "verified",
        status: "observed_in_source",
      },
    ],
    edges: [],
    evidence: [
      {
        id: "src-e",
        kind: "source_file",
        sourcePath: "route.ts",
        sourceRevision: revision,
        summary: "Unit source",
        origin: "verified",
      },
    ],
    diagnostics: [],
    coverage: [],
  };
}
it("produces a stable real-data envelope and persists pending status without fictional consumer ack", async () => {
  const f = await analysisFixture();
  f.get().current.inventory = [
    {
      name: "test-package",
      version: "1.0.0",
      ecosystem: "npm",
      license: null,
      sourcePath: "package-lock.json",
    },
  ] as typeof f.job.inventory;
  const bundle = integrationBundle(f.grant, f.get().current);
  expect(bundle.acknowledged).toBe(false);
  expect(bundle.events[0]).toMatchObject({
    type: "release_evaluated",
    securityIncident: false,
    evaluation: { enforced: false },
  });
  expect(bundle.delivery.sentinel).toBe("PENDING_CONSUMER_NOT_CONFIGURED");
  expect(bundle.inventory[0]).toMatchObject({
    license: null,
    exposure: "DEPENDENCY_PRESENT_NOT_RUNTIME_REACHABILITY",
  });
  const a = await f.store.prepareIntegration(f.grant, f.grant, f.job.id, {
    revision: 1,
  });
  const b = await f.store.prepareIntegration(f.grant, f.grant, f.job.id, {
    revision: 2,
  });
  expect(a.bundleId).toBe(b.bundleId);
  expect(f.get().revision).toBe(2);
});
it("Canvas mapping is exact revision/path provenance and preserves unmatched/ambiguous findings", async () => {
  const f = await analysisFixture(),
    g = graph(f.job.projectId, f.job.repository.commit);
  expect(mapCanvasFindings(f.grant, f.job, g).mapped).toEqual([
    { findingId: f.job.findings[0].id, nodeId: "api-node" },
  ]);
  g.nodes.push({ ...g.nodes[0], id: "ambiguous-node" });
  expect(mapCanvasFindings(f.grant, f.job, g).unmatched).toEqual([
    f.job.findings[0].id,
  ]);
  g.revision = "f".repeat(40);
  expect(() => mapCanvasFindings(f.grant, f.job, g)).toThrow(
    "revision_conflict",
  );
});
it("synthetic or cross-workspace evidence cannot enter a Live handoff", async () => {
  const f = await analysisFixture();
  f.job.findings[0].evidence[0].synthetic = true;
  expect(() => integrationBundle(f.grant, f.job)).toThrow("source_integrity");
  expect(() =>
    integrationBundle({ ...f.grant, workspaceId: "other" }, f.job),
  ).toThrow();
});
