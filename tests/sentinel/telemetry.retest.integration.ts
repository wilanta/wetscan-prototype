import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { approvedDatabaseConfig } from "../../src/platform/config";
import { ApprovedPool, PlatformDatabase } from "../../src/platform/database";
import { migrationPlan } from "../../src/platform/migrations";
import { PostgresQueue } from "../../src/platform/queue";
import {
  TelemetryStore,
  retainTelemetry,
} from "../../src/features/sentinel/telemetry/store";
import type { SentinelProjectContext } from "../../src/features/sentinel/types";
import {
  evidenceSnapshot,
  verifyPreserved,
  populatedRollbackRefusal,
  type EvidenceSnapshot,
} from "./telemetry-retest-safety";

if (process.env.SENTINEL_TELEMETRY_RETEST_APPROVED !== "1")
  throw Error("Use the separate populated-database retest runner");
const prefix = `s02-retest-${randomUUID()}`;
const context = (workspace: string): SentinelProjectContext => ({
  scope: {
    mode: "live",
    workspaceId: `github-user-7:${workspace}`,
    projectId: "github-123",
  },
  actorId: "github-user-7",
  repositoryId: "123",
  canvasProjectRef: "github-user-7/github-123",
});
const primary = context(prefix),
  disposable = context(`${prefix}-disposable`);
const retained = context("s02-3244b383-f0c9-4ab9-800d-f811a47f5730");
const sourceConfig = {
  name: "Isolated pagination retest",
  environment: "local",
  origin: "controlled_test",
  rateLimit: 6000,
};
const batch = () => ({
  schemaVersion: 1,
  batchId: randomUUID(),
  sentAt: new Date().toISOString(),
  events: [
    {
      schemaVersion: 1,
      eventId: randomUUID(),
      projectId: primary.scope.projectId,
      kind: "auth.failed",
      occurredAt: new Date().toISOString(),
    },
  ],
});
const pools: ApprovedPool[] = [];
let app: PlatformDatabase,
  worker: PlatformDatabase,
  store: TelemetryStore,
  before: EvidenceSnapshot;
beforeAll(async () => {
  const plan = await migrationPlan();
  expect(plan.sha256).toBe(
    "9ceabe57b696fbe59bd51fb5939a197a378abed9c3084802850c4e9d632270f9",
  );
  for (const purpose of ["app", "worker", "migration"] as const)
    pools.push(
      new ApprovedPool(
        await approvedDatabaseConfig(
          process.env,
          purpose,
          "integration_test",
          plan.sha256,
        ),
      ),
    );
  await approvedDatabaseConfig(
    process.env,
    "migration",
    "migrate_down",
    plan.sha256,
  );
  for (const pool of pools) {
    const c = await pool.connect();
    try {
      expect(
        (
          await c.query(
            "SELECT current_setting('server_version_num')::int AS version",
          )
        ).rows[0].version,
      ).toBe(170012);
    } finally {
      c.release();
    }
  }
  before = await evidenceSnapshot(pools[2]);
  expect(before.ledger.map((r) => [r.version, r.checksum])).toEqual(
    plan.migrations.map((m) => [m.version, m.checksum]),
  );
  const approvedPreflight = JSON.parse(
    await readFile(".local/sentinel/s02-retest-preflight.json", "utf8"),
  );
  for (const [table, baseline] of Object.entries(approvedPreflight.tables) as [
    string,
    { rows: string[] },
  ][])
    expect(before.rows[table]).toEqual(baseline.rows);
  expect(before.structure).toEqual({
    catalog: approvedPreflight.catalog,
    policies: approvedPreflight.policies,
    roles: approvedPreflight.roles,
    grants: approvedPreflight.grants,
  });
  const c = await pools[2].connect();
  try {
    expect(
      (
        await c.query(
          "SELECT count(*)::int AS n FROM sentinel.project_bindings WHERE workspace_id IN ($1,$2)",
          [primary.scope.workspaceId, disposable.scope.workspaceId],
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    c.release();
  }
  await writeFile(
    ".local/sentinel/s02-retest-run-baseline.json",
    JSON.stringify({ prefix, before }, null, 2) + "\n",
    { flag: "wx" },
  );
  app = new PlatformDatabase(pools[0]);
  worker = new PlatformDatabase(pools[1], true);
  store = new TelemetryStore(app);
});
afterAll(async () => {
  vi.useRealTimers();
  try {
    if (before) {
      const after = await evidenceSnapshot(pools[2]);
      verifyPreserved(before, after);
      await writeFile(
        ".local/sentinel/s02-retest-run-after.json",
        JSON.stringify(
          {
            recordedAt: new Date().toISOString(),
            prefix,
            preserved: true,
            after,
          },
          null,
          2,
        ) + "\n",
        { flag: "wx" },
      );
      console.log(
        JSON.stringify({
          existingRowsUnchanged: true,
          ledgerAndPermissionsUnchanged: true,
          counts: after.counts,
        }),
      );
    }
  } finally {
    await Promise.all(pools.map((p) => p.end()));
  }
});
describe("nondestructive S02 PostgreSQL retest (no migration setup)", () => {
  it("15a: retained three-event evidence remains readable with the reproduced skew", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T20:03:32.500Z"));
    try {
      const q = new URLSearchParams({
        sourceId: "4240347f-4f2c-4d44-853a-65d1c07760b6",
        limit: "1",
      });
      const ids: string[] = [];
      let window;
      do {
        const page = await store.events(retained, q);
        if (window) expect(page.window).toEqual(window);
        else window = page.window;
        ids.push(...page.items.map((i) => i.event.eventId));
        if (!page.nextCursor) break;
        q.set("cursor", page.nextCursor);
      } while (ids.length < 4);
      expect(ids).toEqual([
        "a316090b-8e9d-4c3a-979f-42d768456237",
        "ac065d57-14a3-4461-b02b-e86b8ddc9521",
        "6ac0ed56-41f0-4340-b8f7-86e87b539555",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
  it("15b: immediate post-ingest traversal is complete despite host skew and a later insert", async () => {
    const source = await store.create(primary, sourceConfig),
      expected: string[] = [];
    for (let i = 0; i < 3; i++) {
      const b = batch();
      await store.ingest(source.credential, b);
      expected.push(b.events[0].eventId);
    }
    const q = new URLSearchParams({ sourceId: source.sourceId, limit: "1" });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() - 10000);
    let first;
    try {
      first = await store.events(primary, q);
    } finally {
      vi.useRealTimers();
    }
    expect(first.items).toHaveLength(1);
    const later = batch();
    await store.ingest(source.credential, later);
    const visited = first.items.map((i) => i.event.eventId);
    let cursor = first.nextCursor;
    while (cursor && visited.length < 5) {
      q.set("cursor", cursor);
      const page = await store.events(primary, q);
      expect(page.window).toEqual(first.window);
      visited.push(...page.items.map((i) => i.event.eventId));
      cursor = page.nextCursor;
    }
    expect(visited).toEqual(expected.reverse());
    expect(new Set(visited).size).toBe(3);
    expect(
      (
        await store.events(
          primary,
          new URLSearchParams({ sourceId: source.sourceId }),
        )
      ).items,
    ).toHaveLength(4);
  });
  it("15c: identical timestamps across sources use exact inclusive bounds and tuple tie-breakers", async () => {
    const sources = await Promise.all([
      store.create(primary, sourceConfig),
      store.create(primary, sourceConfig),
    ]);
    const timestamp = await app.scoped(
      primary.scope,
      async (tx) =>
        (
          await app.query(
            tx,
            `SELECT to_char((clock_timestamp()-interval '1 second') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`,
          )
        ).rows[0].at as string,
    );
    const records = [0, 1, 2].map((n) => ({
      source: sources[n % 2].sourceId,
      id: randomUUID(),
    }));
    await app.scoped(primary.scope, async (tx) => {
      for (const r of records)
        await app.query(
          tx,
          "INSERT INTO sentinel.telemetry_events(mode,workspace_id,project_id,source_id,event_id,kind,severity,occurred_at,ingested_at,fingerprint,event) VALUES('live',$1,$2,$3,$4,'auth.failed','info',$5,$5,$6,$7::jsonb)",
          [
            primary.scope.workspaceId,
            primary.scope.projectId,
            r.source,
            r.id,
            timestamp,
            "a".repeat(64),
            JSON.stringify({ eventId: r.id }),
          ],
        );
    });
    const q = new URLSearchParams({
        from: timestamp,
        to: timestamp,
        limit: "1",
      }),
      visited: string[] = [];
    do {
      const page = await store.events(primary, q);
      expect(page.window).toEqual({ from: timestamp, to: timestamp });
      visited.push(...page.items.map((i) => i.event.eventId));
      if (!page.nextCursor) break;
      q.set("cursor", page.nextCursor);
    } while (visited.length < 4);
    expect(visited).toEqual(
      records
        .sort((a, b) =>
          `${b.source}/${b.id}`.localeCompare(`${a.source}/${a.id}`),
        )
        .map((r) => r.id),
    );
    expect(visited).toHaveLength(3);
  });
  it("16: event persistence is observed by a separate process and fresh pool", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "tests/sentinel/telemetry-probe.ts"],
      {
        env: { ...process.env, SENTINEL_TEST_CONTEXT: JSON.stringify(primary) },
        encoding: "utf8",
        windowsHide: true,
        timeout: 15000,
      },
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).count).toBe(7);
  });
  // Establish refusal before attempting disposable retention, without ever permitting DROP/DELETE SQL.
  it("18: populated rollback guard refuses before any schema/data statement", async () => {
    const plan = await migrationPlan();
    const snapshot = await evidenceSnapshot(pools[2]);
    expect(await populatedRollbackRefusal(pools[2], plan.migrations)).toEqual({
      status: "target_denied",
      dataOrSchemaStatementsSent: 0,
      transaction: "ROLLED_BACK",
    });
    expect(await evidenceSnapshot(pools[2])).toEqual(snapshot);
  });
  it("17: retention touches only new disposable fixtures and preserves queued evidence", async () => {
    const source = await store.create(disposable, {
      ...sourceConfig,
      name: "Disposable retention fixtures",
    });
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    await app.scoped(disposable.scope, async (tx) => {
      for (const id of ids)
        await app.query(
          tx,
          "INSERT INTO sentinel.telemetry_events(mode,workspace_id,project_id,source_id,event_id,kind,severity,occurred_at,ingested_at,fingerprint,event) VALUES('live',$1,$2,$3,$4,'auth.failed','info',clock_timestamp()-interval '8 days',clock_timestamp()-interval '8 days',$5,$6::jsonb)",
          [
            disposable.scope.workspaceId,
            disposable.scope.projectId,
            source.sourceId,
            id,
            "b".repeat(64),
            JSON.stringify({ eventId: id }),
          ],
        );
      for (let i = 0; i < 2; i++)
        await app.query(
          tx,
          "INSERT INTO sentinel.telemetry_batches(mode,workspace_id,project_id,source_id,batch_id,fingerprint,receipt,recorded_at) VALUES('live',$1,$2,$3,$4,$5,'[]'::jsonb,clock_timestamp()-interval '2 days')",
          [
            disposable.scope.workspaceId,
            disposable.scope.projectId,
            source.sourceId,
            randomUUID(),
            "c".repeat(64),
          ],
        );
      await new PostgresQueue(app).enqueue(tx, {
        ...disposable.scope,
        schemaVersion: 1,
        module: "sentinel",
        jobId: randomUUID(),
        kind: "sentinel.telemetry.accepted",
        subjectRef: `${source.sourceId}/${ids[2]}`,
        idempotencyKey: `disposable:${prefix}`,
        revision: 1,
        attempts: 0,
        maxAttempts: 5,
        availableAt: new Date().toISOString(),
        cancelRequested: false,
      });
      await app.query(
        tx,
        "UPDATE sentinel.project_bindings SET retention_hold=true WHERE workspace_id=$1 AND project_id=$2",
        [disposable.scope.workspaceId, disposable.scope.projectId],
      );
    });
    expect(await retainTelemetry(worker, disposable.scope)).toEqual({
      events: 0,
      batches: 0,
    });
    await app.scoped(disposable.scope, (tx) =>
      app.query(
        tx,
        "UPDATE sentinel.project_bindings SET retention_hold=false WHERE workspace_id=$1 AND project_id=$2",
        [disposable.scope.workspaceId, disposable.scope.projectId],
      ),
    );
    expect(await retainTelemetry(worker, disposable.scope)).toEqual({
      events: 2,
      batches: 2,
    });
    await app.scoped(disposable.scope, async (tx) => {
      expect(
        (await app.query(tx, "SELECT event_id FROM sentinel.telemetry_events"))
          .rows,
      ).toEqual([{ event_id: ids[2] }]);
      expect(
        (
          await app.query(
            tx,
            "SELECT count(*)::int AS n FROM sentinel.telemetry_batches",
          )
        ).rows[0].n,
      ).toBe(0);
    });
    verifyPreserved(before, await evidenceSnapshot(pools[2]));
  });
});
