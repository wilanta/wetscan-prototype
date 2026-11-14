// Guard-owned runner. Reuses existing Auth fixture unchanged; never reads dotenv.
import { spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "wetscan-auth-browser-"));
const preload = join(root, "tests/auth/skip-dotenv.cjs").replaceAll("\\", "/");
const env = {
  ...process.env,
  NODE_OPTIONS: `--require "${preload}"`,
  NEXT_TELEMETRY_DISABLED: "1",
};
for (const key of Object.keys(env))
  if (/^(GITHUB_|AUTH_|APP_URL$|WETSCAN_GITHUB)/.test(key)) delete env[key];
Object.assign(env, {
  APP_URL: "http://127.0.0.1:3109",
  AUTH_DATA_DIR: directory,
  AUTH_SECRET: randomBytes(32).toString("hex"),
});
const next = join(root, "node_modules/next/dist/bin/next");
let server;
function run(args, environment) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: environment,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolveRun()
        : reject(new Error("Guard command failed: " + code)),
    );
  });
}
try {
  await new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error("Port 3109 must be unused")));
    probe.listen(3109, "127.0.0.1", () => probe.close(resolvePort));
  });
  const buildEnv = {
    ...env,
    GITHUB_APP_ID: "123",
    GITHUB_APP_SLUG: "wetscan-test-app",
    GITHUB_APP_CLIENT_ID: "fixture-client",
    GITHUB_APP_CLIENT_SECRET: "fixture-only",
    GITHUB_APP_PRIVATE_KEY: generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString(),
  };
  await run([next, "build"], buildEnv);
  const serverEnv = {
    ...env,
    WETSCAN_GITHUB_EXISTING_E2E: "1",
    NODE_OPTIONS:
      env.NODE_OPTIONS +
      ` --import "${pathToFileURL(join(root, "tests/auth/github-existing-fixture.mjs")).href}"`,
  };
  server = spawn(
    process.execPath,
    [next, "start", "--hostname", "127.0.0.1", "--port", "3109"],
    {
      cwd: root,
      env: serverEnv,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  server.stderr.on("data", () => {
    /* Never forward unsanitized Auth server logs. */
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw new Error("Guard fixture server exited");
    try {
      if ((await fetch(env.APP_URL + "/api/onboarding")).ok) {
        ready = true;
        break;
      }
    } catch {
      /* startup */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!ready) throw new Error("Guard fixture server not ready");
  await run(
    [
      join(root, "node_modules/@playwright/test/cli.js"),
      "test",
      "--config",
      "tests/guard/playwright.config.ts",
    ],
    env,
  );
} finally {
  if (server && server.exitCode === null)
    await new Promise((r) => {
      server.once("exit", r);
      server.kill();
    });
  const target = resolve(directory);
  if (
    !basename(target).startsWith("wetscan-auth-browser-") ||
    relative(resolve(tmpdir()), target).startsWith("..")
  )
    throw new Error("Unsafe Guard fixture cleanup");
  await rm(target, { recursive: true, force: true });
}
