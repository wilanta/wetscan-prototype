// Local validation only: never loads dotenv or starts an actual scanner/worker/database job.
import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import { randomUUID } from "node:crypto";
const kind = process.argv[2],
  id = randomUUID();
const raw = join("test-results", `guard-continuation-unit.${id}.json`);
const tasks = {
  typecheck: ["node_modules/typescript/bin/tsc", "--noEmit"],
  lint: ["node_modules/eslint/bin/eslint.js", "."],
  unit: [
    "node_modules/vitest/vitest.mjs",
    "run",
    "--reporter=default",
    "--reporter=json",
    `--outputFile=${raw}`,
  ],
  build: ["node_modules/next/dist/bin/next", "build"],
};
if (!Object.hasOwn(tasks, kind) || process.argv.length !== 3)
  throw Error("Choose exactly typecheck/lint/unit/build");
const env = { ...process.env };
for (const key of Object.keys(env))
  if (
    /^(?:SENTINEL_|GUARD_|GITHUB_|AUTH_|WETSCAN_|PG|DATABASE_URL$|APP_URL$)/.test(
      key,
    )
  )
    delete env[key];
env.NODE_OPTIONS = `--require "${resolve("tests/auth/skip-dotenv.cjs").replaceAll("\\", "/")}"`;
env.NEXT_TELEMETRY_DISABLED = "1";
await mkdir("test-results", { recursive: true });
const startedAt = new Date().toISOString();
let exitCode = await new Promise((done) => {
  const child = spawn(process.execPath, tasks[kind], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  child.once("error", () => done(2));
  child.once("exit", (code) => done(code ?? 2));
});
let counts;
if (kind === "build" && exitCode === 0) {
  counts = { nftFiles: 0, sensitiveLocalReferences: 0 };
  const walk = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const file = join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.name.endsWith(".nft.json")) {
        counts.nftFiles++;
        const trace = JSON.parse(await readFile(file, "utf8"));
        counts.sensitiveLocalReferences += (trace.files ?? []).filter(
          (name) =>
            !name.includes("node_modules") &&
            /(?:^|[\\/])\.env(?:[.\\/]|$)|(?:^|[\\/])\.local[\\/]/i.test(name),
        ).length;
      }
    }
  };
  await walk(".next/server");
  if (counts.sensitiveLocalReferences !== 0) exitCode = 2;
}
if (kind === "unit")
  try {
    const result = JSON.parse(await readFile(raw, "utf8"));
    counts = {
      tests: result.numTotalTests,
      passed: result.numPassedTests,
      failed: result.numFailedTests,
      pending: result.numPendingTests,
      files: result.testResults.length,
      failedFiles: result.testResults
        .filter((v) => v.status !== "passed")
        .map((v) => relative(process.cwd(), v.name).replaceAll("\\", "/")),
    };
  } catch {
    counts = { reportUnavailable: true };
  }
const summary = {
  classification: "OFFLINE_VALIDATION",
  kind,
  startedAt,
  endedAt: new Date().toISOString(),
  exitCode,
  command: ["node", ...tasks[kind]],
  dotenvLoaded: false,
  runtimeMutation: "NOT_RUN",
  scannerExecution: "NOT_RUN",
  counts,
};
const directory = "docs/acceptance/guard-g01/remaining-gates-v3/validation";
await mkdir(directory, { recursive: true });
const file = join(directory, `${kind}.${id}.json`);
await writeFile(file, JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ summaryFile: file, ...summary }));
process.exitCode = exitCode;
