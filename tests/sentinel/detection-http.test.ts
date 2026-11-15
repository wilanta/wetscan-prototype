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
import { detectionRoute } from "../../src/features/sentinel/server/detection-http";
import { canvasIdentity } from "../../src/features/canvas/server/github-reader";
import { authorizeSentinelProject } from "../../src/features/sentinel/server/project-context";
import { telemetryStore } from "../../src/features/sentinel/server/telemetry-runtime";
import { AuthError } from "../../src/lib/auth/config";
import { DetectionStore } from "../../src/features/sentinel/detection/store";
import { PlatformDatabase } from "../../src/platform/database";
import { RecordingClient, fakePool } from "../platform/helpers";
import { context, rule, ruleId, alertId } from "./detection-fixtures";
function req(
  resource: string,
  body?: unknown,
  origin = "http://localhost:3000",
) {
  return new NextRequest(
    "http://localhost:3000/api/sentinel/projects/github-123/" + resource,
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
    .mockResolvedValue({ profile: { githubId: 7 } } as Awaited<
      ReturnType<typeof canvasIdentity>
    >);
  vi.mocked(authorizeSentinelProject).mockReset().mockResolvedValue(context);
  vi.mocked(telemetryStore)
    .mockReset()
    .mockResolvedValue({
      db: new PlatformDatabase(fakePool(new RecordingClient())),
    } as Awaited<ReturnType<typeof telemetryStore>>);
});
describe("S03 HTTP authentication and strict wire boundaries - authority/storage doubles", () => {
  it.each([401, 403, 404])(
    "denies auth status %i before storage, masking project existence",
    async (status) => {
      vi.mocked(canvasIdentity).mockRejectedValueOnce(
        new AuthError(
          status === 401 ? "unauthenticated" : ("project_not_found" as never),
          status,
        ),
      );
      const r = await detectionRoute(req("rules"), "github-123", "rules");
      expect(r.status).toBe(status === 401 ? 401 : 404);
      expect(telemetryStore).not.toHaveBeenCalled();
    },
  );
  it("reauthorizes every rule and alert request using actual derived scope", async () => {
    vi.spyOn(DetectionStore.prototype, "rules").mockResolvedValue([]);
    vi.spyOn(DetectionStore.prototype, "alerts").mockResolvedValue({
      items: [],
      nextCursor: null,
      window: { from: "", to: "" },
    });
    await detectionRoute(req("rules"), "github-123", "rules");
    await detectionRoute(req("alerts"), "github-123", "alerts");
    expect(authorizeSentinelProject).toHaveBeenCalledTimes(2);
    expect(authorizeSentinelProject).toHaveBeenLastCalledWith(
      undefined,
      context.scope,
    );
  });
  it("origin mismatch prevents fresh authority or storage calls", async () => {
    expect(
      (
        await detectionRoute(
          req("rules", { action: "seed" }, "https://evil.test"),
          "github-123",
          "rules",
        )
      ).status,
    ).toBe(403);
    expect(authorizeSentinelProject).not.toHaveBeenCalled();
    expect(telemetryStore).not.toHaveBeenCalled();
  });
  it.each([
    {
      action: "create",
      definition: { ...rule().definition, sql: "DROP TABLE alerts" },
    },
    { action: "enable", ruleId, expectedRevision: 1, workspaceId: "other" },
    { action: "seed", actorId: "fake" },
  ])(
    "rejects unknown/dynamic payload %j before constructing store",
    async (payload) => {
      expect(
        (await detectionRoute(req("rules", payload), "github-123", "rules"))
          .status,
      ).toBe(400);
      expect(telemetryStore).not.toHaveBeenCalled();
    },
  );
  it("creates a validated draft and forwards optimistic revision on lifecycle commands", async () => {
    const command = vi
      .spyOn(DetectionStore.prototype, "command")
      .mockResolvedValue({ ruleId, revision: 1 });
    const r = await detectionRoute(
      req("rules", { action: "create", definition: rule().definition }),
      "github-123",
      "rules",
    );
    expect(r.status).toBe(201);
    expect(r.headers.get("cache-control")).toContain("no-store");
    await detectionRoute(
      req("rules", { action: "disable", ruleId, expectedRevision: 2 }),
      "github-123",
      "rules",
    );
    expect(command).toHaveBeenLastCalledWith(context, {
      action: "disable",
      ruleId,
      expectedRevision: 2,
    });
  });
  it("reads scoped immutable history and redacted alert detail", async () => {
    const history = vi
      .spyOn(DetectionStore.prototype, "ruleDetails")
      .mockResolvedValue({
        rule: rule(),
        versions: [],
        audit: [],
        evaluations: [],
        suppressedEvidence: [],
      });
    const details = vi
      .spyOn(DetectionStore.prototype, "alertDetails")
      .mockResolvedValue(
        {} as Awaited<ReturnType<DetectionStore["alertDetails"]>>,
      );
    expect(
      (
        await detectionRoute(
          req("rules?ruleId=" + ruleId),
          "github-123",
          "rules",
        )
      ).status,
    ).toBe(200);
    expect(history).toHaveBeenCalledWith(context, ruleId);
    expect(
      (
        await detectionRoute(
          req("alerts?alertId=" + alertId),
          "github-123",
          "alerts",
        )
      ).status,
    ).toBe(200);
    expect(details).toHaveBeenCalledWith(context, alertId);
  });
  it.each([
    "rules?ruleId=bad",
    "rules?ruleId=" + ruleId + "&ruleId=" + ruleId,
    "alerts?alertId=" + alertId + "&sourceId=" + ruleId,
  ])("rejects invalid detail query %s", async (path) => {
    expect(
      (
        await detectionRoute(
          req(path),
          "github-123",
          path.startsWith("rules") ? "rules" : "alerts",
        )
      ).status,
    ).toBe(400);
    expect(telemetryStore).not.toHaveBeenCalled();
  });
  it("never exposes database messages, connection strings or stack traces", async () => {
    vi.mocked(telemetryStore).mockRejectedValueOnce(
      Error("private driver error"),
    );
    const r = await detectionRoute(req("alerts"), "github-123", "alerts");
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("private");
  });
  it("caps control payload size and rejects writes to alert queries", async () => {
    expect(
      (
        await detectionRoute(
          req("rules", { action: "create", padding: "x".repeat(8192) }),
          "github-123",
          "rules",
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await detectionRoute(
          req("alerts", { action: "seed" }),
          "github-123",
          "alerts",
        )
      ).status,
    ).toBe(405);
  });
});
