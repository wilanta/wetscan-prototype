import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { PlatformDatabase } from "../../src/platform/database";
import { applyMigrations, migrationPlan } from "../../src/platform/migrations";
import { TelemetryStore } from "../../src/features/sentinel/telemetry/store";
import { DetectionStore } from "../../src/features/sentinel/detection/store";
import { IntelligenceStore } from "../../src/features/sentinel/intelligence/store";
import type {
  SentinelEventV1,
  SentinelProjectContext,
} from "../../src/features/sentinel/types";

const pw = "s05_local_only_pw";

export function intelAdminUrl() {
  const u =
    process.env.SENTINEL_S08_PG_ADMIN_URL ??
    process.env.SENTINEL_S07_PG_ADMIN_URL ??
    process.env.SENTINEL_S05_PG_ADMIN_URL ??
    "";
  const url = u ? new URL(u) : undefined;
  // Disposable local container only; never a remote or persistent dev database.
  if (!url || !["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error("s08_pg_target_denied");
  return url;
}

const makePool = (url: URL, database: string, user: string, password: string) =>
  new pg.Pool({
    host: url.hostname,
    port: Number(url.port || 5432),
    database,
    user,
    password,
    max: 6,
  });

export const ctx = (
  n: number,
  ws = `github-user-${n}:s08`,
  repo = String(900000 + n),
): SentinelProjectContext => ({
  scope: { mode: "live", workspaceId: ws, projectId: `github-${repo}` },
  actorId: `github-user-${n}`,
  repositoryId: repo,
  canvasProjectRef: `github-user-${n}/github-${repo}`,
});

export interface SeedEvent {
  kind?: SentinelEventV1["kind"];
  request?: SentinelEventV1["request"];
  attributes?: SentinelEventV1["attributes"];
  actorHash?: string;
  occurredAt?: string;
}
export interface SeedIncident {
  sourceId: string;
  ruleId: string;
  category?: "authentication" | "http" | "decoy";
  severity?: "low" | "medium" | "high";
  origin?: "runtime" | "controlled_test";
  status?: "open" | "investigating" | "closed";
  closedDaysAgo?: number;
  firstAt?: string;
  events?: SeedEvent[];
}

export interface IntelHarness {
  dbName: string;
  admin: pg.Pool;
  appPool: pg.Pool;
  app: PlatformDatabase;
  worker: PlatformDatabase;
  migrator: pg.Pool;
  pools: pg.Pool[];
  telemetry: TelemetryStore;
  detection: DetectionStore;
  intel: IntelligenceStore;
  source(
    c: SentinelProjectContext,
    origin?: "runtime" | "controlled_test",
  ): Promise<string>;
  rule(
    c: SentinelProjectContext,
    kind?: SentinelEventV1["kind"],
  ): Promise<{ ruleId: string }>;
  incident(
    c: SentinelProjectContext,
    i: SeedIncident,
  ): Promise<{ incidentId: string; eventIds: string[] }>;
  close(): Promise<void>;
}

export async function setupIntelHarness(): Promise<IntelHarness> {
  const url = intelAdminUrl();
  const adminUser = decodeURIComponent(url.username);
  const adminPw = decodeURIComponent(url.password);
  const root = makePool(url, "postgres", adminUser, adminPw);
  const dbName = `s08_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  for (const role of [
    "wetscan_migrator",
    "wetscan_app",
    "wetscan_sentinel_worker",
    "wetscan_sentinel_notifier",
  ])
    await root.query(
      `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${pw}'; END IF; END $$`,
    );
  await root.query(`CREATE DATABASE ${dbName} OWNER wetscan_migrator`);
  await root.query(
    `COMMENT ON DATABASE ${dbName} IS 'wetscan-s01:${randomUUID()}'`,
  );
  await root.end();

  const admin = makePool(url, dbName, adminUser, adminPw);
  const migrator = makePool(url, dbName, "wetscan_migrator", pw);
  await applyMigrations(migrator, (await migrationPlan()).migrations, "up");
  const appPool = makePool(url, dbName, "wetscan_app", pw);
  const workerPool = makePool(url, dbName, "wetscan_sentinel_worker", pw);
  const app = new PlatformDatabase(appPool, false);
  const worker = new PlatformDatabase(workerPool, true);
  const telemetry = new TelemetryStore(app);
  const detection = new DetectionStore(app);
  const intel = new IntelligenceStore(app);
  const s = (c: SentinelProjectContext) => [
    c.scope.mode,
    c.scope.workspaceId,
    c.scope.projectId,
  ];

  const h: IntelHarness = {
    dbName,
    admin,
    appPool,
    app,
    worker,
    migrator,
    pools: [appPool, workerPool, migrator],
    telemetry,
    detection,
    intel,
    async source(c, origin = "runtime") {
      const created = await telemetry.create(c, {
        name: `s08 ${origin}`,
        environment: "local",
        origin,
        retentionDays: 7,
        rateLimit: 1000,
      });
      return created.sourceId;
    },
    async rule(c, kind = "http.suspicious_path") {
      const r = await detection.command(c, {
        action: "create",
        definition: {
          schemaVersion: 1,
          name: `Seed rule ${randomBytes(3).toString("hex")}`,
          description: "S08 fixture rule",
          category: kind === "ghost.decoy_triggered" ? "decoy" : "http",
          severity: "medium",
          confidence: 60,
          eventKinds: [kind],
          conditions: [],
          correlation: "source",
          windowSeconds: 60,
          threshold: 1,
          cooldownSeconds: 60,
          suppressionWindows: [],
        },
      });
      return { ruleId: (r as { ruleId: string }).ruleId };
    },
    async incident(c, i) {
      const incidentId = randomUUID();
      const alertId = randomUUID();
      const hex = () => randomBytes(32).toString("hex");
      const first = new Date(i.firstAt ?? "2026-11-10T00:00:00.000Z");
      const events = i.events ?? [{}];
      const eventIds: string[] = [];
      const category = i.category ?? "http";
      for (const [n, e] of events.entries()) {
        const eventId = randomUUID();
        eventIds.push(eventId);
        const at = new Date(first.getTime() + n * 1000).toISOString();
        const kind =
          e.kind ??
          (category === "decoy"
            ? "ghost.decoy_triggered"
            : "http.suspicious_path");
        await admin.query(
          `INSERT INTO sentinel.telemetry_events(mode,workspace_id,project_id,source_id,event_id,kind,severity,occurred_at,fingerprint,event) VALUES($1,$2,$3,$4,$5,$6,'low',$7,$8,$9::jsonb)`,
          [
            ...s(c),
            i.sourceId,
            eventId,
            kind,
            e.occurredAt ?? at,
            hex(),
            JSON.stringify({
              schemaVersion: 1,
              eventId,
              projectId: c.scope.projectId,
              occurredAt: e.occurredAt ?? at,
              kind,
              actorHash: e.actorHash,
              request: e.request ?? {
                method: "GET",
                routeTemplate: "/admin",
                statusCode: 404,
              },
              attributes: e.attributes ?? { reasonCode: "suspicious_path" },
            }),
          ],
        );
      }
      const last = new Date(first.getTime() + (events.length - 1) * 1000);
      await admin.query(
        `INSERT INTO sentinel.detection_alerts(mode,workspace_id,project_id,alert_id,rule_id,rule_version,source_id,schema_version,category,severity,confidence,origin,correlation_key,window_start,window_end,first_observed_at,last_observed_at,matched_event_count,deduplication_key) VALUES($1,$2,$3,$4,$5,1,$6,1,$7,$8,60,$9,$10,$11,$12,$11,$13,$14,$15)`,
        [
          ...s(c),
          alertId,
          i.ruleId,
          i.sourceId,
          category,
          i.severity ?? "medium",
          i.origin ?? "runtime",
          hex(),
          first.toISOString(),
          new Date(last.getTime() + 60000).toISOString(),
          last.toISOString(),
          events.length,
          hex(),
        ],
      );
      const status = i.status ?? "open";
      const closedAt = new Date(
        Date.now() - (i.closedDaysAgo ?? 0) * 86400000,
      ).toISOString();
      await admin.query(
        `INSERT INTO sentinel.incidents(mode,workspace_id,project_id,incident_id,source_id,primary_alert_id,rule_id,rule_version,schema_version,title,summary,category,severity,status,origin,correlation_key,deduplication_key,first_observed_at,last_observed_at,closed_at,closed_by,close_reason,last_actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,1,1,$8,'Fixture incident summary',$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'system')`,
        [
          ...s(c),
          incidentId,
          i.sourceId,
          alertId,
          i.ruleId,
          `Fixture incident ${incidentId.slice(0, 8)}`,
          category,
          i.severity ?? "medium",
          status,
          i.origin ?? "runtime",
          hex(),
          hex(),
          first.toISOString(),
          last.toISOString(),
          status === "closed" ? closedAt : null,
          status === "closed" ? c.actorId : null,
          status === "closed" ? "fixture close" : null,
        ],
      );
      await admin.query(
        `INSERT INTO sentinel.incident_alerts(mode,workspace_id,project_id,incident_id,alert_id,source_id) VALUES($1,$2,$3,$4,$5,$6)`,
        [...s(c), incidentId, alertId, i.sourceId],
      );
      for (const eventId of eventIds)
        await admin.query(
          `INSERT INTO sentinel.incident_evidence(mode,workspace_id,project_id,incident_id,source_id,event_id) VALUES($1,$2,$3,$4,$5,$6)`,
          [...s(c), incidentId, i.sourceId, eventId],
        );
      return { incidentId, eventIds };
    },
    async close() {
      await Promise.all(h.pools.map((p) => p.end().catch(() => undefined)));
      await admin.end();
      const root2 = makePool(url, "postgres", adminUser, adminPw);
      await root2.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await root2.end();
    },
  };
  return h;
}
