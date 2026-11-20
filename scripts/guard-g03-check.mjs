// Explicit local checks only. Drop owner service configuration and prevent dotenv loading in every child.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
const tasks = {
  unit: [
    "node_modules/vitest/vitest.mjs",
    "run",
    "--maxWorkers=2",
    "--reporter=default",
    "--reporter=json",
    "--outputFile=test-results/guard-g03/unit.json",
  ],
  typecheck: ["node_modules/typescript/bin/tsc", "--noEmit"],
  lint: ["node_modules/eslint/bin/eslint.js", "."],
  build: ["node_modules/next/dist/bin/next", "build", "--webpack"],
  browser: [
    "tests/mvp/run-integrated-e2e.mjs",
    "tests/guard/live/browser.config.ts",
  ],
  postgres: [
    "node_modules/vitest/vitest.mjs",
    "run",
    "-c",
    "tests/guard/g03/postgres.config.ts",
  ],
  scanner: [
    "node_modules/vitest/vitest.mjs",
    "run",
    "-c",
    "tests/guard/g03/scanner.config.ts",
  ],
  smoke: ["tests/guard/g03/smoke.mjs"],
};
const kind = process.argv[2];
if (!Object.hasOwn(tasks, kind) || process.argv.length !== 3)
  throw Error(
    "Choose unit/typecheck/lint/build/browser/postgres/scanner/smoke",
  );
const env = { ...process.env };
const testReferences = {
  G03_TEST_POSTGRES_BIN: env.G03_TEST_POSTGRES_BIN,
  G03_TEST_DOCKER_BINARY: env.G03_TEST_DOCKER_BINARY,
  G03_TEST_SCANNER_IMAGE: env.G03_TEST_SCANNER_IMAGE,
};
for (const key of Object.keys(env))
  if (
    /^(?:SENTINEL_|GUARD_|G0[1-6]_|GITHUB_|GITLAB_|AUTH_|WETSCAN_|OPENAI_|ANTHROPIC_|AZURE_|AWS_|GOOGLE_|PG|DATABASE_URL$|APP_URL$|NODE_OPTIONS$)/.test(
      key,
    )
  )
    delete env[key];
if (kind === "postgres" || kind === "scanner")
  for (const [key, value] of Object.entries(testReferences))
    if (value) env[key] = value;
env.NODE_OPTIONS =
  '--require "' +
  resolve("tests/auth/skip-dotenv.cjs").replaceAll("\\", "/") +
  '"';
env.NEXT_TELEMETRY_DISABLED = "1";
delete env.G03_TEST_ISOLATED_BUILD;
if (kind === "browser") {
  env.G03_TEST_ISOLATED_BUILD = "1";
  await mkdir(".local", { recursive: true });
  await writeFile(
    ".local/g03-e2e.tsconfig.json",
    JSON.stringify(
      {
        extends: "../tsconfig.build.json",
        include: ["../next-env.d.ts", "../src/**/*.ts", "../src/**/*.tsx"],
        exclude: [
          "../node_modules",
          "../tests",
          "../scripts",
          "../.local",
          "../worker/guard/installation",
        ],
      },
      null,
      2,
    ),
  );
}
await mkdir("test-results/guard-g03", { recursive: true });
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
  `test-results/guard-g03/${kind}.result.json`,
  JSON.stringify(
    {
      kind,
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode: code,
      classification: "OFFLINE_CONTROLLED_FIXTURE_NOT_LIVE_ACCEPTANCE",
      ownerRepositoryAccessed: false,
      ownerDatabaseAccessed: false,
      paidAiCalled: false,
      githubWritten: false,
    },
    null,
    2,
  ) + "\n",
);
process.exitCode = code;
