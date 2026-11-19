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

describe("S11 schema readiness is derived from the ledger, never hard-coded", () => {
  it.each([
    ["current", plan, plan],
    ["behind", plan.slice(0, 2), plan],
    ["checksum_mismatch", [plan[0], m("0002_b", "f".repeat(64))], plan],
    ["unknown_version", [...plan, m("0004_future")], plan],
    ["unverified", plan, undefined],
  ])("%s", (expected, applied, wanted) =>
    expect(schemaStatus(applied, wanted)).toBe(expected),
  );

  const health = async (
    applied: ReturnType<typeof m>[],
    wanted?: typeof plan,
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
    );
  };
  it("reports the real latest version and is ready only when the ledger matches the plan", async () => {
    const ok = await health(plan, plan);
    expect(ok).toMatchObject({
      status: "ready",
      schema: "0003_c",
      schemaStatus: "current",
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
});
