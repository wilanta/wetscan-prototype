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
    const c = await approvedDatabaseConfig(
      process.env,
      purpose,
      "integration_test",
      plan.sha256,
    );
    if (
      c.target.host !== "127.0.0.1" ||
      c.target.port !== 55432 ||
      c.target.database !== "wetscan_s01_test" ||
      c.target.marker !== "wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5"
    )
      throw new PlatformError("target_denied");
  }
  const code = await new Promise<number>((resolve, reject) => {
    const p = spawn(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--bail=1",
        "--reporter=verbose",
        "--config",
        "tests/sentinel/retention-postgres.config.ts",
      ],
      {
        env: { ...process.env, SENTINEL_RETENTION_TEST_APPROVED: "1" },
        stdio: "inherit",
        windowsHide: true,
      },
    );
    p.once("error", reject);
    p.once("exit", (code) => resolve(code ?? 2));
  });
  process.exitCode = code;
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "BLOCKED_OR_FAILED",
      reason:
        error instanceof PlatformError ? error.code : "retention_test_failed",
    }),
  );
  process.exitCode = 2;
});
