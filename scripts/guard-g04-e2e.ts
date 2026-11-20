/**
 * Local G04 acceptance driver against the isolated G04 environment (real PostgreSQL, real app HTTP route, real dispatcher,
 * real G02 scanner pipeline, real GitHub reads). Deliveries are SELF-SIGNED with the local secret: this proves Guard's
 * handling of signed deliveries, NOT that GitHub itself delivered them (the GitHub App has no webhook configured).
 *
 *   source .local/g04-env.sh && node --conditions=react-server --import ./scripts/server-only-stub.mjs --import tsx scripts/guard-g04-e2e.ts <seed|send|state> [...]
 */
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { openG04 } from "../src/features/guard/g04/db";
import { defaultPolicy } from "../src/features/guard/g04/policy";
import { signatureFor } from "../src/features/guard/g04/webhook";

const SCOPE = { workspaceId: "github-user-187839747:test", projectId: "github-1464294716" },
  REPO = { id: 1464294716, full_name: "wilanta/wetscan-g02-acceptance" },
  INSTALLATION = 181791848,
  VULN = "c1330c63ef9bbe7fc0dcf435c6653488f269b827",
  FIXED = "3c6a99ec42b8259ab659a24c2f0d94822b389872";
const base = process.env.G04_E2E_BASE ?? "http://localhost:3000";
const secret = () => readFileSync(process.env.GUARD_PRODUCT_CONFIG_FILE!.replace(/product\.runtime\.json$/, "webhook.secret"), "utf8").trim();

async function post(event: string, payload: unknown, opts: { delivery?: string; secret?: string; tamper?: boolean } = {}) {
  const raw = Buffer.from(JSON.stringify(payload)),
    sig = signatureFor(opts.secret ?? secret(), raw);
  const r = await fetch(base + "/api/guard/webhooks/github", { method: "POST", headers: { "content-type": "application/json", "x-github-event": event, "x-github-delivery": opts.delivery ?? randomUUID(), "x-hub-signature-256": sig }, body: opts.tamper ? Buffer.concat([raw, Buffer.from(" ")]) : raw });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const push = (branch: string, after: string) => ({ ref: "refs/heads/" + branch, after, forced: false, installation: { id: INSTALLATION }, repository: REPO });

async function main() {
  const cmd = process.argv[2];
  const rt = await openG04();
  try {
    if (cmd === "seed") {
      const existing = await rt.appStore.getPolicy(SCOPE);
      const policy = { ...defaultPolicy, enabled: true, protectedBranches: ["main", "g04/*"], triggers: { pullRequest: true, push: true, manual: true, schedule: true } };
      const rev = await rt.appStore.savePolicy(SCOPE, { repositoryId: String(REPO.id), repositoryName: REPO.full_name, installationId: INSTALLATION, ownerActor: "github-user-187839747", ownerUserId: 187839747 }, policy, existing?.revision ?? 0, "github-user-187839747", "g04 local acceptance seed");
      console.log(JSON.stringify({ seeded: true, revision: rev }));
    } else if (cmd === "send") {
      const out: Record<string, unknown> = {};
      const d = randomUUID();
      out.vulnerablePush = await post("push", push("g04/vulnerable", VULN), { delivery: d });
      out.duplicateDelivery = await post("push", push("g04/vulnerable", VULN), { delivery: d });
      out.sameIdDifferentBytes = await post("push", push("g04/vulnerable", FIXED), { delivery: d });
      out.badSignature = await post("push", push("g04/vulnerable", VULN), { secret: "x".repeat(40) });
      out.tampered = await post("push", push("g04/vulnerable", VULN), { tamper: true });
      out.unprotectedBranch = await post("push", push("scratch/x", VULN));
      out.wrongInstallation = await post("push", { ...push("main", FIXED), installation: { id: 42 } });
      console.log(JSON.stringify(out, null, 1));
    } else if (cmd === "rerun") {
      // A "Re-run" click on Guard's own check: check_run.rerequested from OUR app id, exact commit.
      const commit = process.argv[3] === "fixed" ? FIXED : VULN,
        branch = process.argv[3] === "fixed" ? "main" : "g04/vulnerable";
      console.log(JSON.stringify(await post("check_run", { action: "rerequested", installation: { id: INSTALLATION }, repository: REPO, check_run: { head_sha: commit, app: { id: Number(process.env.GITHUB_APP_ID) }, check_suite: { head_branch: branch }, pull_requests: [] } })));
    } else if (cmd === "send-main") {
      console.log(JSON.stringify(await post("push", push("main", FIXED))));
    } else if (cmd === "state") {
      const [triggers, evals, checks, audit] = await Promise.all([rt.appStore.listTriggers(SCOPE, 10), rt.appStore.listEvaluations(SCOPE, 10), rt.appStore.listChecks(SCOPE, 10), rt.appStore.recentAudit(SCOPE, 15)]);
      console.log(JSON.stringify({ triggers: triggers.map((t) => ({ source: t.source, branch: t.branch, commit: t.commit.slice(0, 8), status: t.status, attempts: t.attempts, error: t.lastError, note: t.note, scan: t.scanId?.slice(0, 12) })), evaluations: evals.map((e) => ({ commit: e.commit.slice(0, 8), decision: e.decision, rev: e.policyRevision, counts: (e.evaluation as { counts: unknown }).counts, coverage: (e.evaluation as { coverage: unknown }).coverage, reasons: (e.evaluation as { reasons: { code: string }[] }).reasons.map((r) => r.code) })), checks: checks.map((c) => ({ commit: c.commit.slice(0, 8), status: c.status, conclusion: c.conclusion, decision: c.decision, published: c.published, error: c.lastError, attempts: c.attempts })), audit: audit.map((a) => a.action) }, null, 1));
    } else throw new Error("USAGE");
  } finally {
    await rt.close();
    void createHash;
  }
}
main().catch((e) => {
  console.error(JSON.stringify({ error: e instanceof Error ? e.message.slice(0, 120) : "unknown" }));
  process.exitCode = 1;
});
