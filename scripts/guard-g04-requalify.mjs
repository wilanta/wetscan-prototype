// Renews the one-hour G02 scanner qualification for the G04 environment and writes a fresh, empty private runtime root + config.
// Run it on a QUIET machine (browsers/IDE closed): OSV needs a ~2 GB container. Takes about 3-5 minutes.
//   node scripts/guard-g04-requalify.mjs
// Then restart the dispatcher (runbook section 3). Nothing else may run scans meanwhile.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DOCKER = process.env.G02_INSTALL_DOCKER ?? "C:/Users/sheil/AppData/Local/Programs/DockerDesktop/resources/bin/docker";
// the built scanner context lives next to the original checkout (git-ignored, 2.8 GB); override with G04_INSTALL_CONTEXT_PARENT
const parent = resolve(process.env.G04_INSTALL_CONTEXT_PARENT ?? join(process.cwd(), "..", "wetscan-prototype"));
const installDir = join(parent, ".local", "g02-install");
const env = { ...process.env, GUARD_LOCAL_ENV: "g04", G02_INSTALL_DOCKER: DOCKER };
const run = (cwd, args, label) => {
  const r = spawnSync(process.execPath, args, { cwd, env, encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) { console.error(`${label} failed (exit ${r.status})\n${(r.stderr || r.stdout).slice(-600)}`); process.exit(1); }
  return r.stdout;
};
const tsx = join(process.cwd(), "node_modules", "tsx", "dist", "loader.mjs");
console.log("1/5 new private runtime root");
const root = JSON.parse(run(process.cwd(), ["--conditions=react-server", "--import", "tsx", "scripts/guard-g02-local-env.ts", "runtime-root"], "runtime-root").trim().split("\n").pop()).runtimeRoot;
mkdirSync(".local", { recursive: true });
writeFileSync(".local/g04-root4.txt", root + "\n");
console.log("2/5 qualify scanners (about 3 min; OSV may take up to 90 s)");
const before = new Set(readdirSync(installDir).filter((f) => f.startsWith("physical-installation-report.")));
const out = run(process.cwd(), ["--import", "tsx", "worker/guard/installation/qualify.ts", installDir, "--full"], "qualify");
if (/"scanStatus":"BLOCKED"/.test(out)) { console.error("a scanner phase was BLOCKED (usually OSV timing out because the machine is short of RAM). Close other applications and retry."); process.exit(1); }
const report = readdirSync(installDir).filter((f) => f.startsWith("physical-installation-report.") && !before.has(f)).map((f) => join(installDir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
if (!report) { console.error("no new qualification report was written"); process.exit(1); }
console.log("3/5 export measurement into the private root");
run(parent, ["--import", pathToUrl(tsx), join(process.cwd(), "worker/guard/installation/measured.ts"), report, root], "measured");
console.log("4/5 write the server-owned runtime config (branches: main, g04/*)");
run(process.cwd(), ["--conditions=react-server", "--import", "tsx", "scripts/guard-g04-config.ts", root, process.env.G04_DEMO_WORKSPACE ?? "github-user-187839747:test", process.env.G04_DEMO_REPOSITORY_ID ?? "1464294716", "main", "g04/*"], "config");
const cfg = JSON.parse(readFileSync(join(root, "product.runtime.json"), "utf8"));
console.log("5/5 done. Qualification expires " + cfg.deployments[0].qualification.expiresAt + " (one hour). Restart the dispatcher now.");
function pathToUrl(p) { return "file:///" + p.replace(/\\/g, "/"); }
