import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import pg from "pg";
import { migrationPlan } from "../../../src/platform/migrations";
import {
  GUARD_PLATFORM_BASELINE,
  guardMigrationPlan,
} from "../../../src/features/guard/live/migrations";
import {
  applyG04Schema,
  g04MigrationPlan,
} from "../../../src/features/guard/g04/migrations";
import {
  applyG05Schema,
  g05MigrationPlan,
} from "../../../src/features/guard/g05/migrations";
import {
  applyG06Schema,
  g06MigrationPlan,
} from "../../../src/features/guard/g06/migrations";
import {
  closeG06HostForTests,
} from "../../../src/features/guard/g06/runtime";

const exec = promisify(execFile);

export interface G06PgTestEnv {
  env: Record<string, string>;
  guardPool: pg.Pool;
  guardAppPool: pg.Pool;
  guardWorkerPool: pg.Pool;
  guardMigratorPool: pg.Pool;
  sentinelAdminPool: pg.Pool;
  sentinelAppPool: pg.Pool;
  sentinelWorkerPool: pg.Pool;
  guardDatabase: string;
  sentinelDatabase: string;
  guardMarker: string;
  sentinelMarker: string;
  cleanup(): Promise<void>;
}

function defaultPointerPath() {
  return process.platform === "win32"
    ? join(process.env.LOCALAPPDATA || tmpdir(), "WetScanGuardG06", "g06-local-pg.pointer.json")
    : join(process.env.XDG_STATE_HOME || "/tmp", "wetscan-guard-g06", "g06-local-pg.pointer.json");
}

async function lockWinDir(dir: string) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (process.platform === "win32") {
    const user = process.env.USERNAME || process.env.USER;
    if (user) {
      await exec("icacls", [
        dir,
        "/inheritance:r",
        "/grant:r",
        `${user}:(OI)(CI)F`,
        "SYSTEM:(OI)(CI)F",
      ]);
    }
  }
}

export async function createG06PgTestEnv(): Promise<G06PgTestEnv> {
  const adminUrl =
    process.env.GUARD_G06_PG_ADMIN_URL ||
    process.env.GUARD_G05_PG_ADMIN_URL ||
    process.env.TEST_PG_ADMIN_URL;

  if (adminUrl) {
    return createFromAdminUrl(new URL(adminUrl));
  }

  // Fallback to local provisioned G06 PG 17 container on 55437: reuse its cluster role passwords so we never clobber them.
  const pointerRaw = await readFile(defaultPointerPath(), "utf8");
  const ptr = JSON.parse(pointerRaw) as {
    root: string;
    port: number;
    target: { host: string; port: number; database: string; marker: string };
  };
  const [bootstrapPw, appPw, workerPw, migratorPw, sentAppPw, sentWorkerPw, sentNotifierPw, sentMigratorPw] =
    await Promise.all([
      readFile(join(ptr.root, "bootstrap.password"), "utf8").then((s) => s.trim()),
      readFile(join(ptr.root, "app.password"), "utf8").then((s) => s.trim()),
      readFile(join(ptr.root, "worker.password"), "utf8").then((s) => s.trim()),
      readFile(join(ptr.root, "migration.password"), "utf8").then((s) => s.trim()),
      readFile(join(ptr.root, "sentinel-app.password"), "utf8").then((s) => s.trim()),
      readFile(join(ptr.root, "sentinel-worker.password"), "utf8").then((s) => s.trim()),
      readFile(join(ptr.root, "sentinel-migration.password"), "utf8").then((s) => s.trim()),
      readFile(join(ptr.root, "sentinel-migration.password"), "utf8").then((s) => s.trim()),
    ]);
  const url = new URL(
    `postgres://postgres:${encodeURIComponent(bootstrapPw)}@${ptr.target.host}:${ptr.port}/postgres`,
  );
  return createFromAdminUrl(url, {
    app: appPw,
    worker: workerPw,
    migrator: migratorPw,
    sentApp: sentAppPw,
    sentWorker: sentWorkerPw,
    sentNotifier: sentNotifierPw,
    sentMigrator: sentMigratorPw,
  });
}

async function createFromAdminUrl(
  url: URL,
  existingPasswords?: {
    app: string;
    worker: string;
    migrator: string;
    sentApp: string;
    sentWorker: string;
    sentNotifier: string;
    sentMigrator: string;
  },
): Promise<G06PgTestEnv> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  const host = url.hostname;
  const port = Number(url.port || "5432");
  const superPool = new pg.Pool({
    host,
    port,
    database: url.pathname.replace(/^\//, "") || "postgres",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    max: 2,
  });

  const guardDb = `wetscan_s01_test_guardg06`;
  const sentinelDb = `wetscan_s01_test_sentinelg06`;
  const guardMarker = `wetscan-s01:${id}`;
  const sentinelId = randomUUID();
  const sentinelMarker = `wetscan-s01:${sentinelId}`;

  const scratchBase =
    process.platform === "win32"
      ? join(process.env.LOCALAPPDATA || tmpdir(), "WetScanGuardG06", `it-${tag}`)
      : join(tmpdir(), `wetscan-g06-it-${tag}`);
  await lockWinDir(scratchBase);

  const g02Plan = await guardMigrationPlan();
  const g04Plan = await g04MigrationPlan();
  const g05Plan = await g05MigrationPlan();
  const g06Plan = await g06MigrationPlan();
  const sentPlan = await migrationPlan();

  const pw = {
    app: existingPasswords?.app ?? randomBytes(24).toString("hex"),
    worker: existingPasswords?.worker ?? randomBytes(24).toString("hex"),
    migrator: existingPasswords?.migrator ?? randomBytes(24).toString("hex"),
    sentApp: existingPasswords?.sentApp ?? randomBytes(24).toString("hex"),
    sentWorker: existingPasswords?.sentWorker ?? randomBytes(24).toString("hex"),
    sentNotifier: existingPasswords?.sentNotifier ?? randomBytes(24).toString("hex"),
    sentMigrator: existingPasswords?.sentMigrator ?? randomBytes(24).toString("hex"),
    vault: randomBytes(32).toString("base64"),
  };

  if (!existingPasswords) {
    // Only create/alter cluster roles on dedicated ephemeral CI servers
    for (const [role, secret] of [
      ["wetscan_guard_app", pw.app],
      ["wetscan_guard_worker", pw.worker],
      ["wetscan_guard_migrator", pw.migrator],
      ["wetscan_app", pw.sentApp],
      ["wetscan_sentinel_worker", pw.sentWorker],
      ["wetscan_sentinel_notifier", pw.sentNotifier],
      ["wetscan_migrator", pw.sentMigrator],
    ]) {
      await superPool.query(
        `DO $$ BEGIN
           IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN
             CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${secret}';
           ELSE
             ALTER ROLE ${role} WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${secret}';
           END IF;
         END $$`,
      );
    }
  }

  for (const db of [guardDb, sentinelDb]) {
    await superPool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()`,
      [db],
    );
    await superPool.query(`DROP DATABASE IF EXISTS ${db}`);
  }

  await superPool.query(
    `CREATE DATABASE ${guardDb} OWNER wetscan_guard_migrator`,
  );
  await superPool.query(`COMMENT ON DATABASE ${guardDb} IS '${guardMarker}'`);
  await superPool.query(`REVOKE ALL ON DATABASE ${guardDb} FROM PUBLIC`);
  await superPool.query(
    `GRANT CONNECT ON DATABASE ${guardDb} TO wetscan_guard_app,wetscan_guard_worker,wetscan_guard_migrator`,
  );

  await superPool.query(
    `CREATE DATABASE ${sentinelDb} OWNER wetscan_migrator`,
  );
  await superPool.query(
    `COMMENT ON DATABASE ${sentinelDb} IS '${sentinelMarker}'`,
  );
  await superPool.query(`REVOKE ALL ON DATABASE ${sentinelDb} FROM PUBLIC`);
  await superPool.query(
    `GRANT CONNECT ON DATABASE ${sentinelDb} TO wetscan_app,wetscan_sentinel_worker,wetscan_migrator`,
  );

  const guardAdminPool = new pg.Pool({
    host,
    port,
    database: guardDb,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    max: 3,
  });

  // Apply platform baseline + G01 + platform-access
  {
    const c = await guardAdminPool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL ROLE wetscan_guard_migrator");
      await c.query(
        "CREATE SCHEMA platform; CREATE TABLE platform.schema_migrations(version text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp()); REVOKE ALL ON SCHEMA platform FROM PUBLIC",
      );
      for (const m of (await migrationPlan(GUARD_PLATFORM_BASELINE)).migrations) {
        await c.query(m.up);
        await c.query(
          "INSERT INTO platform.schema_migrations(version,checksum) VALUES($1,$2)",
          [m.version, m.checksum],
        );
      }
      await c.query(g02Plan.migration.up);
      await c.query(
        "INSERT INTO guard.schema_migrations(version,checksum) VALUES($1,$2)",
        [g02Plan.migration.version, g02Plan.migration.checksum],
      );
      await c.query("RESET ROLE");
      await c.query(
        g02Plan.artifacts.find((a) => a.name === "platform-access.proposed.sql")!.sql,
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }

  const guardMigratorPool = new pg.Pool({
    host,
    port,
    database: guardDb,
    user: "wetscan_guard_migrator",
    password: pw.migrator,
    max: 2,
  });
  await applyG04Schema(guardMigratorPool, g04Plan, guardMarker, guardDb);
  await applyG05Schema(guardMigratorPool, g05Plan, guardMarker, guardDb);
  await applyG06Schema(guardMigratorPool, g06Plan, "up", {
    marker: guardMarker,
    database: guardDb,
  });

  const guardAppPool = new pg.Pool({
    host,
    port,
    database: guardDb,
    user: "wetscan_guard_app",
    password: pw.app,
    max: 3,
  });
  const guardWorkerPool = new pg.Pool({
    host,
    port,
    database: guardDb,
    user: "wetscan_guard_worker",
    password: pw.worker,
    max: 3,
  });

  // Apply Sentinel 0001..0009 into companion Sentinel DB
  const sentinelAdminPool = new pg.Pool({
    host,
    port,
    database: sentinelDb,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    max: 3,
  });
  const sentinelAppPool = new pg.Pool({
    host,
    port,
    database: sentinelDb,
    user: "wetscan_app",
    password: pw.sentApp,
    max: 3,
  });
  const sentinelWorkerPool = new pg.Pool({
    host,
    port,
    database: sentinelDb,
    user: "wetscan_sentinel_worker",
    password: pw.sentWorker,
    max: 3,
  });
  {
    const sc = await sentinelAdminPool.connect();
    try {
      await sc.query("BEGIN");
      await sc.query("SET LOCAL ROLE wetscan_migrator");
      await sc.query(
        "CREATE SCHEMA IF NOT EXISTS platform; CREATE TABLE IF NOT EXISTS platform.schema_migrations(version text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())",
      );
      for (const m of sentPlan.migrations) {
        await sc.query(m.up);
        await sc.query(
          "INSERT INTO platform.schema_migrations(version,checksum) VALUES($1,$2) ON CONFLICT (version) DO NOTHING",
          [m.version, m.checksum],
        );
      }
      await sc.query("RESET ROLE");
      await sc.query("COMMIT");
    } catch (e) {
      await sc.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      sc.release();
    }
  }

  const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
  const approvedAt = new Date().toISOString();
  const guardTarget = { host, port, database: guardDb, marker: guardMarker };
  const sentTarget = { host, port, database: sentinelDb, marker: sentinelMarker };

  const files: Record<string, string> = {
    "app.password": pw.app,
    "worker.password": pw.worker,
    "migration.password": pw.migrator,
    "sentinel-app.password": pw.sentApp,
    "vault.key": pw.vault,
    "app.database.json": JSON.stringify({
      schemaVersion: 1,
      status: "APPROVED",
      module: "guard",
      purpose: "app",
      actions: ["runtime"],
      role: "wetscan_guard_app",
      migrationPlanSha256: g02Plan.sha256,
      target: guardTarget,
      approvedAt,
      expiresAt,
      approvedBy: "g06-pg-test",
    }),
    "worker.database.json": JSON.stringify({
      schemaVersion: 1,
      status: "APPROVED",
      module: "guard",
      purpose: "worker",
      actions: ["runtime"],
      role: "wetscan_guard_worker",
      migrationPlanSha256: g02Plan.sha256,
      target: guardTarget,
      approvedAt,
      expiresAt,
      approvedBy: "g06-pg-test",
    }),
    "sentinel-app.database.json": JSON.stringify({
      schemaVersion: 1,
      status: "APPROVED",
      purpose: "app",
      actions: ["runtime"],
      role: "wetscan_app",
      migrationPlanSha256: sentPlan.sha256,
      target: sentTarget,
      approvedAt,
      expiresAt,
      approvedBy: "g06-pg-test",
    }),
  };

  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(scratchBase, name), content, { mode: 0o600 });
  }

  const env: Record<string, string> = {
    GUARD_G06_ENABLED: "1",
    GUARD_G05_ENABLED: "1",
    GUARD_DB_APP_APPROVAL_FILE: join(scratchBase, "app.database.json"),
    GUARD_DB_APP_PASSWORD_FILE: join(scratchBase, "app.password"),
    GUARD_DB_WORKER_APPROVAL_FILE: join(scratchBase, "worker.database.json"),
    GUARD_DB_WORKER_PASSWORD_FILE: join(scratchBase, "worker.password"),
    GUARD_G05_VAULT_KEY_FILE: join(scratchBase, "vault.key"),
    SENTINEL_DB_HOST: host,
    SENTINEL_DB_PORT: String(port),
    SENTINEL_DB_NAME: sentinelDb,
    SENTINEL_DB_MARKER: sentinelMarker,
    SENTINEL_DB_APPROVAL_FILE: join(scratchBase, "sentinel-app.database.json"),
    SENTINEL_DB_APP_PASSWORD_FILE: join(scratchBase, "sentinel-app.password"),
  };

  // The disposable CI fixture deliberately terminates remaining sessions before
  // dropping its two ephemeral databases. An idle pg.Pool client emits an 'error'
  // event when PostgreSQL sends 57P01; without a pool listener, Node reports an
  // uncaught exception even though all test assertions passed. Limit this handler
  // to *this fixture* and only to administrator termination during cleanup.
  let cleaningUp = false;
  const disposablePools = [
    guardAdminPool, guardAppPool, guardWorkerPool, guardMigratorPool,
    sentinelAdminPool, sentinelAppPool, sentinelWorkerPool,
  ];
  for (const pool of disposablePools) {
    pool.on("error", (error: Error & { code?: string }) => {
      if (cleaningUp && error.code === "57P01") return;
      // Unexpected connection failures must continue to fail the test suite.
      throw error;
    });
  }

  return {
    env,
    guardPool: guardAdminPool,
    guardAppPool,
    guardWorkerPool,
    guardMigratorPool,
    sentinelAdminPool,
    sentinelAppPool,
    sentinelWorkerPool,
    guardDatabase: guardDb,
    sentinelDatabase: sentinelDb,
    guardMarker,
    sentinelMarker,
    async cleanup() {
      cleaningUp = true;
      await closeG06HostForTests();
      await Promise.allSettled([
        guardAppPool.end(),
        guardWorkerPool.end(),
        guardMigratorPool.end(),
        guardAdminPool.end(),
        sentinelAppPool.end(),
        sentinelWorkerPool.end(),
        sentinelAdminPool.end(),
      ]);
      for (const db of [guardDb, sentinelDb]) {
        await superPool
          .query(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()",
            [db],
          )
          .catch(() => undefined);
        await superPool.query(`DROP DATABASE IF EXISTS ${db}`).catch(() => undefined);
      }
      await superPool.end();
      await rm(scratchBase, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}
