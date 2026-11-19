import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { RecordingClient, fakePool } from "../../platform/helpers";
import { guardMigrationPlan } from "../../../src/features/guard/live/migrations";
import { alreadyAppliedOnly } from "../../../worker/guard/acceptance/schema";
import { fixtureTarget } from "../../../worker/guard/acceptance/catalog";
it("L01 offline: invokes the actual schema runner on its already_applied branch with session-default readonly, no DDL and a destroyed dedicated session", async () => {
  const plan = await guardMigrationPlan(),
    client = new RecordingClient(),
    pool = fakePool(client),
    approval = {
      schemaVersion: 1,
      status: "APPROVED",
      module: "guard",
      purpose: "migration",
      role: "wetscan_guard_migrator",
      approvedBy: "OFFLINE_SYNTHETIC",
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      actions: ["migrate_up"],
      target: fixtureTarget,
      migrationPlanSha256: plan.sha256,
    };
  client.respond = async (sql) => ({
    rows: sql.startsWith("SELECT current_database")
      ? [
          {
            database: fixtureTarget.database,
            username: approval.role,
            marker: fixtureTarget.marker,
          },
        ]
      : sql.startsWith("SELECT version,checksum FROM platform")
        ? plan.platformVersions
        : sql.startsWith("SELECT to_regclass")
          ? [{ ledger: "guard.schema_migrations", schema: "guard" }]
          : sql.startsWith("SELECT version,checksum FROM guard")
            ? [
                {
                  version: plan.migration.version,
                  checksum: plan.migration.checksum,
                },
              ]
            : [],
    rowCount: 1,
  });
  expect(await alreadyAppliedOnly(pool, plan, approval)).toMatchObject({
    status: "already_applied",
    ddlStatements: 0,
  });
  expect(client.calls[0].sql).toBe("SET default_transaction_read_only=on");
  expect(
    client.calls.some((v) =>
      /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(v.sql),
    ),
  ).toBe(false);
  expect(client.release).toHaveBeenCalledWith(true);
  expect(pool.end).toHaveBeenCalledOnce();
});
it("L01 offline: mismatched ledger never invokes migration BEGIN/up and still destroys its private session", async () => {
  const plan = await guardMigrationPlan(),
    client = new RecordingClient(),
    pool = fakePool(client);
  client.respond = async () => ({
    rows: [{ version: "altered", checksum: "altered" }],
    rowCount: 1,
  });
  await expect(alreadyAppliedOnly(pool, plan, {})).rejects.toThrow(
    "revision_conflict",
  );
  expect(
    client.calls.some((v) => v.sql === "BEGIN" || v.sql === plan.migration.up),
  ).toBe(false);
  expect(client.release).toHaveBeenCalledWith(true);
});
it("L02 offline: prepared owner SQL retains the canonical nonempty-scope refusal and contains no destructive statement", async () => {
  const sql = await readFile(
      "docs/acceptance/guard-g01/remaining-gates-v1/operator/retained-data-down-refusal.READONLY.sql",
      "utf8",
    ),
    plan = await guardMigrationPlan();
  for (const predicate of [
    "EXISTS(SELECT 1 FROM guard.scans)",
    "EXISTS(SELECT 1 FROM platform.jobs WHERE module='guard')",
    "EXISTS(SELECT 1 FROM platform.worker_heartbeats WHERE module='guard' AND status<>'stopped')",
  ]) {
    expect(sql).toContain(predicate);
    expect(plan.migration.down).toContain(predicate);
  }
  const statements = sql
    .split("\n")
    .filter((v) => !v.trim().startsWith("--"))
    .join("\n");
  expect(statements).toContain("READ ONLY");
  expect(statements).not.toMatch(
    /\b(?:DROP|DELETE|CREATE|ALTER|TRUNCATE|INSERT|UPDATE)\b/i,
  );
  expect(statements).toContain(
    "unexpected_empty_scope_stop_no_down_authorized",
  );
});
