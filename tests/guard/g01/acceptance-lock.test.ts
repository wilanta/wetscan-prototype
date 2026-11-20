import { it, expect } from "vitest";
import { mkdtemp, writeFile, rm, lstat } from "node:fs/promises";
import { join, resolve, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { lockOwnedFile } from "../../../worker/guard/acceptance/owned-lock";
it.runIf(process.platform === "win32")(
  "uses a real Windows sharing lock on a synthetic owned file, then releases only its helper",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "wetscan-g01-snapshot-lock-"));
    let lock: Awaited<ReturnType<typeof lockOwnedFile>> | undefined;
    try {
      await writeFile(join(root, "owned.txt"), "SYNTHETIC_FIXTURE_NO_SECRETS");
      lock = await lockOwnedFile(root, "owned.txt");
      expect(lock.identity.pid).toBeGreaterThan(0);
      expect(lock.identity.creationTicks).toMatch(/^\d+$/);
      await expect(rm(join(root, "owned.txt"))).rejects.toThrow();
      expect((await lstat(join(root, "owned.txt"))).isFile()).toBe(true);
      await lock.release();
      lock = undefined;
      await rm(join(root, "owned.txt"));
      await expect(lstat(join(root, "owned.txt"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await lock?.release();
      const target = resolve(root);
      if (
        dirname(target) !== resolve(tmpdir()) ||
        !basename(target).startsWith("wetscan-g01-snapshot-lock-")
      )
        throw Error("unsafe cleanup");
      await rm(target, { recursive: true, force: true });
    }
  },
  15000,
);
