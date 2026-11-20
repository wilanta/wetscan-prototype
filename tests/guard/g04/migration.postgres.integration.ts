import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { guardMigrationPlan, GUARD_PLATFORM_BASELINE } from "../../../src/features/guard/live/migrations";
import { migrationPlan } from "../../../src/platform/migrations";
import { g04MigrationPlan } from "../../../src/features/guard/g04/migrations";

/**
 * Applies the real platform baseline + Guard 0001 into a THROWAWAY database inside the isolated G04 PostgreSQL container,
 * seeds a retained scan and job, then applies G04 0002 and proves nothing existing changed. The throwaway database is not
 * dropped by the test (a DROP needs explicit owner approval); it is small and named g04_migtest_<random>.
 */
const pointer = JSON.parse(readFileSync(process.env.G04_ENV_POINTER ?? join(process.env.LOCALAPPDATA ?? ".", "WetScanGuardG04", "current.json"), "utf8"));
const bootstrap = readFileSync(join(pointer.root, "bootstrap.password"), "utf8").trim();
const db = "g04_migtest_" + Math.random().toString(16).slice(2, 10);
const conn = (database: string) => new pg.Client({ host: pointer.target.host, port: pointer.target.port, database, user: "postgres", password: bootstrap });
let c: pg.Client;
const hashRows = async () => (await c.query("SELECT md5(string_agg(t::text,'|' ORDER BY scan_id)) h, count(*)::int n FROM guard.scans t")).rows[0];

beforeAll(async () => {
  const admin = conn("postgres");
  await admin.connect();
  await admin.query(`CREATE DATABASE ${db} OWNER wetscan_guard_migrator TEMPLATE template0 ENCODING 'UTF8'`);
  await admin.end();
  c = conn(db);
  await c.connect();
  const plan = await guardMigrationPlan();
  await c.query("BEGIN");
  await c.query("SET LOCAL ROLE wetscan_guard_migrator");
  await c.query("CREATE SCHEMA platform; CREATE TABLE platform.schema_migrations(version text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp()); REVOKE ALL ON SCHEMA platform FROM PUBLIC");
  for (const m of (await migrationPlan(GUARD_PLATFORM_BASELINE)).migrations) {
    await c.query(m.up);
    await c.query("INSERT INTO platform.schema_migrations(version,checksum) VALUES($1,$2)", [m.version, m.checksum]);
  }
  await c.query(plan.migration.up);
  await c.query("INSERT INTO guard.schema_migrations(version,checksum) VALUES($1,$2)", [plan.migration.version, plan.migration.checksum]);
  await c.query("RESET ROLE");
  await c.query(plan.artifacts.find((a) => a.name === "platform-access.proposed.sql")!.sql);
  // a retained historical scan, as an existing deployment would have
  await c.query("SET LOCAL ROLE wetscan_guard_migrator");
  const job = { mode: "live", workspaceId: "w1", projectId: "github-5", id: "a".repeat(64), status: "completed", repository: { provider: "github", repositoryId: "5", commit: "b".repeat(40) } };
  await c.query("ALTER TABLE guard.scans NO FORCE ROW LEVEL SECURITY");
  await c.query("INSERT INTO guard.scans(mode,workspace_id,project_id,scan_id,idempotency_key,fingerprint,repository_id,commit_sha,status,job,created_at) VALUES('live','w1','github-5',$1,'g02-live-seed-1',$2,'5',$3,'completed',$4,now())", ["a".repeat(64), "c".repeat(64), "b".repeat(40), job]);
  await c.query("ALTER TABLE guard.scans FORCE ROW LEVEL SECURITY");
  await c.query("COMMIT");
});
afterAll(async () => c?.end());

describe("G04 migration 0002 on a database that already holds Guard 0001 data", () => {
  it("applies without touching retained scans, the Guard ledger or the platform ledger; down refuses over data", async () => {
    const plan = await g04MigrationPlan();
    await c.query("SET ROLE wetscan_guard_migrator");
    const before = { scans: await hashRows(), g01: (await c.query("SELECT version,checksum FROM guard.schema_migrations")).rows, platform: (await c.query("SELECT version,checksum FROM platform.schema_migrations ORDER BY version")).rows };
    expect(before.scans.n).toBe(1);
    await c.query("BEGIN");
    await c.query(plan.up);
    await c.query("INSERT INTO guard.g04_schema_migrations(version,checksum) VALUES($1,$2)", [plan.version, plan.checksum]);
    await c.query("COMMIT");
    const after = { scans: await hashRows(), g01: (await c.query("SELECT version,checksum FROM guard.schema_migrations")).rows, platform: (await c.query("SELECT version,checksum FROM platform.schema_migrations ORDER BY version")).rows };
    expect(after).toEqual(before);
    // forced RLS on every G04 table
    const rls = (await c.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='guard' AND c.relname LIKE 'g04\\_%' AND c.relkind='r' AND c.relname<>'g04_schema_migrations' AND c.relrowsecurity AND c.relforcerowsecurity")).rows[0].n;
    expect(rls).toBe(10);
    // down is refused once any G04 row exists, and never cascades into guard.scans
    await c.query("INSERT INTO guard.g04_audit(actor,action) VALUES('t','x')");
    await expect(c.query(plan.down)).rejects.toThrow(/g04_rollback_requires_empty_tables/);
    expect((await hashRows()).n).toBe(1);
  });
  it("re-applying is rejected by the ledger primary key (the operator helper treats the same checksum as already applied)", async () => {
    await expect(c.query("INSERT INTO guard.g04_schema_migrations(version,checksum) VALUES('0002_g04','x')")).rejects.toThrow();
  });
});
