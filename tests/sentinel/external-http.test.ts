import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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
vi.mock("../../src/lib/auth/http", async () => {
  const { AuthError } = await import("../../src/lib/auth/config");
  return {
    requireOrigin: (r: Request) => {
      if (r.headers.get("origin") !== "http://localhost:3000")
        throw new AuthError("invalid_origin", 403);
    },
  };
});
const svc = vi.hoisted(() => ({
  overview: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  exposures: vi.fn(),
  requestSync: vi.fn(),
  inventory: { save: vi.fn() },
}));
vi.mock("../../src/features/sentinel/external/service", () => ({
  ExternalService: vi.fn(function () {
    return svc;
  }),
}));
const reader = vi.hoisted(() => ({ readRootLockfile: vi.fn() }));
vi.mock("../../src/features/sentinel/server/lockfile-reader", () => reader);

import { NextRequest } from "next/server";
import { externalRoute } from "../../src/features/sentinel/server/external-http";
import { canvasIdentity } from "../../src/features/canvas/server/github-reader";
import { authorizeSentinelProject } from "../../src/features/sentinel/server/project-context";
import { telemetryStore } from "../../src/features/sentinel/server/telemetry-runtime";
import { AuthError } from "../../src/lib/auth/config";
import { context } from "./incident-fixtures";
import { packageLock } from "./external-fixtures";

const req = (q = "", body?: unknown, origin = "http://localhost:3000") =>
  new NextRequest(
    "http://localhost:3000/api/sentinel/projects/github-123/external" + q,
    {
      method: body ? "POST" : "GET",
      headers: body
        ? { "content-type": "application/json", origin }
        : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
  );
let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.mocked(canvasIdentity)
    .mockReset()
    .mockResolvedValue({ profile: { githubId: 7 } } as never);
  vi.mocked(authorizeSentinelProject).mockReset().mockResolvedValue(context);
  vi.mocked(telemetryStore)
    .mockReset()
    .mockResolvedValue({ db: {} } as never);
  for (const f of [
    svc.overview,
    svc.list,
    svc.detail,
    svc.exposures,
    svc.requestSync,
    svc.inventory.save,
    reader.readRootLockfile,
  ])
    f.mockReset().mockResolvedValue({ ok: true });
  fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("outbound traffic is forbidden in API tests"));
});

describe("S09-A5/A6 External Intelligence API: auth, scope, CSRF and strict wire", () => {
  it.each([401, 403, 404])(
    "denies auth status %i before storage",
    async (status) => {
      vi.mocked(canvasIdentity).mockRejectedValueOnce(
        new AuthError(
          status === 401 ? "unauthenticated" : ("project_not_found" as never),
          status,
        ),
      );
      expect((await externalRoute(req(), "github-123")).status).toBe(
        status === 401 ? 401 : 404,
      );
      expect(telemetryStore).not.toHaveBeenCalled();
    },
  );
  it("orderly-demo and malformed ids never reach auth, storage or the network", async () => {
    for (const id of ["orderly-demo", "github-0", "github-1/../x"]) {
      expect((await externalRoute(req(), id)).status).toBe(404);
      expect(
        (await externalRoute(req("", { action: "sync" }), id)).status,
      ).toBe(404);
    }
    expect(authorizeSentinelProject).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("enforces same-origin on POST before authorization", async () => {
    const r = await externalRoute(
      req("", { action: "sync" }, "https://evil.test"),
      "github-123",
    );
    expect(r.status).toBe(403);
    expect(authorizeSentinelProject).not.toHaveBeenCalled();
    expect(svc.requestSync).not.toHaveBeenCalled();
  });
  it("authorizes the live project server-side and rejects forged scope, URLs and credentials", async () => {
    await externalRoute(req(), "github-123");
    expect(authorizeSentinelProject).toHaveBeenCalledWith(undefined, {
      mode: "live",
      workspaceId: "github-user-7:fixture",
      projectId: "github-123",
    });
    for (const spoof of [
      { workspaceId: "x" },
      { projectId: "github-9" },
      { mode: "demo" },
      { url: "https://evil.test" },
      { token: "x" },
      { providers: ["nvd"] },
      { providers: [] },
      { providers: "ghsa" },
    ])
      expect(
        (
          await externalRoute(
            req("", { action: "sync", ...spoof }),
            "github-123",
          )
        ).status,
      ).toBe(400);
    expect(
      (
        await externalRoute(
          req("", { action: "refresh_inventory", providers: ["osv"] }),
          "github-123",
        )
      ).status,
    ).toBe(400);
    expect(
      (await externalRoute(req("", { action: "wipe" }), "github-123")).status,
    ).toBe(400);
    for (const bad of [
      "?workspaceId=x",
      "?view=nope",
      "?provider=nvd",
      "?offset=-1",
      "?offset=99999",
      "?ecosystem=npm",
      "?q=" + "x".repeat(101),
      "?kev=0",
      "?advisoryId=%3Cx%3E",
    ])
      expect((await externalRoute(req(bad), "github-123")).status, bad).toBe(
        400,
      );
    expect(
      (await externalRoute(req("?x=1", { action: "sync" }), "github-123"))
        .status,
    ).toBe(400);
    expect(svc.requestSync).not.toHaveBeenCalled();
  });
  it("routes reads to the service with the server context and performs no outbound request", async () => {
    await externalRoute(req(), "github-123");
    expect(svc.overview).toHaveBeenCalledWith(context);
    await externalRoute(
      req(
        "?view=advisories&q=lodash&provider=ghsa&severity=high&kev=1&ecosystem=npm&package=lodash&offset=25",
      ),
      "github-123",
    );
    expect(svc.list).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "lodash",
        provider: "ghsa",
        severity: "high",
        kev: true,
        ecosystem: "npm",
        packageName: "lodash",
        offset: 25,
      }),
    );
    svc.detail.mockResolvedValueOnce({ advisory: {} });
    expect(
      (await externalRoute(req("?advisoryId=cve-2021-23337"), "github-123"))
        .status,
    ).toBe(200);
    expect(svc.detail).toHaveBeenCalledWith("CVE-2021-23337");
    svc.detail.mockResolvedValueOnce(null);
    expect(
      (await externalRoute(req("?advisoryId=CVE-2099-0001"), "github-123"))
        .status,
    ).toBe(404);
    await externalRoute(req("?view=exposures"), "github-123");
    expect(svc.exposures).toHaveBeenCalledWith(context);
    expect(fetchSpy).not.toHaveBeenCalled(); // S09-A6: rendering/reading never triggers outbound traffic
    expect(reader.readRootLockfile).not.toHaveBeenCalled();
  });
  it("queues manual sync as a worker job (202) and never fetches in the request", async () => {
    svc.requestSync.mockResolvedValueOnce({ requested: [] });
    const r = await externalRoute(
      req("", { action: "sync", providers: ["ghsa", "osv", "ghsa"] }),
      "github-123",
    );
    expect(r.status).toBe(202);
    expect(svc.requestSync).toHaveBeenCalledWith(context, ["ghsa", "osv"]);
    await externalRoute(req("", { action: "sync" }), "github-123");
    expect(svc.requestSync).toHaveBeenLastCalledWith(context, [
      "cisa_kev",
      "ghsa",
      "osv",
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("refreshes inventory from the authorized lockfile with server-derived provenance", async () => {
    reader.readRootLockfile.mockResolvedValueOnce({
      found: true,
      commitSha: "a".repeat(40),
      path: "package-lock.json",
      text: packageLock({ "node_modules/lodash": { version: "4.17.20" } }),
      sha256: "b".repeat(64),
    });
    svc.inventory.save.mockResolvedValueOnce({ snapshotId: "s" });
    const r = await externalRoute(
      req("", { action: "refresh_inventory" }),
      "github-123",
    );
    expect(r.status).toBe(200);
    expect(reader.readRootLockfile).toHaveBeenCalledWith(
      undefined,
      "github-123",
    );
    expect(svc.inventory.save).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        commitSha: "a".repeat(40),
        lockfileSha256: "b".repeat(64),
        lockfileVersion: 3,
        items: [
          {
            ecosystem: "npm",
            name: "lodash",
            version: "4.17.20",
            scope: "runtime",
          },
        ],
      }),
    );
  });
  it("reports a missing or unsupported lockfile honestly (no empty snapshot is stored)", async () => {
    reader.readRootLockfile.mockResolvedValueOnce({
      found: false,
      commitSha: "a".repeat(40),
    });
    const missing = await externalRoute(
      req("", { action: "refresh_inventory" }),
      "github-123",
    );
    expect([missing.status, (await missing.json()).error]).toEqual([
      404,
      "lockfile_not_found",
    ]);
    reader.readRootLockfile.mockResolvedValueOnce({
      found: true,
      commitSha: "a".repeat(40),
      path: "package-lock.json",
      text: JSON.stringify({ lockfileVersion: 1 }),
      sha256: "b".repeat(64),
    });
    const v1 = await externalRoute(
      req("", { action: "refresh_inventory" }),
      "github-123",
    );
    expect([v1.status, (await v1.json()).error]).toEqual([
      422,
      "unsupported_lockfile",
    ]);
    expect(svc.inventory.save).not.toHaveBeenCalled();
  });
  it("maps outages and missing tables without leaking internals", async () => {
    svc.overview.mockRejectedValueOnce(
      Object.assign(
        new Error('relation "sentinel.ext_sources" does not exist'),
        { code: "42P01" },
      ),
    );
    const missing = await externalRoute(req(), "github-123");
    expect([missing.status, await missing.json()]).toEqual([
      503,
      { error: "external_not_configured" },
    ]);
    svc.overview.mockRejectedValueOnce(
      new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2"),
    );
    const down = await externalRoute(req(), "github-123");
    expect(JSON.stringify(await down.json())).not.toMatch(
      /hunter2|10\.0\.0\.5|ECONNREFUSED/,
    );
    expect(down.status).toBe(503);
    expect(down.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("S09 architecture guards (static)", () => {
  const root = join(__dirname, "..", "..", "src", "features", "sentinel");
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  it("the web API module can reach neither the feed client nor the sync pipeline", () => {
    const http = read("server/external-http.ts") + read("external/service.ts");
    expect(http).not.toMatch(
      /external\/(feeds|sync)["']|from "\.\/(feeds|sync)"|\bfetch\(/,
    );
  });
  it("only the worker lane (and the pure normalizer) imports the feed client", () => {
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (
          /\.tsx?$/.test(e.name) &&
          /external\/(feeds|sync)["']|from "\.\/(feeds|sync)"/.test(
            readFileSync(p, "utf8"),
          )
        )
          importers.push(p.replace(root, "").replaceAll("\\", "/"));
      }
    };
    walk(root);
    expect(importers.sort()).toEqual([
      "/external/normalize.ts",
      "/external/sync.ts",
    ]);
    const worker = readFileSync(
      join(__dirname, "..", "..", "worker", "sentinel", "external-sync.ts"),
      "utf8",
    );
    expect(worker).toContain("external/feeds");
  });
  it("advisory data never touches runtime-event, alert, incident, response or notification tables", () => {
    for (const f of readdirSync(join(root, "external")).filter((x) =>
      x.endsWith(".ts"),
    )) {
      const src = readFileSync(join(root, "external", f), "utf8");
      expect(src, f).not.toMatch(
        /telemetry_events|detection_alerts|sentinel\.incidents|response_actions|notification_deliveries|intel_cases|ghost_decoys/,
      );
    }
  });
});
