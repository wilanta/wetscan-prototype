"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  Empty,
  Notice,
  PageHeader,
} from "@/components/ui";
import type {
  IncidentDetailRecord,
  IncidentPage,
  IncidentTimelineRecord,
  SecurityIncident,
} from "../incidents/model";

async function api(path: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const result = await response.json();
  if (!response.ok) {
    const known: Record<string, string> = {
      revision_conflict:
        "This incident changed in another session. Refresh before updating its status.",
      invalid_transition:
        "This status transition is not permitted for the current incident state.",
      invalid_close_reason:
        "Provide a valid reason (3–280 characters, no secrets or HTML) to close or reopen an incident.",
      invalid_incident_note:
        "Provide a valid investigation note (3–280 characters, no secrets or HTML).",
      project_not_registered: "Register an authorized telemetry source first.",
    };
    throw Error(
      known[result.error] ??
        (response.status === 401
          ? "Sign in again."
          : response.status === 404
            ? "This project or incident record is unavailable to your account."
            : response.status === 503
              ? "Incident storage is not configured or is unavailable."
              : "Request rejected. Check the incident parameters and try again."),
    );
  }
  return result;
}

function at(value: string) {
  return (
    new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" }) +
    " WIB"
  );
}

function statusTone(status: SecurityIncident["status"]) {
  if (status === "open") return "red" as const;
  if (status === "investigating") return "amber" as const;
  return "neutral" as const;
}

export function LiveIncidents({
  projectId,
  initialIncidentId,
}: {
  projectId: string;
  initialIncidentId?: string;
}) {
  const root = `/api/sentinel/projects/${encodeURIComponent(projectId)}/incidents`;
  const [page, setPage] = useState<IncidentPage | null>(null);
  const [detail, setDetail] = useState<IncidentDetailRecord | null>(null);
  const [selected, setSelected] = useState<string | null>(
    initialIncidentId ?? null,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);

  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [origin, setOrigin] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [note, setNote] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries({
    status,
    severity,
    origin,
    ruleId,
    sourceId,
    from: from && new Date(from).toISOString(),
    to: to && new Date(to).toISOString(),
  }))
    if (v) query.set(k, v);
  const queryText = query.toString();

  useEffect(() => {
    const current = ++generation.current;
    const stop = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      setPage(null);
      void api(root + (queryText ? "?" + queryText : ""), undefined, stop.signal)
        .then(async (value: IncidentPage) => {
          if (stop.signal.aborted || current !== generation.current) return;
          setPage(value);
          const targetId = selected ?? initialIncidentId ?? null;
          if (targetId) {
            const d: IncidentDetailRecord = await api(
              `${root}?incidentId=${encodeURIComponent(targetId)}`,
              undefined,
              stop.signal,
            );
            if (!stop.signal.aborted && current === generation.current) {
              setDetail(d);
              setSelected(targetId);
            }
          }
        })
        .catch((e: Error) => {
          if (!stop.signal.aborted && current === generation.current) {
            setError(e.message);
          }
        })
        .finally(() => {
          if (!stop.signal.aborted && current === generation.current)
            setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      stop.abort();
    };
  }, [root, queryText, refresh, initialIncidentId, selected]);

  async function inspect(incidentId: string) {
    const current = ++generation.current;
    setBusy(true);
    setError("");
    setSelected(incidentId);
    try {
      const value: IncidentDetailRecord = await api(
        `${root}?incidentId=${encodeURIComponent(incidentId)}`,
      );
      if (current === generation.current) {
        setDetail(value);
      }
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function older() {
    if (!page?.nextCursor) return;
    const current = generation.current;
    setBusy(true);
    setError("");
    try {
      const q = new URLSearchParams(queryText);
      q.set("cursor", page.nextCursor);
      const next: IncidentPage = await api(`${root}?${q.toString()}`);
      if (current === generation.current)
        setPage({ ...next, items: [...page.items, ...next.items] });
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function transition(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await api(root, body);
      setNote("");
      setCloseReason("");
      setReopenReason("");
      setRefresh((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ overflowWrap: "anywhere" }}>
      <PageHeader
        eyebrow="SENTINEL · LIVE PROJECT"
        title="Persisted Incidents"
        description="Project-scoped incidents correlated from verified alerts, with append-only investigation timeline and redacted evidence. Closing an investigation does not block an attacker or verify mitigation."
      />
      <nav className="page-tabs" aria-label="Sentinel live sections">
        {[
          ["Event Explorer", ""],
          ["Telemetry sources", "/sources"],
          ["Detection Rules", "/rules"],
          ["Alerts", "/alerts"],
          ["Incidents", "/incidents"],
          ["Notifications", "/notifications"],
        ].map(([label, path]) => (
          <Link
            key={path}
            href={`/app/projects/${projectId}/sentinel${path}`}
            aria-current={path === "/incidents" ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <Notice>
        Live project data is separate from Orderly Demo. Controlled tests are
        labelled. Closing an incident closes the investigation workflow only —
        verification remains not_requested and no automated mitigation or
        external notification is executed.
      </Notice>
      {error && <p role="alert">{error}</p>}
      <Button
        variant="secondary"
        disabled={busy || loading}
        onClick={() => setRefresh((v) => v + 1)}
      >
        Refresh incidents
      </Button>
      {loading && <p role="status">Loading incident records…</p>}
      <Card>
        <h2>Incident filters</h2>
        <div className="filters">
          <label>
            Incident status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {["open", "investigating", "closed"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Incident severity
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="">All severities</option>
              {["low", "medium", "high"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Provenance
            <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
              <option value="">All provenance</option>
              <option value="runtime">runtime</option>
              <option value="controlled_test">controlled_test</option>
            </select>
          </label>
          <label>
            Rule ID
            <input
              value={ruleId}
              onChange={(e) => setRuleId(e.target.value)}
              maxLength={36}
            />
          </label>
          <label>
            Source ID
            <input
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              maxLength={36}
            />
          </label>
          <label>
            Observed from
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Observed to
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
      </Card>
      {!loading && !error && !page?.items.length && (
        <Empty
          title="No persisted incidents"
          description="No incidents match this window. Absence of incidents does not establish that the application is safe or actively monitored."
        />
      )}
      {page?.items.map((incident: SecurityIncident) => (
        <Card key={incident.incidentId}>
          <h2>{incident.title}</h2>
          <div className="badges">
            <Badge tone={incident.severity === "high" ? "red" : "amber"}>
              {incident.severity}
            </Badge>
            <Badge tone={statusTone(incident.status)}>
              {incident.status.toUpperCase()}
            </Badge>
            <Badge>verification: {incident.verificationStatus}</Badge>
          </div>
          <p>
            {incident.origin === "controlled_test"
              ? "Controlled test evidence"
              : "Source-declared runtime evidence"}{" "}
            · {incident.alertIds.length} alert(s) ·{" "}
            {incident.evidenceIds.length} evidence event(s) · revision{" "}
            {incident.revision}
          </p>
          <p>{incident.summary}</p>
          <p>
            Rule {incident.ruleName} v{incident.ruleVersion} · source{" "}
            {incident.sourceId}
          </p>
          <p>
            Observed {at(incident.firstObservedAt)} –{" "}
            {at(incident.lastObservedAt)}
          </p>
          <div className="actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void inspect(incident.incidentId)}
            >
              Inspect incident
            </Button>
            <Link
              href={`/app/projects/${projectId}/sentinel/incidents/${incident.incidentId}`}
            >
              Open permalink
            </Link>
          </div>
        </Card>
      ))}
      {page?.nextCursor && (
        <Button disabled={busy || loading} onClick={() => void older()}>
          Load older incidents
        </Button>
      )}
      {detail !== null && (
        <Card>
          <section aria-label="Incident investigation detail">
            <h2>Incident investigation detail</h2>
            <p>
              Incident ID: <code>{detail.incident.incidentId}</code> · Status:{" "}
              <strong>{detail.incident.status.toUpperCase()}</strong> ·
              Severity: <strong>{detail.incident.severity}</strong> · Revision:{" "}
              <strong>{detail.incident.revision}</strong>
            </p>
            <p>
              Provenance:{" "}
              <strong>
                {detail.incident.origin === "controlled_test"
                  ? "Controlled-test evidence (not an observed attack)"
                  : "Runtime telemetry evidence"}
              </strong>{" "}
              · Verification:{" "}
              <strong>
                {detail.incident.verificationStatus} (no mitigation executed)
              </strong>
            </p>
            <p>
              Primary alert: <code>{detail.incident.primaryAlertId}</code> ·
              Source: <code>{detail.incident.sourceId}</code> · Rule:{" "}
              <code>{detail.incident.ruleId}</code> (v
              {detail.incident.ruleVersion})
            </p>
            {detail.incident.status === "closed" && (
              <p>
                Closed by <code>{detail.incident.closedBy}</code> at{" "}
                {detail.incident.closedAt ? at(detail.incident.closedAt) : "—"}{" "}
                · Reason: {detail.incident.closeReason}
              </p>
            )}
            <div className="incident-controls">
              {detail.incident.status === "open" && (
                <div>
                  <label>
                    Investigation note
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={280}
                      placeholder="Optional triage note (3–280 chars)"
                    />
                  </label>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void transition({
                        action: "investigate",
                        incidentId: detail.incident.incidentId,
                        expectedRevision: detail.incident.revision,
                        note: note.trim() ? note.trim() : null,
                      })
                    }
                  >
                    Start investigation
                  </Button>
                </div>
              )}
              {(detail.incident.status === "open" ||
                detail.incident.status === "investigating") && (
                <div>
                  <label>
                    Close reason
                    <input
                      value={closeReason}
                      onChange={(e) => setCloseReason(e.target.value)}
                      maxLength={280}
                      placeholder="Required reason for closing investigation"
                    />
                  </label>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void transition({
                        action: "close",
                        incidentId: detail.incident.incidentId,
                        expectedRevision: detail.incident.revision,
                        reason: closeReason,
                      })
                    }
                  >
                    Close incident
                  </Button>
                </div>
              )}
              {detail.incident.status === "closed" && (
                <div>
                  <label>
                    Reopen reason
                    <input
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      maxLength={280}
                      placeholder="Required reason for reopening investigation"
                    />
                  </label>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void transition({
                        action: "reopen",
                        incidentId: detail.incident.incidentId,
                        expectedRevision: detail.incident.revision,
                        reason: reopenReason,
                      })
                    }
                  >
                    Reopen investigation
                  </Button>
                </div>
              )}
            </div>
            <section aria-label="Investigation timeline">
              <h3>Append-only investigation timeline</h3>
              {!detail.timeline.length ? (
                <p>No timeline entries recorded.</p>
              ) : (
                <ol>
                  {detail.timeline.map((entry: IncidentTimelineRecord) => (
                    <li key={entry.timelineId}>
                      <strong>
                        #{entry.sequence} · {entry.type}
                        {typeof entry.metadata.action === "string"
                          ? ` (${entry.metadata.action})`
                          : ""}
                      </strong>{" "}
                      ({entry.actorType}: <code>{entry.actorId}</code>) ·{" "}
                      {at(entry.occurredAt)}
                      {entry.toStatus
                        ? ` · status: ${entry.fromStatus ?? "none"} → ${entry.toStatus}`
                        : ""}
                      <p>{entry.summary}</p>
                      <small>
                        Timeline ID: {entry.timelineId} · Incident revision:{" "}
                        {entry.incidentRevision} · Evidence refs:{" "}
                        {entry.evidenceIds.length}
                      </small>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section aria-label="Linked alerts">
              <h3>Linked alerts ({detail.alerts.length})</h3>
              {!detail.alerts.length ? (
                <p>No linked alerts available.</p>
              ) : (
                <ul>
                  {detail.alerts.map((alert) => (
                    <li key={alert.alertId}>
                      <code>{alert.alertId}</code> · {alert.ruleName} v
                      {alert.ruleVersion} · {alert.severity} · {alert.origin} ·{" "}
                      {alert.matchedEventCount} matched event(s) · detected{" "}
                      {at(alert.detectedAt)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-label="Linked redacted evidence">
              <h3>Linked redacted evidence ({detail.evidence.length})</h3>
              {!detail.evidence.length ? (
                <p>Telemetry evidence unavailable or missing.</p>
              ) : (
                <pre
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {JSON.stringify(detail.evidence, null, 2)}
                </pre>
              )}
            </section>
          </section>
        </Card>
      )}
    </div>
  );
}
