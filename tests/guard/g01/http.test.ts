import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../../src/features/guard/live/project", () => ({
  authorizeGuardProject: vi.fn(),
}));
vi.mock("../../../src/features/guard/live/runtime", () => ({
  guardLiveService: vi.fn(),
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
import { boundedJson, guardRoute } from "../../../src/features/guard/live/http";
import { authorizeGuardProject } from "../../../src/features/guard/live/project";
import { guardLiveService } from "../../../src/features/guard/live/runtime";
import { GuardLiveService } from "../../../src/features/guard/live/service";
import { AuthError } from "../../../src/lib/auth/config";
const authority = {
  grant: {
    mode: "live" as const,
    workspaceId: "github-user-7:fixture",
    projectId: "github-123",
    actorId: "github-user-7",
    operations: ["read", "scan"] as const,
    expiresAt: Date.now() + 60000,
  },
  repositoryId: "123",
  repositoryName: "fixture/repository",
  branch: "main",
  installationId: 9,
  userId: 7,
};
const request = (
  method = "GET",
  body?: string,
  headers: Record<string, string> = {},
) =>
  new NextRequest("http://localhost:3000/api/guard/projects/github-123/scans", {
    method,
    ...(body ? { body } : {}),
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      ...headers,
    },
  });
beforeEach(() => {
  vi.mocked(authorizeGuardProject)
    .mockReset()
    .mockResolvedValue(structuredClone(authority));
  vi.mocked(guardLiveService)
    .mockReset()
    .mockResolvedValue(new GuardLiveService(undefined));
});
it("authenticates readiness without creating a pool or claiming capabilities", async () => {
  const result = await guardRoute(request(), "github-123", "readiness");
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({
    status: "BLOCKED",
    scanAccepted: false,
    database: "approval_required",
    sandbox: "BLOCKED",
    execution: "G02_NOT_CONFIGURED",
  });
  expect(result.headers.get("cache-control")).toContain("no-store");
});
it.each([
  "readiness",
  "scans",
  "status",
  "findings",
  "evidence",
  "coverage",
  "cancel",
  "source-acceptance",
] as const)(
  "rejects unauthenticated %s before runtime activation",
  async (resource) => {
    vi.mocked(authorizeGuardProject).mockRejectedValue(
      new AuthError("unauthenticated", 401),
    );
    expect(
      (
        await guardRoute(
          request(resource === "cancel" ? "POST" : "GET"),
          "github-123",
          resource,
          "a".repeat(64),
        )
      ).status,
    ).toBe(401);
    expect(guardLiveService).not.toHaveBeenCalled();
  },
);
it("hides unrelated repository and revoked-access details", async () => {
  vi.mocked(authorizeGuardProject).mockRejectedValue(
    new AuthError("repository_denied", 403),
  );
  const result = await guardRoute(request(), "github-456", "scans");
  expect(result.status).toBe(404);
  expect(await result.json()).toEqual({ error: "not_found" });
});
it("rejects cross-origin mutations before authorization", async () => {
  const result = await guardRoute(
    request("POST", "{}", { origin: "https://foreign.example" }),
    "github-123",
    "scans",
  );
  expect(result.status).toBe(403);
  expect(authorizeGuardProject).not.toHaveBeenCalled();
});
it("returns 503 rather than accepted when queue is unconfigured", async () => {
  const result = await guardRoute(
    request(
      "POST",
      JSON.stringify({
        profile: "quick",
        engines: ["sast"],
        idempotencyKey: "request-1",
      }),
    ),
    "github-123",
    "scans",
  );
  expect(result.status).toBe(503);
  expect(await result.json()).toEqual({ error: "approval_required" });
});
it("rejects client scope/token injection and oversized/encoded bodies", async () => {
  const result = await guardRoute(
    request(
      "POST",
      JSON.stringify({
        profile: "quick",
        engines: ["sast"],
        idempotencyKey: "request-1",
        workspaceId: "other",
        token: "synthetic",
      }),
    ),
    "github-123",
    "scans",
  );
  expect(result.status).toBe(400);
  await expect(
    boundedJson(request("POST", "{}", { "content-length": "5000" })),
  ).rejects.toMatchObject({ status: 413 });
  await expect(
    boundedJson(request("POST", "{}", { "content-encoding": "gzip" })),
  ).rejects.toMatchObject({ status: 415 });
  await expect(boundedJson(request("POST", "{"))).rejects.toMatchObject({
    status: 400,
  });
});
it("never includes arbitrary driver messages in safe error response", async () => {
  const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(authorizeGuardProject).mockRejectedValue(
    new Error("synthetic-private-provider-message"),
  );
  const result = await guardRoute(request(), "github-123", "scans");
  expect(await result.text()).not.toContain("synthetic-private");
  expect(JSON.stringify(spy.mock.calls)).not.toContain("synthetic-private");
  spy.mockRestore();
});

it("blocks source acceptance without operator approval before storage activation", async () => {
  const result = await guardRoute(
    request("POST", JSON.stringify({ commit: "a".repeat(40) })),
    "github-123",
    "source-acceptance",
  );
  expect(result.status).toBe(503);
  expect(await result.json()).toEqual({ error: "approval_required" });
  expect(guardLiveService).not.toHaveBeenCalled();
});
