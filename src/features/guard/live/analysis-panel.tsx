"use client";
import { useEffect, useState, useCallback } from "react";
import { Button, Notice } from "@/components/ui";
import type { Finding } from "../contracts";
import type {
  RemediationRecord,
  compareRecordedRetest,
} from "./product-remediation";
type State = {
  revision: number;
  proposals: RemediationRecord[];
  retests: ReturnType<typeof compareRecordedRetest>[];
  bundles: {
    id: string;
    acknowledged: false;
    delivery: Record<string, string>;
  }[];
  provider: {
    enabled: boolean;
    modelConfigured: boolean;
    credentialReferencePresent: boolean;
    dataPolicyApproved: boolean;
  };
};
export function LiveAnalysisPanel({
  projectId,
  scanId,
  revision,
  findings,
  enabled,
  onChanged,
  integrations = false,
}: {
  projectId: string;
  scanId: string;
  revision: number;
  findings: Finding[];
  enabled: boolean;
  onChanged: () => void;
  integrations?: boolean;
}) {
  const endpoint =
    "/api/guard/projects/" + encodeURIComponent(projectId) + "/scans/" + scanId;
  const [state, setState] = useState<State | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [findingId, setFindingId] = useState(""),
    [consent, setConsent] = useState(false),
    [reason, setReason] = useState(""),
    [afterScan, setAfterScan] = useState("");
  const selected = findings.find((f) => f.id === findingId) ?? findings[0];
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const r = await fetch(endpoint + "/remediation", {
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      const b = await r.json();
      if (!r.ok)
        throw Error(
          typeof b.error === "string" ? b.error : "analysis_unavailable",
        );
      if (
        !b.provider ||
        !Array.isArray(b.proposals) ||
        !Array.isArray(b.retests) ||
        !Array.isArray(b.bundles) ||
        !Number.isInteger(b.revision)
      )
        throw Error("analysis_response_invalid");
      setState(b);
    },
    [endpoint],
  );
  useEffect(() => {
    const c = new AbortController();
    const t = setTimeout(() => {
      setState(null);
      setConsent(false);
      setFindingId("");
      setReason("");
      setAfterScan("");
      void load(c.signal).catch(() => {
        if (!c.signal.aborted)
          setError("Stored analysis is unavailable; no automatic retry.");
      });
    }, 0);
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [load, revision]);
  async function send(resource: string, value: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(endpoint + "/" + resource, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const b = await r.json();
      if (!r.ok)
        throw Error(
          typeof b.error === "string" ? b.error : "analysis_unavailable",
        );
      await load();
      onChanged();
    } catch {
      setError(
        "Operation failed or its result is unknown. No automatic retry was sent. Preserve the request for review.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label={integrations ? "Integration handoff" : "Recorded remediation"}
    >
      {error && <Notice>{error}</Notice>}
      {!integrations && (
        <>
          <h3>Recorded advice and review</h3>
          <p>
            Advice is bound to this scan, original commit and finding evidence.
            Approval does not apply a patch or create a GitHub PR.
          </p>
          <label className="field">
            Finding for advice
            <select
              value={selected?.id ?? ""}
              onChange={(e) => setFindingId(e.target.value)}
            >
              {findings.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              <input
                type="checkbox"
                checked={consent}
                disabled={
                  !state || !Object.values(state.provider).every(Boolean)
                }
                onChange={(e) => setConsent(e.target.checked)}
              />{" "}
              I consent to sharing only rule ID, engine, severity and confidence
              with the configured AI provider.
            </span>
          </label>
          <p>
            Source files, evidence excerpts, repository names and matched
            secrets are excluded. Provider account retention must be reviewed
            before configuration. No real provider result is claimed from
            configuration alone.
          </p>
          <Button
            disabled={busy || !enabled || !selected || !state}
            onClick={() =>
              void send("remediation", {
                revision: state?.revision ?? revision,
                findingId: selected!.id,
                requestKey: "g03-" + crypto.randomUUID(),
                aiConsent: consent,
              })
            }
          >
            Prepare remediation advice
          </Button>
          <label className="field">
            Advice review reason
            <input
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {(state?.proposals ?? []).map((p) => (
            <article key={p.id}>
              <h4>
                {p.source === "provider" ? "AI advice" : "Rule guidance"}:{" "}
                {p.state} / review {p.review}
              </h4>
              <p>
                Base commit {p.baseCommit} / evidence SHA256 {p.evidenceSha256}
              </p>
              {p.provider && (
                <p>
                  {p.provider.name} / {p.provider.model} /{" "}
                  {p.provider.promptVersion}
                </p>
              )}
              {p.advice &&
                Object.entries(p.advice).map(([key, value]) => (
                  <p key={key}>
                    <strong>{key}: </strong>
                    {value}
                  </p>
                ))}
              {p.state === "reserved" && (
                <Notice>
                  Request reserved; outcome incomplete or unknown. This request
                  will not be retried automatically.
                </Notice>
              )}
              {p.state === "completed" && p.review === "pending" && (
                <>
                  <Button
                    disabled={busy || !enabled || reason.trim().length < 8}
                    onClick={() =>
                      void send("remediation-review", {
                        revision: state!.revision,
                        proposalId: p.id,
                        decision: "approved",
                        reason,
                      })
                    }
                  >
                    Approve advice only
                  </Button>
                  <Button
                    disabled={busy || !enabled || reason.trim().length < 8}
                    onClick={() =>
                      void send("remediation-review", {
                        revision: state!.revision,
                        proposalId: p.id,
                        decision: "rejected",
                        reason,
                      })
                    }
                  >
                    Reject advice
                  </Button>
                </>
              )}
            </article>
          ))}
          <h3>Compare a real retest scan</h3>
          <p>
            First run the relevant scanner on an authorized changed commit from
            Overview. This comparison reads stored evidence; it does not enqueue
            or launch a scanner. Absence alone is not verified_fixed.
          </p>
          <label className="field">
            After scan ID
            <input
              value={afterScan}
              maxLength={64}
              onChange={(e) => setAfterScan(e.target.value)}
            />
          </label>
          <Button
            disabled={
              busy ||
              !enabled ||
              !selected ||
              !state ||
              !/^[a-f0-9]{64}$/.test(afterScan)
            }
            onClick={() =>
              void send("retest-compare", {
                revision: state!.revision,
                findingId: selected!.id,
                afterScanId: afterScan,
              })
            }
          >
            Compare stored retest
          </Button>
          {(state?.retests ?? []).map((r, i) => (
            <p key={i}>
              {r.outcome} / {r.beforeCommit} to {r.afterCommit}. {r.reason}
            </p>
          ))}
        </>
      )}
      {integrations && (
        <>
          <h3>Canvas, Intelligence and Sentinel handoff</h3>
          <p>
            Prepare a durable versioned envelope from the recorded scan findings
            and dependency inventory. Consumers remain unavailable until
            separately connected and verified.
          </p>
          <Button
            disabled={busy || !enabled || !state}
            onClick={() =>
              void send("integrations", { revision: state!.revision })
            }
          >
            Prepare integration handoff
          </Button>
          {(state?.bundles ?? []).map((b) => (
            <p key={b.id}>
              Envelope {b.id} /{" "}
              {Object.entries(b.delivery)
                .map(([k, v]) => k + ": " + v)
                .join("; ")}{" "}
              / acknowledged: {String(b.acknowledged)}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
export function LivePreflightButton({ projectId }: { projectId: string }) {
  const [result, setResult] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  async function probe() {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch(
        "/api/guard/projects/" + encodeURIComponent(projectId) + "/preflight",
        {
          method: "POST",
          credentials: "same-origin",
          redirect: "error",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      setResult({ httpStatus: r.status, ...(await r.json()) });
    } catch {
      setResult({ status: "UNKNOWN_NO_AUTOMATIC_RETRY" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Operational readiness">
      <Button variant="secondary" disabled={busy} onClick={() => void probe()}>
        Check runtime readiness (read only)
      </Button>
      {result !== null && (
        <pre role="status">{JSON.stringify(result, null, 2)}</pre>
      )}
    </section>
  );
}
