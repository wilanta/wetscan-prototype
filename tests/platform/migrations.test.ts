import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { migrationPlan, applyMigrations } from "../../src/platform/migrations";
import { RecordingClient, fakePool } from "./helpers";
describe("migration review/runner protocol - no SQL execution", () => {
  it("builds a stable review plan from reversible SQL pairs and role provisioning", async () => {
    const a = await migrationPlan(),
      b = await migrationPlan();
    expect(a.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(a.sha256).toBe(b.sha256);
    expect(a.migrations.map((m) => m.version)).toEqual([
      "0001_foundation",
      "0002_telemetry",
      "0003_detection",
      "0004_incidents",
      "0005_response",
      "0006_notifications",
      "0007_ghost",
      "0008_internal_intelligence",
      "0009_external_intelligence",
    ]);
    expect(a.migrations[0].up).toContain("FORCE ROW LEVEL SECURITY");
    expect(a.migrations[0].up).toContain("wetscan_sentinel_worker");
    expect(a.migrations[0].up).toContain("lease_token");
    expect(a.migrations[0].down).not.toMatch(/DROP .*CASCADE/i);
    expect(a.migrations[0].up).not.toMatch(
      /CREATE (?:SCHEMA|TABLE) (?:auth|guard|canvas)/i,
    );
    expect(a.migrations[0].up).not.toMatch(
      /CREATE TABLE.*(?:security_events|incidents|alerts|detection_rules)/i,
    );
  });
  it("refuses pre-existing unowned schema state before DDL", async () => {
    const c = new RecordingClient();
    c.respond = async (sql) => ({
      rows: sql.includes("to_regclass")
        ? [{ ledger: null, platform: "platform", sentinel: null }]
        : [],
      rowCount: 0,
    });
    await expect(
      applyMigrations(fakePool(c), (await migrationPlan()).migrations, "up"),
    ).rejects.toThrow("target_denied");
    expect(c.calls.some((x) => x.sql.startsWith("CREATE"))).toBe(false);
    expect(c.calls.at(-1)?.sql).toBe("ROLLBACK");
  });
  it("rejects altered applied checksums; does not silently replay an edited migration", async () => {
    const c = new RecordingClient();
    c.respond = async (sql) => ({
      rows: sql.includes("to_regclass")
        ? [{ ledger: "exists" }]
        : sql.includes("SELECT version,checksum")
          ? [{ version: "0001_foundation", checksum: "different" }]
          : [],
      rowCount: 0,
    });
    await expect(
      applyMigrations(fakePool(c), (await migrationPlan()).migrations, "up"),
    ).rejects.toThrow("target_denied");
    expect(c.calls.at(-1)?.sql).toBe("ROLLBACK");
  });
  it("a matching applied ledger makes up a no-op (driver protocol double)", async () => {
    const plan = await migrationPlan(),
      c = new RecordingClient();
    c.respond = async (sql) => ({
      rows: sql.includes("to_regclass")
        ? [{ ledger: "exists" }]
        : sql.includes("SELECT version,checksum")
          ? plan.migrations
          : [],
      rowCount: 0,
    });
    await applyMigrations(fakePool(c), plan.migrations, "up");
    expect(c.calls.some((x) => x.sql.includes("CREATE TABLE"))).toBe(false);
    expect(c.calls.at(-1)?.sql).toBe("COMMIT");
  });
  it("down locks owned tables and refuses any runtime data", async () => {
    const plan = await migrationPlan(),
      c = new RecordingClient();
    c.respond = async (sql) => ({
      rows: sql.includes("to_regclass")
        ? [{ ledger: "exists" }]
        : sql.includes("SELECT version,checksum")
          ? [plan.migrations[0]]
          : sql.includes("SELECT EXISTS")
            ? [{ occupied: true }]
            : [],
      rowCount: 0,
    });
    await expect(
      applyMigrations(fakePool(c), plan.migrations, "down"),
    ).rejects.toThrow("target_denied");
    expect(c.calls.some((x) => x.sql.startsWith("LOCK TABLE"))).toBe(true);
    expect(c.calls.some((x) => x.sql.startsWith("DROP"))).toBe(false);
  });
  it("Compose has explicit external volume, local binding and no initdb SQL mounts", async () => {
    const compose = await readFile("infra/sentinel/compose.yaml", "utf8");
    expect(compose).toContain("external: true");
    expect(compose).toContain("127.0.0.1:");
    expect(compose).toContain("POSTGRES_PASSWORD_FILE");
    expect(compose).not.toContain("docker-entrypoint-initdb.d");
    expect(compose).not.toContain("worker/guard");
  });
  it("telemetry up is additive, forced-RLS, and never grants worker credentials", async () => {
    const m = (await migrationPlan()).migrations[1];
    expect(m.up.match(/CREATE TABLE sentinel\./g)).toHaveLength(4);
    expect(m.up).toContain("FORCE ROW LEVEL SECURITY");
    expect(m.up).toContain("wetscan.workspace");
    expect(m.up).not.toMatch(
      /GRANT[^;]*telemetry_credentials[^;]*TO wetscan_sentinel_worker/,
    );
    expect(m.up).not.toMatch(
      /(?:DROP|TRUNCATE|ALTER TABLE) (?:platform\.|sentinel\.project_bindings)/,
    );
    expect(m.down).not.toMatch(/CASCADE|platform\.|project_bindings/);
    expect((await migrationPlan()).migrations[0].checksum).toBe(
      "dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778",
    );
  });
  it("reverses only empty telemetry, preserving populated foundation and its ledger", async () => {
    const plan = await migrationPlan(),
      c = new RecordingClient();
    plan.migrations = plan.migrations.slice(0, 2); // Exercise the unchanged S02 reversal boundary explicitly.
    c.respond = async (sql) => ({
      rows: sql.includes("to_regclass")
        ? [{ ledger: "exists" }]
        : sql.includes("SELECT version,checksum")
          ? plan.migrations
          : sql.includes("SELECT EXISTS")
            ? [{ occupied: false }]
            : [],
      rowCount: 1,
    });
    await applyMigrations(fakePool(c), plan.migrations, "down");
    expect(
      c.calls.find((call) =>
        call.sql.startsWith("DELETE FROM platform.schema_migrations"),
      )?.values,
    ).toEqual(["0002_telemetry"]);
    expect(c.calls.some((call) => call.sql.includes("DROP SCHEMA"))).toBe(
      false,
    );
    expect(
      c.calls.some((call) =>
        call.sql.includes("SELECT 1 FROM sentinel.project_bindings"),
      ),
    ).toBe(false);
    expect(c.calls.at(-1)?.sql).toBe("COMMIT");
  });
  it.each(["sources", "credentials", "events", "batches", "jobs"])(
    "refuses reversing populated S02 %s",
    async (table) => {
      const plan = await migrationPlan(),
        c = new RecordingClient();
      plan.migrations = plan.migrations.slice(0, 2);
      c.respond = async (sql) => ({
        rows: sql.includes("to_regclass")
          ? [{ ledger: "exists" }]
          : sql.includes("SELECT version,checksum")
            ? plan.migrations
            : sql.includes("SELECT EXISTS")
              ? [
                  {
                    occupied: sql.includes(
                      table === "jobs" ? "platform.jobs" : `telemetry_${table}`,
                    ),
                  },
                ]
              : [],
        rowCount: 1,
      });
      await expect(
        applyMigrations(fakePool(c), plan.migrations, "down"),
      ).rejects.toThrow("target_denied");
      expect(c.calls.some((call) => call.sql.startsWith("DROP"))).toBe(false);
      expect(c.calls.at(-1)?.sql).toBe("ROLLBACK");
    },
  );
});
