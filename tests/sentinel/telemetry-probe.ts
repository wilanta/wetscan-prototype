// Child-process restart probe. Only launched by the separately approved test suite.
import { approvedDatabaseConfig } from "../../src/platform/config";
import { ApprovedPool, PlatformDatabase } from "../../src/platform/database";
import { migrationPlan } from "../../src/platform/migrations";
import { TelemetryStore } from "../../src/features/sentinel/telemetry/store";
async function main() {
  if (process.env.SENTINEL_TELEMETRY_TEST_APPROVED !== "1") throw Error();
  const context = JSON.parse(process.env.SENTINEL_TEST_CONTEXT ?? "null");
  if (!context?.scope?.workspaceId?.match(/^github-user-7:s02-/)) throw Error();
  const plan = await migrationPlan(),
    config = await approvedDatabaseConfig(
      process.env,
      "app",
      "integration_test",
      plan.sha256,
    ),
    pool = new ApprovedPool(config);
  try {
    const page = await new TelemetryStore(new PlatformDatabase(pool)).events(
      context,
      new URLSearchParams(),
    );
    console.log(JSON.stringify({ count: page.items.length }));
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error("telemetry_probe_failed");
  process.exitCode = 1;
});
