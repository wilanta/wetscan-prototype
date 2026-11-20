/**
 * Dedicated, isolated Guard G05 local PostgreSQL 18 environment (loopback 127.0.0.1:55436).
 * Preserves G02 (55434), G04 (55435), and Sentinel (5432 / 55432) untouched.
 *
 *   node --conditions=react-server --import tsx scripts/guard-g05-local-env.ts provision [--port 55436]
 *   node --conditions=react-server --import tsx scripts/guard-g05-local-env.ts verify|start|stop|status|env
 */
import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import pg from "pg";
import type { Target } from "../src/platform/config";
import { parseApproval } from "../src/platform/config";
import { migrationPlan } from "../src/platform/migrations";
import {
  GUARD_PLATFORM_BASELINE,
  guardMigrationPlan,
} from "../src/features/guard/live/migrations";
import { validateGuardApproval } from "../src/features/guard/live/database-config";
import { assertPrivateRuntimeRoot } from "../src/features/guard/live/product-preflight";
import { applyG05Schema, g05MigrationPlan } from "../src/features/guard/g05/migrations";
import {
  HISTORICAL_MARKER,
  PG_IMAGE,
  localApproval,
  type LocalPurpose,
} from "./guard-g02-local-env";

const run = promisify(execFile);
export const G05_LOCAL_DATABASE = "wetscan_dev_guardg05";
export const G05_CONTAINER = "wetscan-g05-local-pg";
export const G05_VOLUME = "wetscan-g05-local-pg-data";
const RESERVED_PORTS = [5432, 55432, 55434, 55435];
const markerPattern =
  /^wetscan-s01:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

const roleOf = {
  app: "wetscan_guard_app",
  worker: "wetscan_guard_worker",
  migration: "wetscan_guard_migrator",
} as const;

export function g05LocalTarget(port: number, marker: string): Target {
  if (
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    RESERVED_PORTS.includes(port) ||
    !markerPattern.test(marker) ||
    marker === HISTORICAL_MARKER
  )
    throw Error("G05_LOCAL_TARGET_INVALID");
  return { host: "127.0.0.1", port, database: G05_LOCAL_DATABASE, marker };
}

const win = process.platform === "win32";
const sys = () => {
  const s = process.env.SystemRoot;
  if (!s) throw Error("WINDOWS_METADATA_UNAVAILABLE");
  return s;
};
async function docker(args: string[]) {
  return (
    await run("docker", args, {
      windowsHide: true,
      maxBuffer: 1 << 24,
      timeout: 300000,
    })
  ).stdout.trim();
}
async function dockerOrNull(args: string[]) {
  try {
    return await docker(args);
  } catch {
    return null;
  }
}
async function freePort(port: number) {
  await new Promise<void>((ok, no) => {
    const s = createServer();
    s.once("error", no);
    s.listen(port, "127.0.0.1", () => s.close(() => ok()));
  });
}

const parentDir = () =>
  join(
    process.env.LOCALAPPDATA ?? join(process.env.HOME ?? ".", ".local/share"),
    "WetScanGuardG05",
  );
const pointerFile = () => join(parentDir(), "current.json");

async function securePrivateRoot(root: string) {
  await mkdir(parentDir(), { recursive: true });
  await mkdir(root, { mode: 0o700 });
  if ((await readdir(root)).length) throw Error("NEW_EMPTY_ROOT_REQUIRED");
  if (win) {
    const o = {
      windowsHide: true,
      timeout: 20000,
      maxBuffer: 16384,
      encoding: "utf8" as const,
      env: { NODE_ENV: "production" as const, SystemRoot: sys(), WINDIR: sys() },
    };
    const sid = (
      await run(join(sys(), "System32/whoami.exe"), ["/user", "/fo", "csv", "/nh"], o)
    ).stdout.match(/S-\d+(?:-\d+)+/)?.[0];
    if (!sid || sid === "S-1-5-18") throw Error("WINDOWS_IDENTITY_UNAVAILABLE");
    const icacls = join(sys(), "System32/icacls.exe");
    await run(
      icacls,
      [root, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`, "*S-1-5-18:(OI)(CI)F"],
      o,
    );
    await run(icacls, [root, "/setowner", `*${sid}`], o);
    await run(icacls, [root, "/remove:g", "*S-1-5-32-544"], o);
  }
  await assertPrivateRuntimeRoot(root);
}

interface Pointer {
  root: string;
  target: Target;
  port: number;
}
async function pointer(): Promise<Pointer> {
  return JSON.parse(await readFile(pointerFile(), "utf8"));
}
const read = async (root: string, name: string) =>
  (await readFile(join(root, name), "utf8")).trim();

async function adminPool(p: Pointer) {
  return new pg.Pool({
    host: p.target.host,
    port: p.port,
    database: p.target.database,
    user: "postgres",
    password: await read(p.root, "bootstrap.password"),
    max: 1,
    connectionTimeoutMillis: 2000,
  });
}
async function waitReady(pool: pg.Pool) {
  for (let n = 0; n < 60; n++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw Error("DATABASE_NOT_READY");
}

export async function provisionG05(port = 55436) {
  if ((await dockerOrNull(["inspect", G05_CONTAINER])) !== null)
    throw Error("G05_LOCAL_ENVIRONMENT_ALREADY_EXISTS");
  await freePort(port);
  const target = g05LocalTarget(port, "wetscan-s01:" + randomUUID());
  const g02Plan = await guardMigrationPlan();
  const g05Plan = await g05MigrationPlan();
  const id = randomUUID();
  const root = join(parentDir(), "wetscan-g05-runtime-db-" + id);
  const evidenceDir = join(root, "evidence");

  await docker(["pull", "-q", PG_IMAGE]);
  await securePrivateRoot(root);
  await mkdir(evidenceDir, { mode: 0o700 });

  const password = () => randomBytes(32).toString("hex");
  const pw = {
    bootstrap: password(),
    app: password(),
    worker: password(),
    migration: password(),
    vault: password(),
  };
  const files: Record<string, string> = {
    "bootstrap.password": pw.bootstrap,
    "app.password": pw.app,
    "worker.password": pw.worker,
    "migration.password": pw.migration,
    "vault.key": pw.vault,
  };
  for (const [name, value] of Object.entries(files))
    await writeFile(join(root, name), value, { flag: "wx", mode: 0o600 });

  const expiresAt = new Date(Date.now() + 14 * 86400000).toISOString();
  for (const purpose of ["app", "worker", "migration"] as const satisfies readonly LocalPurpose[])
    await writeFile(
      join(root, purpose + ".database.json"),
      JSON.stringify(
        localApproval(purpose, target, g02Plan.sha256, expiresAt),
        null,
        2,
      ) + "\n",
      { flag: "wx", mode: 0o600 },
    );

  await docker([
    "volume",
    "create",
    "--label",
    "wetscan.env=g05-local",
    "--label",
    "wetscan.env.id=" + id,
    G05_VOLUME,
  ]);
  await docker([
    "create",
    "--name",
    G05_CONTAINER,
    "--label",
    "wetscan.env=g05-local",
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
    `type=volume,source=${G05_VOLUME},target=/var/lib/postgresql`,
    "--mount",
    `type=bind,source=${join(root, "bootstrap.password")},target=/run/bootstrap.password,readonly`,
    "--publish",
    `127.0.0.1:${port}:${port}`,
    "--env",
    "POSTGRES_PASSWORD_FILE=/run/bootstrap.password",
    "--env",
    "POSTGRES_DB=" + G05_LOCAL_DATABASE,
    "--env",
    "PGPORT=" + port,
    "--env",
    "PGDATA=/var/lib/postgresql/18/docker",
    PG_IMAGE,
  ]);
  await docker(["start", G05_CONTAINER]);
  await writeFile(pointerFile(), JSON.stringify({ root, target, port }), {
    flag: "wx",
  });

  const admin = await adminPool({ root, target, port });
  try {
    await waitReady(admin);
    const c = await admin.connect();
    try {
      const empty = (
        await c.query(
          "SELECT current_database() d, inet_server_port() p, (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()) m, to_regnamespace('platform') pf, to_regnamespace('guard') g, to_regnamespace('sentinel') s, (SELECT count(*) FROM pg_roles WHERE rolname LIKE 'wetscan%')::int r",
        )
      ).rows[0];
      if (
        empty.d !== G05_LOCAL_DATABASE ||
        empty.p !== port ||
        empty.m !== null ||
        empty.pf ||
        empty.g ||
        empty.s ||
        empty.r
      )
        throw Error("EMPTY_TARGET_REQUIRED");

      validateGuardApproval(
        JSON.parse(await read(root, "migration.database.json")),
        "migration",
        g02Plan.sha256,
      );

      await c.query("BEGIN");
      for (const role of [
        "wetscan_app",
        "wetscan_sentinel_worker",
        "wetscan_migrator",
      ])
        await c.query(
          `CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`,
        );
      for (const purpose of ["app", "worker", "migration"] as const)
        await c.query(
          `CREATE ROLE ${roleOf[purpose]} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${pw[purpose]}'`,
        );
      await c.query(`ALTER DATABASE ${G05_LOCAL_DATABASE} OWNER TO wetscan_guard_migrator`);
      await c.query(`COMMENT ON DATABASE ${G05_LOCAL_DATABASE} IS '${target.marker}'`);
      await c.query(`REVOKE ALL ON DATABASE ${G05_LOCAL_DATABASE} FROM PUBLIC`);
      await c.query(
        `GRANT CONNECT ON DATABASE ${G05_LOCAL_DATABASE} TO wetscan_guard_app,wetscan_guard_worker,wetscan_guard_migrator`,
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
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
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
      await applyG05Schema(migPool, g05Plan, target.marker, target.database);
    } finally {
      await migPool.end();
    }
  } finally {
    await admin.end();
  }

  return {
    container: G05_CONTAINER,
    volume: G05_VOLUME,
    id,
    target,
    guard0001PlanSha256: g02Plan.sha256,
    g05Checksum: g05Plan.checksum,
    expiresAt,
  };
}

export async function verifyG05() {
  const p = await pointer();
  const g02Plan = await guardMigrationPlan();
  const g05Plan = await g05MigrationPlan();
  await assertPrivateRuntimeRoot(p.root);
  for (const purpose of ["app", "worker", "migration"] as const) {
    const a = validateGuardApproval(
      JSON.parse(await read(p.root, purpose + ".database.json")),
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
  const admin = await adminPool(p);
  const c = await admin.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const r = (
      await c.query(`SELECT current_database() d, inet_server_port() p,
        (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) owner,
        (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()) marker,
        (SELECT jsonb_agg(version||':'||checksum ORDER BY version) FROM platform.schema_migrations) platform,
        (SELECT jsonb_agg(version||':'||checksum ORDER BY version) FROM guard.schema_migrations) guard,
        (SELECT jsonb_agg(version||':'||checksum ORDER BY version) FROM guard.g05_schema_migrations) g05,
        (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='guard' AND c.relname LIKE 'g05_%' AND c.relname<>'g05_schema_migrations' AND c.relrowsecurity AND c.relforcerowsecurity)::int g05_forced_rls,
        (SELECT count(*) FROM pg_roles WHERE rolname IN ('wetscan_guard_app','wetscan_guard_worker','wetscan_guard_migrator') AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole)::int least_priv_roles,
        has_table_privilege('wetscan_guard_app','guard.g05_runs','DELETE') app_delete,
        has_table_privilege('wetscan_guard_worker','guard.g05_runs','DELETE') worker_delete,
        has_function_privilege('wetscan_guard_app','guard.g05_pending_scopes(integer)','EXECUTE') app_pending_fn,
        has_function_privilege('wetscan_guard_worker','guard.g05_pending_scopes(integer)','EXECUTE') worker_pending_fn,
        has_database_privilege('public',current_database(),'CONNECT') public_connect`)
    ).rows[0];
    await c.query("ROLLBACK");
    const expectedPlatform = (
      await migrationPlan(GUARD_PLATFORM_BASELINE)
    ).migrations.map((m) => m.version + ":" + m.checksum);
    const ok =
      r.d === G05_LOCAL_DATABASE &&
      r.p === p.port &&
      r.owner === "wetscan_guard_migrator" &&
      r.marker === p.target.marker &&
      JSON.stringify(r.platform) === JSON.stringify(expectedPlatform) &&
      r.guard?.length === 1 &&
      r.g05?.length === 1 &&
      r.g05[0] === g05Plan.version + ":" + g05Plan.checksum &&
      r.g05_forced_rls === 12 &&
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
      marker: r.marker,
      platformLedger: r.platform?.length,
      guardLedger: r.guard?.length,
      g05Ledger: r.g05?.length,
      g05ForcedRlsTables: r.g05_forced_rls,
      leastPrivilegeRoles: r.least_priv_roles,
      appCanDelete: r.app_delete,
      workerCanDelete: r.worker_delete,
      workerPendingFn: r.worker_pending_fn,
      publicConnect: r.public_connect,
    };
  } finally {
    c.release();
    await admin.end();
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  let out: unknown;
  if (cmd === "provision") {
    const i = rest.indexOf("--port");
    out = await provisionG05(i >= 0 ? Number(rest[i + 1]) : 55436);
  } else if (cmd === "verify") {
    out = await verifyG05();
  } else if (cmd === "start" || cmd === "stop") {
    await docker([cmd, G05_CONTAINER]);
    out = { container: G05_CONTAINER, action: cmd };
  } else if (cmd === "status") {
    out = JSON.parse(
      (await docker(["inspect", "--format", "{{json .State}}", G05_CONTAINER])) ||
        "{}",
    );
  } else if (cmd === "env") {
    const p = await pointer();
    for (const [k, f] of [
      ["APP_APPROVAL_FILE", "app.database.json"],
      ["APP_PASSWORD_FILE", "app.password"],
      ["WORKER_APPROVAL_FILE", "worker.database.json"],
      ["WORKER_PASSWORD_FILE", "worker.password"],
      ["MIGRATION_APPROVAL_FILE", "migration.database.json"],
      ["MIGRATION_PASSWORD_FILE", "migration.password"],
    ])
      console.log(
        `export GUARD_G05_DB_${k}='${resolve(p.root, f).replaceAll("\\", "/")}'`,
      );
    console.log(
      `export GUARD_G05_VAULT_KEY_FILE='${resolve(p.root, "vault.key").replaceAll("\\", "/")}'`,
    );
    console.log(
      `export GUARD_G05_EVIDENCE_DIR='${resolve(p.root, "evidence").replaceAll("\\", "/")}'`,
    );
    return;
  } else {
    throw Error("USAGE");
  }
  console.log(JSON.stringify(out));
}

if (
  process.argv[1]
    ?.replaceAll("\\", "/")
    .endsWith("/guard-g05-local-env.ts")
)
  main().catch((e) => {
    console.log(
      JSON.stringify({
        error: e instanceof Error ? e.message.slice(0, 100) : "UNKNOWN",
      }),
    );
    process.exitCode = 1;
  });
