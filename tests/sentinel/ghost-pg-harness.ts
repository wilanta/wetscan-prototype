import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import pg from "pg";
import { PlatformDatabase } from "../../src/platform/database";
import { applyMigrations, migrationPlan } from "../../src/platform/migrations";
import { TelemetryStore } from "../../src/features/sentinel/telemetry/store";
import { TelemetryError } from "../../src/features/sentinel/telemetry/validation";
import { DetectionStore } from "../../src/features/sentinel/detection/store";
import { GhostStore } from "../../src/features/sentinel/ghost/store";
import type { SentinelProjectContext } from "../../src/features/sentinel/types";

const pw = "s05_local_only_pw";

export function ghostAdminUrl() {
  const u =
    process.env.SENTINEL_S07_PG_ADMIN_URL ??
    process.env.SENTINEL_S05_PG_ADMIN_URL ??
    "";
  const url = u ? new URL(u) : undefined;
  if (!url || !["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error("s07_pg_target_denied");
  return url;
}

const makePool = (url: URL, database: string, user: string, password: string) =>
  new pg.Pool({
    host: url.hostname,
    port: Number(url.port || 5432),
    database,
    user,
    password,
    max: 4,
  });

export interface GhostHarness {
  dbName: string;
  marker: string;
  admin: pg.Pool;
  app: PlatformDatabase;
  worker: PlatformDatabase;
  migrator: pg.Pool;
  pools: pg.Pool[];
  contextA: SentinelProjectContext;
  contextB: SentinelProjectContext;
  telemetry: TelemetryStore;
  detection: DetectionStore;
  ghost: GhostStore;
  ingestUrl: string;
  reopenWorker(): Promise<void>;
  close(): Promise<void>;
}

export async function setupGhostHarness(): Promise<GhostHarness> {
  const url = ghostAdminUrl();
  const root = makePool(
    url,
    "postgres",
    decodeURIComponent(url.username),
    decodeURIComponent(url.password),
  );
  const dbName = `s07_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
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

  const admin = makePool(
    url,
    dbName,
    decodeURIComponent(url.username),
    decodeURIComponent(url.password),
  );
  const migrator = makePool(url, dbName, "wetscan_migrator", pw);
  const plan = await migrationPlan();
  await applyMigrations(migrator, plan.migrations, "up");

  const appPool = makePool(url, dbName, "wetscan_app", pw);
  const workerPool = makePool(url, dbName, "wetscan_sentinel_worker", pw);
  const app = new PlatformDatabase(appPool, false);
  const worker = new PlatformDatabase(workerPool, true);
  const telemetry = new TelemetryStore(app);
  const detection = new DetectionStore(app);
  const ghost = new GhostStore(app);

  // Real loopback S02 ingest receiver backed by TelemetryStore(app)
  const ingestServer: Server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method !== "POST" || u.pathname !== "/api/sentinel/ingest") {
      res.writeHead(404);
      res.end();
      return;
    }
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_credential" }));
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const receipt = await telemetry.ingest(auth.slice(7), body);
        res.writeHead(receipt.duplicate ? 200 : 202, {
          "content-type": "application/json",
        });
        res.end(JSON.stringify(receipt));
      } catch (err) {
        const status = err instanceof TelemetryError ? err.status : 500;
        const code = err instanceof TelemetryError ? err.code : "ingest_error";
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: code }));
      }
    });
  });
  await new Promise<void>((ok, bad) => {
    ingestServer.once("error", bad);
    ingestServer.listen(0, "127.0.0.1", ok);
  });
  const ingestPort = (ingestServer.address() as { port: number }).port;

  const contextA: SentinelProjectContext = {
    scope: {
      mode: "live",
      workspaceId: "github-user-7:s07",
      projectId: "github-998736528",
    },
    actorId: "github-user-7",
    repositoryId: "998736528",
    canvasProjectRef: "github-user-7/github-998736528",
  };
  const contextB: SentinelProjectContext = {
    scope: {
      mode: "live",
      workspaceId: "github-user-99:other",
      projectId: "github-777777",
    },
    actorId: "github-user-99",
    repositoryId: "777777",
    canvasProjectRef: "github-user-99/github-777777",
  };

  const hn: GhostHarness = {
    dbName,
    marker,
    admin,
    app,
    worker,
    migrator,
    pools: [appPool, workerPool, migrator],
    contextA,
    contextB,
    telemetry,
    detection,
    ghost,
    ingestUrl: `http://127.0.0.1:${ingestPort}/api/sentinel/ingest`,
    async reopenWorker() {
      hn.pools[1] = makePool(url, dbName, "wetscan_sentinel_worker", pw);
      hn.worker = new PlatformDatabase(hn.pools[1], true);
    },
    async close() {
      await new Promise<void>((ok) => ingestServer.close(() => ok()));
      await Promise.all(hn.pools.map((p) => p.end().catch(() => undefined)));
      await admin.end();
      const root2 = makePool(
        url,
        "postgres",
        decodeURIComponent(url.username),
        decodeURIComponent(url.password),
      );
      await root2.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await root2.end();
    },
  };
  return hn;
}
