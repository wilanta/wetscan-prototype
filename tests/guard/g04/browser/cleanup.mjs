// Test-harness hygiene (status updates only, no DELETE): the fixture repository (id 101) may be automated by one workspace at a time.
import pg from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const p = JSON.parse(readFileSync(process.env.G04_ENV_POINTER ?? join(process.env.LOCALAPPDATA ?? ".", "WetScanGuardG04", "current.json"), "utf8"));
const c = new pg.Client({ host: p.target.host, port: p.target.port, database: p.target.database, user: "wetscan_guard_migrator", password: readFileSync(join(p.root, "migration.password"), "utf8").trim() });
await c.connect();
await c.query("UPDATE guard.g04_policies SET policy=jsonb_set(policy,'{enabled}','false'), updated_by='test_cleanup' WHERE repository_id='101' AND (policy->>'enabled')='true'");
await c.query("UPDATE guard.g04_triggers SET status='cancelled', note='test_cleanup' WHERE repository_id='101' AND status IN('pending','running')");
await c.query("UPDATE guard.g04_schedules SET enabled=false WHERE project_id='github-101' AND enabled");
await c.query("UPDATE guard.g04_check_runs SET published=true WHERE project_id='github-101' AND published=false");
await c.end();
