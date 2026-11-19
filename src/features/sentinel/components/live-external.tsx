"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Empty,
  Notice,
  SectionHeading,
} from "@/components/ui";
import type {
  AdvisoryPage,
  CanonicalAdvisory,
  ExposureReport,
  ExternalOverview,
  Freshness,
  SourceView,
} from "../external/model";

const knownErrors: Record<string, string> = {
  external_not_configured:
    "External Intelligence is not configured (NOT_CONFIGURED). Database migration 0009 is not applied.",
  lockfile_not_found:
    "No package-lock.json exists at the repository root, so no inventory can be collected. Exposure stays 'cannot assess'.",
  unsupported_lockfile:
    "This lockfile format is not supported (npm lockfile v2/v3 only). Exposure stays 'cannot assess'.",
  malformed_lockfile:
    "The lockfile could not be parsed. No inventory was stored.",
  inventory_too_large:
    "The lockfile is larger than the supported limit. No inventory was stored.",
  project_not_registered: "This project has no Sentinel registration yet.",
  source_busy: "A repository read is already in progress. Try again shortly.",
  github_rate_limited:
    "GitHub rate limited the repository read. Try again later.",
  invalid_query: "Those filters are not valid.",
};
async function api(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Error(
      knownErrors[json.error] ??
        (response.status === 401
          ? "Sign in again to access this project."
          : response.status === 404
            ? "This project or record is unavailable to your account."
            : response.status === 503
              ? "External Intelligence storage is not configured or temporarily unavailable."
              : "Request rejected. Check your input and try again."),
    );
  return json;
}
const at = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" }) + " WIB"
    : "Never";
const fresh: Record<
  Freshness,
  { label: string; tone: "green" | "amber" | "neutral" }
> = {
  fresh: { label: "Fresh", tone: "green" },
  stale: { label: "Stale", tone: "amber" },
  never_synced: { label: "Never synced", tone: "neutral" },
};
const sev = {
  unknown: "neutral",
  low: "blue",
  medium: "amber",
  high: "red",
  critical: "red",
} as const;
const verdict: Record<
  ExposureReport["assessment"],
  { label: string; tone: "amber" | "blue" | "neutral" }
> = {
  potential_exposure: { label: "Potential repository exposure", tone: "amber" },
  no_match_within_coverage: { label: "No match within coverage", tone: "blue" },
  cannot_assess: { label: "Cannot assess project exposure", tone: "neutral" },
};

export function LiveExternalIntelligence({ projectId }: { projectId: string }) {
  const root = `/api/sentinel/projects/${encodeURIComponent(projectId)}/external`;
  const [ov, setOv] = useState<ExternalOverview | null>(null);
  const [exp, setExp] = useState<ExposureReport | null>(null);
  const [page, setPage] = useState<AdvisoryPage | null>(null);
  const [detail, setDetail] = useState<{
    advisory: CanonicalAdvisory;
    history: {
      provider: string;
      sourceId: string;
      revision: number;
      retrievedAt: string;
    }[];
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState("");
  const [severity, setSeverity] = useState("");
  const [kev, setKev] = useState(false);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    setError("");
    try {
      const p = new URLSearchParams({ view: "advisories" });
      if (q.trim()) p.set("q", q.trim());
      if (provider) p.set("provider", provider);
      if (severity) p.set("severity", severity);
      if (kev) p.set("kev", "1");
      if (offset) p.set("offset", String(offset));
      const [o, e, a] = await Promise.all([
        api(root),
        api(`${root}?view=exposures`),
        api(`${root}?${p}`),
      ]);
      setOv(o);
      setExp(e);
      setPage(a);
    } catch (e) {
      setOv(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [root, q, provider, severity, kev, offset]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function run(body: unknown, done: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(root, body);
      setNotice(done);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    try {
      setDetail(await api(`${root}?advisoryId=${encodeURIComponent(id)}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div aria-label="External advisories">
      <Notice tone="blue">
        {ov?.disclaimer ??
          "A public advisory is context, not evidence of an attack on this project."}{" "}
        Syncing advisories never creates telemetry, alerts, incidents or
        responses, and the demo project is unaffected.
      </Notice>
      {error && (
        <div role="alert">
          <Notice tone="amber">{error}</Notice>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {loading && <p role="status">Loading external intelligence…</p>}
      {!loading && ov && (
        <>
          <Card>
            <SectionHeading title="Feed status">
              <Badge>
                {ov.catalog.advisories} advisories · {ov.catalog.kev} in CISA
                KEV
              </Badge>
            </SectionHeading>
            <div className="table-scroll">
              <table aria-label="Advisory feed status">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Freshness</th>
                    <th>Last success</th>
                    <th>Last attempt</th>
                    <th>Records</th>
                  </tr>
                </thead>
                <tbody>
                  {ov.sources.map((s: SourceView) => (
                    <tr key={s.provider}>
                      <td>
                        <a
                          href={s.officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {s.label}
                        </a>
                      </td>
                      <td>
                        <Badge
                          tone={
                            s.status === "ok"
                              ? "green"
                              : s.status === "never_run"
                                ? "neutral"
                                : "amber"
                          }
                        >
                          {s.status.replaceAll("_", " ")}
                        </Badge>
                        {s.lastErrorCode && <small> {s.lastErrorCode}</small>}
                        {s.blockedUntil && (
                          <small>
                            {" "}
                            · backing off until {at(s.blockedUntil)}
                          </small>
                        )}
                      </td>
                      <td>
                        <Badge tone={fresh[s.freshness].tone}>
                          {fresh[s.freshness].label}
                        </Badge>
                      </td>
                      <td>{at(s.lastSuccessAt)}</td>
                      <td>{at(s.lastAttemptAt)}</td>
                      <td>{s.recordCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small-text">
              Last-known-good advisories stay visible when a feed is down; a
              failed or partial run never counts as a successful sync. NVD is
              not configured.
            </p>
            <div className="actions">
              <Button
                disabled={busy}
                onClick={() =>
                  void run(
                    { action: "sync" },
                    "Sync requested. It runs only when the Sentinel worker has External Intelligence enabled.",
                  )
                }
              >
                Request feed sync
              </Button>
              <Button
                variant="secondary"
                disabled={busy || loading}
                onClick={() => void load()}
              >
                Refresh status
              </Button>
              <Badge tone={ov.pendingSyncRequests ? "amber" : "neutral"}>
                {ov.pendingSyncRequests} sync request(s) queued
              </Badge>
            </div>
            {ov.runs.length > 0 && (
              <details>
                <summary>Recent sync runs ({ov.runs.length})</summary>
                <ol aria-label="Recent sync runs">
                  {ov.runs.map((r) => (
                    <li key={r.runId}>
                      {r.provider} · {r.trigger} · {r.status}
                      {r.errorCode ? ` (${r.errorCode})` : ""} ·{" "}
                      {r.recordsChanged}/{r.recordsSeen} changed · {r.requests}{" "}
                      request(s) · {at(r.startedAt)}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </Card>

          <Card>
            <SectionHeading title="Potential project exposure">
              {exp && (
                <Badge tone={verdict[exp.assessment].tone}>
                  {verdict[exp.assessment].label}
                </Badge>
              )}
            </SectionHeading>
            <p>{exp?.message}</p>
            <ul>
              <li>
                Inventory source:{" "}
                {ov.inventory.snapshot
                  ? `declared dependencies from package-lock.json at commit ${ov.inventory.snapshot.commitSha.slice(0, 12)} (lockfile sha256 ${ov.inventory.snapshot.lockfileSha256.slice(0, 12)}…), ${ov.inventory.snapshot.itemCount} packages, collected ${at(ov.inventory.snapshot.collectedAt)}, ${ov.inventory.expired ? "EXPIRED" : `valid until ${at(ov.inventory.snapshot.expiresAt)}`}`
                  : "none collected"}
              </li>
              <li>
                Guard dependency inventory (GRD-020): not integrated. Declared
                lockfile packages are not proof of what is deployed.
              </li>
              {exp && exp.coverage.unsupportedEcosystems.length > 0 && (
                <li>
                  Not assessed (no version semantics):{" "}
                  {exp.coverage.unsupportedEcosystems.join(", ")}
                </li>
              )}
            </ul>
            <div className="actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(
                    { action: "refresh_inventory" },
                    "Inventory collected from the authorized repository lockfile.",
                  )
                }
              >
                Collect lockfile inventory
              </Button>
            </div>
            {exp && exp.exposures.length > 0 ? (
              <div className="table-scroll">
                <table aria-label="Potential exposures">
                  <thead>
                    <tr>
                      <th>Package</th>
                      <th>Installed (declared)</th>
                      <th>Advisory</th>
                      <th>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exp.exposures.map((e) => (
                      <tr
                        key={`${e.canonicalId}-${e.packageName}-${e.installedVersion}`}
                      >
                        <td>
                          {e.packageName}{" "}
                          <small>
                            ({e.ecosystem}, {e.dependencyScope})
                          </small>
                        </td>
                        <td>{e.installedVersion}</td>
                        <td>
                          <button
                            className="link-button"
                            onClick={() => void open(e.canonicalId)}
                          >
                            {e.canonicalId}
                          </button>{" "}
                          <Badge tone={sev[e.topSeverity]}>
                            {e.topSeverity}
                          </Badge>
                          {e.kev && <Badge tone="red">CISA KEV</Badge>}
                          {e.conflicting && (
                            <Badge tone="amber">Sources disagree</Badge>
                          )}
                        </td>
                        <td>
                          {e.sources.map((s) => (
                            <div key={`${s.provider}-${s.sourceId}`}>
                              <small>
                                {s.provider} {s.sourceId}:{" "}
                                {s.matched
                                  ? "asserts affected"
                                  : "does not match"}
                                {s.matchedRange
                                  ? ` (${s.matchedRange.introduced ?? "0"} up to ${s.matchedRange.fixed ? `<${s.matchedRange.fixed}` : s.matchedRange.lastAffected ? `≤${s.matchedRange.lastAffected}` : "latest"})`
                                  : ""}
                                {s.fixedVersions.length
                                  ? ` · fixed in ${s.fixedVersions.join(", ")}`
                                  : ""}
                              </small>
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              exp && (
                <Empty
                  title={
                    exp.assessment === "cannot_assess"
                      ? "Cannot assess project exposure"
                      : "No matching advisory found"
                  }
                  description={
                    exp.assessment === "cannot_assess"
                      ? "This is not a clean result: the evidence needed to compare is missing."
                      : "Not a security guarantee: coverage is limited to the declared lockfile and synced advisories."
                  }
                />
              )
            )}
            {exp?.truncated && (
              <p className="muted small-text">
                Results were truncated to the supported limit.
              </p>
            )}
            <p className="muted small-text">{exp?.disclaimer}</p>
          </Card>

          <Card>
            <SectionHeading title="Advisory Explorer">
              <Badge>{page?.items.length ?? 0} shown</Badge>
            </SectionHeading>
            <div className="actions">
              <input
                aria-label="Search advisories"
                placeholder="CVE, GHSA, OSV id or title"
                value={q}
                onChange={(e) => {
                  setOffset(0);
                  setQ(e.target.value);
                }}
              />
              <select
                aria-label="Filter by source"
                value={provider}
                onChange={(e) => {
                  setOffset(0);
                  setProvider(e.target.value);
                }}
              >
                <option value="">Any source</option>
                <option value="cisa_kev">CISA KEV</option>
                <option value="ghsa">GitHub (GHSA)</option>
                <option value="osv">OSV</option>
              </select>
              <select
                aria-label="Filter by severity"
                value={severity}
                onChange={(e) => {
                  setOffset(0);
                  setSeverity(e.target.value);
                }}
              >
                <option value="">Any severity</option>
                {["critical", "high", "medium", "low", "unknown"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <label>
                <input
                  type="checkbox"
                  checked={kev}
                  onChange={(e) => {
                    setOffset(0);
                    setKev(e.target.checked);
                  }}
                />{" "}
                Known exploited (CISA KEV)
              </label>
            </div>
            {page && page.items.length ? (
              <div className="table-scroll">
                <table aria-label="Advisories">
                  <thead>
                    <tr>
                      <th>Advisory</th>
                      <th>Title</th>
                      <th>Severity (source-provided)</th>
                      <th>Sources</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map((a) => (
                      <tr key={a.canonicalId}>
                        <td>
                          <button
                            className="link-button"
                            onClick={() => void open(a.canonicalId)}
                          >
                            {a.canonicalId}
                          </button>
                        </td>
                        <td>{a.assertions[0]?.title}</td>
                        <td>
                          <Badge tone={sev[a.topSeverity]}>
                            {a.topSeverity}
                          </Badge>
                          {a.kev && <Badge tone="red">CISA KEV</Badge>}
                          {a.conflicting && (
                            <Badge tone="amber">Sources disagree</Badge>
                          )}
                        </td>
                        <td>
                          {a.assertions.map((x) => x.provider).join(", ")}
                        </td>
                        <td>{at(a.modifiedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="No advisories to show"
                description={
                  ov.catalog.advisories
                    ? "No advisory matches these filters."
                    : "No feed has synchronized yet. Request a sync; it runs only when the worker has External Intelligence enabled."
                }
              />
            )}
            <div className="actions">
              <Button
                variant="secondary"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 25))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={page?.nextOffset == null}
                onClick={() => setOffset(page?.nextOffset ?? 0)}
              >
                Next
              </Button>
            </div>
          </Card>

          {detail && (
            <Card>
              <SectionHeading title={`Advisory ${detail.advisory.canonicalId}`}>
                <Button variant="secondary" onClick={() => setDetail(null)}>
                  Close
                </Button>
              </SectionHeading>
              {detail.advisory.aliases.length > 0 && (
                <p>Aliases: {detail.advisory.aliases.join(", ")}</p>
              )}
              {detail.advisory.conflicting && (
                <Notice tone="amber">
                  Sources disagree about the affected ranges. Each source&apos;s
                  claim is shown unmerged below.
                </Notice>
              )}
              {detail.advisory.assertions.map((s) => (
                <section
                  key={`${s.provider}-${s.sourceId}`}
                  aria-label={`${s.provider} assertion`}
                >
                  <h4>
                    {s.provider} · {s.sourceId}{" "}
                    <Badge tone={sev[s.severity]}>{s.severity}</Badge>{" "}
                    {s.status !== "active" && (
                      <Badge tone="amber">
                        {s.status.replaceAll("_", " ")}
                      </Badge>
                    )}
                  </h4>
                  <p>{s.title}</p>
                  {s.kev && (
                    <p>
                      CISA KEV: added {at(s.kev.dateAdded)}, due{" "}
                      {at(s.kev.dueDate)}, ransomware use:{" "}
                      {s.kev.knownRansomwareCampaignUse}. {s.kev.requiredAction}
                    </p>
                  )}
                  <small>
                    <a
                      href={s.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Source
                    </a>{" "}
                    · retrieved {at(s.retrievedAt)} · modified{" "}
                    {at(s.modifiedAt)} · revision {s.revision} · raw sha256{" "}
                    {s.rawSha256.slice(0, 12)}…
                    {s.feedVersion ? ` · feed ${s.feedVersion}` : ""}
                  </small>
                  {s.affected.length > 0 && (
                    <ul>
                      {s.affected.map((a) => (
                        <li key={`${a.ecosystem}-${a.packageName}`}>
                          {a.packageName} ({a.ecosystem}):{" "}
                          {a.certainty === "verified"
                            ? [
                                ...a.ranges.map(
                                  (r) =>
                                    `${r.introduced ?? "0"} → ${r.fixed ? `<${r.fixed}` : r.lastAffected ? `≤${r.lastAffected}` : "latest"}`,
                                ),
                                ...a.versions.map((v) => `= ${v}`),
                              ].join("; ")
                            : "constraint could not be evaluated (never used to claim exposure)"}
                          {a.fixed.length
                            ? ` · fixed in ${a.fixed.join(", ")}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
              {detail.history.length > 0 && (
                <details>
                  <summary>Revision history ({detail.history.length})</summary>
                  <ol>
                    {detail.history.map((h) => (
                      <li key={`${h.provider}-${h.sourceId}-${h.revision}`}>
                        {h.provider} {h.sourceId} · revision {h.revision} ·
                        retrieved {at(h.retrievedAt)}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
              <p className="muted small-text">
                An advisory is not evidence that this project is affected or was
                attacked.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
