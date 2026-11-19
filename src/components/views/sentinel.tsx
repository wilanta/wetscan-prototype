"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LiveTelemetry } from "@/features/sentinel/components/live-telemetry";
import { LiveDetection } from "@/features/sentinel/components/live-detection";
import { LiveIncidents } from "@/features/sentinel/components/live-incidents";
import { LiveResponses } from "@/features/sentinel/components/live-responses";
import { LiveNotifications } from "@/features/sentinel/components/live-notifications";
import { LiveGhost } from "@/features/sentinel/components/live-ghost";
import { LiveIntelligence } from "@/features/sentinel/components/live-intelligence";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BrainCircuit,
  Check,
  Eye,
  Ghost as GhostIcon,
  Pause,
  Play,
  Radio,
  Radar,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { PROJECT } from "@/data/demo";
import type { Incident } from "@/domain/types";
import { useDemo, toast } from "../demo-provider";
import {
  Badge,
  Button,
  Card,
  Empty,
  LinkButton,
  Modal,
  Notice,
  PageHeader,
  SectionHeading,
  TextLink,
  Toggle,
} from "../ui";
export function SentinelTabs({ active }: { active: string }) {
  return (
    <nav className="page-tabs" aria-label="Sentinel sections">
      {[
        ["Overview", ""],
        ["Activity", "/activity"],
        ["Incidents", "/incidents"],
        ["Responses", "/responses"],
        ["Ghost", "/ghost"],
        ["Intelligence", "/intelligence"],
      ].map(([label, path]) => (
        <Link
          href={`${PROJECT}/sentinel${path}`}
          key={path}
          className={active === path ? "active" : ""}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
export function ResponseBadge({ incident }: { incident: Incident }) {
  return (
    <Badge
      tone={
        incident.responseState === "neutralization_verified"
          ? "green"
          : incident.responseState === "failed"
            ? "red"
            : "amber"
      }
    >
      {incident.responseState.replaceAll("_", " ")} · simulated
    </Badge>
  );
}
export function SimulateThreat() {
  const { dispatch } = useDemo();
  return (
    <Button
      onClick={() => {
        dispatch({ type: "detect", source: "api" });
        toast.info(
          "Suspicious activity simulated. Incident and enabled detection previews created.",
        );
      }}
    >
      <Play size={16} />
      Simulate suspicious request
    </Button>
  );
}
export function Sentinel({
  section = "",
  projectId,
}: {
  section?: string;
  projectId?: string;
}) {
  if (
    projectId &&
    (section === "/incidents" || section.startsWith("/incidents/"))
  )
    return (
      <LiveIncidents
        projectId={projectId}
        initialIncidentId={
          section.startsWith("/incidents/")
            ? section.slice("/incidents/".length)
            : undefined
        }
        key={`${projectId}:${section}`}
      />
    );
  if (projectId && section === "/responses")
    return <LiveResponses projectId={projectId} key={projectId} />;
  if (projectId && section === "/notifications")
    return <LiveNotifications projectId={projectId} key={projectId} />;
  if (projectId && section === "/ghost")
    return <LiveGhost projectId={projectId} key={projectId} />;
  if (projectId && section === "/intelligence")
    return <LiveIntelligence projectId={projectId} key={projectId} />;
  if (projectId && (section === "/rules" || section === "/alerts"))
    return (
      <LiveDetection
        projectId={projectId}
        section={section}
        key={`${projectId}:${section}`}
      />
    );
  return projectId ? (
    <LiveTelemetry
      projectId={projectId}
      section={section}
      key={`${projectId}:${section}`}
    />
  ) : (
    <DemoSentinel section={section} />
  );
}
function DemoSentinel({ section = "" }: { section?: string }) {
  const { state } = useDemo();
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("all");
  return (
    <div className="page">
      <PageHeader
        eyebrow="SENTINEL · FOLLOW WHAT HAPPENS"
        title={
          section === "/activity"
            ? "Every signal, in context."
            : section === "/incidents"
              ? "From signal to a clear outcome."
              : section === "/responses"
                ? "A response is only the beginning."
                : "Stay curious. Stay in the know."
        }
        description="Follow a suspicious request through detection, response, and a separately verified outcome."
        action={<SimulateThreat />}
      />
      <SentinelTabs active={section} />
      <Notice>
        Demo simulation only. Runtime telemetry, production enforcement, and
        real notification delivery are not connected.
      </Notice>
      {section === "" && (
        <>
          <div className="sentinel-banner">
            <span className="radar-illustration">
              <Radar size={70} strokeWidth={1} />
            </span>
            <div>
              <Badge tone="blue">Ready for a local simulation</Badge>
              <h2>
                Know what happened.
                <br />
                Then know what worked.
              </h2>
              <p>
                Detection starts an investigation. A successful action still
                needs its own verification.
              </p>
            </div>
            <div className="coverage-breakdown">
              <div>
                <Radio size={17} />
                Telemetry<Badge>Not connected</Badge>
              </div>
              <div>
                <Eye size={17} />
                Detection<Badge tone="blue">Demo rules</Badge>
              </div>
              <div>
                <ShieldCheck size={17} />
                Enforcement<Badge>Simulated only</Badge>
              </div>
            </div>
          </div>
          <div className="three-columns">
            <Card className="compact-stat">
              <small>Open investigations</small>
              <h2>
                {state.incidents.filter((i) => i.status === "open").length}
              </h2>
              <span>Local demo cases</span>
            </Card>
            <Card className="compact-stat">
              <small>Verified outcomes</small>
              <h2>
                {
                  state.incidents.filter(
                    (i) => i.responseState === "neutralization_verified",
                  ).length
                }
              </h2>
              <span>Synthetic, scope-limited checks</span>
            </Card>
            <Card className="compact-stat">
              <small>Notification previews</small>
              <h2>{state.notifications.length}</h2>
              <span>Delivery has not been attempted</span>
            </Card>
          </div>
        </>
      )}
      {section === "/activity" ? (
        <Card>
          <SectionHeading title="Activity stream">
            <Button variant="secondary" onClick={() => setPaused(!paused)}>
              {paused ? <Play size={15} /> : <Pause size={15} />}{" "}
              {paused ? "Resume" : "Pause"} view
            </Button>
          </SectionHeading>
          <div className="filters">
            <select
              aria-label="Filter event source"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All sources</option>
              <option value="api">Orders API</option>
              <option value="ghost">Ghost decoy</option>
            </select>
            <Badge tone="blue">
              Simulated stream {paused ? "· paused" : ""}
            </Badge>
          </div>
          {paused ? (
            <Empty
              title="Activity view paused"
              description="Your demo cases are preserved. Resume to display their recorded events."
            />
          ) : state.incidents.filter(
              (i) => filter === "all" || i.source === filter,
            ).length ? (
            state.incidents
              .filter((i) => filter === "all" || i.source === filter)
              .flatMap((i) =>
                i.timeline.map((e) => (
                  <div className="activity-row" key={e.id}>
                    <span className="event-marker blue">
                      <Radio size={15} />
                    </span>
                    <div>
                      <strong>{e.type.replaceAll("_", " ")}</strong>
                      <p>{e.explanation}</p>
                      <small>
                        Demo source · {e.id} ·{" "}
                        {new Date(e.timestamp).toLocaleTimeString("en-GB", {
                          timeZone: "Asia/Jakarta",
                        })}{" "}
                        WIB
                      </small>
                    </div>
                    <TextLink href={`${PROJECT}/sentinel/incidents/${i.id}`}>
                      {i.id}
                    </TextLink>
                  </div>
                )),
              )
          ) : (
            <Empty
              title="No events in this view"
              description="Simulate a suspicious request or change the source filter to begin."
            />
          )}
        </Card>
      ) : section === "/responses" ? (
        <Card>
          <SectionHeading title="Response history">
            <Badge>Auditable demo actions</Badge>
          </SectionHeading>
          {state.incidents.some((i) =>
            i.timeline.some((e) => e.type === "mitigation_applied"),
          ) ? (
            state.incidents
              .filter((i) =>
                i.timeline.some((e) => e.type === "mitigation_applied"),
              )
              .map((i) => (
                <div className="history-row" key={i.id}>
                  <ShieldCheck size={22} />
                  <div>
                    <strong>Temporary demo rate limit</strong>
                    <small>Synthetic actor · TTL 10 min · DEMO-ACCESS-01</small>
                  </div>
                  <ResponseBadge incident={i} />
                  <TextLink href={`${PROJECT}/sentinel/incidents/${i.id}`}>
                    {i.id}
                  </TextLink>
                </div>
              ))
          ) : (
            <Empty
              title="No responses applied yet"
              description="Open a simulated incident and evaluate the response policy."
            />
          )}
        </Card>
      ) : (
        <Card>
          <SectionHeading
            title={
              section === "/incidents" ? "All incidents" : "Your investigations"
            }
          >
            <Badge>{state.incidents.length} demo cases</Badge>
          </SectionHeading>
          <IncidentList />
          {section === "" && (
            <div className="card-footer-links">
              <TextLink href={`${PROJECT}/sentinel/ghost`}>
                Explore safe decoys
              </TextLink>
              <TextLink href="/app/notifications">
                Set notification preferences
              </TextLink>
            </div>
          )}
        </Card>
      )}
      {section === "" && (
        <Card>
          <SectionHeading title="Simple, deterministic detection">
            <Badge>Demo rule library</Badge>
          </SectionHeading>
          <div className="rule-grid">
            {[
              [
                "DEMO-ACCESS-01",
                "Repeated unauthorized access",
                "5 synthetic cross-customer requests → investigation",
              ],
              [
                "DEMO-PROBE-01",
                "Suspicious path probing",
                "Fixture only · not monitoring production",
              ],
              [
                "GHOST-03",
                "Decoy endpoint access",
                "A local decoy test → traceable event and incident",
              ],
            ].map(([id, title, description]) => (
              <details key={id}>
                <summary>
                  <strong>{title}</strong>
                  <Badge tone="blue">Demo rule</Badge>
                </summary>
                <p>{description}</p>
                <code>{id}</code>
              </details>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
export function IncidentList() {
  const { state } = useDemo();
  return state.incidents.length ? (
    <div className="incident-list">
      {[...state.incidents].reverse().map((i) => (
        <Link
          href={`${PROJECT}/sentinel/incidents/${i.id}`}
          className="incident-row"
          key={i.id}
        >
          <span className="attention-icon amber">
            {i.source === "ghost" ? (
              <GhostIcon size={22} />
            ) : (
              <Radar size={22} />
            )}
          </span>
          <div>
            <strong>{i.title}</strong>
            <small>
              {i.id} ·{" "}
              {i.source === "ghost" ? "Ghost demo decoy" : "Orders API"} ·{" "}
              {i.status} · {i.timeline.length} events
            </small>
          </div>
          <ResponseBadge incident={i} />
          <ArrowRight size={17} />
        </Link>
      ))}
    </div>
  ) : (
    <Empty
      title="A quiet workspace, ready to explore."
      description="Simulate a suspicious request to follow an incident from detection to verification. No real traffic is generated."
      action={<SimulateThreat />}
    />
  );
}
export function IncidentDetail({ id }: { id: string }) {
  const { state, dispatch } = useDemo();
  const i = state.incidents.find((i) => i.id === id);
  const [outcome, setOutcome] = useState("pass");
  const previews = state.notifications.filter((n) => n.incidentId === id);
  if (!i)
    return (
      <div className="page">
        <PageHeader
          title="This demo case hasn’t happened yet."
          description="Demo incidents are created by an explicit simulation and are cleared when the demo is reset."
        />
        <LinkButton href={`${PROJECT}/sentinel`}>
          Open Sentinel <ArrowRight size={16} />
        </LinkButton>
      </div>
    );
  const active = i.status !== "closed";
  return (
    <div className="page">
      <Link className="back-link" href={`${PROJECT}/sentinel/incidents`}>
        <ArrowLeft size={15} />
        All incidents
      </Link>
      <PageHeader
        eyebrow={`SENTINEL / ${i.id}`}
        title={i.title}
        description="A complete, traceable local simulation. Detection and neutralization are separate events."
        action={<ResponseBadge incident={i} />}
      />
      <div className="detail-columns">
        <div className="detail-main">
          <Card>
            <SectionHeading title="What happened, step by step">
              <Badge tone="blue">Simulated timeline</Badge>
            </SectionHeading>
            <div className="incident-timeline">
              {i.timeline.map((e, index) => (
                <div key={e.id} className="timeline-event">
                  <span
                    className={`timeline-marker ${e.type === "neutralization_verified" ? "success" : ""}`}
                  >
                    {e.type === "neutralization_verified" ? (
                      <Check size={16} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <div>
                    <div className="timeline-event-top">
                      <strong>{e.type.replaceAll("_", " ")}</strong>
                      <time>
                        {new Date(e.timestamp).toLocaleTimeString("en-GB", {
                          timeZone: "Asia/Jakarta",
                        })}{" "}
                        WIB
                      </time>
                    </div>
                    <p>{e.explanation}</p>
                    {e.evidenceId && (
                      <details>
                        <summary>Inspect {e.evidenceId}</summary>
                        <pre>
                          <code>
                            {e.evidenceId === "EV-VERIFY"
                              ? "source: demo-response-adapter\nscope: synthetic actor / orders API\nreplay status: 429\ncontrol status: 200\nnetwork calls: 0\nconclusion: neutralization verified within fixture scope"
                              : `source: local deterministic fixture\nevent: ${e.type}\nincident: ${i.id}\nnode: orders-api\nreal telemetry: unavailable`}
                          </code>
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <SectionHeading title="Keep the team in the loop">
              <TextLink href="/app/notifications">Preferences</TextLink>
            </SectionHeading>
            <Notice>
              Simulated previews only. No provider has been contacted; no
              message is confirmed delivered.
            </Notice>
            {previews.map((n) => (
              <div className="notification-preview" key={n.id}>
                <div>
                  <Bell size={17} />
                  <strong>
                    {n.trigger === "attack_detected"
                      ? "Threat detected"
                      : n.trigger === "neutralization_verified"
                        ? "Neutralization verified — scope-limited"
                        : n.trigger === "response_failed"
                          ? "Protection verification failed"
                          : "Mitigation applied"}
                  </strong>
                  <Badge tone="blue">Preview</Badge>
                </div>
                <p>
                  Orderly Demo · {i.id} · {n.channel}
                </p>
                <p>
                  {n.trigger === "attack_detected"
                    ? "Suspicious activity detected. Investigating; temporary protection is being evaluated."
                    : n.trigger === "neutralization_verified"
                      ? "Temporary restriction verified in synthetic scope: replay blocked (429), control allowed (200)."
                      : n.trigger === "response_failed"
                        ? "Synthetic replay still returned 200. Effectiveness was not established."
                        : "Adapter accepted the restriction. Outcome not verified."}
                </p>
                <Link
                  href={`${PROJECT}/sentinel/incidents/${i.id}`}
                  className="text-link"
                >
                  View incident evidence <ArrowRight size={14} />
                </Link>
                <small>Provider message ID: none · Delivered at: none</small>
              </div>
            ))}
            {!previews.length && (
              <p>
                No enabled channels matched the recorded triggers. Configure
                channels for future events.
              </p>
            )}
          </Card>
        </div>
        <aside className="detail-sidebar">
          <Card>
            <h3>One step at a time</h3>
            <p>
              The response is limited to a synthetic actor. Scope: Orders API
              fixture. Policy: DEMO-ACCESS-01. TTL: 10 minutes.
            </p>
            {active && i.responseState === "evaluating" && (
              <Button onClick={() => dispatch({ type: "advance", id })}>
                Evaluate policy & apply demo action <ArrowRight size={16} />
              </Button>
            )}
            {active && i.responseState === "applied" && (
              <Button onClick={() => dispatch({ type: "advance", id })}>
                Request outcome verification <ArrowRight size={16} />
              </Button>
            )}
            {active && i.responseState === "verification_pending" && (
              <>
                <Notice tone="amber">
                  Verification pending. No neutralization notification is
                  generated yet.
                </Notice>
                <label className="field">
                  Synthetic verification scenario
                  <select
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                  >
                    <option value="pass">
                      Blocked · replay 429, control 200
                    </option>
                    <option value="fail">
                      Failed · replay still returns 200
                    </option>
                    <option value="pending">Keep pending · no evidence</option>
                  </select>
                </label>
                <Button
                  onClick={() => {
                    dispatch({
                      type: "advance",
                      id,
                      outcome: outcome as "pass" | "fail" | "pending",
                    });
                    toast.info(
                      outcome === "pending"
                        ? "Still pending. No verification evidence or outcome preview created."
                        : "Synthetic verification event recorded.",
                    );
                  }}
                >
                  Run synthetic verification
                </Button>
              </>
            )}
            {i.responseState === "neutralization_verified" && (
              <Notice>
                Verified only within the synthetic demo check. This does not
                establish live protection.
              </Notice>
            )}
            {i.responseState === "failed" && (
              <Notice tone="amber">
                The simulated action did not prevent the scoped request. Keep
                investigating.
              </Notice>
            )}
            {active &&
              [
                "applied",
                "verification_pending",
                "neutralization_verified",
                "failed",
              ].includes(i.responseState) && (
                <Button
                  variant="secondary"
                  onClick={() => dispatch({ type: "rollback", id })}
                >
                  <RotateCcw size={15} />
                  Roll back demo restriction
                </Button>
              )}
            {active && (
              <Button
                variant="ghost"
                onClick={() => {
                  dispatch({ type: "close", id });
                  toast.info(
                    "Demo case closed. This does not imply verification.",
                  );
                }}
              >
                Close investigation
              </Button>
            )}
            <Badge>Case {i.status}</Badge>
          </Card>
          <Card>
            <BrainCircuit size={25} />
            <h3>Remember the pattern</h3>
            <p>
              Archive the case and propose a draft detection rule for human
              review.
            </p>
            <Button
              variant="secondary"
              disabled={i.archived}
              onClick={() => {
                dispatch({ type: "archive", id });
                toast.success(
                  "Case archived. Candidate rule is a draft, awaiting review.",
                );
              }}
            >
              {i.archived
                ? "Archived in case library"
                : "Archive & propose draft rule"}
            </Button>
            <TextLink href={`${PROJECT}/sentinel/intelligence`}>
              Open Intelligence
            </TextLink>
          </Card>
          <TextLink href={`${PROJECT}/canvas?node=orders-api`}>
            View affected component
          </TextLink>
        </aside>
      </div>
    </div>
  );
}
export function Ghost() {
  const { state, dispatch } = useDemo();
  const [setup, setSetup] = useState(false);
  const router = useRouter();
  function test() {
    dispatch({ type: "detect", source: "ghost" });
    toast.info(
      "GHOST-03 created a synthetic decoy event and traceable incident.",
    );
    router.push(
      `${PROJECT}/sentinel/incidents/INC-${1042 + state.incidents.length}`,
    );
  }
  return (
    <div className="page">
      <PageHeader
        eyebrow="SENTINEL / GHOST"
        title="A small decoy. A useful signal."
        description="Make suspicious exploration easier to spot, without exposing real data."
      />
      <SentinelTabs active="/ghost" />
      <div className="two-columns">
        <Card className="feature-card">
          <span className="big-feature-icon blue">
            <GhostIcon size={38} />
          </span>
          <Badge tone={state.ghostEnabled ? "blue" : "neutral"}>
            {state.ghostEnabled ? "Demo enabled" : "Off"}
          </Badge>
          <h2>Meet Ghost Lite.</h2>
          <p>
            A fictional endpoint that has no business traffic and no sensitive
            data. Its test interaction creates a clearly labeled Sentinel
            incident.
          </p>
          <div className="request-example">
            <span>DECOY ENDPOINT · NOT DEPLOYED</span>
            <code>/.well-known/demo-decoy</code>
          </div>
          <div className="actions">
            <Button variant="secondary" onClick={() => setSetup(true)}>
              {state.ghostEnabled ? "Review demo setup" : "Set up demo decoy"}
            </Button>
            <Button disabled={!state.ghostEnabled} onClick={test}>
              <Play size={16} />
              Test decoy (simulated)
            </Button>
          </div>
          <Notice>
            A decoy hit is a signal, not proof of compromise. Legitimate
            scanners can also trigger traps.
          </Notice>
        </Card>
        <div className="stack">
          <Card>
            <h3>From decoy to context</h3>
            <ol className="tour-list">
              <li>Explicitly enable the local demo decoy.</li>
              <li>Test it without sending a network request.</li>
              <li>Follow GHOST-03 into a Sentinel case.</li>
              <li>Archive the case in Intelligence.</li>
            </ol>
            <TextLink href={`${PROJECT}/sentinel/incidents`}>
              See traceable cases
            </TextLink>
          </Card>
          <Card>
            <h3>Adaptive isolation</h3>
            <Badge>Roadmap</Badge>
            <p>
              Routing activity into an isolated environment requires
              infrastructure and approval that this prototype does not provide.
            </p>
            <Button variant="secondary" disabled>
              Unavailable in this prototype
            </Button>
          </Card>
        </div>
      </div>
      <Modal
        open={setup}
        onOpenChange={setSetup}
        title="Set up a safe demo decoy"
        description="This configuration changes local demo state only. No public route is deployed."
      >
        <p>
          Endpoint: <code>/.well-known/demo-decoy</code>
          <br />
          Event: <code>ghost.decoy_triggered</code>
          <br />
          Source: <code>GHOST-03</code>
        </p>
        <Toggle
          label="Enable local demo decoy"
          checked={state.ghostEnabled}
          onChange={(enabled) => dispatch({ type: "ghost", enabled })}
        />
        <Button
          onClick={() => {
            setSetup(false);
            toast.success("Demo decoy configuration saved.");
          }}
        >
          Save demo configuration
        </Button>
      </Modal>
    </div>
  );
}
export function Intelligence() {
  const { state, dispatch } = useDemo();
  const [tab, setTab] = useState("internal");
  const [review, setReview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const archived = state.incidents.filter((i) => i.archived);
  return (
    <div className="page">
      <PageHeader
        eyebrow="SENTINEL / INTELLIGENCE"
        title="Turn a case into a useful lesson."
        description="Keep internal incident knowledge separate from external vulnerability advisories."
      />
      <SentinelTabs active="/intelligence" />
      <div className="segmented intelligence-tabs">
        <button
          className={tab === "internal" ? "selected" : ""}
          aria-pressed={tab === "internal"}
          onClick={() => setTab("internal")}
        >
          <BrainCircuit size={16} />
          Case library
        </button>
        <button
          className={tab === "external" ? "selected" : ""}
          aria-pressed={tab === "external"}
          onClick={() => setTab("external")}
        >
          <Radio size={16} />
          External advisories
        </button>
      </div>
      {tab === "internal" ? (
        <div className="two-columns">
          <Card>
            <SectionHeading title="Lessons from your incidents">
              <Badge>{archived.length} archived</Badge>
            </SectionHeading>
            {archived.length ? (
              archived.map((i) => (
                <div className="history-row" key={i.id}>
                  <BrainCircuit size={22} />
                  <div>
                    <strong>{i.title}</strong>
                    <small>
                      {i.id} · {i.responseState.replaceAll("_", " ")} ·
                      synthetic source
                    </small>
                  </div>
                  <TextLink href={`${PROJECT}/sentinel/incidents/${i.id}`}>
                    Evidence
                  </TextLink>
                </div>
              ))
            ) : (
              <Empty
                title="Your case library starts here"
                description="Archive an incident after reviewing its evidence. No hidden learning or AI analysis occurs."
                action={
                  <LinkButton secondary href={`${PROJECT}/sentinel/incidents`}>
                    Review incidents
                  </LinkButton>
                }
              />
            )}
          </Card>
          <Card>
            <SectionHeading title="Candidate detection rule">
              <Badge tone={state.rule === "approved" ? "green" : "amber"}>
                {state.rule === "none"
                  ? "No proposal"
                  : state.rule === "draft"
                    ? "Draft · needs review"
                    : "Approved for demo only"}
              </Badge>
            </SectionHeading>
            <h3>RULE-CAND-02</h3>
            <p>
              Flag repeated cross-resource or decoy access by the same synthetic
              actor. Source cases remain linked for review.
            </p>
            <p className="muted small-text">
              Sources:{" "}
              {archived.map((i) => i.id).join(", ") || "No archived cases yet"}
            </p>
            <Notice>
              Proposals never activate silently. Approval here affects only the
              local demo; production rule enforcement is unavailable.
            </Notice>
            <Button
              variant="secondary"
              disabled={state.rule !== "draft"}
              onClick={() => setReview(true)}
            >
              Review draft rule
            </Button>
          </Card>
        </div>
      ) : (
        <Card>
          <SectionHeading title="Advisories are context, not attacks">
            <Badge tone="blue">Fictional mapping</Badge>
          </SectionHeading>
          <Notice>
            ADV-009 is a synthetic educational advisory, not a real CVE. No
            advisory feed is queried. CISA KEV, NVD, GitHub Advisory Database,
            and OSV are future feed adapters.
          </Notice>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Advisory</th>
                  <th>Inventory</th>
                  <th>Project</th>
                  <th>Exposure</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>ADV-009</strong>
                    <small>Input parsing edge case · demo</small>
                  </td>
                  <td>demo-parser@1.4.0</td>
                  <td>Orderly Demo · staging</td>
                  <td>
                    <Badge tone="amber">
                      {state.exposureReevaluated
                        ? "Potential match · re-evaluated"
                        : "Inferred · not evaluated"}
                    </Badge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="actions">
            <Button
              variant="secondary"
              onClick={() => {
                dispatch({ type: "reevaluate" });
                toast.success(
                  "Synthetic inventory re-evaluated. Potential exposure remains unverified.",
                );
              }}
            >
              Re-evaluate exposure (demo)
            </Button>
            <TextLink href={`${PROJECT}/guard/findings/FIND-103`}>
              View linked finding
            </TextLink>
          </div>
          {state.exposureReevaluated && (
            <p className="muted">
              Fixture checked 13 Nov 2026 · 14:35 WIB · Exploitability and
              reachability remain unknown.
            </p>
          )}
        </Card>
      )}
      <Modal
        open={review}
        onOpenChange={setReview}
        title="Review candidate RULE-CAND-02"
        description="Human approval is required. This does not install a production rule."
      >
        <pre>
          <code>{`id: RULE-CAND-02\nmode: demo\nsource_incidents: [${archived.map((i) => i.id).join(", ")}]\ncondition: repeated_cross_resource_or_decoy_access\nresponse: investigate_only\nvalidation: synthetic_fixtures_only`}</code>
        </pre>
        <label className="check-line">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I reviewed the source evidence and demo scope.
        </label>
        <Button
          disabled={!confirmed}
          onClick={() => {
            dispatch({ type: "rule", status: "approved" });
            setReview(false);
            toast.success(
              "Rule approved for this demo only. No production rule is active.",
            );
          }}
        >
          Approve for demo only
        </Button>
      </Modal>
    </div>
  );
}
