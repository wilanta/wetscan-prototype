import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../../src/features/guard/live/project", () => ({
  authorizeGuardProject: vi.fn(),
}));
vi.mock("../../../src/features/guard/live/github-source", () => ({
  githubSourceAccess: vi.fn(),
}));
vi.mock("../../../src/features/guard/live/database-config", () => ({
  guardDatabaseConfig: vi.fn(),
}));
vi.mock("../../../src/platform/database", async (original) => ({
  ...(await original<typeof import("../../../src/platform/database")>()),
  ApprovedPool: vi.fn(),
}));
import { enqueueApprovedGuardPreparation } from "../../../src/features/guard/live/preparation";
import { authorizeGuardProject } from "../../../src/features/guard/live/project";
import { githubSourceAccess } from "../../../src/features/guard/live/github-source";
import { guardDatabaseConfig } from "../../../src/features/guard/live/database-config";
import { guardMigrationPlan } from "../../../src/features/guard/live/migrations";
import { ApprovedPool } from "../../../src/platform/database";
import { preparationActions } from "../../../worker/guard/approval";
import { RecordingClient, fakePool } from "../../platform/helpers";
import { brokerFixture } from "./broker-fixture";
beforeEach(() => vi.resetAllMocks());
async function setup() {
  const f = await brokerFixture(),
    plan = await guardMigrationPlan(),
    client = new RecordingClient(),
    pool = fakePool(client);
  const head = vi.fn(async () => ({
      commit: f.job.repository.commit,
      tree: "c".repeat(40),
    })),
    close = vi.fn(async () => {});
  const authority = await f.deps.current();
  vi.mocked(authorizeGuardProject).mockResolvedValue(authority);
  vi.mocked(githubSourceAccess).mockReturnValue({
    authorize: async () => authority,
    open: async () => ({ head, close, tree: vi.fn(), blob: vi.fn() }),
  });
  vi.mocked(guardDatabaseConfig).mockResolvedValue({
    target: f.permit.target,
    purpose: "app",
    user: "wetscan_guard_app",
    password: "synthetic-unit-only",
    max: 1,
    approval: {
      schemaVersion: 1,
      status: "APPROVED",
      approvedBy: "synthetic-only",
      approvedAt: f.permit.approvedAt,
      expiresAt: f.permit.expiresAt,
      operations: ["runtime"],
      role: "wetscan_guard_app",
      target: f.permit.target,
      purpose: "app",
      artifactSha256: plan.sha256,
    },
  } as never);
  vi.mocked(ApprovedPool).mockImplementation(function () {
    return pool as unknown as ApprovedPool;
  });
  client.respond = async (sql) => ({
    rows: sql.includes("FROM guard.schema_migrations")
      ? [{ version: plan.migration.version, checksum: plan.migration.checksum }]
      : sql.includes("FROM platform.schema_migrations")
        ? plan.platformVersions
        : sql.startsWith("INSERT INTO guard.scans")
          ? [{ job: f.job, revision: 1, coverage: null }]
          : sql.startsWith("SELECT scan_id FROM guard.scans")
            ? [{ scan_id: f.job.id }]
            : sql.startsWith("INSERT INTO platform.jobs")
              ? [{ job_id: f.job.id }]
              : [],
    rowCount:
      sql.startsWith("SELECT scan_id") || sql.startsWith("INSERT") ? 1 : 0,
  });
  return {
    ...f,
    head,
    close,
    pool,
    client,
    input: {
      approval: {
        ...f.permit,
        module: "guard-preparation",
        actions: preparationActions,
        migrationPlanSha256: plan.sha256,
      },
      sessionToken: undefined,
      request: {
        profile: f.job.profile,
        engines: f.job.requestedEngines,
        idempotencyKey: f.job.idempotencyKey,
      },
      environment: {},
    },
  };
}
it("enqueues one exact authorized G01 preparation atomically after current HEAD and both ledgers verify", async () => {
  const f = await setup();
  expect(await enqueueApprovedGuardPreparation(f.input)).toEqual({
    scanId: f.job.id,
    status: "queued",
    execution: "prepare_only",
    scannerExecution: "NOT_RUN",
  });
  expect(f.head).toHaveBeenCalledOnce();
  expect(f.close).toHaveBeenCalledOnce();
  expect(f.pool.end).toHaveBeenCalledOnce();
  expect(authorizeGuardProject).toHaveBeenCalledTimes(2);
  expect(
    f.client.calls.some((c) => c.sql.startsWith("INSERT INTO platform.jobs")),
  ).toBe(true);
  expect(f.client.calls.some((c) => c.sql.includes("sentinel."))).toBe(false);
});
it("rejects a worker-only permit before Auth, configuration or provider access", async () => {
  const f = await setup();
  await expect(
    enqueueApprovedGuardPreparation({ ...f.input, approval: f.permit }),
  ).rejects.toThrow("approval_required");
  expect(authorizeGuardProject).not.toHaveBeenCalled();
  expect(guardDatabaseConfig).not.toHaveBeenCalled();
  expect(ApprovedPool).not.toHaveBeenCalled();
});
it("rejects request/binding mismatch before source or database", async () => {
  const f = await setup();
  await expect(
    enqueueApprovedGuardPreparation({
      ...f.input,
      request: { ...f.input.request, idempotencyKey: "different-request" },
    }),
  ).rejects.toThrow("not_found");
  expect(guardDatabaseConfig).not.toHaveBeenCalled();
  expect(githubSourceAccess).not.toHaveBeenCalled();
  expect(ApprovedPool).not.toHaveBeenCalled();
});
it("rejects a changed HEAD and closes source without opening a database connection", async () => {
  const f = await setup();
  f.head.mockResolvedValue({ commit: "b".repeat(40), tree: "c".repeat(40) });
  await expect(enqueueApprovedGuardPreparation(f.input)).rejects.toThrow(
    "revision_conflict",
  );
  expect(f.close).toHaveBeenCalledOnce();
  expect(ApprovedPool).not.toHaveBeenCalled();
});
it("rechecks revocation after source access and before database writes", async () => {
  const f = await setup();
  vi.mocked(authorizeGuardProject)
    .mockResolvedValueOnce(await f.deps.current())
    .mockRejectedValueOnce(new Error("synthetic revoked"));
  await expect(enqueueApprovedGuardPreparation(f.input)).rejects.toThrow();
  expect(f.close).toHaveBeenCalledOnce();
  expect(ApprovedPool).not.toHaveBeenCalled();
});
it("closes the pool on a mismatched migration ledger and never enqueues", async () => {
  const f = await setup();
  f.client.respond = async () => ({ rows: [], rowCount: 0 });
  await expect(enqueueApprovedGuardPreparation(f.input)).rejects.toThrow();
  expect(f.pool.end).toHaveBeenCalledOnce();
  expect(f.client.calls.some((c) => c.sql.startsWith("INSERT"))).toBe(false);
});
