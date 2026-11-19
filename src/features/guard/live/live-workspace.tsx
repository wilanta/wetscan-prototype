"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Empty,
  Notice,
  PageHeader,
} from "@/components/ui";
import type { Engine } from "../contracts";
import type { ScanSummary } from "./model";
import type { StoredScanView } from "./product-view";
import type { StoredGuardReport } from "./product-artifacts";
import { repositoryProfiles } from "./scan-profiles";
import { guidance } from "../evidence";
import { analysisReportHtml } from "./analysis-report";
import { LiveGuardWorkbench } from "./workbench";
import styles from "../workbench.module.css";
import { LiveAnalysisPanel, LivePreflightButton } from "./analysis-panel";
interface Readiness {
  database: string;
  schema: string;
  product?: {
    repositoryScanning: string;
    reason: string | null;
    allowedEngines?: Engine[];
  };
}
const tabs = [
  ["Overview", ""],
  ["Scan History", "scans"],
  ["Findings", "findings"],
  ["Logic & Workflows", "integrity"],
  ["Remediation", "remediation"],
  ["Release Status", "releases"],
];
const terminal = ["completed", "completed_partial", "failed", "cancelled"];
function download(body: string, name: string, type: string) {
  const u = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export function LiveGuardWorkspace({
  projectId,
  repositoryName,
  branch: initialBranch,
  section = "",
  initialScanId,
}: {
  projectId: string;
  repositoryName: string;
  branch: string;
  section?: string;
  initialScanId?: string;
}) {
  const router = useRouter();
  const base = "/app/projects/" + encodeURIComponent(projectId) + "/guard";
  const api = "/api/guard/projects/" + encodeURIComponent(projectId);
  const initial = /^[a-f0-9]{64}$/.test(initialScanId ?? "")
    ? initialScanId
    : undefined;
  const [scans, setScans] = useState<ScanSummary[]>([]),
    [view, setView] = useState<StoredScanView | null>(null),
    [ready, setReady] = useState<Readiness | null>(null),
    [reports, setReports] = useState<StoredGuardReport[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [branch, setBranch] = useState(initialBranch),
    [commit, setCommit] = useState(""),
    [engines, setEngines] = useState<Engine[]>(["sast", "sca", "secrets"]);
  const [profile, setProfile] = useState<"quick" | "standard" | "full">(
    "quick",
  );
  const [severityFilter, setSeverityFilter] = useState("all");
  const [reason, setReason] = useState(""),
    [outcome, setOutcome] = useState("under_review"),
    [key, setKey] = useState<string | null>(null);
  const epoch = useRef(0);
  const request = useCallback(
    async (path: string, body?: unknown, signal?: AbortSignal) => {
      const r = await fetch(api + "/" + path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal,
        headers:
          body === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const b = await r.json();
      if (!r.ok)
        throw Error(
          typeof b.error === "string" && /^[a-z_]{1,64}$/.test(b.error)
            ? b.error
            : "guard_unavailable",
        );
      return b;
    },
    [api],
  );
  const refresh = useCallback(
    async (signal?: AbortSignal, keepView = false) => {
      const seq = ++epoch.current;
      setBusy(true);
      setError("");
      if (!keepView) {
        setView(null);
        setReports([]);
      }
      try {
        const [cap, history] = await Promise.allSettled([
          request("readiness", undefined, signal),
          request("scans?limit=20", undefined, signal),
        ]);
        if (seq !== epoch.current || signal?.aborted) return;
        if (cap.status === "fulfilled") setReady(cap.value);
        else setReady(null);
        if (history.status === "rejected") {
          setScans([]);
          throw history.reason;
        }
        setScans(history.value.scans);
        const id = initial ?? history.value.scans[0]?.id;
        if (id) {
          const detail = await request(
            "scans/" + id + "/view",
            undefined,
            signal,
          );
          if (seq !== epoch.current || signal?.aborted) return;
          setView(detail);
          if (
            detail.execution === "repository_scan" &&
            terminal.includes(detail.status)
          ) {
            const artifacts = await request(
              "scans/" + id + "/reports",
              undefined,
              signal,
            ).catch(() => ({ reports: [] }));
            if (seq === epoch.current && !signal?.aborted)
              setReports(artifacts.reports);
          }
        }
      } catch (e) {
        if (seq === epoch.current && !signal?.aborted) {
          setView(null);
          setReports([]);
          setError(e instanceof Error ? e.message : "guard_unavailable");
        }
      } finally {
        if (seq === epoch.current && !signal?.aborted) setBusy(false);
      }
    },
    [initial, request],
  );
  useEffect(() => {
    const c = new AbortController();
    const initialLoad = setTimeout(() => void refresh(c.signal), 0);
    return () => {
      clearTimeout(initialLoad);
      c.abort();
    };
  }, [refresh]);
  useEffect(() => {
    if (!view?.scanId || !view?.status || terminal.includes(view.status))
      return;
    let pending = false;
    const timer = setInterval(() => {
      if (pending) return;
      pending = true;
      void refresh(undefined, true).finally(() => {
        pending = false;
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [view?.scanId, view?.status, refresh]);
  async function action(path: string, value: unknown) {
    setBusy(true);
    setError("");
    try {
      const result = await request(path, value);
      if (path === "scans" && /^[a-f0-9]{64}$/.test(result.scanId ?? "")) {
        router.push(base + "?scan=" + result.scanId);
      } else await refresh();
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "guard_unavailable") +
          " — no automatic retry was sent.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function resolve() {
    setBusy(true);
    setError("");
    try {
      const pin = await request("revision", {
        branch,
        ...(commit ? { commit } : {}),
      });
      setCommit(pin.commit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "guard_unavailable");
    } finally {
      setBusy(false);
    }
  }
  const canScan = ready?.product?.repositoryScanning === "CONFIGURED";
  const allowedEngines = ready?.product?.allowedEngines;
  const effectiveEngines = engines.filter(
    (e) => !allowedEngines || allowedEngines.includes(e),
  );
  const mutate =
    view?.execution === "repository_scan" && terminal.includes(view.status);
  const selectedFinding = view?.findings[0];
  return (
    <div className="page">
      <PageHeader
        eyebrow="GUARD · LIVE"
        title={repositoryName}
        description="Authorized repository evidence at a pinned commit. Empty or unavailable coverage never implies a pass."
      />
      <nav className="page-tabs" aria-label="Live Guard sections">
        {tabs.map(([label, path]) => (
          <Link
            key={path}
            href={
              base +
              (path ? "/" + path : "") +
              (view ? "?scan=" + view.scanId : "")
            }
            className={section === path ? "active" : ""}
          >
            {label}
          </Link>
        ))}
      </nav>
      <Card className={styles.panel} aria-label="Guard live workspace">
        <div className={styles.toolbar}>
          <Badge tone="blue">LIVE · RECORDED DATA</Badge>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void refresh()}
          >
            Refresh recorded scans
          </Button>
          <Link
            href={"/app/projects/" + encodeURIComponent(projectId) + "/canvas"}
          >
            Open project Canvas
          </Link>
        </div>
        {error && (
          <p role="alert">
            Live data unavailable: {error}. No synthetic results are
            substituted.
          </p>
        )}
        {!canScan && (
          <Notice>
            Live scanning is blocked:{" "}
            {ready?.product?.reason ??
              "qualified scanner runtime and source broker not configured"}
            . Repository scan activation requires verified isolation and current
            authorization.
          </Notice>
        )}
        {section === "" && (
          <>
            <h2>Repository scan</h2>
            {view?.execution === "repository_scan" &&
              view.status === "queued" && (
                <Button
                  variant="secondary"
                  disabled={busy || !canScan}
                  onClick={() =>
                    void action("scans/" + view.scanId + "/resume", {})
                  }
                >
                  Resume unclaimed scan
                </Button>
              )}

            <div className={styles.toolbar}>
              <label className="field">
                Scan branch
                <input
                  value={branch}
                  maxLength={255}
                  disabled={busy}
                  onChange={(e) => {
                    setBranch(e.target.value);
                    setCommit("");
                    setKey(null);
                  }}
                />
              </label>
              <label className="field">
                Pinned scan commit
                <input
                  value={commit}
                  maxLength={40}
                  disabled={busy}
                  onChange={(e) => {
                    setCommit(e.target.value);
                    setKey(null);
                  }}
                />
              </label>
              <Button
                variant="secondary"
                disabled={busy || !branch}
                onClick={() => void resolve()}
              >
                Resolve pinned commit
              </Button>
            </div>
            <label className="field">
              Scan profile
              <select
                aria-label="Scan profile"
                value={profile}
                disabled={busy}
                onChange={(e) => {
                  const p = e.target.value as typeof profile;
                  setProfile(p);
                  setEngines([...repositoryProfiles[p]]);
                  setKey(null);
                }}
              >
                <option value="quick">Quick</option>
                <option value="standard">Standard</option>
                <option value="full">Full</option>
              </select>
            </label>
            <p>
              Profiles define required coverage. Unavailable or unselected
              engines keep release evaluation incomplete.
            </p>
            <fieldset>
              <legend>Requested repository engines</legend>
              {(
                [
                  "sast",
                  "sca",
                  "secrets",
                  "iac",
                  "sbom",
                  "container",
                ] as Engine[]
              ).map((engine) => (
                <label className="check-line" key={engine}>
                  <input
                    type="checkbox"
                    checked={effectiveEngines.includes(engine)}
                    disabled={
                      !!allowedEngines && !allowedEngines.includes(engine)
                    }
                    onChange={(e) => {
                      setEngines(
                        e.target.checked
                          ? [...engines, engine]
                          : engines.filter((x) => x !== engine),
                      );
                      setKey(null);
                    }}
                  />
                  {engine}
                </label>
              ))}
            </fieldset>
            <p>
              Container: requires a separately authorized digest-pinned image. Scanner commands and images are
              server-owned.
            </p>
            <Button
              disabled={
                busy ||
                !canScan ||
                !/^[a-f0-9]{40}$/.test(commit) ||
                !effectiveEngines.length
              }
              onClick={() => {
                const idempotency = key ?? "g02-live-" + crypto.randomUUID();
                setKey(idempotency);
                void action("scans", {
                  branch,
                  commit,
                  engines: effectiveEngines,
                  profile,
                  idempotencyKey: idempotency,
                });
              }}
            >
              Start repository scan
            </Button>
          </>
        )}
        {(section === "" || section === "scans") && (
          <>
            <h2>Scan History</h2>
            {scans.length ? (
              <div className={styles.scroll}>
                <table>
                  <caption>
                    Database records for this authorized repository
                  </caption>
                  <thead>
                    <tr>
                      <th>Scan</th>
                      <th>Commit</th>
                      <th>Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scans.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <Link href={base + "/scans?scan=" + s.id}>
                            {s.id.slice(0, 12)}
                          </Link>
                        </td>
                        <td>{s.repository.commit.slice(0, 12)}</td>
                        <td>{s.status}</td>
                        <td>{s.createdAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="No recorded scan loaded"
                description="Storage may be unavailable or this repository has no retained scan. No scan success is inferred."
              />
            )}
          </>
        )}
        {view && (
          <>
            <p role="status" className={styles.meta}>
              Recorded scan {view.scanId}: {view.status}; {view.execution};
              commit {view.repository.commit}; revision {view.revision}.
            </p>
            {view.execution === "historical_preparation" && (
              <Notice>
                This is a historical preparation record. Product scan,
                cancellation, triage and recovery actions are unavailable for
                this record.
              </Notice>
            )}
            {(section === "" ||
              section === "scans" ||
              section === "releases") && (
              <div className={styles.scroll}>
                <table>
                  <caption>Recorded engine coverage</caption>
                  <thead>
                    <tr>
                      <th>Engine</th>
                      <th>Status</th>
                      <th>Scanner provenance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.engines.map((r) => (
                      <tr key={r.engine}>
                        <td>{r.engine}</td>
                        <td>{r.status}</td>
                        <td>
                          {r.scanner} {r.version} / {r.rulePack} / {r.reason}
                          {r.coverage && (
                            <span>
                              {" "}
                              / {r.coverage.status}: {r.coverage.scannedFiles}/
                              {r.coverage.eligibleFiles} files /{" "}
                              {r.coverage.scope}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p>
                  Source coverage: {view.sourceCoverage?.status ?? "UNVERIFIED"}
                  . Scanner execution: {view.scannerExecution}.
                </p>
              </div>
            )}
            {section === "findings" && (
              <>
                <h2>Findings and evidence</h2>
                <p>
                  Recorded inventory: {view.inventory.length} packages.
                  Inventory entries are not vulnerability findings.
                </p>
                {!view.findings.length && (
                  <Notice>
                    No recorded findings. Review engine and source coverage
                    before drawing conclusions.
                  </Notice>
                )}
                <label className="field">
                  Severity filter
                  <select
                    aria-label="Severity filter"
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                  >
                    {[
                      "all",
                      "critical",
                      "high",
                      "medium",
                      "low",
                      "info",
                      "unknown",
                    ].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                {!!view.inventory.length && (
                  <details>
                    <summary>Dependency inventory</summary>
                    <ul>
                      {view.inventory.map((p, i) => (
                        <li key={i}>
                          {p.name} {p.version} / {p.ecosystem} / {p.sourcePath}{" "}
                          / license: {p.license ?? "UNKNOWN"}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {view.sbom && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const url = URL.createObjectURL(
                        new Blob([JSON.stringify(view.sbom, null, 2)], {
                          type: "application/vnd.cyclonedx+json",
                        }),
                      );
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "guard-" + view.scanId + ".cdx.json";
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                  >
                    Download recorded CycloneDX SBOM
                  </Button>
                )}
                {view.findings
                  .filter(
                    (f) =>
                      severityFilter === "all" ||
                      (f.severityKnown === false
                        ? severityFilter === "unknown"
                        : f.severity === severityFilter),
                  )
                  .map((f) => (
                    <article key={f.id} className={styles.item}>
                      <h3>{f.title}</h3>
                      <p>
                        {f.severityKnown === false
                          ? "UNKNOWN severity"
                          : f.severity}{" "}
                        / {f.status} / {f.source.scanner} {f.source.version} /{" "}
                        {f.source.ruleId}
                      </p>
                      <p className={styles.meta}>
                        {f.location.artifactKind === "image" ? "Image artifact: " + f.location.imageDigest + " / " : ""}{f.location.path}:{f.location.line ?? "unknown"}{" "}
                        {f.location.package} {f.location.installedVersion}
                      </p>
                      {f.evidence.map((e) => (
                        <p className={styles.meta} key={e.id}>
                          {e.summary} / commit {e.commit} / artifact SHA256{" "}
                          {e.artifactDigest} / {e.recordedAt}
                        </p>
                      ))}
                      {f.advisory && (
                        <p className={styles.meta}>
                          Advisory {f.advisory.id} / {f.advisory.ecosystem};
                          aliases:{" "}
                          {f.advisory.aliases.join(", ") || "none recorded"};
                          advisory fix milestones (review compatibility):{" "}
                          {f.advisory.fixedVersions.join(", ") || "unknown"};
                          CVSS vectors (not independently scored):{" "}
                          {f.advisory.cvss.map((c) => c.vector).join(", ") ||
                            "unknown"}
                        </p>
                      )}
                      <label className="field">
                        Review outcome
                        <select
                          value={outcome}
                          onChange={(e) => setOutcome(e.target.value)}
                        >
                          <option value="under_review">Under review</option>
                          <option value="fix_pending_retest">
                            Fix pending real retest
                          </option>
                          <option value="false_positive">False positive</option>
                          <option value="risk_accepted">Risk accepted</option>
                        </select>
                      </label>
                      <label className="field">
                        Review reason
                        <textarea
                          maxLength={1000}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </label>
                      <Button
                        disabled={busy || !mutate || reason.trim().length < 8}
                        onClick={() =>
                          void action("scans/" + view.scanId + "/triage", {
                            findingId: f.id,
                            revision: view.revision,
                            status: outcome,
                            reason,
                          })
                        }
                      >
                        Save finding review
                      </Button>
                    </article>
                  ))}
              </>
            )}
            {section === "integrity" && (
              <>
                <h2>Logic & Workflows</h2>
                <Notice>
                  HTTP Trust/Integrity verification:{" "}
                  {view.integrations.integrity}. Authorized staging and
                  enforcing DNS/IP/redirect controls are required. No model or
                  fixture is presented as an HTTP observation.
                </Notice>
                <h3>Recorded scan audit</h3>
                {view.audit.map((a, i) => (
                  <p key={i}>
                    {a.at} / {a.action} / {a.reason}
                  </p>
                ))}
              </>
            )}
            {section === "remediation" && (
              <>
                <h2>Remediation from recorded findings</h2>
                <LiveAnalysisPanel
                  projectId={projectId}
                  scanId={view.scanId}
                  revision={view.revision}
                  findings={view.findings}
                  enabled={mutate}
                  onChanged={() => void refresh()}
                />
                {selectedFinding ? (
                  <>
                    <h3>{selectedFinding.title}</h3>
                    <p>{guidance(selectedFinding)}</p>
                    <p className={styles.meta}>
                      Finding {selectedFinding.id} / base commit{" "}
                      {view.repository.commit}
                    </p>
                  </>
                ) : (
                  <p>No finding is available for remediation.</p>
                )}
                <Notice>
                  AI: {view.integrations.ai}. No source was sent to an LLM.
                  Patch generation requires an authorized pinned-source reader;
                  real targeted retest: {view.integrations.targetedRetest}. No
                  verified fix is claimed.
                </Notice>
              </>
            )}
            {section === "releases" && (
              <>
                <h2>Release Status: {view.release.decision}</h2>
                <LiveAnalysisPanel
                  integrations
                  projectId={projectId}
                  scanId={view.scanId}
                  revision={view.revision}
                  findings={view.findings}
                  enabled={mutate}
                  onChanged={() => void refresh()}
                />
                <p>{view.release.reasons.join(" ")}</p>
                <Notice>
                  Evaluation only; GitHub Checks and Vercel enforcement are
                  NOT_CONFIGURED.
                </Notice>
                <Button
                  disabled={busy || !mutate}
                  onClick={() =>
                    void action("scans/" + view.scanId + "/reports", {
                      revision: view.revision,
                    })
                  }
                >
                  Persist report snapshot
                </Button>
                {reports.map((r) => (
                  <div key={r.id} className={styles.item}>
                    <p className={styles.meta}>
                      Persisted report {r.id}, source revision{" "}
                      {r.sourceRevision}, {r.createdAt}
                    </p>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        download(
                          JSON.stringify(r.body, null, 2),
                          "guard-live-" + r.id + ".json",
                          "application/json",
                        )
                      }
                    >
                      Download persisted JSON
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        download(
                          analysisReportHtml(r.body),
                          "guard-live-" + r.id + ".html",
                          "text/html",
                        )
                      }
                    >
                      Download printable report
                    </Button>
                  </div>
                ))}
              </>
            )}
            {view.execution === "repository_scan" &&
              !terminal.includes(view.status) && (
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() =>
                    void action("scans/" + view.scanId + "/product-cancel", {})
                  }
                >
                  Cancel repository scan
                </Button>
              )}
          </>
        )}
        {!view &&
          !busy &&
          ["findings", "integrity", "remediation", "releases"].includes(
            section,
          ) && (
            <Notice>
              Select a retained scan from Scan History. No demo results are
              loaded in Live Mode.
            </Notice>
          )}
      </Card>
      {section === "" && (
        <>
          <LivePreflightButton projectId={projectId} />
          <details>
            <summary>Historical source-preparation diagnostics</summary>
            <LiveGuardWorkbench
              projectId={projectId}
              repositoryName={repositoryName}
              branch={initialBranch}
            />
          </details>
        </>
      )}
    </div>
  );
}
