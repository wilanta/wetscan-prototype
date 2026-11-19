// Offline/local validation only; no runtime provider/scanner or acceptance entrypoints.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
const tasks = {
  unit: [
    "node_modules/vitest/vitest.mjs",
    "run",
    "tests/guard/live",
    "tests/mvp",
    "tests/guard/core.test.ts",
    "tests/guard/adapters.test.ts",
    "tests/guard/scanner-adapter.test.ts",
    "tests/guard/orchestrator-regression.test.ts",
    "tests/guard/worker.test.ts",
    "tests/guard/g01/persistence.test.ts",
    "tests/guard/g01/repository.test.ts",
    "tests/guard/g01/http.test.ts",
    "tests/guard/g01/snapshot.test.ts",
    "--reporter=default",
    "--reporter=json",
    "--outputFile=test-results/guard-live/unit.json",
  ],
  contracts: [
    "node_modules/vitest/vitest.mjs", "run",
    "tests/platform", "tests/sentinel", "tests/canvas",
    "tests/auth-onboarding.test.ts", "tests/auth-store-retry.test.ts",
    "tests/github-app-key.test.ts", "tests/dashboard-account.test.ts", "tests/demo.test.ts",
    "--reporter=default", "--reporter=json",
    "--outputFile=test-results/guard-live/contracts.json",
  ],
  typecheck: ["node_modules/typescript/bin/tsc", "--noEmit"],
  lint: ["node_modules/eslint/bin/eslint.js", "."],
  build: ["node_modules/next/dist/bin/next", "build", "--webpack"],
  browser: [
    "tests/mvp/run-integrated-e2e.mjs",
    "tests/guard/live/browser.config.ts",
  ],
};
const kind = process.argv[2];
if (!Object.hasOwn(tasks, kind) || process.argv.length !== 3)
  throw Error("Choose unit/contracts/typecheck/lint/build/browser");
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
await mkdir("test-results/guard-live", { recursive: true });
const startedAt = new Date().toISOString();
const code = await new Promise((done) => {
  const p = spawn(process.execPath, tasks[kind], {
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  p.once("error", () => done(2));
  p.once("exit", (c) => done(c ?? 2));
});
await writeFile(
  "test-results/guard-live/" + kind + ".result.json",
  JSON.stringify(
    {
      kind,
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode: code,
      classification: "OFFLINE_OR_LOCAL_FIXTURE_TEST_NOT_LIVE_ACCEPTANCE",
      realScannerExecuted: false,
      externalProviderCalled: false,
      databaseConnected: false,
    },
    null,
    2,
  ) + "\n",
);
process.exitCode = code;
