import { spawn } from "node:child_process";
import { approvedDatabaseConfig, PlatformError } from "../src/platform/config";
import { migrationPlan } from "../src/platform/migrations";

async function main() {
  const plan = await migrationPlan();
  // Validate every permission BEFORE launching Vitest. This step never opens a database pool.
  await approvedDatabaseConfig(
    process.env,
    "app",
    "integration_test",
    plan.sha256,
  );
  await approvedDatabaseConfig(
    process.env,
    "worker",
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
  const child = spawn(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--config",
      "tests/platform/postgres.config.ts",
    ],
    {
      env: { ...process.env, SENTINEL_POSTGRES_TEST_APPROVED: "1" },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  child.once("error", () => {
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "BLOCKED_H01",
      reason:
        error instanceof PlatformError ? error.code : "configuration_invalid",
      databaseConnections: 0,
      migrationsApplied: 0,
    }),
  );
  process.exitCode = 2;
});
