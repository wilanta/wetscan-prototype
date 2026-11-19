// Guard-owned outer launcher: excludes unrelated runtime configuration without reading dotenv or credentials.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
const env = { ...process.env };
for (const key of Object.keys(env))
  if (
    /^(SENTINEL_|GUARD_|GITHUB_|AUTH_|WETSCAN_GITHUB|PG|DATABASE_URL)/.test(key)
  )
    delete env[key];
const preload = resolve("tests/auth/skip-dotenv.cjs").replaceAll("\\", "/");
env.NODE_OPTIONS = `--require "${preload}"`;
env.NEXT_TELEMETRY_DISABLED = "1";
env.AUTH_TEST_BROWSER_CHANNEL = "msedge";
const tasks = {
  auth: ["tests/auth/run-github-e2e.mjs"],
  canvas: [
    "node_modules/@playwright/test/cli.js",
    "test",
    "--config",
    "tests/guard/g01/canvas-regression.config.ts",
  ],
  legacy: [
    "node_modules/@playwright/test/cli.js",
    "test",
    "--config",
    "tests/guard/g01/legacy-regression.config.ts",
  ],
  detection: [
    "node_modules/@playwright/test/cli.js",
    "test",
    "--config",
    "tests/sentinel/detection.playwright.config.ts",
  ],
  race: [
    "node_modules/@playwright/test/cli.js",
    "test",
    "--config",
    "tests/guard/g01/s03-race.config.ts",
  ],
  sentinel: [
    "node_modules/@playwright/test/cli.js",
    "test",
    "--config",
    "tests/sentinel/telemetry.playwright.config.ts",
  ],
};
const kind = process.argv[2];
if (!Object.hasOwn(tasks, kind))
  throw new Error(
    "Choose an explicit safe regression group: auth/canvas/legacy/sentinel/detection/race",
  );
if (kind === "auth") env.AUTH_E2E_SKIP_BUILD = "1";
if (kind === "auth" && process.argv.length > 3)
  throw new Error("Auth runner accepts no extra arguments");
const child = spawn(
  process.execPath,
  [...tasks[kind], ...process.argv.slice(3)],
  {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    windowsHide: true,
  },
);
child.once("error", () => {
  process.exitCode = 2;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 2;
});
