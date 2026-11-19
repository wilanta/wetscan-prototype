// Reuses the existing Auth fixture, never the owner's browser, env files or providers.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
const browserConfig = process.argv[2] ?? "tests/mvp/playwright.config.ts";
if (
  ![
    "tests/mvp/playwright.config.ts",
    "tests/guard/live/browser.config.ts",
  ].includes(browserConfig)
)
  throw Error("Unknown test config");
const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "wetscan-auth-browser-"));
const env = { ...process.env };
for (const key of Object.keys(env))
  if (
    /^(?:SENTINEL_|GUARD_|GITHUB_|GITLAB_|AUTH_|WETSCAN_|PG|DATABASE_URL$|APP_URL$|NODE_OPTIONS$)/.test(
      key,
    )
  )
    delete env[key];
Object.assign(env, {
  NODE_ENV: "development",
  NEXT_TELEMETRY_DISABLED: "1",
  APP_URL: "http://127.0.0.1:3109",
  AUTH_DATA_DIR: directory,
  AUTH_SECRET: randomBytes(32).toString("hex"),
  NODE_OPTIONS:
    '--require "' +
    join(root, "tests/auth/skip-dotenv.cjs").replaceAll("\\", "/") +
    '"',
});
const serverEnv = {
  ...env,
  WETSCAN_GITHUB_EXISTING_E2E: "1",
  NODE_OPTIONS:
    env.NODE_OPTIONS +
    ' --import "' +
    pathToFileURL(join(root, "tests/auth/github-existing-fixture.mjs")).href +
    '"',
};
let server;
let startupFailure = "UNCLASSIFIED";
let startupErrorCode = "UNAVAILABLE";
try {
  await new Promise((done, reject) => {
    const p = createServer();
    p.once("error", () =>
      reject(Error("Port 3109 occupied; existing process preserved")),
    );
    p.listen(3109, "127.0.0.1", () => p.close(done));
  });
  server = spawn(
    process.execPath,
    [
      join(root, "node_modules/next/dist/bin/next"),
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3109",
    ],
    {
      cwd: root,
      env: serverEnv,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const classifyStartup = (chunk) => {
    // Only startup diagnostics from this sanitized fixture child; never raw Auth logs.
    const value = String(chunk).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
    startupErrorCode = value.match(/\b(?:E[A-Z]{3,}|ERR_[A-Z_]+)\b/)?.[0] ?? startupErrorCode;
    for (const [pattern, reason] of [
      [/EADDRINUSE/, "PORT_IN_USE"],
      [/Unable to acquire lock|another instance of next dev|Another next dev server/i, "DEV_DIRECTORY_LOCKED"],
      [/EPERM|EACCES/, "FILESYSTEM_PERMISSION"],
      [/Cannot find module|ERR_MODULE_NOT_FOUND/, "MODULE_NOT_FOUND"],
      [/Turbopack/, "UNEXPECTED_TURBOPACK"],
      [/fixture requires/i, "FIXTURE_SCOPE_MISMATCH"],
    ]) if (pattern.test(value)) startupFailure = reason;
  };
  server.stderr.on("data", classifyStartup);
  server.stdout.on("data", classifyStartup);
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw Error("Owned fixture server stopped: " + startupFailure + "; code=" + startupErrorCode + "; exit=" + server.exitCode);
    try {
      if (
        (
          await fetch(env.APP_URL + "/login", {
            signal: AbortSignal.timeout(2000),
          })
        ).ok
      ) {
        ready = true;
        break;
      }
    } catch {
      /* startup */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) throw Error("Owned fixture server not ready");
  const code = await new Promise((done, reject) => {
    const p = spawn(
      process.execPath,
      [
        join(root, "node_modules/@playwright/test/cli.js"),
        "test",
        "--config=" + browserConfig,
      ],
      { cwd: root, env, stdio: "inherit", windowsHide: true },
    );
    p.once("error", reject);
    p.once("exit", (c) => done(c ?? 2));
  });
  process.exitCode = code;
} finally {
  if (server && server.exitCode === null)
    await new Promise((done) => {
      server.once("exit", done);
      server.kill();
    });
  const target = resolve(directory);
  if (
    !basename(target).startsWith("wetscan-auth-browser-") ||
    relative(resolve(tmpdir()), target).startsWith("..")
  )
    throw Error("Fixture directory boundary mismatch");
  await rm(target, { recursive: true, force: true });
}
