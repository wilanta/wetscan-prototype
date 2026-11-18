import { describe, it, expect } from "vitest";
import { migrationPlan, applyMigrations } from "../../src/platform/migrations";
import { RecordingClient, fakePool } from "../platform/helpers";
import {
  reviewedS04Plan,
  s04DownRefusalLockTimeoutSql,
  verifyPopulatedS04DownRefusal,
} from "./incident-acceptance-safety";

describe("S04 additive SQL and reversal protocol - not PostgreSQL execution", () => {
  it("keeps historical checksums intact and registers 0004_incidents with FORCE RLS and append-only timeline grants", async () => {
    const p = await migrationPlan();
    const m = p.migrations[3];
    expect(p.sha256).toBe(reviewedS04Plan);
    expect(p.migrations.map((x) => x.version)).toEqual([
      "0001_foundation",
      "0002_telemetry",
      "0003_detection",
      "0004_incidents",
    ]);
    expect(p.migrations[0].checksum).toBe(
      "dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778",
    );
    expect(p.migrations[1].checksum).toBe(
      "d1b67dc680f5bf3c2cbe585dca2427abf9d7ba9f29479c69b851f66b91c1f5a3",
    );
    expect(p.migrations[2].checksum).toBe(
      "4f0ee1cebdbdc81b835f719ef13c9cb703dfb5f440193765dfa0a61635fb6168",
    );
    expect(m.version).toBe("0004_incidents");
    expect(m.checksum).toBe(
      "84b5b4987e498bbb047505cd81218716357ce5f1434fb466749c7ed433141663",
    );
    expect(m.up.match(/CREATE TABLE sentinel\./g)).toHaveLength(5);
    expect(m.up).not.toMatch(
      /(?:CREATE|ALTER) (?:ROLE|SCHEMA)|CASCADE|TRUNCATE|DELETE FROM|INSERT INTO sentinel\.(?:telemetry|detection|incidents)/,
    );
    expect(m.up).toContain("FORCE ROW LEVEL SECURITY");
    expect(m.up).toContain("CHECK(verification_status='not_requested')");
    expect(m.up).toContain(
      "CHECK(event_type IN ('alert_created','incident_opened','incident_closed'))",
    );
    expect(m.up).not.toContain("policy_evaluating");
    expect(m.up).toContain(
      "GRANT UPDATE(status,updated_at,closed_at,closed_by,close_reason,last_actor_id,revision) ON sentinel.incidents TO wetscan_app",
    );
    expect(m.up).not.toMatch(/GRANT[^;]*incident_timeline[^;]*UPDATE/);
    expect(m.up).not.toMatch(
      /GRANT[^;]*(?:DELETE|INSERT)[^;]*sentinel\.incidents[^;]*TO wetscan_app/,
    );
    expect(m.down).not.toMatch(
      /CASCADE|DROP SCHEMA|detection_alerts|telemetry_events/,
    );
  });

  it.each([
    "incident_timeline_evidence",
    "incident_timeline",
    "incident_evidence",
    "incident_alerts",
    "incidents",
  ])("refuses populated S04 %s without down SQL", async (table) => {
    const p = await migrationPlan();
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
    const audit = await verifyPopulatedS04DownRefusal(
      fakePool(c),
      p.migrations,
    );
    expect(audit.blockedStatements).toEqual([]);
    expect(audit.lockTimeoutConfigured).toBe(true);
    expect(audit.clientReleased).toBe(true);
    expect(audit.inTransaction).toBe(false);
    expect(c.calls.some((x) => x.sql === s04DownRefusalLockTimeoutSql)).toBe(
      true,
    );
    expect(c.calls.some((x) => x.sql.startsWith("DROP"))).toBe(false);
    expect(c.calls.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("empty S04 reversal removes only 0004_incidents and never S01-S03 tables or data", async () => {
    const p = await migrationPlan();
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
    ).toEqual(["0004_incidents"]);
    expect(c.calls.at(-1)?.sql).toBe("COMMIT");
    expect(
      c.calls.some((x) =>
        x.sql.startsWith("DELETE FROM sentinel.detection_alerts"),
      ),
    ).toBe(false);
    expect(
      c.calls.some((x) =>
        x.sql.startsWith("DELETE FROM sentinel.telemetry_events"),
      ),
    ).toBe(false);
  });
});
