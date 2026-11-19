import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { GuardSnapshotAdapter } from "../../../src/features/guard/live/snapshot";
import type {
  ProjectAuthority,
  SourceAccess,
  SourceEntry,
} from "../../../src/features/guard/live/model";
import type { ScanRequest } from "../../../src/features/guard/contracts";
const commit = "a".repeat(40),
  tree = "b".repeat(40);
export const authority: ProjectAuthority = {
  grant: {
    mode: "live",
    workspaceId: "github-user-7:fixture",
    projectId: "github-123",
    actorId: "github-user-7",
    operations: ["read", "scan"],
    expiresAt: Date.now() + 60000,
  },
  repositoryId: "123",
  repositoryName: "fixture/repository",
  branch: "main",
  installationId: 9,
  userId: 7,
};
const sha = (buffer: Buffer) =>
  createHash("sha1")
    .update(`blob ${buffer.length}\0`)
    .update(buffer)
    .digest("hex");
function fixture(
  options: {
    files?: Record<string, Buffer>;
    entries?: SourceEntry[];
    truncated?: boolean;
    badHash?: boolean;
    readFailure?: boolean;
    revoked?: boolean;
  } = {},
) {
  const files = options.files ?? {
    "src/route.ts": Buffer.from("export const fixture = 1"),
    "infra/main.tf": Buffer.from(
      "# actual Terraform text included; never applied",
    ),
    "package-lock.json": Buffer.from("{}"),
  };
  const entries =
    options.entries ??
    Object.entries(files).map(([path, content]) => ({
      path,
      type: "blob" as const,
      mode: "100644",
      size: content.length,
      sha: sha(content),
    }));
  const close = vi.fn(async () => {});
  let calls = 0;
  const blob = vi.fn(async (hash: string) => {
    if (options.readFailure)
      throw new Error("synthetic provider failure with token=do-not-emit");
    const bytes = Object.values(files).find((b) => sha(b) === hash)!;
    return {
      sha: options.badHash ? "f".repeat(40) : hash,
      size: bytes.length,
      encoding: "base64",
      content: bytes.toString("base64"),
    };
  });
  const source: SourceAccess = {
    authorize: vi.fn(async () => {
      calls++;
      if (options.revoked && calls > 1) throw new Error("revoked");
      return structuredClone(authority);
    }),
    open: vi.fn(async () => ({
      head: async () => ({ commit, tree }),
      tree: async () => ({
        sha: tree,
        truncated: options.truncated ?? false,
        entries,
      }),
      blob,
      close,
    })),
  };
  const request: ScanRequest = {
    ...authority.grant,
    repository: {
      provider: "github",
      repositoryId: "123",
      branch: "main",
      commit,
    },
    profile: "quick",
    engines: ["sast"],
    idempotencyKey: "test-request",
  };
  return { source, request, blob, close };
}
describe("G01 bounded immutable authorized snapshot (provider doubles)", () => {
  it("includes scanner files excluded by Canvas policy, verifies hashes and disposes private source", async () => {
    const f = fixture(),
      adapter = new GuardSnapshotAdapter(f.source),
      snapshot = await adapter.acquire(authority.grant, f.request),
      directory = await adapter.directory(snapshot);
    expect(snapshot.files.some((row) => row.path === "infra/main.tf")).toBe(
      true,
    );
    expect(snapshot.coverage.status).toBe("complete");
    expect(snapshot.files).toHaveLength(3);
    expect(await readFile(directory + "/package-lock.json", "utf8")).toBe("{}");
    expect(snapshot.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(snapshot)).not.toContain(directory);
    await adapter.dispose(snapshot);
    await expect(access(directory)).rejects.toThrow();
    expect(f.close).toHaveBeenCalledOnce();
  });
  it.each(["workspaceId", "projectId", "actorId"] as const)(
    "rejects mismatched %s before opening provider",
    async (field) => {
      const f = fixture();
      await expect(
        new GuardSnapshotAdapter(f.source).acquire(
          { ...authority.grant, [field]: "other" },
          f.request,
        ),
      ).rejects.toThrow();
      expect(f.source.open).not.toHaveBeenCalled();
    },
  );
  it("rejects expired grant, invalid commit and stale commit", async () => {
    const f = fixture();
    await expect(
      new GuardSnapshotAdapter(f.source).acquire(
        { ...authority.grant, expiresAt: 0 },
        f.request,
      ),
    ).rejects.toThrow();
    for (const value of ["HEAD", "c".repeat(40)])
      await expect(
        new GuardSnapshotAdapter(f.source).acquire(authority.grant, {
          ...f.request,
          repository: { ...f.request.repository, commit: value },
        }),
      ).rejects.toThrow();
  });
  it("revalidates current authority after read and rejects revocation", async () => {
    const f = fixture({ revoked: true });
    await expect(
      new GuardSnapshotAdapter(f.source).acquire(authority.grant, f.request),
    ).rejects.toThrow("revoked");
    expect(f.close).toHaveBeenCalledOnce();
  });
  it("rejects invalid blob hash and does not expose provider exception text", async () => {
    const f = fixture({ badHash: true });
    await expect(
      new GuardSnapshotAdapter(f.source).acquire(authority.grant, f.request),
    ).rejects.toThrow("source_integrity");
    const g = fixture({ readFailure: true });
    await expect(
      new GuardSnapshotAdapter(g.source).acquire(authority.grant, g.request),
    ).rejects.toThrow("source_unavailable");
  });
  it("records secret paths, traversal, symlinks, submodules, size and depth without fetching them", async () => {
    const f = fixture(),
      base: SourceEntry = {
        path: "safe.ts",
        type: "blob",
        mode: "100644",
        size: 10,
        sha: "d".repeat(40),
      };
    const cases = [
      { ...base, path: ".env" },
      { ...base, path: "../escape" },
      { ...base, path: "link", mode: "120000" },
      { ...base, path: "submodule", mode: "160000", type: "commit" as const },
      { ...base, path: "huge.ts", size: 65537 },
      { ...base, path: Array(18).fill("deep").join("/") + ".ts" },
    ];
    const original = f.source.open;
    f.source.open = async (a, s) => {
      const lease = await original(a, s),
        list = await lease.tree(tree, s);
      return {
        ...lease,
        tree: async () => ({ ...list, entries: [...list.entries, ...cases] }),
      };
    };
    const adapter = new GuardSnapshotAdapter(f.source),
      snapshot = await adapter.acquire(authority.grant, f.request);
    expect(snapshot.coverage.status).toBe("partial");
    expect(snapshot.coverage.exclusions.map((e) => e.reason)).toEqual(
      expect.arrayContaining([
        "sensitive_path",
        "unsafe_path",
        "symlink",
        "submodule",
        "file_size",
        "depth",
      ]),
    );
    expect(f.blob).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(snapshot.coverage)).not.toContain(".env");
    await adapter.dispose(snapshot);
  });
  it("marks truncated trees and binary files partial rather than complete", async () => {
    const f = fixture({
        truncated: true,
        files: {
          "safe.ts": Buffer.from("safe"),
          "binary.ts": Buffer.from([0, 1]),
        },
      }),
      adapter = new GuardSnapshotAdapter(f.source),
      snapshot = await adapter.acquire(authority.grant, f.request);
    expect(snapshot.coverage.treeTruncated).toBe(true);
    expect(snapshot.coverage.exclusions[0].reason).toBe("binary");
    expect(snapshot.coverage.status).toBe("partial");
    await adapter.dispose(snapshot);
  });
  it("rejects duplicate paths and forged cleanup handles", async () => {
    const entry: SourceEntry = {
      path: "x",
      sha: "e".repeat(40),
      size: 1,
      type: "blob",
      mode: "100644",
    };
    const f = fixture({ entries: [entry, entry] });
    await expect(
      new GuardSnapshotAdapter(f.source).acquire(authority.grant, f.request),
    ).rejects.toThrow();
    const g = fixture(),
      adapter = new GuardSnapshotAdapter(g.source),
      snapshot = await adapter.acquire(authority.grant, g.request);
    await expect(adapter.dispose(structuredClone(snapshot))).rejects.toThrow(
      "not_found",
    );
    await adapter.dispose(snapshot);
  });
  it("surfaces cleanup failure and allows retry without losing the owned handle", async () => {
    const f = fixture();
    const { rm } = await import("node:fs/promises");
    let fail = true;
    const adapter = new GuardSnapshotAdapter(f.source, async (path) => {
      if (fail) throw new Error("fixed cleanup failure");
      await rm(path, { recursive: true, force: true });
    });
    const snapshot = await adapter.acquire(authority.grant, f.request);
    await expect(adapter.dispose(snapshot)).rejects.toThrow("cleanup_failed");
    fail = false;
    await adapter.dispose(snapshot);
  });
});

it("reaps only an explicit expired owned source directory after the safety grace period", async () => {
  const f = fixture(),
    adapter = new GuardSnapshotAdapter(f.source),
    snapshot = await adapter.acquire(authority.grant, f.request),
    root = await adapter.directory(snapshot);
  expect(await adapter.reapExpired([root])).toBe(0);
  expect(await adapter.reapExpired([root], Date.now() + 3600001)).toBe(1);
  await expect(access(root)).rejects.toThrow();
});

it("propagates cancellation without opening a provider for an already cancelled job", async () => {
  const f = fixture(),
    signal = AbortSignal.abort();
  await expect(
    new GuardSnapshotAdapter(f.source).acquire(
      authority.grant,
      f.request,
      signal,
    ),
  ).rejects.toThrow("source_unavailable");
  expect(f.source.authorize).not.toHaveBeenCalled();
});

// Real bounded filesystem fixtures. No provider, repository script or scanner is run.
it.each([
  { name: "file_limit", entries: 1001, bytes: 7, accepted: 1000 },
  { name: "total_size", entries: 306, bytes: 65536, accepted: 305 },
] as const)(
  "enforces the aggregate $name boundary without fetching the excluded blob",
  async ({ name, entries, bytes, accepted }) => {
    const content = Buffer.from("x".repeat(bytes)),
      hash = sha(content);
    const f = fixture({
      files: { "content.ts": content },
      entries: Array.from({ length: entries }, (_, n) => ({
        path: `file${String(n).padStart(4, "0")}.ts`,
        type: "blob",
        mode: "100644",
        size: bytes,
        sha: hash,
      })),
    });
    const adapter = new GuardSnapshotAdapter(f.source),
      snapshot = await adapter.acquire(authority.grant, f.request);
    try {
      expect(snapshot.files).toHaveLength(accepted);
      expect(f.blob).toHaveBeenCalledTimes(accepted);
      expect(snapshot.coverage.status).toBe("partial");
      expect(snapshot.coverage.exclusions).toHaveLength(1);
      expect(snapshot.coverage.exclusions[0].reason).toBe(name);
      expect(snapshot.coverage.bytes).toBe(accepted * bytes);
    } finally {
      await adapter.dispose(snapshot);
    }
  },
  20000,
);

it("normal worker renews only owned immutable source with a fresh grant; old grant TTL is unchanged", async () => {
  const f = fixture(),
    adapter = new GuardSnapshotAdapter(f.source),
    oldGrant = structuredClone(authority.grant),
    snapshot = await adapter.acquire(oldGrant, f.request);
  let owned: typeof snapshot = snapshot;
  try {
    const oldExpiry = oldGrant.expiresAt,
      fresh = {
        ...oldGrant,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60000,
      };
    vi.mocked(f.source.authorize).mockResolvedValue({
      ...authority,
      grant: fresh,
    });
    const next = await adapter.refresh(snapshot, fresh);
    owned = next;
    expect(oldGrant.expiresAt).toBe(oldExpiry);
    expect(next.expiresAt).toBe(fresh.expiresAt);
    expect(next.digest).toBe(snapshot.digest);
    await expect(adapter.directory(snapshot)).rejects.toThrow();
    await expect(adapter.directory(next)).resolves.toBeTruthy();
    await expect(
      adapter.refresh(structuredClone(next), fresh),
    ).rejects.toThrow();
    await expect(
      adapter.refresh(next, { ...fresh, expiresAt: Date.now() - 1 }),
    ).rejects.toThrow();
  } finally {
    await adapter.dispose(owned);
  }
});
it("source renewal rejects revocation without adopting another source", async () => {
  const f = fixture(),
    adapter = new GuardSnapshotAdapter(f.source),
    snapshot = await adapter.acquire(authority.grant, f.request);
  try {
    vi.mocked(f.source.authorize).mockRejectedValue(Error("revoked"));
    await expect(adapter.refresh(snapshot, authority.grant)).rejects.toThrow(
      "revoked",
    );
  } finally {
    await adapter.dispose(snapshot);
  }
});
