import { execFile } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import pg from "pg";
import { parseApproval } from "../src/platform/config";
import { migrationPlan } from "../src/platform/migrations";
import { validateGuardApproval } from "../src/features/guard/live/database-config";
import {
  GUARD_PLATFORM_BASELINE,
  guardMigrationPlan,
} from "../src/features/guard/live/migrations";
import { assertPrivateRuntimeRoot } from "../src/features/guard/live/product-preflight";
import { applyG04Schema, g04MigrationPlan } from "../src/features/guard/g04/migrations";
import { applyG05Schema, g05MigrationPlan } from "../src/features/guard/g05/migrations";
import { applyG06Schema, g06MigrationPlan } from "../src/features/guard/g06/migrations";

const exec = promisify(execFile);

export const G06_LOCAL_DATABASE = "wetscan_dev_guardg06";
export const G06_SENTINEL_DATABASE = "wetscan_dev_sentinelg06";
export const G06_CONTAINER = "wetscan-g06-local-pg";
export const G06_VOLUME = "wetscan_guard_g06_pgdata";
export const PG_IMAGE = "postgres:17.12-bookworm";
export const RESERVED_PORTS = new Set([5432, 55432, 55434, 55435, 55436, 4115]);

const roleOf = {
  app: "wetscan_guard_app",
  worker: "wetscan_guard_worker",
  migration: "wetscan_guard_migrator",
} as const;

type LocalPurpose = keyof typeof roleOf;

const secretHex = (bytes = 24) => randomBytes(bytes).toString("hex");

function baseDir() {
  return process.platform === "win32"
    ? join(process.env.LOCALAPPDATA || tmpdir(), "WetScanGuardG06")
    : join(process.env.XDG_STATE_HOME || "/tmp", "wetscan-guard-g06");
}

function pointerFile() {
  return join(baseDir(), "g06-local-pg.pointer.json");
}

async function lockDir(dir: string) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (process.platform === "win32") {
    const user = process.env.USERNAME || process.env.USER;
    if (!user) throw new Error("WINDOWS_USERNAME_REQUIRED");
    await exec("icacls", [
      dir,
      "/inheritance:r",
      "/grant:r",
      `${user}:(OI)(CI)F`,
      "SYSTEM:(OI)(CI)F",
    ]);
  }
}

async function docker(args: string[]) {
  const { stdout } = await exec("docker", args, { maxBuffer: 1024 * 1024 * 8 });
  return stdout.trim();
}

function guardApproval(
  purpose: LocalPurpose,
  target: { host: string; port: number; database: string; marker: string },
  planSha256: string,
  expiresAt: string,
) {
  return {
    schemaVersion: 1,
    status: "APPROVED",
    module: "guard",
    purpose,
    actions: [purpose === "migration" ? "migrate_up" : "runtime"],
    role: roleOf[purpose],
    migrationPlanSha256: planSha256,
    target,
    approvedAt: new Date().toISOString(),
    expiresAt,
    approvedBy: "g06-local-env",
    reason: "Isolated Guard G06 local development & verification",
  };
}

function sentinelApproval(
  purpose: "app" | "worker" | "migration",
  target: { host: string; port: number; database: string; marker: string },
  planSha256: string,
  expiresAt: string,
) {
  const roles = {
    app: "wetscan_app",
    worker: "wetscan_sentinel_worker",
    migration: "wetscan_migrator",
  } as const;
  return {
    schemaVersion: 1,
    status: "APPROVED",
    purpose,
    actions: [purpose === "migration" ? "migrate_up" : "runtime"],
    role: roles[purpose],
    migrationPlanSha256: planSha256,
    target,
    approvedAt: new Date().toISOString(),
    expiresAt,
    approvedBy: "g06-local-env",
    reason: "Isolated G06 Sentinel S09 consumer verification",
  };
}

async function waitReady(pool: pg.Pool, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const c = await pool.connect();
      try {
        await c.query("SELECT 1");
        return;
      } finally {
        c.release();
      }
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error("PG_READY_TIMEOUT");
}

async function read(root: string, file: string) {
  return (await readFile(join(root, file), "utf8")).trim();
}

async function pointer(): Promise<{
  root: string;
  target: { host: string; port: number; database: string; marker: string };
  sentinelTarget?: { host: string; port: number; database: string; marker: string };
  port: number;
}> {
  return JSON.parse(await readFile(pointerFile(), "utf8"));
}

export async function provisionG06(port = 55437) {
  if (!Number.isInteger(port) || port < 1024 || RESERVED_PORTS.has(port)) {
    throw new Error(`RESERVED_OR_INVALID_PORT:${port}`);
  }
  const existingContainers = await docker([
    "ps",
    "-a",
    "--filter",
    `name=^${G06_CONTAINER}$`,
    "--format",
    "{{.Names}}",
  ]);
  if (existingContainers.split(/\r?\n/).includes(G06_CONTAINER)) {
    throw new Error(`CONTAINER_ALREADY_EXISTS:${G06_CONTAINER}`);
  }

  const id = randomUUID();
  const root = join(baseDir(), id);
  await lockDir(baseDir());
  await lockDir(root);
  await lockDir(join(root, "evidence"));

  const g02Plan = await guardMigrationPlan();
  const g04Plan = await g04MigrationPlan();
  const g05Plan = await g05MigrationPlan();
  const g06Plan = await g06MigrationPlan();
  const sentinelPlan = await migrationPlan();

  const target = {
    host: "127.0.0.1",
    port,
    database: G06_LOCAL_DATABASE,
    marker: `wetscan-s01:${id}`,
  };
  const sentinelTarget = {
    host: "127.0.0.1",
    port,
    database: G06_SENTINEL_DATABASE,
    marker: `wetscan-s01:${id}`,
  };

  const pw = {
    bootstrap: secretHex(),
    app: secretHex(),
    worker: secretHex(),
    migration: secretHex(),
    sentinelApp: secretHex(),
    sentinelWorker: secretHex(),
    sentinelMigration: secretHex(),
    sentinelNotifier: secretHex(),
    vault: randomBytes(32).toString("base64"),
  };

  const files: Record<string, string> = {
    "bootstrap.password": pw.bootstrap,
    "app.password": pw.app,
    "worker.password": pw.worker,
    "migration.password": pw.migration,
    "sentinel-app.password": pw.sentinelApp,
    "sentinel-worker.password": pw.sentinelWorker,
    "sentinel-migration.password": pw.sentinelMigration,
    "vault.key": pw.vault,
  };
  for (const [name, value] of Object.entries(files)) {
    await writeFile(join(root, name), value, { flag: "wx", mode: 0o600 });
  }

  const expiresAt = new Date(Date.now() + 14 * 86400000).toISOString();
  for (const purpose of ["app", "worker", "migration"] as const) {
    await writeFile(
      join(root, `${purpose}.database.json`),
      JSON.stringify(
        guardApproval(purpose, target, g02Plan.sha256, expiresAt),
        null,
        2,
      ) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    await writeFile(
      join(root, `sentinel-${purpose}.database.json`),
      JSON.stringify(
        sentinelApproval(purpose, sentinelTarget, sentinelPlan.sha256, expiresAt),
        null,
        2,
      ) + "\n",
      { flag: "wx", mode: 0o600 },
    );
  }

  await docker([
    "volume",
    "create",
    "--label",
    "wetscan.env=g06-local",
    "--label",
    "wetscan.env.id=" + id,
    G06_VOLUME,
  ]);
  await docker([
    "create",
    "--name",
    G06_CONTAINER,
    "--label",
    "wetscan.env=g06-local",
    "--label",
    "wetscan.env.id=" + id,
    "--read-only",
    "--cap-drop",
    "ALL",
    "--user",
    "postgres",
    "--security-opt",
    "no-new-privileges",
    "--cpus",
    "2",
    "--memory",
    "1g",
    "--pids-limit",
    "256",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=64m",
    "--tmpfs",
    "/var/run/postgresql:rw,noexec,nosuid,size=8m",
    "--mount",
    `type=volume,source=${G06_VOLUME},target=/var/lib/postgresql/data`,
    "--mount",
    `type=bind,source=${join(root, "bootstrap.password")},target=/run/bootstrap.password,readonly`,
    "--publish",
    `127.0.0.1:${port}:${port}`,
    "--env",
    "POSTGRES_PASSWORD_FILE=/run/bootstrap.password",
    "--env",
    "POSTGRES_DB=" + G06_LOCAL_DATABASE,
    "--env",
    "PGPORT=" + port,
    "--env",
    "PGDATA=/var/lib/postgresql/data",
    PG_IMAGE,
  ]);
  await docker(["start", G06_CONTAINER]);
  await writeFile(
    pointerFile(),
    JSON.stringify({ root, target, sentinelTarget, port }, null, 2),
    { flag: "w", mode: 0o600 },
  );

  const admin = new pg.Pool({
    host: "127.0.0.1",
    port,
    database: G06_LOCAL_DATABASE,
    user: "postgres",
    password: pw.bootstrap,
    max: 1,
  });

  try {
    await waitReady(admin);
    const c = await admin.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        `CREATE ROLE wetscan_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${pw.sentinelApp}'`,
      );
      await c.query(
        `CREATE ROLE wetscan_sentinel_worker LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${pw.sentinelWorker}'`,
      );
      await c.query(
        `CREATE ROLE wetscan_sentinel_notifier LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${pw.sentinelNotifier}'`,
      );
      await c.query(
        `CREATE ROLE wetscan_migrator LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${pw.sentinelMigration}'`,
      );
      for (const purpose of ["app", "worker", "migration"] as const) {
        await c.query(
          `CREATE ROLE ${roleOf[purpose]} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${pw[purpose]}'`,
        );
      }
      await c.query(`ALTER DATABASE ${G06_LOCAL_DATABASE} OWNER TO wetscan_guard_migrator`);
      await c.query(`COMMENT ON DATABASE ${G06_LOCAL_DATABASE} IS '${target.marker}'`);
      await c.query(`REVOKE ALL ON DATABASE ${G06_LOCAL_DATABASE} FROM PUBLIC`);
      await c.query(
        `GRANT CONNECT ON DATABASE ${G06_LOCAL_DATABASE} TO wetscan_guard_app,wetscan_guard_worker,wetscan_guard_migrator`,
      );
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

      // Provision companion isolated Sentinel S09 DB for real cross-module consumer verification
      await c.query(
        `CREATE DATABASE ${G06_SENTINEL_DATABASE} OWNER wetscan_migrator`,
      );
      await c.query(
        `COMMENT ON DATABASE ${G06_SENTINEL_DATABASE} IS '${sentinelTarget.marker}'`,
      );
      await c.query(`REVOKE ALL ON DATABASE ${G06_SENTINEL_DATABASE} FROM PUBLIC`);
      await c.query(
        `GRANT CONNECT ON DATABASE ${G06_SENTINEL_DATABASE} TO wetscan_app,wetscan_sentinel_worker,wetscan_migrator`,
      );
    } catch (e) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }

    const migPool = new pg.Pool({
      host: target.host,
      port: target.port,
      database: target.database,
      user: roleOf.migration,
      password: pw.migration,
      max: 1,
    });
    try {
      await applyG04Schema(migPool, g04Plan, target.marker, target.database);
      await applyG05Schema(migPool, g05Plan, target.marker, target.database);
      await applyG06Schema(migPool, g06Plan, "up", {
        marker: target.marker,
        database: target.database,
      });
    } finally {
      await migPool.end();
    }

    const sMigPool = new pg.Pool({
      host: sentinelTarget.host,
      port: sentinelTarget.port,
      database: sentinelTarget.database,
      user: "postgres",
      password: pw.bootstrap,
      max: 1,
    });
    try {
      const sc = await sMigPool.connect();
      try {
        await sc.query("BEGIN");
        await sc.query("SET LOCAL ROLE wetscan_migrator");
        await sc.query(
          "CREATE SCHEMA IF NOT EXISTS platform; CREATE TABLE IF NOT EXISTS platform.schema_migrations(version text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())",
        );
        for (const m of sentinelPlan.migrations) {
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
    } finally {
      await sMigPool.end();
    }
  } finally {
    await admin.end();
  }

  return {
    container: G06_CONTAINER,
    volume: G06_VOLUME,
    id,
    root,
    target,
    sentinelTarget,
    g06Checksum: g06Plan.sha256,
    expiresAt,
  };
}

export async function verifyG06() {
  const p = await pointer();
  const g02Plan = await guardMigrationPlan();
  const g06Plan = await g06MigrationPlan();
  await assertPrivateRuntimeRoot(p.root);
  for (const purpose of ["app", "worker", "migration"] as const) {
    const a = validateGuardApproval(
      JSON.parse(await read(p.root, `${purpose}.database.json`)),
      purpose,
      g02Plan.sha256,
    );
    parseApproval(
      a,
      p.target,
      purpose === "migration" ? "migrate_up" : "runtime",
      g02Plan.sha256,
    );
  }
  const admin = new pg.Pool({
    host: p.target.host,
    port: p.target.port,
    database: p.target.database,
    user: "postgres",
    password: await read(p.root, "bootstrap.password"),
    max: 1,
  });
  const c = await admin.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const r = (
      await c.query(`SELECT current_database() d, inet_server_port() p,
        (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) owner,
        (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()) marker,
        (SELECT jsonb_agg(version||':'||checksum ORDER BY version) FROM guard.g06_schema_migrations) g06,
        (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='guard' AND c.relname LIKE 'g06_%' AND c.relname<>'g06_schema_migrations' AND c.relrowsecurity AND c.relforcerowsecurity)::int g06_forced_rls,
        (SELECT count(*) FROM pg_roles WHERE rolname IN ('wetscan_guard_app','wetscan_guard_worker','wetscan_guard_migrator') AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole)::int least_priv_roles,
        has_table_privilege('wetscan_guard_app','guard.g06_outbox','DELETE') app_delete,
        has_table_privilege('wetscan_guard_worker','guard.g06_outbox','DELETE') worker_delete,
        has_function_privilege('wetscan_guard_app','guard.g06_pending_deliveries(integer)','EXECUTE') app_pending_fn,
        has_function_privilege('wetscan_guard_worker','guard.g06_pending_deliveries(integer)','EXECUTE') worker_pending_fn,
        has_database_privilege('public',current_database(),'CONNECT') public_connect`)
    ).rows[0];
    await c.query("ROLLBACK");
    const ok =
      r.d === G06_LOCAL_DATABASE &&
      r.p === p.port &&
      r.owner === "wetscan_guard_migrator" &&
      r.marker === p.target.marker &&
      r.g06?.length === 1 &&
      r.g06[0] === `${g06Plan.version}:${g06Plan.sha256}` &&
      r.g06_forced_rls === 6 &&
      r.least_priv_roles === 3 &&
      r.app_delete === false &&
      r.worker_delete === false &&
      r.app_pending_fn === false &&
      r.worker_pending_fn === true &&
      r.public_connect === false;
    return {
      verified: ok,
      database: r.d,
      port: r.p,
      owner: r.owner,
      g06ForcedRlsTables: r.g06_forced_rls,
      leastPrivilegeRoles: r.least_priv_roles,
      appCanDelete: r.app_delete,
      workerCanDelete: r.worker_delete,
      appPendingFn: r.app_pending_fn,
      workerPendingFn: r.worker_pending_fn,
      publicConnect: r.public_connect,
    };
  } finally {
    c.release();
    await admin.end();
  }
}

export async function teardownG06() {
  await exec("docker", ["rm", "-f", G06_CONTAINER]).catch(() => undefined);
  await exec("docker", ["volume", "rm", "-f", G06_VOLUME]).catch(() => undefined);
  const p = await pointer().catch(() => null);
  if (p?.root) await rm(p.root, { recursive: true, force: true }).catch(() => undefined);
  await rm(pointerFile(), { force: true }).catch(() => undefined);
  return { tornDown: true };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  let out: unknown;
  if (cmd === "provision") {
    const i = rest.indexOf("--port");
    out = await provisionG06(i >= 0 ? Number(rest[i + 1]) : 55437);
  } else if (cmd === "verify") {
    out = await verifyG06();
  } else if (cmd === "start" || cmd === "stop") {
    await docker([cmd, G06_CONTAINER]);
    out = { container: G06_CONTAINER, action: cmd };
  } else if (cmd === "teardown") {
    out = await teardownG06();
  } else if (cmd === "env") {
    const p = await pointer();
    const lines = [
      ["GUARD_DB_APP_APPROVAL_FILE", join(p.root, "app.database.json")],
      ["GUARD_DB_APP_PASSWORD_FILE", join(p.root, "app.password")],
      ["GUARD_DB_WORKER_APPROVAL_FILE", join(p.root, "worker.database.json")],
      ["GUARD_DB_WORKER_PASSWORD_FILE", join(p.root, "worker.password")],
      ["GUARD_DB_MIGRATION_APPROVAL_FILE", join(p.root, "migration.database.json")],
      ["GUARD_DB_MIGRATION_PASSWORD_FILE", join(p.root, "migration.password")],
      ["GUARD_G05_VAULT_KEY_FILE", join(p.root, "vault.key")],
      ["SENTINEL_DB_HOST", p.sentinelTarget?.host ?? "127.0.0.1"],
      ["SENTINEL_DB_PORT", String(p.port)],
      ["SENTINEL_DB_NAME", G06_SENTINEL_DATABASE],
      ["SENTINEL_DB_MARKER", p.sentinelTarget?.marker ?? ""],
      ["SENTINEL_DB_APPROVAL_FILE", join(p.root, "sentinel-app.database.json")],
      ["SENTINEL_DB_APP_PASSWORD_FILE", join(p.root, "sentinel-app.password")],
    ];
    for (const [k, v] of lines) {
      console.log(`${k}=${resolve(v).replaceAll("\\", "/")}`);
    }
    return;
  } else {
    throw new Error(
      `USAGE:${createHash("sha256").update(cmd || "").digest("hex").slice(0, 8)}`,
    );
  }
  console.log(JSON.stringify(out));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
