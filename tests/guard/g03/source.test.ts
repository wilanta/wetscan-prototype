import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const access = vi.hoisted(() => ({ factory: vi.fn() }));
vi.mock("../../../src/features/guard/live/github-source", () => ({
  githubSourceAccess: access.factory,
}));
import { githubRemediationSource } from "../../../src/features/guard/g03/source";
import { fixture, content, fileFixture } from "./fixture";
it.each([
  "pass",
  "stale",
  "symlink",
  "truncated",
  "corrupt_blob",
  "case_ambiguous",
  "oversize",
  "revoked",
])("source reader validates %s and closes its scoped token", async (fault) => {
  const f = await fixture(),
    close = vi.fn(async () => {}),
    entry = {
      path: "route.ts",
      type: "blob",
      mode: fault === "symlink" ? "120000" : "100644",
      size: fault === "oversize" ? 25000 : Buffer.byteLength(content),
      sha: f.file.blob,
    };
  const lease = {
    head: async () => ({
      commit: fault === "stale" ? "c".repeat(40) : f.file.baseCommit,
      tree: f.file.tree,
    }),
    tree: async () => ({
      sha: f.file.tree,
      truncated: fault === "truncated",
      entries: fault === "case_ambiguous" ? [entry, entry] : [entry],
    }),
    blob: async () => ({
      sha: f.file.blob,
      size: Buffer.byteLength(content),
      encoding: "base64",
      content: Buffer.from(
        fault === "corrupt_blob" ? "changed" : content,
      ).toString("base64"),
    }),
    close,
  };
  access.factory.mockReturnValue({
    authorize: async () =>
      fault === "revoked"
        ? { ...f.authority, repositoryId: "456" }
        : f.authority,
    open: async () => lease,
  });
  const result = githubRemediationSource("unit_session").read(
    f.authority,
    "main",
    f.file.baseCommit,
    "route.ts",
    new AbortController().signal,
  );
  if (fault === "pass") expect(await result).toEqual(f.file);
  else await expect(result).rejects.toThrow();
  expect(close).toHaveBeenCalledTimes(fault === "revoked" ? 0 : 1);
  expect(access.factory).toHaveBeenLastCalledWith(
    "unit_session",
    f.grant.projectId,
    { branch: "main" },
  );
});
it("preserves UTF-8 BOM bytes and the original Git blob digest", async () => {
  const f = await fixture(),
    file = fileFixture("\ufeff" + content),
    close = vi.fn(async () => {});
  access.factory.mockReturnValue({
    authorize: async () => f.authority,
    open: async () => ({
      head: async () => ({ commit: file.baseCommit, tree: file.tree }),
      tree: async () => ({
        sha: file.tree,
        truncated: false,
        entries: [
          {
            path: file.path,
            type: "blob",
            mode: "100644",
            size: Buffer.byteLength(file.content),
            sha: file.blob,
          },
        ],
      }),
      blob: async () => ({
        sha: file.blob,
        size: Buffer.byteLength(file.content),
        encoding: "base64",
        content: Buffer.from(file.content).toString("base64"),
      }),
      close,
    }),
  });
  await expect(
    githubRemediationSource("unit_session").read(
      f.authority,
      "main",
      file.baseCommit,
      file.path,
      new AbortController().signal,
    ),
  ).resolves.toEqual(file);
  expect(close).toHaveBeenCalledOnce();
});
