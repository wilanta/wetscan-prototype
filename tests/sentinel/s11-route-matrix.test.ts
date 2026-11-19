import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * S11 cross-route security matrix: drives the REAL App Router route modules (not the inner handlers) with the
 * same negative cases for every project-scoped Sentinel API, so a newly added route that skips authentication,
 * origin checks, project-ID validation or error shaping is caught by one table instead of per-module tests.
 */
vi.mock("server-only", () => ({}));
vi.mock("../../src/features/sentinel/server/telemetry-runtime", () => ({
  telemetryStore: vi.fn(),
}));
vi.mock("../../src/features/canvas/server/github-reader", () => ({
  canvasIdentity: vi.fn(),
  workspaceScope: () => "github-user-7:fixture",
  authorizeCanvasProject: vi.fn(),
}));
vi.mock("../../src/features/sentinel/server/project-context", () => ({
  authorizeSentinelProject: vi.fn(),
}));

import { NextRequest } from "next/server";
import { AuthError } from "../../src/lib/auth/config";
import { canvasIdentity } from "../../src/features/canvas/server/github-reader";
import { authorizeSentinelProject } from "../../src/features/sentinel/server/project-context";
import { telemetryStore } from "../../src/features/sentinel/server/telemetry-runtime";
import { PlatformDatabase } from "../../src/platform/database";
import { TelemetryStore } from "../../src/features/sentinel/telemetry/store";
import { RecordingClient, fakePool } from "../platform/helpers";
import * as alerts from "@/app/api/sentinel/projects/[projectId]/alerts/route";
import * as canvas from "@/app/api/sentinel/projects/[projectId]/canvas/route";
import * as events from "@/app/api/sentinel/projects/[projectId]/events/route";
import * as external from "@/app/api/sentinel/projects/[projectId]/external/route";
import * as ghost from "@/app/api/sentinel/projects/[projectId]/ghost/route";
import * as incidents from "@/app/api/sentinel/projects/[projectId]/incidents/route";
import * as intelligence from "@/app/api/sentinel/projects/[projectId]/intelligence/route";
import * as notifications from "@/app/api/sentinel/projects/[projectId]/notifications/route";
import * as report from "@/app/api/sentinel/projects/[projectId]/report/route";
import * as responses from "@/app/api/sentinel/projects/[projectId]/responses/route";
import * as rules from "@/app/api/sentinel/projects/[projectId]/rules/route";
import * as sources from "@/app/api/sentinel/projects/[projectId]/sources/route";

type Handler = (
  r: NextRequest,
  c: { params: Promise<{ projectId: string }> },
) => Promise<Response>;
interface Route {
  name: string;
  mod: Partial<Record<"GET" | "POST", Handler>>;
  query?: string;
}
const ROUTES: Route[] = [
  { name: "alerts", mod: alerts as never },
  {
    name: "canvas",
    mod: canvas as never,
    query: `?revision=${"a".repeat(40)}`,
  },
  { name: "events", mod: events as never },
  { name: "external", mod: external as never },
  { name: "ghost", mod: ghost as never },
  { name: "incidents", mod: incidents as never },
  { name: "intelligence", mod: intelligence as never },
  { name: "notifications", mod: notifications as never },
  { name: "report", mod: report as never },
  { name: "responses", mod: responses as never },
  { name: "rules", mod: rules as never },
  { name: "sources", mod: sources as never },
];
const ORIGIN = "http://localhost:3000";
const call = (
  route: Route,
  method: "GET" | "POST",
  projectId: string,
  init: { origin?: string; site?: string; query?: string; body?: string } = {},
) => {
  const headers: Record<string, string> = {};
  if (method === "POST") {
    headers["content-type"] = "application/json";
    headers.origin = init.origin ?? ORIGIN;
    if (init.site) headers["sec-fetch-site"] = init.site;
  }
  const request = new NextRequest(
    `${ORIGIN}/api/sentinel/projects/${encodeURIComponent(projectId)}/${route.name}${init.query ?? (method === "GET" ? (route.query ?? "") : "")}`,
    {
      method,
      headers,
      body: method === "POST" ? (init.body ?? "{}") : undefined,
    },
  );
  return route.mod[method]!(request, {
    params: Promise.resolve({ projectId }),
  });
};
const cases = ROUTES.flatMap((route) =>
  (["GET", "POST"] as const)
    .filter((m) => route.mod[m])
    .map((m) => [`${route.name} ${m}`, route, m] as const),
);

beforeAll(() => {
  process.env.APP_URL = ORIGIN;
  process.env.AUTH_SECRET = "s".repeat(40);
  process.env.AUTH_DATA_DIR = join(tmpdir(), "wetscan-s11-route-matrix");
});
beforeEach(() => {
  vi.mocked(canvasIdentity)
    .mockReset()
    .mockResolvedValue({ profile: { githubId: 7 } } as never);
  vi.mocked(authorizeSentinelProject).mockReset();
  vi.mocked(telemetryStore).mockReset();
});

describe("S11 route inventory", () => {
  it("covers every project-scoped Sentinel route directory (a new route must join the matrix)", () => {
    const base = join(
      __dirname,
      "../../src/app/api/sentinel/projects/[projectId]",
    );
    const dirs = readdirSync(base).filter((d) =>
      existsSync(join(base, d, "route.ts")),
    );
    expect(dirs.sort()).toEqual(ROUTES.map((r) => r.name).sort());
  });
});

describe.each(cases)("S11 route matrix: %s", (_n, route, method) => {
  it.each([
    "orderly-demo",
    "demo",
    "github-0",
    "github-01",
    "github-1/../x",
    "github-1234567890123456789",
    "GITHUB-1",
    "github-1%00",
  ])(
    "malformed/demo project id %j is 404 before identity or storage",
    async (id) => {
      const res = await call(route, method, id);
      expect(res.status).toBe(404);
      expect(canvasIdentity).not.toHaveBeenCalled();
      expect(telemetryStore).not.toHaveBeenCalled();
    },
  );

  it("unauthenticated is 401 and never reaches storage", async () => {
    vi.mocked(canvasIdentity).mockRejectedValue(
      new AuthError("unauthenticated", 401),
    );
    const res = await call(route, method, "github-123");
    expect(res.status).toBe(401);
    expect(telemetryStore).not.toHaveBeenCalled();
    expect(authorizeSentinelProject).not.toHaveBeenCalled();
  });

  it.each([403, 404])(
    "a project the session does not own (%i) is indistinguishable 404 not_found",
    async (status) => {
      vi.mocked(authorizeSentinelProject).mockRejectedValue(
        new AuthError("project_not_found", status),
      );
      const res = await call(route, method, "github-123");
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_found" });
      expect(telemetryStore).not.toHaveBeenCalled();
    },
  );

  it("responses are never cacheable and never sniffable", async () => {
    vi.mocked(canvasIdentity).mockRejectedValue(
      new AuthError("unauthenticated", 401),
    );
    const res = await call(route, method, "github-123");
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("a storage failure is a generic 503 that leaks no connection detail", async () => {
    vi.mocked(authorizeSentinelProject).mockResolvedValue({
      scope: {
        mode: "live",
        workspaceId: "github-user-7:fixture",
        projectId: "github-123",
      },
      actorId: "github-user-7",
      repositoryId: "123",
      canvasProjectRef: "github-user-7/github-123",
    });
    vi.mocked(telemetryStore).mockRejectedValue(
      new Error("password=hunter2 host=10.0.0.5 SELECT * FROM sentinel.x"),
    );
    // POST bodies are validated before storage; a syntactically valid empty command may be rejected as 4xx.
    const res = await call(route, method, "github-123");
    const text = await res.text();
    expect(text).not.toMatch(/hunter2|10\.0\.0\.5|SELECT|stack/i);
    expect(res.status).not.toBe(200);
    expect(res.status).toBeLessThan(600);
  });
});

describe.each(cases.filter(([, , m]) => m === "POST"))(
  "S11 CSRF/origin: %s",
  (_n, route) => {
    it.each([
      ["foreign origin", { origin: "https://evil.example" }],
      ["null origin", { origin: "null" }],
      ["cross-site fetch metadata", { site: "cross-site" }],
    ])(
      "%s is 403 before identity, storage or body parsing",
      async (_l, init) => {
        const res = await call(route, "POST", "github-123", init);
        expect(res.status).toBe(403);
        expect(canvasIdentity).not.toHaveBeenCalled();
        expect(telemetryStore).not.toHaveBeenCalled();
      },
    );
  },
);

describe("S11 verb and query hardening", () => {
  it.each(cases.filter(([, , m]) => m === "GET"))(
    "%s rejects an unknown query parameter with a 4xx and never reaches storage",
    async (_n, route) => {
      vi.mocked(authorizeSentinelProject).mockResolvedValue({
        scope: {
          mode: "live",
          workspaceId: "github-user-7:fixture",
          projectId: "github-123",
        },
        actorId: "github-user-7",
        repositoryId: "123",
        canvasProjectRef: "github-user-7/github-123",
      });
      const client = new RecordingClient();
      vi.mocked(telemetryStore).mockResolvedValue(
        new TelemetryStore(new PlatformDatabase(fakePool(client))),
      );
      // `events` and `incidents` accept filters; an unknown key must still be refused by their strict parsers.
      const res = await call(route, "GET", "github-123", {
        query: "?s11_unknown_param=1",
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(client.calls).toEqual([]);
    },
  );

  it("exports only GET/POST (Next answers any other verb with 405)", () => {
    for (const r of ROUTES)
      expect(
        Object.keys(r.mod).filter((k) =>
          ["PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(k),
        ),
      ).toEqual([]);
  });
});
