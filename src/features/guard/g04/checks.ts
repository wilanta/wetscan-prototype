import type { Decision, PolicyEvaluation, SecurityPolicy } from "./policy";
import { GhError, revokeToken, type GhTransport, type InstallationTokens } from "./github";

export const CHECK_NAME = "WetScan Guard / Security gate";
export type CheckStatus = "queued" | "in_progress" | "completed";
export type CheckConclusion = "success" | "neutral" | "failure" | "action_required" | "cancelled";

/**
 * GitHub treats success, neutral and skipped as PASSING for a required check; failure, action_required, cancelled,
 * timed_out and stale as not passing. PASS/WARN therefore never block a merge; BLOCK and INCOMPLETE always do.
 * There is no path from INCOMPLETE (or a missing scan) to a passing conclusion.
 */
export function conclusionFor(decision: Decision, policy: Pick<SecurityPolicy, "warnConclusion" | "incompleteConclusion">): CheckConclusion {
  switch (decision) {
    case "PASS":
      return "success";
    case "WARN":
      return policy.warnConclusion;
    case "BLOCK":
      return "failure";
    case "INCOMPLETE":
      return policy.incompleteConclusion;
  }
}
export const passesRequiredCheck = (c: CheckConclusion) => c === "success" || c === "neutral";

export interface CheckOutput {
  title: string;
  summary: string;
  text?: string;
  annotations?: { path: string; start_line: number; end_line: number; annotation_level: "failure" | "warning"; title: string; message: string }[];
}
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
/** Summary is for people: decision, exact commit, coverage and counts. It never contains source excerpts or secrets. */
export function outputFor(e: PolicyEvaluation, opts: { detailsUrl?: string; findings?: { severity: string; title: string; path?: string; line?: number; ruleId: string }[]; remediation?: string }): CheckOutput {
  const c = e.counts;
  const lines = [
    `**Decision: ${e.decision}** for commit \`${e.commit.slice(0, 12)}\` (policy revision ${e.policyRevision}).`,
    "",
    ...e.reasons.map((r) => "- " + r.message),
    "",
    `| Critical | High | Medium | Low | Info |\n|---|---|---|---|---|\n| ${c.critical} | ${c.high} | ${c.medium} | ${c.low} | ${c.info} |`,
    "",
    `Required engines: ${e.coverage.required.join(", ") || "none"}. Completed: ${e.coverage.completed.join(", ") || "none"}.` + (e.coverage.missing.length ? ` **Missing:** ${e.coverage.missing.join(", ")}.` : "") + (e.coverage.partial.length ? ` **Partial:** ${e.coverage.partial.join(", ")}.` : "") + ` Source coverage: ${e.coverage.source}.`,
    "",
    "This is a policy evaluation of the configured scanners on this exact commit. It is not a guarantee of security.",
    opts.remediation ?? "Remediation and retest integration: pending (not connected).",
    ...(opts.detailsUrl ? ["", `Evidence: ${opts.detailsUrl}`] : []),
  ];
  const annotations = (opts.findings ?? [])
    .filter((f) => f.path && f.line && /^[A-Za-z0-9_./@+-]{1,300}$/.test(f.path) && !f.path.includes(".."))
    .slice(0, 50)
    .map((f) => ({ path: f.path as string, start_line: f.line as number, end_line: f.line as number, annotation_level: (["critical", "high"].includes(f.severity) ? "failure" : "warning") as "failure" | "warning", title: cut(`${f.severity.toUpperCase()}: ${f.ruleId}`, 255), message: cut(f.title, 2000) }));
  return { title: `${e.decision}: ${e.counts.blocking} blocking, ${e.counts.warning} warning`, summary: cut(lines.join("\n"), 60000), ...(annotations.length ? { annotations } : {}) };
}
export function pendingOutput(commit: string, detail: string): CheckOutput {
  return { title: detail, summary: `Guard security gate for commit \`${commit.slice(0, 12)}\`: ${detail}.\n\nNo security conclusion exists yet; this check does not pass until the scan completes.` };
}

export interface CheckTarget {
  installationId: number;
  repositoryId: string;
  repositoryName: string;
  commit: string;
}
export interface PublishedCheck {
  checkRunId: string;
  htmlUrl: string | null;
}
/** Failure categories persisted by the service. `retryAfterMs` is set for rate limits so the dispatcher can back off. */
export type CheckFailure = "permission_denied" | "rate_limited" | "unavailable" | "not_found" | "unauthorized" | "validation";

export class GithubChecks {
  constructor(
    private readonly transport: GhTransport,
    private readonly tokens: InstallationTokens,
    private readonly appId: number,
  ) {}
  /** Token with exactly the permissions this write needs; revoked immediately afterwards. */
  private async withToken<T>(t: CheckTarget, work: (token: string) => Promise<T>): Promise<T> {
    const access = await this.tokens(t.installationId, t.repositoryId, { checks: "write", metadata: "read" });
    // The installation may have been granted less than requested only if GitHub silently narrowed it: verify, never assume.
    if (access.permissions.checks !== "write") {
      await revokeToken(this.transport, access.token);
      throw new GhError("permission_denied", 403);
    }
    try {
      return await work(access.token);
    } finally {
      await revokeToken(this.transport, access.token);
    }
  }
  /** Idempotent: reuses this App's existing check of the same name on the same commit instead of creating duplicates. */
  async upsert(t: CheckTarget, input: { externalId: string; status: CheckStatus; conclusion?: CheckConclusion; output: CheckOutput; detailsUrl?: string; existingId?: string }): Promise<PublishedCheck> {
    return this.withToken(t, async (token) => {
      const base = `/repos/${t.repositoryName}`;
      let id = input.existingId;
      if (!id) {
        const listed = (await this.transport("GET", `${base}/commits/${t.commit}/check-runs?check_name=${encodeURIComponent(CHECK_NAME)}&app_id=${this.appId}&per_page=10`, token)).json as { check_runs?: { id: number; external_id?: string }[] } | null;
        id = String((listed?.check_runs ?? []).find((r) => r.external_id === input.externalId)?.id ?? "") || undefined;
      }
      const body = {
        name: CHECK_NAME,
        head_sha: t.commit,
        external_id: input.externalId,
        status: input.status,
        ...(input.detailsUrl ? { details_url: input.detailsUrl } : {}),
        ...(input.status === "completed" ? { conclusion: input.conclusion, completed_at: new Date().toISOString() } : {}),
        ...(input.status === "in_progress" ? { started_at: new Date().toISOString() } : {}),
        output: input.output,
      };
      const r = id ? await this.transport("PATCH", `${base}/check-runs/${id}`, token, body) : await this.transport("POST", `${base}/check-runs`, token, body);
      const j = r.json as { id?: number; html_url?: string } | null;
      if (!j || !Number.isSafeInteger(j.id)) throw new GhError("unavailable", 502);
      return { checkRunId: String(j.id), htmlUrl: typeof j.html_url === "string" && j.html_url.startsWith("https://github.com/") ? j.html_url : null };
    });
  }
  /**
   * Independent, read-only observation of whether the branch REQUIRES the Guard check (rulesets, then classic protection).
   * Publishing a check does not enforce anything; only this observation (or a real blocked merge) shows enforcement.
   * Guard never changes repository rules.
   */
  async requiredChecks(t: Omit<CheckTarget, "commit">, branch: string): Promise<{ observable: boolean; requiresGuardCheck: boolean | null; sources: { rulesets: "required" | "not_required" | "unreadable"; classic: "required" | "not_required" | "not_observable" } }> {
    const read = async (permissions: Record<string, "read" | "write">, path: string) => {
      const access = await this.tokens(t.installationId, t.repositoryId, permissions);
      try {
        return (await this.transport("GET", path, access.token)).json;
      } finally {
        await revokeToken(this.transport, access.token);
      }
    };
    const base = `/repos/${t.repositoryName}`;
    let rulesets: "required" | "not_required" | "unreadable" = "unreadable",
      classic: "required" | "not_required" | "not_observable" = "not_observable";
    try {
      const rules = (await read({ metadata: "read" }, `${base}/rules/branches/${encodeURIComponent(branch)}`)) as { type?: string; parameters?: { required_status_checks?: { context: string }[] } }[] | null;
      rulesets = (rules ?? []).some((r) => r.type === "required_status_checks" && (r.parameters?.required_status_checks ?? []).some((c) => c.context === CHECK_NAME)) ? "required" : "not_required";
    } catch (e) {
      if (!(e instanceof GhError)) throw e;
    }
    try {
      const j = (await read({ metadata: "read", administration: "read" }, `${base}/branches/${encodeURIComponent(branch)}/protection/required_status_checks`)) as { contexts?: string[]; checks?: { context: string }[] } | null;
      classic = [...(j?.contexts ?? []), ...(j?.checks ?? []).map((c) => c.context)].includes(CHECK_NAME) ? "required" : "not_required";
    } catch (e) {
      if (!(e instanceof GhError)) throw e;
      if (e.kind === "not_found") classic = "not_required"; // branch has no classic protection
    }
    const observable = rulesets !== "unreadable" || classic !== "not_observable";
    return { observable, requiresGuardCheck: !observable ? null : rulesets === "required" || classic === "required", sources: { rulesets, classic } };
  }
}
