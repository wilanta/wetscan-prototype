import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("node:child_process", () => ({ fork: vi.fn() }));
vi.mock("../../../src/platform/database", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/platform/database")>();
  return { ...actual, ApprovedPool: vi.fn() };
});
vi.mock("../../../src/features/guard/live/database-config", () => ({
  guardDatabaseConfig: vi.fn(),
}));
vi.mock("../../../src/features/guard/live/project", () => ({
  authorizeGuardProject: vi.fn(),
}));
import { fork, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { ApprovedPool } from "../../../src/platform/database";
import { RecordingClient, fakePool } from "../../platform/helpers";
import { launchApprovedGuardWorker } from "../../../src/features/guard/live/worker-launcher";
import { guardDatabaseConfig } from "../../../src/features/guard/live/database-config";
import { authorizeGuardProject } from "../../../src/features/guard/live/project";
import { guardMigrationPlan } from "../../../src/features/guard/live/migrations";
import { brokerFixture } from "./broker-fixture";
beforeEach(() => {
  vi.clearAllMocks();
});
it("does not read DB configuration, call Auth or spawn a worker on general implementation approval", async () => {
  const f = await brokerFixture();
  await expect(
    launchApprovedGuardWorker({
      approval: "Approve mas, aman.",
      job: f.job,
      sessionToken: undefined,
      environment: {},
    }),
  ).rejects.toThrow("approval_required");
  expect(guardDatabaseConfig).not.toHaveBeenCalled();
  expect(authorizeGuardProject).not.toHaveBeenCalled();
  expect(fork).not.toHaveBeenCalled();
});
it("requires independent exact app-role target approval before Auth and fork", async () => {
  const f = await brokerFixture(),
    plan = await guardMigrationPlan();
  vi.mocked(guardDatabaseConfig).mockRejectedValueOnce(
    new Error("approval_required"),
  );
  await expect(
    launchApprovedGuardWorker({
      approval: { ...f.permit, migrationPlanSha256: plan.sha256 },
      job: f.job,
      sessionToken: undefined,
      environment: {},
    }),
  ).rejects.toThrow("approval_required");
  expect(guardDatabaseConfig).toHaveBeenCalledWith(
    {},
    "app",
    plan.sha256,
    f.permit.target,
  );
  expect(authorizeGuardProject).not.toHaveBeenCalled();
  expect(fork).not.toHaveBeenCalled();
});

async function approvedFixture() {
  const f = await brokerFixture(),
    plan = await guardMigrationPlan(),
    client = new RecordingClient(),
    pool = fakePool(client),
    end = vi.spyOn(pool, "end");
  client.respond = async (sql) => ({
    rows: sql.includes("FROM guard.schema_migrations")
      ? [{ version: plan.migration.version, checksum: plan.migration.checksum }]
      : sql.includes("FROM platform.schema_migrations")
        ? plan.platformVersions
        : sql.startsWith("SELECT job,revision")
          ? [{ job: f.job, revision: 1, coverage: null }]
          : [],
    rowCount: sql.startsWith("SELECT job,revision") ? 1 : 0,
  });
  vi.mocked(ApprovedPool).mockImplementation(function () {
    return pool as unknown as ApprovedPool;
  });
  vi.mocked(guardDatabaseConfig).mockResolvedValue({
    target: f.permit.target,
    purpose: "app",
    user: "wetscan_guard_app",
    password: "synthetic-test-only-not-a-credential",
    max: 1,
    approval: {
      schemaVersion: 1,
      status: "APPROVED",
      approvedBy: "synthetic-only",
      approvedAt: f.permit.approvedAt,
      expiresAt: f.permit.expiresAt,
      module: "guard",
      purpose: "app",
      role: "wetscan_guard_app",
      actions: ["runtime"],
      migrationPlanSha256: plan.sha256,
      target: f.permit.target,
    },
  });
  vi.mocked(authorizeGuardProject).mockResolvedValue(await f.deps.current());
  const input = {
    approval: { ...f.permit, migrationPlanSha256: plan.sha256 },
    job: f.job,
    sessionToken: undefined,
    environment: {
      GUARD_DB_WORKER_APPROVAL_FILE: "C:/synthetic/worker-approval",
      GUARD_DB_WORKER_PASSWORD_FILE: "C:/synthetic/never-opened",
      AUTH_SECRET: "synthetic-must-not-be-inherited",
      GITHUB_APP_PRIVATE_KEY: "synthetic-must-not-be-inherited",
    },
  };
  return { f, input, end };
}
it("composes the approved exact-job broker with a private child and scrubs all Auth/provider environment", async () => {
  const f = await approvedFixture();
  const child = Object.assign(new EventEmitter(), {
    connected: true,
    pid: 123,
    kill: vi.fn(),
    send: vi.fn(
      (value: { type?: string }, callback: (error: Error | null) => void) => {
        callback(null);
        if (value.type === "guard.worker.boot")
          queueMicrotask(() => {
            child.connected = false;
            child.emit("exit", 0);
          });
        return true;
      },
    ),
  });
  vi.mocked(fork).mockImplementationOnce(() => {
    queueMicrotask(() =>
      child.emit("message", { type: "guard.worker.boot_ready", version: 1 }),
    );
    return child as unknown as ChildProcess;
  });
  const launched = await launchApprovedGuardWorker(f.input);
  expect(await launched.done).toEqual({
    processExit: 0,
    scannerExecution: "NOT_RUN",
  });
  const options = vi.mocked(fork).mock.calls[0][2];
  expect(options?.stdio).toEqual(["ignore", "ignore", "ignore", "ipc"]);
  expect(Object.keys(options?.env ?? {})).not.toEqual(
    expect.arrayContaining(["AUTH_SECRET"]),
  );
  expect(options?.env?.GITHUB_APP_PRIVATE_KEY).toBeUndefined();
  expect(options?.env?.GUARD_DB_APP_PASSWORD_FILE).toBeUndefined();
  expect(f.end).toHaveBeenCalledOnce();
  expect(child.kill).not.toHaveBeenCalled();
});
it("closes the owned app pool if fork fails without propagating arbitrary error text", async () => {
  const f = await approvedFixture();
  vi.mocked(fork).mockImplementationOnce(() => {
    throw new Error("synthetic-private-error-text");
  });
  await expect(launchApprovedGuardWorker(f.input)).rejects.toThrow(
    "source_unavailable",
  );
  expect(f.end).toHaveBeenCalledOnce();
});
