import { describe, expect, it } from "vitest";
import { initialState } from "../../src/data/demo";
import { stableId } from "../../src/features/canvas/graph/ids";
import {
  emptyFilters,
  emptyOverlay,
  filterGraph,
  mergeGraph,
  normalizeGraph,
} from "../../src/features/canvas/graph/model";
import { layoutGraph } from "../../src/features/canvas/graph/layout";
import {
  DemoCanvasSource,
  demoCanvasSource,
  demoGraph,
  demoOverlaySource,
  demoProjectRef,
  demoTrust,
} from "../../src/features/canvas/adapters/demo-source";
import {
  MemoryCanvasPersistence,
  DemoCanvasPersistence,
} from "../../src/features/canvas/adapters/persistence";
import { UnavailableCanvasOverlaySource } from "../../src/features/canvas/adapters/overlay-unavailable";
import { SnapshotCanvasSource } from "../../src/features/canvas/adapters/snapshot-source";
import { memorySnapshot } from "../../src/features/canvas/discovery/snapshot";
import { loadCanvas, scopeSecurity } from "../../src/features/canvas/service";
import {
  validateGraph,
  validateOverlay,
  parseOverlayJSON,
} from "../../src/features/canvas/validation";
import {
  observedPolicy,
  trustTestPlan,
  updatePolicy,
} from "../../src/features/canvas/trust/model";
import {
  removeState,
  templateNames,
  workflowTemplate,
  workflowTestPlan,
} from "../../src/features/canvas/workflows/model";
import {
  architectureExport,
  readableSummary,
} from "../../src/features/canvas/export";
import { safeActionHref } from "../../src/features/canvas/adapters/overlay-validation";
describe("Graph and manual overlays", () => {
  it("stable IDs are scoped and distinguish punctuation", () => {
    expect(stableId("a", "api", "foo/bar")).toBe(
      stableId("a", "api", "foo\\bar"),
    );
    expect(stableId("a", "api", "foo:bar")).not.toBe(
      stableId("a", "api", "foo/bar"),
    );
    expect(stableId("b", "api", "x")).not.toBe(stableId("a", "api", "x"));
  });
  it("deduplicates IDs, removes dangling edges, and downgrades unsupported verified assertions", () => {
    const graph = structuredClone(demoGraph);
    graph.nodes.push(graph.nodes[0]);
    graph.nodes[0].evidenceIds = ["missing"];
    graph.edges.push({
      ...graph.edges[0],
      id: "invalid-edge",
      target: "missing",
    });
    const normalized = normalizeGraph(graph);
    expect(new Set(normalized.nodes.map((n) => n.id)).size).toBe(
      normalized.nodes.length,
    );
    expect(normalized.edges.some((e) => e.id === "invalid-edge")).toBe(false);
    expect(
      normalized.nodes.find((n) => n.id === graph.nodes[0].id)?.origin,
    ).toBe("inferred");
  });
  it("generated graph wins collisions; edits and orphaned annotations survive refresh without mutation", () => {
    const original = structuredClone(demoGraph);
    const overlay = emptyOverlay(original.projectRef);
    overlay.manualNodes.push({
      ...original.nodes[0],
      label: "ATTEMPTED OVERWRITE",
      origin: "user_added",
      status: "manual",
    });
    overlay.annotations.deleted = "Retained note";
    overlay.unconfirmedEdgeIds.push(original.edges[0].id);
    const merged = mergeGraph(original, overlay);
    expect(original).toEqual(demoGraph);
    expect(merged.nodes.some((n) => n.label === "ATTEMPTED OVERWRITE")).toBe(
      false,
    );
    expect(
      merged.diagnostics.some((d) => d.code === "orphaned_annotations"),
    ).toBe(true);
    expect(
      merged.edges.find((e) => e.id === original.edges[0].id)?.origin,
    ).toBe("user_added");
    expect(overlay.annotations.deleted).toBe("Retained note");
  });
  it("filters nodes and edges together; related and affected counts are consistent", () => {
    const filtered = filterGraph(demoGraph, {
      ...emptyFilters,
      search: "orders",
      origin: "verified",
    });
    expect(filtered.nodes).toHaveLength(2);
    expect(filtered.edges).toHaveLength(1);
    const affected = filterGraph(
      demoGraph,
      { ...emptyFilters, affected: true },
      [demoGraph.nodes[1].id],
    );
    expect(affected.nodes).toHaveLength(1);
    expect(affected.edges).toHaveLength(0);
    const related = filterGraph(demoGraph, {
      ...emptyFilters,
      relatedId: "orders-api",
    });
    expect(related.nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining(["web", "database", "auth", "orders-api"]),
    );
  });
  it("layout is stable under reorder and terminates on cycles", () => {
    expect(layoutGraph(demoGraph)).toEqual(
      layoutGraph({
        nodes: [...demoGraph.nodes].reverse(),
        edges: [...demoGraph.edges].reverse(),
      }),
    );
    const cyclic = {
      ...demoGraph,
      edges: [
        ...demoGraph.edges,
        {
          ...demoGraph.edges[0],
          id: "cycle",
          source: "database",
          target: "web",
        },
      ],
    };
    expect(Object.keys(layoutGraph(cyclic))).toHaveLength(
      demoGraph.nodes.length,
    );
  });
});
describe("Scoped adapters", () => {
  it("retains the legacy demo provider and branch presentation in its adapter", async () => {
    const graph = await demoCanvasSource({
      provider: "gitlab",
      branch: "develop",
    }).loadGraph({ projectRef: demoProjectRef });
    expect(graph.branch).toBe("develop");
    expect(graph.nodes.find((n) => n.kind === "repository")?.technology).toBe(
      "GitLab · develop",
    );
  });
  it("demo source and every demo overlay reject non-demo scopes", async () => {
    const source = demoOverlaySource(initialState());
    await expect(
      DemoCanvasSource.loadGraph({ projectRef: "real" }),
    ).rejects.toThrow();
    await expect(source.getSecurity("real")).rejects.toThrow();
    await expect(source.getTrustVerification("real")).rejects.toThrow();
    await expect(source.getWorkflowTests("real")).rejects.toThrow();
  });
  it("service gates simulated findings AND incidents even when an adapter lies about its mode", async () => {
    const graph = { ...demoGraph, projectRef: "real", mode: "live" as const };
    const security =
      await demoOverlaySource(initialState()).getSecurity(demoProjectRef);
    for (const overlay of [
      security,
      { ...security, projectRef: "real", mode: "live" as const },
    ]) {
      const scoped = scopeSecurity(graph, overlay);
      expect(scoped.findings).toEqual([]);
      expect(scoped.incidents).toEqual([]);
      expect(scoped.guard).toBe("failed");
    }
  });
  it("missing Guard and Sentinel return unknown coverage with no fabricated results", async () => {
    const snapshot = memorySnapshot({
      "package.json": '{"dependencies":{"next":"16"}}',
    });
    const result = await loadCanvas(
      SnapshotCanvasSource(snapshot),
      snapshot.repositoryRef,
    );
    expect(result.security).toMatchObject({
      guard: "not_scanned",
      sentinel: "not_monitored",
      findings: [],
      incidents: [],
    });
    expect(
      await UnavailableCanvasOverlaySource.getTrustVerification("real"),
    ).toMatchObject({ status: "not_tested", observations: [] });
  });
  it("snapshot source checks requested revision and scope", async () => {
    const source = SnapshotCanvasSource(memorySnapshot({}));
    await expect(source.loadGraph({ projectRef: "wrong" })).rejects.toThrow();
    await expect(
      source.loadGraph({ projectRef: "internal/example", revision: "wrong" }),
    ).rejects.toThrow();
  });
  it("failed overlays keep the graph usable; stale and partial statuses survive", async () => {
    const overlays = demoOverlaySource(initialState());
    const failed = {
      ...overlays,
      async getSecurity() {
        throw new Error("private error");
      },
    };
    const result = await loadCanvas(DemoCanvasSource, demoProjectRef, failed);
    expect(result.graph.nodes).toHaveLength(8);
    expect(result.security.guard).toBe("failed");
    for (const status of ["stale", "partial", "failed"] as const) {
      const security = await overlays.getSecurity(demoProjectRef);
      expect(
        scopeSecurity(demoGraph, { ...security, guard: status }).guard,
      ).toBe(status);
    }
  });
  it("memory persistence is project scoped and clone safe; browser persistence rejects private projects", async () => {
    const store = new MemoryCanvasPersistence();
    const overlay = emptyOverlay("private");
    overlay.annotations.note = "local";
    await store.save("private", overlay);
    overlay.annotations.note = "mutated";
    expect((await store.load("private"))?.annotations.note).toBe("local");
    expect(await store.load("other")).toBeNull();
    await store.reset("private");
    expect(await store.load("private")).toBeNull();
    await expect(
      new DemoCanvasPersistence().save("private", overlay),
    ).rejects.toThrow("demo-only");
  });
});
describe("Trust and workflow plans", () => {
  it("expected policy edits require known roles/resources and never imply observation", () => {
    const policy = {
      ...demoTrust.policies[0],
      ownership: "owner only",
      confirmed: true,
    };
    const model = updatePolicy(demoTrust, policy);
    expect(model.policies.find((p) => p.id === policy.id)?.confirmed).toBe(
      true,
    );
    expect(observedPolicy(policy.id)).toBe("Not tested");
    expect(() =>
      updatePolicy(demoTrust, { ...policy, roleId: "missing" }),
    ).toThrow();
    const plan = trustTestPlan("private", model);
    expect(plan.status).toBe("not_executed");
    expect(plan.cases.every((c) => c.observed === "not_tested")).toBe(true);
  });
  it("only explicitly simulated fixture observations get a simulated label", async () => {
    const result =
      await demoOverlaySource(initialState()).getTrustVerification(
        demoProjectRef,
      );
    expect(observedPolicy("customer-read", result)).toMatch(/^Simulated/);
    expect(observedPolicy("missing", result)).toBe("Not tested");
  });
  it.each(templateNames)(
    "%s exports a deterministic unexecuted plan with invariants",
    (name) => {
      const model = workflowTemplate(templateNames.indexOf(name), "w");
      const plan = workflowTestPlan("private", model);
      expect(workflowTestPlan("private", model)).toEqual(plan);
      expect(plan.status).toBe("not_executed");
      const forbidden = plan.cases.find((c) => c.forbidden)!;
      expect(forbidden.expectedState).toBe(forbidden.from);
      expect(forbidden.expectedHttp).toBe(403);
      expect(plan.invariants.length).toBeGreaterThan(0);
      expect(plan.protectedFields.length).toBeGreaterThan(0);
    },
  );
  it("removing a state reconciles transitions; bad transitions are rejected", () => {
    const model = workflowTemplate(0, "w");
    expect(
      removeState(model, "locked").transitions.some(
        (t) => t.from === "locked" || t.to === "locked",
      ),
    ).toBe(false);
    model.transitions[0].to = "missing";
    expect(() => workflowTestPlan("private", model)).toThrow();
  });
});
describe("Model trust boundaries and sanitized export", () => {
  it("accepts only internal Guard/Sentinel action links and fails malformed overlay responses", async () => {
    for (const href of [
      "javascript:alert(1)",
      "https://outside.example",
      "//outside.example",
      "/app/../secret",
    ])
      expect(safeActionHref(href)).toBeUndefined();
    expect(
      safeActionHref("/app/projects/orderly-demo/guard/findings/FIND-102"),
    ).toBeDefined();
    const source = demoOverlaySource(initialState());
    const bad = {
      ...source,
      async getSecurity() {
        return {
          ...(await source.getSecurity(demoProjectRef)),
          findings: null,
        } as never;
      },
    };
    expect(
      (await loadCanvas(DemoCanvasSource, demoProjectRef, bad)).security.guard,
    ).toBe("failed");
  });
  it("validates schema, scope, positions, model references and import limits", () => {
    const overlay = emptyOverlay("private");
    expect(parseOverlayJSON(JSON.stringify(overlay), "private")).toEqual(
      overlay,
    );
    expect(() => validateOverlay(overlay, "other")).toThrow();
    expect(() => parseOverlayJSON("a".repeat(2_000_001), "private")).toThrow();
    expect(() => parseOverlayJSON("{broken", "private")).toThrow();
    expect(() =>
      validateOverlay({ ...overlay, schemaVersion: 8 }, "private"),
    ).toThrow();
    expect(() =>
      validateOverlay(
        { ...overlay, nodePositions: { x: { x: Infinity, y: 0 } } },
        "private",
      ),
    ).toThrow();
    expect(() =>
      validateOverlay(
        JSON.parse(
          JSON.stringify(overlay).replace(
            '"annotations":{}',
            '"annotations":{"__proto__":"bad"}',
          ),
        ),
        "private",
      ),
    ).toThrow();
    const model = workflowTemplate(0, "w");
    model.transitions[0].from = "missing";
    expect(() =>
      validateOverlay({ ...overlay, workflowModels: [model] }, "private"),
    ).toThrow();
  });
  it("rejects invalid graph dates, origins, secret paths and binary-like summaries", () => {
    expect(() =>
      validateGraph({ ...demoGraph, generatedAt: "yesterday" }),
    ).toThrow();
    const graph = structuredClone(demoGraph);
    graph.evidence[0].sourcePath = ".env";
    expect(() => validateGraph(graph)).toThrow();
    graph.evidence[0].sourcePath = "src/test.ts";
    graph.evidence[0].summary = "bad\0";
    expect(() => validateGraph(graph)).toThrow();
  });
  it("export omits raw source, private credentials, arbitrary metadata and security overlays", () => {
    const graph = structuredClone(demoGraph);
    graph.nodes[0].metadata = {
      rawSource: "PRIVATE_SOURCE",
      token: "PRIVATE_TOKEN",
    };
    const overlay = emptyOverlay(graph.projectRef);
    overlay.annotations.x = "token=PRIVATE_TOKEN ghp_abcdef123";
    const result = JSON.stringify(architectureExport(graph, overlay));
    expect(result).not.toContain("PRIVATE_SOURCE");
    expect(result).not.toContain("PRIVATE_TOKEN");
    expect(result).not.toContain("ghp_abcdef123");
    expect(result).not.toContain('"findings"');
    expect(result).toContain("Partial coverage");
    expect(readableSummary(graph)).toContain("security are unverified");
  });
});
