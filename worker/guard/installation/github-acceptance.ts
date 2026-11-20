/**
 * Bounded G02 acceptance campaign against ONE dedicated owner-controlled private GitHub repository.
 *   prepare  creates the repository (if absent) with a vulnerable commit and a fixed commit; writes .local/g02-acceptance/repo.json
 *   run      reads exactly those two pinned commits through the GitHub REST API (read-only), then runs the real broker,
 *            sandbox, scanners, worker lease and PostgreSQL persistence on an ISOLATED PostgreSQL container.
 * This is NOT the product Auth/session path nor the operational database: it proves real source + real scanners + real
 * persistence/isolation, and is recorded as such. Tokens are read in memory from the owner's gh login, never logged.
 */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import type { Grant } from "../../../src/features/guard/contracts";
import type { SourceAccess, SourceEntry } from "../../../src/features/guard/live/model";
import { createJob } from "../../../src/features/guard/pipeline";
import { repositoryProfiles } from "../../../src/features/guard/live/scan-profiles";
import { repositoryScanKind, type RepositoryScanPolicy } from "../../../src/features/guard/live/product-policy";
import { PostgresGuardStore } from "../../../src/features/guard/live/persistence";
import { ProductSessionBroker } from "../product-broker";
import { repositoryJobHandler } from "../product-handler";
import { runRepositoryWorkerOnce } from "../product-runtime";
import { operationalRepositoryScanner } from "../scanner-adapter";
import { bindGuardJob } from "../approval";
import { ResourceRegistry } from "../acceptance/registry";
import { qualificationAttestation, verifyProductDatabase } from "../../../src/features/guard/live/product-preflight";
import { guardMigrationPlan } from "../../../src/features/guard/live/migrations";
import { PostgresGuardArtifacts } from "../../../src/features/guard/live/product-artifacts";
import { ApprovedPool, PlatformDatabase } from "../../../src/platform/database";
import type { Engine } from "../../../src/features/guard/contracts";
import { createPostgresFixture } from "./postgres-fixture";
import { acceptanceFiles } from "./acceptance-fixtures";

const REPO = process.env.G02_ACCEPTANCE_REPO ?? "wilanta/wetscan-g02-acceptance";
const state = resolve(".local/g02-acceptance/repo.json");
const gh = (args: string[], cwd?: string) =>
  execFileSync("gh", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

async function prepare() {
  const me = gh(["api", "user", "--jq", ".login"]);
  assert.equal(me, REPO.split("/")[0], "repository owner must be the authenticated owner");
  let exists = true;
  try { gh(["repo", "view", REPO, "--json", "isPrivate", "--jq", ".isPrivate"]); } catch { exists = false; }
  if (!exists) gh(["repo", "create", REPO, "--private", "--description", "WetScan Guard G02 acceptance fixtures (synthetic, harmless)"]);
  assert.equal(gh(["repo", "view", REPO, "--json", "isPrivate", "--jq", ".isPrivate"]), "true");
  const dir = await mkdtemp(join(tmpdir(), "g02-acceptance-repo-"));
  const run = (...a: string[]) => execFileSync("git", ["-c", "user.name=WetScan G02 acceptance", "-c", "user.email=noreply@users.noreply.github.com", "-c", "core.autocrlf=false", ...a], { cwd: dir, encoding: "utf8" }).trim();
  const remote = await readState();
  if (remote) { console.log(JSON.stringify({ phase: "already_prepared", ...remote })); return; }
  run("init", "-q", "-b", "main");
  const write = async (vulnerable: boolean) => {
    await rm(join(dir, "src"), { recursive: true, force: true });
    for (const d of ["config", "infra", "packages"]) await rm(join(dir, d), { recursive: true, force: true });
    for (const [p, c] of Object.entries(acceptanceFiles(vulnerable))) {
      await mkdir(join(dir, p, ".."), { recursive: true });
      await writeFile(join(dir, p), c);
    }
  };
  await write(true); run("add", "-A"); run("commit", "-q", "-m", "Add vulnerable acceptance fixture (synthetic)");
  const vulnerableCommit = run("rev-parse", "HEAD");
  await write(false); run("add", "-A"); run("commit", "-q", "-m", "Fix acceptance fixture");
  const fixedCommit = run("rev-parse", "HEAD");
  run("remote", "add", "origin", `https://github.com/${REPO}.git`);
  run("push", "-q", "origin", "main");
  const repositoryId = gh(["api", `repos/${REPO}`, "--jq", ".id"]);
  const info = { fullName: REPO, repositoryId, vulnerableCommit, fixedCommit, createdAt: new Date().toISOString() };
  await mkdir(resolve(".local/g02-acceptance"), { recursive: true });
  await writeFile(state, JSON.stringify(info, null, 2));
  await rm(dir, { recursive: true, force: true });
  console.log(JSON.stringify({ phase: "prepared", ...info }));
}
async function readState() {
  try { return JSON.parse(await readFile(state, "utf8")) as { fullName: string; repositoryId: string; vulnerableCommit: string; fixedCommit: string }; } catch { return undefined; }
}
interface GhObject {
  id: number;
  private: boolean;
  sha: string;
  commit: { tree: { sha: string } };
  truncated?: boolean;
  tree: { path: string; type: SourceEntry["type"]; mode: string; sha: string; size?: number }[];
  size: number;
  encoding: string;
  content: string;
}
/** Read-only REST source bound to one repository; every call re-verifies the repository id. */
function restSource(token: string, fullName: string, repositoryId: string, branch: string): SourceAccess {
  const call = async (path: string, signal: AbortSignal) => {
    const r = await fetch("https://api.github.com/" + path, { signal, headers: { authorization: "Bearer " + token, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "wetscan-g02-acceptance" } });
    if (!r.ok) throw Object.assign(new Error("github_" + r.status), { code: "github_unavailable" });
    return (await r.json()) as GhObject;
  };
  const authority = async (grant: Grant) => ({ grant, repositoryId, repositoryName: fullName, branch, installationId: 1, userId: 1 });
  return {
    authorize: async () => {
      const g: Grant = { mode: "live", workspaceId: "github-user-1:g02-acceptance", projectId: "github-" + repositoryId, actorId: "github-user-1", operations: ["scan", "read", "report", "triage"], issuedAt: Date.now(), expiresAt: Date.now() + 60000 };
      return authority(g);
    },
    open: async (_a, signal) => {
      const repo = await call("repos/" + fullName, signal);
      if (String(repo.id) !== repositoryId || repo.private !== true) throw Object.assign(new Error("repository_identity"), { code: "repository_denied" });
      return {
        head: async (s) => { const c = await call(`repos/${fullName}/commits/${branch}`, s); return { commit: c.sha, tree: c.commit.tree.sha }; },
        tree: async (sha, s) => { const t = await call(`repos/${fullName}/git/trees/${sha}?recursive=1`, s); return { sha: t.sha, truncated: !!t.truncated, entries: t.tree.map((e): SourceEntry => ({ path: e.path, type: e.type, mode: e.mode, sha: e.sha, size: e.size })) }; },
        blob: async (sha, s) => { const b = await call(`repos/${fullName}/git/blobs/${sha}`, s); return { sha: b.sha, size: b.size, encoding: b.encoding, content: b.content }; },
        close: async () => {},
      };
    },
  };
}
/** Pin a revision: the source answers head() with exactly the requested commit by reading that commit, not the branch tip. */
function pinned(src: SourceAccess, fullName: string, token: string, commit: string): SourceAccess {
  return {
    authorize: src.authorize,
    open: async (a, signal) => {
      const lease = await src.open(a, signal);
      const c = (await (await fetch(`https://api.github.com/repos/${fullName}/commits/${commit}`, { signal, headers: { authorization: "Bearer " + token, accept: "application/vnd.github+json", "user-agent": "wetscan-g02-acceptance" } })).json()) as GhObject;
      if (c.sha !== commit) throw Object.assign(new Error("pin"), { code: "revision_conflict" });
      return { ...lease, head: async () => ({ commit: c.sha, tree: c.commit.tree.sha }) };
    },
  };
}

async function run() {
  const info = await readState();
  assert(info, "run `prepare` first");
  const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  const installation = JSON.parse(await readFile(join(process.env.G02_MEASURED_ROOT ?? "", "deployments.measured.json"), "utf8"));
  const f = await createPostgresFixture();
  const scope = { mode: "live" as const, workspaceId: "github-user-1:g02-acceptance", projectId: "github-" + info.repositoryId };
  const grant = (): Grant => ({ ...scope, actorId: "github-user-1", operations: ["read", "scan", "triage", "report"], issuedAt: Date.now(), expiresAt: Date.now() + 60000 });
  const store = new PostgresGuardStore(f.db.app, repositoryScanKind), workerStore = new PostgresGuardStore(f.db.worker, repositoryScanKind);
  const plan = await guardMigrationPlan();
  await verifyProductDatabase(f.pools.app, "app", { target: f.target }, plan);
  await verifyProductDatabase(f.pools.worker, "worker", { target: f.target }, plan);
  const base = restSource(token, info.fullName, info.repositoryId, "main");
  const engines = [...repositoryProfiles.standard] as Engine[];
  const results: Record<string, unknown>[] = [];
  const scans: Record<string, string> = {};
  try {
    for (const [label, commit] of [["vulnerable", info.vulnerableCommit], ["fixed", info.fixedCommit]] as const) {
      const source = pinned(base, info.fullName, token, commit);
      const job = await createJob(grant(), { ...scope, repository: { provider: "github", repositoryId: info.repositoryId, branch: "main", commit }, profile: "standard", engines, idempotencyKey: "g02-live-acceptance-" + randomUUID() });
      job.audit.push({ actorId: grant().actorId, at: new Date().toISOString(), action: "repository_scan_requested", subjectId: job.id, reason: "ACCEPTANCE_REAL_GITHUB_SOURCE_ISOLATED_POSTGRES_NOT_PRODUCT_AUTH" });
      const policy: RepositoryScanPolicy = { version: 1, id: "g02-github-acceptance", ...scope, repositoryId: info.repositoryId, branches: ["main"], engines: engines as RepositoryScanPolicy["engines"], scannerTimeoutMs: 45000, jobTimeoutMs: 420000, maxAttempts: 1 };
      const created = await store.create(grant(), job);
      assert.equal((await store.create(grant(), job)).job.id, created.job.id);
      const broker = new ProductSessionBroker(job, policy, source);
      const verifyLease = async (l: import("../../../src/features/sentinel/platform-contracts").JobLease) => f.db.worker.scoped(job, async (tx) => { const r = await f.db.worker.query(tx, "SELECT job_id FROM platform.jobs WHERE module='guard' AND job_id=$1 AND lease_token=$2 AND lease_owner=$3 AND state='leased' AND lease_until>clock_timestamp()", [job.id, l.leaseToken, l.workerId]); assert.equal(r.rowCount, 1); });
      const handler = repositoryJobHandler({ storage: workerStore, resolve: async (_j, l, current) => ({ policy, freshGrant: () => broker.freshGrant(), verifyLease, ports: { storage: workerStore.persistence({ workerId: l.workerId, leaseToken: l.leaseToken }, () => broker.sourceCoverage()), snapshots: broker.snapshots, scanners: await Promise.all(engines.map(async (engine) => { const d = installation.deployments.find((x: { engine: Engine }) => x.engine === engine); assert(d, "measured deployment missing for " + engine); return operationalRepositoryScanner({ engine: d.engine, binding: bindGuardJob(job), policy, qualification: d.qualification, spec: d.spec, evidence: await qualificationAttestation(installation.privateRoot, d), sourceOwner: broker.owner, registry: new ResourceRegistry(installation.privateRoot), privateRoot: installation.privateRoot, freshGrant: () => broker.freshGrant(), verifyLease: () => verifyLease(current()) }); })), sandbox: { ready: true, readOnly: true, nonRoot: true, egressControlled: true, cpuLimit: 1, memoryMb: 256, pidsLimit: 64, timeoutMs: 45000 } } }) });
      const outcome = await runRepositoryWorkerOnce({ db: f.db.worker, scope: job, jobId: job.id, workerId: "acceptance-" + randomUUID(), handler, verifyReady: async () => {}, signal: new AbortController().signal, timeoutMs: policy.jobTimeoutMs });
      await broker.close();
      const stored = (await store.get(grant(), job, job.id))!;
      assert.equal(outcome.status, "lease_processed");
      const queue = await f.admin.query("SELECT attempts,state,lease_token FROM platform.jobs WHERE job_id=$1", [job.id]);
      assert.equal(queue.rows[0].state, "completed"); assert.equal(queue.rows[0].attempts, 1); assert.equal(queue.rows[0].lease_token, null);
      for (const fd of stored.job.findings) for (const e of fd.evidence) { assert.equal(e.commit, commit); assert(!e.synthetic, "evidence must not be synthetic"); }
      assert(!JSON.stringify(stored).includes("ghp_"), "raw canary must never be persisted");
      assert.equal(await store.get({ ...grant(), workspaceId: "other" }, { ...scope, workspaceId: "other" }, job.id), null);
      scans[label] = job.id;
      results.push({ label, commit, scanId: job.id, status: stored.job.status, revision: stored.revision, findings: stored.job.findings.length, bySource: Object.fromEntries([...new Set(stored.job.findings.map((x) => x.source.engine))].map((e) => [e, stored.job.findings.filter((x) => x.source.engine === e).length])), engines: stored.job.runs.filter((r) => engines.includes(r.engine)).map((r) => ({ engine: r.engine, status: r.status, scanner: r.scanner, version: r.version, artifactDigest: r.artifactDigest, cleanup: r.executionEvidence?.cleanup, coverage: r.coverage?.status })), sourceCoverage: stored.job.sourceCoverage, inventory: stored.job.inventory?.length ?? 0, sbom: !!stored.job.sbom, release: stored.job.status, fingerprints: stored.job.findings.map((x) => x.id).sort() });
    }
    const v = results[0] as { findings: number; fingerprints: string[]; engines: { status: string }[] }, x = results[1] as { findings: number; fingerprints: string[] };
    assert(v.findings > 0, "vulnerable revision must produce real findings");
    console.log(JSON.stringify({ phase: "scan_results", results: results.map((r) => ({ ...r, fingerprints: undefined })) }));
    assert(v.engines.every((e) => e.status === "completed"), "every engine must complete on the vulnerable revision: " + JSON.stringify(v.engines));
    const remaining = x.fingerprints.filter((id) => v.fingerprints.includes(id));
    assert.equal(remaining.length, 0, "no vulnerable finding may persist in the fixed revision");
    // Triage + report on the vulnerable scan, then prove persistence across a PostgreSQL restart.
    const artifacts = new PostgresGuardArtifacts(f.db.app);
    const sv = (await store.get(grant(), scope, scans.vulnerable))!;
    await artifacts.triage(grant(), scope, scans.vulnerable, { revision: sv.revision, findingId: sv.job.findings[0].id, status: "under_review", reason: "Acceptance triage" });
    const config = f.config("app"); await f.restart();
    const pool = new ApprovedPool(config), db = new PlatformDatabase(pool, false, "guard"), fresh = new PostgresGuardStore(db, repositoryScanKind);
    for (let n = 0; ; n++) { try { await fresh.get(grant(), scope, scans.vulnerable); break; } catch (e) { if (n > 60) throw e; await new Promise((r) => setTimeout(r, 1000)); } }
    for (const r of results) { const s = (await fresh.get(grant(), scope, (r as { scanId: string }).scanId))!; assert.equal(s.job.findings.length, (r as { findings: number }).findings); }
    await pool.end();
    const out = { classification: "REAL_GITHUB_SOURCE_REAL_SCANNERS_ISOLATED_POSTGRES_NOT_PRODUCT_AUTH_NOT_OPERATIONAL_DB", repository: info.fullName, repositoryId: info.repositoryId, private: true, postgresRestartVerified: true, resolvedByFix: v.fingerprints.length - remaining.length, results };
    await mkdir("test-results", { recursive: true });
    await writeFile("test-results/g02-github-acceptance." + f.runId + ".json", JSON.stringify(out, null, 2), { flag: "wx" });
    console.log(JSON.stringify({ phase: "acceptance_PASS", file: "test-results/g02-github-acceptance." + f.runId + ".json", summary: results.map((r) => ({ label: (r as { label: string }).label, findings: (r as { findings: number }).findings, status: (r as { status: string }).status })) }));
  } finally {
    await f.destroy().catch((e) => console.error("fixture_destroy_failed", e instanceof Error ? e.message : e));
  }
}
const mode = process.argv[2];
(mode === "prepare" ? prepare() : mode === "run" ? run() : Promise.reject(new Error("usage: prepare|run"))).catch((e) => {
  console.error(JSON.stringify({ phase: "acceptance_STOP", name: e?.name, reason: e?.message, at: String(e?.stack ?? "").split("\n").slice(1, 4).join(" | ") }));
  process.exitCode = 1;
});
