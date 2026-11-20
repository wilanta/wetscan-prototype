import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SqlClient, SqlPool } from "@/platform/database";

export const G06_VERSION = "0002_g06";

export async function g06MigrationPlan(root = process.cwd()) {
  const dir = join(root, "migrations", "guard", "g06");
  const up = await readFile(join(dir, `${G06_VERSION}.up.sql`), "utf8");
  const down = await readFile(join(dir, `${G06_VERSION}.down.sql`), "utf8");
  const sha256 = createHash("sha256")
    .update(up)
    .update("\0")
    .update(down)
    .digest("hex");
  return {
    version: G06_VERSION,
    up,
    down,
    upChecksum: createHash("sha256").update(up).digest("hex"),
    sha256,
  };
}

export type G06Plan = Awaited<ReturnType<typeof g06MigrationPlan>>;

async function runStatements(client: SqlClient, sql: string) {
  await client.query(sql);
}

export async function applyG06Schema(
  pool: SqlPool,
  plan: G06Plan,
  direction: "up" | "down" = "up",
  expected?: { marker: string; database: string },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (expected) {
      const check = (
        await client.query<{
          d: string;
          u: string;
          o: string;
          m: string | null;
        }>(
          "SELECT current_database() d, current_user u, (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) o, (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()) m",
        )
      ).rows[0];
      if (
        check.d !== expected.database ||
        check.m !== expected.marker ||
        check.u !== "wetscan_guard_migrator" ||
        check.o !== "wetscan_guard_migrator"
      ) {
        throw new Error("g06_migration_target_denied");
      }
    }
    if (direction === "up") {
      await client.query("CREATE SCHEMA IF NOT EXISTS guard");
      const ledgerExists = await client.query<{ reg: string | null }>(
        "SELECT to_regclass('guard.g06_schema_migrations')::text AS reg",
      );
      if (ledgerExists.rows[0]?.reg) {
        const applied = await client.query<{ checksum: string }>(
          "SELECT checksum FROM guard.g06_schema_migrations WHERE version=$1",
          [plan.version],
        );
        if (applied.rows[0]) {
          if (applied.rows[0].checksum !== plan.sha256) {
            throw new Error("g06_migration_checksum_mismatch");
          }
          await client.query("COMMIT");
          return { applied: false, checksum: plan.sha256 };
        }
      }
      await runStatements(client, plan.up);
      await client.query(
        "INSERT INTO guard.g06_schema_migrations(version,checksum) VALUES($1,$2) ON CONFLICT (version) DO NOTHING",
        [plan.version, plan.sha256],
      );
      await client.query("COMMIT");
      return { applied: true, checksum: plan.sha256 };
    }

    await runStatements(client, plan.down);
    await client.query("COMMIT");
    return { applied: true, checksum: plan.sha256 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function g06SchemaReady(pool: SqlPool, plan: G06Plan) {
  const client = await pool.connect();
  try {
    const r = await client.query<{ checksum: string }>(
      "SELECT checksum FROM guard.g06_schema_migrations WHERE version=$1",
      [plan.version],
    );
    return r.rows[0]?.checksum === plan.sha256;
  } catch {
    return false;
  } finally {
    client.release();
  }
}
