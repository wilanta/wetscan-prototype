import { spawn } from "node:child_process";
import {
  approvedDatabaseConfig,
  PlatformError,
  parseApproval,
} from "../src/platform/config";
import { migrationPlan } from "../src/platform/migrations";
import {
  acceptancePermission,
  reviewedS03Plan,
} from "../tests/sentinel/detection-acceptance-safety";

async function main() {
  const plan = await migrationPlan();
  if (plan.sha256 !== reviewedS03Plan)
    throw new PlatformError("approval_required");
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
    parseApproval(c.approval, c.target, "migrate_up", plan.sha256);
    parseApproval(c.approval, c.target, "migrate_down", plan.sha256); // Refusal probe only; SQL firewall below never permits down DDL.
    await acceptancePermission(c.approval);
  }
  process.exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--bail=1",
        "--reporter=verbose",
        "--config",
        "tests/sentinel/detection-postgres.config.ts",
      ],
      {
        env: { ...process.env, SENTINEL_S03_ACCEPTANCE_RUN: "1" },
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
      reason: e instanceof PlatformError ? e.code : "s03_acceptance_failed",
      secretsLogged: false,
    }),
  );
  process.exitCode = 2;
});
