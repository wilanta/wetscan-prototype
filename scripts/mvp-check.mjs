// Offline checks only. Never loads .env or runs acceptance/scanner integration suites.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
const tasks = {
  preview: [
    "node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3118",
  ],
  "prod-smoke": ["scripts/mvp-production-smoke.mjs"],
  unit: [
    "node_modules/vitest/vitest.mjs",
    "run",
    "tests/mvp",
    "tests/guard/core.test.ts",
    "tests/guard/adapters.test.ts",
  ],
  typecheck: ["node_modules/typescript/bin/tsc", "--noEmit"],
  lint: ["node_modules/eslint/bin/eslint.js", "."],
  build: ["node_modules/next/dist/bin/next", "build", "--webpack"],
  e2e: ["tests/mvp/run-integrated-e2e.mjs"],
  dev: [
    "node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3000",
  ],
};
const kind = process.argv[2];
if (!Object.hasOwn(tasks, kind) || process.argv.length !== 3)
  throw Error("Choose unit/typecheck/lint/build/e2e/dev");
const env = { ...process.env };
for (const key of Object.keys(env))
  if (
    /^(?:SENTINEL_|GUARD_|GITHUB_|GITLAB_|AUTH_|WETSCAN_|PG|DATABASE_URL$|APP_URL$|NODE_OPTIONS$)/.test(
      key,
    )
  )
    delete env[key];
env.NODE_OPTIONS =
  '--require "' +
  resolve("tests/auth/skip-dotenv.cjs").replaceAll("\\", "/") +
  '"';
env.NEXT_TELEMETRY_DISABLED = "1";
if (kind === "e2e" || kind === "dev" || kind === "preview")
  env.WETSCAN_LOCAL_DEMO = "1";
const child = spawn(process.execPath, tasks[kind], {
  env,
  stdio: "inherit",
  windowsHide: true,
});
child.once("error", () => {
  process.exitCode = 2;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 2;
});
