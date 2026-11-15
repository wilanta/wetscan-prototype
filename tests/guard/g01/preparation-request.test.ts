import { beforeEach, expect, it, vi } from "vitest";
import { resolve } from "node:path";
vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", () => ({ readFile: vi.fn(), lstat: vi.fn() }));
vi.mock("../../../src/features/guard/live/preparation", () => ({
  enqueueApprovedGuardPreparation: vi.fn(),
}));
vi.mock("../../../src/features/guard/live/worker-launcher", () => ({
  launchApprovedGuardWorker: vi.fn(),
}));
vi.mock("../../../src/features/guard/live/runtime", () => ({
  guardLiveService: vi.fn(),
}));
vi.mock("../../../src/features/guard/live/project", () => ({
  authorizeGuardProject: vi.fn(),
}));
vi.mock("../../../src/features/guard/live/migrations", () => ({
  guardMigrationPlan: vi.fn(async () => ({ sha256: "a".repeat(64) })),
}));
import { readFile, lstat } from "node:fs/promises";
import {
  preparationRequest,
  readGuardOperatorApproval,
} from "../../../src/features/guard/live/preparation-request";
import { enqueueApprovedGuardPreparation } from "../../../src/features/guard/live/preparation";
import { launchApprovedGuardWorker } from "../../../src/features/guard/live/worker-launcher";
import { guardLiveService } from "../../../src/features/guard/live/runtime";
import { authorizeGuardProject } from "../../../src/features/guard/live/project";
import { guardMigrationPlan } from "../../../src/features/guard/live/migrations";
import { brokerFixture } from "./broker-fixture";
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(guardMigrationPlan).mockResolvedValue({
    sha256: "a".repeat(64),
  } as never);
});
async function setup() {
  const f = await brokerFixture(),
    authority = await f.deps.current();
  vi.mocked(lstat).mockResolvedValue({
    isFile: () => true,
    isSymbolicLink: () => false,
    size: 1024,
  } as never);
  vi.mocked(readFile).mockResolvedValue(JSON.stringify(f.permit));
  vi.mocked(authorizeGuardProject).mockResolvedValue(authority);
  const get = vi
    .fn()
    .mockResolvedValue({ job: f.job, revision: 1, coverage: null });
  vi.mocked(guardLiveService).mockResolvedValue({ get } as never);
  const stop = vi.fn(async () => ({
    processExit: 0,
    scannerExecution: "NOT_RUN" as const,
  }));
  vi.mocked(launchApprovedGuardWorker).mockResolvedValue({
    stop,
    done: Promise.resolve({
      processExit: 0,
      scannerExecution: "NOT_RUN" as const,
    }),
  });
  return {
    ...f,
    get,
    stop,
    input: {
      authority,
      token: undefined,
      value: { action: "launch", scanId: f.job.id },
      environment: {
        GUARD_WORKER_APPROVAL_FILE: resolve("synthetic/worker-approval.json"),
      },
      signal: new AbortController().signal,
    },
  };
}
it("rejects missing, dotenv and symlink approval before reading operator file", async () => {
  await setup();
  await expect(readGuardOperatorApproval(undefined)).rejects.toThrow(
    "approval_required",
  );
  await expect(
    readGuardOperatorApproval(resolve(".env.local")),
  ).rejects.toThrow("approval_required");
  expect(readFile).not.toHaveBeenCalled();
  vi.mocked(lstat).mockResolvedValueOnce({
    isFile: () => true,
    isSymbolicLink: () => true,
    size: 1,
  } as never);
  await expect(
    readGuardOperatorApproval(resolve("synthetic/approval.json")),
  ).rejects.toThrow("approval_required");
  expect(readFile).not.toHaveBeenCalled();
});
it("passes an exact enqueue request to the existing approved producer without starting a worker", async () => {
  const f = await setup();
  vi.mocked(enqueueApprovedGuardPreparation).mockResolvedValue({
    scanId: f.job.id,
    status: "queued",
    execution: "prepare_only",
    scannerExecution: "NOT_RUN",
  });
  await preparationRequest({
    ...f.input,
    environment: {
      GUARD_PREPARATION_APPROVAL_FILE: resolve("synthetic/approval.json"),
    },
    value: {
      action: "enqueue",
      profile: "quick",
      engines: ["sast"],
      commit: f.job.repository.commit,
      idempotencyKey: f.job.idempotencyKey,
    },
  });
  expect(enqueueApprovedGuardPreparation).toHaveBeenCalledOnce();
  expect(launchApprovedGuardWorker).not.toHaveBeenCalled();
  expect(guardLiveService).not.toHaveBeenCalled();
});
it("rejects malformed action and foreign job before pool access", async () => {
  const f = await setup();
  await expect(
    preparationRequest({
      ...f.input,
      value: { action: "launch", scanId: f.job.id, owner: "forged" },
    }),
  ).rejects.toThrow("invalid_input");
  await expect(
    preparationRequest({
      ...f.input,
      value: { action: "launch", scanId: "b".repeat(64) },
    }),
  ).rejects.toThrow("not_found");
  expect(guardLiveService).not.toHaveBeenCalled();
  expect(launchApprovedGuardWorker).not.toHaveBeenCalled();
});
it("does not treat process exit zero as proof of completed preparation", async () => {
  const f = await setup();
  await expect(preparationRequest(f.input)).rejects.toThrow(
    "execution_not_ready",
  );
  expect(f.stop).toHaveBeenCalledOnce();
});
it("checks current Auth and persisted preparation evidence after worker completion", async () => {
  const f = await setup();
  f.get
    .mockResolvedValueOnce({ job: f.job, revision: 1, coverage: null })
    .mockResolvedValueOnce({
      job: {
        ...f.job,
        status: "failed",
        audit: [...f.job.audit, { action: "foundation_prepared" }],
      },
      revision: 3,
      coverage: f.snapshot.coverage,
    });
  expect(await preparationRequest(f.input)).toMatchObject({
    preparation: "verified",
    scannerExecution: "NOT_RUN",
    status: "failed",
  });
  expect(authorizeGuardProject).toHaveBeenCalledWith(
    undefined,
    f.job.projectId,
  );
  expect(f.get).toHaveBeenCalledTimes(2);
});
it("rejects a session revoked before the final evidence read", async () => {
  const f = await setup();
  vi.mocked(authorizeGuardProject).mockRejectedValueOnce(
    new Error("synthetic revoked"),
  );
  await expect(preparationRequest(f.input)).rejects.toThrow();
  expect(f.get).toHaveBeenCalledOnce();
});
