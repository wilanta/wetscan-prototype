import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../src/features/sentinel/server/telemetry-runtime", () => ({
  telemetryStore: vi.fn(),
}));
vi.mock("../../src/features/canvas/server/github-reader", () => ({
  canvasIdentity: vi.fn(),
  workspaceScope: () => "github-user-7:fixture",
}));
vi.mock("../../src/features/sentinel/server/project-context", () => ({
  authorizeSentinelProject: vi.fn(),
}));
vi.mock("../../src/features/canvas/server/project-service", () => ({
  projectCanvasService: vi.fn(),
}));

import { NextRequest } from "next/server";
import { canvasOverlayRoute } from "../../src/features/sentinel/server/canvas-overlay-http";
import { canvasIdentity } from "../../src/features/canvas/server/github-reader";
import { authorizeSentinelProject } from "../../src/features/sentinel/server/project-context";
import { projectCanvasService } from "../../src/features/canvas/server/project-service";
import { telemetryStore } from "../../src/features/sentinel/server/telemetry-runtime";
import { AuthError } from "../../src/lib/auth/config";
import { PlatformDatabase } from "../../src/platform/database";
import { RecordingClient, fakePool } from "../platform/helpers";
import { context } from "./detection-fixtures";

const REV = "c".repeat(40);
const incidentId = "11111111-1111-4111-8111-111111111111";
const sourceId = "22222222-2222-4222-8222-222222222222";
const req = (q = `?revision=${REV}`, method = "GET") =>
  new NextRequest(
    "http://localhost:3000/api/sentinel/projects/github-123/canvas" + q,
    { method },
  );
const graph = (over: Record<string, unknown> = {}) => ({
  graph: {
    schemaVersion: 1,
    analyzerVersion: "t",
    projectRef: context.canvasProjectRef,
    mode: "live",
    revision: REV,
    environment: "unknown",
    generatedAt: "2026-11-19T00:00:00Z",
    nodes: [
      {
        id: "health",
        kind: "api",
        label: "/api/health",
        evidenceIds: [],
        origin: "verified",
        status: "observed_in_source",
        metadata: { route: "/api/health", methods: "GET" },
      },
    ],
    edges: [],
    evidence: [],
    diagnostics: [],
    coverage: [],
    ...over,
  },
  repositoryName: "o/r",
  scope: "s",
});
let client: RecordingClient;
let cached: ReturnType<typeof vi.fn>;
beforeEach(() => {
  client = new RecordingClient();
  client.respond = async (sql) => {
    if (sql.includes("FROM sentinel.incident_evidence"))
      return {
        rows: [
          {
            incident_id: incidentId,
            source_id: sourceId,
            event_id: "33333333-3333-4333-8333-333333333333",
            occurred_at: "2026-11-19T00:00:00Z",
            route: "/api/health",
            method: "GET",
            origin: "runtime",
          },
        ],
        rowCount: 1,
      };
    if (sql.includes("FROM sentinel.incidents"))
      return {
        rows: [
          {
            incident_id: incidentId,
            title: "Repeated failures",
            status: "open",
            severity: "high",
            origin: "runtime",
            source_id: sourceId,
            first_observed_at: "2026-11-19T00:00:00Z",
            last_observed_at: "2026-11-19T00:01:00Z",
          },
        ],
        rowCount: 1,
      };
    return { rows: [], rowCount: 0 };
  };
  vi.mocked(canvasIdentity)
    .mockReset()
    .mockResolvedValue({ profile: { githubId: 7 } } as never);
  vi.mocked(authorizeSentinelProject).mockReset().mockResolvedValue(context);
  cached = vi.fn().mockResolvedValue(graph());
  vi.mocked(projectCanvasService)
    .mockReset()
    .mockReturnValue({ cached } as never);
  vi.mocked(telemetryStore)
    .mockReset()
    .mockResolvedValue({
      db: new PlatformDatabase(fakePool(client)),
      sources: vi
        .fn()
        .mockResolvedValue([
          { status: "connected", origin: "runtime", enabled: true },
        ]),
    } as never);
});

describe("CAN-008 overlay route", () => {
  it("returns a revision-pinned overlay with only mapped, evidence-backed incidents", async () => {
    const response = await canvasOverlayRoute(req(), "github-123");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      mode: "live",
      projectRef: "github-user-7/github-123",
      sentinel: "available",
      guard: "not_scanned",
      findings: [],
      sentinelDetail: { sourceRevision: REV, mappedCount: 1, unmappedCount: 0 },
    });
    expect(body.incidents).toHaveLength(1);
    expect(body.incidents[0]).toMatchObject({
      nodeId: "health",
      simulated: false,
      provenance: { origin: "runtime" },
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(cached).toHaveBeenCalledWith(REV);
  });
  it("scopes every query to the authorized scope", async () => {
    await canvasOverlayRoute(req(), "github-123");
    const scoped = client.calls.find((c) =>
      c.sql.includes("set_config('wetscan.workspace'"),
    )!;
    expect(scoped.values.slice(0, 3)).toEqual([
      context.scope.workspaceId,
      context.scope.projectId,
      "live",
    ]);
    const selects = client.calls.filter((c) =>
      c.sql.startsWith("SELECT incident_id"),
    );
    expect(selects[0].values.slice(0, 3)).toEqual([
      "live",
      context.scope.workspaceId,
      context.scope.projectId,
    ]);
  });
  it.each(["orderly-demo", "github-0", "github-1/../x", "demo"])(
    "denies %s with 404 before authentication or storage",
    async (id) => {
      expect((await canvasOverlayRoute(req(), id)).status).toBe(404);
      expect(canvasIdentity).not.toHaveBeenCalled();
      expect(telemetryStore).not.toHaveBeenCalled();
    },
  );
  it.each([
    "",
    "?revision=main",
    `?revision=${REV}&revision=${REV}`,
    `?revision=${REV}&projectId=github-999`,
    `?revision=${"C".repeat(40)}`,
  ])("requires exactly one lowercase 40-hex revision (%s)", async (q) => {
    expect((await canvasOverlayRoute(req(q), "github-123")).status).toBe(400);
    expect(canvasIdentity).not.toHaveBeenCalled();
  });
  it("rejects non-GET before anything else", async () => {
    expect(
      (await canvasOverlayRoute(req(undefined, "POST"), "github-123")).status,
    ).toBe(405);
  });
  it.each([401, 403, 404])(
    "denies auth status %i with no storage access",
    async (status) => {
      vi.mocked(canvasIdentity).mockRejectedValueOnce(
        new AuthError(
          status === 401 ? "unauthenticated" : ("repository_denied" as never),
          status,
        ),
      );
      expect((await canvasOverlayRoute(req(), "github-123")).status).toBe(
        status === 401 ? 401 : 404,
      );
      expect(telemetryStore).not.toHaveBeenCalled();
      expect(cached).not.toHaveBeenCalled();
    },
  );
  it("revocation between authorization and graph read fails closed with no data", async () => {
    cached.mockRejectedValueOnce(new AuthError("repository_denied", 403));
    const r = await canvasOverlayRoute(req(), "github-123");
    expect(r.status).toBe(404);
    expect(telemetryStore).not.toHaveBeenCalled();
  });
  it.each([
    ["no cached graph", null],
    ["a different revision", graph({ revision: "d".repeat(40) })],
    [
      "another project's graph",
      graph({ projectRef: "github-user-7/github-999" }),
    ],
    ["a non-live graph", graph({ mode: "snapshot" })],
  ])("returns 409 and never touches storage for %s", async (_name, value) => {
    cached.mockResolvedValueOnce(value);
    const r = await canvasOverlayRoute(req(), "github-123");
    expect(r.status).toBe(409);
    expect(telemetryStore).not.toHaveBeenCalled();
  });
  it("reports storage failure as unavailable, never as an empty green overlay", async () => {
    vi.mocked(telemetryStore).mockRejectedValueOnce(new Error("db down"));
    const r = await canvasOverlayRoute(req(), "github-123");
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "telemetry_unavailable" });
  });
  it("does not expose raw route templates, actor hashes or event payloads", async () => {
    const text = JSON.stringify(
      await (await canvasOverlayRoute(req(), "github-123")).json(),
    );
    expect(text).not.toMatch(/actorHash|attributes|authorization|cookie/i);
  });
});
