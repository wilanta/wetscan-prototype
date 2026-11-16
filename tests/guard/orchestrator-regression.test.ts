import { it, expect, vi } from "vitest";
import { createJob, DemoMemoryStore } from "../../src/features/guard/pipeline";
import {
  executeScopedJob,
  type WorkerPorts,
} from "../../worker/guard/orchestrator";
import type {
  AuthorizedSnapshot,
  Finding,
  SnapshotPort,
} from "../../src/features/guard/contracts";
async function fixture() {
  const scope = {
      mode: "demo" as const,
      workspaceId: "g02-offline",
      projectId: "g02-offline",
    },
    grant = {
      ...scope,
      actorId: "g02-offline",
      operations: ["scan", "read"] as const,
      expiresAt: Date.now() + 60000,
    },
    storage = new DemoMemoryStore(),
    job = await createJob(grant, {
      ...scope,
      repository: {
        provider: "github",
        repositoryId: "trusted-fixture",
        branch: "fixture",
        commit: "a".repeat(40),
      },
      profile: "quick",
      engines: ["sast"],
      idempotencyKey: "g02-offline",
    });
  await storage.create(grant, job);
  const snapshot: AuthorizedSnapshot = {
    ...scope,
    repository: job.repository,
    digest: "b".repeat(64),
    expiresAt: Date.now() + 60000,
    files: [{ path: "fixture.ts", sha256: "c".repeat(64), size: 10 }],
  };
  const acquire = vi.fn<SnapshotPort["acquire"]>(async () => snapshot),
    dispose = vi.fn(async () => {}),
    scanner = {
      engine: "sast" as const,
      execute: vi.fn(async () => ({
        run: {
          engine: "sast" as const,
          status: "completed" as const,
          scanner: "offline-unit",
          version: "v1",
          rulePack: "r1",
          reason: "OFFLINE_DOUBLES_ONLY",
        },
        findings: [] as Finding[],
      })),
    };
  const ports: WorkerPorts = {
    storage,
    snapshots: { acquire, dispose },
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
  };
  return {
    scope,
    grant,
    storage,
    job,
    snapshot,
    ports,
    acquire,
    dispose,
    scanner,
  };
}
it("G02 offline: a real cleanup rejection persists failed, never completed, and consumes exactly one disposal attempt", async () => {
  const f = await fixture(),
    states: string[] = [];
  const save = f.storage.save.bind(f.storage);
  vi.spyOn(f.storage, "save").mockImplementation(async (g, j) => {
    states.push(j.status);
    return save(g, j);
  });
  f.dispose.mockRejectedValue(Error("synthetic owned cleanup refusal"));
  const result = await executeScopedJob(
    f.ports,
    f.grant,
    f.scope,
    f.job.id,
    new AbortController().signal,
  );
  expect(result.status).toBe("failed");
  expect(states).not.toContain("completed");
  expect(f.dispose).toHaveBeenCalledOnce();
  expect((await f.storage.get(f.grant, f.scope, f.job.id))?.status).toBe(
    "failed",
  );
});
it("G02 offline: completion occurs only after cleanup, and the source request contains only canonical fields", async () => {
  const f = await fixture();
  let clean = false;
  f.dispose.mockImplementation(async () => {
    clean = true;
  });
  const save = f.storage.save.bind(f.storage);
  vi.spyOn(f.storage, "save").mockImplementation(async (g, j) => {
    if (j.status === "completed") expect(clean).toBe(true);
    return save(g, j);
  });
  expect(
    (
      await executeScopedJob(
        f.ports,
        f.grant,
        f.scope,
        f.job.id,
        new AbortController().signal,
      )
    ).status,
  ).toBe("completed");
  expect(Object.keys(f.acquire.mock.calls[0]?.[1] ?? {}).sort()).toEqual(
    [
      "mode",
      "workspaceId",
      "projectId",
      "repository",
      "profile",
      "idempotencyKey",
      "engines",
    ].sort(),
  );
});
it("G02 offline: complete engine coverage over a partial snapshot remains completed_partial", async () => {
  const f = await fixture();
  f.snapshot.coverage = {
    status: "partial",
    retrievedFiles: 1,
    treeTruncated: false,
    exclusions: [{ reason: "file_size" }],
  };
  expect(
    (
      await executeScopedJob(
        f.ports,
        f.grant,
        f.scope,
        f.job.id,
        new AbortController().signal,
      )
    ).status,
  ).toBe("completed_partial");
});
it("G02 offline: result provenance must match scanner/version/rules; mismatches never persist a finding", async () => {
  const f = await fixture(),
    finding: Finding = {
      ...f.scope,
      id: "d".repeat(64),
      title: "controlled fixture",
      severity: "high",
      confidence: "medium",
      status: "potential",
      source: {
        engine: "sast",
        scanner: "different-scanner",
        version: "v1",
        ruleId: "fixture-rule",
        rulePack: "r1",
      },
      location: { path: "fixture.ts", line: 1 },
      evidence: [
        {
          id: "e".repeat(64),
          commit: f.job.repository.commit,
          recordedAt: new Date().toISOString(),
          artifactDigest: "f".repeat(64),
          summary: "synthetic unit evidence",
          synthetic: true,
        },
      ],
    };
  f.scanner.execute.mockResolvedValue({
    run: {
      engine: "sast",
      status: "completed",
      scanner: "offline-unit",
      version: "v1",
      rulePack: "r1",
      reason: "OFFLINE_DOUBLES_ONLY",
    },
    findings: [finding],
  });
  const result = await executeScopedJob(
    f.ports,
    f.grant,
    f.scope,
    f.job.id,
    new AbortController().signal,
  );
  expect(result.status).toBe("failed");
  expect(result.findings).toEqual([]);
  expect(result.runs.find((r) => r.engine === "sast")?.status).toBe("failed");
});
