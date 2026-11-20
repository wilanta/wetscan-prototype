"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Empty, Notice, SectionHeading } from "@/components/ui";
import type {
  G06DeliveryAttemptRecord,
  G06OutboxRecord,
  G06Overview,
  G06ReportStatus,
  G06UnifiedReportRecord,
} from "./contracts";

const statusTone: Record<
  G06ReportStatus | string,
  "green" | "blue" | "amber" | "red" | "neutral"
> = {
  VERIFIED: "green",
  acknowledged: "green",
  available: "green",
  PARTIAL: "amber",
  partial: "amber",
  INCOMPLETE: "amber",
  retry_scheduled: "amber",
  pending: "blue",
  leased: "blue",
  STALE: "amber",
  stale: "amber",
  BLOCKED: "red",
  FAILED: "red",
  failed: "red",
  conflict: "red",
  NOT_CONFIGURED: "neutral",
  NOT_CONNECTED: "neutral",
  not_scanned: "neutral",
  unavailable: "neutral",
  consumer_unavailable: "amber",
  project_not_registered: "amber",
};

async function g06Api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body !== undefined ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof json?.message === "string"
        ? json.message
        : typeof json?.error === "string"
          ? json.error
          : `Request failed (${res.status})`,
    );
  }
  return json as T;
}

const fmtDate = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" }) + " WIB"
    : "Never";

function OutboxTable({
  items,
  label,
  busy,
  onRetry,
}: {
  items: G06OutboxRecord[];
  label: string;
  busy: boolean;
  onRetry: (deliveryId: string) => void;
}) {
  if (!items.length) {
    return (
      <Empty
        title={`No ${label} deliveries queued`}
        description="Enqueue an integration action after running a repository scan."
      />
    );
  }

  return (
    <div className="table-scroll">
      <table aria-label={`${label} deliveries`}>
        <thead>
          <tr>
            <th>Delivery ID</th>
            <th>Event</th>
            <th>Commit</th>
            <th>State</th>
            <th>Attempts</th>
            <th>Consumer / Error</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.deliveryId}>
              <td>
                <code>{item.deliveryId}</code>
              </td>
              <td>{item.eventType}</td>
              <td>
                <code>{item.commitSha.slice(0, 12)}</code>
              </td>
              <td>
                <Badge tone={statusTone[item.state] ?? "neutral"}>
                  {item.state}
                </Badge>
              </td>
              <td>
                {item.attempts}/{item.maxAttempts}
              </td>
              <td>
                {item.consumerAckRef ? (
                  <code>{item.consumerAckRef}</code>
                ) : item.lastError ? (
                  <small>{item.lastError}</small>
                ) : (
                  <span>{item.consumerStatus ?? "pending"}</span>
                )}
              </td>
              <td>
                {(item.state === "failed" || item.state === "retry_scheduled") && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => onRetry(item.deliveryId)}
                  >
                    Retry delivery
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function G06Panel({ projectId }: { projectId: string }) {
  const root = `/api/guard/projects/${encodeURIComponent(projectId)}/g06`;
  const [overview, setOverview] = useState<G06Overview | null>(null);
  const [selectedReport, setSelectedReport] =
    useState<G06UnifiedReportRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await g06Api<G06Overview>(`${root}/overview`);
      setOverview(data);
      if (data.reports.length > 0) {
        setSelectedReport((prev) =>
          prev
            ? data.reports.find((r) => r.reportId === prev.reportId) ??
              data.reports[0]
            : data.reports[0],
        );
      } else {
        setSelectedReport(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [root]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function runAction(
    resource: string,
    payload: Record<string, unknown>,
    successMsg: string,
  ) {
    setBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const res = await g06Api<Record<string, unknown>>(
        `${root}/${resource}`,
        payload,
      );
      if (resource === "reports" && res.report) {
        setSelectedReport(res.report as G06UnifiedReportRecord);
      }
      setStatusMessage(successMsg);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="g06-panel" aria-label="Guard integrations and unified reports">
      <Notice tone="blue">
        <strong>Authoritative Product Scope (GitHub-Only):</strong> WetScan Guard
        acquires source strictly from authorized GitHub commits.{" "}
        <code>GRD-002</code> (GitLab) and ZIP uploads are{" "}
        <code>OUT_OF_SCOPE_BY_OWNER_DECISION</code>.
      </Notice>

      {error && (
        <div role="alert">
          <Notice tone="amber">{error}</Notice>
        </div>
      )}
      {statusMessage && <p role="status">{statusMessage}</p>}
      {loading && <p role="status">Loading Guard integrations and reports…</p>}

      {!loading && overview && !overview.configured && (
        <Card>
          <SectionHeading title="Guard G06 Integrations — NOT_CONFIGURED">
            <Badge tone="neutral">NOT_CONFIGURED</Badge>
          </SectionHeading>
          <p>{overview.scopeNote}</p>
        </Card>
      )}

      {!loading && overview && overview.configured && (
        <>
          <Card>
            <SectionHeading title="Unified Guard Security Reports (G01–G06)">
              <Button
                disabled={busy}
                onClick={() =>
                  void runAction(
                    "reports",
                    {},
                    "Generated durable unified Guard security report.",
                  )
                }
              >
                Generate unified report
              </Button>
            </SectionHeading>

            {overview.reports.length === 0 ? (
              <Empty
                title="No unified reports generated yet"
                description="Generate a unified report to snapshot G02 static scans, SBOM, G03 boundary, G04 CI/CD policy, G05 DAST/Integrity, Canvas overlay, Intelligence exposure, and Sentinel delivery status."
              />
            ) : (
              <>
                <div className="table-scroll">
                  <table aria-label="Unified Guard reports">
                    <thead>
                      <tr>
                        <th>Report ID</th>
                        <th>Commit</th>
                        <th>Overall Status</th>
                        <th>Created</th>
                        <th>Exports</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.reports.map((rep) => (
                        <tr key={rep.reportId}>
                          <td>
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => setSelectedReport(rep)}
                            >
                              <code>{rep.reportId}</code>
                            </button>
                          </td>
                          <td>
                            <code>
                              {rep.commitSha ? rep.commitSha.slice(0, 12) : "none"}
                            </code>
                          </td>
                          <td>
                            <Badge tone={statusTone[rep.overallStatus] ?? "neutral"}>
                              {rep.overallStatus}
                            </Badge>
                          </td>
                          <td>{fmtDate(rep.createdAt)}</td>
                          <td className="actions">
                            <a
                              href={`${root}/reports?reportId=${encodeURIComponent(rep.reportId)}&format=json&download=1`}
                            >
                              Download JSON
                            </a>
                            {" · "}
                            <a
                              href={`${root}/reports?reportId=${encodeURIComponent(rep.reportId)}&format=html&download=1`}
                            >
                              Download HTML
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {selectedReport && (
                  <div className="g06-report-detail">
                    <h3>
                      Report Snapshot <code>{selectedReport.reportId}</code>{" "}
                      <Badge
                        tone={
                          statusTone[selectedReport.overallStatus] ?? "neutral"
                        }
                      >
                        {selectedReport.overallStatus}
                      </Badge>
                    </h3>
                    <ul>
                      <li>
                        Static Scanning:{" "}
                        <strong>
                          {selectedReport.body.staticScanning.status}
                        </strong>{" "}
                        ({selectedReport.body.staticScanning.activeFindings}{" "}
                        active /{" "}
                        {selectedReport.body.staticScanning.findingsTotal} total)
                      </li>
                      <li>
                        SBOM &amp; Inventory:{" "}
                        <strong>
                          {selectedReport.body.sbomAndInventory.status}
                        </strong>{" "}
                        ({selectedReport.body.sbomAndInventory.itemCount} items,{" "}
                        {
                          selectedReport.body.sbomAndInventory
                            .unknownLicenseCount
                        }{" "}
                        unknown license)
                      </li>
                      <li>
                        Remediation &amp; Retest (G03 boundary):{" "}
                        <strong>
                          {selectedReport.body.remediationAndRetest.status}
                        </strong>{" "}
                        — {selectedReport.body.remediationAndRetest.note}
                      </li>
                      <li>
                        CI/CD Policy (G04):{" "}
                        <strong>{selectedReport.body.cicdPolicy.status}</strong>{" "}
                        (decision:{" "}
                        {selectedReport.body.cicdPolicy.policyDecision ?? "none"}
                        , enforced:{" "}
                        {String(selectedReport.body.cicdPolicy.enforced)})
                      </li>
                      <li>
                        DAST &amp; Integrity (G05):{" "}
                        <strong>
                          {selectedReport.body.dastAndIntegrity.status}
                        </strong>{" "}
                        — {selectedReport.body.dastAndIntegrity.note}
                      </li>
                    </ul>
                    {selectedReport.body.limitations.length > 0 && (
                      <details open>
                        <summary>
                          Explicit limitations ({selectedReport.body.limitations.length})
                        </summary>
                        <ul>
                          {selectedReport.body.limitations.map((lim) => (
                            <li key={lim}>{lim}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
              </>
            )}
          </Card>

          <Card>
            <SectionHeading title="GRD-013 — Guard → Canvas Risk Overlay">
              <div className="actions">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void runAction(
                      "canvas",
                      {},
                      "Recomputed Canvas risk overlay against cached architecture graph.",
                    )
                  }
                >
                  Refresh Canvas overlay
                </Button>
                <Link
                  href={`/app/projects/${encodeURIComponent(projectId)}/canvas`}
                >
                  Open Canvas map
                </Link>
              </div>
            </SectionHeading>
            {overview.canvas.latestOverlay ? (
              <ul>
                <li>
                  Status:{" "}
                  <Badge
                    tone={
                      statusTone[overview.canvas.latestOverlay.coverageStatus] ??
                      "neutral"
                    }
                  >
                    {overview.canvas.latestOverlay.coverageStatus}
                  </Badge>
                </li>
                <li>
                  Mapped findings:{" "}
                  <strong>{overview.canvas.latestOverlay.mappedCount}</strong> ·
                  Unmatched:{" "}
                  <strong>{overview.canvas.latestOverlay.unmatchedCount}</strong>
                </li>
                <li>
                  Commit:{" "}
                  <code>
                    {overview.canvas.latestOverlay.commitSha.slice(0, 12)}
                  </code>{" "}
                  · Graph revision:{" "}
                  <code>
                    {overview.canvas.latestOverlay.graphRevision.slice(0, 12)}
                  </code>
                </li>
              </ul>
            ) : (
              <Empty
                title="No persisted Canvas overlay yet"
                description="Open Canvas Security lens or click Refresh Canvas overlay once the Canvas graph is cached."
              />
            )}
          </Card>

          <Card>
            <SectionHeading title="GRD-020 — Guard → Intelligence Inventory & Exposure Sync">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void runAction(
                    "intelligence",
                    {},
                    "Published Guard dependency inventory to outbox and evaluated Intelligence sync.",
                  )
                }
              >
                Sync inventory to Intelligence
              </Button>
            </SectionHeading>
            {overview.intelligence.latestSync && (
              <ul>
                <li>
                  Sync state:{" "}
                  <Badge
                    tone={
                      statusTone[overview.intelligence.latestSync.syncStatus] ??
                      "neutral"
                    }
                  >
                    {overview.intelligence.latestSync.syncStatus}
                  </Badge>
                </li>
                <li>
                  Packages: {overview.intelligence.latestSync.itemCount} (
                  {overview.intelligence.latestSync.unsupportedCount}{" "}
                  non-npm/unsupported) · Sentinel Snapshot:{" "}
                  <code>
                    {overview.intelligence.latestSync.sentinelSnapshotId ??
                      "pending"}
                  </code>
                </li>
                <li>
                  Exposure Assessment:{" "}
                  <strong>
                    {overview.intelligence.latestSync.exposureAssessment ??
                      "pending"}
                  </strong>{" "}
                  ({overview.intelligence.latestSync.exposureCount} matched)
                </li>
              </ul>
            )}
            <OutboxTable
              items={overview.intelligence.outbox}
              label="Intelligence inventory"
              busy={busy}
              onRetry={(deliveryId) =>
                void runAction(
                  "sentinel",
                  { action: "retry", deliveryId },
                  `Requested manual retry for ${deliveryId}.`,
                )
              }
            />
          </Card>

          <Card>
            <SectionHeading title="GRD-021 — Guard → Sentinel Pipeline Audit Outbox">
              <div className="actions">
                <Badge
                  tone={
                    overview.sentinel.consumerConfigured ? "green" : "amber"
                  }
                >
                  {overview.sentinel.consumerConfigured
                    ? "Consumer Configured"
                    : "Consumer Endpoint Not Configured"}
                </Badge>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void runAction(
                      "sentinel",
                      { type: "release_evaluated" },
                      "Enqueued Guard release evaluation event for Sentinel outbox.",
                    )
                  }
                >
                  Publish release event
                </Button>
              </div>
            </SectionHeading>
            <p className="meta">
              Guard pipeline events are strictly internal security posture
              audits (<code>securityIncident: false</code>) and never fabricate
              runtime intrusion incidents.
            </p>
            <OutboxTable
              items={overview.sentinel.outbox}
              label="Sentinel pipeline"
              busy={busy}
              onRetry={(deliveryId) =>
                void runAction(
                  "sentinel",
                  { action: "retry", deliveryId },
                  `Requested manual retry for ${deliveryId}.`,
                )
              }
            />
            {overview.sentinel.recentAttempts.length > 0 && (
              <details>
                <summary>
                  Recent delivery attempts (
                  {overview.sentinel.recentAttempts.length})
                </summary>
                <ul>
                  {overview.sentinel.recentAttempts.map(
                    (att: G06DeliveryAttemptRecord) => (
                      <li key={att.id}>
                        Attempt #{att.attempt} for <code>{att.deliveryId}</code>:{" "}
                        <strong>{att.outcome}</strong>
                        {att.errorCode ? ` (${att.errorCode})` : ""} ·{" "}
                        {fmtDate(att.finishedAt)}
                      </li>
                    ),
                  )}
                </ul>
              </details>
            )}
          </Card>
        </>
      )}
    </section>
  );
}
