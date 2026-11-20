import { describe, it, expect, vi } from "vitest";
import { createJob } from "../../../src/features/guard/pipeline";
import { repositoryAdmission } from "../../../src/features/guard/live/product-admission";
import {
  validateProductPolicy,
  validateQualification,
  repositoryScanKind,
  type RepositoryScanPolicy,
} from "../../../src/features/guard/live/product-policy";
import { storedScanView } from "../../../src/features/guard/live/product-view";
import { PostgresGuardStore } from "../../../src/features/guard/live/persistence";
import { GuardPostgresQueue } from "../../../src/features/guard/live/queue";
import { PlatformDatabase } from "../../../src/platform/database";
import { RecordingClient, fakePool } from "../../platform/helpers";
import { fingerprint } from "../../../src/platform/identity";
import {
  sandboxControls,
  type SandboxSpec,
} from "../../../worker/guard/sandbox";
export const scope = {
  mode: "live" as const,
  workspaceId: "github-user-7:fixture",
  projectId: "github-123",
};
export const authority = {
  grant: {
    ...scope,
    actorId: "github-user-7",
    operations: ["read", "scan", "triage", "report"] as const,
    expiresAt: Date.now() + 60000,
  },
  repositoryId: "123",
  repositoryName: "fixture/repository",
  branch: "main",
  installationId: 9,
  userId: 7,
};
export const policy: RepositoryScanPolicy = {
  version: 1,
  id: "operational-test-policy",
  ...scope,
  repositoryId: "123",
  branches: ["main"],
  engines: ["sast", "sca", "secrets", "iac"],
  scannerTimeoutMs: 1000,
  jobTimeoutMs: 120000,
  maxAttempts: 1,
};
export async function jobFixture() {
  const job = await createJob(authority.grant, {
    ...scope,
    repository: {
      provider: "github",
      repositoryId: "123",
      branch: "main",
      commit: "a".repeat(40),
    },
    profile: "quick",
    engines: ["sast"],
    idempotencyKey: "g02-live-test-request-001",
  });
  job.audit.push({
    actorId: authority.grant.actorId,
    at: new Date().toISOString(),
    action: "repository_scan_requested",
    subjectId: job.id,
    reason: "Offline contract test only",
  });
  return job;
}
describe("normal repository admission, not an acceptance permit", () => {
  it("checks isolation before source access and atomically dispatches only the pinned authorized job", async () => {
    const job = await jobFixture(),
      create = vi.fn(async (_g, j) => ({
        job: j,
        revision: 1,
        coverage: null,
      }));
    const queued = vi.fn(async () => {
      expect(create).toHaveBeenCalledOnce();
    });
    const close = vi.fn(async () => {}),
      head = vi.fn(async () => ({
        commit: job.repository.commit,
        tree: "b".repeat(40),
      })),
      authorize = vi.fn(async () => structuredClone(authority)),
      ready = vi.fn(async () => {});
    const admission = repositoryAdmission({
      policy,
      onQueued: queued,
      verifyReady: ready,
      storage: { create } as never,
      source: () => ({
        authorize,
        open: async () => ({ head, close }) as never,
      }),
    });
    const result = await admission.create(
      authority,
      {
        branch: "main",
        commit: job.repository.commit,
        profile: "quick",
        engines: ["sast"],
        idempotencyKey: job.idempotencyKey,
      },
      new AbortController().signal,
    );
    expect(result.execution).toBe("repository_scan");
    expect(result.scanId).toBe(job.id);
    expect(create).toHaveBeenCalledTimes(1);
    expect(queued).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][1].audit.at(-1).action).toBe(
      "repository_scan_requested",
    );
  });
  it("unqualified runtime stops before source or storage", async () => {
    const create = vi.fn(),
      source = vi.fn();
    const a = repositoryAdmission({
      policy,
      verifyReady: async () => {
        throw Error("not qualified");
      },
      storage: { create } as never,
      source,
    });
    await expect(
      a.create(
        authority,
        {
          branch: "main",
          commit: "a".repeat(40),
          profile: "quick",
          engines: ["sast"],
          idempotencyKey: "g02-live-test-request",
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow("not qualified");
    expect(source).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
  it.each(["other_commit", "revoked", "close_unknown"])(
    "does not enqueue on %s",
    async (mode) => {
      const create = vi.fn(),
        close = vi.fn(async () => {
          if (mode === "close_unknown") throw Error("unknown");
        });
      let calls = 0;
      const source = {
        authorize: vi.fn(async () => {
          if (++calls === 2 && mode === "revoked") throw Error("revoked");
          return structuredClone(authority);
        }),
        open: async () => ({
          head: async () => ({
            commit: (mode === "other_commit" ? "b" : "a").repeat(40),
            tree: "c".repeat(40),
          }),
          close,
        }),
      };
      const a = repositoryAdmission({
        policy,
        verifyReady: async () => {},
        storage: { create } as never,
        source: () => source as never,
      });
      await expect(
        a.create(
          authority,
          {
            branch: "main",
            commit: "a".repeat(40),
            profile: "quick",
            engines: ["sast"],
            idempotencyKey: "g02-live-test-request",
          },
          new AbortController().signal,
        ),
      ).rejects.toThrow();
      expect(create).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { mode: "demo" },
    { idempotencyKey: "g01-remain-v1-n01" },
    { requestedEngines: ["dast"] },
    {
      repository: {
        provider: "github",
        repositoryId: "999",
        branch: "main",
        commit: "a".repeat(40),
      },
    },
  ])("rejects scope/acceptance/unsupported input %j", async (change) => {
    const j = await jobFixture();
    expect(() =>
      validateProductPolicy(policy, { ...j, ...change } as never),
    ).toThrow();
  });
});
describe("durable dispatch and historical job isolation", () => {
  it("writes scan and repository queue kind in one SQL transaction with no automatic retry", async () => {
    const client = new RecordingClient(),
      db = new PlatformDatabase(fakePool(client), false, "guard"),
      store = new PostgresGuardStore(db, repositoryScanKind),
      job = await jobFixture();
    client.respond = async (sql) => ({
      rows: sql.startsWith("INSERT INTO guard.scans")
        ? [{ job, revision: 1, coverage: null }]
        : sql.startsWith("SELECT scan_id")
          ? [{ scan_id: job.id }]
          : sql.startsWith("INSERT INTO platform.jobs")
            ? [{ job_id: job.id }]
            : [],
      rowCount:
        sql.startsWith("INSERT") || sql.startsWith("SELECT scan_id") ? 1 : 0,
    });
    await store.create(authority.grant, job);
    const insert = client.calls.find((c) =>
      c.sql.startsWith("INSERT INTO platform.jobs"),
    )!;
    expect(insert.values).toContain(repositoryScanKind);
    expect(insert.values[8]).toBe(1);
    expect(client.calls.at(-1)?.sql).toBe("COMMIT");
  });
  it("repository worker cannot use a project-wide maintenance selector", () => {
    const db = new PlatformDatabase(
      fakePool(new RecordingClient()),
      true,
      "guard",
    );
    expect(
      () =>
        new GuardPostgresQueue(db, scope, undefined, {
          kind: repositoryScanKind,
        }),
    ).toThrow();
  });
  it("all repository maintenance statements are fenced by kind and exact job", async () => {
    const c = new RecordingClient(),
      db = new PlatformDatabase(fakePool(c), true, "guard"),
      job = await jobFixture();
    c.respond = async (sql) => ({
      rows: sql.startsWith("SELECT max_running")
        ? [{ max_running: 1 }]
        : sql.startsWith("SELECT project_id")
          ? [{ project_id: scope.projectId }]
          : sql.includes("active_lease_count")
            ? [{ n: 0 }]
            : [],
      rowCount: sql.startsWith("SELECT project_id") ? 1 : 0,
    });
    await new GuardPostgresQueue(db, scope, job.id, {
      kind: repositoryScanKind,
    }).claim({
      module: "guard",
      workerId: "test-worker",
      limit: 1,
      leaseMs: 30000,
    });
    const updates = c.calls.filter((q) => q.sql.startsWith("UPDATE"));
    expect(updates).toHaveLength(4);
    for (const q of updates) {
      expect(q.sql).toContain("kind=ANY($6");
      expect(q.values[4]).toBe(job.id);
      expect(q.values[5]).toEqual([repositoryScanKind]);
    }
  });
  it("view refuses synthetic or cross-repository stored results", async () => {
    const j = await jobFixture();
    const s = { job: j, revision: 1, coverage: null };
    expect(storedScanView(authority, s).execution).toBe("repository_scan");
    expect(() =>
      storedScanView({ ...authority, repositoryId: "999" }, s),
    ).toThrow();
    j.findings = [
      {
        ...scope,
        id: "a",
        title: "test",
        severity: "high",
        confidence: "high",
        status: "potential",
        source: {
          engine: "sast",
          scanner: "opengrep",
          version: "1",
          ruleId: "rule",
          rulePack: "test",
        },
        location: { path: "a.ts" },
        evidence: [
          {
            id: "a",
            commit: j.repository.commit,
            recordedAt: new Date().toISOString(),
            summary: "test",
            artifactDigest: "a".repeat(64),
            synthetic: true,
          },
        ],
      },
    ];
    expect(() => storedScanView(authority, s)).toThrow("source_integrity");
  });
});
describe("measured qualification is mandatory", () => {
  const spec: SandboxSpec = {
    docker: "C:/tools/docker.exe",
    endpoint: "npipe:////./pipe/dockerDesktopLinuxEngine",
    image: "ghcr.io/test/scanner@sha256:" + "a".repeat(64),
    executable: "/usr/local/bin/opengrep",
    args: ["--json", "/source"],
    cpu: 1,
    memoryMb: 256,
    pids: 64,
    timeoutMs: 1000,
    outputBytes: 64000,
  };
  function qualification() {
    return {
      version: 1 as const,
      classification: "LIVE_VERIFIED_SANDBOX" as const,
      engine: "sast" as const,
      specDigest: fingerprint(spec),
      imageId: "sha256:" + "d".repeat(64),
      scannerVersion: "1.0.0",
      rulePack: "reviewed",
      rulePackSha256: "b".repeat(64),
      installationArtifactSha256: "c".repeat(64),
      verifiedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      evidenceSha256: "e".repeat(64),
      daemonId: "test-daemon",
      daemonVersion: "test-version",
      kernelVersion: "test-kernel",
      controls: sandboxControls,
    };
  }
  it("binds physical controls/spec/image/installation evidence", () =>
    expect(
      validateQualification(qualification(), "sast", spec).specDigest,
    ).toBe(fingerprint(spec)));
  it.each([
    "expiry",
    "missing_control",
    "spec_drift",
    "synthetic",
    "missing_evidence",
  ])("refuses %s before execution", (mode) => {
    const q = qualification();
    if (mode === "expiry") q.expiresAt = new Date(0).toISOString();
    if (mode === "missing_control") q.controls = [] as never;
    if (mode === "spec_drift") q.specDigest = "f".repeat(64);
    if (mode === "synthetic") q.classification = "FIXTURE" as never;
    if (mode === "missing_evidence") q.evidenceSha256 = "";
    expect(() => validateQualification(q, "sast", spec)).toThrow();
  });
});
