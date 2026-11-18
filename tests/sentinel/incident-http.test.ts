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
import { incidentRoute } from "../../src/features/sentinel/server/incident-http";
import { canvasIdentity } from "../../src/features/canvas/server/github-reader";
import { authorizeSentinelProject } from "../../src/features/sentinel/server/project-context";
import { telemetryStore } from "../../src/features/sentinel/server/telemetry-runtime";
import { AuthError } from "../../src/lib/auth/config";
import { IncidentStore } from "../../src/features/sentinel/incidents/store";
import { PlatformDatabase } from "../../src/platform/database";
import { RecordingClient, fakePool } from "../platform/helpers";
import {
  context,
  event,
  incidentFixture,
  incidentId,
  timelineFixture,
} from "./incident-fixtures";

function req(
  queryOrPath = "",
  body?: unknown,
  origin = "http://localhost:3000",
  method = body ? "POST" : "GET",
) {
  return new NextRequest(
    "http://localhost:3000/api/sentinel/projects/github-123/incidents" +
      queryOrPath,
    {
      method,
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

describe("S04 HTTP incident authentication and strict wire boundaries - authority/storage doubles", () => {
  it.each([401, 403, 404])(
    "denies auth status %i before storage, masking project existence",
    async (status) => {
      vi.mocked(canvasIdentity).mockRejectedValueOnce(
        new AuthError(
          status === 401 ? "unauthenticated" : ("project_not_found" as never),
          status,
        ),
      );
      const r = await incidentRoute(req(), "github-123");
      expect(r.status).toBe(status === 401 ? 401 : 404);
      expect(telemetryStore).not.toHaveBeenCalled();
    },
  );

  it("rejects orderly-demo and invalid project IDs with 404 without Demo fallback", async () => {
    expect((await incidentRoute(req(), "orderly-demo")).status).toBe(404);
    expect((await incidentRoute(req(), "github-0")).status).toBe(404);
    expect(authorizeSentinelProject).not.toHaveBeenCalled();
  });

  it("enforces same-origin protection on POST commands before authority or storage calls", async () => {
    const r = await incidentRoute(
      req(
        "",
        { action: "investigate", incidentId, expectedRevision: 1 },
        "https://evil.test",
      ),
      "github-123",
    );
    expect(r.status).toBe(403);
    expect(authorizeSentinelProject).not.toHaveBeenCalled();
    expect(telemetryStore).not.toHaveBeenCalled();
  });

  it("lists incidents and reads full detail, timeline, alerts and redacted evidence subviews", async () => {
    const list = vi
      .spyOn(IncidentStore.prototype, "incidents")
      .mockResolvedValue({
        items: [incidentFixture()],
        nextCursor: null,
        window: { from: "2026-11-15T00:00:00Z", to: "2026-11-15T00:10:00Z" },
      });
    const detail = vi
      .spyOn(IncidentStore.prototype, "incidentDetails")
      .mockResolvedValue({
        incident: incidentFixture(),
        alerts: [],
        evidence: [event(1)],
        timeline: timelineFixture(),
      });

    const rList = await incidentRoute(req("?status=open"), "github-123");
    expect(rList.status).toBe(200);
    expect(list).toHaveBeenCalledOnce();

    const rFull = await incidentRoute(
      req("?incidentId=" + incidentId),
      "github-123",
    );
    expect(rFull.status).toBe(200);
    expect(await rFull.json()).toHaveProperty("incident.incidentId", incidentId);

    const rTimeline = await incidentRoute(
      req(`?incidentId=${incidentId}&view=timeline`),
      "github-123",
    );
    expect(rTimeline.status).toBe(200);
    expect(await rTimeline.json()).toEqual({
      incidentId,
      timeline: timelineFixture(),
    });

    const rEvidence = await incidentRoute(
      req(`?incidentId=${incidentId}&view=evidence`),
      "github-123",
    );
    expect(rEvidence.status).toBe(200);
    expect(await rEvidence.json()).toEqual({
      incidentId,
      evidence: [event(1)],
    });
    expect(detail).toHaveBeenCalledTimes(3);
  });

  it("executes validated status transitions and close commands with expectedRevision", async () => {
    const cmd = vi.spyOn(IncidentStore.prototype, "command").mockResolvedValue({
      incidentId,
      status: "closed",
      revision: 2,
      verificationStatus: "not_requested",
      timelineId: "00000000-0000-5000-a000-000000000099",
    });
    const r = await incidentRoute(
      req("", {
        action: "close",
        incidentId,
        expectedRevision: 1,
        reason: "Verified controlled test batch completion.",
      }),
      "github-123",
    );
    expect(r.status).toBe(200);
    expect(cmd).toHaveBeenCalledWith(context, {
      action: "close",
      incidentId,
      expectedRevision: 1,
      reason: "Verified controlled test batch completion.",
    });
  });

  it.each([
    {
      action: "investigate",
      incidentId,
      expectedRevision: 1,
      workspaceId: "override",
    },
    {
      action: "close",
      incidentId,
      expectedRevision: 1,
      reason: "ok",
    },
    {
      action: "mitigate",
      incidentId,
      expectedRevision: 1,
    },
  ])("rejects invalid or unknown command payload %j with 400", async (body) => {
    const r = await incidentRoute(req("", body), "github-123");
    expect(r.status).toBe(400);
  });

  it.each([
    "?incidentId=not-a-uuid",
    `?incidentId=${incidentId}&view=invalid`,
    `?incidentId=${incidentId}&status=open`,
  ])("rejects malformed detail query %s with 400", async (query) => {
    const r = await incidentRoute(req(query), "github-123");
    expect(r.status).toBe(400);
  });

  it("caps request body size at 8 KiB and rejects unsupported HTTP methods", async () => {
    const big = await incidentRoute(
      req("", {
        action: "investigate",
        incidentId,
        expectedRevision: 1,
        note: "x".repeat(9000),
      }),
      "github-123",
    );
    expect(big.status).toBe(413);
    const del = await incidentRoute(
      req("", undefined, "http://localhost:3000", "DELETE"),
      "github-123",
    );
    expect(del.status).toBe(405);
  });

  it("never leaks internal database errors or driver details", async () => {
    vi.mocked(telemetryStore).mockRejectedValueOnce(
      new Error("sensitive postgres connection error"),
    );
    const r = await incidentRoute(req(), "github-123");
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("sensitive");
  });
});
