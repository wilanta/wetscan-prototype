import { describe, expect, it, vi, afterEach } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
import { readFile } from "node:fs/promises";
import {
  approvedDatabaseConfig,
  parseApproval,
  workerConfig,
  integer,
} from "../../src/platform/config";
const target = {
  host: "127.0.0.1",
  port: 55432,
  database: "wetscan_dev",
  marker: `wetscan-s01:${randomUUID()}`,
};
const fixturePath = (name: string) =>
  join(tmpdir(), "wetscan-unit-fixture", name);
const approval = () => ({
  schemaVersion: 1 as const,
  status: "APPROVED" as const,
  approvedBy: "UNIT TEST DOUBLE",
  approvedAt: new Date().toISOString(),
  target: { ...target },
  actions: ["runtime", "migrate_up"] as const,
  migrationPlanSha256: "a".repeat(64),
});
afterEach(() => vi.resetAllMocks());
describe("H01 connection gate - no database or real approval", () => {
  it("refuses absent configuration before reading any secret", async () => {
    await expect(approvedDatabaseConfig({}, "worker")).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(readFile).not.toHaveBeenCalled();
  });
  it.each(["WAITING_USER", "WAITING_DAUD", "CONFIGURED"])(
    "does not infer approval from %s",
    (status) => {
      expect(() =>
        parseApproval({ ...approval(), status }, target, "runtime"),
      ).toThrow("approval_required");
    },
  );
  it.each(["host", "port", "database", "marker"] as const)(
    "rejects mismatching %s",
    (key) => {
      const a = approval();
      Object.assign(a.target, { [key]: key === "port" ? 5432 : "other" });
      expect(() => parseApproval(a, target, "runtime")).toThrow(
        "target_denied",
      );
    },
  );
  it("requires action, date, reviewer and exact reviewed plan", () => {
    expect(() => parseApproval(approval(), target, "migrate_down")).toThrow();
    expect(() =>
      parseApproval({ ...approval(), approvedAt: "" }, target, "runtime"),
    ).toThrow();
    expect(() =>
      parseApproval({ ...approval(), approvedBy: "" }, target, "runtime"),
    ).toThrow();
    expect(() =>
      parseApproval(approval(), target, "migrate_up", "b".repeat(64)),
    ).toThrow();
    expect(
      parseApproval(approval(), target, "migrate_up", "a".repeat(64)).target,
    ).toEqual(target);
  });
  it.each(["production", "postgres", "db_vendoria"])(
    "rejects unapproved database namespace %s",
    (database) => {
      const t = { ...target, database };
      expect(() =>
        parseApproval({ ...approval(), target: t }, t, "runtime"),
      ).toThrow("target_denied");
    },
  );
  it("does not permit integration tests against the dev database", () => {
    expect(() =>
      parseApproval(
        { ...approval(), actions: ["integration_test"] },
        target,
        "integration_test",
      ),
    ).toThrow("target_denied");
  });
  it("reads credentials only after target approval and uses a purpose-specific role", async () => {
    const token = randomBytes(32).toString("hex");
    vi.mocked(readFile)
      .mockResolvedValueOnce(JSON.stringify(approval()))
      .mockResolvedValueOnce(token);
    const c = await approvedDatabaseConfig(
      {
        SENTINEL_DB_APPROVAL_FILE: fixturePath("approval.json"),
        SENTINEL_DB_WORKER_PASSWORD_FILE: fixturePath("worker.secret"),
        SENTINEL_DB_MARKER: target.marker,
        PGHOST: "unknown",
        PGUSER: "postgres",
        DATABASE_URL: "ignored",
      },
      "worker",
    );
    expect(c.user).toBe("wetscan_sentinel_worker");
    expect(c.max).toBe(3);
    expect(c.target).toEqual(target);
  });
  it("does not read a password if the approval record is invalid", async () => {
    vi.mocked(readFile).mockResolvedValueOnce(
      JSON.stringify({ ...approval(), status: "WAITING_USER" }),
    );
    await expect(
      approvedDatabaseConfig(
        {
          SENTINEL_DB_APPROVAL_FILE: fixturePath("approval.json"),
          SENTINEL_DB_WORKER_PASSWORD_FILE: fixturePath("secret"),
          SENTINEL_DB_MARKER: target.marker,
        },
        "worker",
      ),
    ).rejects.toThrow();
    expect(readFile).toHaveBeenCalledTimes(1);
  });
  it("bounds polling/concurrency/resource settings", () => {
    expect(workerConfig({}).concurrency).toBe(2);
    expect(() => workerConfig({ SENTINEL_WORKER_CONCURRENCY: "3" })).toThrow();
    expect(() => workerConfig({ SENTINEL_WORKER_POLL_MS: "0" })).toThrow();
    expect(() => integer("NaN", 1, 1, 5)).toThrow();
  });
});
