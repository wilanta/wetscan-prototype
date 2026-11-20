import { createHash } from "node:crypto";
import type { ScanJob } from "../contracts";
import type { StoredScan } from "../live/model";
import { GhError } from "./github";
import { CHECK_NAME, conclusionFor, outputFor, pendingOutput, type CheckConclusion, type CheckOutput, type CheckStatus, type GithubChecks } from "./checks";
import { evaluatePolicy, triggerAllowed, type Decision, type SecurityPolicy } from "./policy";
import { assessEnforcement, ProviderError, type DeploymentProvider } from "./provider";
import { nextRun, validateCadence, type Cadence } from "./schedule";
import { G04Error, type G04Store, type PolicyRecord, type TriggerRecord, type Work } from "./store";
import { normalize, type Envelope } from "./webhook";

/** What the dispatcher needs from the G02 scan engine. The real adapter wraps the G02 product host; nothing here scans. */
export interface AccessReport {
  ok: boolean;
  reason?: "installation_suspended" | "repository_not_accessible" | "permissions_missing" | "unavailable" | "rate_limited";
  /** Permissions currently granted to the App installation on this repository. */
  permissions: { contents: boolean; metadata: boolean; checks: boolean };
  retryAfterMs?: number;
}
export interface ScanPort {
  /** Current authorization of the stored owner automation identity: installation active, repository reachable, permissions held. */
  verifyAccess(rec: PolicyRecord): Promise<AccessReport>;
  /** Current head commit of a branch as GitHub reports it (never trusted from a webhook for ordering). */
  branchHead(rec: PolicyRecord, branch: string): Promise<string>;
  /** Idempotent: starts (or finds) the G02 scan for this exact commit/branch/profile/engines. Never runs a scanner in the caller's HTTP context. */
  ensureScan(rec: PolicyRecord, t: TriggerRecord, rerun: number): Promise<{ scanId: string }>;
  readScan(rec: PolicyRecord, scanId: string): Promise<StoredScan | null>;
}
export interface Deps {
  store: G04Store;
  scans: ScanPort;
  checks: GithubChecks;
  appId: number;
  /** Public base URL of the Guard UI for check links (optional). */
  baseUrl?: string;
  provider?: (rec: PolicyRecord) => Promise<{ provider: DeploymentProvider; repositoryId: string } | null>;
  now?: () => number;
}
export const LIMITS = { maxAttempts: 5, leaseMs: 10 * 60_000, maxPending: 50, maxPerHour: 200, scanWaitMs: 45 * 60_000, retryBaseMs: 30_000 };

const checkExternalId = (commit: string) => "g04:" + commit;
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
/** Deliberate rechecks (manual / check rerun) get their own scan identity, derived from the trigger key so repeats stay idempotent. */
export const rerunNumber = (idempotencyKey: string) => Number.parseInt(sha(idempotencyKey).slice(0, 6), 16) % 100000;
const scopeOf = (r: { workspaceId: string; projectId: string }) => ({ workspaceId: r.workspaceId, projectId: r.projectId });
export type IngestResult = { status: 200 | 202 | 409 | 429; outcome: string };

export class G04Service {
  constructor(private readonly d: Deps) {}
  private now = () => (this.d.now ?? Date.now)();
  private url = (projectId: string) => (this.d.baseUrl ? `${this.d.baseUrl}/app/projects/${encodeURIComponent(projectId)}/guard` : undefined);

  // ===================================================================================== webhook intake
  /** Lightweight: validate, authorize against stored policy, persist, enqueue. No scanner, no GitHub call, no long work. */
  async ingest(env: Envelope): Promise<IngestResult> {
    const s = this.d.store;
    let n;
    try {
      n = normalize(env, this.d.appId);
    } catch {
      await s.recordDelivery({ deliveryId: env.deliveryId, event: env.event, action: null, payloadSha256: env.payloadSha256, repositoryId: null, installationId: null });
      await s.finishDelivery(env.deliveryId, "rejected", "malformed_payload");
      return { status: 202, outcome: "rejected" };
    }
    const repositoryId = "repositoryId" in n ? (n.repositoryId ?? null) : null,
      installationId = "installationId" in n ? (n.installationId ?? null) : null;
    const rec = await s.recordDelivery({ deliveryId: env.deliveryId, event: env.event, action: (env.payload as { action?: string }).action ?? null, payloadSha256: env.payloadSha256, repositoryId: repositoryId ?? null, installationId: installationId ?? null });
    if (rec.state === "conflict") {
      await s.audit(null, "github-webhook", "delivery_replay_conflict", env.deliveryId, { event: env.event });
      return { status: 409, outcome: "delivery_conflict" };
    }
    // A redelivery of something already settled is a no-op; one that crashed mid-way or failed is processed again (idempotently).
    if (rec.state === "duplicate" && !["received", "failed"].includes(rec.outcome)) return { status: 200, outcome: "duplicate" };
    try {
      const out = await this.route(env, n);
      await s.finishDelivery(env.deliveryId, out.delivery, out.reason, out.scope);
      return { status: out.status, outcome: out.reason };
    } catch (e) {
      const code = e instanceof G04Error ? e.code : "internal_error";
      await s.finishDelivery(env.deliveryId, "failed", code).catch(() => undefined);
      return { status: code === "ambiguous_route" ? 409 : 429, outcome: code };
    }
  }
  private async route(env: Envelope, n: ReturnType<typeof normalize>): Promise<{ status: 200 | 202 | 429; delivery: "accepted" | "ignored" | "rejected"; reason: string; scope?: { workspaceId: string; projectId: string } }> {
    const s = this.d.store;
    if (n.kind === "ignored") return { status: 200, delivery: "ignored", reason: n.reason };
    if (n.kind === "installation") {
      let touched = 0;
      for (const sc of await s.installationScopes(n.installationId)) {
        const state = n.action === "deleted" ? "deleted" : n.action === "suspend" ? "suspended" : "active";
        if (state === "active" && n.action !== "unsuspend") continue; // created/new_permissions: revalidated lazily on the next scan
        await s.setInstallationState(sc, state);
        if (state !== "active") {
          await s.disableSchedules(sc);
          await s.cancelAllOpen(sc, "installation_" + n.action);
        }
        await s.audit(sc, "github-webhook", "installation_" + n.action, String(n.installationId), {});
        touched++;
      }
      return { status: 200, delivery: "accepted", reason: "installation_" + n.action + ":" + touched };
    }
    if (n.kind === "installation_repositories") {
      for (const id of n.removed) {
        const r = await s.route(id);
        if (!r) continue;
        await s.setInstallationState(r, "repository_removed");
        await s.disableSchedules(r);
        await s.cancelAllOpen(r, "repository_removed");
        await s.audit(r, "github-webhook", "repository_removed_from_installation", id, {});
      }
      return { status: 200, delivery: "accepted", reason: "installation_repositories" };
    }
    const r = await s.route(n.repositoryId);
    if (!r) return { status: 200, delivery: "ignored", reason: "no_policy_for_repository" };
    const scope = scopeOf(r);
    // The delivery's installation must be the one the owner connected; anything else is an ambiguous/foreign claim.
    if (r.installationId !== n.installationId) {
      await s.audit(scope, "github-webhook", "installation_mismatch", env.deliveryId, { expected: r.installationId, got: n.installationId });
      return { status: 202, delivery: "rejected", reason: "installation_mismatch", scope };
    }
    if (r.installationState !== "active") return { status: 200, delivery: "ignored", reason: "installation_" + r.installationState, scope };
    if (n.kind === "pr_closed") {
      const c = await s.cancelPullRequest(scope, n.prNumber);
      await s.audit(scope, "github-webhook", "pull_request_closed", String(n.prNumber), { cancelled: c });
      return { status: 200, delivery: "accepted", reason: "pull_request_closed", scope };
    }
    const pol = await s.getPolicy(scope);
    if (!pol || !triggerAllowed(pol.policy, n.source, n.protectBranch)) return { status: 200, delivery: "ignored", reason: "policy_does_not_match", scope };
    const load = await s.load(scope);
    if (load.pending + load.running >= LIMITS.maxPending || load.lastHour >= LIMITS.maxPerHour) {
      await s.audit(scope, "github-webhook", "rate_limited", env.deliveryId, load);
      return { status: 429, delivery: "rejected", reason: "rate_limited", scope };
    }
    const fork = n.unsupported === "fork_pull_request";
    const ins = await s.insertTrigger(scope, {
      source: n.source,
      deliveryId: env.deliveryId,
      repositoryId: n.repositoryId,
      installationId: n.installationId,
      branch: n.branch,
      protectBranch: n.protectBranch,
      commit: n.commit,
      prNumber: n.prNumber,
      policyRevision: pol.revision,
      idempotencyKey: (n.source === "check_rerun" ? "rerun-" : "wh-") + env.deliveryId,
      actor: "github-app",
      status: fork ? "skipped" : "pending",
      note: fork ? "fork_pull_request_not_scanned" : undefined,
    });
    if (ins.created) {
      await s.audit(scope, "github-webhook", "trigger_enqueued", ins.trigger.id, { source: n.source, commit: n.commit, branch: n.branch, pr: n.prNumber ?? null, superseded: ins.superseded.length });
      // Visible immediately: a required check that never appears would otherwise look like "no gate".
      await s.planCheck(scope, fork ? { commit: n.commit, externalId: checkExternalId(n.commit), status: "completed", conclusion: conclusionFor("INCOMPLETE", pol.policy), decision: "INCOMPLETE", triggerId: ins.trigger.id } : { commit: n.commit, externalId: checkExternalId(n.commit), status: "queued", triggerId: ins.trigger.id });
      for (const old of ins.superseded) await this.supersedeCheck(scope, old, n.commit);
    }
    return { status: 202, delivery: "accepted", reason: ins.created ? "enqueued" : "duplicate_trigger", scope };
  }
  private async supersedeCheck(scope: { workspaceId: string; projectId: string }, triggerId: string, by: string) {
    const t = await this.d.store.getTrigger(scope, triggerId);
    if (!t || t.commit === by) return;
    // planCheck never downgrades a completed check, so a finished verdict for the old commit stays as it was.
    await this.d.store.planCheck(scope, { commit: t.commit, externalId: checkExternalId(t.commit), status: "completed", conclusion: "cancelled", decision: null, triggerId: t.id });
  }

  // ===================================================================================== manual / schedule requests
  /** `rerun` distinguishes a deliberate recheck of the same commit from an idempotent repeat of the same request. */
  async requestScan(scope: { workspaceId: string; projectId: string }, input: { branch: string; commit?: string; idempotencyKey: string; actor: string; source?: "manual" | "schedule"; scheduleId?: string }) {
    const pol = await this.d.store.getPolicy(scope);
    if (!pol) throw new G04Error("not_found", 404);
    if (!triggerAllowed(pol.policy, input.source ?? "manual", input.branch)) throw new G04Error("invalid_input", 422);
    if (pol.installationState !== "active") throw new G04Error("invalid_input", 409);
    const load = await this.d.store.load(scope);
    if (load.pending + load.running >= LIMITS.maxPending || load.lastHour >= LIMITS.maxPerHour) throw new G04Error("limit_exceeded", 429);
    const commit = input.commit ?? (await this.d.scans.branchHead(pol, input.branch));
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new G04Error("invalid_input", 400);
    const ins = await this.d.store.insertTrigger(scope, { source: input.source ?? "manual", scheduleId: input.scheduleId, repositoryId: pol.repositoryId, installationId: pol.installationId, branch: input.branch, protectBranch: input.branch, commit, policyRevision: pol.revision, idempotencyKey: input.idempotencyKey, actor: input.actor });
    if (ins.created) {
      await this.d.store.audit(scope, input.actor, "trigger_enqueued", ins.trigger.id, { source: ins.trigger.source, commit, branch: input.branch });
      await this.d.store.planCheck(scope, { commit, externalId: checkExternalId(commit), status: "queued", triggerId: ins.trigger.id });
      for (const old of ins.superseded) await this.supersedeCheck(scope, old, commit);
    }
    return ins;
  }

  // ===================================================================================== dispatcher
  /** One bounded pass over due work. Safe to run in several processes: every step is claimed atomically in the database. */
  async runOnce(limit = 20): Promise<{ triggers: number; checks: number; schedules: number }> {
    const done = { triggers: 0, checks: 0, schedules: 0 };
    for (const w of await this.d.store.work(limit)) {
      try {
        if (await this.runWork(w)) done[w.kind === "trigger" ? "triggers" : w.kind === "check" ? "checks" : "schedules"]++;
      } catch {
        // One failing project must not stop the others; the failure is already recorded on its own rows.
      }
    }
    return done;
  }
  private runWork(w: Work) {
    const scope = scopeOf(w);
    return w.kind === "trigger" ? this.runTrigger(scope, w.ref) : w.kind === "check" ? this.publishCheck(scope, w.ref) : this.runSchedule(scope, w.ref);
  }

  async runSchedule(scope: { workspaceId: string; projectId: string }, id: string): Promise<boolean> {
    const s = this.d.store,
      sch = await s.getSchedule(scope, id);
    if (!sch?.enabled) return false;
    const cadence: Cadence = validateCadence(sch.cadence),
      slot = Date.parse(sch.nextRunAt);
    // Advance FIRST (atomic): a crash after this point skips one slot instead of firing it twice or storming.
    const claimed = await s.claimSchedule(scope, id, new Date(Math.max(nextRun(cadence, this.now()), this.now() + 60_000)));
    if (!claimed) return false;
    try {
      const pol = await s.getPolicy(scope);
      if (!pol || !pol.policy.enabled || pol.installationState !== "active") {
        await s.scheduleResult(scope, id, "authorization_revoked", null, true, 1);
        return true;
      }
      const access = await this.d.scans.verifyAccess(pol);
      if (!access.ok) {
        await s.scheduleResult(scope, id, "access_" + (access.reason ?? "denied"), null, true);
        return true;
      }
      const head = await this.d.scans.branchHead(pol, claimed.branch);
      const r = await this.requestScan(scope, { branch: claimed.branch, commit: head, idempotencyKey: `sched-${id}-${slot}`, actor: "schedule:" + id, source: "schedule", scheduleId: id });
      await s.scheduleResult(scope, id, r.created ? "enqueued" : "already_enqueued", r.trigger.id, false);
    } catch (e) {
      await s.scheduleResult(scope, id, e instanceof G04Error ? e.code : "failed", null, true);
      await s.audit(scope, "schedule:" + id, "schedule_failed", id, { code: e instanceof G04Error ? e.code : "error" });
    }
    return true;
  }

  async runTrigger(scope: { workspaceId: string; projectId: string }, triggerId: string): Promise<boolean> {
    const s = this.d.store,
      t = await s.claimTrigger(scope, triggerId, LIMITS.leaseMs, LIMITS.maxAttempts);
    if (!t) {
      // A worker that died on its last attempt leaves an expired lease nobody can claim: fail it closed instead of leaving it forever.
      const dead = await s.failExhausted(scope, triggerId, LIMITS.maxAttempts);
      if (dead) {
        await s.planCheck(scope, { commit: dead.commit, externalId: checkExternalId(dead.commit), status: "completed", conclusion: "action_required", decision: "INCOMPLETE", triggerId: dead.id });
        await s.audit(scope, "g04-dispatcher", "trigger_incomplete", dead.id, { reason: "worker_lost_retries_exhausted" });
        await this.publishCheck(scope, dead.commit).catch(() => undefined);
      }
      return !!dead;
    }
    const pol = await s.getPolicy(scope);
    const settle = async (status: "completed" | "failed" | "skipped" | "pending", o: { scanId?: string; error?: string; retryInMs?: number; note?: string } = {}) => s.finishTrigger(scope, t.id, { status, scanId: o.scanId, lastError: o.error, retryInMs: o.retryInMs, note: o.note });
    const incomplete = async (reason: string, note: string) => {
      // The gate must FAIL CLOSED: a trigger that cannot produce a verdict yields an INCOMPLETE check, never silence or success.
      const conclusion: CheckConclusion = pol ? conclusionFor("INCOMPLETE", pol.policy) : "action_required";
      await s.planCheck(scope, { commit: t.commit, externalId: checkExternalId(t.commit), status: "completed", conclusion, decision: "INCOMPLETE", triggerId: t.id });
      await s.audit(scope, "g04-dispatcher", "trigger_incomplete", t.id, { reason });
      await settle("failed", { error: reason, note });
      await this.publishCheck(scope, t.commit).catch(() => undefined);
    };
    try {
      if (!pol || !pol.policy.enabled || pol.installationState !== "active" || !triggerAllowed(pol.policy, t.source, t.protectBranch)) {
        await s.audit(scope, "g04-dispatcher", "trigger_skipped", t.id, { reason: "authorization_or_policy_changed" });
        await settle("skipped", { note: "authorization_or_policy_changed" });
        await s.planCheck(scope, { commit: t.commit, externalId: checkExternalId(t.commit), status: "completed", conclusion: "cancelled", decision: null, triggerId: t.id });
        return true;
      }
      const access = await this.d.scans.verifyAccess(pol);
      if (!access.ok) {
        if (access.reason === "unavailable" || access.reason === "rate_limited") {
          await settle("pending", { error: access.reason, retryInMs: Math.max(access.retryAfterMs ?? 0, backoff(t.attempts)) });
          return true;
        }
        await incomplete("access_" + (access.reason ?? "denied"), "access_revoked_or_permissions_missing");
        return true;
      }
      if (!access.permissions.checks) await s.audit(scope, "g04-dispatcher", "checks_permission_missing", t.id, {}); // scan still runs; the check will fail visibly
      // Exact-commit binding + ordering: a trigger for anything but the branch head is stale by definition.
      if (["push", "schedule", "pull_request"].includes(t.source)) {
        const head = await this.d.scans.branchHead(pol, t.branch);
        if (head !== t.commit) {
          await s.audit(scope, "g04-dispatcher", "trigger_stale", t.id, { commit: t.commit, head });
          await settle("skipped", { note: "not_branch_head" });
          await s.planCheck(scope, { commit: t.commit, externalId: checkExternalId(t.commit), status: "completed", conclusion: "cancelled", decision: null, triggerId: t.id });
          await this.publishCheck(scope, t.commit).catch(() => undefined);
          return true;
        }
      }
      const rerun = t.source === "manual" || t.source === "check_rerun" ? rerunNumber(t.idempotencyKey) : 0;
      const scanId = t.scanId ?? (await this.d.scans.ensureScan(pol, t, rerun)).scanId;
      if (!t.scanId) await s.setScan(scope, t.id, scanId);
      await s.planCheck(scope, { commit: t.commit, externalId: checkExternalId(t.commit), status: "in_progress", triggerId: t.id });
      const scan = await this.d.scans.readScan(pol, scanId);
      if (!scan) throw new G04Error("not_found", 404);
      const terminal = ["completed", "completed_partial", "failed", "cancelled"].includes(scan.job.status);
      if (!terminal) {
        if (this.now() - Date.parse(t.createdAt) > LIMITS.scanWaitMs) {
          await incomplete("scan_timeout", "scan_did_not_finish");
          return true;
        }
        await settle("pending", { scanId, retryInMs: 15_000 });
        await this.publishCheck(scope, t.commit).catch(() => undefined);
        return true;
      }
      const ev = evaluatePolicy(scan.job, pol.policy, { expectedCommit: t.commit, policyRevision: pol.revision });
      const saved = await s.saveEvaluation(scope, { triggerId: t.id, scanId, commit: t.commit, branch: t.branch, policyRevision: pol.revision, decision: ev.decision, evaluation: ev, enforcement: {}, digest: ev.digest });
      // Late-result guard: if a newer revision superseded/cancelled this trigger meanwhile, the verdict is stored but must not publish.
      const still = await settle("completed", { scanId });
      if (!still) {
        await s.audit(scope, "g04-dispatcher", "result_discarded_stale", t.id, { commit: t.commit });
        return true;
      }
      await s.planCheck(scope, { commit: t.commit, externalId: checkExternalId(t.commit), status: "completed", conclusion: conclusionFor(ev.decision, pol.policy), decision: ev.decision, triggerId: t.id, evaluationId: saved.id });
      await s.audit(scope, "g04-dispatcher", "evaluation_recorded", saved.id, { decision: ev.decision, commit: t.commit, policyRevision: pol.revision });
      await this.publishCheck(scope, t.commit).catch(() => undefined);
      await this.refreshEnforcement(scope, pol, saved.id, ev.decision, t.commit).catch(() => undefined);
      return true;
    } catch (e) {
      const code = e instanceof G04Error ? e.code : e instanceof GhError || e instanceof ProviderError ? e.kind : (e as { code?: string }).code ?? "dispatch_error";
      if (t.attempts >= LIMITS.maxAttempts) await incomplete("retries_exhausted:" + String(code).slice(0, 40), "retries_exhausted");
      else await settle("pending", { error: String(code).slice(0, 100), retryInMs: backoff(t.attempts) });
      return true;
    }
  }

  // ===================================================================================== GitHub check publishing
  /** Publishes the durable check intent. Failures are recorded and retried with backoff; the intent is never lost. */
  async publishCheck(scope: { workspaceId: string; projectId: string }, commit: string): Promise<boolean> {
    const s = this.d.store,
      row = await s.getCheck(scope, commit),
      pol = await s.getPolicy(scope);
    if (!row || row.published || !pol) return false;
    const ev = row.evaluationId ? (await s.listEvaluations(scope, 50)).find((e) => e.id === row.evaluationId) : null;
    let output: CheckOutput;
    if (row.status === "completed" && ev) {
      const scan = await this.d.scans.readScan(pol, ev.scanId).catch(() => null);
      output = outputFor(ev.evaluation as Parameters<typeof outputFor>[0], { detailsUrl: this.url(scope.projectId), findings: scan ? scan.job.findings.slice(0, 200).map((f) => ({ severity: f.severity, title: f.title, path: f.location.path, line: f.location.line, ruleId: f.source.ruleId })) : [] });
    } else if (row.status === "completed")
      output = { title: row.conclusion === "cancelled" ? "Superseded or cancelled" : "INCOMPLETE: no verdict", summary: `Guard security gate for commit \`${commit.slice(0, 12)}\`: ${row.conclusion === "cancelled" ? "this revision was superseded by a newer one or its policy no longer applies" : "no security verdict could be produced (" + (row.lastError ?? "see Guard") + ")"}.\n\nThis check does not pass.` };
    else output = pendingOutput(commit, row.status === "queued" ? "Queued" : "Scan in progress");
    try {
      const out = await this.d.checks.upsert({ installationId: pol.installationId, repositoryId: pol.repositoryId, repositoryName: pol.repositoryName, commit }, { externalId: row.externalId, status: row.status as CheckStatus, conclusion: (row.conclusion ?? undefined) as CheckConclusion | undefined, output, detailsUrl: this.url(scope.projectId), existingId: row.checkRunId ?? undefined });
      await s.checkPublished(scope, commit, out);
      await s.audit(scope, "g04-dispatcher", "check_published", out.checkRunId, { commit, status: row.status, conclusion: row.conclusion, name: CHECK_NAME });
      return true;
    } catch (e) {
      const kind = e instanceof GhError ? e.kind : "unavailable";
      await s.checkFailed(scope, commit, kind, e instanceof GhError ? e.retryAfterMs : undefined);
      await s.audit(scope, "g04-dispatcher", "check_publish_failed", commit, { kind });
      return false;
    }
  }
  /** User-initiated, idempotent re-publication of a stuck/failed check without rescanning. */
  async retryCheck(scope: { workspaceId: string; projectId: string }, commit: string, actor: string) {
    const row = await this.d.store.getCheck(scope, commit);
    if (!row) throw new G04Error("not_found", 404);
    await this.d.store.planCheck(scope, { commit, externalId: row.externalId, status: row.status, conclusion: row.conclusion, decision: row.decision, triggerId: row.triggerId, evaluationId: row.evaluationId });
    await this.d.store.audit(scope, actor, "check_retry_requested", commit, {});
    return this.publishCheck(scope, commit);
  }

  /** Live revalidation shown in the UI: current App access + an independent observation of required-check rules per protected branch. */
  async accessView(scope: { workspaceId: string; projectId: string }): Promise<AccessView | null> {
    const pol = await this.d.store.getPolicy(scope);
    if (!pol) return null;
    const access = await this.d.scans.verifyAccess(pol),
      branches = pol.policy.protectedBranches.filter((b) => !b.endsWith("*")).slice(0, 3);
    const requiredChecks = access.ok ? await Promise.all(branches.map((b) => this.d.checks.requiredChecks({ installationId: pol.installationId, repositoryId: pol.repositoryId, repositoryName: pol.repositoryName }, b).catch(() => ({ observable: false, requiresGuardCheck: null, sources: { rulesets: "unreadable" as const, classic: "not_observable" as const } })))) : [];
    return { access, requiredChecks };
  }
  verifyAccess(rec: PolicyRecord) {
    return this.d.scans.verifyAccess(rec);
  }
  /** Reads one deployment from the provider (read-only) and ties it to the stored evaluation of ITS commit, never to "the latest". */
  async verifyDeployment(scope: { workspaceId: string; projectId: string }, deploymentId?: string): Promise<DeploymentView> {
    const s = this.d.store,
      pol = await s.getPolicy(scope);
    if (!pol) throw new G04Error("not_found", 404);
    const mapped = await this.d.provider?.(pol);
    if (!mapped) throw new G04Error("not_found", 404);
    try {
      const info = deploymentId ? await mapped.provider.getDeployment(deploymentId) : ((await mapped.provider.latestDeployments({ target: "production", limit: 1 }))[0] ?? null);
      if (!info) throw new ProviderError("not_found");
      const ev = info.commit ? await s.latestEvaluation(scope, info.commit) : null,
        decision: Decision = ev ? ev.decision : "INCOMPLETE";
      const gate = await mapped.provider.observeGate(CHECK_NAME).catch(() => null);
      const head = await this.d.scans.branchHead(pol, pol.policy.protectedBranches.find((b) => !b.endsWith("*")) ?? "main").catch(() => null);
      const required = await this.d.checks.requiredChecks({ installationId: pol.installationId, repositoryId: pol.repositoryId, repositoryName: pol.repositoryName }, pol.policy.protectedBranches.find((b) => !b.endsWith("*")) ?? "main").catch(() => null);
      const enforcement = assessEnforcement({ decision, commit: info.commit ?? "", github: { checkPublished: !!(info.commit && (await s.getCheck(scope, info.commit))?.published), requiredCheckObserved: required?.requiresGuardCheck ?? null }, deployment: { info, gate, latestCommitOnBranch: head } });
      if (!ev) enforcement.notes.push("No Guard evaluation exists for this deployment's commit: treated as INCOMPLETE.");
      await s.saveDeployment(scope, { provider: "vercel", deploymentId: info.deploymentId, environment: info.environment, commit: info.commit, state: info.state, evaluationId: ev?.id ?? null, decision, info, enforcement, providerError: null });
      await s.audit(scope, "g04-api", "deployment_verified", info.deploymentId, { decision, enforced: enforcement.enforced, level: enforcement.level });
      return { deploymentId: info.deploymentId, commit: info.commit, decision, evaluated: !!ev, enforcement };
    } catch (e) {
      const kind = e instanceof ProviderError ? e.kind : "unavailable";
      await s.audit(scope, "g04-api", "deployment_verify_failed", deploymentId ?? null, { kind });
      throw e instanceof ProviderError ? e : new ProviderError("unavailable");
    }
  }

  // ===================================================================================== deployment verification / enforcement
  /** Read-only against the provider. Records evidence + the separate enforcement assessment; never changes provider state. */
  async refreshEnforcement(scope: { workspaceId: string; projectId: string }, pol: PolicyRecord, evaluationId: string, decision: Decision, commit: string, deploymentId?: string) {
    const s = this.d.store,
      mapped = await this.d.provider?.(pol);
    const required = await this.d.checks.requiredChecks({ installationId: pol.installationId, repositoryId: pol.repositoryId, repositoryName: pol.repositoryName }, pol.policy.protectedBranches.find((b) => !b.endsWith("*")) ?? "main").catch(() => null);
    const github = { checkPublished: !!(await s.getCheck(scope, commit))?.published, requiredCheckObserved: required?.requiresGuardCheck ?? null };
    if (!mapped) {
      const report = assessEnforcement({ decision, commit, github, deployment: null });
      await s.updateEnforcement(scope, evaluationId, { ...report, observedAt: new Date(this.now()).toISOString(), provider: "none", ruleObservation: required });
      return report;
    }
    let info = null,
      gate = null,
      providerError: ProviderError["kind"] | null = null;
    try {
      const latest = deploymentId ? [await mapped.provider.getDeployment(deploymentId)] : (await mapped.provider.latestDeployments({ limit: 10 })).filter((d) => d.commit === commit);
      info = latest.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0] ?? null;
      gate = await mapped.provider.observeGate(CHECK_NAME);
    } catch (e) {
      providerError = e instanceof ProviderError ? e.kind : "unavailable";
    }
    const branchHead = await this.d.scans.branchHead(pol, pol.policy.protectedBranches.find((b) => !b.endsWith("*")) ?? "main").catch(() => null);
    const report = assessEnforcement({ decision, commit, github, deployment: info ? { info, gate, latestCommitOnBranch: branchHead } : null, providerError });
    await s.updateEnforcement(scope, evaluationId, { ...report, observedAt: new Date(this.now()).toISOString(), provider: "vercel", ruleObservation: required });
    if (info) await s.saveDeployment(scope, { provider: "vercel", deploymentId: info.deploymentId, environment: info.environment, commit: info.commit, state: info.state, evaluationId, decision, info, enforcement: report, providerError });
    await s.audit(scope, "g04-dispatcher", "deployment_verified", info?.deploymentId ?? null, { decision, enforced: report.enforced, level: report.level, providerError });
    return report;
  }
}
export interface AccessView {
  access: AccessReport;
  requiredChecks: Awaited<ReturnType<GithubChecks["requiredChecks"]>>[];
}
export interface DeploymentView {
  deploymentId: string;
  commit: string | null;
  decision: Decision;
  evaluated: boolean;
  enforcement: ReturnType<typeof assessEnforcement>;
}
const backoff = (attempts: number) => Math.min(30 * 60_000, LIMITS.retryBaseMs * 2 ** Math.max(0, attempts - 1));
export type { SecurityPolicy, ScanJob };
