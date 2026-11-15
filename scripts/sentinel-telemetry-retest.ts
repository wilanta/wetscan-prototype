import { spawn } from "node:child_process";
import { approvedDatabaseConfig, PlatformError } from "../src/platform/config";
import { migrationPlan } from "../src/platform/migrations";
async function main() {
  const plan = await migrationPlan();
  if (
    plan.sha256 !==
    "9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9"
  )
    throw new PlatformError("target_denied");
  for (const purpose of ["app", "worker", "migration"] as const) {
    const config = await approvedDatabaseConfig(
      process.env,
      purpose,
      "integration_test",
      plan.sha256,
    );
    if (
      config.target.host !== "127.0.0.1" ||
      config.target.port !== 55432 ||
      config.target.database !== "wetscan_s01_test" ||
      config.target.marker !==
        "wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5"
    )
      throw new PlatformError("target_denied");
  }
  await approvedDatabaseConfig(
    process.env,
    "migration",
    "migrate_down",
    plan.sha256,
  );
  // No S01 setup, migrate_up, runtime precheck, empty reversal, worker or emitter.
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--bail=1",
        "--reporter=verbose",
        "--config",
        "tests/sentinel/telemetry-retest.config.ts",
      ],
      {
        env: {
          ...process.env,
          SENTINEL_TELEMETRY_RETEST_APPROVED: "1",
          SENTINEL_TELEMETRY_TEST_APPROVED: "1",
        },
        stdio: "inherit",
        windowsHide: true,
      },
    );
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 2));
  });
  process.exitCode = code;
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "BLOCKED_OR_FAILED",
      reason: error instanceof PlatformError ? error.code : "retest_failed",
    }),
  );
  process.exitCode = 2;
});
