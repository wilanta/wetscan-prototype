import "server-only";
import { approvedDatabaseConfig } from "../../../platform/config";
import { ApprovedPool, PlatformDatabase } from "../../../platform/database";
import { migrationPlan } from "../../../platform/migrations";
import { TelemetryStore } from "../telemetry/store";
import { TelemetryError } from "../telemetry/validation";

let cached: { key: string; pool: ApprovedPool } | undefined;
/** Approval remains operator-controlled. Never reads Auth dotenv or ambient PG URLs. */
export async function telemetryStore() {
  const plan = await migrationPlan();
  const config = await approvedDatabaseConfig(
    process.env,
    "app",
    "runtime",
    plan.sha256,
  );
  const key = JSON.stringify([config.target, plan.sha256, config.user]);
  if (cached?.key !== key) {
    if (cached) await cached.pool.end();
    cached = { key, pool: new ApprovedPool(config) };
  }
  const db = new PlatformDatabase(cached.pool);
  await db.transaction(async (tx) => {
    const rows = (
      await db.query(
        tx,
        "SELECT version,checksum FROM platform.schema_migrations ORDER BY version",
      )
    ).rows;
    if (
      rows.length !== plan.migrations.length ||
      rows.some(
        (row, i) =>
          row.version !== plan.migrations[i].version ||
          row.checksum !== plan.migrations[i].checksum,
      )
    )
      throw new TelemetryError("migration_not_ready", 503);
  });
  return new TelemetryStore(db);
}
