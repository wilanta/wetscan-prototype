"use client";
import { LiveSentinelNav } from "./live-nav";
import { useCallback, useEffect, useState } from "react";
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
import {
  DEFAULT_GHOST_DECOY_PATH,
  GHOST_FALSE_POSITIVE_POLICY,
  type GhostDecoyConnectionStatus,
  type GhostDecoyRecord,
  type GhostOverview,
} from "../ghost/model";
import type { StoredSecurityEvent } from "../types";

const knownErrors: Record<string, string> = {
  ghost_not_configured:
    "Ghost Lite is not configured (NOT_CONFIGURED). Database migration 0007 is not applied.",
  owned_application_confirmation_required:
    "Confirm that you own or have explicit H07 permission for the test application.",
  invalid_decoy_path:
    "Decoy path must start with /__wetscan/ or /.well-known/ and use lowercase alphanumeric or hyphen characters.",
  invalid_decoy_name:
    "Provide a concise decoy name starting with a letter (1–60 characters).",
  invalid_target_ref:
    "Provide a valid target reference (for example local-fixture:127.0.0.1).",
  source_not_found:
    "The selected telemetry source was not found for this project.",
  source_disabled:
    "The bound telemetry source is disabled. Enable the source before enabling this decoy.",
  decoy_conflict:
    "This source or decoy path is already configured for this project.",
  revision_conflict:
    "This decoy changed in another session. Refresh and retry.",
  disable_before_edit: "Disable this decoy before changing its configuration.",
  invalid_transition:
    "This decoy is already in the requested enabled/disabled state.",
  decoy_limit: "Maximum Ghost decoys reached for this project.",
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
  if (!response.ok) {
    throw Error(
      knownErrors[json.error] ??
        (response.status === 401
          ? "Sign in again to access this project."
          : response.status === 404
            ? "This project or decoy record is unavailable to your account."
            : response.status === 503
              ? "Ghost Lite storage is not configured or is temporarily unavailable."
              : "Request rejected. Check your decoy configuration and try again."),
    );
  }
  return json;
}

const at = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" }) +
      " WIB"
    : "None recorded";

const statusBadge: Record<
  GhostDecoyConnectionStatus,
  [string, "neutral" | "blue" | "green" | "amber" | "red"]
> = {
  disabled: ["Disabled (default-safe)", "neutral"],
  not_configured: ["Enabled · awaiting credential/contact", "amber"],
  connected: ["Connected", "green"],
  stale: ["Stale contact", "amber"],
  disconnected: ["Disconnected", "red"],
  failed: ["Failed", "red"],
};

export function LiveGhost({ projectId }: { projectId: string }) {
  const root = `/api/sentinel/projects/${encodeURIComponent(projectId)}`;
  const [overview, setOverview] = useState<GhostOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedHit, setSelectedHit] = useState<StoredSecurityEvent | null>(
    null,
  );
  const [ruleConfirm, setRuleConfirm] = useState(false);

  const [sourceId, setSourceId] = useState("");
  const [name, setName] = useState("Ghost Lite local fixture");
  const [targetRef, setTargetRef] = useState("local-fixture:127.0.0.1");
  const [decoyPath, setDecoyPath] = useState(DEFAULT_GHOST_DECOY_PATH);
  const [responseStatus, setResponseStatus] = useState<200 | 204 | 404>(200);
  const [rateLimitPerMin, setRateLimitPerMin] = useState(30);
  const [ownedConfirmed, setOwnedConfirmed] = useState(false);
  const [enableConfirmById, setEnableConfirmById] = useState<
    Record<string, boolean>
  >({});

  const load = useCallback(async () => {
    setError("");
    try {
      const data: GhostOverview = await api(`${root}/ghost`);
      setOverview(data);
      setSourceId((prev) => prev || data.sources[0]?.sourceId || "");
    } catch (e) {
      setOverview(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [root]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);

  async function runGhost(body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(`${root}/ghost`, body);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runRule(body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(`${root}/rules`, body);
      setRuleConfirm(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const rule = overview?.rule ?? null;
  const decoys: GhostDecoyRecord[] = overview?.decoys ?? [];
  const sources = overview?.sources ?? [];

  return (
    <div className="page" style={{ overflowWrap: "anywhere" }}>
      <PageHeader
        eyebrow="SENTINEL · GHOST LITE"
        title="Harmless decoy signal & evidence pipeline."
        description="Opt-in, default-disabled decoy endpoint routed through authorized S02 telemetry, S03 controlled-decoy-v1 detection, and S04 incidents. Never captures credentials or triggers automatic blocking."
      />
      <LiveSentinelNav projectId={projectId} active="/ghost" />

      <Notice tone="amber">
        {overview?.falsePositivePolicy ?? GHOST_FALSE_POSITIVE_POLICY}
      </Notice>

      {error && (
        <div role="alert">
          <Notice tone="amber">{error}</Notice>
        </div>
      )}

      <div className="actions">
        <Button
          variant="secondary"
          disabled={loading || busy}
          onClick={() => void load()}
        >
          Refresh Ghost status
        </Button>
      </div>

      {loading && <p role="status">Loading Ghost Lite state…</p>}

      {!loading && overview && (
        <>
          <Card>
            <SectionHeading title="Decoy configuration & source status">
              <Badge tone="blue">{decoys.length} configured</Badge>
            </SectionHeading>
            {!sources.length ? (
              <Empty
                title="No authorized telemetry source"
                description="Register an owned telemetry source before attaching a Ghost Lite decoy endpoint."
                action={
                  <Link
                    className="button primary"
                    href={`/app/projects/${projectId}/sentinel/sources`}
                  >
                    Configure telemetry source
                  </Link>
                }
              />
            ) : (
              <>
                {!decoys.length && (
                  <Empty
                    title="No Ghost Lite decoy configured"
                    description="Register a decoy bound to an authorized source. New decoys always start disabled."
                  />
                )}
                {decoys.map((decoy) => {
                  const [label, tone] = statusBadge[decoy.connectionStatus];
                  const confirmChecked =
                    enableConfirmById[decoy.decoyId] ?? false;
                  return (
                    <div className="activity-row" key={decoy.decoyId}>
                      <div>
                        <strong>{decoy.name}</strong>
                        <p>
                          <Badge tone={tone}>{label}</Badge>{" "}
                          <Badge>
                            {decoy.origin === "controlled_test"
                              ? "Controlled test"
                              : "Runtime · source-declared"}
                          </Badge>{" "}
                          · <code>{decoy.decoyPath}</code> · HTTP{" "}
                          {decoy.responseStatus} · {decoy.rateLimitPerMin}/min
                        </p>
                        <small>
                          Source: {decoy.sourceName} ({decoy.sourceId}) ·{" "}
                          {decoy.sourceEnabled
                            ? "source enabled"
                            : "source disabled"}{" "}
                          · {decoy.activeCredentials} active credential(s) ·
                          Target: {decoy.targetRef}
                          <br />
                          Last source contact: {at(decoy.lastContactAt)} · Last
                          decoy hit: {at(decoy.lastHitAt)} · Revision{" "}
                          {decoy.revision}
                        </small>
                      </div>
                      <div className="filters">
                        {decoy.enabled ? (
                          <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              void runGhost({
                                action: "disable",
                                decoyId: decoy.decoyId,
                                expectedRevision: decoy.revision,
                              })
                            }
                          >
                            Disable decoy
                          </Button>
                        ) : (
                          <>
                            <label>
                              <input
                                type="checkbox"
                                checked={confirmChecked}
                                onChange={(e) =>
                                  setEnableConfirmById((s) => ({
                                    ...s,
                                    [decoy.decoyId]: e.target.checked,
                                  }))
                                }
                              />{" "}
                              Confirm H07 local/staging opt-in
                            </label>
                            <Button
                              disabled={
                                busy || !confirmChecked || !decoy.sourceEnabled
                              }
                              onClick={() =>
                                void runGhost({
                                  action: "enable",
                                  decoyId: decoy.decoyId,
                                  expectedRevision: decoy.revision,
                                  ownedApplicationConfirmed: true,
                                })
                              }
                            >
                              Enable decoy
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!ownedConfirmed || !sourceId) return;
                    void runGhost({
                      action: "create",
                      sourceId,
                      name,
                      targetRef,
                      decoyPath,
                      responseStatus,
                      rateLimitPerMin,
                      ownedApplicationConfirmed: true,
                    });
                  }}
                >
                  <h3>Register Ghost decoy (starts disabled)</h3>
                  <div className="filters">
                    <label>
                      Telemetry source
                      <select
                        value={sourceId}
                        onChange={(e) => setSourceId(e.target.value)}
                      >
                        {sources.map((s) => (
                          <option key={s.sourceId} value={s.sourceId}>
                            {s.name} ({s.origin} · {s.environment})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Decoy name
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={60}
                        required
                      />
                    </label>
                    <label>
                      Decoy path
                      <input
                        value={decoyPath}
                        onChange={(e) => setDecoyPath(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Target reference
                      <input
                        value={targetRef}
                        onChange={(e) => setTargetRef(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Harmless response status
                      <select
                        value={responseStatus}
                        onChange={(e) =>
                          setResponseStatus(
                            Number(e.target.value) as 200 | 204 | 404,
                          )
                        }
                      >
                        <option value={200}>200 OK (inert JSON)</option>
                        <option value={204}>204 No Content</option>
                        <option value={404}>404 Not Found</option>
                      </select>
                    </label>
                    <label>
                      Max hits per minute
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={rateLimitPerMin}
                        onChange={(e) =>
                          setRateLimitPerMin(Number(e.target.value))
                        }
                      />
                    </label>
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={ownedConfirmed}
                      onChange={(e) => setOwnedConfirmed(e.target.checked)}
                    />{" "}
                    I own this test application or have explicit H07 permission
                    for this decoy endpoint.
                  </label>
                  <Button
                    type="submit"
                    disabled={busy || !ownedConfirmed || !sourceId}
                  >
                    Register disabled decoy
                  </Button>
                </form>
              </>
            )}
          </Card>

          <Card>
            <SectionHeading title="Detection rule (controlled-decoy-v1)">
              <Badge
                tone={
                  overview.ruleStatus === "ENABLED"
                    ? "green"
                    : overview.ruleStatus === "DRAFT"
                      ? "blue"
                      : "neutral"
                }
              >
                {overview.ruleStatus === "not_seeded"
                  ? "Not seeded"
                  : overview.ruleStatus}
              </Badge>
            </SectionHeading>
            <p>
              Uses the existing S03 detection rule lifecycle. Seeded rules start
              in DRAFT and never activate automatically in production.
            </p>
            {!rule ? (
              <div className="actions">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void runRule({ action: "seed" })}
                >
                  Seed DRAFT rules
                </Button>
                <Link
                  className="text-link"
                  href={`/app/projects/${projectId}/sentinel/rules`}
                >
                  Open Detection Rules
                </Link>
              </div>
            ) : (
              <div className="activity-row">
                <div>
                  <strong>
                    {rule.definition.name} (v{rule.version})
                  </strong>
                  <p>{rule.definition.description}</p>
                  <small>
                    Event kind: <code>ghost.decoy_triggered</code> · Window:{" "}
                    {rule.definition.windowSeconds}s · Threshold:{" "}
                    {rule.definition.threshold} · Cooldown:{" "}
                    {rule.definition.cooldownSeconds}s
                  </small>
                </div>
                <div className="filters">
                  {rule.status === "ENABLED" ? (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void runRule({
                          action: "disable",
                          ruleId: rule.ruleId,
                          expectedRevision: rule.revision,
                        })
                      }
                    >
                      Disable decoy rule
                    </Button>
                  ) : (
                    <>
                      <label>
                        <input
                          type="checkbox"
                          checked={ruleConfirm}
                          onChange={(e) => setRuleConfirm(e.target.checked)}
                        />{" "}
                        Approve decoy rule for this project scope
                      </label>
                      <Button
                        disabled={busy || !ruleConfirm}
                        onClick={() =>
                          void runRule({
                            action: "enable",
                            ruleId: rule.ruleId,
                            expectedRevision: rule.revision,
                          })
                        }
                      >
                        Enable decoy rule
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <SectionHeading title="Decoy activity & hit history">
              <Badge>{overview.hits.length} hit(s)</Badge>
            </SectionHeading>
            {!overview.hits.length ? (
              <Empty
                title="No decoy hits recorded"
                description="No authorized ghost.decoy_triggered telemetry events exist for this project yet."
              />
            ) : (
              overview.hits.map((hit) => (
                <div
                  className="activity-row"
                  key={`${hit.sourceId}/${hit.event.eventId}`}
                >
                  <div>
                    <strong>
                      {hit.event.request?.method ?? "GET"}{" "}
                      <code>
                        {hit.event.request?.routeTemplate ??
                          DEFAULT_GHOST_DECOY_PATH}
                      </code>
                    </strong>
                    <p>
                      <Badge>
                        {hit.evidence.origin === "controlled_test"
                          ? "Controlled test"
                          : "Runtime · source-declared"}
                      </Badge>{" "}
                      {hit.event.attributes?.signalClassification
                        ? `· ${String(hit.event.attributes.signalClassification).replaceAll("_", " ")} `
                        : ""}
                      · source {hit.sourceId}
                    </p>
                    <small>
                      Occurred {at(hit.event.occurredAt)} · Ingested{" "}
                      {at(hit.ingestedAt)} · Event {hit.event.eventId}
                    </small>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => setSelectedHit(hit)}
                  >
                    Inspect hit
                  </Button>
                </div>
              ))
            )}
            {selectedHit && (
              <section aria-label="Redacted decoy hit details">
                <h3>Redacted decoy hit details</h3>
                <p>
                  No raw passwords, tokens, cookies, authorization headers,
                  request bodies, or IP addresses are retained.
                </p>
                <pre
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {JSON.stringify(selectedHit, null, 2)}
                </pre>
                <Button
                  variant="secondary"
                  onClick={() => setSelectedHit(null)}
                >
                  Close hit details
                </Button>
              </section>
            )}
          </Card>

          <Card>
            <SectionHeading title="Evidence-backed decoy alerts">
              <Badge>{overview.alerts.length} alert(s)</Badge>
            </SectionHeading>
            {!overview.alerts.length ? (
              <Empty
                title="No decoy alerts yet"
                description="Alerts appear only after the Sentinel worker processes an event while controlled-decoy-v1 is ENABLED."
              />
            ) : (
              overview.alerts.map((alert) => (
                <div className="activity-row" key={alert.alertId}>
                  <div>
                    <strong>
                      {alert.ruleName} v{alert.ruleVersion}
                    </strong>
                    <p>
                      <Badge tone={alert.severity === "high" ? "red" : "amber"}>
                        {alert.severity}
                      </Badge>{" "}
                      <Badge>
                        {alert.origin === "controlled_test"
                          ? "Controlled test"
                          : "Runtime · source-declared"}
                      </Badge>{" "}
                      · {alert.matchedEventCount} matched hit(s) · confidence{" "}
                      {alert.confidence}/100
                    </p>
                    <small>
                      Detected {at(alert.detectedAt)} · Alert {alert.alertId}
                    </small>
                  </div>
                  <Link
                    className="text-link"
                    href={`/app/projects/${projectId}/sentinel/alerts`}
                  >
                    View alerts
                  </Link>
                </div>
              ))
            )}
          </Card>

          <Card>
            <SectionHeading title="Linked incidents">
              <Badge>{overview.incidents.length} incident(s)</Badge>
            </SectionHeading>
            {!overview.incidents.length ? (
              <Empty
                title="No linked decoy incidents"
                description="Correlated S04 decoy incidents appear here with evidence references and manual workflow controls."
              />
            ) : (
              overview.incidents.map((incident) => (
                <div className="activity-row" key={incident.incidentId}>
                  <div>
                    <strong>{incident.title}</strong>
                    <p>
                      <Badge
                        tone={
                          incident.status === "open"
                            ? "red"
                            : incident.status === "investigating"
                              ? "amber"
                              : "neutral"
                        }
                      >
                        {incident.status.toUpperCase()}
                      </Badge>{" "}
                      <Badge>
                        {incident.origin === "controlled_test"
                          ? "Controlled test"
                          : "Runtime · source-declared"}
                      </Badge>{" "}
                      · {incident.alertIds.length} alert(s) ·{" "}
                      {incident.evidenceIds.length} evidence event(s)
                    </p>
                    <small>
                      First observed {at(incident.firstObservedAt)} · Last
                      observed {at(incident.lastObservedAt)}
                    </small>
                  </div>
                  <Link
                    className="button secondary"
                    href={`/app/projects/${projectId}/sentinel/incidents/${incident.incidentId}`}
                  >
                    Inspect incident
                  </Link>
                </div>
              ))
            )}
            <p className="small-text muted">
              {overview.futureS08Archive.reason}
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
