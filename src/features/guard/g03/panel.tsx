"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, Notice } from "@/components/ui";
import type { Finding } from "../contracts";
import type { SourceBinding } from "./contracts";
import type { G03Service } from "./service";
type State = Awaited<ReturnType<G03Service["state"]>>;
export function G03Panel({
  projectId,
  scanId,
  revision,
  findings,
  initialFindingId,
  onChanged,
}: {
  projectId: string;
  scanId: string;
  revision: number;
  findings: Finding[];
  initialFindingId?: string;
  onChanged: () => void;
}) {
  const endpoint = `/api/guard/projects/${encodeURIComponent(projectId)}/scans/${scanId}/g03`;
  const [state, setState] = useState<State | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [findingId, setFindingId] = useState(initialFindingId ?? ""),
    [sourceConsent, setSourceConsent] = useState(false),
    [aiConsent, setAiConsent] = useState(false);
  const [context, setContext] = useState<{
      binding: SourceBinding;
      context: unknown;
    } | null>(null),
    [reason, setReason] = useState("");
  const [reviewed, setReviewed] = useState(""),
    [writeConsent, setWriteConsent] = useState("");
  const [afterCommit, setAfterCommit] = useState(""),
    [branch, setBranch] = useState(""),
    [retestConsent, setRetestConsent] = useState(false);
  const selected = findings.find((f) => f.id === findingId) ?? findings[0];
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const r = await fetch(endpoint + "/state", {
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal,
      });
      const b = await r.json();
      if (
        !r.ok ||
        !Array.isArray(b.proposals) ||
        !Array.isArray(b.retests) ||
        !Array.isArray(b.reports) ||
        !Array.isArray(b.audit) ||
        !Number.isSafeInteger(b.revision)
      )
        throw Error("g03_unavailable");
      setState(b);
    },
    [endpoint],
  );
  useEffect(() => {
    const c = new AbortController();
    const timer = setTimeout(() => {
      void load(c.signal).catch(() => {
        if (!c.signal.aborted)
          setError(
            "G03 is not configured or its stored data is unavailable. No AI call, GitHub write or retest was started.",
          );
      });
    }, 0);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [load, revision]);
  async function send(action: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(endpoint + "/" + action, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const b = await r.json();
        throw Error(
          typeof b.error === "string" && /^[a-z_]{1,80}$/.test(b.error)
            ? b.error
            : "g03_unavailable",
        );
      }
      if (action === "export") {
        const blob = await r.blob(),
          url = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = url;
        link.download = `guard-g03-${scanId}.${(body as { format: string }).format}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const b = await r.json();
        if (action === "context")
          setContext({ binding: b.binding, context: b.context });
      }
      await load();
      onChanged();
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : "g03_unavailable"}. The result may be unknown. No automatic retry was sent; refresh stored state before another action.`,
      );
    } finally {
      setBusy(false);
    }
  }
  const rev = state?.revision ?? revision;
  return (
    <section aria-label="AI remediation and verified retest">
      <h3>Source-bound remediation</h3>
      <p>
        Use persisted findings from this repository. AI advice requires consent;
        patch review, GitHub writes and real scanner retests each require a
        separate approval.
      </p>
      {error && <Notice>{error}</Notice>}
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() =>
          void load()
            .then(() => setError(""))
            .catch(() => setError("g03_unavailable"))
        }
      >
        Refresh G03 history
      </Button>
      <label className="field">
        Finding to remediate
        <select
          value={selected?.id ?? ""}
          onChange={(e) => {
            setFindingId(e.target.value);
            setContext(null);
            setSourceConsent(false);
            setAiConsent(false);
          }}
        >
          {findings.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title} — {f.location.path ?? f.source.engine}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <p>
          Base {state?.baseCommit} / {selected.source.scanner}{" "}
          {selected.source.version} / {selected.source.ruleId} /{" "}
          {selected.severityKnown === false
            ? "unknown severity"
            : selected.severity}{" "}
          / confidence {selected.confidence}
        </p>
      )}
      <label className="field">
        <span>
          <input
            type="checkbox"
            checked={sourceConsent}
            onChange={(e) => {
              setSourceConsent(e.target.checked);
              setContext(null);
            }}
          />{" "}
          I authorize reading only{" "}
          {selected?.location.path ?? "the finding file"} at this scan commit
          for a redacted context preview and patch proposal.
        </span>
      </label>
      <Button
        disabled={busy || !state || !selected?.location.path || !sourceConsent}
        onClick={() =>
          void send("context", {
            revision: rev,
            findingId: selected!.id,
            baseCommit: state!.baseCommit,
            path: selected!.location.path,
            sourceConsent: true,
          })
        }
      >
        Review authorized source context
      </Button>
      {context && (
        <details open>
          <summary>Redacted context sent only after AI consent</summary>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {JSON.stringify(context.context, null, 2)}
          </pre>
          <p>Source SHA256 {context.binding.sourceSha256}</p>
        </details>
      )}
      <label className="field">
        <span>
          <input
            type="checkbox"
            checked={aiConsent}
            disabled={!state?.provider.requestEnabled}
            onChange={(e) => setAiConsent(e.target.checked)}
          />{" "}
          I consent to one AI request to{" "}
          {state?.provider.plan?.provider ?? "the configured provider"} /{" "}
          {state?.provider.plan?.model ?? "not configured"}, sharing rule
          metadata
          {context ? " and the redacted source neighborhood above" : " only"}.
          Maximum reserved cost $
          {((state?.provider.plan?.reservedMicroUsd ?? 0) / 1000000).toFixed(4)}
          ; no automatic retry.
        </span>
      </label>
      {selected?.source.engine === "sca" && (
        <p>
          Dependency findings support guidance only. Lockfile, transitive
          version and integrity changes require a manual package-manager review.
        </p>
      )}
      <p>
        Known sensitive patterns are redacted; review the preview before
        consent. Provider retention and sharing follow the approved account
        policy: {state?.provider.plan?.policyVersion ?? "not configured"}. AI
        output is untrusted. No model success is claimed until a response is
        stored.
      </p>
      {state?.provider.requestEnabled &&
        !state.provider.successfulResponseRecorded && (
          <p>
            Provider settings are available. A successful response for this
            model and policy has not been recorded for this scan.
          </p>
        )}
      <Button
        disabled={busy || !state || !selected || (sourceConsent && !context)}
        onClick={() =>
          void send("generate", {
            revision: rev,
            findingId: selected!.id,
            requestKey: "g03-" + crypto.randomUUID(),
            aiConsent,
            sourceConsent: aiConsent && !!context,
            path: aiConsent ? (context?.binding.path ?? null) : null,
            baseCommit: state!.baseCommit,
            sourceSha256: aiConsent
              ? (context?.binding.sourceSha256 ?? null)
              : null,
            planDigest: aiConsent ? state!.provider.planDigest : null,
          })
        }
      >
        {aiConsent
          ? "Generate AI remediation proposal"
          : "Save deterministic guidance (AI off)"}
      </Button>
      <label className="field">
        Patch review reason
        <input
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {(state?.proposals ?? []).map((p) => (
        <article key={p.id}>
          <h4>
            {p.consent.ai ? "AI proposal" : "Deterministic guidance"}: {p.state}
          </h4>
          <p>
            Finding {p.findingId} / proposal {p.id} / base {p.baseCommit} /
            evidence {p.evidenceSha256}
          </p>
          {p.consent.plan && (
            <p>
              {p.consent.plan.provider} / {p.consent.plan.model} / prompt{" "}
              {p.consent.plan.promptVersion} / consent {p.consent.at} by{" "}
              {p.actorId}
            </p>
          )}
          {p.providerResult && (
            <p>
              Provider response {p.providerResult.responseId}; tokens{" "}
              {p.providerResult.inputTokens} in /{" "}
              {p.providerResult.outputTokens} out.
            </p>
          )}
          {p.advice &&
            Object.entries(p.advice).map(([k, v]) => (
              <p key={k}>
                <strong>{k}: </strong>
                {v}
              </p>
            ))}
          {p.failure && <Notice>{p.failure}; no patch was accepted.</Notice>}
          {p.state === "reserved" && (
            <Notice>
              Request outcome is incomplete or unknown. Its budget remains
              consumed; do not retry automatically.
            </Notice>
          )}
          {p.patch && (
            <>
              <h5>Minimal patch preview — {p.patch.path}</h5>
              <pre
                aria-label="Proposed patch diff"
                style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
              >
                {p.patch.diff}
              </pre>
              <p>
                Patch digest {p.patch.digest}. Syntax {p.patch.syntax};
                repository behavioral tests {p.patch.repositoryTests}. Review
                security consequences and compatibility before approval.
              </p>
              {!p.review && (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={reviewed === p.patch.digest}
                      onChange={(e) =>
                        setReviewed(e.target.checked ? p.patch!.digest : "")
                      }
                    />{" "}
                    I reviewed this exact diff and its risks.
                  </label>
                  <Button
                    disabled={
                      busy ||
                      reviewed !== p.patch.digest ||
                      reason.trim().length < 8
                    }
                    onClick={() =>
                      void send("review", {
                        revision: rev,
                        proposalId: p.id,
                        patchDigest: p.patch!.digest,
                        decision: "approved",
                        reason,
                      })
                    }
                  >
                    Approve exact patch
                  </Button>
                  <Button
                    disabled={busy || reason.trim().length < 8}
                    onClick={() =>
                      void send("review", {
                        revision: rev,
                        proposalId: p.id,
                        patchDigest: p.patch!.digest,
                        decision: "rejected",
                        reason,
                      })
                    }
                  >
                    Reject patch
                  </Button>
                </>
              )}
              {p.review && (
                <p>
                  Review {p.review.decision} by {p.review.actorId} at{" "}
                  {p.review.at}: {p.review.reason}
                </p>
              )}
              {p.review?.decision === "approved" && !p.pr && (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={writeConsent === p.patch.digest}
                      onChange={(e) =>
                        setWriteConsent(e.target.checked ? p.patch!.digest : "")
                      }
                    />{" "}
                    I explicitly authorize writing this exact patch to
                    repository {projectId}, base {p.baseCommit}, on a new
                    remediation branch and creating one draft PR.
                  </label>
                  <Button
                    disabled={
                      busy ||
                      !state?.githubWritesEnabled ||
                      writeConsent !== p.patch.digest
                    }
                    onClick={() =>
                      void send("publish", {
                        revision: rev,
                        proposalId: p.id,
                        patchDigest: p.patch!.digest,
                        repositoryId: projectId.slice(7),
                        baseCommit: p.baseCommit,
                        writeConsent: true,
                      })
                    }
                  >
                    Create authorized draft PR
                  </Button>
                  {!state?.githubWritesEnabled && (
                    <p>
                      GitHub writes are disabled. Existing owner and App write
                      permission must be verified before publishing.
                    </p>
                  )}
                </>
              )}
              {p.pr && (
                <>
                  <p>
                    GitHub PR: {p.pr.state} / branch {p.pr.branch}
                    {p.pr.url && (
                      <>
                        {" "}
                        /{" "}
                        <a href={p.pr.url} target="_blank" rel="noreferrer">
                          PR #{p.pr.number}
                        </a>
                      </>
                    )}
                  </p>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void send("pr-status", {
                        revision: rev,
                        proposalId: p.id,
                      })
                    }
                  >
                    Check PR status (read only)
                  </Button>
                </>
              )}
              {p.review?.decision === "approved" && (
                <>
                  <h5>Authorize targeted retest</h5>
                  <label className="field">
                    Retest branch
                    <input
                      value={branch}
                      maxLength={255}
                      onChange={(e) => setBranch(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    Retest commit
                    <input
                      value={afterCommit}
                      maxLength={40}
                      onChange={(e) => setAfterCommit(e.target.value)}
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={retestConsent}
                      onChange={(e) => setRetestConsent(e.target.checked)}
                    />{" "}
                    I authorize one real G02 scanner run on this repository,
                    branch and exact changed commit.
                  </label>
                  <Button
                    disabled={
                      busy ||
                      !retestConsent ||
                      !branch ||
                      !/^[a-f0-9]{40}$/.test(afterCommit)
                    }
                    onClick={() =>
                      void send("retest", {
                        revision: rev,
                        proposalId: p.id,
                        afterCommit,
                        branch,
                        retestConsent: true,
                      })
                    }
                  >
                    Run authorized scanner retest
                  </Button>
                </>
              )}
            </>
          )}
        </article>
      ))}
      <h3>Verified retest history</h3>
      <p>
        Fixed means the original scanner finding is verified at the recorded
        commit. Missing coverage is inconclusive. A changed branch invalidates
        current verification when checked again.
      </p>
      {(state?.retests ?? []).map((t) => (
        <article key={t.id}>
          <p>
            {t.outcome} / {t.evidenceOutcome} / {t.state}; {t.beforeCommit} →{" "}
            {t.afterCommit}. {t.reason}
          </p>
          <p>
            Scanner evidence: before {t.beforeArtifact ?? "pending"}; after{" "}
            {t.afterArtifact ?? "pending"}.{" "}
            {t.invalidatedAt && `Invalidated ${t.invalidatedAt}`}
          </p>
          {!!t.observations?.length && (
            <details>
              <summary>Recorded verification observations</summary>
              {t.observations.map((o, i) => (
                <p key={i}>
                  {o.at} / {o.afterCommit} / {o.outcome} / {o.evidenceOutcome}.{" "}
                  {o.reason}
                </p>
              ))}
            </details>
          )}
          {t.scanId && (
            <Button
              disabled={busy}
              onClick={() =>
                void send("compare", { revision: rev, retestId: t.id })
              }
            >
              Compare real scanner evidence
            </Button>
          )}
        </article>
      ))}
      <h3>Persistent remediation reports</h3>
      <Button
        disabled={busy || !state}
        onClick={() => void send("report", { revision: rev })}
      >
        Save G03 evidence report
      </Button>
      {(state?.reports ?? []).map((r) => (
        <p key={r.id}>
          Report {r.id} / expires {r.expiresAt}
          {(["json", "html"] as const).map((format) => (
            <Button
              key={format}
              disabled={busy}
              onClick={() =>
                void send("export", { revision: rev, reportId: r.id, format })
              }
            >
              Download server {format.toUpperCase()}
            </Button>
          ))}
        </p>
      ))}
      <details>
        <summary>G03 consent and audit history</summary>
        {(state?.audit ?? []).map((a, i) => (
          <p key={i}>
            {a.at} / {a.actorId} / {a.action} / {a.reason}
          </p>
        ))}
      </details>
    </section>
  );
}
