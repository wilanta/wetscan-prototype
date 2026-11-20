import { it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  revoke: vi.fn(async () => {}),
  owner: true,
  write: true,
  stale: false,
}));
vi.mock("../../../src/lib/auth/github", () => ({
  appJwt: () => "unit_app_jwt",
  userToken: async () => "unit_user_token",
}));
vi.mock("../../../src/lib/auth/session", () => ({
  saveSession: async () => {},
}));
vi.mock("../../../src/lib/auth/store", () => ({
  exclusive: async <T>(run: () => Promise<T>) => run(),
}));
vi.mock("../../../src/features/canvas/server/github-reader", () => ({
  canvasIdentity: async () => ({
    session: {},
    profile: { githubId: 7, installationId: 9, repositories: [{ id: 123 }] },
  }),
}));
vi.mock("../../../src/features/canvas/server/github-api", () => ({
  sourceRequest: mocks.request,
  revokeSourceToken: mocks.revoke,
}));
import { githubPullRequests } from "../../../src/features/guard/g03/github";
import { fixture, content, edit } from "./fixture";
import { gitBlob } from "../../../src/features/guard/g03/safety";
const commit = "c".repeat(40),
  tree = "d".repeat(40);
beforeEach(() => {
  mocks.owner = true;
  mocks.write = true;
  mocks.stale = false;
  mocks.request.mockReset();
  mocks.revoke.mockClear();
});
async function setup() {
  const f = await fixture(),
    p = await f.approved();
  p.pr = {
    state: "reserved",
    branch: "wetscan/g03-" + p.id.slice(0, 32),
    actorId: f.grant.actorId,
    approvedAt: new Date().toISOString(),
    patchDigest: p.patch!.digest,
  };
  const fixed = content.replace(edit.oldText, edit.newText);
  const pr = {
    number: 3,
    html_url: "https://github.com/fixture/repository/pull/3",
    state: "open",
    merged_at: null,
    head: { repo: { id: 123 }, ref: p.pr.branch, sha: commit },
    base: { repo: { id: 123 }, ref: "main", sha: p.baseCommit },
  };
  mocks.request.mockImplementation(
    async (
      path: string,
      _token: string,
      _signal: AbortSignal,
      _max: number,
      body?: Record<string, unknown>,
    ) => {
      if (path === "/repositories/123")
        return {
          id: 123,
          full_name: "fixture/repository",
          owner: { id: mocks.owner ? 7 : 8 },
          permissions: { push: true, admin: true },
        };
      if (path === "/app/installations/9")
        return {
          id: 9,
          suspended_at: null,
          permissions: {
            contents: mocks.write ? "write" : "read",
            pull_requests: mocks.write ? "write" : "read",
          },
        };
      if (path.endsWith("/access_tokens"))
        return {
          token: "unit_installation_token",
          expires_at: new Date(Date.now() + 60000).toISOString(),
        };
      if (path.endsWith("/branches/main"))
        return {
          name: "main",
          commit: { sha: mocks.stale ? "e".repeat(40) : p.baseCommit },
        };
      if (path.endsWith("/git/blobs")) return { sha: gitBlob(fixed) };
      if (path.endsWith("/git/trees")) return { sha: tree };
      if (path.endsWith("/git/commits"))
        return {
          sha: commit,
          tree: { sha: tree },
          parents: [{ sha: p.baseCommit }],
        };
      if (path.endsWith("/git/refs"))
        return { ref: body!.ref, object: { sha: commit } };
      if (path.endsWith("/pulls") || path.endsWith("/pulls/3")) return pr;
      if (path.includes("/pulls?")) return [pr];
      throw Error("unexpected_test_request");
    },
  );
  return { ...f, p, fixed };
}
it("creates exactly one dedicated branch and draft PR; never PATCH/PUT/merge/default ref", async () => {
  const f = await setup(),
    api = githubPullRequests("unit_session", true);
  await api.permission(f.authority, "main", new AbortController().signal);
  const r = await api.publish(
    f.authority,
    f.p,
    f.file,
    f.fixed,
    new AbortController().signal,
  );
  expect(r).toMatchObject({ number: 3, state: "open", headCommit: commit });
  const writes = mocks.request.mock.calls.filter(
    (c) => c[4] !== undefined && !c[0].endsWith("/access_tokens"),
  );
  expect(writes.map((c) => c[0].split("/").slice(-2).join("/"))).toEqual([
    "git/blobs",
    "git/trees",
    "git/commits",
    "git/refs",
    "repository/pulls",
  ]);
  const treeWrite = writes.find((c) => c[0].endsWith("/git/trees"))![4];
  expect(treeWrite).toEqual({
    base_tree: f.file.tree,
    tree: [
      { path: "route.ts", mode: "100644", type: "blob", sha: gitBlob(f.fixed) },
    ],
  });
  const ref = writes.find((c) => c[0].endsWith("/git/refs"))![4];
  expect(ref.ref).toBe("refs/heads/" + f.p.pr!.branch);
  expect(ref.ref).not.toBe("refs/heads/main");
  expect(ref.force).toBeUndefined();
  expect(writes.at(-1)![4]).toMatchObject({
    draft: true,
    head: f.p.pr!.branch,
    base: "main",
  });
  expect(mocks.revoke).toHaveBeenCalledTimes(1);
});
it.each(["disabled", "not_owner", "app_read_only", "stale"])(
  "denies PR at %s without a source write",
  async (fault) => {
    const f = await setup();
    if (fault === "not_owner") mocks.owner = false;
    if (fault === "app_read_only") mocks.write = false;
    if (fault === "stale") mocks.stale = true;
    const api = githubPullRequests("unit_session", fault !== "disabled");
    await expect(
      api.publish(
        f.authority,
        f.p,
        f.file,
        f.fixed,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(
      mocks.request.mock.calls.filter(
        (c) => c[4] !== undefined && !c[0].endsWith("/access_tokens"),
      ),
    ).toEqual([]);
  },
);
it("status reconciliation requests read-only permission and never republishes", async () => {
  const f = await setup(),
    api = githubPullRequests("unit_session", false);
  await api.status(f.authority, f.p, new AbortController().signal);
  const token = mocks.request.mock.calls.find((c) =>
    c[0].endsWith("/access_tokens"),
  )!;
  expect(token[4].permissions).toEqual({
    contents: "read",
    pull_requests: "read",
    metadata: "read",
  });
  expect(
    mocks.request.mock.calls.some(
      (c) => c[4] !== undefined && !c[0].endsWith("/access_tokens"),
    ),
  ).toBe(false);
});
