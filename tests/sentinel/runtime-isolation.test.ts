import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import {
  acceptanceIsolation,
  verifyAcceptanceJobs,
  requestedAcceptanceIsolation,
} from "../../worker/sentinel/acceptance";
import { runSentinelWorker } from "../../worker/sentinel/runtime";
import {
  executeLease,
  type JobHandler,
  type LeaseAwareJobHandler,
} from "../../worker/sentinel/executor";
import type {
  DurableJobPort,
  JobLease,
} from "../../src/features/sentinel/platform-contracts";
import { PostgresQueue } from "../../src/platform/queue";
import { PlatformDatabase } from "../../src/platform/database";
import {
  workerConfig,
  type ApprovedDatabaseConfig,
} from "../../src/platform/config";
import { bindProject } from "../../src/features/sentinel/storage/projects";
import { RecordingClient, fakePool, lease } from "../platform/helpers";

const scope = {
  mode: "live" as const,
  workspaceId: "github-user-187839747:test",
  projectId: "github-998736528",
};
const plan = "c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94";
describe("shared executor compatibility - queue doubles only", () => {
  function queue() {
    return {
      enqueue: vi.fn(),
      claim: vi.fn(),
      cancel: vi.fn(),
      heartbeat: vi.fn(async (l: JobLease) => ({
        ...l,
        job: { ...l.job, revision: l.job.revision + 1 },
      })),
      complete: vi.fn(async () => {}),
      retry: vi.fn(async () => {}),
    } satisfies DurableJobPort;
  }
  it("preserves a legacy two-argument JobHandler used by Guard wrappers", async () => {
    const q = queue(),
      seen: string[] = [],
      l: JobLease = lease();
    l.job.module = "guard";
    l.job.kind = "guard.scan.prepare";
    const legacy: JobHandler = async (job, signal) => {
      expect(signal.aborted).toBe(false);
      seen.push(job.module);
    };
    const wrapper: JobHandler = (job, signal) => legacy(job, signal);
    expect(
      await executeLease(q, l, wrapper, {
        heartbeatMs: 100,
        timeoutMs: 500,
        signal: new AbortController().signal,
      }),
    ).toBe("completed");
    expect(seen).toEqual(["guard"]);
    expect(q.complete).toHaveBeenCalledWith(l);
    expect(q.retry).not.toHaveBeenCalled();
  });
  it("supplies the latest heartbeat revision to the additive fenced handler", async () => {
    vi.useFakeTimers();
    try {
      const q = queue(),
        initial = lease();
      const handler: LeaseAwareJobHandler = async (_job, _signal, current) => {
        expect(current().job.revision).toBe(initial.job.revision);
        await new Promise<void>((done) => setTimeout(done, 150));
        expect(current().job.revision).toBe(initial.job.revision + 1);
      };
      const work = executeLease(q, initial, handler, {
        heartbeatMs: 100,
        timeoutMs: 500,
        signal: new AbortController().signal,
      });
      await vi.advanceTimersByTimeAsync(150);
      expect(await work).toBe("completed");
      expect(q.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          job: expect.objectContaining({ revision: initial.job.revision + 1 }),
        }),
      );
      expect(q.retry).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
const sourceId = randomUUID();
const old = Array.from({ length: 8 }, (_, i) => `protected-${i}`);
const detection = () => ({
  scope,
  notBefore: new Date(Date.now() - 1000).toISOString(),
});
function config(delta: Record<string, unknown> = {}): ApprovedDatabaseConfig {
  const approvedAt = new Date(Date.now() - 2000).toISOString();
  return {
    target: {
      host: "127.0.0.1",
      port: 55432,
      database: "wetscan_dev",
      marker: "wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f",
    },
    purpose: "worker",
    user: "wetscan_sentinel_worker",
    password: "fixture-not-a-real-password",
    max: 3,
    approval: {
      schemaVersion: 1,
      status: "APPROVED",
      approvedBy: "fixture",
      approvedAt,
      target: {
        host: "127.0.0.1",
        port: 55432,
        database: "wetscan_dev",
        marker: "wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f",
      },
      actions: ["runtime"],
      migrationPlanSha256: plan,
      ...{
        s03RuntimeAcceptance: {
          pauseMaintenance: true,
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          protectedJobIds: old,
          jobIds: ["admitted-1"],
          sourceId,
          baselineSha256: "a".repeat(64),
          ...delta,
        },
      },
    },
  };
}
function fixture(expires?: string) {
  const activation = detection(),
    isolation = acceptanceIsolation(
      config(expires ? { expiresAt: expires } : {}),
      activation,
    )!;
  const client = new RecordingClient(),
    pool = fakePool(client),
    db = new PlatformDatabase(pool, true);
  const migrations = [
    "0001_foundation",
    "0002_telemetry",
    "0003_detection",
  ].map((version) => ({ version, checksum: "fixture", up: "", down: "" }));
  client.respond = async (sql) => {
    if (sql.includes("AS present"))
      return { rows: [{ present: false }], rowCount: 1 };
    if (sql.startsWith("SELECT job_id,module"))
      return {
        rows: [...old, "admitted-1"].map((job_id) => ({
          job_id,
          module: "sentinel",
          ...{
            mode: scope.mode,
            workspace_id: scope.workspaceId,
            project_id: scope.projectId,
          },
          kind: "sentinel.telemetry.accepted",
          subject_ref: sourceId + "/" + randomUUID(),
          state: "queued",
          new_enough: !old.includes(job_id),
          unexpired: true,
        })),
        rowCount: 9,
      };
    if (sql.startsWith("SELECT origin,environment"))
      return {
        rows: [{ origin: "controlled_test", environment: "local" }],
        rowCount: 1,
      };
    if (sql.startsWith("SELECT version,checksum"))
      return { rows: migrations, rowCount: 3 };
    if (sql.startsWith("SELECT mode,workspace_id"))
      return {
        rows: [
          {
            mode: scope.mode,
            workspace_id: scope.workspaceId,
            project_id: scope.projectId,
          },
        ],
        rowCount: 1,
      };
    if (sql.startsWith("SELECT project_id FROM sentinel.project_bindings"))
      return { rows: [{ project_id: scope.projectId }], rowCount: 1 };
    if (sql.startsWith("SELECT max_running"))
      return { rows: [{ max_running: 2 }], rowCount: 1 };
    if (sql.includes(" AS n")) return { rows: [{ n: 0 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const queue = new PostgresQueue(
    db,
    scope,
    ["sentinel.telemetry.accepted"],
    activation.notBefore,
    isolation.admission,
  );
  return { activation, isolation, client, pool, db, migrations, queue };
}
afterEach(() => vi.useRealTimers());
describe("expiring local acceptance isolation - SQL doubles, real runtime/HTTP lifecycle", () => {
  it("refuses an acceptance flag without its approval and approval without explicit opt-in", () => {
    const c = config();
    expect(() => requestedAcceptanceIsolation(c, detection(), false)).toThrow(
      "approval_required",
    );
    delete (c.approval as unknown as Record<string, unknown>)
      .s03RuntimeAcceptance;
    expect(() => requestedAcceptanceIsolation(c, detection(), true)).toThrow(
      "approval_required",
    );
    expect(requestedAcceptanceIsolation(c, detection(), false)).toBeUndefined();
  });
  it("leaves normal maintenance enabled when the extension is absent", () => {
    const c = config();
    delete (c.approval as unknown as Record<string, unknown>)
      .s03RuntimeAcceptance;
    expect(acceptanceIsolation(c, detection())).toBeUndefined();
  });
  it.each([
    { pauseMaintenance: false },
    { expiresAt: "invalid" },
    { expiresAt: new Date(0).toISOString() },
    { expiresAt: new Date(Date.now() + 3600000).toISOString() },
    { jobIds: [] },
    { jobIds: [old[0]] },
    { protectedJobIds: [] },
    { baselineSha256: "bad" },
  ])("fails closed for malformed/contradictory approval %j", (delta) => {
    expect(() => acceptanceIsolation(config(delta), detection())).toThrow(
      "approval_required",
    );
  });
  it("rejects wrong marker, target, role, scope and missing detection", () => {
    for (const mutate of [
      (c: ApprovedDatabaseConfig) =>
        (c.target.marker = "wetscan-s01:00000000-0000-0000-0000-000000000000"),
      (c: ApprovedDatabaseConfig) => (c.target.database = "wetscan_s01_test"),
      (c: ApprovedDatabaseConfig) => (c.user = "wetscan_app"),
    ]) {
      const c = config();
      mutate(c);
      expect(() => acceptanceIsolation(c, detection())).toThrow();
    }
    expect(() =>
      acceptanceIsolation(config(), {
        ...detection(),
        scope: { ...scope, projectId: "github-123" },
      }),
    ).toThrow();
    expect(() => acceptanceIsolation(config())).toThrow();
  });
  it("freezes captured IDs rather than following mutable caller configuration", () => {
    const f = fixture();
    expect(Object.isFrozen(f.isolation.admission.jobIds)).toBe(true);
    expect(
      () =>
        new PostgresQueue(
          f.db,
          { ...scope, projectId: "github-456" },
          ["sentinel.telemetry.accepted"],
          f.activation.notBefore,
          f.isolation.admission,
        ),
    ).toThrow();
  });
  it("places IDs and expiry in every claim/housekeeping mutation before row selection", async () => {
    const f = fixture();
    await f.queue.claim({
      module: "sentinel",
      workerId: "fixture",
      limit: 2,
      leaseMs: 30000,
    });
    const writes = f.client.calls.filter((c) =>
      /^(UPDATE|WITH candidates)/.test(c.sql),
    );
    expect(writes).toHaveLength(4);
    for (const w of writes) {
      expect(w.sql).toContain("job_id=ANY(");
      expect(w.sql).toContain("clock_timestamp()<");
      expect(w.values.at(-2)).toEqual(["admitted-1"]);
      expect(w.values.at(-1)).toBe(f.isolation.admission.expiresAt);
    }
  });
  it("rejects Guard and historical settlement/cancellation before any write", async () => {
    const f = fixture();
    await expect(
      f.queue.claim({
        module: "guard",
        workerId: "fixture",
        limit: 1,
        leaseMs: 30000,
      }),
    ).rejects.toThrow("scope_denied");
    const l = lease();
    Object.assign(l.job, scope, {
      kind: "sentinel.telemetry.accepted",
      jobId: old[0],
    });
    await expect(f.queue.heartbeat(l)).rejects.toThrow("scope_denied");
    await expect(f.queue.complete(l)).rejects.toThrow("scope_denied");
    await expect(
      f.queue.retry(l, {
        availableAt: new Date().toISOString(),
        redactedError: "handler_failed",
      }),
    ).rejects.toThrow("scope_denied");
    expect(() => f.queue.cancel(scope, "sentinel", old[0])).toThrow(
      "scope_denied",
    );
    expect(
      f.client.calls.filter((c) =>
        /^(UPDATE|INSERT|DELETE|WITH candidates)/.test(c.sql),
      ),
    ).toHaveLength(0);
  });
  it("refuses expired claims and historical leases even after a queue was created", async () => {
    const f = fixture();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.parse(f.isolation.admission.expiresAt) + 1));
    await expect(
      f.queue.claim({
        module: "sentinel",
        workerId: "fixture",
        limit: 1,
        leaseMs: 30000,
      }),
    ).rejects.toThrow("scope_denied");
    expect(f.client.calls).toHaveLength(0);
  });
  it("rolls back startup proof on an unexpected protected job state", async () => {
    const f = fixture(),
      respond = f.client.respond;
    f.client.respond = async (sql, v) => {
      const r = await respond(sql, v);
      if (sql.startsWith("SELECT job_id,module")) r.rows[0].state = "leased";
      return r;
    };
    await expect(
      verifyAcceptanceJobs(f.pool, f.isolation, f.activation, randomUUID()),
    ).rejects.toThrow("scope_denied");
    expect(f.client.calls.at(-1)?.sql).toBe("ROLLBACK");
  });
  it("skips all retention and binding cleanup, writes only new heartbeat, then shuts down cleanly", async () => {
    const f = fixture(),
      control = Object.assign(new EventEmitter(), {
        connected: true,
        disconnect: vi.fn(),
      });
    await runSentinelWorker({
      db: f.db,
      pool: f.pool,
      migrations: f.migrations,
      options: { ...workerConfig({}), healthPort: 0 },
      workerId: randomUUID(),
      control,
      once: true,
      detection: f.activation,
      isolation: f.isolation,
      report: () => {},
    });
    expect(
      f.client.calls.filter((c) => c.sql.startsWith("DELETE ")),
    ).toHaveLength(0);
    expect(
      f.client.calls.some((c) => c.sql.includes("SET last_cleanup_at")),
    ).toBe(false);
    const beats = f.client.calls.filter((c) =>
      c.sql.startsWith("INSERT INTO platform.worker_heartbeats"),
    );
    expect(beats.length).toBeGreaterThan(0);
    expect(beats.at(-1)?.values[2]).toBe("stopped");
    expect(f.pool.end).toHaveBeenCalledOnce();
  });
  it("retains a conditional no-op conflict path for identical authorized binding identity", async () => {
    const f = fixture();
    await f.db.scoped(scope, (tx) =>
      bindProject(f.db, tx, {
        scope,
        actorId: "github-user-187839747",
        repositoryId: "998736528",
        canvasProjectRef: "github-user-187839747/github-998736528",
      }),
    );
    const sql = f.client.calls.find((c) =>
      c.sql.startsWith("INSERT INTO sentinel.project_bindings"),
    )!.sql;
    expect(sql).toContain(
      "WHERE project_bindings.enabled IS DISTINCT FROM true OR project_bindings.actor_id IS DISTINCT FROM EXCLUDED.actor_id",
    );
  });
  it("restores normal maintenance when the next run has no acceptance control", async () => {
    const f = fixture(),
      control = Object.assign(new EventEmitter(), {
        connected: true,
        disconnect: vi.fn(),
      });
    await runSentinelWorker({
      db: f.db,
      pool: f.pool,
      migrations: f.migrations,
      options: { ...workerConfig({}), healthPort: 0 },
      workerId: randomUUID(),
      control,
      once: true,
      detection: f.activation,
      report: () => {},
    });
    expect(
      f.client.calls.some((c) =>
        c.sql.startsWith("DELETE FROM platform.worker_heartbeats"),
      ),
    ).toBe(true);
  });
  it("expires a running pause and shuts down rather than falling back to maintenance", async () => {
    const f = fixture(new Date(Date.now() + 1000).toISOString());
    const control = Object.assign(new EventEmitter(), {
      connected: true,
      disconnect: vi.fn(),
    });
    const events: { phase: string; reason?: string }[] = [];
    await runSentinelWorker({
      db: f.db,
      pool: f.pool,
      migrations: f.migrations,
      options: { ...workerConfig({}), pollMs: 100, healthPort: 0 },
      workerId: randomUUID(),
      control,
      detection: f.activation,
      isolation: f.isolation,
      report: (e) => events.push(e),
    });
    expect(
      events.some(
        (e) =>
          e.phase === "shutdown_requested" && e.reason === "acceptance_expired",
      ),
    ).toBe(true);
    expect(events.at(-1)?.phase).toBe("stopped");
    expect(
      f.client.calls.filter((c) => c.sql.startsWith("DELETE ")),
    ).toHaveLength(0);
    expect(f.pool.end).toHaveBeenCalledOnce();
  });
  it("admits a captured new job and guards both settlement and attempt updates in SQL", async () => {
    const f = fixture(),
      respond = f.client.respond;
    f.client.respond = async (sql, v) => {
      if (sql.startsWith("WITH candidates"))
        return {
          rows: [
            {
              module: "sentinel",
              mode: "live",
              workspace_id: scope.workspaceId,
              project_id: scope.projectId,
              job_id: "admitted-1",
              kind: "sentinel.telemetry.accepted",
              subject_ref: sourceId + "/" + randomUUID(),
              idempotency_key: "fixture",
              revision: 2,
              attempts: 1,
              max_attempts: 3,
              available_at: new Date(),
              cancel_requested: false,
              lease_owner: "fixture",
              lease_token: "1:fixture",
              lease_until: new Date(Date.now() + 30000),
            },
          ],
          rowCount: 1,
        };
      if (
        sql.startsWith("INSERT INTO platform.job_attempts") ||
        sql.startsWith("UPDATE platform.jobs j SET state='completed'") ||
        sql.startsWith("UPDATE platform.job_attempts SET outcome")
      )
        return { rows: [{ job_id: "admitted-1" }], rowCount: 1 };
      return respond(sql, v);
    };
    const [l] = await f.queue.claim({
      module: "sentinel",
      workerId: "fixture",
      limit: 1,
      leaseMs: 30000,
    });
    expect(l.job.jobId).toBe("admitted-1");
    await f.queue.complete(l);
    for (const c of f.client.calls.filter(
      (c) =>
        c.sql.startsWith("UPDATE platform.jobs j SET state='completed'") ||
        c.sql.startsWith("UPDATE platform.job_attempts SET outcome"),
    )) {
      expect(c.sql).toContain("job_id=ANY(");
      expect(c.values.at(-2)).toEqual(["admitted-1"]);
    }
  });
});

describe("s04 incident acceptance isolation - SQL doubles, fail-closed worker runtime", () => {
  const s04Plan =
    "3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7";
  const s04IncidentChecksum =
    "84b5b4987e498bbb047505cd81218716357ce5f1434fb466749c7ed433141663";
  const s04Migrations = (include0004 = true, checksum0004 = s04IncidentChecksum) => [
    ...["0001_foundation", "0002_telemetry", "0003_detection"].map(
      (version) => ({ version, checksum: "fixture", up: "", down: "" }),
    ),
    ...(include0004
      ? [{ version: "0004_incidents", checksum: checksum0004, up: "", down: "" }]
      : []),
  ];
  function s04Config(
    delta: Record<string, unknown> = {},
    approvalOverrides: Record<string, unknown> = {},
  ): ApprovedDatabaseConfig {
    const approvedAt = new Date(Date.now() - 2000).toISOString();
    return {
      ...config(),
      approval: {
        schemaVersion: 1,
        status: "APPROVED",
        approvedBy: "fixture",
        approvedAt,
        target: {
          host: "127.0.0.1",
          port: 55432,
          database: "wetscan_dev",
          marker: "wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f",
        },
        actions: ["runtime"],
        migrationPlanSha256: s04Plan,
        ...approvalOverrides,
        ...{
          s04RuntimeAcceptance: {
            pauseMaintenance: true,
            expiresAt: new Date(Date.now() + 60000).toISOString(),
            protectedJobIds: old,
            jobIds: ["admitted-1"],
            sourceId,
            baselineSha256: "b".repeat(64),
            ...delta,
          },
        },
      },
    };
  }
  function s04Fixture(
    expires?: string,
    include0004 = true,
    checksum0004 = s04IncidentChecksum,
  ) {
    const det = detection(),
      inc = { scope, notBefore: det.notBefore };
    const migrations = s04Migrations(include0004, checksum0004);
    const isolation = acceptanceIsolation(
      s04Config(expires ? { expiresAt: expires } : {}),
      det,
      inc,
      migrations,
    )!;
    const base = fixture();
    const respond = base.client.respond;
    base.client.respond = async (sql, v) => {
      if (sql.startsWith("SELECT version,checksum"))
        return { rows: migrations, rowCount: migrations.length };
      if (sql.startsWith("SELECT job_id,module")) {
        const res = await respond(sql, v);
        return {
          ...res,
          rows: res.rows.map((r) => ({
            ...r,
            incident_eligible: !old.includes(String(r.job_id)),
          })),
        };
      }
      return respond(sql, v);
    };
    const queue = new PostgresQueue(
      base.db,
      scope,
      ["sentinel.telemetry.accepted"],
      inc.notBefore,
      isolation.admission,
    );
    return {
      detection: det,
      incidents: inc,
      isolation,
      client: base.client,
      pool: base.pool,
      db: base.db,
      migrations,
      queue,
    };
  }

  it("accepts a valid S04 plan, approval, incident activation, and 0004_incidents migration", () => {
    const f = s04Fixture();
    expect(f.isolation.packet).toBe("s04");
    expect(Object.isFrozen(f.isolation)).toBe(true);
    expect(Object.isFrozen(f.isolation.admission.jobIds)).toBe(true);
    expect(f.isolation.protectedJobIds).toEqual(old);
    expect(
      requestedAcceptanceIsolation(
        s04Config(),
        f.detection,
        true,
        f.incidents,
        f.migrations,
      )?.packet,
    ).toBe("s04");
  });

  it("enforces strict packet-to-plan binding and rejects mixed S03/S04 acceptance blocks", () => {
    const det = detection(),
      inc = { scope, notBefore: det.notBefore };
    expect(() =>
      acceptanceIsolation(
        s04Config({}, { migrationPlanSha256: plan }),
        det,
        inc,
        s04Migrations(),
      ),
    ).toThrow("approval_required");
    expect(() =>
      acceptanceIsolation(
        {
          ...config(),
          approval: { ...config().approval, migrationPlanSha256: s04Plan },
        },
        det,
      ),
    ).toThrow("approval_required");
    expect(() =>
      acceptanceIsolation(
        s04Config(
          {},
          {
            s03RuntimeAcceptance: (
              config().approval as unknown as Record<string, unknown>
            ).s03RuntimeAcceptance,
          },
        ),
        det,
        inc,
        s04Migrations(),
      ),
    ).toThrow("approval_required");
    expect(() =>
      requestedAcceptanceIsolation(
        s04Config(),
        det,
        false,
        inc,
        s04Migrations(),
      ),
    ).toThrow("approval_required");
  });

  it("fails closed when 0004_incidents migration is missing or checksum-mismatched", async () => {
    const det = detection(),
      inc = { scope, notBefore: det.notBefore };
    expect(() =>
      acceptanceIsolation(s04Config(), det, inc, s04Migrations(false)),
    ).toThrow("approval_required");
    expect(() =>
      acceptanceIsolation(
        s04Config(),
        det,
        inc,
        s04Migrations(true, "0".repeat(64)),
      ),
    ).toThrow("approval_required");

    const f = s04Fixture();
    const responder = f.client.respond;
    f.client.respond = async (sql, v) => {
      if (sql.startsWith("SELECT version,checksum"))
        return { rows: s04Migrations(false), rowCount: 3 };
      return responder(sql, v);
    };
    await expect(
      verifyAcceptanceJobs(
        f.pool,
        f.isolation,
        f.detection,
        randomUUID(),
        f.incidents,
      ),
    ).rejects.toThrow("scope_denied");
    expect(f.client.calls.at(-1)?.sql).toBe("ROLLBACK");

    const fBadChecksum = s04Fixture();
    const badResponder = fBadChecksum.client.respond;
    fBadChecksum.client.respond = async (sql, v) => {
      if (sql.startsWith("SELECT version,checksum"))
        return { rows: s04Migrations(true, "0".repeat(64)), rowCount: 4 };
      return badResponder(sql, v);
    };
    await expect(
      verifyAcceptanceJobs(
        fBadChecksum.pool,
        fBadChecksum.isolation,
        fBadChecksum.detection,
        randomUUID(),
        fBadChecksum.incidents,
      ),
    ).rejects.toThrow("scope_denied");
    expect(fBadChecksum.client.calls.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("rejects missing, cross-scope, or chronologically invalid IncidentActivation", async () => {
    const det = detection(),
      migs = s04Migrations();
    expect(() => acceptanceIsolation(s04Config(), det, undefined, migs)).toThrow(
      "approval_required",
    );
    expect(() =>
      acceptanceIsolation(
        s04Config(),
        det,
        { scope: { ...scope, projectId: "github-123" }, notBefore: det.notBefore },
        migs,
      ),
    ).toThrow("approval_required");
    expect(() =>
      acceptanceIsolation(
        s04Config(),
        det,
        { scope, notBefore: new Date(Date.parse(det.notBefore) - 1000).toISOString() },
        migs,
      ),
    ).toThrow("approval_required");
    expect(() =>
      acceptanceIsolation(
        s04Config(),
        det,
        { scope, notBefore: new Date(Date.now() - 5000).toISOString() },
        migs,
      ),
    ).toThrow("approval_required");

    const f = s04Fixture();
    await expect(
      verifyAcceptanceJobs(f.pool, f.isolation, f.detection, randomUUID()),
    ).rejects.toThrow("scope_denied");
    expect(f.client.calls).toHaveLength(0);
  });

  it("rejects wrong DEV marker, target, role, invalid expiry, malformed/oversized jobIds, or duplicate protected IDs", () => {
    const det = detection(),
      inc = { scope, notBefore: det.notBefore },
      migs = s04Migrations();
    for (const mutate of [
      (c: ApprovedDatabaseConfig) =>
        (c.target.marker = "wetscan-s01:00000000-0000-0000-0000-000000000000"),
      (c: ApprovedDatabaseConfig) => (c.target.database = "wetscan_s01_test"),
      (c: ApprovedDatabaseConfig) => (c.target.host = "localhost"),
      (c: ApprovedDatabaseConfig) => (c.target.port = 5432),
      (c: ApprovedDatabaseConfig) => (c.user = "wetscan_app"),
      (c: ApprovedDatabaseConfig) => (c.purpose = "app"),
    ]) {
      const c = s04Config();
      mutate(c);
      expect(() => acceptanceIsolation(c, det, inc, migs)).toThrow(
        "approval_required",
      );
    }
    for (const delta of [
      { pauseMaintenance: false },
      { expiresAt: new Date(Date.now() - 1).toISOString() },
      { expiresAt: new Date(Date.now() + 601000).toISOString() },
      { expiresAt: new Date(Date.now() + 60000).toISOString().replace("Z", "+00:00") },
      { jobIds: [] },
      { jobIds: Array.from({ length: 13 }, (_, i) => `job-${i}`) },
      { jobIds: [""] },
      { jobIds: [old[0]] },
      { protectedJobIds: old.slice(0, 7) },
      { protectedJobIds: [...old.slice(0, 7), old[0]] },
      { sourceId: "not-a-uuid" },
      { baselineSha256: "short" },
    ]) {
      expect(() =>
        acceptanceIsolation(s04Config(delta), det, inc, migs),
      ).toThrow("approval_required");
    }
  });

  it("verifies protected DEV historical jobs stay excluded and rolls back unexpected states or pre-incident cutoffs", async () => {
    const f = s04Fixture(),
      respond = f.client.respond;
    f.client.respond = async (sql, v) => {
      const res = await respond(sql, v);
      if (sql.startsWith("SELECT job_id,module")) {
        expect(sql).toContain("incident_eligible");
        expect(v).toEqual([
          [...f.isolation.admission.jobIds, ...old],
          f.detection.notBefore,
          f.isolation.admission.expiresAt,
          f.incidents.notBefore,
        ]);
      }
      return res;
    };
    await verifyAcceptanceJobs(
      f.pool,
      f.isolation,
      f.detection,
      randomUUID(),
      f.incidents,
    );
    expect(f.client.calls.at(-1)?.sql).toBe("COMMIT");

    const f2 = s04Fixture(),
      respond2 = f2.client.respond;
    f2.client.respond = async (sql, v) => {
      const res = await respond2(sql, v);
      if (sql.startsWith("SELECT job_id,module")) {
        const admitted = res.rows.find((r) => r.job_id === "admitted-1")!;
        admitted.incident_eligible = false;
      }
      return res;
    };
    await expect(
      verifyAcceptanceJobs(
        f2.pool,
        f2.isolation,
        f2.detection,
        randomUUID(),
        f2.incidents,
      ),
    ).rejects.toThrow("scope_denied");
    expect(f2.client.calls.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("enforces SQL admission filters and blocks historical jobs on S04 queue claims and settlements", async () => {
    const f = s04Fixture();
    await f.queue.claim({
      module: "sentinel",
      workerId: "fixture",
      limit: 2,
      leaseMs: 30000,
    });
    const claimWrites = f.client.calls.filter((c) =>
      /^(UPDATE|WITH candidates)/.test(c.sql),
    );
    expect(claimWrites).toHaveLength(4);
    for (const w of claimWrites) {
      expect(w.sql).toContain("job_id=ANY(");
      expect(w.sql).toContain("clock_timestamp()<");
      expect(w.values.at(-2)).toEqual(["admitted-1"]);
      expect(w.values.at(-1)).toBe(f.isolation.admission.expiresAt);
    }
    const oldLease = lease();
    Object.assign(oldLease.job, scope, {
      kind: "sentinel.telemetry.accepted",
      jobId: old[0],
    });
    await expect(f.queue.complete(oldLease)).rejects.toThrow("scope_denied");
    expect(() => f.queue.cancel(scope, "sentinel", old[0])).toThrow(
      "scope_denied",
    );
  });

  it("refuses S04 isolated worker startup without IncidentActivation or valid 0004_incidents before querying DB", async () => {
    const f = s04Fixture(),
      control = Object.assign(new EventEmitter(), {
        connected: true,
        disconnect: vi.fn(),
      });
    await expect(
      runSentinelWorker({
        db: f.db,
        pool: f.pool,
        migrations: f.migrations,
        options: { ...workerConfig({}), healthPort: 0 },
        workerId: randomUUID(),
        control,
        once: true,
        detection: f.detection,
        isolation: f.isolation,
        report: () => {},
      }),
    ).rejects.toThrow("approval_required");
    await expect(
      runSentinelWorker({
        db: f.db,
        pool: f.pool,
        migrations: s04Migrations(false),
        options: { ...workerConfig({}), healthPort: 0 },
        workerId: randomUUID(),
        control,
        once: true,
        detection: f.detection,
        incidents: f.incidents,
        isolation: f.isolation,
        report: () => {},
      }),
    ).rejects.toThrow("approval_required");
    expect(f.client.calls).toHaveLength(0);
  });

  it("skips all 5 S04 retention loops, shuts down cleanly at acceptanceDeadline, and leaves non-isolated S04 maintenance intact", async () => {
    const f = s04Fixture(new Date(Date.now() + 900).toISOString()),
      control = Object.assign(new EventEmitter(), {
        connected: true,
        disconnect: vi.fn(),
      }),
      events: { phase: string; reason?: string }[] = [];
    await runSentinelWorker({
      db: f.db,
      pool: f.pool,
      migrations: f.migrations,
      options: { ...workerConfig({}), pollMs: 100, healthPort: 0 },
      workerId: randomUUID(),
      control,
      detection: f.detection,
      incidents: f.incidents,
      isolation: f.isolation,
      report: (e) => events.push(e),
    });
    expect(
      events.some(
        (e) =>
          e.phase === "shutdown_requested" && e.reason === "acceptance_expired",
      ),
    ).toBe(true);
    expect(events.at(-1)?.phase).toBe("stopped");
    expect(
      f.client.calls.filter((c) => c.sql.startsWith("DELETE ")),
    ).toHaveLength(0);
    expect(
      f.client.calls.some((c) => c.sql.includes("SELECT retention_hold")),
    ).toBe(false);
    expect(
      f.client.calls.some((c) => c.sql.includes("SET last_cleanup_at")),
    ).toBe(false);
    expect(f.pool.end).toHaveBeenCalledTimes(1);

    const normal = s04Fixture();
    await runSentinelWorker({
      db: normal.db,
      pool: normal.pool,
      migrations: normal.migrations,
      options: { ...workerConfig({}), healthPort: 0 },
      workerId: randomUUID(),
      control: Object.assign(new EventEmitter(), {
        connected: true,
        disconnect: vi.fn(),
      }),
      once: true,
      detection: normal.detection,
      incidents: normal.incidents,
      report: () => {},
    });
    expect(
      normal.client.calls.some((c) =>
        c.sql.startsWith("DELETE FROM platform.worker_heartbeats"),
      ),
    ).toBe(true);
    expect(
      normal.client.calls.some((c) => c.sql.includes("SELECT retention_hold")),
    ).toBe(true);
  });

  it("blocks maintenance execution inside executeLease defense-in-depth under S04 isolation", async () => {
    const f = s04Fixture(),
      respond = f.client.respond;
    let claimedOnce = false;
    f.client.respond = async (sql, v) => {
      if (sql.startsWith("WITH candidates") && !claimedOnce) {
        claimedOnce = true;
        return {
          rows: [
            {
              module: "sentinel",
              mode: "live",
              workspace_id: scope.workspaceId,
              project_id: scope.projectId,
              job_id: "admitted-1",
              kind: "sentinel.maintenance",
              subject_ref: sourceId + "/" + randomUUID(),
              idempotency_key: "fixture",
              revision: 2,
              attempts: 1,
              max_attempts: 3,
              available_at: new Date(),
              cancel_requested: false,
              lease_owner: "fixture",
              lease_token: "1:fixture",
              lease_until: new Date(Date.now() + 30000),
            },
          ],
          rowCount: 1,
        };
      }
      if (
        sql.startsWith("INSERT INTO platform.job_attempts") ||
        sql.startsWith("UPDATE platform.jobs j SET state='failed'") ||
        sql.startsWith("UPDATE platform.jobs j SET state='queued'") ||
        sql.startsWith("UPDATE platform.job_attempts SET outcome")
      )
        return { rows: [{ job_id: "admitted-1" }], rowCount: 1 };
      return respond(sql, v);
    };
    await runSentinelWorker({
      db: f.db,
      pool: f.pool,
      migrations: f.migrations,
      options: { ...workerConfig({}), healthPort: 0 },
      workerId: randomUUID(),
      control: Object.assign(new EventEmitter(), {
        connected: true,
        disconnect: vi.fn(),
      }),
      once: true,
      detection: f.detection,
      incidents: f.incidents,
      isolation: f.isolation,
      report: () => {},
    });
    expect(
      f.client.calls.filter((c) => c.sql.startsWith("DELETE ")),
    ).toHaveLength(0);
    expect(
      f.client.calls.some((c) => c.sql.includes("SET last_cleanup_at")),
    ).toBe(false);
    expect(
      f.client.calls.some((c) =>
        c.sql.startsWith("UPDATE platform.jobs j SET state='completed'"),
      ),
    ).toBe(false);
  });
});
