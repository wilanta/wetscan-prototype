import { afterEach, describe, expect, it, vi } from "vitest";
import { sentinelOverlaySource } from "../../src/features/canvas/adapters/sentinel-overlay";
import { loadCanvas } from "../../src/features/canvas/service";
import type { SecurityOverlay } from "../../src/features/canvas/types";

const REV = "e".repeat(40);
const REF = "github-user-7/github-123";
const overlay = (over: Partial<SecurityOverlay> = {}): SecurityOverlay => ({
  projectRef: REF,
  mode: "live",
  guard: "not_scanned",
  sentinel: "available",
  findings: [],
  incidents: [],
  message: "ok",
  sentinelDetail: {
    sourceRevision: REV,
    generatedAt: "2026-11-19T00:00:00Z",
    sources: { total: 1, connected: 1, runtimeConnected: 1 },
    mappedCount: 0,
    unmapped: [],
    unmappedCount: 0,
    truncated: false,
  },
  ...over,
});
const respond = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
afterEach(() => vi.unstubAllGlobals());

describe("CAN-008 client overlay source", () => {
  it("returns a validated overlay pinned to the displayed revision", async () => {
    respond(200, overlay());
    const o = await sentinelOverlaySource("github-123", REV).getSecurity(REF);
    expect(o.sentinel).toBe("available");
    expect(fetch).toHaveBeenCalledWith(
      `/api/sentinel/projects/github-123/canvas?revision=${REV}`,
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
  });
  it.each([
    [
      "a different revision (stale mapping)",
      overlay({
        sentinelDetail: {
          ...overlay().sentinelDetail!,
          sourceRevision: "f".repeat(40),
        },
      }),
    ],
    ["another project", overlay({ projectRef: "github-user-7/github-999" })],
    ["a demo overlay", overlay({ mode: "demo" })],
    [
      "an overlay without revision detail",
      overlay({ sentinelDetail: undefined }),
    ],
  ])("rejects %s", async (_n, value) => {
    respond(200, value);
    await expect(
      sentinelOverlaySource("github-123", REV).getSecurity(REF),
    ).rejects.toThrow();
  });
  it("treats unconfigured storage as not_monitored with no incidents", async () => {
    respond(503, { error: "telemetry_not_configured" });
    const o = await sentinelOverlaySource("github-123", REV).getSecurity(REF);
    expect(o).toMatchObject({ sentinel: "not_monitored", incidents: [] });
    expect(o.message).toMatch(/not configured/);
  });
  it.each([
    [503, { error: "telemetry_unavailable" }],
    [404, { error: "not_found" }],
    [409, { error: "graph_unavailable" }],
    [401, { error: "unauthenticated" }],
  ])("a %i response is an error, never a green state", async (status, body) => {
    respond(status, body);
    await expect(
      sentinelOverlaySource("github-123", REV).getSecurity(REF),
    ).rejects.toThrow();
  });
  it("loadCanvas degrades an overlay error to failed coverage without hiding the graph", async () => {
    respond(503, { error: "telemetry_unavailable" });
    const graph = {
      schemaVersion: 1 as const,
      analyzerVersion: "t",
      projectRef: REF,
      mode: "live" as const,
      revision: REV,
      environment: "unknown" as const,
      generatedAt: "2026-11-19T00:00:00Z",
      nodes: [
        {
          id: "n",
          kind: "api" as const,
          label: "n",
          evidenceIds: [],
          origin: "verified" as const,
          status: "observed_in_source" as const,
        },
      ],
      edges: [],
      evidence: [],
      diagnostics: [],
      coverage: [],
    };
    const result = await loadCanvas(
      { mode: "live", loadGraph: async () => graph },
      REF,
      sentinelOverlaySource("github-123", REV),
    );
    expect(result.graph.nodes).toHaveLength(1);
    expect(result.security.sentinel).toBe("failed");
    expect(result.security.incidents).toEqual([]);
  });
});
