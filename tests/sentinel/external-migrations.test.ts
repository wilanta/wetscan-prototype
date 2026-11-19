import { describe, expect, it } from "vitest";
import { applyMigrations, migrationPlan } from "../../src/platform/migrations";
import { RecordingClient, fakePool } from "../platform/helpers";

const m9 = async () => (await migrationPlan()).migrations[8];
describe("S09 additive SQL review and reversal protocol - not PostgreSQL execution", () => {
  it("adds 0009 on top of an unchanged 0001-0008 prefix", async () => {
    const full = await migrationPlan();
    const s08 = await migrationPlan("0008_internal_intelligence");
    expect(full.migrations.slice(0, 8)).toEqual(s08.migrations);
    expect(full.migrations[8].version).toBe("0009_external_intelligence");
    expect(full.sha256).not.toBe(s08.sha256);
    // The reviewed S04 plan hash must not move (S05+ migrations are excluded from it).
    expect((await migrationPlan("0004_incidents")).migrations).toHaveLength(4);
  });
  it("creates seven tables, forces RLS everywhere and stays additive", async () => {
    const m = await m9();
    expect(m.up.match(/CREATE TABLE sentinel\./g)).toHaveLength(7);
    expect(m.up).toContain("FORCE ROW LEVEL SECURITY");
    expect(m.up).not.toMatch(
      /(UPDATE|DELETE FROM|ALTER TABLE)\s+sentinel\.(detection|incident|telemetry|response|notification|intel|ghost)/,
    );
    expect(m.up).not.toMatch(/INSERT INTO sentinel\.(?!ext_sources)/);
    expect(m.up).not.toMatch(/CREATE ROLE|ALTER ROLE|BYPASSRLS|DROP /);
  });
  it("keeps the global catalog free of tenant columns and project data live-only", async () => {
    const { up } = await m9();
    const catalog = up.slice(
      0,
      up.indexOf("CREATE TABLE sentinel.ext_inventory_snapshots"),
    );
    expect(catalog).not.toMatch(/workspace_id|project_id/);
    const inventory = up.slice(
      up.indexOf("CREATE TABLE sentinel.ext_inventory_snapshots"),
      up.indexOf("REVOKE ALL"),
    );
    expect(inventory).toMatch(/CHECK\(mode='live'\)/);
    expect(inventory).toContain("REFERENCES sentinel.project_bindings");
    expect(inventory).toMatch(/source_kind='repository_lockfile'/); // no guard-sourced snapshots possible
  });
  it("grants least privilege: app read-only on the catalog, worker-only catalog writes, no worker access to inventory", async () => {
    const { up } = await m9();
    const grants = up.match(/GRANT [^;]*;/g)!.join("\n");
    expect(grants).toMatch(
      /GRANT SELECT ON sentinel\.ext_sources,sentinel\.ext_runs,sentinel\.ext_advisories,sentinel\.ext_affected,sentinel\.ext_history TO wetscan_app/,
    );
    expect(grants).not.toMatch(
      /GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*ext_(sources|runs|advisories|affected|history)[^;]*TO wetscan_app/,
    );
    expect(grants).not.toMatch(/ext_inventory[^;]*TO wetscan_sentinel_worker/);
    expect(grants).not.toMatch(/PUBLIC/);
    const upd = up.match(
      /GRANT UPDATE\(([^)]*)\) ON sentinel\.ext_inventory_snapshots/,
    )![1];
    expect(upd.split(",").sort()).toEqual([
      "collected_at",
      "collected_by",
      "expires_at",
    ]); // provenance immutable
    expect(up).toMatch(
      /ext_insert[^;]*current_user=''wetscan_sentinel_worker''/,
    );
    expect(up).toMatch(/ext_scope[^;]*current_user='wetscan_app'/);
  });
  it("down refuses any populated table or sync job and only removes 0009 when untouched", async () => {
    const p = await migrationPlan();
    const run = async (occupied: boolean) => {
      const c = new RecordingClient();
      c.respond = async (sql) => ({
        rows: sql.includes("to_regclass")
          ? [{ ledger: "exists" }]
          : sql.startsWith("SELECT version,checksum")
            ? p.migrations
            : sql.includes("SELECT EXISTS")
              ? [{ occupied }]
              : [],
        rowCount: 1,
      });
      return { c, result: applyMigrations(fakePool(c), p.migrations, "down") };
    };
    const refused = await run(true);
    await expect(refused.result).rejects.toThrow("target_denied");
    expect(refused.c.calls.some((x) => x.sql.startsWith("DROP"))).toBe(false);
    expect(refused.c.calls.at(-1)?.sql).toBe("ROLLBACK");
    const ok = await run(false);
    await ok.result;
    expect(
      ok.c.calls.find((x) =>
        x.sql.startsWith("DELETE FROM platform.schema_migrations"),
      )?.values,
    ).toEqual(["0009_external_intelligence"]);
    expect(ok.c.calls.at(-1)?.sql).toBe("COMMIT");
  });
});
