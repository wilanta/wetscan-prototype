import { randomUUID } from "node:crypto";
import pg from "pg";
import { PlatformDatabase } from "../../src/platform/database";
import { applyMigrations, migrationPlan } from "../../src/platform/migrations";
import { PostgresQueue } from "../../src/platform/queue";
import { DetectionStore } from "../../src/features/sentinel/detection/store";
import { TelemetryStore } from "../../src/features/sentinel/telemetry/store";
import { seedRules } from "../../src/features/sentinel/detection/seeds";
import { executeLease } from "../../worker/sentinel/executor";
import type { SentinelProjectContext } from "../../src/features/sentinel/types";

/**
 * Throwaway-database harness for S05 PostgreSQL acceptance. Targets ONLY a disposable server given by
 * SENTINEL_S05_PG_ADMIN_URL (loopback, local container). Creates one randomly named database and drops it.
 */
const pw = "s05_local_only_pw";
export function adminUrl() {
  const u = process.env.SENTINEL_S05_PG_ADMIN_URL ?? "";
  const url = u ? new URL(u) : undefined;
  if (!url || !["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error("s05_pg_target_denied");
  return url;
}
export interface Harness {
  dbName: string;
  /** `wetscan-s01:<uuid>` database comment: what approvedDatabaseConfig matches for process-level tests. */
  marker: string;
  admin: pg.Pool; // superuser on the throwaway DB (seeding/inspection only)
  app: PlatformDatabase;
  worker: PlatformDatabase;
  pools: pg.Pool[];
  context: SentinelProjectContext;
  incidentId: string;
  /** runSentinelWorker ends its pool on shutdown; recreate it for another run. */
  reopenWorker(): Promise<void>;
  close(): Promise<void>;
}
const pool = (url: URL, database: string, user: string, password: string) =>
  new pg.Pool({
    host: url.hostname,
    port: Number(url.port || 5432),
    database,
    user,
    password,
    max: 4,
  });

export async function setupHarness(opts?: {
  seedIncident?: boolean;
  /** Process-level tests need a name accepted by the approval gate, e.g. `wetscan_s01_test`. */
  dbPrefix?: string;
}): Promise<Harness> {
  const url = adminUrl();
  const root = pool(
    url,
    "postgres",
    decodeURIComponent(url.username),
    decodeURIComponent(url.password),
  );
  const dbName = `${opts?.dbPrefix ?? "s05"}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const marker = `wetscan-s01:${randomUUID()}`;
  for (const role of [
    "wetscan_migrator",
    "wetscan_app",
    "wetscan_sentinel_worker",
    "wetscan_sentinel_notifier",
  ]) {
    await root.query(
      `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${pw}'; END IF; END $$`,
    );
  }
  await root.query(`CREATE DATABASE ${dbName} OWNER wetscan_migrator`);
  await root.query(`COMMENT ON DATABASE ${dbName} IS '${marker}'`);
  await root.end();
  const admin = pool(
    url,
    dbName,
    decodeURIComponent(url.username),
    decodeURIComponent(url.password),
  );
  const migrator = pool(url, dbName, "wetscan_migrator", pw);
  const plan = await migrationPlan();
  await applyMigrations(migrator, plan.migrations, "up");
  await migrator.end();
  const appPool = pool(url, dbName, "wetscan_app", pw);
  const workerPool = pool(url, dbName, "wetscan_sentinel_worker", pw);
  const app = new PlatformDatabase(appPool, false);
  const worker = new PlatformDatabase(workerPool, true);
  const context: SentinelProjectContext = {
    scope: {
      mode: "live",
      workspaceId: "github-user-7:s05",
      projectId: "github-998736528",
    },
    actorId: "github-user-7",
    repositoryId: "998736528",
    canvasProjectRef: "github-user-7/github-998736528",
  };
  let incidentId = "";
  if (opts?.seedIncident !== false) {
    const telemetry = new TelemetryStore(app);
    const detection = new DetectionStore(app);
    const key = await telemetry.create(context, {
      name: "S05 fixture",
      environment: "local",
      origin: "controlled_test",
      retentionDays: 7,
      rateLimit: 1000,
    });
    const created = await detection.command(context, {
      action: "create",
      definition: {
        ...seedRules[3].definition,
        threshold: 1,
        windowSeconds: 3600,
        cooldownSeconds: 0,
      },
    });
    const ruleId = (created as { ruleId: string }).ruleId;
    await detection.command(context, {
      action: "enable",
      ruleId,
      expectedRevision: 1,
    });
    const now = new Date().toISOString();
    await telemetry.ingest(key.credential, {
      schemaVersion: 1,
      batchId: randomUUID(),
      sentAt: now,
      events: [
        {
          schemaVersion: 1,
          eventId: randomUUID(),
          projectId: context.scope.projectId,
          occurredAt: now,
          kind: "http.request",
          request: {
            method: "GET",
            routeTemplate: "/api/test",
            statusCode: 500,
          },
        },
      ],
    });
    const queue = new PostgresQueue(worker, context.scope, [
      "sentinel.telemetry.accepted",
    ]);
    const [lease] = await queue.claim({
      module: "sentinel",
      workerId: "s05-seed-worker",
      limit: 1,
      leaseMs: 30000,
    });
    const r = await executeLease(
      queue,
      lease,
      async (_j, sig, cur) => {
        await new DetectionStore(worker).process(cur(), sig, {
          correlateIncidents: true,
        });
      },
      {
        heartbeatMs: 5000,
        timeoutMs: 15000,
        signal: new AbortController().signal,
      },
    );
    if (r !== "completed") throw new Error("seed_failed");
    const row = await admin.query(
      "SELECT incident_id FROM sentinel.incidents LIMIT 1",
    );
    incidentId = row.rows[0].incident_id;
  }
  const hn: Harness = {
    dbName,
    marker,
    admin,
    app,
    worker,
    pools: [appPool, workerPool],
    context,
    incidentId,
    async reopenWorker() {
      hn.pools[1] = pool(url, dbName, "wetscan_sentinel_worker", pw);
      hn.worker = new PlatformDatabase(hn.pools[1], true);
    },
    async close() {
      await Promise.all(hn.pools.map((p) => p.end().catch(() => undefined)));
      await admin.end();
      const r2 = pool(
        url,
        "postgres",
        decodeURIComponent(url.username),
        decodeURIComponent(url.password),
      );
      await r2.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await r2.end();
    },
  };
  return hn;
}
/** Superuser provisioning of an owner-approved fixture target (the migrator role does this in real use). */
export async function provisionTarget(
  h: Harness,
  o: {
    origin: string;
    approvers: string[];
    selfApproval?: boolean;
    enabled?: boolean;
    maxTtl?: number;
  },
) {
  const targetId = randomUUID();
  const s = h.context.scope;
  await h.admin.query(
    `INSERT INTO sentinel.response_targets(mode,workspace_id,project_id,target_id,kind,origin,max_ttl_seconds,approver_actor_ids,allow_self_approval,h03_proof_id,enabled)
     VALUES($1,$2,$3,$4,'local_fixture',$5,$6,$7,$8,'h03-s05-test',$9)`,
    [
      s.mode,
      s.workspaceId,
      s.projectId,
      targetId,
      o.origin,
      o.maxTtl ?? 600,
      o.approvers,
      o.selfApproval ?? false,
      o.enabled ?? true,
    ],
  );
  return targetId;
}
