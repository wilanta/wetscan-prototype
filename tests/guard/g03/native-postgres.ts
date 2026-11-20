/** Test-only PostgreSQL cluster on a random loopback port. No owner DB/env/credential access. */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { createServer } from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { migrationPlan } from "../../../src/platform/migrations";
import {
  guardMigrationPlan,
  GUARD_PLATFORM_BASELINE,
} from "../../../src/features/guard/live/migrations";
import { secureSnapshotDirectory } from "../../../src/features/guard/live/snapshot-directory";
import { ApprovedPool, PlatformDatabase } from "../../../src/platform/database";
export async function nativePostgres() {
  const bin = process.env.G03_TEST_POSTGRES_BIN;
  if (!bin || !isAbsolute(bin)) throw Error("G03_TEST_POSTGRES_BIN_required");
  const root = await mkdtemp(
    join(tmpdir(), "wetscan-g01-snapshot-g03-postgres-"),
  );
  await secureSnapshotDirectory(root);
  const run = async (name: string, args: string[]) =>
    new Promise<void>((done, fail) => {
      const child = spawn(
        join(bin, name + (process.platform === "win32" ? ".exe" : "")),
        args,
        {
          windowsHide: true,
          shell: false,
          env: {
            NODE_ENV: "test",
            SystemRoot: process.env.SystemRoot,
            WINDIR: process.env.WINDIR,
            COMSPEC: process.env.COMSPEC,
            SYSTEMDRIVE: process.env.SYSTEMDRIVE,
            USERPROFILE: process.env.USERPROFILE,
            USERNAME: process.env.USERNAME,
            USERDOMAIN: process.env.USERDOMAIN,
            PATH:
              bin +
              ";" +
              join(process.env.SystemRoot ?? "C:\\Windows", "System32"),
            TEMP: root,
            TMP: root,
            LANG: "C",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let bytes = 0,
        diagnostic = "";
      child.stdout.on("data", (b: Buffer) => {
        bytes += b.length;
        diagnostic += b.toString();
        if (bytes > 100000) child.kill();
      });
      child.stderr.on("data", (b: Buffer) => {
        bytes += b.length;
        diagnostic += b.toString();
        if (bytes > 100000) child.kill();
      });
      const timer = setTimeout(() => child.kill(), 30000);
      child.once("error", () => {
        clearTimeout(timer);
        fail(Error("fixture_process_unavailable"));
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) done();
        else
          fail(
            Error(
              "fixture_process_failed_" +
                name +
                "_" +
                code +
                ": " +
                diagnostic.slice(0, 1500),
            ),
          );
      });
    });
  const data = join(root, "data");
  await mkdir(data);
  await run("initdb", [
    "-D",
    data,
    "-U",
    "postgres",
    "--auth-local=trust",
    "--auth-host=trust",
    "--no-locale",
    "--encoding=UTF8",
  ]);
  const port = await new Promise<number>((done, fail) => {
    const s = createServer();
    s.once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => done(port));
    });
  });
  if (port === 5432 || port === 55432 || port < 1024)
    throw Error("unsafe_fixture_port");
  const target = {
    host: "127.0.0.1",
    port,
    database: "wetscan_dev_guardg03",
    marker: "wetscan-s01:" + randomUUID(),
  };
  await run("pg_ctl", [
    "-D",
    data,
    "-l",
    join(root, "postgres.log"),
    "-o",
    `-h 127.0.0.1 -p ${port}`,
    "-w",
    "start",
  ]);
  let admin = new pg.Pool({
    host: target.host,
    port,
    user: "postgres",
    database: "postgres",
    max: 1,
    connectionTimeoutMillis: 2000,
  });
  const password = randomBytes(32).toString("hex");
  try {
    for (const role of [
      "wetscan_app",
      "wetscan_sentinel_worker",
      "wetscan_migrator",
    ])
      await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
    for (const role of [
      "wetscan_guard_app",
      "wetscan_guard_worker",
      "wetscan_guard_migrator",
    ])
      await admin.query(
        `CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`,
      );
    await admin.query(
      "CREATE DATABASE wetscan_dev_guardg03 OWNER wetscan_guard_migrator",
    );
    await admin.end();
    admin = new pg.Pool({
      host: target.host,
      port,
      user: "postgres",
      database: target.database,
      max: 1,
      connectionTimeoutMillis: 2000,
    });
    await admin.query(
      `COMMENT ON DATABASE wetscan_dev_guardg03 IS '${target.marker}'`,
    );
    const c = await admin.connect();
    try {
      await c.query(
        "BEGIN; SET LOCAL ROLE wetscan_guard_migrator; CREATE SCHEMA platform; CREATE TABLE platform.schema_migrations(version text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp()); REVOKE ALL ON SCHEMA platform FROM PUBLIC",
      );
      for (const m of (await migrationPlan(GUARD_PLATFORM_BASELINE))
        .migrations) {
        await c.query(m.up);
        await c.query(
          "INSERT INTO platform.schema_migrations(version,checksum) VALUES($1,$2)",
          [m.version, m.checksum],
        );
      }
      const plan = await guardMigrationPlan();
      await c.query(plan.migration.up);
      await c.query(
        "INSERT INTO guard.schema_migrations(version,checksum) VALUES($1,$2)",
        [plan.migration.version, plan.migration.checksum],
      );
      await c.query("RESET ROLE");
      await c.query(
        await readFile("migrations/guard/platform-access.proposed.sql", "utf8"),
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
    const plan = await guardMigrationPlan();
    const config = {
      target,
      purpose: "app" as const,
      user: "wetscan_guard_app",
      password,
      max: 2,
      approval: {
        schemaVersion: 1 as const,
        status: "APPROVED" as const,
        approvedBy: "g03-isolated-fixture",
        approvedAt: new Date().toISOString(),
        target,
        actions: ["runtime" as const],
        migrationPlanSha256: plan.sha256,
      },
    };
    let pool = new ApprovedPool(config);
    return {
      root,
      target,
      admin,
      db: () => new PlatformDatabase(pool, false, "guard"),
      async restart() {
        await pool.end();
        await admin.end();
        await run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
        await run("pg_ctl", [
          "-D",
          data,
          "-l",
          join(root, "postgres.log"),
          "-o",
          `-h 127.0.0.1 -p ${port}`,
          "-w",
          "start",
        ]);
        pool = new ApprovedPool(config);
        admin = new pg.Pool({
          host: target.host,
          port,
          user: "postgres",
          database: target.database,
          max: 1,
        });
      },
      async stop() {
        await pool.end().catch(() => {});
        await admin.end().catch(() => {});
        await run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
      },
    };
  } catch (e) {
    await admin.end().catch(() => {});
    await run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    throw e;
  }
}
