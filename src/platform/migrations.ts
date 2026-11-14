import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { SqlPool } from "./database";
import { PlatformError } from "./config";

export interface Migration {
  version: string;
  up: string;
  down: string;
  checksum: string;
}
export async function migrationPlan(
  directory = join(process.cwd(), "migrations", "sentinel"),
) {
  const files = (await readdir(directory))
    .filter((f) => /^\d{4}_[a-z_]+\.up\.sql$/.test(f))
    .sort();
  if (!files.length) throw new PlatformError("invalid_input");
  const migrations: Migration[] = [];
  for (const file of files) {
    const version = file.replace(/\.up\.sql$/, "");
    const up = await readFile(join(directory, file), "utf8"),
      down = await readFile(join(directory, `${version}.down.sql`), "utf8");
    // Normalize Git's Windows newline conversion for stable review/checksum identity.
    const normalized = {
      up: up.replace(/\r\n/g, "\n"),
      down: down.replace(/\r\n/g, "\n"),
    };
    migrations.push({
      version,
      ...normalized,
      checksum: createHash("sha256")
        .update(normalized.up + "\0" + normalized.down)
        .digest("hex"),
    });
  }
  const roles = (
    await readFile(
      join(directory, "..", "..", "infra", "sentinel", "provision-roles.sql"),
      "utf8",
    )
  ).replace(/\r\n/g, "\n");
  const sha256 = createHash("sha256")
    .update(
      JSON.stringify(
        migrations.map(({ version, checksum }) => ({ version, checksum })),
      ),
    )
    .update(roles)
    .digest("hex");
  return { sha256, migrations };
}
/** Dedicated client + advisory lock + one transaction; never called by worker/app startup. */
export async function applyMigrations(
  pool: SqlPool,
  migrations: Migration[],
  direction: "up" | "down",
) {
  const client = await pool.connect();
  let destroy = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(7342001)");
    const schema = (
      await client.query(
        "SELECT to_regclass('platform.schema_migrations') AS ledger,to_regnamespace('platform') AS platform,to_regnamespace('sentinel') AS sentinel",
      )
    ).rows[0];
    if (!schema.ledger) {
      if (direction === "down" || schema.platform || schema.sentinel)
        throw new PlatformError("target_denied");
      await client.query("CREATE SCHEMA platform");
      await client.query(
        `CREATE TABLE platform.schema_migrations(version text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`,
      );
      await client.query("REVOKE ALL ON SCHEMA platform FROM PUBLIC");
    }
    const applied = (
      await client.query(
        "SELECT version,checksum FROM platform.schema_migrations ORDER BY version",
      )
    ).rows;
    for (const [index, row] of applied.entries()) {
      const expected = migrations[index];
      if (
        !expected ||
        expected.version !== row.version ||
        expected.checksum !== row.checksum
      )
        throw new PlatformError("target_denied");
    }
    if (direction === "up") {
      for (const m of migrations.slice(applied.length)) {
        await client.query(m.up);
        await client.query(
          "INSERT INTO platform.schema_migrations(version,checksum) VALUES($1,$2)",
          [m.version, m.checksum],
        );
      }
    } else {
      if (applied.length !== migrations.length || migrations.length !== 1)
        throw new PlatformError("target_denied");
      await client.query(
        "LOCK TABLE platform.jobs,platform.job_attempts,platform.notification_outbox,platform.notification_attempts,platform.worker_heartbeats,platform.module_limits,sentinel.project_bindings IN ACCESS EXCLUSIVE MODE",
      );
      const foreignModule = await client.query(
        "SELECT EXISTS(SELECT 1 FROM platform.module_limits WHERE module<>'sentinel') AS occupied",
      );
      if (foreignModule.rows[0].occupied)
        throw new PlatformError("target_denied");
      // Rollback refuses existing data, unknown/later dependencies and active workers. No CASCADE or force option.
      for (const table of [
        "platform.jobs",
        "platform.job_attempts",
        "platform.notification_outbox",
        "platform.notification_attempts",
        "platform.worker_heartbeats",
        "sentinel.project_bindings",
      ]) {
        const count = await client.query(
          `SELECT EXISTS(SELECT 1 FROM ${table} LIMIT 1) AS occupied`,
        );
        if (count.rows[0].occupied) throw new PlatformError("target_denied");
      }
      await client.query(migrations[0].down);
      await client.query(
        "DELETE FROM platform.schema_migrations WHERE version=$1",
        [migrations[0].version],
      );
      await client.query("DROP TABLE platform.schema_migrations");
      await client.query("DROP SCHEMA platform");
    }
    await client.query("COMMIT");
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
