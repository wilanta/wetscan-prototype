import { describe, expect, it } from "vitest";
import { RecordingClient, fakePool } from "../platform/helpers";
import {
  populatedRollbackRefusal,
  verifyPreserved,
  type EvidenceSnapshot,
} from "./telemetry-retest-safety";
const migration = {
  version: "0002_telemetry",
  checksum: "a".repeat(64),
  up: "CREATE TABLE forbidden()",
  down: "DROP TABLE forbidden",
};
function fixture(populated: boolean, changesAfterPrecheck = false) {
  const client = new RecordingClient();
  let occupationChecks = 0;
  client.respond = async (sql) => ({
    rows: sql.includes("AS occupied")
      ? [
          {
            occupied:
              ++occupationChecks === 1 || !changesAfterPrecheck
                ? populated
                : false,
          },
        ]
      : sql.includes("AS ledger")
        ? [{ ledger: "platform.schema_migrations" }]
        : sql.includes("SELECT version,checksum")
          ? [{ version: migration.version, checksum: migration.checksum }]
          : [],
    rowCount: 1,
  });
  return { client, pool: fakePool(client) };
}
describe("populated retest protection (SQL doubles)", () => {
  it("checks occupied state and exercises genuine refusal without DDL/DML", async () => {
    const { pool, client } = fixture(true);
    expect(await populatedRollbackRefusal(pool, [migration])).toEqual({
      status: "target_denied",
      dataOrSchemaStatementsSent: 0,
      transaction: "ROLLED_BACK",
    });
    expect(
      client.calls.some((c) =>
        /^(DROP|DELETE|CREATE|INSERT|UPDATE)/.test(c.sql),
      ),
    ).toBe(false);
  });
  it("blocks an empty precheck before calling the migration runner", async () => {
    const { pool, client } = fixture(false);
    await expect(populatedRollbackRefusal(pool, [migration])).rejects.toThrow(
      "populated_guard_not_established",
    );
    expect(client.calls.some((c) => c.sql === "BEGIN")).toBe(false);
  });
  it("independently blocks unexpected SQL if populated state changes", async () => {
    const { pool, client } = fixture(true, true);
    await expect(populatedRollbackRefusal(pool, [migration])).rejects.toThrow(
      "unapproved_rollback_statement",
    );
    expect(client.calls.some((c) => c.sql === migration.down)).toBe(false);
    expect(client.calls.at(-1)?.sql).toBe("ROLLBACK");
  });
  it("allows new fixture fingerprints while detecting modification/removal of old evidence", () => {
    const before = {
      rows: { events: ["old"] },
      ledger: [],
      structure: { catalog: [], policies: [], roles: [], grants: [] },
      counts: { events: 1 },
    } as EvidenceSnapshot;
    expect(() =>
      verifyPreserved(before, { ...before, rows: { events: ["old", "new"] } }),
    ).not.toThrow();
    expect(() =>
      verifyPreserved(before, { ...before, rows: { events: ["new"] } }),
    ).toThrow("existing_evidence_changed");
  });
});
