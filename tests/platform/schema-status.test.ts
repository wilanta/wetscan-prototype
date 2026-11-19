import { describe, expect, it } from "vitest";
import { PlatformDatabase } from "../../src/platform/database";
import { platformHealth, schemaStatus } from "../../src/platform/health";
import { RecordingClient, fakePool } from "./helpers";

const m = (
  version: string,
  checksum = version.slice(0, 4).padEnd(64, "a"),
) => ({
  version,
  checksum,
});
const plan = [m("0001_a"), m("0002_b"), m("0003_c")];
const ahead = (...v: string[]) => v.map((x) => m(x));

describe("S11 schema readiness is derived from the ledger, never hard-coded", () => {
  it.each([
    ["current", plan, plan, undefined],
    ["unverified", plan, undefined, undefined],
    // a required migration is missing
    ["behind", plan.slice(0, 2), plan, undefined],
    ["behind", [plan[0], plan[2]], plan, undefined],
    // overlapping version with a different checksum is checked FIRST, even when the DB is also ahead
    [
      "checksum_mismatch",
      [plan[0], m("0002_b", "f".repeat(64)), plan[2]],
      plan,
      undefined,
    ],
    [
      "checksum_mismatch",
      [plan[0], m("0002_b", "f".repeat(64)), plan[2], ...ahead("0004_d")],
      plan,
      "0004_d",
    ],
    // a missing required migration is never hidden by newer ones
    ["behind", [plan[0], plan[2], ...ahead("0004_d")], plan, "0004_d"],
  ] as const)("%s", (expected, applied, wanted, accepted) =>
    expect(
      schemaStatus(applied, wanted, { acceptAheadThrough: accepted }),
    ).toBe(expected),
  );

  describe("database ahead of the code", () => {
    const applied = [...plan, ...ahead("0004_d", "0005_e")];
    it("is ahead_compatible only for a gap-free suffix the operator accepted through that version", () => {
      expect(
        schemaStatus(applied, plan, { acceptAheadThrough: "0005_e" }),
      ).toBe("ahead_compatible");
      expect(
        schemaStatus(applied, plan, { acceptAheadThrough: "0009_z" }),
      ).toBe("ahead_compatible");
      expect(
        schemaStatus(ahead(...plan.map((x) => x.version), "0004_d"), plan, {
          acceptAheadThrough: "0004_d",
        }),
      ).toBe("ahead_compatible");
    });
    it.each([
      ["no operator acceptance", applied, undefined],
      ["acceptance stops short of the newest migration", applied, "0004_d"],
      ["malformed acceptance value", applied, "0005"],
      ["a gap in the suffix", [...plan, ...ahead("0005_e")], "0005_e"],
      [
        "suffix does not start right after the code's last migration",
        [...plan, ...ahead("0006_f")],
        "0006_f",
      ],
      [
        "malformed extra version name",
        [...plan, ...ahead("0004_Bad-Name")],
        "0004_Bad-Name",
      ],
      [
        "malformed extra checksum",
        [...plan, m("0004_d", "not-a-sha")],
        "0004_d",
      ],
      [
        "an unrelated version that sorts before the code's last migration",
        [...plan, ...ahead("0002_other")],
        "0009_z",
      ],
    ])("is ahead_unverified (never safe): %s", (_n, rows, accepted) =>
      expect(schemaStatus(rows, plan, { acceptAheadThrough: accepted })).toBe(
        "ahead_unverified",
      ),
    );
  });

  const health = async (
    applied: ReturnType<typeof m>[],
    wanted?: typeof plan,
    accepted?: string,
  ) => {
    const client = new RecordingClient();
    client.respond = async (sql) => {
      if (sql.includes("version FROM platform.schema_migrations WHERE"))
        return { rows: [{ version: "0001_foundation" }], rowCount: 1 };
      if (sql.includes("ORDER BY version"))
        return { rows: applied, rowCount: applied.length };
      if (sql.includes("worker_heartbeats"))
        return { rows: [{ fresh: 1 }], rowCount: 1 };
      if (sql.includes("FROM platform.jobs"))
        return {
          rows: [
            { queued: 0, leased: 0, expired: 0, failed: 0, lag_seconds: 0 },
          ],
          rowCount: 1,
        };
      return { rows: [{ n: 0 }], rowCount: 1 };
    };
    return platformHealth(
      new PlatformDatabase(fakePool(client), true),
      undefined,
      wanted,
      {
        acceptAheadThrough: accepted,
      },
    );
  };
  it("reports the real latest version and is ready only when the ledger matches the plan", async () => {
    expect(await health(plan, plan)).toMatchObject({
      status: "ready",
      schema: "0003_c",
      schemaStatus: "current",
      warnings: [],
    });
  });
  it("is degraded (HTTP 503 in the worker) when migrations are behind or mismatched", async () => {
    expect(await health(plan.slice(0, 1), plan)).toMatchObject({
      status: "degraded",
      schemaStatus: "behind",
    });
    expect(
      await health([plan[0], m("0002_b", "f".repeat(64))], plan),
    ).toMatchObject({
      status: "degraded",
      schemaStatus: "checksum_mismatch",
    });
  });
  it("an older worker on a verified, accepted, additive-ahead database stays ready and says so in a warning", async () => {
    expect(
      await health([...plan, ...ahead("0004_d")], plan, "0004_d"),
    ).toMatchObject({
      status: "ready",
      schema: "0004_d",
      schemaStatus: "ahead_compatible",
      warnings: ["schema_ahead_of_code:0004_d"],
    });
  });
  it("the same database without operator acceptance, or with a gap, is degraded", async () => {
    expect(await health([...plan, ...ahead("0004_d")], plan)).toMatchObject({
      status: "degraded",
      schemaStatus: "ahead_unverified",
      warnings: [],
    });
    expect(
      await health([...plan, ...ahead("0005_e")], plan, "0005_e"),
    ).toMatchObject({
      status: "degraded",
      schemaStatus: "ahead_unverified",
    });
  });
});
