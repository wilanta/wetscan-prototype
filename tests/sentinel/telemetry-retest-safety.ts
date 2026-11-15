import { createHash } from "node:crypto";
import type { SqlPool } from "../../src/platform/database";
import { PlatformError } from "../../src/platform/config";
import { applyMigrations, type Migration } from "../../src/platform/migrations";

const tables = [
  "platform.schema_migrations",
  "platform.module_limits",
  "sentinel.project_bindings",
  "sentinel.telemetry_sources",
  "sentinel.telemetry_credentials",
  "sentinel.telemetry_events",
  "sentinel.telemetry_batches",
  "platform.jobs",
  "platform.job_attempts",
  "platform.notification_outbox",
  "platform.notification_attempts",
  "platform.worker_heartbeats",
] as const;
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
export async function evidenceSnapshot(pool: SqlPool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const rows: Record<string, string[]> = {};
    for (const table of tables) {
      rows[table] = (
        await client.query(
          `SELECT to_jsonb(t)::text AS value FROM ${table} t ORDER BY to_jsonb(t)::text`,
        )
      ).rows.map((r) => digest(r.value));
    }
    const ledger = (
      await client.query(
        "SELECT version,checksum,applied_at::text AS applied_at FROM platform.schema_migrations ORDER BY version",
      )
    ).rows;
    const catalog = (
      await client.query(
        "SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname IN ('sentinel','platform') AND c.relkind='r' ORDER BY 1,2",
      )
    ).rows;
    const policies = (
      await client.query(
        "SELECT schemaname,tablename,policyname,qual,with_check FROM pg_policies WHERE schemaname IN ('sentinel','platform') ORDER BY 1,2,3",
      )
    ).rows;
    const roles = (
      await client.query(
        "SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolcanlogin,rolconnlimit FROM pg_roles WHERE rolname IN ('wetscan_app','wetscan_sentinel_worker','wetscan_migrator') ORDER BY rolname",
      )
    ).rows;
    const grants = (
      await client.query(
        "SELECT grantee,table_schema,table_name,privilege_type FROM information_schema.role_table_grants WHERE table_schema IN ('sentinel','platform') ORDER BY 1,2,3,4",
      )
    ).rows;
    await client.query("COMMIT");
    return {
      rows,
      ledger,
      structure: { catalog, policies, roles, grants },
      counts: Object.fromEntries(
        Object.entries(rows).map(([t, r]) => [t, r.length]),
      ),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export type EvidenceSnapshot = Awaited<ReturnType<typeof evidenceSnapshot>>;
export function verifyPreserved(
  before: EvidenceSnapshot,
  after: EvidenceSnapshot,
) {
  for (const [table, hashes] of Object.entries(before.rows)) {
    const remaining = [...after.rows[table]];
    for (const hash of hashes) {
      const index = remaining.indexOf(hash);
      if (index < 0) throw Error(`existing_evidence_changed:${table}`);
      remaining.splice(index, 1);
    }
  }
  if (
    JSON.stringify(before.ledger) !== JSON.stringify(after.ledger) ||
    JSON.stringify(before.structure) !== JSON.stringify(after.structure)
  )
    throw Error("ledger_or_permissions_changed");
}

/** Exercise the existing refusal path, with an independent SQL firewall preventing any DDL/DML. */
export async function populatedRollbackRefusal(
  pool: SqlPool,
  migrations: Migration[],
) {
  const check = await pool.connect();
  try {
    const occupied = (
      await check.query(
        "SELECT EXISTS(SELECT 1 FROM sentinel.telemetry_sources LIMIT 1) AS occupied",
      )
    ).rows[0]?.occupied;
    const ledger = (
      await check.query(
        "SELECT version,checksum FROM platform.schema_migrations ORDER BY version",
      )
    ).rows;
    if (
      !occupied ||
      JSON.stringify(ledger.map((r) => [r.version, r.checksum])) !==
        JSON.stringify(migrations.map((m) => [m.version, m.checksum]))
    )
      throw Error("BLOCKED:populated_guard_not_established");
  } finally {
    check.release();
  }
  const statements: string[] = [];
  const allowed = new Set([
    "BEGIN",
    "COMMIT",
    "ROLLBACK",
    "SELECT pg_advisory_xact_lock(7342001)",
    "SELECT to_regclass('platform.schema_migrations') AS ledger,to_regnamespace('platform') AS platform,to_regnamespace('sentinel') AS sentinel",
    "SELECT version,checksum FROM platform.schema_migrations ORDER BY version",
    "LOCK TABLE sentinel.telemetry_sources,sentinel.telemetry_credentials,sentinel.telemetry_events,sentinel.telemetry_batches,platform.jobs IN ACCESS EXCLUSIVE MODE",
    "SELECT EXISTS(SELECT 1 FROM sentinel.telemetry_sources LIMIT 1) AS occupied",
  ]);
  const guarded: SqlPool = {
    connect: async () => {
      const client = await pool.connect();
      return {
        query: async (sql, values) => {
          if (!allowed.has(sql))
            throw Error("BLOCKED:unapproved_rollback_statement");
          statements.push(sql);
          return client.query(sql, values);
        },
        release: (destroy) => client.release(destroy),
      };
    },
    end: async () => {},
  };
  try {
    await applyMigrations(guarded, migrations, "down");
  } catch (error) {
    if (
      !(error instanceof PlatformError) ||
      error.code !== "target_denied" ||
      !statements.includes(
        "SELECT EXISTS(SELECT 1 FROM sentinel.telemetry_sources LIMIT 1) AS occupied",
      ) ||
      statements.at(-1) !== "ROLLBACK"
    )
      throw error;
    return {
      status: "target_denied",
      dataOrSchemaStatementsSent: 0,
      transaction: "ROLLED_BACK",
    };
  }
  throw Error("BLOCKED:expected_rollback_refusal_missing");
}
