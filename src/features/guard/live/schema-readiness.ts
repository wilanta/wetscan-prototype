import type { PlatformDatabase } from "../../../platform/database";
import type { guardMigrationPlan } from "./migrations";
import { LiveGuardError } from "./model";
export async function verifyGuardSchema(
  db: PlatformDatabase,
  plan: Awaited<ReturnType<typeof guardMigrationPlan>>,
) {
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
}
