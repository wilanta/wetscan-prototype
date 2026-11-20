/**
 * G04-owned development environment helper (separate container/volume/directory from G02; see guard-g02-local-env.ts).
 *   GUARD_LOCAL_ENV=g04 node --conditions=react-server --import tsx scripts/guard-g04-env.ts migrate|status|down-check
 * Passwords are read from the private files named by the pointer and never printed.
 */
process.env.GUARD_LOCAL_ENV = "g04";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { applyG04Schema, g04MigrationPlan } from "../src/features/guard/g04/migrations";

const parent = join(process.env.LOCALAPPDATA ?? ".", "WetScanGuardG04");
async function pointer() {
  return JSON.parse(await readFile(join(parent, "current.json"), "utf8")) as { root: string; target: { host: string; port: number; database: string; marker: string } };
}
async function connect(user: "wetscan_guard_migrator" | "wetscan_guard_app" | "wetscan_guard_worker") {
  const p = await pointer(),
    file = user === "wetscan_guard_migrator" ? "migration.password" : user === "wetscan_guard_app" ? "app.password" : "worker.password";
  const pool = new pg.Pool({ host: p.target.host, port: p.target.port, database: p.target.database, user, password: (await readFile(join(p.root, file), "utf8")).trim(), max: 2 });
  return { pool, target: p.target };
}
async function main() {
  const cmd = process.argv[2],
    plan = await g04MigrationPlan();
  if (cmd === "migrate") {
    const { pool, target } = await connect("wetscan_guard_migrator");
    try {
      console.log(JSON.stringify({ status: await applyG04Schema(pool as never, plan, target.marker, target.database), version: plan.version, checksum: plan.checksum }));
    } finally {
      await pool.end();
    }
  } else if (cmd === "status") {
    const { pool } = await connect("wetscan_guard_migrator");
    try {
      const r = await pool.query("SELECT version,checksum FROM guard.g04_schema_migrations");
      console.log(JSON.stringify({ ledger: r.rows, planChecksum: plan.checksum, match: r.rows[0]?.checksum === plan.checksum }));
    } finally {
      await pool.end();
    }
  } else throw new Error("USAGE: migrate|status");
}
main().catch((e) => {
  console.log(JSON.stringify({ error: e instanceof Error ? e.message.slice(0, 120) : "UNKNOWN" }));
  process.exitCode = 1;
});
