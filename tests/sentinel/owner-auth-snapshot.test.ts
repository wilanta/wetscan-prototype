import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  inventoryOwnerAuth,
  snapshotOwnerAuth,
  type SnapshotGuards,
} from "../../scripts/sentinel-owner-auth-snapshot";

const exec = promisify(execFile);
const guards: SnapshotGuards = {
  privatePath: async (path) => path,
  assertPrivateAcl() {},
  createPrivateDirectory(path) {
    // Replaced per fixture below; only a known cache directory is created.
    throw new Error(`fixture_creator_unset:${basename(path)}`);
  },
};
const cacheFile =
  "a".repeat(64) + "." + "b".repeat(64) + "." + "c".repeat(40) + ".bin";
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";

describe("owner auth snapshot (synthetic opaque files, no OAuth or database)", () => {
  let root: string, authDir: string, oldCookie: string, run: string;
  let options: Parameters<typeof snapshotOwnerAuth>[0];
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "wetscan-auth-backup-test-"));
    authDir = join(root, "auth");
    oldCookie = join(root, "old.cookie");
    run = join(root, "run");
    for (const path of [
      authDir,
      run,
      join(run, "archive"),
      join(run, "archive", "auth-store"),
    ])
      await mkdir(path);
    await writeFile(
      join(authDir, "user-187839747.bin"),
      "OPAQUE_SYNTHETIC_PROFILE",
    );
    await writeFile(
      join(authDir, "session-" + "a".repeat(64) + ".bin"),
      "OPAQUE_SYNTHETIC_SESSION",
    );
    await writeFile(oldCookie, "SYNTHETIC_COOKIE_NOT_A_REAL_SESSION");
    await writeFile(oldCookie + ".meta.json", "SYNTHETIC_METADATA");
    const { mkdirSync } = await import("node:fs");
    options = {
      authDir,
      oldCookie,
      run,
      configPins: {},
      guards: {
        ...guards,
        createPrivateDirectory: (path) => mkdirSync(path),
      },
    };
  });
  afterEach(async () => {
    const path = resolve(root);
    if (
      !basename(path).startsWith("wetscan-auth-backup-test-") ||
      relative(resolve(tmpdir()), path).startsWith("..")
    )
      throw new Error("unsafe_fixture_cleanup");
    await rm(path, { recursive: true, force: true });
  });
  async function addCache() {
    await mkdir(join(authDir, "canvas-graphs-v1"));
    await writeFile(
      join(authDir, "canvas-graphs-v1", cacheFile),
      "OPAQUE_SYNTHETIC_CACHE",
    );
  }
  async function failureReceipt() {
    return JSON.parse(
      await readFile(join(run, "snapshot-failure.sanitized.json"), "utf8"),
    );
  }
  it("copies all record and cookie bytes exclusively and publishes hash evidence", async () => {
    const result = await snapshotOwnerAuth(options);
    expect(result).toMatchObject({
      status: "SNAPSHOT_PRESERVED",
      copiedFiles: 4,
      databaseConnections: 0,
      githubRequests: 0,
    });
    const before = JSON.parse(
      await readFile(join(run, "auth-before.private.json"), "utf8"),
    );
    expect(before.schemaVersion).toBe(2);
    for (const name of Object.keys(before.records))
      expect(await readFile(join(run, "archive", "auth-store", name))).toEqual(
        await readFile(join(authDir, name)),
      );
    expect(
      await readFile(join(run, "archive", "previous-owner.cookie")),
    ).toEqual(await readFile(oldCookie));
  });
  it("reproduces the old flat validator failure and backs up the recognized Canvas namespace", async () => {
    await addCache();
    const names = await readdir(authDir);
    expect(
      names.some(
        (name) => !/^(session-[a-f0-9]{64}|user-\d+)\.bin$/.test(name),
      ),
    ).toBe(true);
    expect(await snapshotOwnerAuth(options)).toMatchObject({ copiedFiles: 5 });
    const before = JSON.parse(
      await readFile(join(run, "auth-before.private.json"), "utf8"),
    );
    expect(before.directories).toEqual(["canvas-graphs-v1"]);
    expect(
      await readFile(
        join(run, "archive", "auth-store", "canvas-graphs-v1", cacheFile),
      ),
    ).toEqual(await readFile(join(authDir, "canvas-graphs-v1", cacheFile)));
  });
  it("preserves an empty known cache directory in the inventory", async () => {
    await mkdir(join(authDir, "canvas-graphs-v1"));
    expect(
      (await inventoryOwnerAuth(authDir, options.guards)).directories,
    ).toEqual(["canvas-graphs-v1"]);
    expect((await snapshotOwnerAuth(options)).copiedFiles).toBe(4);
  });
  it.each(["unknown-directory", "not-a-record.bin"])(
    "rejects unexpected root entry %s",
    async (name) => {
      if (name.includes("directory")) await mkdir(join(authDir, name));
      else await writeFile(join(authDir, name), "SYNTHETIC");
      await expect(snapshotOwnerAuth(options)).rejects.toMatchObject({
        classification: "unexpected_auth_entry",
      });
      expect((await failureReceipt()).copiedFiles).toBe(0);
    },
  );
  it("rejects unknown cache entries and nested directories", async () => {
    await addCache();
    await mkdir(join(authDir, "canvas-graphs-v1", "nested"));
    await expect(snapshotOwnerAuth(options)).rejects.toMatchObject({
      classification: "unexpected_cache_entry",
    });
  });
  it("fails before copying when a required original cookie is missing", async () => {
    await rm(oldCookie);
    await expect(snapshotOwnerAuth(options)).rejects.toMatchObject({
      classification: "source_missing",
    });
    expect((await failureReceipt()).copiedFiles).toBe(0);
    expect(await readdir(join(run, "archive", "auth-store"))).toEqual([]);
  });
  it("retains sanitized access-denied diagnostics without exposing the OS message", async () => {
    options.copyExclusive = async () => {
      throw Object.assign(new Error("SENSITIVE_FIXTURE_DO_NOT_PRINT"), {
        code: "EACCES",
      });
    };
    await expect(snapshotOwnerAuth(options)).rejects.toMatchObject({
      classification: "file_access_denied",
    });
    expect(
      await readFile(join(run, "snapshot-failure.sanitized.json"), "utf8"),
    ).not.toContain("SENSITIVE_FIXTURE");
  });
  it("blocks an ACL failure before creating a snapshot marker or backup", async () => {
    options.guards.assertPrivateAcl = () => {
      throw new Error("SENSITIVE_ACL_MESSAGE");
    };
    await expect(snapshotOwnerAuth(options)).rejects.toMatchObject({
      classification: "private_acl_rejected",
    });
    expect(await readdir(run)).toEqual(["archive"]);
  });
  it("rejects a path boundary before any snapshot write", async () => {
    options.guards.privatePath = async () => {
      throw new Error("boundary");
    };
    await expect(snapshotOwnerAuth(options)).rejects.toMatchObject({
      classification: "private_path_rejected",
    });
    expect(await readdir(run)).toEqual(["archive"]);
  });
  it("never overwrites an existing backup destination", async () => {
    const target = join(run, "archive", "previous-owner.cookie");
    await writeFile(target, "PRESERVE_DESTINATION");
    await expect(snapshotOwnerAuth(options)).rejects.toMatchObject({
      classification: "destination_exists",
    });
    expect(await readFile(target, "utf8")).toBe("PRESERVE_DESTINATION");
    expect((await failureReceipt()).copiedFiles).toBe(0);
  });
  it("preserves partial backups and originals; an incomplete run cannot be reused", async () => {
    const sourceBefore = await inventoryOwnerAuth(authDir, options.guards);
    let calls = 0;
    options.copyExclusive = async (...args) => {
      if (++calls === 2)
        throw Object.assign(new Error("synthetic"), { code: "EACCES" });
      return copyFile(...args);
    };
    await expect(snapshotOwnerAuth(options)).rejects.toMatchObject({
      classification: "file_access_denied",
    });
    expect(await inventoryOwnerAuth(authDir, options.guards)).toEqual(
      sourceBefore,
    );
    expect(await failureReceipt()).toMatchObject({
      copiedFiles: 1,
      partialArtifactsPreserved: true,
    });
    const partial = await readdir(join(run, "archive", "auth-store"));
    expect(partial).toHaveLength(1);
    await expect(snapshotOwnerAuth(options)).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect(await readdir(join(run, "archive", "auth-store"))).toEqual(partial);
    await expect(
      readFile(join(run, "auth-before.private.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("detects corruption and source mutation during copying", async () => {
    options.copyExclusive = async (source, target, mode) => {
      await copyFile(source, target, mode);
      await writeFile(target, "SYNTHETIC_CORRUPTION");
    };
    await expect(snapshotOwnerAuth(options)).rejects.toMatchObject({
      classification: "backup_integrity_failed",
    });
  });
  it("rejects a second execution after success without replacing any receipt", async () => {
    await snapshotOwnerAuth(options);
    const first = await readFile(join(run, "auth-before.private.json"));
    await expect(snapshotOwnerAuth(options)).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect(await readFile(join(run, "auth-before.private.json"))).toEqual(
      first,
    );
  });
  it.skipIf(process.platform !== "win32")(
    "PowerShell 5.1 propagates the real snapshot child failure before application startup",
    async () => {
      const child = join(root, "child.mjs"),
        wrapper = join(root, "wrapper.ps1");
      await rm(oldCookie);
      await writeFile(
        child,
        `import {mkdirSync} from 'node:fs';
      import {snapshotOwnerAuth} from ${JSON.stringify(pathToFileURL(resolve("scripts/sentinel-owner-auth-snapshot.ts")).href)};
      try { await snapshotOwnerAuth({authDir:${JSON.stringify(authDir)},oldCookie:${JSON.stringify(oldCookie)},run:${JSON.stringify(run)},configPins:{},guards:{privatePath:async p=>p,assertPrivateAcl(){},createPrivateDirectory:mkdirSync}}); }
      catch { console.error(JSON.stringify({status:'NOT_VERIFIED'})); process.exitCode=1; }`,
      );
      await writeFile(
        wrapper,
        `$ErrorActionPreference='Stop'\n& node --import ${quote(pathToFileURL(resolve("node_modules/tsx/dist/loader.mjs")).href)} ${quote(child)}\n$childCode=$LASTEXITCODE\nif($childCode -ne 0){Write-Output ('SNAPSHOT_CHILD_CODE='+$childCode);exit 1}\nthrow 'UNREACHABLE_APPLICATION_START'`,
      );
      const outcome = await exec(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-File", wrapper],
        { windowsHide: true, timeout: 15_000 },
      ).catch((error) => error);
      expect(outcome.code).toBe(1);
      expect(outcome.stdout).toContain("SNAPSHOT_CHILD_CODE=1");
      expect(outcome.stderr).not.toContain("UNREACHABLE_APPLICATION_START");
    },
  );
});
