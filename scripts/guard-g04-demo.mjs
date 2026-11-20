// G04 demo helper (sandbox repository only). Uses the GitHub CLI logged in as the repository owner.
//   node scripts/guard-g04-demo.mjs check                     readiness of every moving part
//   node scripts/guard-g04-demo.mjs push vuln|clean|warn      a REAL push (new commit) on the demo branch -> webhook -> scan -> Check Run
//   node scripts/guard-g04-demo.mjs status                    Check Run + merge state of the three demo PRs
//   node scripts/guard-g04-demo.mjs try-merge                 attempts to merge the VULNERABLE PR #2 (must be refused); never touches #3/#4
//   node scripts/guard-g04-demo.mjs evidence [file]           writes the live GitHub evidence as JSON (recorded evidence, not a live scan)
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const R = "wilanta/wetscan-g02-acceptance";
const TUNNEL = process.env.G04_TUNNEL ?? "https://provider-charges-sections-pet.trycloudflare.com";
const gh = (...a) => {
  const r = spawnSync("gh", a, { encoding: "utf8" });
  return { code: r.status, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
};
const ghj = (...a) => {
  const r = gh(...a);
  if (r.code !== 0) throw new Error(r.err.split("\n")[0]);
  return r.out ? JSON.parse(r.out) : null;
};
const PRS = {
  2: { name: "VULNERABLE", branch: "g04/gate-vuln", expect: "BLOCK / failure / merge BLOCKED" },
  3: { name: "CLEAN", branch: "g04/gate-clean", expect: "PASS / success / merge CLEAN" },
  4: { name: "WARN", branch: "g04/gate-warn", expect: "WARN / neutral / merge CLEAN" },
};
const line = (ok, label, detail = "") => console.log((ok ? "  OK   " : "  FAIL ") + label.padEnd(46) + detail);
const ps = (c) => spawnSync("powershell", ["-NoProfile", "-Command", c], { encoding: "utf8" }).stdout.trim();

async function status() {
  const out = [];
  for (const [n, p] of Object.entries(PRS)) {
    const pr = ghj("api", `repos/${R}/pulls/${n}`);
    const head = pr.head.sha;
    const run = ghj("api", `repos/${R}/commits/${head}/check-runs`).check_runs.find((c) => c.name === "WetScan Guard / Security gate");
    const view = ghj("pr", "view", n, "-R", R, "--json", "mergeStateStatus");
    out.push({
      pr: Number(n), role: p.name, expected: p.expect, branch: p.branch, headSha: head, merged: pr.merged,
      mergeStateStatus: view.mergeStateStatus, checkRunId: run?.id ?? null, checkStatus: run?.status ?? null,
      checkConclusion: run?.conclusion ?? null, checkTitle: run?.output?.title ?? null, url: pr.html_url,
    });
  }
  return out;
}

const cmd = process.argv[2];
if (cmd === "check") {
  console.log("G04 demo readiness (" + new Date().toISOString() + ")");
  const get = (u) => spawnSync("curl.exe", ["-s", "-o", "NUL", "-w", "%{http_code}", "--max-time", "8", u], { encoding: "utf8" }).stdout;
  line(get("http://127.0.0.1:3000/api/guard/webhooks/github") === "405", "app answers on :3000 (webhook route exists)", "GET -> 405 expected");
  line(get(TUNNEL + "/api/guard/webhooks/github") === "405", "public tunnel reaches the same app", TUNNEL);
  try {
    const rs = ghj("api", `repos/${R}/rulesets`);
    line(rs.some((x) => x.enforcement === "active" && x.name.startsWith("g04-gate-test-target")), "ruleset active on g04/gate-test-target", "id " + rs[0]?.id);
  } catch (e) { line(false, "ruleset", e.message); }
  try { line(ghj("api", `repos/${R}/rules/branches/main`).length === 0, "main has NO rules (the demo never touches main)"); } catch (e) { line(false, "main rules", e.message); }
  const procs = ps("(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'guard-g04-(dispatcher|supervisor)' } | Measure-Object).Count");
  line(Number(procs) > 0, "dispatcher / supervisor running", procs + " process(es)");
  const mem = Number(ps("[int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1024)"));
  line(mem >= 1500, "free RAM >= 1500 MB (OSV needs headroom)", mem + " MB free");
  line(spawnSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" }).stdout.includes("wetscan-g04-local-pg"), "G04 PostgreSQL container up", "127.0.0.1:55435");
  try {
    const root = readFileSync(join(process.cwd(), ".local", "g04-root4.txt"), "utf8").trim();
    const cfg = JSON.parse(readFileSync(join(root, "product.runtime.json"), "utf8"));
    const left = (Date.parse(cfg.deployments[0].qualification.expiresAt) - Date.now()) / 60000;
    line(left > 20, "scanner qualification valid > 20 min", Math.round(left) + " min left (re-qualify when low: see runbook section 3)");
  } catch { line(false, "scanner qualification", "see runbook section 3"); }
  for (const x of await status()) line(true, `PR #${x.pr} ${x.role}`, `${x.checkConclusion ?? "no check"} / ${x.mergeStateStatus}   (${x.expected})`);
} else if (cmd === "push") {
  const kind = process.argv[3];
  const branch = { vuln: "g04/gate-vuln", clean: "g04/gate-clean", warn: "g04/gate-warn" }[kind];
  if (!branch) throw new Error("USAGE: push vuln|clean|warn");
  const parent = ghj("api", `repos/${R}/git/ref/heads/${branch}`).object.sha;
  const tree = ghj("api", `repos/${R}/git/commits/${parent}`).tree.sha;
  writeFileSync(".local/demo-tree.json", JSON.stringify({ base_tree: tree, tree: [{ path: "docs/demo-note.md", mode: "100644", type: "blob", content: `# Demo\n${kind} revision pushed at ${new Date().toISOString()}\n` }] }));
  const nt = ghj("api", "-X", "POST", `repos/${R}/git/trees`, "--input", ".local/demo-tree.json").sha;
  const c = ghj("api", "-X", "POST", `repos/${R}/git/commits`, "-f", `message=G04 demo: ${kind} revision`, "-f", `tree=${nt}`, "-f", `parents[]=${parent}`).sha;
  ghj("api", "-X", "PATCH", `repos/${R}/git/refs/heads/${branch}`, "-f", `sha=${c}`);
  console.log(JSON.stringify({ pushed: kind, branch, commit: c, at: new Date().toISOString(), next: "GitHub now sends the webhook; the verdict appears on the PR in about 4-5 minutes (all five engines run)" }));
} else if (cmd === "status") {
  console.table(await status());
} else if (cmd === "try-merge") {
  const v = ghj("pr", "view", "2", "-R", R, "--json", "mergeStateStatus,state");
  if (v.state !== "OPEN") throw new Error("PR #2 is not open");
  if (v.mergeStateStatus !== "BLOCKED") {
    console.log("PR #2 is " + v.mergeStateStatus + ": NOT attempting a merge (this safe demo only tries when GitHub already reports BLOCKED)");
    process.exit(2);
  }
  const r = gh("api", "-X", "PUT", `repos/${R}/pulls/2/merge`, "-f", "merge_method=merge");
  console.log("merge attempt on the vulnerable PR #2 ->", (r.err || r.out).replace(/\s+/g, " ").slice(0, 220));
  console.log("merged:", ghj("api", `repos/${R}/pulls/2`).merged);
} else if (cmd === "evidence") {
  const file = process.argv[3] ?? "docs/acceptance/guard-g04/demo-evidence.json";
  const doc = {
    capturedAt: new Date().toISOString(),
    kind: "RECORDED_EVIDENCE_FROM_REAL_GITHUB (read from GitHub at capturedAt; not a currently executing scan)",
    repository: R,
    rulesets: ghj("api", `repos/${R}/rulesets`).map((x) => ({ id: x.id, name: x.name, enforcement: x.enforcement })),
    rulesOnMain: ghj("api", `repos/${R}/rules/branches/main`).length,
    pullRequests: await status(),
  };
  writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
  console.log("wrote", file);
} else console.log("USAGE: check | push vuln|clean|warn | status | try-merge | evidence [file]");
