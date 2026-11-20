import "server-only";
import { fingerprint } from "../../../platform/identity";
import type { ScanJob } from "../contracts";
import { authorize } from "../security";
import { report, escapeHtml } from "../release";
import { guidance } from "../evidence";
import { evidenceIdentity } from "../live/product-remediation";
import { releasePolicy } from "../live/product-view";
import type { ProjectAuthority } from "../live/model";
import { validGuardBranch } from "../live/revision";
import {
  G03Error,
  type Advice,
  type G03State,
  type Proposal,
  type Retest,
  type SourceFile,
} from "./contracts";
import { inputText, isSha, object, patchPath, safeValue } from "./safety";
import { makePatch, verifyPatch } from "./patch";
import { providerContext, type ProviderPort } from "./provider";
import type { SourcePort } from "./source";
import type { GithubPort } from "./github";
import { stateFor, type StorePort } from "./store";
import { compareTargeted, realFinding } from "./retest";

export interface ScannerPort {
  enqueue(
    authority: ProjectAuthority,
    input: {
      branch: string;
      commit: string;
      engine: ScanJob["requestedEngines"][number];
      idempotencyKey: string;
    },
    signal: AbortSignal,
  ): Promise<{ scanId: string }>;
  get(authority: ProjectAuthority, scanId: string): Promise<ScanJob>;
}
interface Dependencies {
  store: StorePort;
  source: SourcePort;
  provider: ProviderPort;
  github: GithubPort;
  scanner: ScannerPort;
  revalidate(): Promise<ProjectAuthority>;
}
const at = () => new Date().toISOString();
function audit(
  s: G03State,
  a: ProjectAuthority,
  action: string,
  subjectId: string,
  reason: string,
) {
  s.audit.push({
    actorId: a.grant.actorId,
    at: at(),
    action,
    subjectId,
    reason,
  });
}
function observeRetest(t: Retest) {
  if ((t.observations?.length ?? 0) >= 20)
    throw new G03Error("retest_observation_limit", 429);
  t.observations = [
    ...(t.observations ?? []),
    {
      at: at(),
      outcome: t.outcome,
      evidenceOutcome: t.evidenceOutcome,
      verifiedFixed: t.verifiedFixed,
      reason: t.reason,
      afterCommit: t.afterCommit,
    },
  ];
}
function proposal(s: G03State, id: unknown) {
  const p = s.proposals.find((p) => p.id === id);
  if (!p) throw new G03Error("proposal_not_found", 404);
  return p;
}
const revision = (v: unknown) => {
  if (!Number.isSafeInteger(v) || Number(v) < 1)
    throw new G03Error("invalid_input", 400);
  return v as number;
};
export class G03Service {
  constructor(private readonly d: Dependencies) {}
  private async fresh(a: ProjectAuthority) {
    const f = await this.d.revalidate();
    authorize(f.grant, a.grant, "triage");
    if (
      f.repositoryId !== a.repositoryId ||
      f.repositoryName !== a.repositoryName ||
      f.installationId !== a.installationId ||
      f.userId !== a.userId ||
      f.grant.actorId !== a.grant.actorId
    )
      throw new G03Error("authorization_changed", 404);
    return f;
  }
  private plan() {
    try {
      return this.d.provider.plan();
    } catch {
      return null;
    }
  }
  async state(a: ProjectAuthority, id: string) {
    const snapshot = await this.d.store.get(a, id),
      s = stateFor(snapshot.job),
      plan = this.plan();
    return safeValue({
      revision: snapshot.revision,
      baseCommit: snapshot.job.repository.commit,
      provider: {
        requestEnabled: !!plan,
        successfulResponseRecorded:
          !!plan &&
          s.proposals.some(
            (p) =>
              p.state === "completed" &&
              !!p.providerResult &&
              fingerprint(p.consent.plan) === fingerprint(plan),
          ),
        plan,
        planDigest: plan ? fingerprint(plan) : null,
      },
      githubWritesEnabled: this.d.github.enabled,
      proposals: s.proposals,
      retests: s.retests,
      reports: s.reports.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        sourceRevision: r.sourceRevision,
      })),
      audit: s.audit,
    });
  }
  async context(
    a: ProjectAuthority,
    id: string,
    value: unknown,
    signal: AbortSignal,
  ) {
    const v = object(value, [
      "revision",
      "findingId",
      "baseCommit",
      "path",
      "sourceConsent",
    ]);
    if (v.sourceConsent !== true)
      throw new G03Error("source_consent_required", 403);
    const snapshot = await this.d.store.get(a, id),
      finding = realFinding(snapshot.job, inputText(v.findingId, 64));
    if (
      v.baseCommit !== snapshot.job.repository.commit ||
      v.path !== finding.location.path
    )
      throw new G03Error("source_scope_mismatch");
    const file = await this.d.source.read(
      a,
      snapshot.job.repository.branch,
      snapshot.job.repository.commit,
      patchPath(inputText(v.path)),
      signal,
    );
    const fresh = await this.fresh(a);
    const result = await this.d.store.change(
      fresh,
      id,
      revision(v.revision),
      "triage",
      (_snap, s) => {
        audit(
          s,
          fresh,
          "source_context_reviewed",
          finding.id,
          "Explicit permission to read only the finding file at the pinned branch HEAD. Redacted neighborhood preview; no AI request.",
        );
        const { content: _, ...binding } = file;
        void _;
        return { binding, context: providerContext(finding, file) };
      },
    );
    return { ...result.value, revision: result.revision };
  }
  async generate(
    a: ProjectAuthority,
    id: string,
    value: unknown,
    signal: AbortSignal,
  ) {
    const v = object(value, [
      "revision",
      "findingId",
      "requestKey",
      "aiConsent",
      "sourceConsent",
      "path",
      "baseCommit",
      "sourceSha256",
      "planDigest",
    ]);
    const rev = revision(v.revision);
    if (
      typeof v.aiConsent !== "boolean" ||
      typeof v.sourceConsent !== "boolean" ||
      !/^g03-[A-Za-z0-9_-]{8,80}$/.test(String(v.requestKey)) ||
      (!v.aiConsent && v.sourceConsent)
    )
      throw new G03Error("invalid_consent", 400);
    const snapshot = await this.d.store.get(a, id),
      f = realFinding(snapshot.job, inputText(v.findingId, 64));
    if (v.baseCommit !== snapshot.job.repository.commit)
      throw new G03Error("stale_commit");
    const { revision: _, ...request } = v;
    void _;
    const requestSha256 = fingerprint(request),
      s = stateFor(snapshot.job);
    const existing = s.proposals.find((p) => p.requestKey === v.requestKey);
    if (existing) {
      if (
        existing.requestSha256 !== requestSha256 ||
        existing.actorId !== a.grant.actorId
      )
        throw new G03Error("request_key_conflict");
      return {
        proposalId: existing.id,
        state: existing.state,
        revision: snapshot.revision,
        reused: true,
      };
    }
    const plan = v.aiConsent ? this.d.provider.plan() : null;
    if (v.planDigest !== (plan ? fingerprint(plan) : null))
      throw new G03Error("provider_plan_changed");
    let file: SourceFile | undefined;
    if (v.sourceConsent) {
      if (v.path !== f.location.path || !isSha(v.sourceSha256, 64))
        throw new G03Error("source_consent_required", 403);
      file = await this.d.source.read(
        a,
        snapshot.job.repository.branch,
        snapshot.job.repository.commit,
        patchPath(inputText(v.path)),
        signal,
      );
      if (file.sourceSha256 !== v.sourceSha256)
        throw new G03Error("stale_source");
    } else if (v.path !== null || v.sourceSha256 !== null)
      throw new G03Error("invalid_consent", 400);
    const fresh = await this.fresh(a),
      now = at();
    const { content: discard, ...binding } = file ?? ({} as SourceFile);
    void discard;
    const record: Proposal = {
      version: 1,
      id: fingerprint([a.grant.workspaceId, id, v.requestKey]),
      requestKey: String(v.requestKey),
      requestSha256,
      findingId: f.id,
      evidenceSha256: evidenceIdentity(f),
      baseCommit: snapshot.job.repository.commit,
      binding: file ? binding : null,
      actorId: fresh.grant.actorId,
      createdAt: now,
      state: "reserved",
      consent: {
        ai: v.aiConsent,
        source: v.sourceConsent,
        path: file?.path ?? null,
        at: now,
        plan,
      },
    };
    await this.d.store.change(
      fresh,
      id,
      rev,
      "triage",
      (snap, state) => {
        if (
          state.proposals.length >= 12 ||
          state.proposals.some((p) => p.requestKey === v.requestKey)
        )
          throw new G03Error("proposal_limit", 429);
        if (
          evidenceIdentity(realFinding(snap.job, f.id)) !==
          record.evidenceSha256
        )
          throw new G03Error("evidence_changed");
        state.proposals.push(record);
        audit(
          state,
          fresh,
          "remediation_request_reserved",
          record.id,
          plan
            ? "Explicit AI consent, exact source scope and worst-case token/cost budget reserved; one attempt, zero retries."
            : "AI disabled. Deterministic guidance requested without source disclosure.",
        );
        return record.id;
      },
      plan ?? undefined,
    );
    let result:
      | {
          advice: Advice;
          patch?: Proposal["patch"];
          providerResult?: Proposal["providerResult"];
        }
      | undefined;
    let failure = "provider_unavailable";
    try {
      if (plan) {
        signal.throwIfAborted();
        const context = providerContext(f, file);
        const r = await this.d.provider.generate(context, signal);
        result = {
          advice: r.advice,
          providerResult: {
            responseId: r.responseId,
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
          },
        };
        if (r.edit && !file) throw new G03Error("source_consent_required", 403);
        if (r.edit && file) {
          if (context.sourceRedacted) throw new G03Error("sensitive_content");
          result.patch = makePatch(file, f, r.edit);
        }
      } else
        result = {
          advice: {
            explanation: `Scanner ${f.source.scanner} reported ${f.source.ruleId} at the recorded location.`,
            rootCause:
              "Exact root cause requires human review of the authorized source.",
            recommendation: guidance(f),
            securityConsequences:
              "This scanner finding remains unresolved until evidence proves remediation.",
            compatibilityRisks:
              "No source analysis or repository behavioral tests were performed.",
            verification:
              "Run the relevant G02 scanner on an explicitly authorized changed revision.",
            alternative:
              "Review and fix the finding manually with the repository owner.",
          },
        };
    } catch (error) {
      result = undefined;
      if (
        error instanceof G03Error &&
        [
          "patch_not_minimal",
          "patch_ambiguous",
          "patch_outside_scope",
          "patch_disables_security",
          "unsafe_patch_change",
          "patch_syntax_invalid",
          "sensitive_content",
          "provider_output_invalid",
          "source_consent_required",
        ].includes(error.code)
      )
        failure = error.code;
    }
    const current = await this.fresh(a);
    const finished = await this.d.store.change(
      current,
      id,
      null,
      "triage",
      (snap, state) => {
        const p = proposal(state, record.id);
        if (
          p.state !== "reserved" ||
          p.actorId !== current.grant.actorId ||
          p.evidenceSha256 !==
            evidenceIdentity(realFinding(snap.job, p.findingId))
        )
          throw new G03Error("proposal_changed");
        p.state = result ? "completed" : "failed";
        if (result) Object.assign(p, safeValue(result));
        else p.failure = failure;
        audit(
          state,
          current,
          "remediation_" + p.state,
          p.id,
          result
            ? "Untrusted versioned advice stored. Patch is a proposal only; no repository write and no verification."
            : "Attempt failed or unavailable. Reservation remains charged; no retry, provider body or sensitive output stored.",
        );
        return { proposalId: p.id, state: p.state };
      },
    );
    return { ...finished.value, revision: finished.revision, reused: false };
  }
  async review(
    a: ProjectAuthority,
    id: string,
    value: unknown,
    signal: AbortSignal,
  ) {
    const v = object(value, [
      "revision",
      "proposalId",
      "patchDigest",
      "decision",
      "reason",
    ]);
    if (!["approved", "rejected"].includes(String(v.decision)))
      throw new G03Error("invalid_input", 400);
    const reason = inputText(v.reason);
    if (reason.trim().length < 8)
      throw new G03Error("review_reason_required", 400);
    const snap = await this.d.store.get(a, id),
      p = proposal(stateFor(snap.job), v.proposalId);
    if (
      !p.patch ||
      p.patch.digest !== v.patchDigest ||
      p.state !== "completed" ||
      p.review
    )
      throw new G03Error("patch_review_conflict");
    if (v.decision === "approved") {
      const file = await this.d.source.read(
        a,
        p.patch.branch,
        p.baseCommit,
        p.patch.path,
        signal,
      );
      verifyPatch(file, realFinding(snap.job, p.findingId), p.patch);
    }
    const fresh = await this.fresh(a);
    return this.d.store.change(
      fresh,
      id,
      revision(v.revision),
      "triage",
      (_snap, s) => {
        const record = proposal(s, p.id);
        if (record.review) throw new G03Error("patch_review_conflict");
        record.review = {
          decision: v.decision as "approved" | "rejected",
          actorId: fresh.grant.actorId,
          at: at(),
          reason: safeValue(reason),
          patchDigest: p.patch!.digest,
        };
        audit(
          s,
          fresh,
          "patch_reviewed",
          p.id,
          `Patch ${record.review.decision}: ${record.review.reason}. Review grants no GitHub write permission.`,
        );
        return { proposalId: p.id, review: record.review };
      },
    );
  }
  async publish(
    a: ProjectAuthority,
    id: string,
    value: unknown,
    signal: AbortSignal,
  ) {
    const v = object(value, [
      "revision",
      "proposalId",
      "patchDigest",
      "repositoryId",
      "baseCommit",
      "writeConsent",
    ]);
    if (v.writeConsent !== true || v.repositoryId !== a.repositoryId)
      throw new G03Error("repository_write_consent_required", 403);
    const snap = await this.d.store.get(a, id),
      p = proposal(stateFor(snap.job), v.proposalId);
    if (
      !p.patch ||
      p.state !== "completed" ||
      p.review?.decision !== "approved" ||
      p.review.patchDigest !== p.patch.digest ||
      p.patch.digest !== v.patchDigest ||
      p.baseCommit !== v.baseCommit ||
      p.pr
    )
      throw new G03Error("pr_approval_required", 403);
    const file = await this.d.source.read(
      a,
      p.patch.branch,
      p.baseCommit,
      p.patch.path,
      signal,
    );
    const content = verifyPatch(
      file,
      realFinding(snap.job, p.findingId),
      p.patch,
    );
    await this.d.github.permission(a, file.branch, signal);
    const fresh = await this.fresh(a);
    const reserved = await this.d.store.change(
      fresh,
      id,
      revision(v.revision),
      "triage",
      (_snap, s) => {
        const r = proposal(s, p.id);
        if (r.pr) throw new G03Error("pr_already_reserved");
        r.pr = {
          state: "reserved",
          branch: "wetscan/g03-" + p.id.slice(0, 32),
          actorId: fresh.grant.actorId,
          approvedAt: at(),
          patchDigest: p.patch!.digest,
        };
        audit(
          s,
          fresh,
          "github_pr_write_approved",
          p.id,
          `Explicit owner approval for repository ${a.repositoryId}, base ${p.baseCommit}, patch ${p.patch!.digest}, dedicated branch ${r.pr.branch}, one draft PR. No retry, force push, default-branch write or merge.`,
        );
        return structuredClone(r);
      },
    );
    let published: Awaited<ReturnType<GithubPort["publish"]>> | undefined;
    try {
      published = await this.d.github.publish(
        await this.fresh(a),
        reserved.value,
        file,
        content,
        signal,
      );
    } catch {
      /* Unknown writes must never be retried automatically. */
    }
    const current = await this.fresh(a);
    return this.d.store.change(current, id, null, "triage", (_snap, s) => {
      const r = proposal(s, p.id);
      if (!r.pr || r.pr.state !== "reserved")
        throw new G03Error("pr_state_conflict");
      if (published) Object.assign(r.pr, published, { checkedAt: at() });
      else r.pr.state = "unknown";
      audit(
        s,
        current,
        published ? "github_pr_recorded" : "github_pr_outcome_unknown",
        r.id,
        published
          ? `Finding → proposal → draft PR ${published.number}; review and retest still required.`
          : "GitHub write outcome unknown; reservation consumed. Use read-only status reconciliation; do not publish again.",
      );
      return r.pr;
    });
  }
  async prStatus(
    a: ProjectAuthority,
    id: string,
    value: unknown,
    signal: AbortSignal,
  ) {
    const v = object(value, ["revision", "proposalId"]),
      snap = await this.d.store.get(a, id),
      p = proposal(stateFor(snap.job), v.proposalId);
    if (!p.pr) throw new G03Error("pr_not_requested");
    const observed = await this.d.github.status(a, p, signal),
      fresh = await this.fresh(a);
    return this.d.store.change(
      fresh,
      id,
      revision(v.revision),
      "triage",
      (_snap, s) => {
        const r = proposal(s, p.id);
        if (observed) Object.assign(r.pr!, observed, { checkedAt: at() });
        for (const t of s.retests.filter(
          (t) =>
            t.proposalId === p.id &&
            t.verifiedFixed &&
            observed &&
            ![observed.headCommit, observed.mergeCommit].includes(
              t.afterCommit,
            ),
        )) {
          t.invalidatedAt = at();
          t.verifiedFixed = false;
          t.outcome = "not_verified";
          t.evidenceOutcome = "not_verified";
          t.reason =
            "PR revision changed; historical evidence is retained but no longer verifies the current revision.";
          observeRetest(t);
        }
        audit(
          s,
          fresh,
          "github_pr_status_checked",
          p.id,
          observed
            ? `Observed ${observed.state} at ${observed.headCommit}.`
            : "No matching PR found; unknown write reservation preserved.",
        );
        return r.pr;
      },
    );
  }
  async startRetest(
    a: ProjectAuthority,
    id: string,
    value: unknown,
    signal: AbortSignal,
  ) {
    const v = object(value, [
      "revision",
      "proposalId",
      "afterCommit",
      "branch",
      "retestConsent",
    ]);
    if (
      v.retestConsent !== true ||
      !isSha(v.afterCommit) ||
      !validGuardBranch(v.branch)
    )
      throw new G03Error("retest_consent_required", 403);
    const snap = await this.d.store.get(a, id),
      p = proposal(stateFor(snap.job), v.proposalId),
      f = realFinding(snap.job, p.findingId);
    if (
      !p.patch ||
      p.review?.decision !== "approved" ||
      v.afterCommit === p.baseCommit ||
      ![p.binding?.branch, p.pr?.branch].includes(String(v.branch))
    )
      throw new G03Error("retest_target_invalid");
    const source = await this.d.source.read(
      a,
      String(v.branch),
      v.afterCommit,
      p.patch.path,
      signal,
    );
    if (source.sourceSha256 !== p.patch.afterSha256)
      throw new G03Error("retest_patch_mismatch");
    const fresh = await this.fresh(a);
    const target: Retest = {
      id: fingerprint([p.id, v.afterCommit, v.branch]),
      proposalId: p.id,
      findingId: p.findingId,
      actorId: fresh.grant.actorId,
      beforeCommit: p.baseCommit,
      afterCommit: v.afterCommit,
      targetBranch: String(v.branch),
      engine: f.source.engine,
      createdAt: at(),
      state: "reserved",
      outcome: "not_verified",
      evidenceOutcome: "not_verified",
      verifiedFixed: false,
      reason: "Explicit real scanner request reserved; no fix evidence yet.",
    };
    await this.d.store.change(
      fresh,
      id,
      revision(v.revision),
      "triage",
      (_snap, s) => {
        if (s.retests.some((t) => t.id === target.id) || s.retests.length >= 24)
          throw new G03Error("retest_already_reserved");
        s.retests.push(target);
        audit(
          s,
          fresh,
          "targeted_retest_approved",
          target.id,
          `Explicit scanner permission for ${target.engine}, repository ${a.repositoryId}, ${target.targetBranch}@${target.afterCommit}; one idempotent G02 scan, original evidence retained.`,
        );
        return target.id;
      },
    );
    let created: { scanId: string } | undefined;
    try {
      created = await this.d.scanner.enqueue(
        await this.fresh(a),
        {
          branch: target.targetBranch,
          commit: target.afterCommit,
          engine: target.engine,
          idempotencyKey: "g02-live-g03-retest-" + target.id.slice(0, 40),
        },
        signal,
      );
    } catch {
      /* Preserve consumed/unknown reservation. */
    }
    return this.d.store.change(
      await this.fresh(a),
      id,
      null,
      "triage",
      (_snap, s) => {
        const r = s.retests.find((t) => t.id === target.id)!;
        r.state = created ? "queued" : "unknown";
        if (created) r.scanId = created.scanId;
        audit(
          s,
          a,
          "targeted_retest_" + r.state,
          r.id,
          created
            ? `G02 scan ${created.scanId} queued; scanner has not yet proved a fix.`
            : "Scanner admission failed or outcome unknown; no verified fix and no automatic retry.",
        );
        return r;
      },
    );
  }
  async compareRetest(
    a: ProjectAuthority,
    id: string,
    value: unknown,
    signal: AbortSignal,
  ) {
    const v = object(value, ["revision", "retestId"]),
      snap = await this.d.store.get(a, id),
      s = stateFor(snap.job),
      t = s.retests.find((t) => t.id === v.retestId);
    if (!t?.scanId || !["queued", "compared"].includes(t.state))
      throw new G03Error("retest_not_ready");
    const p = proposal(s, t.proposalId),
      after = await this.d.scanner.get(a, t.scanId);
    if (
      !["completed", "completed_partial", "failed", "cancelled"].includes(
        after.status,
      )
    )
      throw new G03Error("retest_not_ready");
    let result: ReturnType<typeof compareTargeted>;
    try {
      const source = await this.d.source.read(
        a,
        t.targetBranch,
        t.afterCommit,
        p.patch!.path,
        signal,
      );
      result = compareTargeted(snap.job, after, p, t, source);
    } catch (error) {
      if (!(error instanceof G03Error) || error.code !== "stale_commit")
        throw error;
      result = {
        outcome: "not_verified",
        evidenceOutcome: "not_verified",
        verifiedFixed: false,
        reason:
          "Target branch moved. Previous evidence applies only to the historical commit; current revision requires a new retest.",
      };
    }
    const fresh = await this.fresh(a);
    return this.d.store.change(
      fresh,
      id,
      revision(v.revision),
      "triage",
      (_snap, state) => {
        const r = state.retests.find((r) => r.id === t.id)!;
        Object.assign(r, result, { state: "compared" });
        if (!result.verifiedFixed && t.verifiedFixed) r.invalidatedAt = at();
        observeRetest(r);
        audit(
          state,
          fresh,
          "targeted_retest_compared",
          r.id,
          `${r.outcome}/${r.evidenceOutcome}: ${r.reason}`,
        );
        return r;
      },
    );
  }
  async createReport(a: ProjectAuthority, id: string, value: unknown) {
    const v = object(value, ["revision"]);
    return this.d.store.change(
      a,
      id,
      revision(v.revision),
      "report",
      (snapshot, s) => {
        if (s.reports.length >= 3) throw new G03Error("report_limit", 413);
        const createdAt = at(),
          expiresAt = new Date(
            Math.min(
              Date.now() + 7 * 86400000,
              Date.parse(snapshot.retentionUntil),
            ),
          ).toISOString();
        const body = safeValue({
          ...report(
            a.grant,
            snapshot.job,
            releasePolicy({
              job: snapshot.job,
              revision: snapshot.revision,
              coverage: null,
            }),
          ),
          g03: { proposals: s.proposals, retests: s.retests, audit: s.audit },
          provenance: {
            schema: "guard-g03-report-v1",
            sourceRevision: snapshot.revision,
          },
          createdAt,
          expiresAt,
          limitations: [
            "AI output is untrusted advice. Syntax checks do not replace repository behavioral tests.",
            "Verified fixed is scoped to the exact real scanner rule and recorded revision; refresh status after a branch changes.",
            "No deployment enforcement before G04. Retention access expires; physical purge is an operator responsibility.",
          ],
        });
        const r = {
          id: fingerprint(body),
          createdAt,
          expiresAt,
          sourceRevision: snapshot.revision,
          body,
        };
        s.reports.push(r);
        audit(
          s,
          a,
          "g03_report_created",
          r.id,
          "Sanitized project-scoped JSON/HTML report persisted; no demo data or deployment-enforcement claim.",
        );
        return { reportId: r.id, expiresAt };
      },
    );
  }
  async exportReport(a: ProjectAuthority, id: string, value: unknown) {
    const v = object(value, ["revision", "reportId", "format"]);
    if (!["json", "html"].includes(String(v.format)))
      throw new G03Error("invalid_input", 400);
    const r = await this.d.store.change(
      a,
      id,
      revision(v.revision),
      "report",
      (_snap, s) => {
        const r = s.reports.find((r) => r.id === v.reportId);
        if (!r || Date.parse(r.expiresAt) <= Date.now())
          throw new G03Error("report_expired", 404);
        audit(
          s,
          a,
          "g03_report_downloaded",
          r.id,
          "Authorized " +
            String(v.format) +
            " download of the persisted report.",
        );
        return r;
      },
    );
    const json = JSON.stringify(safeValue(r.value.body), null, 2);
    return {
      body:
        v.format === "json"
          ? json
          : `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Guard remediation evidence</title><style>body{font:16px system-ui;max-width:1100px;margin:2rem auto;padding:1rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><h1>Guard remediation evidence</h1><p>Recorded scanner evidence, advice, human reviews and limitations.</p><pre>${escapeHtml(json)}</pre></body></html>`,
      format: v.format as "json" | "html",
      reportId: r.value.id,
    };
  }
}
