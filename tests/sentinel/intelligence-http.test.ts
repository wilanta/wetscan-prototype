import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

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
vi.mock("../../src/lib/auth/http", async () => {
  const { AuthError } = await import("../../src/lib/auth/config");
  return {
    requireOrigin: (r: Request) => {
      if (r.headers.get("origin") !== "http://localhost:3000")
        throw new AuthError("invalid_origin", 403);
    },
  };
});
const store = vi.hoisted(() => ({
  overview: vi.fn(),
  detail: vi.fn(),
  command: vi.fn(),
}));
vi.mock("../../src/features/sentinel/intelligence/store", () => ({
  IntelligenceStore: vi.fn(function () {
    return store;
  }),
}));

import { NextRequest } from "next/server";
import { intelligenceRoute } from "../../src/features/sentinel/server/intelligence-http";
import { canvasIdentity } from "../../src/features/canvas/server/github-reader";
import { authorizeSentinelProject } from "../../src/features/sentinel/server/project-context";
import { telemetryStore } from "../../src/features/sentinel/server/telemetry-runtime";
import { AuthError } from "../../src/lib/auth/config";
import { TelemetryError } from "../../src/features/sentinel/telemetry/validation";
import { context } from "./incident-fixtures";

function req(q = "", body?: unknown, origin = "http://localhost:3000") {
  return new NextRequest(
    "http://localhost:3000/api/sentinel/projects/github-123/intelligence" + q,
    {
      method: body ? "POST" : "GET",
      headers: body
        ? { "content-type": "application/json", origin }
        : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}

beforeEach(() => {
  vi.mocked(canvasIdentity)
    .mockReset()
    .mockResolvedValue({ profile: { githubId: 7 } } as never);
  vi.mocked(authorizeSentinelProject).mockReset().mockResolvedValue(context);
  vi.mocked(telemetryStore)
    .mockReset()
    .mockResolvedValue({ db: {} } as never);
  for (const f of Object.values(store))
    f.mockReset().mockResolvedValue({ ok: true });
});

describe("S08 Intelligence API: authentication, demo isolation, CSRF and strict wire", () => {
  it.each([401, 403, 404])(
    "denies auth status %i before storage",
    async (status) => {
      vi.mocked(canvasIdentity).mockRejectedValueOnce(
        new AuthError(
          status === 401 ? "unauthenticated" : ("project_not_found" as never),
          status,
        ),
      );
      expect((await intelligenceRoute(req(), "github-123")).status).toBe(
        status === 401 ? 401 : 404,
      );
      expect(telemetryStore).not.toHaveBeenCalled();
      expect(store.overview).not.toHaveBeenCalled();
    },
  );

  it("orderly-demo and malformed project ids fail closed before auth or storage (demo never reaches the live API)", async () => {
    for (const id of ["orderly-demo", "github-0", "github-1/../x", "demo"]) {
      expect((await intelligenceRoute(req(), id)).status).toBe(404);
      expect(
        (
          await intelligenceRoute(
            req("", { action: "archive", incidentId: randomUUID() }),
            id,
          )
        ).status,
      ).toBe(404);
    }
    expect(authorizeSentinelProject).not.toHaveBeenCalled();
    expect(telemetryStore).not.toHaveBeenCalled();
  });

  it("enforces same-origin on POST before authorization or storage", async () => {
    const r = await intelligenceRoute(
      req(
        "",
        { action: "archive", incidentId: randomUUID() },
        "https://evil.test",
      ),
      "github-123",
    );
    expect(r.status).toBe(403);
    expect(authorizeSentinelProject).not.toHaveBeenCalled();
    expect(store.command).not.toHaveBeenCalled();
  });

  it("authorizes the live project server-side and never trusts browser scope/actor fields", async () => {
    await intelligenceRoute(req(), "github-123");
    expect(authorizeSentinelProject).toHaveBeenCalledWith(undefined, {
      mode: "live",
      workspaceId: "github-user-7:fixture",
      projectId: "github-123",
    });
    for (const spoof of [
      { workspaceId: "x" },
      { projectId: "github-9" },
      { mode: "demo" },
      { actorId: "root" },
      { definition: {} },
    ]) {
      const r = await intelligenceRoute(
        req("", { action: "archive", incidentId: randomUUID(), ...spoof }),
        "github-123",
      );
      expect(r.status).toBe(400);
    }
    expect(store.command).not.toHaveBeenCalled();
    expect(
      (await intelligenceRoute(req("?workspaceId=x"), "github-123")).status,
    ).toBe(400);
    expect(
      (
        await intelligenceRoute(
          req("?x=1", { action: "archive", incidentId: randomUUID() }),
          "github-123",
        )
      ).status,
    ).toBe(400);
  });

  it("routes GET overview, filtered overview and case detail; POST commands reach the store with the server context", async () => {
    await intelligenceRoute(req("?status=reviewed&tag=a1"), "github-123");
    expect(store.overview).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ status: "reviewed", tag: "a1" }),
    );
    const id = randomUUID();
    await intelligenceRoute(req(`?caseId=${id}`), "github-123");
    expect(store.detail).toHaveBeenCalledWith(context, id);
    const body = { action: "archive", incidentId: randomUUID() };
    expect((await intelligenceRoute(req("", body), "github-123")).status).toBe(
      200,
    );
    expect(store.command).toHaveBeenCalledWith(context, body);
  });

  it("rejects unsupported methods and non-JSON bodies", async () => {
    const del = new NextRequest(
      "http://localhost:3000/api/sentinel/projects/github-123/intelligence",
      { method: "DELETE" },
    );
    expect((await intelligenceRoute(del, "github-123")).status).toBe(405);
    const text = new NextRequest(
      "http://localhost:3000/api/sentinel/projects/github-123/intelligence",
      {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          origin: "http://localhost:3000",
        },
        body: "x",
      },
    );
    expect((await intelligenceRoute(text, "github-123")).status).toBe(415);
  });

  it("maps store errors without leaking internals: conflicts, missing tables, outages", async () => {
    store.command.mockRejectedValueOnce(
      new TelemetryError("revision_conflict", 409),
    );
    const conflict = await intelligenceRoute(
      req("", {
        action: "validate",
        candidateId: randomUUID(),
        expectedRevision: 2,
      }),
      "github-123",
    );
    expect([conflict.status, await conflict.json()]).toEqual([
      409,
      { error: "revision_conflict" },
    ]);
    store.overview.mockRejectedValueOnce(
      Object.assign(
        new Error('relation "sentinel.intel_cases" does not exist'),
        { code: "42P01" },
      ),
    );
    const missing = await intelligenceRoute(req(), "github-123");
    expect([missing.status, await missing.json()]).toEqual([
      503,
      { error: "intelligence_not_configured" },
    ]);
    store.overview.mockRejectedValueOnce(
      new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2"),
    );
    const down = await intelligenceRoute(req(), "github-123");
    const text = JSON.stringify(await down.json());
    expect(down.status).toBe(503);
    expect(text).not.toMatch(/hunter2|10\.0\.0\.5|ECONNREFUSED/);
    expect(down.headers.get("cache-control")).toBe("private, no-store");
  });
});
