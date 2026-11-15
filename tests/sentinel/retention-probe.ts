// A bounded, separately approved child, not the Sentinel worker process.
import { readFile } from "node:fs/promises";
import { approvedDatabaseConfig } from "../../src/platform/config";
import { ApprovedPool, PlatformDatabase } from "../../src/platform/database";
import { migrationPlan } from "../../src/platform/migrations";
import { retainTelemetry } from "../../src/features/sentinel/telemetry/store";
async function main() {
  if (process.env.SENTINEL_RETENTION_TEST_APPROVED !== "1") throw Error();
  const scope = JSON.parse(process.env.SENTINEL_RETENTION_SCOPE ?? "null");
  const approval = JSON.parse(
    await readFile(process.env.SENTINEL_DB_APPROVAL_FILE!, "utf8"),
  );
  if (
    !scope?.workspaceId?.startsWith("github-user-7:s02-retention-") ||
    JSON.stringify(scope) !== JSON.stringify(approval.disposableScope)
  )
    throw Error();
  const plan = await migrationPlan();
  const config = await approvedDatabaseConfig(
    process.env,
    "worker",
    "integration_test",
    plan.sha256,
  );
  if (
    plan.sha256 !==
      "9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9" ||
    config.target.database !== "wetscan_s01_test"
  )
    throw Error();
  const pool = new ApprovedPool(config);
  try {
    console.log(
      JSON.stringify(
        await retainTelemetry(new PlatformDatabase(pool, true), scope),
      ),
    );
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error("retention_probe_failed");
  process.exitCode = 1;
});
