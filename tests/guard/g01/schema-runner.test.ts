import { expect, it } from "vitest";
import { guardMigrationPlan } from "../../../src/features/guard/live/migrations";
import { applyGuardSchema } from "../../../src/features/guard/live/schema-runner";
import { RecordingClient, fakePool } from "../../platform/helpers";
async function setup(existing = false) {
  const plan = await guardMigrationPlan(),
    client = new RecordingClient(),
    approval = {
      schemaVersion: 1,
      status: "APPROVED",
      module: "guard",
      purpose: "migration",
      role: "wetscan_guard_migrator",
      approvedBy: "unit-test-only",
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      actions: ["migrate_up"],
      migrationPlanSha256: plan.sha256,
      target: {
        host: "127.0.0.1",
        port: 55432,
        database: "wetscan_dev_guardg01",
        marker: "wetscan-s01:11111111-1111-1111-1111-111111111111",
      },
    };
  client.respond = async (sql) => ({
    rows: sql.startsWith("SELECT current_database")
      ? [
          {
            database: approval.target.database,
            username: approval.role,
            marker: approval.target.marker,
          },
        ]
      : sql.startsWith("SELECT version,checksum FROM platform")
        ? plan.platformVersions
        : sql.startsWith("SELECT to_regclass")
          ? [
              {
                ledger: existing ? "guard.schema_migrations" : null,
                schema: existing ? "guard" : null,
              },
            ]
          : sql.startsWith("SELECT version,checksum FROM guard")
            ? [
                {
                  version: plan.migration.version,
                  checksum: plan.migration.checksum,
                },
              ]
            : [],
    rowCount: 0,
  });
  return { plan, client, approval, pool: fakePool(client) };
}
it("requires exact Guard migration approval before even requesting a client", async () => {
  const f = await setup();
  await expect(
    applyGuardSchema(f.pool, f.plan, { ...f.approval, module: "sentinel" }),
  ).rejects.toThrow("approval_required");
  expect(f.pool.connect).not.toHaveBeenCalled();
});
it("applies the Guard schema once, preserves platform ledger and uses its own ledger", async () => {
  const f = await setup();
  expect(await applyGuardSchema(f.pool, f.plan, f.approval)).toEqual({
    status: "applied",
  });
  expect(
    f.client.calls.some((c) =>
      c.sql.startsWith("INSERT INTO guard.schema_migrations"),
    ),
  ).toBe(true);
  expect(
    f.client.calls.some((c) =>
      c.sql.startsWith("INSERT INTO platform.schema_migrations"),
    ),
  ).toBe(false);
  expect(f.client.calls.at(-1)?.sql).toBe("COMMIT");
});
it("is idempotent for a verified matching ledger and rejects an altered baseline transactionally", async () => {
  const f = await setup(true);
  expect(await applyGuardSchema(f.pool, f.plan, f.approval)).toEqual({
    status: "already_applied",
  });
  expect(f.client.calls.some((c) => c.sql === f.plan.migration.up)).toBe(false);
  const g = await setup();
  const respond = g.client.respond;
  g.client.respond = async (sql, args) =>
    sql.startsWith("SELECT version,checksum FROM platform")
      ? { rows: [{ version: "unknown", checksum: "changed" }], rowCount: 1 }
      : respond(sql, args);
  await expect(applyGuardSchema(g.pool, g.plan, g.approval)).rejects.toThrow();
  expect(g.client.calls.at(-1)?.sql).toBe("ROLLBACK");
  expect(g.client.calls.some((c) => c.sql === g.plan.migration.up)).toBe(false);
});
