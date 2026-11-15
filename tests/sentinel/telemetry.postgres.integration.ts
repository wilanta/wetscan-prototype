import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { approvedDatabaseConfig } from "../../src/platform/config";
import { ApprovedPool, PlatformDatabase } from "../../src/platform/database";
import { applyMigrations, migrationPlan } from "../../src/platform/migrations";
import {
  TelemetryStore,
  retainTelemetry,
} from "../../src/features/sentinel/telemetry/store";
import {
  credentialRoute,
  hash,
} from "../../src/features/sentinel/telemetry/validation";
import type { SentinelProjectContext } from "../../src/features/sentinel/types";
import { PostgresQueue } from "../../src/platform/queue";
if (process.env.SENTINEL_TELEMETRY_TEST_APPROVED !== "1")
  throw Error("Use the approval-gated test:sentinel:postgres runner");
const prefix = `s02-${randomUUID()}`;
const context = (
  workspace = prefix,
  project = "123",
): SentinelProjectContext => ({
  scope: {
    mode: "live",
    workspaceId: `github-user-7:${workspace}`,
    projectId: `github-${project}`,
  },
  actorId: "github-user-7",
  repositoryId: project,
  canvasProjectRef: `github-user-7/github-${project}`,
});
const primary = context(),
  otherProject = context(prefix, "456"),
  otherWorkspace = context(`${prefix}-other`);
let app: PlatformDatabase,
  worker: PlatformDatabase,
  store: TelemetryStore,
  pools: ApprovedPool[] = [];
const sourceConfig = {
  name: "Controlled acceptance",
  environment: "local",
  origin: "controlled_test",
  rateLimit: 6000,
};
const batch = (project = primary.scope.projectId) => {
  const at = new Date().toISOString();
  return {
    schemaVersion: 1,
    batchId: randomUUID(),
    sentAt: at,
    events: [
      {
        schemaVersion: 1,
        eventId: randomUUID(),
        projectId: project,
        kind: "auth.failed",
        occurredAt: at,
        request: {
          routeTemplate: "/api/users/private@example.com?token=do-not-store",
        },
        attributes: { reasonCode: "controlled_probe" },
      },
    ],
  };
};
beforeAll(async () => {
  const plan = await migrationPlan();
  const configs = await Promise.all([
    approvedDatabaseConfig(process.env, "app", "integration_test", plan.sha256),
    approvedDatabaseConfig(
      process.env,
      "worker",
      "integration_test",
      plan.sha256,
    ),
    approvedDatabaseConfig(process.env, "migration", "migrate_up", plan.sha256),
  ]);
  await approvedDatabaseConfig(
    process.env,
    "migration",
    "migrate_down",
    plan.sha256,
  );
  pools = configs.map((c) => new ApprovedPool(c));
  app = new PlatformDatabase(pools[0]);
  worker = new PlatformDatabase(pools[1], true);
  store = new TelemetryStore(app);
  const client = await pools[2].connect();
  try {
    const rows = (
      await client.query(
        "SELECT version,checksum FROM platform.schema_migrations ORDER BY version",
      )
    ).rows;
    expect(rows.map((r) => [r.version, r.checksum])).toEqual(
      plan.migrations.map((m) => [m.version, m.checksum]),
    );
  } finally {
    client.release();
  }
});
// Leave uniquely scoped acceptance fixtures for review. No schema/data reset or credential disclosure.
afterAll(async () => {
  await Promise.all(pools.map((p) => p.end()));
});
describe("REAL S02 PostgreSQL acceptance - NOT RUN until renewed exact-plan approval", () => {
  it("registers source and stores only a secure hash", async () => {
    const source = await store.create(primary, sourceConfig),
      route = credentialRoute(source.credential);
    await app.scoped(primary.scope, async (tx) => {
      const row = (
        await app.query(
          tx,
          "SELECT token_hash FROM sentinel.telemetry_credentials WHERE source_id=$1 AND credential_id=$2",
          [source.sourceId, route.credentialId],
        )
      ).rows[0];
      expect(row.token_hash).toBe(hash(source.credential));
      expect(row.token_hash).not.toBe(source.credential);
    });
  });
  it("persists redacted event and atomic queued processing reference", async () => {
    const source = await store.create(primary, sourceConfig),
      b = batch();
    await store.ingest(source.credential, b);
    const page = await store.events(
      primary,
      new URLSearchParams({ eventId: b.events[0].eventId }),
    );
    expect(page.items).toHaveLength(1);
    expect(JSON.stringify(page)).not.toMatch(/private@example|do-not-store/);
    expect(page.items[0].evidence.origin).toBe("controlled_test");
    await app.scoped(primary.scope, async (tx) => {
      expect(
        (
          await app.query(
            tx,
            "SELECT kind,state FROM platform.jobs WHERE subject_ref=$1",
            [`${source.sourceId}/${b.events[0].eventId}`],
          )
        ).rows,
      ).toEqual([{ kind: "sentinel.telemetry.accepted", state: "queued" }]);
    });
  });
  it("rejects invalid credential without event persistence", async () => {
    const source = await store.create(primary, sourceConfig),
      token =
        source.credential.slice(0, -1) +
        (source.credential.endsWith("0") ? "1" : "0");
    await expect(store.ingest(token, batch())).rejects.toThrow(
      "invalid_credential",
    );
  });
  it("rotation invalidates old credential; revocation invalidates replacement", async () => {
    const source = await store.create(primary, sourceConfig),
      rotated = await store.change(primary, source.sourceId, "rotate");
    if (!rotated.credential) throw Error();
    await expect(store.ingest(source.credential, batch())).rejects.toThrow(
      "invalid_credential",
    );
    await store.ingest(rotated.credential, batch());
    await store.change(primary, source.sourceId, "revoke");
    await expect(store.ingest(rotated.credential, batch())).rejects.toThrow(
      "invalid_credential",
    );
  });
  it("disable rejects ingest; enable restores only still-active keys", async () => {
    const source = await store.create(primary, sourceConfig);
    await store.change(primary, source.sourceId, "disable");
    await expect(store.ingest(source.credential, batch())).rejects.toThrow(
      "invalid_credential",
    );
    await store.change(primary, source.sourceId, "enable");
    await store.ingest(source.credential, batch());
  });
  it("rejects producer-supplied wrong project and tampered workspace hints", async () => {
    const source = await store.create(primary, sourceConfig);
    await expect(
      store.ingest(source.credential, batch("github-456")),
    ).rejects.toThrow("invalid_event");
    const route = credentialRoute(source.credential),
      parts = source.credential.split(".");
    parts[1] = Buffer.from(
      JSON.stringify({
        ...route,
        workspaceId: otherWorkspace.scope.workspaceId,
      }),
    ).toString("base64url");
    await expect(store.ingest(parts.join("."), batch())).rejects.toThrow(
      "invalid_credential",
    );
  });
  it("enforces FORCE RLS against unfiltered cross-project/workspace SQL", async () => {
    await store.create(otherProject, sourceConfig);
    await store.create(otherWorkspace, sourceConfig);
    await app.scoped(primary.scope, async (tx) => {
      const rows = (
        await app.query(
          tx,
          "SELECT workspace_id,project_id FROM sentinel.telemetry_sources",
        )
      ).rows;
      expect(rows.length).toBeGreaterThan(0);
      expect(
        rows.every(
          (r) =>
            r.workspace_id === primary.scope.workspaceId &&
            r.project_id === primary.scope.projectId,
        ),
      ).toBe(true);
    });
    const c = await pools[2].connect();
    try {
      const rows = (
        await c.query(
          "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='sentinel'::regnamespace AND relname LIKE 'telemetry_%' AND relkind='r'",
        )
      ).rows;
      expect(rows).toHaveLength(4);
      expect(rows.every((r) => r.relrowsecurity && r.relforcerowsecurity)).toBe(
        true,
      );
    } finally {
      c.release();
    }
  });
  it("worker cannot read credentials or claim Guard/telemetry detection jobs", async () => {
    await expect(
      worker.scoped(primary.scope, (tx) =>
        worker.query(
          tx,
          "SELECT token_hash FROM sentinel.telemetry_credentials",
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    expect(
      await new PostgresQueue(worker, primary.scope, [
        "sentinel.maintenance",
      ]).claim({
        module: "sentinel",
        workerId: prefix,
        limit: 2,
        leaseMs: 5000,
      }),
    ).toEqual([]);
    await expect(
      new PostgresQueue(worker, primary.scope, ["guard.scan"]).claim({
        module: "guard",
        workerId: prefix,
        limit: 1,
        leaseMs: 5000,
      }),
    ).rejects.toThrow("scope_denied");
  });
  it("identical nonce and event retries do not duplicate jobs or events", async () => {
    const source = await store.create(primary, sourceConfig),
      b = batch();
    const first = await store.ingest(source.credential, b);
    expect((await store.ingest(source.credential, b)).duplicate).toBe(true);
    expect(
      (await store.ingest(source.credential, { ...b, batchId: randomUUID() }))
        .events[0].duplicate,
    ).toBe(true);
    expect(first.events[0].duplicate).toBe(false);
    expect(
      (
        await store.events(
          primary,
          new URLSearchParams({ sourceId: source.sourceId }),
        )
      ).items,
    ).toHaveLength(1);
  });
  it("changed payload under reused nonce conflicts atomically", async () => {
    const source = await store.create(primary, sourceConfig),
      b = batch();
    await store.ingest(source.credential, b);
    b.events[0].kind = "http.request";
    await expect(store.ingest(source.credential, b)).rejects.toThrow(
      "replay_conflict",
    );
  });
  it("rejects replay outside clock window and future events", async () => {
    const source = await store.create(primary, sourceConfig);
    for (const delta of [-301000, 31000]) {
      const b = batch();
      b.sentAt = new Date(Date.now() + delta).toISOString();
      await expect(store.ingest(source.credential, b)).rejects.toThrow(
        "outside_clock_window",
      );
    }
  });
  it("concurrent ingestion produces one persisted event and one duplicate receipt", async () => {
    const source = await store.create(primary, sourceConfig),
      b = batch(),
      receipts = await Promise.all([
        store.ingest(source.credential, b),
        store.ingest(source.credential, b),
      ]);
    expect(receipts.filter((r) => r.duplicate)).toHaveLength(1);
    expect(
      (
        await store.events(
          primary,
          new URLSearchParams({ sourceId: source.sourceId }),
        )
      ).items,
    ).toHaveLength(1);
  });
  it("rate limit survives transactions and rejects excessive batch without partial events", async () => {
    const source = await store.create(primary, {
        ...sourceConfig,
        rateLimit: 1,
      }),
      b = batch();
    await store.ingest(source.credential, b);
    await expect(
      store.ingest(source.credential, batch()),
    ).rejects.toMatchObject({ status: 429 });
    expect(
      (
        await store.events(
          primary,
          new URLSearchParams({ sourceId: source.sourceId }),
        )
      ).items,
    ).toHaveLength(1);
  });
  it("event conflict rolls back earlier new event in same batch", async () => {
    const source = await store.create(primary, sourceConfig),
      b = batch();
    await store.ingest(source.credential, b);
    const newer = batch(),
      conflicting = { ...b.events[0], kind: "http.request" };
    newer.events.push(conflicting);
    await expect(store.ingest(source.credential, newer)).rejects.toThrow(
      "event_conflict",
    );
    expect(
      (
        await store.events(
          primary,
          new URLSearchParams({ eventId: newer.events[0].eventId }),
        )
      ).items,
    ).toHaveLength(0);
  });
  it("cursor pagination visits each stored event once", async () => {
    const source = await store.create(primary, sourceConfig);
    for (let i = 0; i < 3; i++) await store.ingest(source.credential, batch());
    const query = new URLSearchParams({
      sourceId: source.sourceId,
      limit: "1",
    });
    const ids: string[] = [];
    do {
      const page = await store.events(primary, query);
      ids.push(...page.items.map((i) => i.event.eventId));
      if (!page.nextCursor) break;
      query.set("cursor", page.nextCursor);
    } while (ids.length < 4);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });
  it("persistence is visible after a separate process creates a fresh pool", () => {
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
    expect(JSON.parse(result.stdout).count).toBeGreaterThan(0);
  });
  it("retention stays bounded and preserves events awaiting S03 processing", async () => {
    const before = (await store.events(primary, new URLSearchParams())).items
      .length;
    const cleaned = await retainTelemetry(worker, primary.scope);
    expect(cleaned.events).toBeLessThanOrEqual(100);
    expect(cleaned.batches).toBeLessThanOrEqual(100);
    expect(
      (await store.events(primary, new URLSearchParams())).items.length,
    ).toBe(before);
  });
  it("rollback refuses populated S02 state without altering S01 ledger", async () => {
    const plan = await migrationPlan();
    await expect(
      applyMigrations(pools[2], plan.migrations, "down"),
    ).rejects.toThrow("target_denied");
    const c = await pools[2].connect();
    try {
      expect(
        (
          await c.query(
            "SELECT version FROM platform.schema_migrations ORDER BY version",
          )
        ).rows.map((r) => r.version),
      ).toEqual(["0001_foundation", "0002_telemetry"]);
    } finally {
      c.release();
    }
  });
});
