import { approvedDatabaseConfig, PlatformError } from "../src/platform/config";
import { ApprovedPool, PlatformDatabase } from "../src/platform/database";
import { platformHealth } from "../src/platform/health";
import { migrationPlan } from "../src/platform/migrations";

async function main() {
  const plan = await migrationPlan();
  const config = await approvedDatabaseConfig(
    process.env,
    "worker",
    "runtime",
    plan.sha256,
  );
  const pool = new ApprovedPool(config);
  try {
    console.log(
      JSON.stringify(
        await platformHealth(
          new PlatformDatabase(pool, true),
          undefined,
          plan.migrations,
          {
            acceptAheadThrough:
              process.env.SENTINEL_SCHEMA_AHEAD_ACCEPTED_THROUGH,
          },
        ),
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.log(
    JSON.stringify({
      status: "not_configured",
      database: "not_connected",
      worker: "not_started",
      reason:
        error instanceof PlatformError ? error.code : "database_unavailable",
      telemetry: "not_implemented",
    }),
  );
});
