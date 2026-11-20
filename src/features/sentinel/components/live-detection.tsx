"use client";
import { LiveSentinelNav } from "./live-nav";
import { useEffect, useState, useRef } from "react";
import {
  Badge,
  Button,
  Card,
  Empty,
  Notice,
  PageHeader,
} from "@/components/ui";
import type {
  AlertPage,
  DetectionRule,
  RuleDefinition,
  SecurityAlert,
} from "../detection/model";

const initial: RuleDefinition = {
  schemaVersion: 1,
  name: "HTTP error pattern",
  description: "Repeated normalized HTTP error responses from one source.",
  category: "http",
  severity: "low",
  confidence: 40,
  eventKinds: ["http.request"],
  conditions: [{ field: "request.statusCode", op: "gte", value: 400 }],
  correlation: "source",
  windowSeconds: 300,
  threshold: 5,
  cooldownSeconds: 300,
  suppressionWindows: [],
};
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
      revision_conflict: "This rule changed. Refresh before editing again.",
      disable_before_edit:
        "Disable this rule before editing its configuration.",
      actor_identity_not_persisted:
        "Actor correlation is unavailable: S02 does not persist actor identity.",
      project_not_registered: "Register an authorized telemetry source first.",
      invalid_rule_number:
        "Check the window, threshold, confidence and cooldown limits.",
    };
    throw Error(
      known[result.error] ??
        (response.status === 401
          ? "Sign in again."
          : response.status === 404
            ? "This project or record is unavailable to your account."
            : response.status === 503
              ? "Detection storage is not configured or is unavailable."
              : "Request rejected. Check the rule configuration and try again."),
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
export function LiveDetection({
  projectId,
  section,
}: {
  projectId: string;
  section: "/rules" | "/alerts";
}) {
  const root = `/api/sentinel/projects/${encodeURIComponent(projectId)}`;
  const [rules, setRules] = useState<DetectionRule[]>([]),
    [page, setPage] = useState<AlertPage | null>(null),
    [error, setError] = useState(""),
    [formError, setFormError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [draft, setDraft] = useState<RuleDefinition>(initial),
    [editing, setEditing] = useState<DetectionRule | null>(null),
    [conditions, setConditions] = useState(JSON.stringify(initial.conditions)),
    [quiet, setQuiet] = useState("[]");
  const [detail, setDetail] = useState<unknown>(null),
    [selected, setSelected] = useState<string | null>(null);
  const generation = useRef(0);
  const [severity, setSeverity] = useState(""),
    [ruleId, setRuleId] = useState(""),
    [sourceId, setSourceId] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries({
    severity,
    ruleId,
    sourceId,
    from: from && new Date(from).toISOString(),
    to: to && new Date(to).toISOString(),
  }))
    if (v) query.set(k, v);
  const queryText = query.toString();
  useEffect(() => {
    ++generation.current;
    const stop = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      setDetail(null);
      setSelected(null);
      setPage(null);
      void api(
        root + (section === "/rules" ? "/rules" : "/alerts?" + queryText),
        undefined,
        stop.signal,
      )
        .then((value) => {
          if (!stop.signal.aborted) {
            if (section === "/rules") setRules(value.rules);
            else setPage(value);
          }
        })
        .catch((e) => {
          if (!stop.signal.aborted) {
            setError(e.message);
            setRules([]);
          }
        })
        .finally(() => {
          if (!stop.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      stop.abort();
    };
  }, [root, section, queryText, refresh]);
  async function change(body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(root + "/rules", body);
      setRefresh((v) => v + 1);
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function inspect(id: string) {
    const current = generation.current;
    setBusy(true);
    setError("");
    setDetail(null);
    setSelected(id);
    try {
      const value = await api(
        root +
          (section === "/rules" ? "/rules?ruleId=" : "/alerts?alertId=") +
          encodeURIComponent(id),
      );
      if (current === generation.current) setDetail(value);
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
      const next: AlertPage = await api(
        root +
          "/alerts?" +
          queryText +
          "&cursor=" +
          encodeURIComponent(page.nextCursor),
      );
      if (current === generation.current)
        setPage({ ...next, items: [...page.items, ...next.items] });
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(rule: DetectionRule) {
    setFormError("");
    setEditing(rule);
    setDraft(rule.definition);
    setConditions(JSON.stringify(rule.definition.conditions));
    setQuiet(JSON.stringify(rule.definition.suppressionWindows));
  }
  return (
    <div className="page" style={{ overflowWrap: "anywhere" }}>
      <PageHeader
        eyebrow="SENTINEL · LIVE PROJECT"
        title={section === "/rules" ? "Detection Rules" : "Persisted Alerts"}
        description="Project-scoped detections with versioned rules and redacted evidence. No incident, response or external notification is created."
      />
      <LiveSentinelNav projectId={projectId} active={section} />
      <Notice>
        Live project data is separate from Orderly Demo. Controlled tests are
        labelled. A matched rule does not establish that an attack succeeded.
        Worker activation requires owner approval.
      </Notice>
      {(error || formError) && (
        <p role="alert">{[error, formError].filter(Boolean).join(" ")}</p>
      )}
      <Button
        variant="secondary"
        disabled={busy || loading}
        onClick={() => setRefresh((v) => v + 1)}
      >
        Refresh detections
      </Button>
      {loading && <p role="status">Loading detection records…</p>}
      {section === "/rules" ? (
        <>
          <Card>
            <h2>Versioned rules</h2>
            <p>
              Seed examples are opt-in drafts. Actor-based authentication
              detection is unsupported because actor identity is not stored.
            </p>
            <Button
              disabled={busy}
              onClick={() => void change({ action: "seed" })}
            >
              Create example drafts
            </Button>
            {!loading && !rules.length && !error && (
              <Empty
                title="No detection rules"
                description="Create a draft, review it and explicitly enable it. Nothing is seeded automatically."
              />
            )}
            {rules.map((rule) => (
              <article key={rule.ruleId} aria-label={rule.definition.name}>
                <h3>{rule.definition.name}</h3>
                <Badge tone={rule.status === "ENABLED" ? "green" : "neutral"}>
                  {rule.status}
                </Badge>
                <p>
                  Version {rule.version} · {rule.definition.threshold} events /{" "}
                  {rule.definition.windowSeconds}s · {rule.definition.severity}{" "}
                  · confidence {rule.definition.confidence}/100
                </p>
                {!rule.supported && (
                  <p>Unsupported: actor identity is not persisted.</p>
                )}
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void inspect(rule.ruleId)}
                >
                  Inspect rule
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || rule.status === "ENABLED"}
                  onClick={() => edit(rule)}
                >
                  Edit draft
                </Button>
                <Button
                  disabled={busy || !rule.supported}
                  onClick={() =>
                    void change({
                      action: rule.status === "ENABLED" ? "disable" : "enable",
                      ruleId: rule.ruleId,
                      expectedRevision: rule.revision,
                    })
                  }
                >
                  {rule.status === "ENABLED" ? "Disable rule" : "Enable rule"}
                </Button>
              </article>
            ))}
          </Card>
          <Card>
            <h2>{editing ? "Edit rule draft" : "Create rule draft"}</h2>
            <p>
              UTC event-time buckets are start-inclusive and end-exclusive.
              Cooldown uses database processing time. Disabling then editing
              creates a new draft version.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setFormError("");
                try {
                  const config = {
                    ...draft,
                    conditions: JSON.parse(conditions),
                    suppressionWindows: JSON.parse(quiet),
                  };
                  void change(
                    editing
                      ? {
                          action: "update",
                          ruleId: editing.ruleId,
                          expectedRevision: editing.revision,
                          definition: config,
                        }
                      : { action: "create", definition: config },
                  );
                } catch {
                  setFormError(
                    "Conditions and suppression windows must be valid JSON.",
                  );
                }
              }}
            >
              <div className="filters">
                <label>
                  Rule name
                  <input
                    required
                    maxLength={80}
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Description
                  <input
                    required
                    maxLength={400}
                    value={draft.description}
                    onChange={(e) =>
                      setDraft({ ...draft, description: e.target.value })
                    }
                  />
                </label>
                <label>
                  Event kind
                  <select
                    value={draft.eventKinds[0]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        eventKinds: [
                          e.target
                            .value as RuleDefinition["eventKinds"][number],
                        ],
                      })
                    }
                  >
                    {[
                      "auth.failed",
                      "http.suspicious_path",
                      "http.request",
                      "ghost.decoy_triggered",
                    ].map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Category
                  <select
                    value={draft.category}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        category: e.target.value as RuleDefinition["category"],
                      })
                    }
                  >
                    {["authentication", "http", "decoy"].map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Correlation
                  <select
                    value={draft.correlation}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        correlation: e.target
                          .value as RuleDefinition["correlation"],
                      })
                    }
                  >
                    <option value="source">Source only</option>
                    <option value="actor_hash">Actor hash (unsupported)</option>
                  </select>
                </label>
                <label>
                  Rule severity
                  <select
                    value={draft.severity}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        severity: e.target.value as RuleDefinition["severity"],
                      })
                    }
                  >
                    {["low", "medium", "high"].map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
                {(
                  [
                    ["Threshold", "threshold", 1, 500],
                    ["Window seconds", "windowSeconds", 1, 3600],
                    ["Cooldown seconds", "cooldownSeconds", 0, 86400],
                    ["Confidence", "confidence", 0, 100],
                  ] as const
                ).map(([label, key, min, max]) => (
                  <label key={key}>
                    {label}
                    <input
                      required
                      type="number"
                      min={min}
                      max={max}
                      value={draft[key]}
                      onChange={(e) =>
                        setDraft({ ...draft, [key]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
              </div>
              <details>
                <summary>Matching conditions and suppression windows</summary>
                <p>
                  Conditions permit only normalized method, status code, reason
                  code and duration. No executable expressions or regular
                  expressions. Suppression windows use UTC from/to timestamps
                  and affect detection, not notification scheduling.
                </p>
                <label>
                  Conditions JSON
                  <textarea
                    maxLength={2500}
                    value={conditions}
                    onChange={(e) => setConditions(e.target.value)}
                  />
                </label>
                <label>
                  Suppression windows JSON
                  <textarea
                    maxLength={2500}
                    value={quiet}
                    onChange={(e) => setQuiet(e.target.value)}
                  />
                </label>
              </details>
              <Button type="submit" disabled={busy}>
                Save draft
              </Button>
              {editing && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setFormError("");
                    setEditing(null);
                    setDraft(initial);
                    setConditions(JSON.stringify(initial.conditions));
                    setQuiet("[]");
                  }}
                >
                  Cancel edit
                </Button>
              )}
            </form>
          </Card>
        </>
      ) : (
        <>
          <Card>
            <h2>Alert filters</h2>
            <div className="filters">
              <label>
                Alert severity
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  <option value="">All severities</option>
                  {["low", "medium", "high"].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
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
                Detected from
                <input
                  type="datetime-local"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                Detected to
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
              title="No persisted alerts"
              description="No alerts match this window. This does not establish that the application is safe or monitored."
            />
          )}
          {page?.items.map((alert: SecurityAlert) => (
            <Card key={alert.alertId}>
              <h2>{alert.ruleName}</h2>
              <Badge tone={alert.severity === "high" ? "red" : "amber"}>
                {alert.severity}
              </Badge>
              <p>
                {alert.origin === "controlled_test"
                  ? "Controlled test"
                  : "Source-declared runtime"}{" "}
                · confidence {alert.confidence}/100 · {alert.matchedEventCount}{" "}
                matched events
              </p>
              <p>
                Rule version {alert.ruleVersion} · source {alert.sourceId}
              </p>
              <p>
                Observed {at(alert.firstObservedAt)} –{" "}
                {at(alert.lastObservedAt)}
              </p>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void inspect(alert.alertId)}
              >
                Inspect alert
              </Button>
            </Card>
          ))}
          {page?.nextCursor && (
            <Button disabled={busy || loading} onClick={() => void older()}>
              Load older alerts
            </Button>
          )}
        </>
      )}
      {detail !== null && (
        <Card>
          <section
            aria-label={
              section === "/rules"
                ? "Rule versions and audit"
                : "Redacted alert evidence"
            }
          >
            <h2>
              {section === "/rules"
                ? "Immutable versions and evaluation audit"
                : "Alert evidence and exact rule version"}
            </h2>
            <p>{selected}</p>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {JSON.stringify(detail, null, 2)}
            </pre>
          </section>
        </Card>
      )}
    </div>
  );
}
