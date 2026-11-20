import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { SqlPool } from "../../../platform/database";

/** G05 owns its own migration ledger (guard.g05_schema_migrations), preserving the frozen Guard 0001 plan hash and G02/G04 independence. */
export const G05_VERSION = "0002_g05";

export async function g05MigrationPlan(root = process.cwd()) {
  const dir = join(root, "migrations", "guard", "g05");
  const read = async (name: string) =>
    (await readFile(join(dir, name), "utf8")).replace(/\r\n/g, "\n");
  const up = await read("0002_g05.up.sql");
  const down = await read("0002_g05.down.sql");
  return {
    version: G05_VERSION,
    up,
    down,
    checksum: createHash("sha256").update(up + "\0" + down).digest("hex"),
  };
}

export type G05Plan = Awaited<ReturnType<typeof g05MigrationPlan>>;

/** Operator operation, never invoked by HTTP handlers or worker startup. Idempotent for matching checksum; fails closed on drift. */
export async function applyG05Schema(
  pool: SqlPool,
  plan: G05Plan,
  expectedMarker: string,
  expectedDatabase: string,
) {
  const client = await pool.connect();
  let destroy = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(7342005)");
    const id = (
      await client.query(
        "SELECT current_database() d, current_user u, shobj_description(d.oid,'pg_database') m FROM pg_database d WHERE d.datname=current_database()",
      )
    ).rows[0];
    if (
      !id ||
      id.d !== expectedDatabase ||
      id.u !== "wetscan_guard_migrator" ||
      id.m !== expectedMarker
    )
      throw new Error("g05_target_identity_mismatch");
    const status = (
      await client.query(
        "SELECT to_regclass('guard.schema_migrations') AS g01, to_regclass('guard.g05_schema_migrations') AS g05",
      )
    ).rows[0];
    if (!status.g01) throw new Error("g05_requires_guard_0001");
    if (status.g05) {
      const rows = (
        await client.query("SELECT version,checksum FROM guard.g05_schema_migrations")
      ).rows;
      if (
        rows.length !== 1 ||
        rows[0].version !== plan.version ||
        rows[0].checksum !== plan.checksum
      )
        throw new Error("g05_ledger_conflict");
      await client.query("COMMIT");
      return "already_applied" as const;
    }
    await client.query(plan.up);
    await client.query(
      "INSERT INTO guard.g05_schema_migrations(version,checksum) VALUES($1,$2)",
      [plan.version, plan.checksum],
    );
    await client.query("COMMIT");
    return "applied" as const;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      destroy = true;
    }
    throw error;
  } finally {
    client.release(destroy);
  }
}

export async function g05SchemaReady(pool: SqlPool, plan: G05Plan) {
  const client = await pool.connect();
  try {
    const r = await client.query(
      "SELECT version,checksum FROM guard.g05_schema_migrations",
    );
    return (
      r.rows.length === 1 &&
      r.rows[0].version === plan.version &&
      r.rows[0].checksum === plan.checksum
    );
  } catch {
    return false;
  } finally {
    client.release();
  }
}
