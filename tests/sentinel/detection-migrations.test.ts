import { describe, it, expect } from "vitest";
import { migrationPlan, applyMigrations } from "../../src/platform/migrations";
import { RecordingClient, fakePool } from "../platform/helpers";
describe("S03 additive SQL and reversal protocol - not PostgreSQL execution", () => {
  it("keeps historical checksums and limits new ownership to Sentinel", async () => {
    const p = await migrationPlan(),
      m = p.migrations[2];
    expect(p.migrations[0].checksum).toBe(
      "dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778",
    );
    expect(p.migrations[1].checksum).toBe(
      "d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3",
    );
    expect(m.version).toBe("0003_detection");
    expect(m.up.match(/CREATE TABLE sentinel\./g)).toHaveLength(8);
    expect(m.up).not.toMatch(
      /(?:CREATE|ALTER) (?:ROLE|SCHEMA)|CASCADE|TRUNCATE|DELETE FROM|INSERT INTO sentinel\.telemetry/,
    );
    expect(m.up).toContain("FORCE ROW LEVEL SECURITY");
    expect(m.up).toContain("DEFERRABLE INITIALLY DEFERRED");
    expect(m.up).not.toMatch(/GRANT[^;]*telemetry_credentials/);
    expect(m.up).not.toMatch(/GRANT[^;]*detection_rule_versions[^;]*UPDATE/);
    expect(m.down).not.toMatch(/CASCADE|DROP SCHEMA|telemetry_events;/);
  });
  it.each([
    "detection_suppressed_evidence",
    "detection_evidence",
    "detection_evaluations",
    "detection_cooldowns",
    "detection_alerts",
    "detection_audit",
    "detection_rule_versions",
    "detection_rules",
  ])("refuses populated S03 %s without down SQL", async (table) => {
    const p = await migrationPlan(),
      c = new RecordingClient();
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
    ).rejects.toThrow("target_denied");
    expect(c.calls.some((x) => x.sql.startsWith("DROP"))).toBe(false);
    expect(c.calls.at(-1)?.sql).toBe("ROLLBACK");
  });
  it("empty S03 reversal removes only 0003 and never S02 data", async () => {
    const p = await migrationPlan(),
      c = new RecordingClient();
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
    ).toEqual(["0003_detection"]);
    expect(c.calls.at(-1)?.sql).toBe("COMMIT");
    expect(
      c.calls.some((x) => x.sql.startsWith("DELETE FROM sentinel.telemetry")),
    ).toBe(false);
  });
});
