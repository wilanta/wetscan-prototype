import { describe, expect, it } from "vitest";
import {
  buildSentinelOverlay,
  mapIncident,
  matchRoute,
  type OverlayIncident,
  type OverlaySourceHealth,
} from "../../src/features/sentinel/canvas/mapping";
import { validateSecurityOverlay } from "../../src/features/canvas/adapters/overlay-validation";
import { scopeSecurity } from "../../src/features/canvas/service";
import type { ArchitectureGraph } from "../../src/features/canvas/types";

const REV = "a".repeat(40);
const node = (id: string, route: string, methods = "GET, POST") => ({
  id,
  kind: "api" as const,
  label: route,
  evidenceIds: [],
  origin: "verified" as const,
  status: "observed_in_source" as const,
  metadata: { route, methods },
});
const graph = {
  schemaVersion: 1,
  analyzerVersion: "t",
  projectRef: "github-user-7/github-123",
  mode: "live",
  revision: REV,
  environment: "unknown",
  generatedAt: "2026-11-19T00:00:00Z",
  nodes: [
    node("health", "/api/health"),
    node("orders", "/api/orders/[id]"),
    node("invoices", "/api/invoices/[id]"),
    node("reports", "/api/reports/[id]"),
    node("catch", "/api/files/[...path]"),
  ],
  edges: [],
  evidence: [],
  diagnostics: [],
  coverage: [],
} satisfies ArchitectureGraph;
const incident = (
  route: string | string[] | undefined,
  over: Partial<OverlayIncident> = {},
  method = "GET",
): OverlayIncident => ({
  incidentId: "11111111-1111-4111-8111-111111111111",
  title: "Repeated failures",
  status: "open",
  severity: "high",
  origin: "runtime",
  sourceId: "22222222-2222-4222-8222-222222222222",
  firstObservedAt: "2026-11-19T00:00:00Z",
  lastObservedAt: "2026-11-19T00:01:00Z",
  evidence: (route === undefined ? [undefined] : [route].flat()).map(
    (r, i) => ({
      eventId: `33333333-3333-4333-8333-33333333333${i}`,
      sourceId: "22222222-2222-4222-8222-222222222222",
      origin: "runtime" as const,
      occurredAt: "2026-11-19T00:00:00Z",
      method,
      routeTemplate: r,
    }),
  ),
  ...over,
});
const sources = (...s: OverlaySourceHealth[]) => s;
const runtime: OverlaySourceHealth = {
  status: "connected",
  origin: "runtime",
  enabled: true,
};

describe("CAN-008 route matching", () => {
  it("matches exact static routes and reports the basis", () => {
    expect(matchRoute("/api/health", "/api/health")).toBe("route_exact");
  });
  it("matches a redacted dynamic segment but flags the weaker basis", () => {
    expect(matchRoute("/api/orders/:redacted", "/api/orders/[id]")).toBe(
      "route_redacted_segments",
    );
  });
  it("never matches when static text, depth or catch-all differ", () => {
    expect(matchRoute("/api/users", "/api/health")).toBeNull();
    expect(matchRoute("/api/health/x", "/api/health")).toBeNull();
    expect(matchRoute("/api/:redacted/x", "/api/files/[...path]")).toBeNull();
    expect(matchRoute("/api/:redacted", "/api/files/[...path]")).toBeNull();
  });
  it("a redacted segment cannot hide an allowlisted static segment", () => {
    expect(matchRoute("/api/:redacted", "/api/health")).toBeNull();
  });
});

describe("CAN-008 incident mapping", () => {
  it("maps to one node only on unambiguous route evidence", () => {
    expect(mapIncident(graph, incident("/api/health"))).toMatchObject({
      nodeId: "health",
      basis: "route_exact",
    });
  });
  it("is unmapped without route evidence", () => {
    expect(mapIncident(graph, incident(undefined))).toEqual({
      reason: "no_route_evidence",
    });
  });
  it("is unmapped when no node matches (decoy or foreign route)", () => {
    expect(mapIncident(graph, incident("/.well-known/decoy"))).toEqual({
      reason: "no_matching_node",
    });
  });
  it("is ambiguous when redaction leaves several candidate nodes", () => {
    // `orders` is allowlisted so it cannot be hidden; `invoices` and `reports` both fit.
    expect(mapIncident(graph, incident("/api/:redacted/:redacted"))).toEqual({
      reason: "ambiguous_nodes",
    });
  });
  it("is ambiguous when two non-allowlisted nodes fit one redacted route", () => {
    expect(
      mapIncident(graph, incident("/api/invoices/:redacted")),
    ).toMatchObject({ nodeId: "invoices" });
    const two = {
      nodes: [node("a", "/api/alpha/[id]"), node("b", "/api/beta/[id]")],
    };
    expect(mapIncident(two, incident("/api/:redacted/:redacted"))).toEqual({
      reason: "ambiguous_nodes",
    });
  });
  it("is ambiguous when events of one incident point at different nodes", () => {
    expect(
      mapIncident(graph, incident(["/api/health", "/api/invoices/:redacted"])),
    ).toEqual({ reason: "ambiguous_nodes" });
  });
  it("respects known HTTP methods", () => {
    expect(
      mapIncident(
        { nodes: [node("ro", "/api/ro", "GET")] },
        incident("/api/ro", {}, "DELETE"),
      ),
    ).toEqual({ reason: "no_matching_node" });
    expect(
      mapIncident(
        { nodes: [node("p", "/api/p", "unknown")] },
        incident("/api/p", {}, "DELETE"),
      ),
    ).toMatchObject({ nodeId: "p" });
  });
  it("ignores inferred and user-added nodes", () => {
    const inferred = {
      nodes: [{ ...node("x", "/api/x"), status: "inferred" as const }],
    };
    expect(mapIncident(inferred, incident("/api/x"))).toEqual({
      reason: "no_matching_node",
    });
  });
});

describe("CAN-008 overlay + coverage", () => {
  const build = (
    incidents: OverlayIncident[],
    s: OverlaySourceHealth[],
    truncated = false,
  ) =>
    buildSentinelOverlay({
      graph,
      projectRef: graph.projectRef,
      projectId: "github-123",
      now: "2026-11-19T00:02:00Z",
      incidents,
      truncated,
      sources: s,
    });
  it("reports not_monitored with no sources and never an available state", () => {
    const o = build([], []);
    expect(o.sentinel).toBe("not_monitored");
    expect(o.message).toMatch(/does not mean/);
    expect(o.incidents).toEqual([]);
  });
  it("sources that never made contact stay not_monitored", () => {
    expect(
      build(
        [],
        sources({ status: "not_configured", origin: "runtime", enabled: true }),
      ).sentinel,
    ).toBe("not_monitored");
  });
  it("stale/disconnected sources yield stale, not available", () => {
    expect(
      build([], sources({ status: "stale", origin: "runtime", enabled: true }))
        .sentinel,
    ).toBe("stale");
    expect(
      build(
        [],
        sources({ status: "disconnected", origin: "runtime", enabled: true }),
      ).sentinel,
    ).toBe("stale");
  });
  it("controlled-test-only telemetry is partial, never available", () => {
    expect(
      build(
        [],
        sources({
          status: "connected",
          origin: "controlled_test",
          enabled: true,
        }),
      ).sentinel,
    ).toBe("partial");
  });
  it("is available only with all enabled sources connected, a runtime source and nothing unmapped", () => {
    expect(build([incident("/api/health")], sources(runtime)).sentinel).toBe(
      "available",
    );
    expect(
      build(
        [incident("/api/health")],
        sources(runtime, { ...runtime, status: "stale" }),
      ).sentinel,
    ).toBe("partial");
    expect(build([incident(undefined)], sources(runtime)).sentinel).toBe(
      "partial",
    );
    expect(build([], sources(runtime), true).sentinel).toBe("partial");
  });
  it("lists unmapped incidents separately and never places them on the graph", () => {
    const o = build(
      [
        incident("/api/health"),
        incident(undefined, {
          incidentId: "44444444-4444-4444-8444-444444444444",
        }),
      ],
      sources(runtime),
    );
    expect(o.incidents).toHaveLength(1);
    expect(o.sentinelDetail).toMatchObject({
      mappedCount: 1,
      unmappedCount: 1,
    });
    expect(o.sentinelDetail!.unmapped[0].reason).toBe("no_route_evidence");
  });
  it("carries provenance and an authorized same-project link", () => {
    const o = build([incident("/api/health")], sources(runtime));
    expect(o.incidents[0]).toMatchObject({
      simulated: false,
      provenance: { origin: "runtime", mapping: { basis: "route_exact" } },
      href: "/app/projects/github-123/sentinel/incidents/11111111-1111-4111-8111-111111111111",
    });
  });
  it("passes the existing overlay validators and scope gate unchanged", () => {
    const o = build([incident("/api/health")], sources(runtime));
    expect(() => validateSecurityOverlay(o)).not.toThrow();
    const scoped = scopeSecurity(graph, o);
    expect(scoped.mode).toBe("live");
    expect(scoped.incidents).toHaveLength(1);
    expect(scoped.incidents[0].href).toBeTruthy();
  });
  it("is rejected by the scope gate for another project", () => {
    const o = {
      ...build([incident("/api/health")], sources(runtime)),
      projectRef: "github-user-7/github-999",
    };
    expect(scopeSecurity(graph, o).mode).toBe("unavailable");
  });
});
