import "server-only";
import { ApprovedPool, PlatformDatabase } from "../../../platform/database";
import { guardDatabaseConfig } from "./database-config";
import { guardMigrationPlan } from "./migrations";
import { PostgresGuardStore } from "./persistence";
import { GuardLiveService, defaultReadiness } from "./service";
import { LiveGuardError } from "./model";
let cached: { key: string; pool: ApprovedPool } | undefined;
/** Off by default. Does not consume Sentinel env/password/approval or run SQL migrations. */
export async function guardLiveService() {
  if (process.env.GUARD_LIVE_READ_ENABLED !== "1")
    return new GuardLiveService(undefined, { ...defaultReadiness });
  const plan = await guardMigrationPlan(),
    config = await guardDatabaseConfig(process.env, "app", plan.sha256),
    key = JSON.stringify([config.target, plan.sha256, config.user]);
  if (cached?.key !== key) {
    if (cached) await cached.pool.end();
    cached = { key, pool: new ApprovedPool(config) };
  }
  const db = new PlatformDatabase(cached.pool, false, "guard");
  await db.transaction(async (tx) => {
    const guard = await db.query(
      tx,
      "SELECT version,checksum FROM guard.schema_migrations ORDER BY version",
    );
    if (
      guard.rows.length !== 1 ||
      guard.rows[0].version !== plan.migration.version ||
      guard.rows[0].checksum !== plan.migration.checksum
    )
      throw new LiveGuardError("approval_required");
    const platform = await db.query(
      tx,
      "SELECT version,checksum FROM platform.schema_migrations ORDER BY version",
    );
    if (JSON.stringify(platform.rows) !== JSON.stringify(plan.platformVersions))
      throw new LiveGuardError("approval_required");
  });
  return new GuardLiveService(new PostgresGuardStore(db), {
    ...defaultReadiness,
    database: "approved",
    schema: "verified",
  });
}
