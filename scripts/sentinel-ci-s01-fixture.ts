import { randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { migrationPlan } from "../src/platform/migrations";

/**
 * CI-only fixture for the approval-gated S01 platform PostgreSQL suite (`npm run test:platform:postgres`).
 * Creates, inside a DISPOSABLE loopback service container, the four roles, a `wetscan_s01_test_ci` database with an
 * identity marker, private password files and an approval bound to the current plan hash, then exports the
 * SENTINEL_DB_* names through GITHUB_ENV. The approval states plainly that it is a CI fixture: it carries no owner
 * authority and cannot name any persistent database (the verifier only accepts the marker created here).
 */
const admin = new URL(process.env.SENTINEL_CI_S01_ADMIN_URL ?? "");
if (!["127.0.0.1", "localhost"].includes(admin.hostname))
  throw new Error("ci_fixture_target_denied");
const dir = join(process.env.RUNNER_TEMP ?? ".", "s01-fixture");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const secret = () => randomBytes(24).toString("base64url");
const pw = {
  migration: secret(),
  app: secret(),
  worker: secret(),
  notifier: secret(),
};
for (const [k, v] of Object.entries(pw))
  writeFileSync(join(dir, `${k}.password`), v, { mode: 0o600 });
const database = "wetscan_s01_test_ci";
const marker = `wetscan-s01:${randomUUID()}`;
const port = Number(admin.port || 5432);
const root = new pg.Client({
  host: admin.hostname,
  port,
  database: "postgres",
  user: decodeURIComponent(admin.username),
  password: decodeURIComponent(admin.password),
});
await root.connect();
for (const [role, key] of [
  ["wetscan_migrator", "migration"],
  ["wetscan_app", "app"],
  ["wetscan_sentinel_worker", "worker"],
  ["wetscan_sentinel_notifier", "notifier"],
] as const)
  await root.query(
    `CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${pw[key]}'`,
  );
await root.query(`CREATE DATABASE ${database} OWNER wetscan_migrator`);
await root.query(`COMMENT ON DATABASE ${database} IS '${marker}'`);
await root.query(`REVOKE CONNECT ON DATABASE ${database} FROM PUBLIC`);
await root.query(
  `GRANT CONNECT ON DATABASE ${database} TO wetscan_migrator, wetscan_app, wetscan_sentinel_worker, wetscan_sentinel_notifier`,
);
await root.end();
const plan = await migrationPlan();
writeFileSync(
  join(dir, "approval.json"),
  JSON.stringify({
    schemaVersion: 1,
    status: "APPROVED",
    approvedBy:
      "CI-generated fixture approval for an ephemeral service container; carries no owner authority and no persistent database is reachable with it",
    approvedAt: new Date().toISOString(),
    target: { host: admin.hostname, port, database, marker },
    actions: ["integration_test", "runtime", "migrate_up", "migrate_down"],
    migrationPlanSha256: plan.sha256,
    scope: "S01 platform PostgreSQL acceptance on a disposable CI database",
  }),
  { mode: 0o600 },
);
const env = {
  SENTINEL_DB_HOST: admin.hostname,
  SENTINEL_DB_PORT: String(port),
  SENTINEL_DB_NAME: database,
  SENTINEL_DB_MARKER: marker,
  SENTINEL_DB_APPROVAL_FILE: join(dir, "approval.json"),
  SENTINEL_DB_APP_PASSWORD_FILE: join(dir, "app.password"),
  SENTINEL_DB_WORKER_PASSWORD_FILE: join(dir, "worker.password"),
  SENTINEL_DB_MIGRATION_PASSWORD_FILE: join(dir, "migration.password"),
};
if (process.env.GITHUB_ENV)
  appendFileSync(
    process.env.GITHUB_ENV,
    Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
  );
console.log(
  `ci-s01-fixture: ${database} ready (marker and secrets not printed)`,
);
