import type { SqlPool } from "../../../platform/database";
import { validateGuardApproval } from "./database-config";
import { LiveGuardError } from "./model";
import type { guardMigrationPlan } from "./migrations";
/** Explicit schema-only operator operation. Never called by app/worker or automatically. */
export async function applyGuardSchema(
  pool: SqlPool,
  plan: Awaited<ReturnType<typeof guardMigrationPlan>>,
  approval: unknown,
) {
  const permit = validateGuardApproval(approval, "migration", plan.sha256);
  const client = await pool.connect();
  let destroyed = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(7342002)");
    const identity = (
      await client.query(
        "SELECT current_database() AS database,current_user AS username,shobj_description(d.oid,'pg_database') AS marker FROM pg_database d WHERE d.datname=current_database()",
      )
    ).rows[0];
    if (
      !identity ||
      identity.database !== permit.target.database ||
      identity.username !== permit.role ||
      identity.marker !== permit.target.marker
    )
      throw new LiveGuardError("approval_required");
    const before = (
      await client.query(
        "SELECT version,checksum FROM platform.schema_migrations ORDER BY version",
      )
    ).rows;
    if (JSON.stringify(before) !== JSON.stringify(plan.platformVersions))
      throw new LiveGuardError("approval_required");
    const existing = (
      await client.query(
        "SELECT to_regclass('guard.schema_migrations') AS ledger,to_regnamespace('guard') AS schema",
      )
    ).rows[0];
    if (existing.ledger) {
      const rows = (
        await client.query(
          "SELECT version,checksum FROM guard.schema_migrations ORDER BY version",
        )
      ).rows;
      if (
        rows.length !== 1 ||
        rows[0].version !== plan.migration.version ||
        rows[0].checksum !== plan.migration.checksum
      )
        throw new LiveGuardError("revision_conflict", 409);
      await client.query("COMMIT");
      return { status: "already_applied" };
    }
    if (existing.schema) throw new LiveGuardError("approval_required");
    await client.query(plan.migration.up);
    await client.query(
      "INSERT INTO guard.schema_migrations(version,checksum) VALUES($1,$2)",
      [plan.migration.version, plan.migration.checksum],
    );
    const after = (
      await client.query(
        "SELECT version,checksum FROM platform.schema_migrations ORDER BY version",
      )
    ).rows;
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new LiveGuardError("revision_conflict", 409);
    await client.query("COMMIT");
    return { status: "applied" };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      destroyed = true;
    }
    throw error;
  } finally {
    client.release(destroyed);
  }
}
