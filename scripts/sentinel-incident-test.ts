import { spawn } from "node:child_process";
import {
  approvedDatabaseConfig,
  PlatformError,
  parseApproval,
} from "../src/platform/config";
import { migrationPlan } from "../src/platform/migrations";
import {
  incidentAcceptancePermission,
  reviewedS04Plan,
} from "../tests/sentinel/incident-acceptance-safety";

async function main() {
  for (const purpose of ["app", "worker", "migration"] as const) {
    const c = await approvedDatabaseConfig(
      process.env,
      purpose,
      "integration_test",
      reviewedS04Plan,
    );
    if (
      c.target.host !== "127.0.0.1" ||
      c.target.port !== 55432 ||
      c.target.database !== "wetscan_s01_test" ||
      c.target.marker !== "wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5"
    )
      throw new PlatformError("target_denied");
    parseApproval(c.approval, c.target, "migrate_up", reviewedS04Plan);
    await incidentAcceptancePermission(c.approval);
  }
  const plan = await migrationPlan();
  if (plan.sha256 !== reviewedS04Plan)
    throw new PlatformError("approval_required");
  process.exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--bail=1",
        "--reporter=verbose",
        "--config",
        "tests/sentinel/incident-postgres.config.ts",
      ],
      {
        env: { ...process.env, SENTINEL_S04_ACCEPTANCE_RUN: "1" },
        stdio: "inherit",
        windowsHide: true,
      },
    );
    child.once("error", reject);
    child.once("exit", (c) => resolve(c ?? 2));
  });
}
main().catch((e) => {
  console.error(
    JSON.stringify({
      status: "BLOCKED_OR_FAILED",
      reason: e instanceof PlatformError ? e.code : "s04_acceptance_failed",
      secretsLogged: false,
    }),
  );
  process.exitCode = 2;
});
