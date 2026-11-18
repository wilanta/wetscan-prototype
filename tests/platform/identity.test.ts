import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import type { ApprovedDatabaseConfig } from "../../src/platform/config";

const driver = vi.hoisted(() => {
  const client = { query: vi.fn(), release: vi.fn() };
  const pool = { connect: vi.fn(), end: vi.fn(), on: vi.fn() };
  const Pool = vi.fn(function () {
    return pool;
  });
  return { client, pool, Pool };
});
vi.mock("pg", () => ({ default: { Pool: driver.Pool } }));
import {
  ApprovedPool,
  type DatabaseConnectionEvent,
} from "../../src/platform/database";
import { approvedDatabaseConfig } from "../../src/platform/config";

const target = {
  host: "127.0.0.1",
  port: 55432,
  database: "wetscan_s01_test",
  marker: "wetscan-s01:00000000-0000-4000-8000-000000000001",
};
const config = (): ApprovedDatabaseConfig => ({
  target,
  purpose: "migration",
  user: "wetscan_migrator",
  password: randomBytes(32).toString("hex"),
  max: 1,
  approval: {
    schemaVersion: 1,
    status: "APPROVED",
    approvedBy: "UNIT TEST DOUBLE",
    approvedAt: new Date().toISOString(),
    target,
    actions: ["migrate_up"],
    migrationPlanSha256: "a".repeat(64),
  },
});
const identity = () => ({
  database: target.database,
  username: "wetscan_migrator",
  marker: target.marker,
  rolsuper: false,
  rolbypassrls: false,
  version: 170012,
});
beforeEach(() => {
  vi.clearAllMocks();
  driver.pool.connect.mockResolvedValue(driver.client);
  // PostgreSQL stores database comments in the shared catalog. The old function yields NULL.
  driver.client.query.mockImplementation(async (sql: string) => ({
    rows: [
      {
        ...identity(),
        marker: /\bshobj_description\(d\.oid, 'pg_database'\)/.test(sql)
          ? target.marker
          : null,
      },
    ],
  }));
});

describe("ApprovedPool identity regression - PostgreSQL driver double", () => {
  it("reports connection refusal before identity queries without changing the thrown error", async () => {
    const error = Object.assign(new Error("PRIVATE DRIVER MESSAGE"), {
      code: "ECONNREFUSED",
    });
    driver.pool.connect.mockRejectedValueOnce(error);
    const events: DatabaseConnectionEvent[] = [];
    await expect(
      new ApprovedPool(config(), (event) => events.push(event)).connect(),
    ).rejects.toBe(error);
    expect(events).toEqual([{ stage: "connect_attempt" }]);
    expect(driver.client.query).not.toHaveBeenCalled();
    expect(driver.client.release).not.toHaveBeenCalled();
  });
  it.each([
    ["database", { database: "wrong" }],
    ["role", { username: "wrong" }],
    ["marker", { marker: "wrong" }],
    ["superuser", { rolsuper: true }],
    ["bypassrls", { rolbypassrls: true }],
    ["version", { version: 160000 }],
  ])(
    "reports static %s rejection without disclosing observed identity",
    async (reason, wrong) => {
      driver.client.query.mockResolvedValueOnce({
        rows: [{ ...identity(), ...wrong }],
      });
      const events: DatabaseConnectionEvent[] = [];
      await expect(
        new ApprovedPool(config(), (event) => events.push(event)).connect(),
      ).rejects.toMatchObject({ code: "target_denied" });
      expect(events).toEqual([
        { stage: "connect_attempt" },
        { stage: "identity_query" },
        { stage: "identity_rejected", reason },
      ]);
      expect(driver.client.release).toHaveBeenCalledExactlyOnceWith(true);
    },
  );
  it("diagnostic observer errors cannot authorize a rejected identity or reject a valid identity", async () => {
    const observer = () => {
      throw new Error("observer fixture failure");
    };
    driver.client.query.mockResolvedValueOnce({
      rows: [{ ...identity(), marker: "wrong" }],
    });
    await expect(
      new ApprovedPool(config(), observer).connect(),
    ).rejects.toMatchObject({ code: "target_denied" });
    expect(driver.client.release).toHaveBeenCalledExactlyOnceWith(true);
    expect(await new ApprovedPool(config(), observer).connect()).toBe(
      driver.client,
    );
  });
  it("distinguishes identity-query failure from successful identity verification", async () => {
    const events: DatabaseConnectionEvent[] = [];
    driver.client.query.mockRejectedValueOnce(new Error("PRIVATE SQL MESSAGE"));
    await expect(
      new ApprovedPool(config(), (event) => events.push(event)).connect(),
    ).rejects.toMatchObject({ code: "target_denied" });
    expect(events).toEqual([
      { stage: "connect_attempt" },
      { stage: "identity_query" },
    ]);
    events.length = 0;
    await new ApprovedPool(config(), (event) => events.push(event)).connect();
    expect(events.at(-1)).toEqual({ stage: "identity_verified" });
  });
  it("accepts the approved marker read from the shared database comment catalog", async () => {
    const pool = new ApprovedPool(config());
    expect(await pool.connect()).toBe(driver.client);
    expect(driver.client.release).not.toHaveBeenCalled();
    expect(driver.Pool).toHaveBeenCalledWith(
      expect.objectContaining({
        host: target.host,
        port: target.port,
        database: target.database,
        user: "wetscan_migrator",
      }),
    );
    driver.client.release();
  });
  it.each([
    [
      "incorrect marker",
      { marker: "wetscan-s01:00000000-0000-4000-8000-000000000002" },
    ],
    ["missing marker", { marker: null }],
    ["incorrect database", { database: "wetscan_dev" }],
    ["incorrect role", { username: "wetscan_app" }],
    ["superuser role", { rolsuper: true }],
    ["RLS bypass role", { rolbypassrls: true }],
    ["unsupported version", { version: 160016 }],
  ])("rejects %s and destroys that connection", async (_name, wrong) => {
    driver.client.query.mockResolvedValueOnce({
      rows: [{ ...identity(), ...wrong }],
    });
    await expect(new ApprovedPool(config()).connect()).rejects.toMatchObject({
      code: "target_denied",
    });
    expect(driver.client.release).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("rejects an absent identity row", async () => {
    driver.client.query.mockResolvedValueOnce({ rows: [] });
    await expect(new ApprovedPool(config()).connect()).rejects.toMatchObject({
      code: "target_denied",
    });
    expect(driver.client.release).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("does not expose driver errors or return an unverified connection", async () => {
    driver.client.query.mockRejectedValueOnce(
      new Error("private driver detail"),
    );
    await expect(new ApprovedPool(config()).connect()).rejects.toMatchObject({
      code: "target_denied",
      message: "target_denied",
    });
    expect(driver.client.release).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("missing approval still blocks before constructing a pool or reading credentials", async () => {
    await expect(
      (async () => {
        const approved = await approvedDatabaseConfig(
          {},
          "migration",
          "migrate_up",
          "a".repeat(64),
        );
        return new ApprovedPool(approved).connect();
      })(),
    ).rejects.toMatchObject({ code: "not_configured" });
    expect(driver.Pool).not.toHaveBeenCalled();
    expect(driver.pool.connect).not.toHaveBeenCalled();
  });
});
