import { vi } from "vitest";
import { createJob } from "../../../src/features/guard/pipeline";
import type { GuardSnapshot } from "../../../src/features/guard/live/model";
import type { JobLease } from "../../../src/features/sentinel/platform-contracts";
import {
  bindGuardJob,
  workerActions,
  type GuardWorkerApproval,
} from "../../../worker/guard/approval";
export async function brokerFixture() {
  const grant = {
    mode: "live" as const,
    workspaceId: "github-user-7:fixture",
    projectId: "github-123",
    actorId: "github-user-7",
    operations: ["read", "scan"] as const,
    expiresAt: Date.now() + 60000,
  };
  const job = await createJob(grant, {
    ...grant,
    repository: {
      provider: "github",
      repositoryId: "123",
      branch: "main",
      commit: "a".repeat(40),
    },
    profile: "quick",
    engines: ["sast"],
    idempotencyKey: "broker-fixture-job",
  });
  const binding = bindGuardJob(job);
  const permit: GuardWorkerApproval = {
    schemaVersion: 1,
    module: "guard-worker",
    status: "APPROVED",
    approvedBy: "synthetic-unit-test-not-runtime-permission",
    approvedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    workerId: "guard-fixture",
    target: {
      host: "127.0.0.1",
      port: 55432,
      database: "wetscan_s01_test_guardg01",
      marker: "wetscan-s01:11111111-1111-1111-1111-111111111111",
    },
    migrationPlanSha256: "a".repeat(64),
    binding,
    actions: workerActions,
    execution: "prepare_only",
    repositoryName: "fixture/repo",
  };
  const lease: JobLease = {
    job: {
      schemaVersion: 1,
      module: "guard",
      mode: "live",
      workspaceId: grant.workspaceId,
      projectId: grant.projectId,
      jobId: job.id,
      subjectRef: job.id,
      kind: "guard.scan.prepare",
      idempotencyKey: job.idempotencyKey,
      revision: 2,
      attempts: 1,
      maxAttempts: 3,
      availableAt: new Date().toISOString(),
      cancelRequested: false,
    },
    workerId: permit.workerId,
    leaseToken: "1:fixture-lease",
    expiresAt: new Date(Date.now() + 30000).toISOString(),
  };
  const snapshot: GuardSnapshot = {
    ...grant,
    repository: job.repository,
    expiresAt: grant.expiresAt,
    digest: "b".repeat(64),
    tree: "c".repeat(40),
    files: [{ path: "safe.ts", sha256: "d".repeat(64), size: 7 }],
    sourceKind: "github",
    policyVersion: "guard-source-v1",
    coverage: {
      status: "complete",
      retrievedFiles: 1,
      eligibleFiles: 1,
      treeTruncated: false,
      bytes: 7,
      exclusions: [],
    },
  };
  const deps = {
    current: vi.fn(async () => ({
      grant,
      repositoryId: "123",
      repositoryName: "fixture/repo",
      branch: "main",
      userId: 7,
      installationId: 9,
    })),
    load: vi.fn(async () => ({ job, revision: 1, coverage: null })),
    verifyLease: vi.fn(async () => {}),
    snapshots: {
      acquire: vi.fn(async () => snapshot),
      dispose: vi.fn(async () => {}),
    },
  };
  const request = {
    mode: job.mode,
    workspaceId: job.workspaceId,
    projectId: job.projectId,
    repository: job.repository,
    profile: job.profile,
    engines: job.requestedEngines,
    idempotencyKey: job.idempotencyKey,
  };
  return { grant, job, binding, permit, lease, deps, request, snapshot };
}
