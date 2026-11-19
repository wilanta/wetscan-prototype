"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  Empty,
  Notice,
  PageHeader,
  SectionHeading,
} from "@/components/ui";
import type { SourceView, EventPage } from "../telemetry/validation";
import type { StoredSecurityEvent } from "../types";

const eventKinds = [
  "auth.failed",
  "http.suspicious_path",
  "http.request",
  "ghost.decoy_triggered",
];
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
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Sign in again to access this project."
        : response.status === 404
          ? "This project or source is no longer available to your account."
          : response.status === 503
            ? "Telemetry storage is not configured or is temporarily unavailable. Ask the workspace owner to finish setup."
            : response.status === 429
              ? "A resource limit was reached. Wait before trying again."
              : "The request could not be completed. Check your selection and try again.",
    );
  return result;
}
function format(value: string | null) {
  return value
    ? new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" }) +
        " WIB"
    : "No accepted contact yet";
}
export function LiveTelemetry({
  projectId,
  section = "",
}: {
  projectId: string;
  section?: string;
}) {
  const root = `/api/sentinel/projects/${encodeURIComponent(projectId)}`;
  const [sources, setSources] = useState<SourceView[]>([]),
    [sourceError, setSourceError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null),
    [name, setName] = useState(""),
    [environment, setEnvironment] = useState("local"),
    [origin, setOrigin] = useState("controlled_test"),
    [retentionDays, setRetentionDays] = useState(7),
    [rateLimit, setRateLimit] = useState(1000),
    [consent, setConsent] = useState(false);
  const [sourceId, setSourceId] = useState(""),
    [kind, setKind] = useState(""),
    [severity, setSeverity] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [page, setPage] = useState<EventPage | null>(null),
    [eventError, setEventError] = useState(""),
    [eventLoading, setEventLoading] = useState(true),
    [selected, setSelected] = useState<StoredSecurityEvent | null>(null),
    [refresh, setRefresh] = useState(0),
    [automatic, setAutomatic] = useState(false);
  const generation = useRef(0);
  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (sourceId) q.set("sourceId", sourceId);
    if (kind) q.set("kind", kind);
    if (severity) q.set("severity", severity);
    if (from)
      q.set(
        "from",
        Number.isFinite(Date.parse(from)) ? new Date(from).toISOString() : from,
      );
    if (to)
      q.set(
        "to",
        Number.isFinite(Date.parse(to)) ? new Date(to).toISOString() : to,
      );
    return q.toString();
  }, [sourceId, kind, severity, from, to]);
  const loadSources = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setSourceError("");
      try {
        const result = await api(root + "/sources", undefined, signal);
        if (!signal?.aborted) setSources(result.sources);
      } catch (e) {
        if (!signal?.aborted) {
          setSourceError((e as Error).message);
          setSources([]);
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [root],
  );
  useEffect(() => {
    const stop = new AbortController();
    void api(root + "/sources", undefined, stop.signal)
      .then((result) => {
        if (!stop.signal.aborted) {
          setSources(result.sources);
          setLoading(false);
        }
      })
      .catch((error) => {
        if (!stop.signal.aborted) {
          setSourceError(error.message);
          setLoading(false);
        }
      });
    return () => stop.abort();
  }, [root]);
  useEffect(() => {
    const stop = new AbortController(),
      current = ++generation.current;
    // Debounce rapidly edited filters; cancel both the timer and request on navigation.
    const timer = setTimeout(() => {
      setEventLoading(true);
      setPage(null);
      setSelected(null);
      setEventError("");
      void api(root + "/events?" + query, undefined, stop.signal)
        .then((value) => {
          if (current === generation.current && !stop.signal.aborted)
            setPage(value);
        })
        .catch((e) => {
          if (!stop.signal.aborted) setEventError(e.message);
        })
        .finally(() => {
          if (!stop.signal.aborted) setEventLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      stop.abort();
    };
  }, [root, query, refresh]);
  useEffect(() => {
    if (!automatic) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        setRefresh((v) => v + 1);
        void loadSources();
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [automatic, loadSources]);
  async function action(body: unknown) {
    setBusy(true);
    setSecret(null);
    setSourceError("");
    try {
      const result = await api(root + "/sources", body);
      if (result.credential) setSecret(result.credential);
      await loadSources();
    } catch (e) {
      setSourceError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    if (!page?.nextCursor) return;
    setEventLoading(true);
    const current = generation.current;
    try {
      const q = new URLSearchParams(query);
      q.set("cursor", page.nextCursor);
      const next: EventPage = await api(root + "/events?" + q);
      if (current === generation.current)
        setPage({ ...next, items: [...page.items, ...next.items] });
    } catch (e) {
      if (current === generation.current) setEventError((e as Error).message);
    } finally {
      if (current === generation.current) setEventLoading(false);
    }
  }
  const sourcesOnly = section === "/sources";
  return (
    <div className="page" style={{ overflowWrap: "anywhere" }}>
      <PageHeader
        eyebrow="SENTINEL · TELEMETRY"
        title={
          sourcesOnly
            ? "Connect an owned telemetry source."
            : "Every received event, in context."
        }
        description="Inspect persisted, redacted telemetry for this authorized repository. Detection and alerts are not enabled."
      />
      <nav className="page-tabs" aria-label="Sentinel telemetry sections">
        <Link
          href={`/app/projects/${projectId}/sentinel`}
          aria-current={!sourcesOnly ? "page" : undefined}
        >
          Event Explorer
        </Link>
        <Link
          href={`/app/projects/${projectId}/sentinel/sources`}
          aria-current={sourcesOnly ? "page" : undefined}
        >
          Telemetry sources
        </Link>
      </nav>
      <p>
        <Link href={`/app/projects/${projectId}/sentinel/rules`}>
          Detection Rules
        </Link>
        {" · "}
        <Link href={`/app/projects/${projectId}/sentinel/alerts`}>
          Persisted Alerts
        </Link>
        {" · "}
        <Link href={`/app/projects/${projectId}/sentinel/incidents`}>
          Incidents
        </Link>
        {" · "}
        <Link href={`/app/projects/${projectId}/sentinel/notifications`}>
          Notifications
        </Link>
      </p>
      <Notice>
        Repository access does not establish runtime monitoring. Runtime and
        controlled-test provenance comes from each registered source. Demo
        records remain in Orderly Demo.
      </Notice>
      {(sourcesOnly || !sources.length) && (
        <Card>
          <SectionHeading title="Telemetry sources" />
          <p>
            Register only an application you own or are explicitly authorized to
            instrument. Credentials appear once; keep them on the sender server.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (consent)
                void action({
                  action: "create",
                  source: {
                    name,
                    environment,
                    origin,
                    retentionDays,
                    rateLimit,
                  },
                  ownedApplicationConfirmed: true,
                });
            }}
          >
            <div className="filters">
              <label>
                Source name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={60}
                  placeholder="Local reference emitter"
                />
              </label>
              <label>
                Environment
                <select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                >
                  <option value="local">Local</option>
                  <option value="staging">Staging</option>
                  <option value="production">Production</option>
                </select>
              </label>
              <label>
                Provenance
                <select
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                >
                  <option value="controlled_test">Controlled test</option>
                  <option value="runtime">Runtime (source-declared)</option>
                </select>
              </label>
              <label>
                Retention days
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                />
              </label>
              <label>
                Events per minute
                <input
                  type="number"
                  min={1}
                  max={6000}
                  value={rateLimit}
                  onChange={(e) => setRateLimit(Number(e.target.value))}
                />
              </label>
            </div>
            <label>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />{" "}
              I own this application or have explicit permission to instrument
              it.
            </label>
            <Button type="submit" disabled={busy || !consent || loading}>
              Create telemetry source
            </Button>
          </form>
        </Card>
      )}
      {secret && (
        <Card>
          <h2>Save this ingest credential now</h2>
          <p>
            Shown once. Existing credentials cannot be retrieved. Do not paste
            it in logs, chat or a public repository.
          </p>
          <code
            aria-label="One-time ingest credential"
            style={{ overflowWrap: "anywhere" }}
          >
            {secret}
          </code>
          <div className="filters">
            <Button
              onClick={() => {
                void navigator.clipboard
                  .writeText(secret)
                  .catch(() =>
                    setSourceError(
                      "Clipboard access was denied. Save the visible credential securely before dismissing it.",
                    ),
                  );
              }}
            >
              Copy credential
            </Button>
            <Button variant="secondary" onClick={() => setSecret(null)}>
              Dismiss credential
            </Button>
          </div>
        </Card>
      )}
      {sourceError && (
        <div role="alert">
          <Notice>{sourceError}</Notice>
        </div>
      )}
      <Card aria-busy={loading}>
        <SectionHeading title="Source connectivity">
          <Button
            variant="secondary"
            disabled={loading}
            onClick={() => {
              void loadSources();
            }}
          >
            Refresh sources
          </Button>
        </SectionHeading>
        {loading ? (
          <p role="status">Loading telemetry sources…</p>
        ) : sourceError && !sources.length ? (
          <p>
            Source status is unavailable. Retry when the connection is ready.
          </p>
        ) : !sources.length ? (
          <Empty
            title="No telemetry sources"
            description="Create an authorized source and configure its sender. No monitoring evidence exists yet."
          />
        ) : (
          sources.map((source) => (
            <div className="activity-row" key={source.sourceId}>
              <div>
                <strong>{source.name}</strong>
                <p>
                  {source.origin === "controlled_test"
                    ? "Controlled test"
                    : "Runtime · source-declared"}{" "}
                  · {source.environment} ·{" "}
                  <Badge>{source.enabled ? source.status : "disabled"}</Badge>
                </p>
                <small>
                  Last contact: {format(source.lastContactAt)}
                  <br />
                  Last ingested event: {format(source.lastIngestedAt)} ·{" "}
                  {source.activeCredentials} active credential(s)
                </small>
              </div>
              <div className="filters">
                {[
                  "rotate",
                  "revoke",
                  source.enabled ? "disable" : "enable",
                ].map((operation) => (
                  <Button
                    key={operation}
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `${operation} this telemetry source${operation === "rotate" ? " and immediately invalidate its old credential" : ""}?`,
                        )
                      )
                        void action({
                          action: operation,
                          sourceId: source.sourceId,
                        });
                    }}
                  >
                    {operation[0].toUpperCase() + operation.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          ))
        )}
      </Card>
      {!sourcesOnly && (
        <Card aria-busy={eventLoading}>
          <SectionHeading title="Event Explorer">
            <Button
              variant="secondary"
              onClick={() => setRefresh((v) => v + 1)}
              disabled={eventLoading}
            >
              Refresh events
            </Button>
          </SectionHeading>
          <div className="filters">
            <label>
              Source
              <select
                aria-label="Event source"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
              >
                <option value="">All sources</option>
                {sources.map((s) => (
                  <option key={s.sourceId} value={s.sourceId}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Event type
              <select
                aria-label="Event type"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="">All event types</option>
                {eventKinds.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label>
              Severity hint
              <select
                aria-label="Severity hint"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                <option value="">All severity hints</option>
                {["info", "low", "medium", "high"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              From
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={automatic}
                onChange={(e) => setAutomatic(e.target.checked)}
              />
              Refresh while visible
            </label>
          </div>
          <p>
            Severity is an untrusted sender hint, not a detection result. Times
            below are actual recorded timestamps. Default window: last 24 hours.
          </p>
          {eventError && <p role="alert">{eventError}</p>}
          {eventLoading && !page ? (
            <p role="status">Loading persisted telemetry…</p>
          ) : eventError && !page ? null : !page?.items.length ? (
            <Empty
              title="No received events"
              description="No persisted telemetry matches this window. This does not establish that the application is safe."
            />
          ) : (
            page.items.map((item) => (
              <div
                className="activity-row"
                key={`${item.sourceId}/${item.event.eventId}`}
              >
                <div>
                  <strong>{item.event.kind}</strong>
                  <p>
                    <Badge>
                      {item.evidence.origin === "controlled_test"
                        ? "Controlled test"
                        : "Runtime · source-declared"}
                    </Badge>{" "}
                    · {item.event.severityHint} · {item.sourceId}
                  </p>
                  <small>
                    Occurred {format(item.event.occurredAt)} · Recorded{" "}
                    {format(item.ingestedAt)}
                  </small>
                </div>
                <Button variant="secondary" onClick={() => setSelected(item)}>
                  Inspect event
                </Button>
              </div>
            ))
          )}
          {page?.nextCursor && (
            <Button
              variant="secondary"
              disabled={eventLoading}
              onClick={() => {
                void more();
              }}
            >
              Load older events
            </Button>
          )}
          {selected && (
            <section aria-label="Redacted event details">
              <h2>Redacted event details</h2>
              <p>
                No request bodies, headers, query strings, raw actor identifiers
                or secret attributes are retained.
              </p>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {JSON.stringify(selected, null, 2)}
              </pre>
              <Button variant="secondary" onClick={() => setSelected(null)}>
                Close event details
              </Button>
            </section>
          )}
        </Card>
      )}
    </div>
  );
}
