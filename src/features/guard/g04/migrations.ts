import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { SqlPool } from "../../../platform/database";

/** G04 owns its own migration ledger (guard.g04_schema_migrations), so the frozen Guard 0001 plan hash and its approvals never change. */
export const G04_VERSION = "0002_g04";
export async function g04MigrationPlan(root = process.cwd()) {
  const dir = join(root, "migrations", "guard", "g04"),
    read = async (n: string) => (await readFile(join(dir, n), "utf8")).replace(/\r\n/g, "\n");
  const up = await read("0002_g04.up.sql"),
    down = await read("0002_g04.down.sql");
  return { version: G04_VERSION, up, down, checksum: createHash("sha256").update(up + "\0" + down).digest("hex") };
}
export type G04Plan = Awaited<ReturnType<typeof g04MigrationPlan>>;

/** Operator operation, never run by app/worker. Idempotent: re-applying the same checksum is a no-op; a different one refuses. */
export async function applyG04Schema(pool: SqlPool, plan: G04Plan, expectedMarker: string, expectedDatabase: string) {
  const c = await pool.connect();
  let destroy = false;
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(7342004)");
    const id = (await c.query("SELECT current_database() d, current_user u, shobj_description(d.oid,'pg_database') m FROM pg_database d WHERE d.datname=current_database()")).rows[0];
    if (!id || id.d !== expectedDatabase || id.u !== "wetscan_guard_migrator" || id.m !== expectedMarker) throw new Error("g04_target_identity_mismatch");
    const g01 = (await c.query("SELECT to_regclass('guard.schema_migrations') AS l, to_regclass('guard.g04_schema_migrations') AS g")).rows[0];
    if (!g01.l) throw new Error("g04_requires_guard_0001");
    if (g01.g) {
      const rows = (await c.query("SELECT version,checksum FROM guard.g04_schema_migrations")).rows;
      if (rows.length !== 1 || rows[0].version !== plan.version || rows[0].checksum !== plan.checksum) throw new Error("g04_ledger_conflict");
      await c.query("COMMIT");
      return "already_applied" as const;
    }
    await c.query(plan.up);
    await c.query("INSERT INTO guard.g04_schema_migrations(version,checksum) VALUES($1,$2)", [plan.version, plan.checksum]);
    await c.query("COMMIT");
    return "applied" as const;
  } catch (e) {
    try {
      await c.query("ROLLBACK");
    } catch {
      destroy = true;
    }
    throw e;
  } finally {
    c.release(destroy);
  }
}
/** Cheap readiness check for app/worker: the ledger row exists and matches this build's checksum. */
export async function g04SchemaReady(pool: SqlPool, plan: G04Plan) {
  const c = await pool.connect();
  try {
    const r = await c.query("SELECT version,checksum FROM guard.g04_schema_migrations");
    return r.rows.length === 1 && r.rows[0].version === plan.version && r.rows[0].checksum === plan.checksum;
  } catch {
    return false;
  } finally {
    c.release();
  }
}
