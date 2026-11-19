import { describe, expect, it } from "vitest";
import { migrationPlan, applyMigrations } from "../../src/platform/migrations";
import { RecordingClient, fakePool } from "../platform/helpers";
import { reviewedS04Plan } from "./incident-acceptance-safety";

describe("S07 additive SQL and reversal protocol - not PostgreSQL execution", () => {
  it("preserves 0001-0006 checksums, S04 reviewed plan, and S06 plan prefix", async () => {
    const full = await migrationPlan();
    const s04 = await migrationPlan("0004_incidents");
    const s06 = await migrationPlan("0006_notifications");
    expect(s04.sha256).toBe(reviewedS04Plan);
    expect(full.migrations.slice(0, 6)).toEqual(s06.migrations);
    expect(full.migrations.map((m) => m.version)).toEqual([
      "0001_foundation",
      "0002_telemetry",
      "0003_detection",
      "0004_incidents",
      "0005_response",
      "0006_notifications",
      "0007_ghost",
    ]);
    expect(full.sha256).not.toBe(s06.sha256);
  });

  it("enables FORCE RLS, default-disabled decoys, immutable provenance grants, and append-only audit", async () => {
    const m = (await migrationPlan()).migrations[6];
    expect(m.version).toBe("0007_ghost");
    expect(m.up.match(/CREATE TABLE sentinel\./g)).toHaveLength(2);
    expect(m.up).toContain("FORCE ROW LEVEL SECURITY");
    expect(m.up).toContain("enabled boolean NOT NULL DEFAULT false");
    expect(m.up).toMatch(/CHECK\(mode='live'\)/);
    expect(m.up).toContain(
      "owned_app_confirmed boolean NOT NULL CHECK(owned_app_confirmed)",
    );
    // Append-only audit: neither app nor worker gets UPDATE or DELETE on ghost_audit
    expect(m.up).not.toMatch(/GRANT[^;]*(UPDATE|DELETE|ALL)[^;]*ghost_audit/);
    // Worker cannot mutate ghost_decoys or ghost_audit
    expect(m.up).not.toMatch(
      /GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*ghost_(decoys|audit)[^;]*wetscan_sentinel_worker/,
    );
    // App cannot overwrite source_id, origin, environment, owned_app_confirmed
    expect(m.up).not.toMatch(
      /GRANT UPDATE\([^)]*(source_id|origin|environment|owned_app_confirmed)[^)]*\) ON sentinel\.ghost_decoys/,
    );
    expect(m.up).not.toMatch(
      /ALTER TABLE sentinel\.(telemetry_|detection_|incident|response_|notification_)/,
    );
    expect(m.up).not.toMatch(/DROP |TRUNCATE|CASCADE/i);
    expect(m.down).not.toMatch(/CASCADE/i);
  });

  it.each(["ghost_audit", "ghost_decoys"])(
    "down refuses populated %s without running DROP SQL",
    async (table) => {
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
      await expect(
        applyMigrations(fakePool(c), p.migrations, "down"),
      ).rejects.toThrow("target_denied");
      expect(c.calls.some((x) => x.sql.startsWith("DROP"))).toBe(false);
      expect(c.calls.at(-1)?.sql).toBe("ROLLBACK");
    },
  );

  it("empty reversal removes only 0007_ghost", async () => {
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
    ).toEqual(["0007_ghost"]);
    expect(c.calls.at(-1)?.sql).toBe("COMMIT");
  });
});
