import { spawn } from "node:child_process";
import { approvedDatabaseConfig, PlatformError } from "../src/platform/config";
import { migrationPlan } from "../src/platform/migrations";
async function run(config: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      // Owner acceptance instruction: stop on the first unexpected test/SQL failure.
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--bail=1",
        "--reporter=verbose",
        "--config",
        config,
      ],
      {
        env: {
          ...process.env,
          SENTINEL_POSTGRES_TEST_APPROVED: "1",
          SENTINEL_TELEMETRY_TEST_APPROVED: "1",
        },
        stdio: "inherit",
        windowsHide: true,
      },
    );
    child.once("error", () =>
      reject(new PlatformError("database_unavailable")),
    );
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new PlatformError("database_unavailable")),
    );
  });
}
async function main() {
  const plan = await migrationPlan();
  // No connection, child process or SQL before every exact-plan/test-target permission is checked.
  for (const purpose of ["app", "worker"] as const)
    await approvedDatabaseConfig(
      process.env,
      purpose,
      "integration_test",
      plan.sha256,
    );
  await approvedDatabaseConfig(process.env, "worker", "runtime", plan.sha256);
  await approvedDatabaseConfig(
    process.env,
    "migration",
    "migrate_up",
    plan.sha256,
  );
  await approvedDatabaseConfig(
    process.env,
    "migration",
    "migrate_down",
    plan.sha256,
  );
  // S01 reversibility sequence must precede any S02 fixture rows. It refuses populated S02 tables.
  await run("tests/platform/postgres.config.ts");
  await run("tests/sentinel/telemetry-postgres.config.ts");
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "BLOCKED_OR_FAILED",
      reason:
        error instanceof PlatformError ? error.code : "configuration_invalid",
    }),
  );
  process.exitCode = 2;
});
