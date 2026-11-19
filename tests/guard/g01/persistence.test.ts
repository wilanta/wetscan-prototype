import { expect, it } from "vitest";
import { PlatformDatabase } from "../../../src/platform/database";
import { createJob } from "../../../src/features/guard/pipeline";
import { PostgresGuardStore } from "../../../src/features/guard/live/persistence";
import { GuardPostgresQueue } from "../../../src/features/guard/live/queue";
import { RecordingClient, fakePool } from "../../platform/helpers";
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
async function setup(worker = false) {
  const client = new RecordingClient(),
    db = new PlatformDatabase(fakePool(client), worker, "guard"),
    store = new PostgresGuardStore(db),
    job = await createJob(grant, {
      ...scope,
      repository: {
        provider: "github",
        repositoryId: "123",
        branch: "main",
        commit: "a".repeat(40),
      },
      profile: "quick",
      engines: ["sast"],
      idempotencyKey: "test-idempotency",
    });
  return { client, db, store, job };
}
it("commits Guard scan and module-owned queue insertion atomically using existing transactions", async () => {
  const { client, store, job } = await setup();
  client.respond = async (sql) => ({
    rows: sql.startsWith("INSERT INTO guard.scans")
      ? [{ job, revision: 1, coverage: null }]
      : sql.startsWith("SELECT scan_id FROM guard.scans")
        ? [{ scan_id: job.id }]
        : sql.startsWith("INSERT INTO platform.jobs")
          ? [{ job_id: job.id }]
          : [],
    rowCount:
      sql.startsWith("SELECT scan_id") || sql.startsWith("INSERT") ? 1 : 0,
  });
  const result = await store.create(grant, job);
  expect(result.job.id).toBe(job.id);
  const sql = client.calls.map((c) => c.sql).join("\n");
  expect(sql).toContain("COMMIT");
  expect(sql).toContain("INSERT INTO platform.jobs");
  expect(sql).not.toContain("sentinel.project_bindings");
  expect(
    client.calls.find((c) => c.sql.startsWith("INSERT INTO platform.jobs"))
      ?.values[0],
  ).toBe("guard");
});
it("rolls back scan insertion if durable queue admission fails", async () => {
  const { client, store, job } = await setup();
  client.respond = async (sql) => {
    if (sql.startsWith("INSERT INTO platform.jobs"))
      throw new Error("do-not-expose-SQL");
    return {
      rows: sql.startsWith("INSERT INTO guard.scans")
        ? [{ job, revision: 1, coverage: null }]
        : sql.startsWith("SELECT scan_id")
          ? [{ scan_id: job.id }]
          : [],
      rowCount: sql.startsWith("SELECT scan_id") ? 1 : 0,
    };
  };
  await expect(store.create(grant, job)).rejects.toThrow();
  expect(client.calls.some((c) => c.sql === "ROLLBACK")).toBe(true);
  expect(client.calls.some((c) => c.sql === "COMMIT")).toBe(false);
});
it("requires real live scope, bounded pagination and Guard database module", async () => {
  const { client, store, job } = await setup();
  await expect(
    store.get({ ...grant, workspaceId: "other" }, scope, job.id),
  ).rejects.toThrow();
  await expect(store.list(grant, scope, 51)).rejects.toThrow();
  expect(client.calls).toHaveLength(0);
  expect(
    () => new PostgresGuardStore(new PlatformDatabase(fakePool(client))),
  ).toThrow();
});
it("requires lease ownership and CAS revision for worker writes", async () => {
  const { client, store, job } = await setup(true);
  await expect(
    store.update(grant, { ...job, status: "preparing" }, 1),
  ).rejects.toThrow("lease_lost");
  await expect(
    store.update(grant, { ...job, status: "preparing" }, 1, {
      workerId: "expired",
      leaseToken: "stale",
    }),
  ).rejects.toThrow("lease_lost");
  expect(
    client.calls.some((c) => c.sql.includes("lease_until>clock_timestamp()")),
  ).toBe(true);
  expect(client.calls.some((c) => c.sql.startsWith("UPDATE guard.scans"))).toBe(
    false,
  );
});
it("Guard queue rejects Sentinel work and keeps shared heartbeat/retry implementations", async () => {
  const { client, db } = await setup(true),
    queue = new GuardPostgresQueue(db, scope);
  await expect(
    queue.claim({
      module: "sentinel",
      workerId: "g01",
      limit: 1,
      leaseMs: 30000,
    }),
  ).rejects.toThrow();
  expect(client.calls).toHaveLength(0);
  const { PostgresQueue } = await import("../../../src/platform/queue");
  expect(queue.heartbeat).toBe(PostgresQueue.prototype.heartbeat);
  expect(queue.retry).toBe(PostgresQueue.prototype.retry);
  expect(queue.complete).toBe(PostgresQueue.prototype.complete);
});
it("claim enforces the Guard-only budget, kind and source binding while reusing lease rows", async () => {
  const { client, db } = await setup(true);
  client.respond = async (sql) => ({
    rows: sql.includes("max_running")
      ? [{ max_running: 1 }]
      : sql.includes("SELECT project_id FROM guard.scans")
        ? [{ project_id: scope.projectId }]
        : sql.includes("active_lease_count")
          ? [{ n: 0 }]
          : [],
    rowCount: sql.includes("SELECT project_id FROM guard.scans") ? 1 : 0,
  });
  await new GuardPostgresQueue(db, scope).claim({
    module: "guard",
    workerId: "fixture-worker",
    limit: 1,
    leaseMs: 30000,
  });
  const sql = client.calls.map((c) => c.sql).join("\n");
  expect(sql).toContain("FOR UPDATE SKIP LOCKED");
  expect(sql).toContain("s.scan_id=platform.jobs.subject_ref");
  expect(sql).toContain("guard.active_lease_count");
  expect(sql).toContain("'action','queue_failed'");
  expect(sql).toContain(
    "COALESCE(s.job->'audit','[]'::jsonb)||jsonb_build_array",
  );
  expect(sql).not.toContain("sentinel.project_bindings");
  expect(client.calls.some((c) => c.values.includes("sentinel"))).toBe(false);
});

it("refuses rewriting an existing audit prefix even when the lease and revision match", async () => {
  const { client, store, job } = await setup(true);
  const { fingerprint } = await import("../../../src/platform/identity");
  const digest = fingerprint({
    scope: [job.mode, job.workspaceId, job.projectId],
    repository: job.repository,
    profile: job.profile,
    engines: job.requestedEngines,
    idempotencyKey: job.idempotencyKey,
  });
  client.respond = async (sql) => ({
    rows: sql.startsWith("SELECT job_id FROM platform.jobs")
      ? [{ job_id: job.id }]
      : sql.startsWith("SELECT job,revision")
        ? [{ job, revision: 1, fingerprint: digest, coverage: null }]
        : [],
    rowCount: 1,
  });
  await expect(
    store.update(grant, { ...job, audit: [] }, 1, {
      workerId: "fixture",
      leaseToken: "fixture-only",
    }),
  ).rejects.toThrow("revision_conflict");
  expect(client.calls.some((c) => c.sql.startsWith("UPDATE guard.scans"))).toBe(
    false,
  );
});

it("an exact-job worker claim and failure reconciliation cannot select other project jobs", async () => {
  const { client, db, job } = await setup(true);
  client.respond = async (sql) => ({
    rows: sql.includes("max_running")
      ? [{ max_running: 1 }]
      : sql.includes("SELECT project_id")
        ? [{ project_id: scope.projectId }]
        : sql.includes("active_lease_count")
          ? [{ n: 0 }]
          : [],
    rowCount: sql.includes("SELECT project_id") ? 1 : 0,
  });
  await new GuardPostgresQueue(db, scope, job.id).claim({
    module: "guard",
    workerId: "guard-fixture",
    limit: 1,
    leaseMs: 30000,
  });
  const candidates = client.calls.find((c) =>
    c.sql.includes("WITH candidates"),
  );
  expect(candidates?.sql).toContain("job_id=$9");
  expect(candidates?.values[8]).toBe(job.id);
  for (const query of client.calls.filter((c) => c.sql.startsWith("UPDATE"))) {
    expect(query.sql).toContain("$5");
    expect(query.values[4]).toBe(job.id);
  }
});

it("preserves a commit-bound SBOM in existing JSONB and rejects tampering before SQL (database double)", async () => {
  const { client, store, job } = await setup();
  const { repositorySbom } = await import("../../../src/features/guard/sbom");
  job.inventory = [
    {
      name: "is-number",
      version: "7.0.0",
      ecosystem: "npm",
      license: null,
      sourcePath: "package-lock.json",
    },
  ];
  job.runs = job.runs.filter((r) => r.engine !== "sbom");
  job.runs.push({
    engine: "sbom",
    status: "completed",
    scanner: "osv-scanner",
    version: "2.7.1",
    rulePack: "npm",
    reason: "controlled fixture",
    artifactDigest: "b".repeat(64),
    executionEvidence: {
      version: 1,
      runId: "unit",
      imageId: "sha256:" + "c".repeat(64),
      specDigest: "d".repeat(64),
      installationArtifactSha256: "e".repeat(64),
      cleanup: "VERIFIED",
    },
  });
  job.sbom = repositorySbom(job.inventory, job.repository, "b".repeat(64));
  client.respond = async (sql) => ({
    rows: sql.startsWith("INSERT INTO guard.scans")
      ? [{ job, revision: 1, coverage: null }]
      : sql.startsWith("SELECT scan_id")
        ? [{ scan_id: job.id }]
        : sql.startsWith("INSERT INTO platform.jobs")
          ? [{ job_id: job.id }]
          : [],
    rowCount: 1,
  });
  await store.create(grant, job);
  const insert = client.calls.find((c) =>
    c.sql.startsWith("INSERT INTO guard.scans"),
  );
  expect(JSON.stringify(insert?.values)).toContain("CycloneDX");
  client.calls.length = 0;
  job.sbom.metadata.properties[1].value = "f".repeat(40);
  await expect(store.create(grant, job)).rejects.toMatchObject({
    code: "source_integrity",
  });
  expect(client.calls).toHaveLength(0);
});
