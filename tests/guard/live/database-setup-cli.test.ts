import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  mkdtemp,
  mkdir,
  copyFile,
  stat,
  readFile,
  rm,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, basename } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
it("owner installer CLI uses synthetic stdin only, verifies real private ACL, writes distinct UTF8 files and no database/network (local fixture)", async () => {
  const root = await mkdtemp(join(tmpdir(), "wetscan-setup-unit-"));
  const project = join(root, "wetscan-guard-mvp-local-demo");
  await mkdir(project);
  try {
    const sources = [
      ...[
        "roles.proposed.sql",
        "platform-access.proposed.sql",
        "platform-access.rollback.proposed.sql",
        "0001_guard.up.sql",
        "0001_guard.down.sql",
      ].map((f) => "migrations/guard/" + f),
      ...["0001_foundation", "0002_telemetry", "0003_detection"].flatMap((v) =>
        ["up", "down"].map(
          (k) => "migrations/sentinel/" + v + "." + k + ".sql",
        ),
      ),
      "infra/sentinel/provision-roles.sql",
    ];
    for (const file of sources) {
      await mkdir(join(project, file.slice(0, file.lastIndexOf("/"))), {
        recursive: true,
      });
      await copyFile(resolve(file), join(project, file));
    }
    const input = {
      app: "SYNTHETIC_EXISTING_APP_\u03c0_000000000",
      worker: "SYNTHETIC_EXISTING_WORKER_\u03bb_000000000",
    };
    const args = [
      "--conditions=react-server",
      "--import",
      pathToFileURL(resolve("node_modules/tsx/dist/loader.mjs")).href,
      resolve("scripts/guard-live-setup.ts"),
      "--existing-passwords-base64-stdin",
      "--expires-at",
      new Date(Date.now() + 3 * 86400000).toISOString(),
    ];
    const { spawn } = await import("node:child_process");
    const child = spawn(process.execPath, args, {
      cwd: project,
      env: process.env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "",
      err = "";
    child.stdout.on("data", (b) => (out += String(b)));
    child.stderr.on("data", (b) => (err += String(b)));
    const done = new Promise<number>((ok, fail) => {
      child.once("error", fail);
      child.once("close", (c) => ok(c ?? 1));
    });
    child.stdin.end(
      Buffer.from(JSON.stringify(input), "utf8").toString("base64") + "\n",
    );
    const exit = await done;
    if (exit !== 0)
      throw Error(
        "SYNTHETIC_CLI_FAILURE: " +
          (err.match(/ERR_[A-Z_]+/)?.[0] ?? out.slice(0, 100)),
      );
    const result = JSON.parse(out);
    expect(result.safe).toMatchObject({
      privateAclVerified: true,
      distinctFiles: true,
      passwordChanged: false,
      databaseConnected: false,
      runtimeOperations: 0,
      scanningEnabled: false,
    });
    expect(out + err).not.toContain(input.app);
    expect(out + err).not.toContain(input.worker);
    expect(await readFile(result.refs.GUARD_DB_APP_PASSWORD_FILE, "utf8")).toBe(
      input.app,
    );
    expect(
      await readFile(result.refs.GUARD_DB_WORKER_PASSWORD_FILE, "utf8"),
    ).toBe(input.worker);
    expect(result.refs.GUARD_DB_APP_PASSWORD_FILE).not.toBe(
      result.refs.GUARD_DB_WORKER_PASSWORD_FILE,
    );
    expect((await stat(result.refs.GUARD_PRODUCT_CONFIG_FILE)).isFile()).toBe(
      true,
    );
    const attached = await promisify(execFile)(
      process.execPath,
      [...args.slice(0, 3), resolve("scripts/guard-live-reattach.ts")],
      {
        cwd: project,
        env: {
          ...process.env,
          GUARD_PRODUCT_ENABLED: "0",
          GUARD_PRODUCT_CONFIG_FILE: result.refs.GUARD_PRODUCT_CONFIG_FILE,
        },
        windowsHide: true,
        timeout: 20000,
        maxBuffer: 32768,
      },
    );
    const restored = JSON.parse(attached.stdout);
    expect(restored.safe).toMatchObject({
      classification: "EXISTING_G02_REFERENCES_REATTACHED_METADATA_ONLY",
      passwordFilesRead: false,
      filesWritten: 0,
      databaseConnected: false,
      runtimeOperations: 0,
      processReadiness: "REFERENCE_METADATA_READY_DB_NOT_CONNECTED",
    });
    expect(Object.keys(restored.refs)).toHaveLength(4);
    expect(attached.stdout + attached.stderr).not.toContain(input.app);
    expect(attached.stdout + attached.stderr).not.toContain(input.worker);
    if (process.platform === "win32") {
      const acl = await promisify(execFile)(
        join(process.env.SystemRoot!, "System32/icacls.exe"),
        [result.refs.GUARD_DB_APP_PASSWORD_FILE],
        { windowsHide: true },
      );
      expect(acl.stdout).not.toContain("BUILTIN\\Users");
    }
  } finally {
    const actual = await realpath(root),
      parent = await realpath(tmpdir());
    if (
      relative(parent, actual).startsWith("..") ||
      !basename(actual).startsWith("wetscan-setup-unit-")
    )
      throw Error("fixture_boundary");
    await rm(actual, { recursive: true, force: true });
  }
}, 30000);
