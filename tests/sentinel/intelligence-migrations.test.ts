import { describe, expect, it } from "vitest";
import { applyMigrations, migrationPlan } from "../../src/platform/migrations";
import { RecordingClient, fakePool } from "../platform/helpers";

describe("S08 additive SQL review and reversal protocol - not PostgreSQL execution", () => {
  it("adds 0008 on top of an unchanged 0001-0007 prefix", async () => {
    const full = await migrationPlan();
    const s07 = await migrationPlan("0007_ghost");
    expect(full.migrations.slice(0, 7)).toEqual(s07.migrations);
    expect(full.migrations[7].version).toBe("0008_internal_intelligence");
    expect(full.sha256).not.toBe(s07.sha256);
  });
  it("creates five tables with forced RLS, live-only mode and no automatic enablement", async () => {
    const m = (await migrationPlan()).migrations[7];
    expect(m.up.match(/CREATE TABLE sentinel\./g)).toHaveLength(5);
    expect(m.up).toContain("FORCE ROW LEVEL SECURITY");
    expect(m.up).toMatch(/CHECK\(mode='live'\)/);
    expect(m.up).toContain("review_status text NOT NULL DEFAULT 'DRAFT'");
    // Never touches the detection rule tables or incident/telemetry tables with DML/DDL.
    expect(m.up).not.toMatch(
      /(INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE)\s+sentinel\.(detection|incident|telemetry)/,
    );
    expect(m.up).not.toMatch(/ENABLED/);
    expect(m.up).not.toMatch(/CREATE ROLE|ALTER ROLE|BYPASSRLS/);
  });
  it("keeps evidence refs free of telemetry foreign keys so retention stays independent", async () => {
    const m = (await migrationPlan()).migrations[7];
    const evidence = m.up.slice(
      m.up.indexOf("CREATE TABLE sentinel.intel_case_evidence"),
      m.up.indexOf("CREATE TABLE sentinel.intel_candidates"),
    );
    expect(evidence).not.toMatch(/REFERENCES sentinel\.(telemetry|incident)/);
    const cases = m.up.slice(
      0,
      m.up.indexOf("CREATE TABLE sentinel.intel_case_evidence"),
    );
    expect(cases).not.toMatch(/REFERENCES sentinel\.incidents/);
  });
  it("grants least privilege: append-only audit/evidence, immutable provenance, read-only worker", async () => {
    const m = (await migrationPlan()).migrations[7];
    expect(m.up).not.toMatch(/GRANT[^;]*(UPDATE|DELETE|ALL)[^;]*intel_audit/);
    expect(m.up).not.toMatch(
      /GRANT[^;]*(UPDATE|DELETE|ALL)[^;]*intel_case_evidence/,
    );
    expect(m.up).not.toMatch(
      /GRANT[^;]*(UPDATE|DELETE|ALL)[^;]*intel_candidate_cases/,
    );
    expect(m.up).not.toMatch(/GRANT[^;]*DELETE/);
    const caseUpdate = m.up.match(
      /GRANT UPDATE\(([^)]*)\) ON sentinel\.intel_cases/,
    )![1];
    expect(caseUpdate.split(",").sort()).toEqual([
      "revision",
      "shelf_state",
      "status",
      "tags",
      "updated_at",
    ]);
    const candUpdate = m.up.match(
      /GRANT UPDATE\(([^)]*)\) ON sentinel\.intel_candidates/,
    )![1];
    expect(candUpdate).not.toMatch(
      /definition|basis|signature|origin|proposed_by/,
    );
    expect(m.up).toMatch(
      /GRANT SELECT ON sentinel\.intel_cases TO wetscan_sentinel_worker/,
    );
    expect(m.up).not.toMatch(
      /GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*TO wetscan_sentinel_worker/,
    );
  });
  it("constrains candidate lifecycle in SQL: approve before validate before promote", async () => {
    const m = (await migrationPlan()).migrations[7];
    expect(m.up).toContain("validated_at IS NULL OR review_status='APPROVED'");
    expect(m.up).toContain("promoted_at IS NULL OR validated_at IS NOT NULL");
    expect(m.up).toContain(
      "UNIQUE(mode,workspace_id,project_id,origin,signature,grouping_version)",
    );
  });
  it("down refuses a populated table and only removes 0008 when empty", async () => {
    // Pinned: the S08 reversal protocol is exercised against the plan whose latest migration is 0008.
    const p = await migrationPlan("0008_internal_intelligence");
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
    ).toEqual(["0008_internal_intelligence"]);
    expect(ok.c.calls.at(-1)?.sql).toBe("COMMIT");
  });
});
