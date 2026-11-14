import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../src/features/sentinel/server/project-context", () => ({
  authorizeSentinelProject: vi.fn(),
}));
import { authorizeSentinelProject } from "../../src/features/sentinel/server/project-context";
import { registerAuthorizedProject } from "../../src/features/sentinel/server/platform-projects";
import { PlatformDatabase } from "../../src/platform/database";
import { bindProject } from "../../src/features/sentinel/storage/projects";
import { RecordingClient, fakePool, scope } from "./helpers";
const context = {
  scope,
  actorId: "github-user-7",
  repositoryId: "123",
  canvasProjectRef: "github-user-7/github-123",
};
beforeEach(() => vi.mocked(authorizeSentinelProject).mockReset());
describe("project binding reuses existing Auth/Canvas authority - authorization double", () => {
  it("does not connect to the DB if current repository authorization is revoked", async () => {
    vi.mocked(authorizeSentinelProject).mockRejectedValueOnce(
      new Error("repository revoked"),
    );
    const pool = fakePool(new RecordingClient());
    await expect(
      registerAuthorizedProject(
        new PlatformDatabase(pool),
        "fixture-session",
        scope,
      ),
    ).rejects.toThrow("revoked");
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it("derives binding from the server-authorized context without creating a new registry", async () => {
    vi.mocked(authorizeSentinelProject).mockResolvedValueOnce(context);
    const client = new RecordingClient(),
      db = new PlatformDatabase(fakePool(client));
    expect(
      await registerAuthorizedProject(db, "fixture-session", scope),
    ).toEqual(context);
    expect(authorizeSentinelProject).toHaveBeenCalledWith(
      "fixture-session",
      scope,
    );
    expect(
      client.calls.find((c) =>
        c.sql.includes("INSERT INTO sentinel.project_bindings"),
      )?.values,
    ).toEqual([
      "live",
      scope.workspaceId,
      scope.projectId,
      "123",
      "github-user-7",
    ]);
  });
  it("rejects forged repository, actor/workspace and graph-ref associations", async () => {
    const db = new PlatformDatabase(fakePool(new RecordingClient()));
    for (const wrong of [
      { repositoryId: "456" },
      { actorId: "github-user-8" },
      { canvasProjectRef: "other" },
    ]) {
      await expect(
        db.scoped(scope, (tx) => bindProject(db, tx, { ...context, ...wrong })),
      ).rejects.toThrow("scope_denied");
    }
  });
});
