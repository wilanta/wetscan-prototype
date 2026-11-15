import { expect, it } from "vitest";
import { mkdtemp, writeFile, rm, lstat } from "node:fs/promises";
import { join, dirname, basename, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  secureSnapshotDirectory,
  verifiedSnapshotAcl,
} from "../../../src/features/guard/live/snapshot-directory";
const owner = "S-1-5-21-1-2-3-4";
const descriptor = () => ({
  owner,
  protected: true,
  rules: [owner, "S-1-5-18"].map((sid) => ({
    sid,
    inherited: false,
    type: "Allow",
    rights: 2032127,
    inheritance: 3,
    propagation: 0,
  })),
});
it("accepts only an owner/SYSTEM protected full-control inheritable descriptor", () => {
  expect(verifiedSnapshotAcl(descriptor(), owner)).toBe(true);
});
it("rejects inherited permission, extra reader and unprotected defaults", () => {
  const inherited = descriptor();
  inherited.rules[0].inherited = true;
  expect(verifiedSnapshotAcl(inherited, owner)).toBe(false);
  const extra = descriptor();
  extra.rules.push({ ...extra.rules[0], sid: "S-1-5-21-1-2-3-99" });
  expect(verifiedSnapshotAcl(extra, owner)).toBe(false);
  expect(
    verifiedSnapshotAcl({ ...descriptor(), protected: false }, owner),
  ).toBe(false);
});
it("rejects a different owner, missing SYSTEM, wrong rights or non-inheritable children", () => {
  expect(verifiedSnapshotAcl({ ...descriptor(), owner: "other" }, owner)).toBe(
    false,
  );
  const missing = descriptor();
  missing.rules[1] = { ...missing.rules[0] };
  expect(verifiedSnapshotAcl(missing, owner)).toBe(false);
  const rights = descriptor();
  rights.rules[0].rights = 1179817;
  expect(verifiedSnapshotAcl(rights, owner)).toBe(false);
  const child = descriptor();
  child.rules[0].inheritance = 0;
  expect(verifiedSnapshotAcl(child, owner)).toBe(false);
});
async function removeOwned(root: string, prefix: string) {
  const target = resolve(root);
  if (
    dirname(target) !== resolve(tmpdir()) ||
    !basename(target).startsWith(prefix)
  )
    throw Error("test_cleanup_target_denied");
  await rm(target, { recursive: true, force: true });
}
it("rejects a directory outside the generated snapshot namespace", async () => {
  const root = await mkdtemp(join(tmpdir(), "wetscan-g01-acl-invalid-"));
  try {
    await expect(secureSnapshotDirectory(root)).rejects.toMatchObject({
      code: "source_unavailable",
    });
  } finally {
    await removeOwned(root, "wetscan-g01-acl-invalid-");
  }
});
it("rejects an existing nonempty root before changing its ACL", async () => {
  const root = await mkdtemp(join(tmpdir(), "wetscan-g01-snapshot-"));
  try {
    await writeFile(join(root, "trusted-fixture.txt"), "fixture");
    await expect(secureSnapshotDirectory(root)).rejects.toMatchObject({
      code: "source_unavailable",
    });
  } finally {
    await removeOwned(root, "wetscan-g01-snapshot-");
  }
});
it("verifies real local filesystem isolation on a new empty root before source writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "wetscan-g01-snapshot-"));
  try {
    await secureSnapshotDirectory(root);
    await writeFile(join(root, "trusted-fixture.txt"), "not repository code", {
      flag: "wx",
      mode: 0o400,
    });
    expect((await lstat(root)).isDirectory()).toBe(true);
  } finally {
    await removeOwned(root, "wetscan-g01-snapshot-");
  }
}, 15000);
