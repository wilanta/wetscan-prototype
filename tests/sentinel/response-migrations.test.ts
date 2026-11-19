import { describe, it, expect } from "vitest";
import { migrationPlan, applyMigrations } from "../../src/platform/migrations";
import { RecordingClient, fakePool } from "../platform/helpers";
import { reviewedS04Plan } from "./incident-acceptance-safety";

describe("S05 additive SQL and reversal protocol - not PostgreSQL execution", () => {
  it("leaves 0001-0004 and the reviewed S04 plan untouched", async () => {
    const full = await migrationPlan();
    const s04 = await migrationPlan("0004_incidents");
    expect(s04.sha256).toBe(reviewedS04Plan);
    expect(full.migrations.slice(0, 4)).toEqual(s04.migrations);
    expect(full.migrations[4].version).toBe("0005_response");
  });
  it("up enables FORCE RLS and scope policy on every table; audit is append-only", async () => {
    const m = (await migrationPlan()).migrations[4];
    expect(m.up.match(/CREATE TABLE sentinel\./g)).toHaveLength(3);
    expect(m.up).toContain("FORCE ROW LEVEL SECURITY");
    for (const t of ["response_targets", "response_actions", "response_audit"])
      expect(m.up).toContain(`'${t}'`);
    expect(m.up).toMatch(/CHECK\(mode='live'\)/);
    // No runtime role may update/delete audit rows or write targets.
    expect(m.up).not.toMatch(
      /GRANT[^;]*(UPDATE|DELETE|ALL)[^;]*response_audit/,
    );
    expect(m.up).not.toMatch(
      /GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*response_targets/,
    );
    expect(m.up).toContain("response_one_active_per_target");
    expect(m.up).not.toMatch(/ALTER TABLE sentinel\.(incidents|incident_)/);
    expect(m.up).not.toMatch(/DROP |TRUNCATE|CASCADE/i);
    expect(m.down).not.toMatch(/CASCADE/i);
  });
  it.each(["response_audit", "response_actions", "response_targets"])(
    "down refuses populated %s without running down SQL",
    async (table) => {
      const p = await migrationPlan("0005_response");
      const c = new RecordingClient();
      c.respond = async (sql) => ({
        rows: sql.includes("to_regclass")
          ? [{ ledger: "exists" }]
          : sql.startsWith("SELECT version,checksum")
            ? p.migrations
            : sql.includes("SELECT EXISTS")
              ? [{ occupied: sql.includes(`FROM sentinel.${table} `) }]
              : [],
        rowCount: 1,
      });
      await expect(
        applyMigrations(fakePool(c), p.migrations, "down"),
      ).rejects.toThrow();
      expect(c.calls.some((x) => x.sql.startsWith("DROP"))).toBe(false);
      expect(c.calls.at(-1)?.sql).toBe("ROLLBACK");
    },
  );
  it("down refuses queued response jobs", async () => {
    const p = await migrationPlan("0005_response");
    const c = new RecordingClient();
    c.respond = async (sql) => ({
      rows: sql.includes("to_regclass")
        ? [{ ledger: "exists" }]
        : sql.startsWith("SELECT version,checksum")
          ? p.migrations
          : sql.includes("kind LIKE")
            ? [{ occupied: true }]
            : sql.includes("SELECT EXISTS")
              ? [{ occupied: false }]
              : [],
      rowCount: 1,
    });
    await expect(
      applyMigrations(fakePool(c), p.migrations, "down"),
    ).rejects.toThrow();
  });
  it("empty reversal removes only 0005_response", async () => {
    const p = await migrationPlan("0005_response");
    const c = new RecordingClient();
    c.respond = async (sql) => ({
      rows: sql.includes("to_regclass")
        ? [{ ledger: "exists" }]
        : sql.startsWith("SELECT version,checksum")
          ? p.migrations
          : sql.includes("SELECT EXISTS")
            ? [{ occupied: false }]
            : [],
      rowCount: 1,
    });
    await applyMigrations(fakePool(c), p.migrations, "down");
    expect(
      c.calls.find((x) =>
        x.sql.startsWith("DELETE FROM platform.schema_migrations"),
      )?.values,
    ).toEqual(["0005_response"]);
    expect(c.calls.at(-1)?.sql).toBe("COMMIT");
  });
});
