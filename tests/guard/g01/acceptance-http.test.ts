import { it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../../src/features/guard/live/project", () => ({
  authorizeGuardProject: vi.fn(),
}));
vi.mock("../../../worker/guard/acceptance/package", () => ({
  approvedCase: vi.fn(),
}));
vi.mock("../../../worker/guard/acceptance/actions", () => ({
  OwnerCaseActions: class {
    dispatch = dispatch;
  },
}));
const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("../../../src/lib/auth/session", () => ({
  requestToken: () => "OFFLINE_SYNTHETIC_SESSION",
}));
vi.mock("../../../src/lib/auth/http", async () => {
  const { AuthError } = await import("../../../src/lib/auth/config");
  return {
    requireOrigin: (r: Request) => {
      if (r.headers.get("origin") !== "http://localhost:3000")
        throw new AuthError("invalid_origin", 403);
    },
  };
});
import { NextRequest } from "next/server";
import { acceptanceRoute } from "../../../src/features/guard/live/acceptance-http";
import { authorizeGuardProject } from "../../../src/features/guard/live/project";
import { approvedCase } from "../../../worker/guard/acceptance/package";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import { acceptanceFixture } from "./acceptance-fixture";
const request = (body: unknown, origin = "http://localhost:3000") =>
  new NextRequest(
    "http://localhost:3000/api/guard/projects/github-123/acceptance",
    {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
beforeEach(() => {
  dispatch.mockReset();
  vi.mocked(approvedCase).mockReset();
  vi.mocked(authorizeGuardProject).mockReset();
});
it("denies foreign origin before Auth or any acceptance effects", async () => {
  const response = await acceptanceRoute(
    request({ action: "enqueue" }, "https://foreign.invalid"),
    "github-123",
  );
  expect(response.status).toBe(403);
  expect(authorized()).toBe(false);
  expect(dispatch).not.toHaveBeenCalled();
});
function authorized() {
  return vi.mocked(authorizeGuardProject).mock.calls.length > 0;
}
it("missing/expired approval refuses execution without constructor/dispatch or credential fallback", async () => {
  const f = await acceptanceFixture();
  vi.mocked(authorizeGuardProject).mockResolvedValue(await f.deps.current());
  vi.mocked(approvedCase).mockRejectedValue(
    new LiveGuardError("approval_required"),
  );
  const response = await acceptanceRoute(
    request({ caseId: "I01", packetSha256: "a".repeat(64), action: "enqueue" }),
    "github-123",
  );
  expect((await response.json()).error).toBe("approval_required");
  expect(dispatch).not.toHaveBeenCalled();
});
it("rejects another actor and unknown scanner actions; an authenticated session alone never authorizes scanner execution", async () => {
  const f = await acceptanceFixture();
  vi.mocked(authorizeGuardProject).mockResolvedValue(await f.deps.current());
  vi.mocked(approvedCase).mockResolvedValue({
    packet: {
      ...f.packet,
      binding: { ...f.binding, actorId: "github-user-9" },
    },
    approval: f.approve(),
    root: "UNUSED_OFFLINE",
  });
  expect(
    (
      await acceptanceRoute(
        request({
          caseId: "I01",
          packetSha256: "a".repeat(64),
          action: "launch_0",
        }),
        "github-123",
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await acceptanceRoute(
        request({
          caseId: "I01",
          packetSha256: "a".repeat(64),
          action: "run_scanner",
        }),
        "github-123",
      )
    ).status,
  ).toBe(400);
  expect(dispatch).not.toHaveBeenCalled();
});
it("the approved operator bridge returns only metadata and launch acknowledgement from its guarded composition", async () => {
  const f = await acceptanceFixture();
  vi.mocked(authorizeGuardProject).mockResolvedValue(await f.deps.current());
  vi.mocked(approvedCase).mockResolvedValue({
    packet: f.packet,
    approval: f.approve(),
    root: "UNUSED_OFFLINE",
  });
  dispatch.mockResolvedValue({
    scanId: f.binding.jobId,
    status: "launch_started",
    scannerExecution: "NOT_RUN",
  });
  const response = await acceptanceRoute(
    request({
      caseId: "I01",
      packetSha256: "a".repeat(64),
      action: "launch_0",
    }),
    "github-123",
  );
  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({
    scanId: f.binding.jobId,
    scannerExecution: "NOT_RUN",
  });
  expect(dispatch).toHaveBeenCalledWith("launch_0");
  expect(response.headers.get("cache-control")).toContain("no-store");
});
