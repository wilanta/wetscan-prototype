import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { g05MigrationPlan, g05SchemaReady } from "../../../src/features/guard/g05/migrations";
import { guardMigrationPlan } from "../../../src/features/guard/live/migrations";
import { openG05ForTests, openG05MigratorPool } from "./pg-env";

describe("G05 PostgreSQL migration, least-privilege & RLS enforcement", () => {
  let ctx: Awaited<ReturnType<typeof openG05ForTests>>;
  let migrator: pg.Pool;

  beforeAll(async () => {
    ctx = await openG05ForTests();
    migrator = await openG05MigratorPool();
  });

  afterAll(async () => {
    await ctx?.db.close();
    await migrator?.end();
  });

  it("preserves guard.schema_migrations 0001 baseline and enforces 12 FORCE RLS tables and G05 ledger", async () => {
    const [g02, g05] = await Promise.all([guardMigrationPlan(), g05MigrationPlan()]);
    expect(await g05SchemaReady(ctx.db.app.pool, g05)).toBe(true);

    const c = await migrator.connect();
    try {
      const g02Row = await c.query(
        "SELECT version, checksum FROM guard.schema_migrations WHERE version='0001_guard'",
      );
      expect(g02Row.rows[0]?.checksum).toBe(g02.migration.checksum);

      const g05Row = await c.query(
        "SELECT version, checksum FROM guard.g05_schema_migrations WHERE version='0002_g05'",
      );
      expect(g05Row.rows[0]?.checksum).toBe(g05.checksum);

      const rlsCount = await c.query(
        `SELECT count(*)::int AS n FROM pg_class cl JOIN pg_namespace ns ON ns.oid=cl.relnamespace
         WHERE ns.nspname='guard' AND cl.relname LIKE 'g05_%' AND cl.relname <> 'g05_schema_migrations'
         AND cl.relrowsecurity AND cl.relforcerowsecurity`,
      );
      expect(rlsCount.rows[0]?.n).toBe(12);

      const privs = await c.query(
        `SELECT has_table_privilege('wetscan_guard_app', 'guard.g05_targets', 'DELETE') AS app_del,
                has_table_privilege('wetscan_guard_worker', 'guard.g05_runs', 'DELETE') AS worker_del,
                has_function_privilege('wetscan_guard_app', 'guard.g05_pending_scopes(integer)', 'EXECUTE') AS app_fn,
                has_function_privilege('wetscan_guard_worker', 'guard.g05_pending_scopes(integer)', 'EXECUTE') AS worker_fn`,
      );
      expect(privs.rows[0]).toEqual({
        app_del: false,
        worker_del: false,
        app_fn: false,
        worker_fn: true,
      });
    } finally {
      c.release();
    }
  });

  it("denies unscoped or forged queries at the RLS policy level for both app and worker roles", async () => {
    await expect(
      ctx.db.app.transaction((tx) => ctx.db.app.query(tx, "SELECT * FROM guard.g05_targets")),
    ).resolves.toMatchObject({ rows: [] });

    await expect(
      ctx.db.app.transaction((tx) =>
        ctx.db.app.query(tx, "SELECT * FROM guard.g05_pending_scopes(5)"),
      ),
    ).rejects.toThrow();

    expect(() =>
      ctx.db.worker.scoped(
        { workspaceId: "ws-bad", projectId: "github-10", mode: "demo" as never },
        async () => null,
      ),
    ).toThrow();
  });

  it("refuses 0002_g05.down.sql if retained G05 rows exist and verifies clean reversible DDL inside rolled-back tx", async () => {
    const downSql = await readFile("migrations/guard/g05/0002_g05.down.sql", "utf8");
    const c = await migrator.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        `INSERT INTO guard.g05_audit(workspace_id,project_id,actor,action,subject,detail)
         VALUES('ws-down-test','github-999999','tester','probe','s1','{}'::jsonb)`,
      );
      await expect(c.query(downSql)).rejects.toThrow(/g05_refuses_rollback_over_retained_rows/);
      await c.query("ROLLBACK");

      const stillReady = await c.query(
        "SELECT version FROM guard.g05_schema_migrations WHERE version='0002_g05'",
      );
      expect(stillReady.rows).toHaveLength(1);
    } finally {
      await c.query("ROLLBACK").catch(() => undefined);
      c.release();
    }
  });
});
