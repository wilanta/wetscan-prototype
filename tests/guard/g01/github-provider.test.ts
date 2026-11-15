import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../../src/lib/auth/github", () => ({
  appJwt: vi.fn(() => "synthetic-app-assertion"),
}));
vi.mock("../../../src/features/canvas/server/github-api", () => ({
  sourceRequest: vi.fn(),
  revokeSourceToken: vi.fn(async () => {}),
}));
vi.mock("../../../src/features/guard/live/project", () => ({
  authorizeGuardProject: vi.fn(),
}));
import { githubSourceAccess } from "../../../src/features/guard/live/github-source";
import {
  sourceRequest,
  revokeSourceToken,
} from "../../../src/features/canvas/server/github-api";
import { authorizeGuardProject } from "../../../src/features/guard/live/project";
import { brokerFixture } from "./broker-fixture";
beforeEach(() => vi.resetAllMocks());
async function setup() {
  const f = await brokerFixture(),
    authority = await f.deps.current();
  vi.mocked(authorizeGuardProject).mockResolvedValue(authority);
  vi.mocked(sourceRequest).mockImplementation(async (path) => {
    if (path.endsWith("/access_tokens"))
      return {
        token: "synthetic-private-installation",
        expires_at: new Date(Date.now() + 60000).toISOString(),
      };
    if (path === "/repositories/123")
      return { id: 123, full_name: "fixture/repo", private: true };
    if (path.includes("/commits/"))
      return { sha: "a".repeat(40), commit: { tree: { sha: "b".repeat(40) } } };
    if (path.includes("/git/trees/"))
      return { sha: "b".repeat(40), truncated: false, tree: [] };
    return {
      sha: "c".repeat(40),
      size: 1,
      encoding: "base64",
      content: "eA==",
    };
  });
  return {
    authority,
    source: githubSourceAccess(undefined, authority.grant.projectId),
  };
}
it("revalidates current Auth and requests only the authorized private repository with Metadata/Contents read", async () => {
  const f = await setup(),
    signal = new AbortController().signal;
  const source = await f.source.open(f.authority, signal);
  expect(authorizeGuardProject).toHaveBeenCalledWith(undefined, "github-123");
  expect(sourceRequest).toHaveBeenCalledWith(
    "/app/installations/9/access_tokens",
    expect.any(String),
    signal,
    16000,
    {
      repository_ids: [123],
      permissions: { metadata: "read", contents: "read" },
    },
  );
  expect(await source.head(signal)).toEqual({
    commit: "a".repeat(40),
    tree: "b".repeat(40),
  });
  await source.tree("b".repeat(40), signal);
  await source.blob("c".repeat(40), signal);
  await source.close();
  expect(revokeSourceToken).toHaveBeenCalledOnce();
});
it.each([
  "repositoryId",
  "repositoryName",
  "installationId",
  "userId",
  "branch",
] as const)("rejects changed %s before minting a token", async (field) => {
  const f = await setup();
  await expect(
    f.source.open(
      {
        ...f.authority,
        [field]: typeof f.authority[field] === "number" ? 999 : "other",
      },
      new AbortController().signal,
    ),
  ).rejects.toThrow("not_found");
  expect(sourceRequest).not.toHaveBeenCalled();
});
it("revokes the minted token if exact repository verification fails", async () => {
  const f = await setup();
  vi.mocked(sourceRequest)
    .mockResolvedValueOnce({
      token: "synthetic-only",
      expires_at: new Date(Date.now() + 60000).toISOString(),
    })
    .mockResolvedValueOnce({ id: 999, full_name: "fixture/repo" });
  await expect(
    f.source.open(f.authority, new AbortController().signal),
  ).rejects.toThrow("not_found");
  expect(revokeSourceToken).toHaveBeenCalledOnce();
});
it("rejects expired provider tokens and malformed commit SHAs", async () => {
  const f = await setup();
  vi.mocked(sourceRequest).mockResolvedValueOnce({
    token: "synthetic-only",
    expires_at: "2000-01-01T00:00:00Z",
  });
  await expect(
    f.source.open(f.authority, new AbortController().signal),
  ).rejects.toThrow("source_integrity");
  expect(revokeSourceToken).toHaveBeenCalledOnce();
  const g = await setup(),
    source = await g.source.open(g.authority, new AbortController().signal);
  vi.mocked(sourceRequest).mockResolvedValueOnce({
    sha: "not-a-commit",
    commit: { tree: { sha: "b".repeat(40) } },
  });
  try {
    await expect(source.head(new AbortController().signal)).rejects.toThrow(
      "source_integrity",
    );
  } finally {
    await source.close();
  }
});
it("does not call GitHub for an already-aborted snapshot and passes transport failure through for safe HTTP mapping", async () => {
  const f = await setup();
  await expect(f.source.open(f.authority, AbortSignal.abort())).rejects.toThrow(
    "source_unavailable",
  );
  expect(sourceRequest).not.toHaveBeenCalled();
  vi.mocked(sourceRequest).mockRejectedValueOnce(
    new Error("synthetic timeout"),
  );
  await expect(
    f.source.open(f.authority, new AbortController().signal),
  ).rejects.toThrow("synthetic timeout");
});
