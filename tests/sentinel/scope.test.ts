import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../src/features/canvas/server/github-reader", async (original) => ({
  ...(await original<object>()),
  authorizeCanvasProject: vi.fn(),
}));
import {
  authorizeCanvasProject,
  workspaceScope,
} from "../../src/features/canvas/server/github-reader";
import { authorizeSentinelProject } from "../../src/features/sentinel/server/project-context";
import {
  assertSameScope,
  deliveryKey,
  orderlyDemoScope,
  scopeKey,
} from "../../src/features/sentinel/scope";
import type { Profile } from "../../src/lib/auth/types";
const profile: Profile = {
  githubId: 7,
  login: "test-user",
  workspace: "Review: workspace",
  installationId: 12,
  repositories: [
    { id: 123, fullName: "test/repo", private: true, defaultBranch: "main" },
  ],
  email: "",
  securityNotifications: false,
  productUpdates: false,
  completedAt: "2026-11-14T00:00:00Z",
};
const scope = {
  workspaceId: workspaceScope(profile),
  projectId: "github-123",
  mode: "live" as const,
};
beforeEach(() => {
  vi.mocked(authorizeCanvasProject)
    .mockReset()
    .mockResolvedValue({
      profile,
      session: {
        githubId: 7,
        workspace: profile.workspace,
        expiresAt: Date.now() + 60000,
      },
      repo: { id: 123, full_name: "test/repo", default_branch: "main" },
    });
});
describe("server-derived identity mapping (authorization double)", () => {
  it("reuses Canvas authorization and its exact workspace/ref instead of a second registry", async () => {
    const value = await authorizeSentinelProject("server-session", scope);
    expect(authorizeCanvasProject).toHaveBeenCalledExactlyOnceWith(
      "server-session",
      "github-123",
    );
    expect(value).toEqual({
      scope,
      actorId: "github-user-7",
      repositoryId: "123",
      canvasProjectRef: "github-user-7/github-123",
    });
  });
  it("rejects a wrong workspace", async () => {
    await expect(
      authorizeSentinelProject("token", { ...scope, workspaceId: "other" }),
    ).rejects.toThrow("scope denied");
  });
  it("rejects a different project returned by the authority", async () => {
    await expect(
      authorizeSentinelProject("token", { ...scope, projectId: "github-456" }),
    ).rejects.toThrow("scope denied");
  });
  it.each(["demo", "browser-live"])(
    "denies mode %s before any provider lookup",
    async (mode) => {
      await expect(
        authorizeSentinelProject("token", { ...scope, mode: mode as "demo" }),
      ).rejects.toThrow();
      expect(authorizeCanvasProject).not.toHaveBeenCalled();
    },
  );
  it.each([
    "orderly-demo",
    "github-0",
    "github-00123",
    "gitlab-123",
    "github-90071992547409920",
  ])("rejects invalid route %s", async (projectId) => {
    await expect(
      authorizeSentinelProject("token", { ...scope, projectId }),
    ).rejects.toThrow();
    expect(authorizeCanvasProject).not.toHaveBeenCalled();
  });
  it.each(["repository_denied", "installation_denied", "unauthenticated"])(
    "propagates current authority denial: %s",
    async (reason) => {
      vi.mocked(authorizeCanvasProject).mockRejectedValueOnce(
        new Error(reason),
      );
      await expect(authorizeSentinelProject("token", scope)).rejects.toThrow(
        reason,
      );
    },
  );
  it("rechecks access after revocation, never caches a successful context", async () => {
    await authorizeSentinelProject("token", scope);
    vi.mocked(authorizeCanvasProject).mockRejectedValueOnce(
      new Error("repository revoked"),
    );
    await expect(authorizeSentinelProject("token", scope)).rejects.toThrow(
      "revoked",
    );
    expect(authorizeCanvasProject).toHaveBeenCalledTimes(2);
  });
});
describe("identity and idempotency namespaces", () => {
  it("isolates workspace, project and mode, including delimiter collisions", () => {
    const scopes = [
      scope,
      { ...scope, workspaceId: "other" },
      { ...scope, projectId: "github-456" },
      { ...scope, mode: "demo" as const },
      orderlyDemoScope,
      { ...scope, workspaceId: "a:b", projectId: "c" },
      { ...scope, workspaceId: "a", projectId: "b:c" },
    ];
    expect(new Set(scopes.map(scopeKey)).size).toBe(scopes.length);
    expect(
      new Set(scopes.map((s) => deliveryKey(s, "guard", "same"))).size,
    ).toBe(scopes.length);
    expect(deliveryKey(scope, "guard", "same")).not.toBe(
      deliveryKey(scope, "telemetry", "same"),
    );
    expect(deliveryKey(scope, "guard", "same")).toBe(
      deliveryKey({ ...scope }, "guard", "same"),
    );
  });
  it("denies scope mismatches and malformed empty identities", () => {
    expect(() => assertSameScope(scope, { ...scope, mode: "demo" })).toThrow();
    expect(() => scopeKey({ ...scope, workspaceId: "" })).toThrow();
    expect(() => deliveryKey(scope, "guard", "")).toThrow();
  });
});
