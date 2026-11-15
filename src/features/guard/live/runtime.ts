import "server-only";
import { ApprovedPool, PlatformDatabase } from "../../../platform/database";
import { guardDatabaseConfig } from "./database-config";
import { guardMigrationPlan } from "./migrations";
import { PostgresGuardStore } from "./persistence";
import { GuardLiveService, defaultReadiness } from "./service";
import { verifyGuardSchema } from "./schema-readiness";
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
  await verifyGuardSchema(db, plan);
  return new GuardLiveService(new PostgresGuardStore(db), {
    ...defaultReadiness,
    database: "approved",
    schema: "verified",
  });
}
