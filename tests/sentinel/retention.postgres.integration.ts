import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { QueryResultRow } from "pg";
import { setTimeout as delay } from "node:timers/promises";
import { approvedDatabaseConfig } from "../../src/platform/config";
import {
  ApprovedPool,
  PlatformDatabase,
  type SqlPool,
} from "../../src/platform/database";
import { migrationPlan } from "../../src/platform/migrations";
import { PostgresQueue } from "../../src/platform/queue";
import {
  TelemetryStore,
  retainTelemetry,
} from "../../src/features/sentinel/telemetry/store";
import type {
  SentinelProjectContext,
  SentinelScope,
} from "../../src/features/sentinel/types";
import {
  evidenceSnapshot,
  verifyPreserved,
  type EvidenceSnapshot,
} from "./telemetry-retest-safety";

if (process.env.SENTINEL_RETENTION_TEST_APPROVED !== "1")
  throw Error("Use isolated retention runner");
const pools: ApprovedPool[] = [];
let primary: SentinelProjectContext,
  other: SentinelProjectContext,
  app: PlatformDatabase,
  worker: PlatformDatabase,
  before: EvidenceSnapshot;
let sourceId: string, queuedId: string, leasedId: string, recentId: string;
let onBinding: ((pid: number) => void) | undefined;
const deletionAudit: { table: string; count: number }[] = [];
const context = (scope: SentinelScope): SentinelProjectContext => ({
  scope,
  actorId: "github-user-7",
  repositoryId: scope.projectId.slice(7),
  canvasProjectRef: `github-user-7/${scope.projectId}`,
});
const sourceConfig = {
  name: "Disposable retention acceptance",
  environment: "local",
  origin: "controlled_test",
  retentionDays: 7,
};
const args = () => [
  primary.scope.mode,
  primary.scope.workspaceId,
  primary.scope.projectId,
];
async function state(ctx = primary) {
  return app.scoped(ctx.scope, async (tx) => ({
    events: (
      await app.query(
        tx,
        "SELECT event_id FROM sentinel.telemetry_events ORDER BY event_id",
      )
    ).rows.map((r) => r.event_id as string),
    batches: Number(
      (
        await app.query(
          tx,
          "SELECT count(*)::int AS n FROM sentinel.telemetry_batches",
        )
      ).rows[0].n,
    ),
  }));
}
async function insertExpired(id: string) {
  await app.scoped(primary.scope, (tx) =>
    app.query(
      tx,
      "INSERT INTO sentinel.telemetry_events(mode,workspace_id,project_id,source_id,event_id,kind,severity,occurred_at,ingested_at,fingerprint,event) VALUES($1,$2,$3,$4,$5,'auth.failed','info',clock_timestamp()-interval '8 days',clock_timestamp()-interval '8 days',$6,$7::jsonb)",
      [
        ...args(),
        sourceId,
        id,
        "d".repeat(64),
        JSON.stringify({ eventId: id }),
      ],
    ),
  );
}
async function enqueue(
  tx: Parameters<PostgresQueue["enqueue"]>[0],
  id: string,
) {
  return new PostgresQueue(app).enqueue(tx, {
    ...primary.scope,
    schemaVersion: 1,
    module: "sentinel",
    jobId: randomUUID(),
    kind: "sentinel.telemetry.accepted",
    subjectRef: `${sourceId}/${id}`,
    idempotencyKey: `retention:${id}`,
    revision: 1,
    attempts: 0,
    maxAttempts: 5,
    availableAt: new Date().toISOString(),
    cancelRequested: false,
  });
}
async function waitBlocked(pid: number) {
  const c = await pools[1].connect();
  try {
    for (let n = 0; n < 50; n++) {
      if (
        (
          await c.query(
            "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted) AS blocked",
            [pid],
          )
        ).rows[0].blocked
      )
        return;
      await delay(20);
    }
    throw Error("expected_binding_lock_wait_not_observed");
  } finally {
    c.release();
  }
}
beforeAll(async () => {
  const plan = await migrationPlan();
  expect(plan.sha256).toBe(
    "9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9",
  );
  const approval = JSON.parse(
    await readFile(process.env.SENTINEL_DB_APPROVAL_FILE!, "utf8"),
  );
  expect(approval.disposableScope.workspaceId).toMatch(
    /^github-user-7:s02-retention-[a-f0-9-]{36}$/,
  );
  primary = context(approval.disposableScope);
  other = context({ ...primary.scope, projectId: "github-456" });
  for (const p of ["app", "worker", "migration"] as const)
    pools.push(
      new ApprovedPool(
        await approvedDatabaseConfig(
          process.env,
          p,
          "integration_test",
          plan.sha256,
        ),
      ),
    );
  before = await evidenceSnapshot(pools[2]);
  const preflight = JSON.parse(
    await readFile(".local/sentinel/s02-retention-preflight.json", "utf8"),
  );
  expect(before).toEqual(preflight.snapshot);
  expect(before.ledger.map((r) => [r.version, r.checksum])).toEqual(
    plan.migrations.map((m) => [m.version, m.checksum]),
  );
  const c = await pools[2].connect();
  try {
    expect(
      (
        await c.query(
          "SELECT count(*)::int AS n FROM sentinel.project_bindings WHERE workspace_id=$1",
          [primary.scope.workspaceId],
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    c.release();
  }
  // Independent test-only firewall: DELETE must explicitly target this newly approved scope.
  const audited: SqlPool = {
    connect: async () => {
      const c = await pools[1].connect();
      const pid = (await c.query("SELECT pg_backend_pid() AS pid")).rows[0]
        .pid as number;
      return {
        query: async <R extends QueryResultRow>(
          sql: string,
          values?: unknown[],
        ) => {
          if (sql.startsWith("SELECT retention_hold")) {
            const hook = onBinding;
            onBinding = undefined;
            hook?.(pid);
          }
          if (/^(UPDATE|INSERT|ALTER|DROP|TRUNCATE|GRANT|REVOKE)/i.test(sql))
            throw Error("unapproved_worker_statement");
          if (sql.startsWith("DELETE")) {
            if (
              !/^DELETE FROM sentinel\.telemetry_(events|batches) WHERE mode=\$1 AND workspace_id=\$2 AND project_id=\$3/.test(
                sql,
              ) ||
              JSON.stringify(values) !== JSON.stringify(args())
            )
              throw Error("deletion_scope_denied");
            const result = await c.query<R>(sql, values);
            deletionAudit.push({
              table: sql.startsWith("DELETE FROM sentinel.telemetry_events")
                ? "events"
                : "batches",
              count: result.rowCount ?? 0,
            });
            return result;
          }
          return c.query<R>(sql, values);
        },
        release: (destroy) => c.release(destroy),
      };
    },
    end: async () => {},
  };
  app = new PlatformDatabase(pools[0]);
  worker = new PlatformDatabase(audited, true);
  const store = new TelemetryStore(app);
  sourceId = (await store.create(primary, sourceConfig)).sourceId;
  const witness = (await store.create(other, sourceConfig)).sourceId;
  queuedId = randomUUID();
  leasedId = randomUUID();
  recentId = randomUUID();
  await app.scoped(primary.scope, async (tx) => {
    await app.query(
      tx,
      "INSERT INTO sentinel.telemetry_events(mode,workspace_id,project_id,source_id,event_id,kind,severity,occurred_at,ingested_at,fingerprint,event) SELECT $1,$2,$3,$4,gen_random_uuid(),'auth.failed','info',clock_timestamp()-interval '8 days',clock_timestamp()-interval '8 days',$5,'{}'::jsonb FROM generate_series(1,205)",
      [...args(), sourceId, "a".repeat(64)],
    );
    for (const id of [queuedId, leasedId, recentId])
      await app.query(
        tx,
        "INSERT INTO sentinel.telemetry_events(mode,workspace_id,project_id,source_id,event_id,kind,severity,occurred_at,ingested_at,fingerprint,event) VALUES($1,$2,$3,$4,$5,'auth.failed','info',clock_timestamp(),CASE WHEN $6 THEN clock_timestamp() ELSE clock_timestamp()-interval '8 days' END,$7,$8::jsonb)",
        [
          ...args(),
          sourceId,
          id,
          id === recentId,
          "b".repeat(64),
          JSON.stringify({ eventId: id }),
        ],
      );
    await app.query(
      tx,
      "INSERT INTO sentinel.telemetry_batches(mode,workspace_id,project_id,source_id,batch_id,fingerprint,receipt,recorded_at) SELECT $1,$2,$3,$4,gen_random_uuid(),$5,'[]'::jsonb,clock_timestamp()-interval '2 days' FROM generate_series(1,205)",
      [...args(), sourceId, "c".repeat(64)],
    );
    await app.query(
      tx,
      "INSERT INTO sentinel.telemetry_batches(mode,workspace_id,project_id,source_id,batch_id,fingerprint,receipt) VALUES($1,$2,$3,$4,$5,$6,'[]'::jsonb)",
      [...args(), sourceId, randomUUID(), "d".repeat(64)],
    );
    await enqueue(tx, queuedId);
    const leased = await enqueue(tx, leasedId);
    await app.query(
      tx,
      "UPDATE platform.jobs SET state='leased',attempts=1,fence=1,lease_owner='isolated-retention-fixture',lease_token='1:isolated-fixture',lease_until=clock_timestamp()+interval '5 minutes',lease_ms=5000 WHERE job_id=$1",
      [leased.jobId],
    );
    await app.query(
      tx,
      "UPDATE sentinel.project_bindings SET retention_hold=true WHERE mode=$1 AND workspace_id=$2 AND project_id=$3",
      args(),
    );
  });
  await app.scoped(other.scope, async (tx) => {
    await app.query(
      tx,
      "INSERT INTO sentinel.telemetry_events(mode,workspace_id,project_id,source_id,event_id,kind,severity,occurred_at,ingested_at,fingerprint,event) VALUES('live',$1,$2,$3,$4,'auth.failed','info',clock_timestamp()-interval '8 days',clock_timestamp()-interval '8 days',$5,'{}'::jsonb)",
      [
        other.scope.workspaceId,
        other.scope.projectId,
        witness,
        randomUUID(),
        "e".repeat(64),
      ],
    );
    await app.query(
      tx,
      "INSERT INTO sentinel.telemetry_batches(mode,workspace_id,project_id,source_id,batch_id,fingerprint,receipt,recorded_at) VALUES('live',$1,$2,$3,$4,$5,'[]'::jsonb,clock_timestamp()-interval '2 days')",
      [
        other.scope.workspaceId,
        other.scope.projectId,
        witness,
        randomUUID(),
        "f".repeat(64),
      ],
    );
  });
  await writeFile(
    ".local/sentinel/s02-retention-run-baseline.json",
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        scope: primary.scope,
        before,
        fixtureEvents: 208,
        fixtureBatches: 206,
        queuedId,
        leasedId,
        recentId,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
});
afterAll(async () => {
  try {
    if (before) {
      const after = await evidenceSnapshot(pools[2]);
      verifyPreserved(before, after);
      await writeFile(
        ".local/sentinel/s02-retention-run-after.json",
        JSON.stringify(
          {
            recordedAt: new Date().toISOString(),
            preserved: true,
            after,
            deletionAudit,
          },
          null,
          2,
        ) + "\n",
        { flag: "wx" },
      );
      console.log(
        JSON.stringify({
          priorEvidencePreserved: true,
          ledgerAndPermissionsUnchanged: true,
          deletionAudit,
          counts: after.counts,
        }),
      );
    }
  } finally {
    await Promise.all(pools.map((p) => p.end()));
  }
});
describe("case17 real PostgreSQL least-privilege retention (new disposable fixtures only)", () => {
  it("retains SELECT/DELETE-only grants, rejects telemetry UPDATE and has FORCE RLS", async () => {
    const c = await pools[1].connect();
    try {
      const rows = (
        await c.query(
          "SELECT t,has_table_privilege(current_user,t,'SELECT') AS s,has_table_privilege(current_user,t,'DELETE') AS d,has_table_privilege(current_user,t,'UPDATE') AS u FROM unnest(ARRAY['sentinel.telemetry_events','sentinel.telemetry_batches']) AS t",
        )
      ).rows;
      expect(rows.every((r) => r.s && r.d && !r.u)).toBe(true);
      expect(
        (
          await c.query(
            "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN ('sentinel.telemetry_events'::regclass,'sentinel.telemetry_batches'::regclass)",
          )
        ).rows.every((r) => r.relrowsecurity && r.relforcerowsecurity),
      ).toBe(true);
    } finally {
      c.release();
    }
    const restricted = new PlatformDatabase(pools[1], true);
    await expect(
      restricted.scoped(primary.scope, (tx) =>
        restricted.query(
          tx,
          "UPDATE sentinel.telemetry_events SET severity='info' WHERE false",
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("legal hold preserves all new expired rows and receipts", async () => {
    expect(await retainTelemetry(worker, primary.scope)).toEqual({
      events: 0,
      batches: 0,
    });
    expect((await state()).events).toHaveLength(208);
    expect((await state()).batches).toBe(206);
    await app.scoped(primary.scope, (tx) =>
      app.query(
        tx,
        "UPDATE sentinel.project_bindings SET retention_hold=false WHERE mode=$1 AND workspace_id=$2 AND project_id=$3",
        args(),
      ),
    );
  });
  it("deletes exactly100 eligible rows per table, leaving queued/leased/recent evidence", async () => {
    expect(await retainTelemetry(worker, primary.scope)).toEqual({
      events: 100,
      batches: 100,
    });
    const remaining = await state();
    expect(remaining.events).toHaveLength(108);
    expect(remaining.batches).toBe(106);
    expect(remaining.events).toEqual(
      expect.arrayContaining([queuedId, leasedId, recentId]),
    );
  });
  it("concurrent passes serialize without duplicate deletion or exceeding per-pass bounds", async () => {
    const results = await Promise.all([
      retainTelemetry(worker, primary.scope),
      retainTelemetry(worker, primary.scope),
    ]);
    expect(results.map((r) => r.events).sort((a, b) => a - b)).toEqual([
      5, 100,
    ]);
    expect(results.map((r) => r.batches).sort((a, b) => a - b)).toEqual([
      5, 100,
    ]);
    expect((await state()).events.sort()).toEqual(
      [queuedId, leasedId, recentId].sort(),
    );
    expect((await state()).batches).toBe(1);
  });
  it("denies app/Guard retention and leaves expired cross-project witness untouched", async () => {
    await expect(retainTelemetry(app, other.scope)).rejects.toThrow(
      "scope_denied",
    );
    await expect(
      retainTelemetry(
        new PlatformDatabase(pools[1], true, "guard"),
        primary.scope,
      ),
    ).rejects.toThrow("scope_denied");
    expect((await state(other)).events).toHaveLength(1);
    expect((await state(other)).batches).toBe(1);
    await app.scoped(primary.scope, async (tx) => {
      expect(
        (
          await app.query(
            tx,
            "SELECT event_id FROM sentinel.telemetry_events WHERE project_id=$1",
            [other.scope.projectId],
          )
        ).rows,
      ).toHaveLength(0);
    });
  });
  it("waits for a concurrent legal hold and observes it before deleting", async () => {
    const id = randomUUID();
    await insertExpired(id);
    let pending: Promise<{ events: number; batches: number }> | undefined;
    const started = new Promise<number>((resolve) => {
      onBinding = resolve;
    });
    await app.scoped(primary.scope, async (tx) => {
      await app.query(
        tx,
        "UPDATE sentinel.project_bindings SET retention_hold=true WHERE mode=$1 AND workspace_id=$2 AND project_id=$3",
        args(),
      );
      pending = retainTelemetry(worker, primary.scope);
      await waitBlocked(await started);
    });
    expect(await pending!).toEqual({ events: 0, batches: 0 });
    expect((await state()).events).toContain(id);
    await app.scoped(primary.scope, (tx) =>
      app.query(
        tx,
        "UPDATE sentinel.project_bindings SET retention_hold=false WHERE mode=$1 AND workspace_id=$2 AND project_id=$3",
        args(),
      ),
    );
    expect(await retainTelemetry(worker, primary.scope)).toEqual({
      events: 1,
      batches: 0,
    });
  });
  it("waits for in-flight enqueue and preserves its newly committed evidence pin", async () => {
    const id = randomUUID();
    await insertExpired(id);
    let pending: Promise<{ events: number; batches: number }> | undefined;
    const started = new Promise<number>((resolve) => {
      onBinding = resolve;
    });
    await app.scoped(primary.scope, async (tx) => {
      await enqueue(tx, id);
      pending = retainTelemetry(worker, primary.scope);
      await waitBlocked(await started);
    });
    expect(await pending!).toEqual({ events: 0, batches: 0 });
    expect((await state()).events).toContain(id);
  });
  it("fresh-process restart is idempotent and cannot remove prior evidence", async () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "tests/sentinel/retention-probe.ts"],
      {
        env: {
          ...process.env,
          SENTINEL_RETENTION_SCOPE: JSON.stringify(primary.scope),
        },
        encoding: "utf8",
        timeout: 15000,
        windowsHide: true,
      },
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ events: 0, batches: 0 });
    expect(await retainTelemetry(worker, primary.scope)).toEqual({
      events: 0,
      batches: 0,
    });
    verifyPreserved(before, await evidenceSnapshot(pools[2]));
    expect((await state()).events).toHaveLength(4);
    expect((await state(other)).events).toHaveLength(1);
  });
});
