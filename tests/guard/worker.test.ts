import { describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import type {
  AuthorizedSnapshot,
  Grant,
  ScannerPort,
} from "../../src/features/guard/contracts";
import { createJob, DemoMemoryStore } from "../../src/features/guard/pipeline";
import {
  executeScopedJob,
  validateSnapshot,
  type WorkerPorts,
} from "../../worker/guard/orchestrator";
import { readFixtureFile } from "../../worker/guard/fixture-runner";
const scope = {
  workspaceId: "worker-test",
  projectId: "worker-test",
  mode: "demo" as const,
};
const grant: Grant = {
  ...scope,
  actorId: "worker-test",
  operations: ["read", "scan"],
  expiresAt: Date.now() + 60000,
};
async function setup(scanners: ScannerPort[] = []) {
  const storage = new DemoMemoryStore(),
    job = await createJob(grant, {
      ...scope,
      repository: {
        provider: "github",
        repositoryId: "controlled-fixture",
        branch: "test",
        commit: "a".repeat(40),
      },
      profile: "quick",
      engines: ["sast", "sca"],
      idempotencyKey: "fixture",
    });
  await storage.create(grant, job);
  const snapshot: AuthorizedSnapshot = {
    ...scope,
    repository: job.repository,
    digest: "1".repeat(64),
    files: [{ path: "fixture.js", size: 10, sha256: "2".repeat(64) }],
    expiresAt: Date.now() + 60000,
  };
  const dispose = vi.fn(async () => undefined),
    acquire = vi.fn(async () => snapshot);
  const ports: WorkerPorts = {
    storage,
    scanners,
    snapshots: { acquire, dispose },
    sandbox: {
      ready: true,
      readOnly: true,
      nonRoot: true,
      egressControlled: true,
      cpuLimit: 1,
      memoryMb: 256,
      pidsLimit: 16,
      timeoutMs: 1000,
    },
  };
  return { ports, job, snapshot, dispose, acquire };
}
describe("worker orchestration safety", () => {
  it("fails closed without sandbox before obtaining source", async () => {
    const { ports, job, acquire } = await setup();
    ports.sandbox.ready = false;
    expect(
      (
        await executeScopedJob(
          ports,
          grant,
          scope,
          job.id,
          new AbortController().signal,
        )
      ).status,
    ).toBe("failed");
    expect(acquire).not.toHaveBeenCalled();
  });
  it("records partial coverage and disposes the scoped snapshot", async () => {
    const { ports, job, dispose } = await setup([
      {
        engine: "sast",
        execute: async () => ({
          run: {
            engine: "sast",
            status: "completed",
            reason: "Test-only adapter",
            scanner: "fixture",
            version: "v1",
            rulePack: "v1",
          },
          findings: [],
        }),
      },
    ]);
    const result = await executeScopedJob(
      ports,
      grant,
      scope,
      job.id,
      new AbortController().signal,
    );
    expect(result.status).toBe("completed_partial");
    expect(result.runs.find((r) => r.engine === "sca")?.status).toBe(
      "not_configured",
    );
    expect(dispose).toHaveBeenCalledOnce();
  });
  it("times out a stalled adapter and does not claim successful coverage", async () => {
    const { ports, job, dispose } = await setup([
      { engine: "sast", execute: async () => new Promise(() => undefined) },
    ]);
    ports.sandbox.timeoutMs = 10;
    const result = await executeScopedJob(
      ports,
      grant,
      scope,
      job.id,
      new AbortController().signal,
    );
    expect(result.status).toBe("failed");
    expect(result.runs.find((r) => r.engine === "sast")?.status).toBe(
      "timed_out",
    );
    expect(dispose).toHaveBeenCalledOnce();
  });
  it("rejects altered snapshot and never executes a scanner", async () => {
    const execute = vi.fn<ScannerPort["execute"]>();
    const { ports, job, snapshot, dispose } = await setup([
      { engine: "sast", execute },
    ]);
    snapshot.repository = { ...snapshot.repository, commit: "b".repeat(40) };
    expect(
      (
        await executeScopedJob(
          ports,
          grant,
          scope,
          job.id,
          new AbortController().signal,
        )
      ).status,
    ).toBe("failed");
    expect(execute).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  });
  it("rejects dangerous paths, duplicate files, stale snapshot and cross-project grants", async () => {
    const { job, snapshot } = await setup();
    expect(() =>
      validateSnapshot(grant, job, {
        ...snapshot,
        files: [{ ...snapshot.files[0], path: "../outside" }],
      }),
    ).toThrow();
    expect(() =>
      validateSnapshot(grant, job, {
        ...snapshot,
        files: [snapshot.files[0], snapshot.files[0]],
      }),
    ).toThrow();
    expect(() =>
      validateSnapshot(grant, job, { ...snapshot, expiresAt: 0 }),
    ).toThrow();
    expect(() =>
      validateSnapshot({ ...grant, projectId: "other" }, job, snapshot),
    ).toThrow();
  });
  it("honors cancellation without source acquisition", async () => {
    const { ports, job, acquire } = await setup();
    const controller = new AbortController();
    controller.abort();
    expect(
      (await executeScopedJob(ports, grant, scope, job.id, controller.signal))
        .status,
    ).toBe("cancelled");
    expect(acquire).not.toHaveBeenCalled();
  });
  it("rejects binary, oversized and symlink fixture files", async () => {
    const root = await mkdtemp(join(tmpdir(), "wetscan-guard-reader-"));
    try {
      await writeFile(join(root, "binary.js"), Buffer.from([0, 1]));
      await expect(readFixtureFile(root, "binary.js")).rejects.toThrow(
        "Binary",
      );
      await writeFile(join(root, "large.js"), "abc");
      await expect(readFixtureFile(root, "large.js", 2)).rejects.toThrow(
        "size",
      );
      await mkdir(join(root, "target"));
      await writeFile(join(root, "target", "a.js"), "safe fixture");
      await symlink(join(root, "target"), join(root, "link"), "junction");
      await expect(readFixtureFile(root, "link/a.js")).rejects.toThrow(
        "Symlink",
      );
    } finally {
      const target = resolve(root);
      if (
        dirname(target) !== resolve(tmpdir()) ||
        !basename(target).startsWith("wetscan-guard-reader-")
      )
        throw new Error("Unsafe test cleanup");
      await rm(target, { recursive: true, force: true });
    }
  });
});

it("distinguishes not_applicable from skipped and never turns it into required coverage", async () => {
  const { ports, job } = await setup([
    {
      engine: "sast",
      execute: async () => ({
        run: {
          engine: "sast",
          status: "not_applicable",
          reason: "No supported fixture files in this reviewed snapshot",
          scanner: "fixture",
          version: "v1",
          rulePack: "v1",
        },
        findings: [],
      }),
    },
  ]);
  const result = await executeScopedJob(
    ports,
    grant,
    scope,
    job.id,
    new AbortController().signal,
  );
  expect(result.runs.find((r) => r.engine === "sast")?.status).toBe(
    "not_applicable",
  );
  expect(result.runs.find((r) => r.engine === "dast")?.status).toBe("skipped");
  const { evaluate } = await import("../../src/features/guard/release");
  expect(
    evaluate(result, {
      id: "required",
      required: ["sast"],
      blockSeverities: ["high"],
      blockPotential: false,
    }).decision,
  ).toBe("INCOMPLETE");
});
