import { LiveGuardError } from "../../../src/features/guard/live/model";
import { it, expect, vi } from "vitest";
import { createJob } from "../../../src/features/guard/pipeline";
import { normalizeOpengrep } from "../../../src/features/guard/evidence";
import { repositoryJobHandler } from "../../../worker/guard/product-handler";
import { runRepositoryWorkerOnce } from "../../../worker/guard/product-runtime";
import { PlatformDatabase } from "../../../src/platform/database";
import { RecordingClient, fakePool } from "../../platform/helpers";
import type { JobLease } from "../../../src/features/sentinel/platform-contracts";
import type {
  ScanJob,
  ScannerPort,
} from "../../../src/features/guard/contracts";
import type { RepositoryScanPolicy } from "../../../src/features/guard/live/product-policy";
const scope = {
  mode: "live" as const,
  workspaceId: "github-user-7:fixture",
  projectId: "github-123",
};
const grant = {
  ...scope,
  actorId: "github-user-7",
  operations: ["read", "scan"] as const,
  expiresAt: Date.now() + 60000,
};
const policy: RepositoryScanPolicy = {
  version: 1,
  id: "offline-worker",
  ...scope,
  repositoryId: "123",
  branches: ["main"],
  engines: ["sast"],
  scannerTimeoutMs: 1000,
  jobTimeoutMs: 120000,
  maxAttempts: 1,
};
async function setup() {
  let current = await createJob(grant, {
    ...scope,
    repository: {
      provider: "github",
      repositoryId: "123",
      branch: "main",
      commit: "a".repeat(40),
    },
    engines: ["sast"],
    profile: "quick",
    idempotencyKey: "g02-live-worker-fixture",
  });
  current.audit.push({
    actorId: grant.actorId,
    at: new Date().toISOString(),
    action: "repository_scan_requested",
    subjectId: current.id,
    reason: "OFFLINE_TEST",
  });
  const lease: JobLease = {
    job: {
      ...scope,
      schemaVersion: 1,
      module: "guard",
      jobId: current.id,
      kind: "guard.scan.repository",
      subjectRef: current.id,
      idempotencyKey: current.idempotencyKey,
      revision: 2,
      attempts: 1,
      maxAttempts: 1,
      availableAt: current.createdAt,
      cancelRequested: false,
    },
    workerId: "test-worker",
    leaseToken: "1:test-fencing-token",
    expiresAt: new Date(Date.now() + 30000).toISOString(),
  };
  const events: string[] = [],
    saved: ScanJob[] = [];
  const storage = {
    get: vi.fn(async () => structuredClone(current)),
    create: vi.fn(),
    save: vi.fn(async (_g, j: ScanJob) => {
      events.push(j.status);
      current = structuredClone(j);
      saved.push(current);
    }),
  };
  const snapshots = {
    acquire: vi.fn(async () => ({
      ...scope,
      repository: current.repository,
      digest: "a".repeat(64),
      files: [{ path: "route.ts", size: 10, sha256: "b".repeat(64) }],
      expiresAt: Date.now() + 60000,
      coverage: {
        status: "complete" as const,
        retrievedFiles: 1,
        treeTruncated: false,
        exclusions: [],
      },
    })),
    dispose: vi.fn(async () => {
      events.push("source_cleanup_verified");
    }),
  };
  const scanner = {
    engine: "sast" as const,
    execute: vi.fn<ScannerPort["execute"]>(async () => ({
      run: {
        engine: "sast" as const,
        status: "completed" as const,
        reason: "",
        scanner: "opengrep",
        version: "unit-v1",
        rulePack: "test",
        artifactDigest: "c".repeat(64),
        executionEvidence: {
          version: 1 as const,
          runId: "00000000-0000-4000-8000-000000000001",
          imageId: "sha256:" + "d".repeat(64),
          specDigest: "e".repeat(64),
          installationArtifactSha256: "f".repeat(64),
          cleanup: "VERIFIED" as const,
        },
      },
      findings: await normalizeOpengrep(
        {
          results: [
            {
              check_id: "test-rule",
              path: "route.ts",
              start: { line: 1 },
              extra: { severity: "ERROR", message: "Offline output double" },
            },
          ],
          errors: [],
        },
        {
          ...scope,
          commit: current.repository.commit,
          recordedAt: new Date().toISOString(),
          artifactDigest: "c".repeat(64),
          synthetic: false,
          scannerVersion: "unit-v1",
          rulePack: "test",
        },
      ),
    })),
  };
  const fresh = vi.fn(async () => grant),
    verify = vi.fn(async () => {});
  const handler = repositoryJobHandler({
    storage: {
      get: async () => ({
        job: structuredClone(current),
        revision: 1,
        coverage: null,
      }),
    } as never,
    resolve: async () => ({
      policy,
      freshGrant: fresh,
      verifyLease: verify,
      ports: {
        storage,
        snapshots,
        scanners: [scanner],
        sandbox: {
          ready: true,
          readOnly: true,
          nonRoot: true,
          egressControlled: true,
          cpuLimit: 1,
          memoryMb: 256,
          pidsLimit: 64,
          timeoutMs: 1000,
        },
      },
    }),
  });
  return {
    lease,
    handler,
    fresh,
    verify,
    scanner,
    snapshots,
    saved,
    events,
    current: () => current,
  };
}
it("offline worker integration persists qualified output only after source cleanup before terminal success", async () => {
  const f = await setup();
  await f.handler(f.lease.job, new AbortController().signal, () => f.lease);
  expect(f.current().status).toBe("completed");
  expect(f.current().findings[0].evidence[0].synthetic).toBe(false);
  expect(f.events.indexOf("source_cleanup_verified")).toBeLessThan(
    f.events.indexOf("completed"),
  );
  expect(f.verify.mock.calls.length).toBeGreaterThan(3);
});
it.each(["revoked", "lease_lost"])(
  "stops %s after scanner and still disposes source without terminal success",
  async (mode) => {
    const f = await setup(),
      original = f.scanner.execute.getMockImplementation()!;
    f.scanner.execute.mockImplementation(async (snapshot, signal) => {
      const result = await original(snapshot, signal);
      if (mode === "revoked") f.fresh.mockRejectedValue(Error("revoked"));
      else f.verify.mockRejectedValue(Error("lease_lost"));
      return result;
    });
    await expect(
      f.handler(f.lease.job, new AbortController().signal, () => f.lease),
    ).rejects.toThrow();
    expect(f.snapshots.dispose).toHaveBeenCalledTimes(1);
    expect(f.saved.some((j) => j.status === "completed")).toBe(false);
  },
);
it("historical preparation cannot enter the normal worker", async () => {
  const f = await setup();
  await expect(
    f.handler(
      { ...f.lease.job, kind: "guard.scan.prepare" },
      new AbortController().signal,
      () => f.lease,
    ),
  ).rejects.toThrow();
  expect(f.scanner.execute).not.toHaveBeenCalled();
});
it("worker readiness failure occurs before claim SQL", async () => {
  const c = new RecordingClient();
  await expect(
    runRepositoryWorkerOnce({
      db: new PlatformDatabase(fakePool(c), true, "guard"),
      scope,
      jobId: "a".repeat(64),
      workerId: "test-worker",
      handler: async () => {},
      verifyReady: async () => {
        throw Error("unqualified");
      },
      signal: new AbortController().signal,
      timeoutMs: 120000,
    }),
  ).rejects.toThrow("unqualified");
  expect(c.calls).toEqual([]);
});

it("timeout awaits scanner-owned cleanup before disposing the source", async () => {
  vi.useFakeTimers();
  try {
    const f = await setup();
    f.scanner.execute.mockImplementation(
      (_snapshot?: unknown, signal?: AbortSignal) =>
        new Promise((_, reject) => {
          signal!.addEventListener(
            "abort",
            () =>
              setTimeout(() => {
                f.events.push("container_cleanup_verified");
                reject(Error("bounded_timeout"));
              }, 200),
            { once: true },
          );
        }),
    );
    const work = f.handler(
      f.lease.job,
      new AbortController().signal,
      () => f.lease,
    );
    await vi.advanceTimersByTimeAsync(1100);
    expect(f.snapshots.dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    await work;
    expect(f.events.indexOf("container_cleanup_verified")).toBeLessThan(
      f.events.indexOf("source_cleanup_verified"),
    );
    expect(f.current().status).toBe("failed");
  } finally {
    vi.useRealTimers();
  }
});
it.each(["unknown", "rejected"])(
  "preserves source and refuses terminal success when scanner cleanup is %s",
  async (mode) => {
    vi.useFakeTimers();
    try {
      const f = await setup();
      f.scanner.execute.mockImplementation(() =>
        mode === "unknown"
          ? new Promise(() => {})
          : Promise.reject(new LiveGuardError("cleanup_failed")),
      );
      const work = f.handler(
        f.lease.job,
        new AbortController().signal,
        () => f.lease,
      );
      const result = expect(work).rejects.toMatchObject({
        code: "cleanup_failed",
      });
      await vi.advanceTimersByTimeAsync(11200);
      await result;
      expect(f.snapshots.dispose).not.toHaveBeenCalled();
      expect(
        f.saved.some((j) =>
          ["completed", "completed_partial"].includes(j.status),
        ),
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  },
);

it("lease loss after source handoff blocks scanner/results and disposes only the owned snapshot", async () => {
  const f = await setup(),
    acquire = f.snapshots.acquire.getMockImplementation()!;
  f.snapshots.acquire.mockImplementation(async () => {
    const s = await acquire();
    f.verify.mockRejectedValue(new LiveGuardError("lease_lost", 409));
    return s;
  });
  await expect(
    f.handler(f.lease.job, new AbortController().signal, () => f.lease),
  ).rejects.toMatchObject({ code: "lease_lost" });
  expect(f.scanner.execute).not.toHaveBeenCalled();
  expect(f.snapshots.dispose).toHaveBeenCalledOnce();
  expect(f.current().status).not.toBe("completed");
});
