import { beforeEach, describe, it, expect, vi } from "vitest";
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
import { responseRoute } from "../../src/features/sentinel/server/response-http";
import { canvasIdentity } from "../../src/features/canvas/server/github-reader";
import { authorizeSentinelProject } from "../../src/features/sentinel/server/project-context";
import { telemetryStore } from "../../src/features/sentinel/server/telemetry-runtime";
import { AuthError } from "../../src/lib/auth/config";
import {
  ResponseStore,
  ResponsePolicyDenied,
} from "../../src/features/sentinel/response/store";
import { PlatformDatabase } from "../../src/platform/database";
import { RecordingClient, fakePool } from "../platform/helpers";
import { context } from "./incident-fixtures";

const uid = "22222222-2222-4222-8222-222222222222";
const key = "a".repeat(64);
function req(q = "", body?: unknown, origin = "http://localhost:3000") {
  return new NextRequest(
    "http://localhost:3000/api/sentinel/projects/github-123/responses" + q,
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

describe("S05 Responses API: authentication and strict wire boundaries", () => {
  it.each([401, 403, 404])(
    "denies auth status %i before storage",
    async (status) => {
      vi.mocked(canvasIdentity).mockRejectedValueOnce(
        new AuthError(
          status === 401 ? "unauthenticated" : ("project_not_found" as never),
          status,
        ),
      );
      expect((await responseRoute(req(), "github-123")).status).toBe(
        status === 401 ? 401 : 404,
      );
      expect(telemetryStore).not.toHaveBeenCalled();
    },
  );
  it("rejects orderly-demo / bad ids without touching auth or storage (demo never reaches live)", async () => {
    expect((await responseRoute(req(), "orderly-demo")).status).toBe(404);
    expect((await responseRoute(req(), "github-0")).status).toBe(404);
    expect(authorizeSentinelProject).not.toHaveBeenCalled();
    expect(telemetryStore).not.toHaveBeenCalled();
  });
  it("same-origin enforced on POST before authority or storage", async () => {
    const r = await responseRoute(
      req(
        "",
        { action: "approve", actionId: uid, expectedRevision: 1 },
        "https://evil.test",
      ),
      "github-123",
    );
    expect(r.status).toBe(403);
    expect(authorizeSentinelProject).not.toHaveBeenCalled();
  });
  it("body scope/target-url fields and query on POST are rejected before any store call", async () => {
    const spy = vi.spyOn(ResponseStore.prototype, "command");
    for (const body of [
      {
        action: "propose",
        incidentId: uid,
        targetId: uid,
        ttlSeconds: 60,
        idempotencyKey: key,
        workspaceId: "x",
      },
      {
        action: "propose",
        incidentId: uid,
        targetId: uid,
        ttlSeconds: 60,
        idempotencyKey: key,
        baseUrl: "http://169.254.169.254",
      },
      { action: "apply", actionId: uid, expectedRevision: 1 },
    ]) {
      const r = await responseRoute(req("", body), "github-123");
      expect(r.status).toBe(400);
    }
    const q = await responseRoute(
      new NextRequest(
        "http://localhost:3000/api/sentinel/projects/github-123/responses?x=1",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
          },
          body: "{}",
        },
      ),
      "github-123",
    );
    expect(q.status).toBe(400);
    expect(spy).toHaveBeenCalledTimes(3); // reached the store boundary, which validated and rejected
  });
  it("GET rejects unknown/duplicate query keys and mixed views", async () => {
    for (const q of [
      "?x=1",
      "?actionId=" + uid + "&incidentId=" + uid,
      "?view=nope",
      "?view=targets&actionId=" + uid,
      "?actionId=bad",
      "?incidentId=" + uid + "&incidentId=" + uid,
    ])
      expect((await responseRoute(req(q), "github-123")).status).toBe(400);
  });
  it("lists, details and targets use the server-derived scope only", async () => {
    const list = vi
      .spyOn(ResponseStore.prototype, "list")
      .mockResolvedValue([]);
    const targets = vi
      .spyOn(ResponseStore.prototype, "targets")
      .mockResolvedValue([]);
    expect(await (await responseRoute(req(), "github-123")).json()).toEqual({
      actions: [],
    });
    expect(list).toHaveBeenCalledWith(context, undefined);
    expect(
      await (await responseRoute(req("?view=targets"), "github-123")).json(),
    ).toEqual({ targets: [] });
    expect(targets).toHaveBeenCalledWith(context);
    expect(vi.mocked(authorizeSentinelProject).mock.calls[0][1]).toEqual({
      mode: "live",
      workspaceId: "github-user-7:fixture",
      projectId: "github-123",
    });
  });
  it("policy denial returns reasons (422); missing tables report NOT_CONFIGURED (503)", async () => {
    vi.spyOn(ResponseStore.prototype, "command").mockRejectedValueOnce(
      new ResponsePolicyDenied(["target_not_configured"]),
    );
    const r = await responseRoute(
      req("", {
        action: "propose",
        incidentId: uid,
        targetId: uid,
        ttlSeconds: 60,
        idempotencyKey: key,
      }),
      "github-123",
    );
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({
      error: "policy_denied",
      reasons: ["target_not_configured"],
    });
    vi.spyOn(ResponseStore.prototype, "list").mockRejectedValueOnce(
      Object.assign(new Error("x"), { code: "42P01" }),
    );
    const n = await responseRoute(req(), "github-123");
    expect(n.status).toBe(503);
    expect(await n.json()).toEqual({ error: "response_not_configured" });
  });
});
