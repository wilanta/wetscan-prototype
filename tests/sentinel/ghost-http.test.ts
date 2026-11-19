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

import { NextRequest } from "next/server";
import { ghostRoute } from "../../src/features/sentinel/server/ghost-http";
import { canvasIdentity } from "../../src/features/canvas/server/github-reader";
import { authorizeSentinelProject } from "../../src/features/sentinel/server/project-context";
import { telemetryStore } from "../../src/features/sentinel/server/telemetry-runtime";
import { AuthError } from "../../src/lib/auth/config";
import { GhostStore } from "../../src/features/sentinel/ghost/store";
import { PlatformDatabase } from "../../src/platform/database";
import { RecordingClient, fakePool } from "../platform/helpers";
import { context } from "./incident-fixtures";

function req(q = "", body?: unknown, origin = "http://localhost:3000") {
  return new NextRequest(
    "http://localhost:3000/api/sentinel/projects/github-123/ghost" + q,
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
  vi.restoreAllMocks();
  vi.mocked(canvasIdentity)
    .mockReset()
    .mockResolvedValue({ profile: { githubId: 7 } } as never);
  vi.mocked(authorizeSentinelProject).mockReset().mockResolvedValue(context);
  vi.mocked(telemetryStore)
    .mockReset()
    .mockResolvedValue({
      db: new PlatformDatabase(fakePool(new RecordingClient())),
    } as never);
});

describe("S07 Ghost Lite API: authentication, demo isolation, CSRF and strict wire", () => {
  it.each([401, 403, 404])(
    "denies auth status %i before storage",
    async (status) => {
      vi.mocked(canvasIdentity).mockRejectedValueOnce(
        new AuthError(
          status === 401 ? "unauthenticated" : ("project_not_found" as never),
          status,
        ),
      );
      expect((await ghostRoute(req(), "github-123")).status).toBe(
        status === 401 ? 401 : 404,
      );
      expect(telemetryStore).not.toHaveBeenCalled();
    },
  );

  it("orderly-demo and malformed project IDs fail closed (404) before auth or storage", async () => {
    for (const id of ["orderly-demo", "github-0", "github-1/../x", "demo"]) {
      expect((await ghostRoute(req(), id)).status).toBe(404);
      expect((await ghostRoute(req("", { action: "create" }), id)).status).toBe(
        404,
      );
    }
    expect(authorizeSentinelProject).not.toHaveBeenCalled();
    expect(telemetryStore).not.toHaveBeenCalled();
  });

  it("enforces same-origin on POST before authorization or storage", async () => {
    const r = await ghostRoute(
      req(
        "",
        {
          action: "create",
          sourceId: randomUUID(),
          name: "Test",
          ownedApplicationConfirmed: true,
        },
        "https://evil.test",
      ),
      "github-123",
    );
    expect(r.status).toBe(403);
    expect(authorizeSentinelProject).not.toHaveBeenCalled();
  });

  it("rejects query parameters on GET/POST and rejects body scope/provenance spoofing", async () => {
    expect((await ghostRoute(req("?extra=1"), "github-123")).status).toBe(400);
    expect(
      (await ghostRoute(req("?extra=1", { action: "create" }), "github-123"))
        .status,
    ).toBe(400);

    const spy = vi.spyOn(GhostStore.prototype, "command");
    for (const bad of [
      { action: "create", sourceId: randomUUID(), name: "No consent" },
      {
        action: "create",
        sourceId: randomUUID(),
        name: "Spoof",
        workspaceId: "other",
        ownedApplicationConfirmed: true,
      },
      {
        action: "create",
        sourceId: randomUUID(),
        name: "Bad path",
        decoyPath: "/api/login",
        ownedApplicationConfirmed: true,
      },
      {
        action: "enable",
        decoyId: randomUUID(),
        expectedRevision: 1,
        ownedApplicationConfirmed: false,
      },
    ]) {
      expect((await ghostRoute(req("", bad), "github-123")).status).toBe(400);
    }
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it("reports NOT_CONFIGURED (503) when migration 0007 tables are absent and 409 on conflict", async () => {
    vi.spyOn(GhostStore.prototype, "overview").mockRejectedValueOnce(
      Object.assign(new Error("missing"), { code: "42P01" }),
    );
    const r = await ghostRoute(req(), "github-123");
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "ghost_not_configured" });

    vi.spyOn(GhostStore.prototype, "command").mockRejectedValueOnce(
      Object.assign(new Error("dup"), { code: "23505" }),
    );
    const r2 = await ghostRoute(
      req("", {
        action: "create",
        sourceId: randomUUID(),
        name: "Local decoy",
        ownedApplicationConfirmed: true,
      }),
      "github-123",
    );
    expect(r2.status).toBe(409);
    expect(await r2.json()).toEqual({ error: "decoy_conflict" });
  });

  it("uses server-derived scope and passes authorized context to GhostStore", async () => {
    const overview = vi
      .spyOn(GhostStore.prototype, "overview")
      .mockResolvedValue({
        decoys: [],
        sources: [],
        rule: null,
        ruleStatus: "not_seeded",
        hits: [],
        alerts: [],
        incidents: [],
        audit: [],
        falsePositivePolicy: "signal only",
        futureS08Archive: {
          available: false,
          reason: "not implemented",
          eligibleIncidentCount: 0,
        },
      });
    const r = await ghostRoute(req(), "github-123");
    expect(r.status).toBe(200);
    expect(overview).toHaveBeenCalledWith(context);
  });
});
