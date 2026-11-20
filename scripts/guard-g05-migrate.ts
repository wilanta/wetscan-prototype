/**
 * Standalone operator migration tool for Guard G05 (0002_g05).
 * Uses wetscan_guard_migrator credentials from GUARD_G05_DB_MIGRATION_* or GUARD_DB_MIGRATION_*.
 */
import { ApprovedPool } from "../src/platform/database";
import { guardDatabaseConfig } from "../src/features/guard/live/database-config";
import { guardMigrationPlan } from "../src/features/guard/live/migrations";
import { applyG05Schema, g05MigrationPlan } from "../src/features/guard/g05/migrations";

async function main() {
  const env = { ...process.env };
  if (env.GUARD_G05_DB_MIGRATION_APPROVAL_FILE)
    env.GUARD_DB_MIGRATION_APPROVAL_FILE = env.GUARD_G05_DB_MIGRATION_APPROVAL_FILE;
  if (env.GUARD_G05_DB_MIGRATION_PASSWORD_FILE)
    env.GUARD_DB_MIGRATION_PASSWORD_FILE = env.GUARD_G05_DB_MIGRATION_PASSWORD_FILE;
  const g02Plan = await guardMigrationPlan();
  const g05Plan = await g05MigrationPlan();
  const cfg = await guardDatabaseConfig(env, "migration", g02Plan.sha256);
  const pool = new ApprovedPool(cfg);
  try {
    const result = await applyG05Schema(
      pool,
      g05Plan,
      cfg.target.marker,
      cfg.target.database,
    );
    console.log(
      JSON.stringify({
        result,
        version: g05Plan.version,
        checksum: g05Plan.checksum,
        database: cfg.target.database,
        port: cfg.target.port,
      }),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message.slice(0, 120) : "migration_failed",
    }),
  );
  process.exitCode = 1;
});
