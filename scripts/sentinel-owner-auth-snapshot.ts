// Opaque filesystem backups only. No auth-store API, network, or database calls.
import { constants } from "node:fs";
import { copyFile, lstat, open, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

const recordName = /^(session-[a-f0-9]{64}|user-\d+)\.bin$/;
const cacheName = /^[a-f0-9]{64}\.[a-f0-9]{64}\.[a-f0-9]{40}\.bin$/;
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
export class AuthSnapshotError extends Error {
  constructor(public readonly classification: string) {
    super("auth_snapshot_failed");
  }
}
export type SnapshotGuards = {
  privatePath: (path: string) => Promise<string>;
  assertPrivateAcl: (path: string, file?: boolean) => void;
  createPrivateDirectory: (path: string) => void;
};
export type AuthInventory = {
  records: Record<string, string>;
  directories: string[];
};
function fail(code: string): never {
  throw new AuthSnapshotError(code);
}
export function snapshotClassification(error: unknown): string {
  if (error instanceof AuthSnapshotError) return error.classification;
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT") return "source_missing";
  if (code === "EACCES" || code === "EPERM") return "file_access_denied";
  if (code === "EEXIST") return "destination_exists";
  return "snapshot_validation_failed";
}
async function checkedPath(path: string, guards: SnapshotGuards) {
  try {
    return await guards.privatePath(path);
  } catch {
    return fail("private_path_rejected");
  }
}
function acl(path: string, guards: SnapshotGuards, file = false) {
  try {
    guards.assertPrivateAcl(path, file);
  } catch {
    fail("private_acl_rejected");
  }
}
async function regularFile(path: string, guards: SnapshotGuards) {
  await checkedPath(path, guards);
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) fail("unexpected_auth_entry");
  return digest(await readFile(path));
}
/** Recognize the existing flat encrypted Canvas cache; never skip unknown entries. */
export async function inventoryOwnerAuth(
  authDir: string,
  guards: SnapshotGuards,
): Promise<AuthInventory> {
  await checkedPath(authDir, guards);
  const records: Record<string, string> = {};
  const directories: string[] = [];
  for (const entry of (await readdir(authDir, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const path = join(authDir, entry.name);
    if (entry.isFile() && recordName.test(entry.name)) {
      records[entry.name] = await regularFile(path, guards);
    } else if (entry.isDirectory() && entry.name === "canvas-graphs-v1") {
      await checkedPath(path, guards);
      directories.push(entry.name);
      for (const cached of (await readdir(path, { withFileTypes: true })).sort(
        (a, b) => a.name.localeCompare(b.name),
      )) {
        if (!cached.isFile() || !cacheName.test(cached.name))
          fail("unexpected_cache_entry");
        records[join(entry.name, cached.name)] = await regularFile(
          join(path, cached.name),
          guards,
        );
      }
    } else fail("unexpected_auth_entry");
  }
  return { records, directories };
}
async function writeNew(path: string, value: unknown, guards: SnapshotGuards) {
  await checkedPath(path, guards);
  acl(dirname(path), guards);
  const fd = await open(path, "wx", 0o600);
  try {
    await fd.writeFile(JSON.stringify(value, null, 2) + "\n");
    await fd.sync();
  } finally {
    await fd.close();
  }
  acl(path, guards, true);
}
export async function snapshotOwnerAuth(input: {
  authDir: string;
  oldCookie: string;
  run: string;
  configPins: Record<string, string>;
  guards: SnapshotGuards;
  // Fault injection for deterministic offline copy-failure tests; CLI never sets it.
  copyExclusive?: typeof copyFile;
}) {
  const { authDir, oldCookie, run, configPins, guards } = input;
  const copy = input.copyExclusive ?? copyFile;
  await checkedPath(run, guards);
  acl(run, guards);
  // A failed/partial run is never reusable, even if no backup was copied.
  await writeNew(
    join(run, "snapshot-started.sanitized.json"),
    {
      status: "SNAPSHOT_STARTED",
      databaseConnections: 0,
      githubRequests: 0,
    },
    guards,
  );
  let copied = 0;
  try {
    const before = await inventoryOwnerAuth(authDir, guards);
    const oldPins: Record<string, string> = {};
    for (const file of [oldCookie, oldCookie + ".meta.json"])
      oldPins[file] = await regularFile(file, guards);
    const copies = [
      ...Object.entries(before.records).map(([name, hash]) => ({
        source: join(authDir, name),
        target: join(run, "archive", "auth-store", name),
        hash,
      })),
      {
        source: oldCookie,
        target: join(run, "archive", "previous-owner.cookie"),
        hash: oldPins[oldCookie],
      },
      {
        source: oldCookie + ".meta.json",
        target: join(run, "archive", "previous-owner.cookie.meta.json"),
        hash: oldPins[oldCookie + ".meta.json"],
      },
    ];
    for (const file of [
      ...copies.map((c) => c.target),
      join(run, "auth-before.private.json"),
    ]) {
      await checkedPath(file, guards);
      const exists = await lstat(file).then(
        () => true,
        (error) => {
          if (error.code === "ENOENT") return false;
          throw error;
        },
      );
      if (exists) fail("destination_exists");
    }
    for (const directory of before.directories) {
      const target = join(run, "archive", "auth-store", directory);
      await checkedPath(target, guards);
      guards.createPrivateDirectory(target);
      acl(target, guards);
    }
    for (const { source, target, hash } of copies) {
      acl(dirname(target), guards);
      await copy(source, target, constants.COPYFILE_EXCL);
      copied++;
      acl(target, guards, true);
      // Hash source again too, detecting changes between inventory and copy.
      if (
        (await regularFile(target, guards)) !== hash ||
        (await regularFile(source, guards)) !== hash
      )
        fail("backup_integrity_failed");
    }
    const after = await inventoryOwnerAuth(authDir, guards);
    if (JSON.stringify(before) !== JSON.stringify(after))
      fail("source_inventory_changed");
    for (const [file, hash] of Object.entries(oldPins))
      if ((await regularFile(file, guards)) !== hash)
        fail("source_inventory_changed");
    await writeNew(
      join(run, "auth-before.private.json"),
      {
        schemaVersion: 2,
        startedAt: Date.now(),
        authDir,
        ...before,
        configPins,
        oldPins,
      },
      guards,
    );
    return {
      status: "SNAPSHOT_PRESERVED",
      copiedFiles: copied,
      databaseConnections: 0,
      githubRequests: 0,
    };
  } catch (error) {
    const classification = snapshotClassification(error);
    // Retain all partial artifacts. Never delete, roll back, overwrite or retry.
    try {
      await writeNew(
        join(run, "snapshot-failure.sanitized.json"),
        {
          status: "NOT_VERIFIED",
          stage: "backup_snapshot",
          classification,
          copiedFiles: copied,
          partialArtifactsPreserved: true,
          databaseConnections: 0,
          githubRequests: 0,
        },
        guards,
      );
    } catch {
      /* An inaccessible/colliding receipt must not hide the original failure. */
    }
    throw new AuthSnapshotError(classification);
  }
}
