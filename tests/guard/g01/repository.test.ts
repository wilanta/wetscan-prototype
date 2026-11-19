import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../../src/features/guard/live/github-source", () => ({
  githubSourceAccess: vi.fn(),
}));
import { githubSourceAccess } from "../../../src/features/guard/live/github-source";
import {
  verifyGuardRevision,
  resolveRepositoryRevision,
} from "../../../src/features/guard/live/repository";
import { brokerFixture } from "./broker-fixture";
beforeEach(() => vi.clearAllMocks());
async function fixture() {
  const f = await brokerFixture(),
    authority = await f.deps.current();
  const close = vi.fn(async () => {}),
    head = vi.fn(async () => ({
      commit: "a".repeat(40),
      tree: "b".repeat(40),
    }));
  const authorize = vi.fn(async () => authority);
  vi.mocked(githubSourceAccess).mockReturnValue({
    authorize,
    open: async () => ({ head, close, tree: vi.fn(), blob: vi.fn() }),
  });
  return { authority, close, head, authorize };
}
it("verifies current repository authority again and returns metadata only, closing provider access", async () => {
  const f = await fixture(),
    result = await verifyGuardRevision(
      undefined,
      f.authority.grant.projectId,
      { branch: "main" },
      new AbortController().signal,
    );
  expect(result).toMatchObject({
    repository: { id: "123", name: "fixture/repo", branch: "main" },
    commit: "a".repeat(40),
    sourceRead: false,
    scanAccepted: false,
  });
  expect(f.authorize).toHaveBeenCalledTimes(2);
  expect(f.close).toHaveBeenCalledOnce();
  expect(Object.keys(result)).not.toEqual(
    expect.arrayContaining(["token", "installationToken", "source"]),
  );
});
it("cleans up and rejects revocation or changed installation during verification", async () => {
  const f = await fixture();
  f.authorize
    .mockResolvedValueOnce(f.authority)
    .mockResolvedValueOnce({ ...f.authority, installationId: 999 });
  await expect(
    verifyGuardRevision(
      undefined,
      f.authority.grant.projectId,
      { branch: "main" },
      new AbortController().signal,
    ),
  ).rejects.toThrow("not_found");
  expect(f.close).toHaveBeenCalledOnce();
});
it("does not touch Auth/provider for client identity fields or malformed SHA", async () => {
  await fixture();
  await expect(
    verifyGuardRevision(
      undefined,
      "github-123",
      { branch: "main", owner: "forged" },
      new AbortController().signal,
    ),
  ).rejects.toThrow("invalid_input");
  expect(githubSourceAccess).not.toHaveBeenCalled();
});

it("normal product revision lookup returns the actual pin without creating an acceptance preparation or nonce", async () => {
  const f = await fixture();
  const result = await resolveRepositoryRevision(
    undefined,
    f.authority.grant.projectId,
    { branch: "main" },
    new AbortController().signal,
  );
  expect(result.commit).toBe("a".repeat(40));
  expect(Object.keys(result).sort()).toEqual([
    "commit",
    "repository",
    "scanAccepted",
    "sourceRead",
    "tree",
    "verifiedAt",
  ]);
  expect(f.close).toHaveBeenCalledOnce();
  expect(f.authorize).toHaveBeenCalledTimes(2);
});
