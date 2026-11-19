"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Notice,
  PageHeader,
  SectionHeading,
  TextLink,
} from "@/components/ui";
import { LiveSentinelNav } from "./live-nav";
import type { LiveReport, Section } from "../reports/live-report";

type Tone = "neutral" | "blue" | "green" | "amber" | "red";
const when = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" }) + " WIB"
    : "never";

function useLiveReport(projectId: string, days: number) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; report: LiveReport }
  >({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const stop = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `/api/sentinel/projects/${encodeURIComponent(projectId)}/report?days=${days}`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: AbortSignal.any([stop.signal, AbortSignal.timeout(30000)]),
          },
        );
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "Sign in again to access this project."
              : response.status === 404
                ? "This project is no longer available to your account."
                : response.status === 503
                  ? "Sentinel storage is not configured or is temporarily unavailable. No summary is shown."
                  : "The summary could not be loaded. Retry in a moment.",
          );
        const report = (await response.json()) as LiveReport;
        if (
          report.kind !== "wetscan.sentinel.live_report" ||
          report.mode !== "live" ||
          report.scope.projectId !== projectId
        )
          throw new Error("The response did not match this project.");
        if (!stop.signal.aborted) setState({ kind: "ready", report });
      } catch (error) {
        if (!stop.signal.aborted)
          setState({
            kind: "error",
            message:
              error instanceof Error && error.message
                ? error.message
                : "The summary could not be loaded.",
          });
      }
    })();
    return () => stop.abort();
  }, [projectId, days, attempt]);
  const retry = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  return { state, retry };
}

function Unavailable({ section }: { section: Section<unknown> }) {
  return (
    <p className="muted">
      {section.state === "not_configured"
        ? "Not configured: this module's storage is not set up in this environment. Nothing is shown as healthy."
        : "Unavailable: this module could not be read. Nothing is shown as healthy."}
    </p>
  );
}
function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: Tone;
}) {
  return (
    <div>
      <small>{label}</small>
      <h3>{tone ? <Badge tone={tone}>{value}</Badge> : value}</h3>
    </div>
  );
}
const stateBadge = (s: Section<unknown>) => (
  <Badge tone={s.state === "ok" ? "blue" : "amber"}>
    {s.state === "ok" ? "Persisted records" : s.state.replace("_", " ")}
  </Badge>
);

function Panels({ report, base }: { report: LiveReport; base: string }) {
  const s = report.sections;
  const t = s.telemetry;
  const connected =
    t.state === "ok"
      ? t.data.sources.filter((x) => x.status === "connected").length
      : 0;
  const runtimeConnected =
    t.state === "ok"
      ? t.data.sources.filter(
          (x) => x.status === "connected" && x.origin === "runtime",
        ).length
      : 0;
  return (
    <div className="three-columns">
      <Card>
        <SectionHeading title="Telemetry">{stateBadge(t)}</SectionHeading>
        {t.state === "ok" ? (
          <>
            <Stat
              label="Sources connected"
              value={`${connected} / ${t.data.sources.length}`}
              tone={connected ? "blue" : "amber"}
            />
            <p>
              {t.data.events.total} events in the last {report.windowDays}{" "}
              day(s)
              {" · "}
              {runtimeConnected} runtime source(s) connected
            </p>
            {!runtimeConnected && (
              <p className="muted">Runtime traffic is not monitored.</p>
            )}
          </>
        ) : (
          <Unavailable section={t} />
        )}
        <TextLink href={`${base}/sources`}>Sources</TextLink>
        {" · "}
        <TextLink href={`${base}/activity`}>Event Explorer</TextLink>
      </Card>
      <Card>
        <SectionHeading title="Alerts & incidents">
          {stateBadge(s.incidents)}
        </SectionHeading>
        {s.detection.state === "ok" && s.incidents.state === "ok" ? (
          <>
            <Stat label="Alerts" value={s.detection.data.alerts.total} />
            <Stat
              label="Incidents with activity"
              value={s.incidents.data.total}
            />
            <p className="muted">{s.incidents.data.note}</p>
          </>
        ) : (
          <Unavailable
            section={s.incidents.state === "ok" ? s.detection : s.incidents}
          />
        )}
        <TextLink href={`${base}/alerts`}>Alerts</TextLink>
        {" · "}
        <TextLink href={`${base}/incidents`}>Incidents</TextLink>
      </Card>
      <Card>
        <SectionHeading title="Responses">
          {stateBadge(s.responses)}
        </SectionHeading>
        {s.responses.state === "ok" ? (
          <>
            <Stat
              label="Independently verified"
              value={s.responses.data.independentlyVerified}
              tone={
                s.responses.data.independentlyVerified ? "green" : "neutral"
              }
            />
            <Stat
              label="Applied / pending · NOT verified"
              value={s.responses.data.appliedNotVerified}
              tone={s.responses.data.appliedNotVerified ? "amber" : "neutral"}
            />
            <p className="muted">{s.responses.data.note}</p>
          </>
        ) : (
          <Unavailable section={s.responses} />
        )}
        <TextLink href={`${base}/responses`}>Responses</TextLink>
      </Card>
      <Card>
        <SectionHeading title="Notifications">
          {stateBadge(s.notifications)}
        </SectionHeading>
        {s.notifications.state === "ok" ? (
          <>
            <Stat
              label="Provider accepted"
              value={s.notifications.data.deliveries.providerAccepted}
            />
            <Stat
              label="Delivery confirmed"
              value={s.notifications.data.deliveries.delivered}
            />
            <p className="muted">{s.notifications.data.note}</p>
          </>
        ) : (
          <Unavailable section={s.notifications} />
        )}
        <TextLink href={`${base}/notifications`}>Notifications</TextLink>
      </Card>
      <Card>
        <SectionHeading title="Ghost Lite">
          {stateBadge(s.ghost)}
        </SectionHeading>
        {s.ghost.state === "ok" ? (
          <>
            <Stat
              label="Decoys enabled"
              value={`${s.ghost.data.decoys.enabled} / ${s.ghost.data.decoys.total}`}
            />
            <p>
              {s.ghost.data.hits} recent decoy signal(s) · rule{" "}
              {s.ghost.data.ruleStatus}
            </p>
            <p className="muted">{s.ghost.data.note}</p>
          </>
        ) : (
          <Unavailable section={s.ghost} />
        )}
        <TextLink href={`${base}/ghost`}>Ghost</TextLink>
      </Card>
      <Card>
        <SectionHeading title="Intelligence">
          {stateBadge(s.internalIntelligence)}
        </SectionHeading>
        {s.internalIntelligence.state === "ok" ? (
          <p>
            {s.internalIntelligence.data.cases} archived case(s) ·{" "}
            {s.internalIntelligence.data.candidates.total} DRAFT rule
            candidate(s) awaiting human review
          </p>
        ) : (
          <Unavailable section={s.internalIntelligence} />
        )}
        {s.externalIntelligence.state === "ok" ? (
          <>
            <p>
              Advisory catalog: {s.externalIntelligence.data.catalog.advisories}{" "}
              advisories · exposure assessment:{" "}
              <Badge
                tone={
                  s.externalIntelligence.data.exposure.assessment ===
                  "potential_exposure"
                    ? "amber"
                    : "neutral"
                }
              >
                {s.externalIntelligence.data.exposure.assessment.replaceAll(
                  "_",
                  " ",
                )}
              </Badge>
            </p>
            <p className="muted">
              Declared-dependency context, not observed exploitation.
            </p>
          </>
        ) : (
          <Unavailable section={s.externalIntelligence} />
        )}
        <TextLink href={`${base}/intelligence`}>Intelligence</TextLink>
      </Card>
    </div>
  );
}

function IntegrationsCard({ report }: { report: LiveReport }) {
  return (
    <Card>
      <SectionHeading title="Cross-module integration status" />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Integration</th>
              <th>Status</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(report.integrations).map((i) => (
              <tr key={i.id}>
                <td>{i.id}</td>
                <td>
                  <Badge tone={i.status === "implemented" ? "blue" : "neutral"}>
                    {i.status.replaceAll("_", " ")}
                  </Badge>
                </td>
                <td>{i.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Frame({
  state,
  retry,
  children,
}: {
  state: ReturnType<typeof useLiveReport>["state"];
  retry: () => void;
  children: (report: LiveReport) => React.ReactNode;
}) {
  if (state.kind === "loading")
    return (
      <Card role="status" aria-live="polite">
        Loading persisted summaries…
      </Card>
    );
  if (state.kind === "error")
    return (
      <div role="alert">
        <Notice tone="amber">{state.message}</Notice>
        <Button variant="secondary" onClick={retry}>
          Retry
        </Button>
      </div>
    );
  return <>{children(state.report)}</>;
}

export function LiveOverview({ projectId }: { projectId: string }) {
  const { state, retry } = useLiveReport(projectId, 1);
  const base = `/app/projects/${projectId}/sentinel`;
  return (
    <div className="page" style={{ overflowWrap: "anywhere" }}>
      <PageHeader
        eyebrow="SENTINEL · LIVE PROJECT"
        title="What Sentinel can see for this project."
        description="Summaries come only from persisted, project-scoped records. Missing monitoring is never shown as safe."
      />
      <LiveSentinelNav projectId={projectId} active="" />
      <Notice>
        Repository access does not establish runtime monitoring. Orderly Demo is
        separate and synthetic. Figures cover the last 24 hours.
      </Notice>
      <Frame state={state} retry={retry}>
        {(report) => {
          const t = report.sections.telemetry;
          const connected =
            t.state === "ok" &&
            t.data.sources.some((s) => s.status === "connected");
          return (
            <>
              {!connected && (
                <Notice tone="amber">
                  {t.state === "ok"
                    ? "No telemetry source is currently connected. Absence of events or incidents here does not mean this application is safe."
                    : "Telemetry could not be read, so monitoring status is unknown."}{" "}
                  <TextLink href={`${base}/sources`}>Connect a source</TextLink>
                </Notice>
              )}
              <Panels report={report} base={base} />
              <IntegrationsCard report={report} />
              <p className="muted">
                Generated {when(report.generatedAt)} ·{" "}
                <TextLink href={`${base}/reports`}>
                  Open the full report
                </TextLink>
              </p>
            </>
          );
        }}
      </Frame>
    </div>
  );
}

export function LiveReports({ projectId }: { projectId: string }) {
  const [days, setDays] = useState(7);
  const { state, retry } = useLiveReport(projectId, days);
  const base = `/app/projects/${projectId}/sentinel`;
  const api = `/api/sentinel/projects/${encodeURIComponent(projectId)}/report`;
  return (
    <div className="page report-page" style={{ overflowWrap: "anywhere" }}>
      <PageHeader
        eyebrow="SENTINEL · LIVE REPORT"
        title="Evidence-aware project report."
        description="Aggregates from persisted records only, with provenance, freshness and explicit limitations. Demo reports remain in Orderly Demo."
        action={
          <div className="actions no-print">
            <a
              className="button secondary"
              href={`${api}?format=json&download=1&days=${days}`}
              download
            >
              Download JSON
            </a>
            <a
              className="button secondary"
              href={`${api}?format=csv&download=1&days=${days}`}
              download
            >
              Download CSV
            </a>
            <Button variant="secondary" onClick={() => window.print()}>
              Print
            </Button>
          </div>
        }
      />
      <div className="no-print">
        <LiveSentinelNav projectId={projectId} active="/reports" />
      </div>
      <label className="field no-print">
        Time window
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          aria-label="Report time window"
        >
          <option value={1}>Last 24 hours</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </label>
      <Frame state={state} retry={retry}>
        {(report) => (
          <>
            <Card>
              <SectionHeading title="Scope & provenance">
                <Badge tone="blue">LIVE · not synthetic</Badge>
              </SectionHeading>
              <p>
                Project <code>{report.scope.projectId}</code> · window{" "}
                {report.windowDays} day(s) · generated{" "}
                {when(report.generatedAt)}
              </p>
              <p className="muted">
                Event, alert and incident counts are labelled by origin (runtime
                vs controlled test). Other sections show current stored state
                within each module&apos;s retention limits.
              </p>
            </Card>
            <Panels report={report} base={base} />
            <Card>
              <SectionHeading title="Detail by origin" />
              {report.sections.telemetry.state === "ok" && (
                <ul>
                  {Object.entries(
                    report.sections.telemetry.data.events.byOrigin,
                  ).map(([k, v]) => (
                    <li key={k}>
                      Events · {k === "controlled_test" ? "controlled test" : k}
                      : {v}
                    </li>
                  ))}
                  {report.sections.telemetry.data.sources.map((s) => (
                    <li key={s.sourceId}>
                      Source “{s.name}” ·{" "}
                      {s.origin === "controlled_test"
                        ? "controlled test"
                        : s.origin}{" "}
                      · {s.environment} · {s.status} · last event{" "}
                      {when(s.lastIngestedAt)}
                    </li>
                  ))}
                </ul>
              )}
              {report.sections.externalIntelligence.state === "ok" && (
                <>
                  <h3>Advisory sources & inventory</h3>
                  <ul>
                    {report.sections.externalIntelligence.data.sources.map(
                      (s) => (
                        <li key={s.provider}>
                          {s.provider}: {s.status} · {s.freshness} · last
                          success {when(s.lastSuccessAt)}
                        </li>
                      ),
                    )}
                    <li>
                      Inventory:{" "}
                      {report.sections.externalIntelligence.data.inventory
                        .source === "none"
                        ? "none collected (cannot assess)"
                        : `repository lockfile · ${report.sections.externalIntelligence.data.inventory.itemCount} items · commit ${report.sections.externalIntelligence.data.inventory.commitSha?.slice(0, 7)} · ${report.sections.externalIntelligence.data.inventory.expired ? "EXPIRED" : "current"}`}
                    </li>
                  </ul>
                  {report.sections.externalIntelligence.data.exposure.items
                    .length > 0 && (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Advisory</th>
                            <th>Package</th>
                            <th>Severity</th>
                            <th>KEV</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.sections.externalIntelligence.data.exposure.items.map(
                            (x) => (
                              <tr
                                key={`${x.advisory}:${x.package}:${x.version}`}
                              >
                                <td>{x.advisory}</td>
                                <td>
                                  {x.ecosystem}:{x.package}@{x.version}
                                </td>
                                <td>
                                  {x.severity}
                                  {x.conflicting ? " · providers disagree" : ""}
                                </td>
                                <td>{x.kev ? "listed" : "no"}</td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </Card>
            <IntegrationsCard report={report} />
            <Card>
              <SectionHeading title="Limitations" />
              <ul>
                {report.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </Frame>
    </div>
  );
}
