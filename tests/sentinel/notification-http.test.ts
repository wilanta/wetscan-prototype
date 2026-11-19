import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../src/features/sentinel/server/telemetry-runtime", () => ({ telemetryStore: vi.fn() }));
vi.mock("../../src/features/canvas/server/github-reader", () => ({
  canvasIdentity: vi.fn(),
  workspaceScope: () => "github-user-7:fixture",
}));
vi.mock("../../src/features/sentinel/server/project-context", () => ({ authorizeSentinelProject: vi.fn() }));
vi.mock("../../src/lib/auth/http", async () => {
  const { AuthError } = await import("../../src/lib/auth/config");
  return {
    requireOrigin: (r: Request) => {
      if (r.headers.get("origin") !== "http://localhost:3000") throw new AuthError("invalid_origin", 403);
    },
  };
});
import { NextRequest } from "next/server";
import { notificationRoute } from "../../src/features/sentinel/server/notification-http";
import { canvasIdentity } from "../../src/features/canvas/server/github-reader";
import { authorizeSentinelProject } from "../../src/features/sentinel/server/project-context";
import { telemetryStore } from "../../src/features/sentinel/server/telemetry-runtime";
import { AuthError } from "../../src/lib/auth/config";
import { NotificationStore } from "../../src/features/sentinel/notifications/store";
import { PlatformDatabase } from "../../src/platform/database";
import { RecordingClient, fakePool } from "../platform/helpers";
import { context } from "./incident-fixtures";

const key = "a".repeat(64);
const uid = "22222222-2222-4222-8222-222222222222";
function req(q = "", body?: unknown, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/sentinel/projects/github-123/notifications" + q, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json", origin } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(canvasIdentity).mockReset().mockResolvedValue({ profile: { githubId: 7 } } as never);
  vi.mocked(authorizeSentinelProject).mockReset().mockResolvedValue(context);
  vi.mocked(telemetryStore).mockReset().mockResolvedValue({ db: new PlatformDatabase(fakePool(new RecordingClient())) } as never);
});

describe("S06 Notifications API: authentication, demo isolation and strict wire", () => {
  it.each([401, 403, 404])("denies auth status %i before storage", async (status) => {
    vi.mocked(canvasIdentity).mockRejectedValueOnce(new AuthError(status === 401 ? "unauthenticated" : ("project_not_found" as never), status));
    expect((await notificationRoute(req(), "github-123")).status).toBe(status === 401 ? 401 : 404);
    expect(telemetryStore).not.toHaveBeenCalled();
  });
  it("orderly-demo and malformed project ids never reach auth or storage (A6: demo cannot touch live notifications)", async () => {
    for (const id of ["orderly-demo", "github-0", "github-1/../x", "demo"]) expect((await notificationRoute(req(), id)).status).toBe(404);
    expect(authorizeSentinelProject).not.toHaveBeenCalled();
    expect(telemetryStore).not.toHaveBeenCalled();
  });
  it("same-origin is enforced on POST before authority or storage", async () => {
    const r = await notificationRoute(req("", { action: "test", channel: "telegram", idempotencyKey: key }, "https://evil.test"), "github-123");
    expect(r.status).toBe(403);
    expect(authorizeSentinelProject).not.toHaveBeenCalled();
  });
  it("body scope, recipient, secret and free-text fields are rejected at the store boundary; query on POST is rejected", async () => {
    const spy = vi.spyOn(NotificationStore.prototype, "command");
    for (const body of [
      { action: "save_channel", channel: "telegram", workspaceId: "x" },
      { action: "save_channel", channel: "telegram", botToken: "123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
      { action: "test", channel: "telegram", idempotencyKey: key, text: "hello", chatId: "1" },
      { action: "send", channel: "telegram", text: "x" },
      { action: "retry", deliveryId: "not-a-uuid", idempotencyKey: key },
      { action: "test", channel: "sms", idempotencyKey: key },
      { action: "test", channel: "telegram", idempotencyKey: "short" },
    ])
      expect((await notificationRoute(req("", body), "github-123")).status).toBe(400);
    const q = await notificationRoute(
      new NextRequest("http://localhost:3000/api/sentinel/projects/github-123/notifications?x=1", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: "{}",
      }),
      "github-123",
    );
    expect(q.status).toBe(400);
    expect(spy).toHaveBeenCalledTimes(7);
  });
  it("GET rejects unknown/duplicate query keys and views", async () => {
    for (const q of ["?x=1", "?view=nope", "?view=channels&view=deliveries", "?view=deliveries&x=1"])
      expect((await notificationRoute(req(q), "github-123")).status).toBe(400);
  });
  it("channels/deliveries use the server-derived scope only and never expose destinations or secrets", async () => {
    const channels = vi.spyOn(NotificationStore.prototype, "channels").mockResolvedValue([]);
    const deliveries = vi.spyOn(NotificationStore.prototype, "deliveries").mockResolvedValue([]);
    expect(await (await notificationRoute(req(), "github-123")).json()).toEqual({ channels: [] });
    expect(await (await notificationRoute(req("?view=deliveries"), "github-123")).json()).toEqual({ deliveries: [] });
    expect(channels).toHaveBeenCalledWith(context);
    expect(deliveries).toHaveBeenCalledWith(context);
    expect(vi.mocked(authorizeSentinelProject).mock.calls[0][1]).toEqual({ mode: "live", workspaceId: "github-user-7:fixture", projectId: "github-123" });
  });
  it("missing tables report NOT_CONFIGURED (503), never a fake empty list", async () => {
    vi.spyOn(NotificationStore.prototype, "channels").mockRejectedValueOnce(Object.assign(new Error("x"), { code: "42P01" }));
    const r = await notificationRoute(req(), "github-123");
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "notifications_not_configured" });
  });
  it("accepts a well-formed command and passes the authorized context (not body data) to the store", async () => {
    const spy = vi.spyOn(NotificationStore.prototype, "command").mockResolvedValue({ deliveryId: uid, duplicate: false });
    const r = await notificationRoute(req("", { action: "test", channel: "telegram", idempotencyKey: key }), "github-123");
    expect(r.status).toBe(200);
    expect(spy.mock.calls[0][0]).toBe(context);
  });
});
