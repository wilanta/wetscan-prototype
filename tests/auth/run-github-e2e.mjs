// Run only isolated Auth/Onboarding E2E servers, with dotenv loading disabled.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const next = join(root, "node_modules/next/dist/bin/next");
const preload = join(root, "tests/auth/skip-dotenv.cjs")
  .split(String.fromCharCode(92))
  .join("/");
const children = [],
  directories = [];
const env = { ...process.env, NODE_OPTIONS: `--require "${preload}"` };
for (const key of Object.keys(env))
  if (/^(GITHUB_|AUTH_|APP_URL$|WETSCAN_GITHUB)/.test(key)) delete env[key];
// A build must not use the developer's auth configuration or read dotenv files.
async function isolated(port) {
  const directory = await mkdtemp(join(tmpdir(), "wetscan-auth-browser-"));
  directories.push(directory);
  return {
    ...env,
    APP_URL: `http://127.0.0.1:${port}`,
    AUTH_DATA_DIR: directory,
    AUTH_SECRET: randomBytes(32).toString("hex"),
  };
}
function run(args, environment) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: environment,
      stdio: "inherit",
      windowsHide: true,
    });
    children.push(child);
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolveRun()
        : reject(new Error("Auth E2E command failed: " + code)),
    );
  });
}
async function server(port, fixture, flag) {
  const environment = await isolated(port);
  if (fixture) {
    environment[flag] = "1";
    environment.NODE_OPTIONS += ` --import "${pathToFileURL(join(root, "tests/auth/" + fixture)).href}"`;
  }
  const child = spawn(
    process.execPath,
    [next, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: root,
      env: environment,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    },
  );
  children.push(child);
  child.stderr.on("data", (chunk) => {
    // Show only our fixed, sanitized Auth diagnostic line, never raw server logs.
    for (const line of chunk.toString().split("\n")) {
      if (line.startsWith("[WetScan auth] Request failed "))
        process.stderr.write(line + "\n");
    }
  });
  child.once("error", () => undefined);
  for (let attempt = 0; attempt < 90; attempt++) {
    if (child.exitCode !== null)
      throw new Error("Isolated Auth E2E server failed to start on " + port);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/onboarding`)).ok) return;
    } catch {
      /* Wait for startup only. */
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error("Timed out starting isolated Auth E2E server");
}
try {
  for (const port of [3107, 3108, 3109]) {
    await new Promise((resolvePort, reject) => {
      const probe = createServer();
      probe.once("error", () =>
        reject(
          new Error("Auth E2E requires an unused localhost port: " + port),
        ),
      );
      probe.listen(port, "127.0.0.1", () => probe.close(resolvePort));
    });
  }
  const buildEnv = await isolated(3107);
  // Generated fixture configuration is used only to compile; no live credentials.
  Object.assign(buildEnv, {
    GITHUB_APP_ID: "123",
    GITHUB_APP_SLUG: "wetscan-test-app",
    GITHUB_APP_CLIENT_ID: "fixture-client",
    GITHUB_APP_CLIENT_SECRET: "fixture-only",
    GITHUB_APP_PRIVATE_KEY: generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString(),
  });
  await run([next, "build"], buildEnv);
  await server(3107);
  await server(3108, "github-fixture.mjs", "WETSCAN_GITHUB_E2E");
  await server(
    3109,
    "github-existing-fixture.mjs",
    "WETSCAN_GITHUB_EXISTING_E2E",
  );
  await run(
    [
      join(root, "node_modules/@playwright/test/cli.js"),
      "test",
      "--output=test-results/auth",
      "--reporter=list",
      "tests/e2e/auth-onboarding.spec.ts",
      "tests/e2e/dashboard-session.spec.ts",
      "tests/e2e/github-canvas.spec.ts",
      "tests/e2e/github-installation.spec.ts",
      "tests/e2e/github-existing-installation.spec.ts",
    ],
    {
      ...env,
      AUTH_TEST_BROWSER_CHANNEL:
        process.env.AUTH_TEST_BROWSER_CHANNEL || "msedge",
      AUTH_TEST_BASE_URL: "http://127.0.0.1:3107",
      AUTH_GITHUB_TEST_BASE_URL: "http://127.0.0.1:3108",
    },
  );
} finally {
  await Promise.all(
    children
      .filter((child) => child.exitCode === null)
      .map(
        (child) =>
          new Promise((resolveExit) => {
            child.once("exit", resolveExit);
            child.kill();
          }),
      ),
  );
  for (const directory of directories) {
    const target = resolve(directory);
    if (
      !basename(target).startsWith("wetscan-auth-browser-") ||
      relative(resolve(tmpdir()), target).startsWith("..")
    )
      throw new Error("Unsafe fixture cleanup");
    await rm(target, { recursive: true, force: true });
  }
}
