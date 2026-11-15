import { expect, it, vi } from "vitest";
vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
import { readFile } from "node:fs/promises";
import { guardDatabaseConfig } from "../../../src/features/guard/live/database-config";
it("rejects a mismatched exact launch target before reading any credential file", async () => {
  const target = {
    host: "127.0.0.1",
    port: 55432,
    database: "wetscan_s01_test_guardg01",
    marker: "wetscan-s01:11111111-1111-1111-1111-111111111111",
  };
  vi.mocked(readFile).mockResolvedValue(
    JSON.stringify({
      schemaVersion: 1,
      status: "APPROVED",
      approvedBy: "synthetic-only",
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      module: "guard",
      purpose: "worker",
      role: "wetscan_guard_worker",
      actions: ["runtime"],
      target,
      migrationPlanSha256: "a".repeat(64),
    }),
  );
  await expect(
    guardDatabaseConfig(
      {
        GUARD_DB_WORKER_APPROVAL_FILE: "C:/synthetic/approval.json",
        GUARD_DB_WORKER_PASSWORD_FILE: "C:/synthetic/never-read",
      },
      "worker",
      "a".repeat(64),
      { ...target, port: 55433 },
    ),
  ).rejects.toThrow("approval_required");
  expect(readFile).toHaveBeenCalledTimes(1);
  expect(readFile).not.toHaveBeenCalledWith(
    "C:/synthetic/never-read",
    expect.anything(),
  );
});
