import { randomUUID } from "node:crypto";
import pg from "pg";
import { PlatformDatabase } from "../../src/platform/database";
import { applyMigrations, migrationPlan } from "../../src/platform/migrations";
import { TelemetryStore } from "../../src/features/sentinel/telemetry/store";
import { CatalogStore } from "../../src/features/sentinel/external/catalog-store";
import { ExternalService } from "../../src/features/sentinel/external/service";
import type { SentinelProjectContext } from "../../src/features/sentinel/types";

const pw = "s05_local_only_pw";
export function externalAdminUrl() {
  const u =
    process.env.SENTINEL_S09_PG_ADMIN_URL ??
    process.env.SENTINEL_S08_PG_ADMIN_URL ??
    process.env.SENTINEL_S05_PG_ADMIN_URL ??
    "";
  const url = u ? new URL(u) : undefined;
  // Disposable local container only; never a remote or persistent dev database.
  if (!url || !["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error("s09_pg_target_denied");
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
  ws = `github-user-${n}:s09`,
  repo = String(910000 + n),
): SentinelProjectContext => ({
  scope: { mode: "live", workspaceId: ws, projectId: `github-${repo}` },
  actorId: `github-user-${n}`,
  repositoryId: repo,
  canvasProjectRef: `github-user-${n}/github-${repo}`,
});

export async function setupExternalHarness(opts: { migrate?: boolean } = {}) {
  const url = externalAdminUrl();
  const adminUser = decodeURIComponent(url.username);
  const adminPw = decodeURIComponent(url.password);
  const root = makePool(url, "postgres", adminUser, adminPw);
  const dbName = `s09_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
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
  const plan = await migrationPlan();
  if (opts.migrate !== false)
    await applyMigrations(migrator, plan.migrations, "up");
  const appPool = makePool(url, dbName, "wetscan_app", pw);
  const workerPool = makePool(url, dbName, "wetscan_sentinel_worker", pw);
  const app = new PlatformDatabase(appPool, false);
  const worker = new PlatformDatabase(workerPool, true);
  const telemetry = new TelemetryStore(app);
  const pools = [appPool, workerPool, migrator];
  return {
    dbName,
    plan,
    admin,
    migrator,
    appPool,
    workerPool,
    app,
    worker,
    catalog: new CatalogStore(worker),
    appCatalog: new CatalogStore(app),
    service: new ExternalService(app),
    /** Registers the Sentinel project binding (same path S02 uses), required before any project-private write. */
    async bind(c: SentinelProjectContext) {
      await telemetry.create(c, {
        name: "s09 fixture",
        environment: "local",
        origin: "runtime",
        retentionDays: 7,
        rateLimit: 1000,
      });
    },
    async close() {
      await Promise.all(pools.map((p) => p.end().catch(() => undefined)));
      await admin.end();
      const r = makePool(url, "postgres", adminUser, adminPw);
      await r.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await r.end();
    },
  };
}
export type ExternalHarness = Awaited<ReturnType<typeof setupExternalHarness>>;
