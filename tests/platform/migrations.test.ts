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
    expect(a.migrations.map((m) => m.version)).toEqual(["0001_foundation"]);
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
          ? [plan.migrations[0]]
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
});
