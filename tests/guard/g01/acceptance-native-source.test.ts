import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import { expect, it, vi } from "vitest";
import {
  GuardSnapshotAdapter,
  snapshotPolicy,
} from "../../../src/features/guard/live/snapshot";
import type { SourceAccess } from "../../../src/features/guard/live/model";
import { CaseFaults } from "../../../worker/guard/acceptance/faults";
import { brokerFixture } from "./broker-fixture";
async function sourceFixture() {
  const f = await brokerFixture(),
    bytes = Buffer.from("export const offlineOwnedFixture = 1"),
    sha = createHash("sha1")
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest("hex"),
    close = vi.fn(async () => {});
  const source: SourceAccess = {
    authorize: f.deps.current,
    open: async () => ({
      head: async () => ({
        commit: f.binding.repository.commit,
        tree: "c".repeat(40),
      }),
      tree: async () => ({
        sha: "c".repeat(40),
        truncated: false,
        entries: ["a.ts", "b.ts"].map((path) => ({
          path,
          type: "blob" as const,
          mode: "100644",
          size: bytes.length,
          sha,
        })),
      }),
      blob: async () => ({
        sha,
        size: bytes.length,
        encoding: "base64",
        content: bytes.toString("base64"),
      }),
      close,
    }),
  };
  return { ...f, source, close };
}
it("N06: real 45s offline source deadline aborts after the first actual file and removes the partial root", async () => {
  const f = await sourceFixture();
  let root = "",
    written = 0;
  const actions = {
    event: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    revoked: vi.fn(async () => {}),
    crashChild: vi.fn(async () => {}),
    parentCrashReady: vi.fn(async () => {
      throw Error("unused");
    }),
  };
  const fault = new CaseFaults("N06", actions),
    hooks = fault.snapshotHooks();
  const adapter = new GuardSnapshotAdapter(f.source, undefined, {
    afterWrite: async (path, relative, count, signal) => {
      root = path;
      written = count;
      expect((await lstat(path)).isDirectory()).toBe(true);
      return hooks.afterWrite(path, relative, count, signal);
    },
    beforeCleanup: hooks.beforeCleanup,
  });
  const started = Date.now();
  await expect(adapter.acquire(f.grant, f.request)).rejects.toThrow(
    "source_unavailable",
  );
  expect(snapshotPolicy.maxMs).toBe(45000);
  expect(Date.now() - started).toBeGreaterThanOrEqual(45000);
  expect(written).toBe(1);
  expect(root).not.toBe("");
  await expect(lstat(root)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(lstat(root + ".lease")).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(f.close).toHaveBeenCalledOnce();
  expect(actions.cancel).not.toHaveBeenCalled();
}, 55000);
it.runIf(process.platform === "win32")(
  "N08: real snapshot cleanup fails under a real owned Windows file lock, preserving its lease until explicit rescue",
  async () => {
    const f = await sourceFixture(),
      actions = {
        event: vi.fn(async () => {}),
        cancel: vi.fn(async () => {}),
        revoked: vi.fn(async () => {}),
        crashChild: vi.fn(async () => {}),
        parentCrashReady: vi.fn(async () => {
          throw Error("unused");
        }),
      },
      fault = new CaseFaults("N08", actions),
      adapter = new GuardSnapshotAdapter(
        f.source,
        undefined,
        fault.snapshotHooks(),
      );
    const snapshot = await adapter.acquire(f.grant, f.request),
      root = await adapter.directory(snapshot);
    try {
      await expect(adapter.dispose(snapshot)).rejects.toThrow("cleanup_failed");
      expect((await lstat(root)).isDirectory()).toBe(true);
      expect((await lstat(root + ".lease")).isFile()).toBe(true);
      await fault.releaseOwnedLock();
      await adapter.dispose(snapshot);
      await expect(lstat(root)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(lstat(root + ".lease")).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await fault.releaseOwnedLock().catch(() => undefined);
      await adapter.dispose(snapshot).catch(() => undefined);
    }
  },
  15000,
);
