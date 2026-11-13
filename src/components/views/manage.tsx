"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  BrainCircuit,
  CheckCircle2,
  Clipboard,
  GitBranch,
  Mail,
  MessageCircle,
  Moon,
  Printer,
  Radio,
  Send,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { PROJECT } from "@/data/demo";
import type { Channel, Trigger } from "@/domain/types";
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
  Toggle,
} from "../ui";
const channelIcons = { telegram: Send, email: Mail, whatsapp: MessageCircle };
const triggerLabels: Record<Trigger, string> = {
  attack_detected: "Threat detected",
  mitigation_applied: "Action applied",
  neutralization_verified: "Neutralization verified",
  response_failed: "Action / verification failed",
  new_exposure: "High-priority exposure",
};
export function Notifications() {
  const { state, dispatch } = useDemo();
  const [preview, setPreview] = useState<Channel | null>(null);
  const [filter, setFilter] = useState("all");
  return (
    <div className="page">
      <PageHeader
        eyebrow="NOTIFICATIONS"
        title="The right update. In the right place."
        description="Choose how you hear about detections and what happened after a response."
      />
      <Notice>
        All channels use local previews. No Telegram, email, or WhatsApp
        messages are sent. Provider acceptance and recipient delivery are
        separate states.
      </Notice>
      <div className="three-columns channel-grid">
        {state.channels.map((c) => {
          const Icon = channelIcons[c.channel];
          return (
            <Card key={c.channel}>
              <div className="channel-header">
                <span className="stat-icon blue">
                  <Icon size={23} />
                </span>
                <Badge tone={c.enabled ? "blue" : "neutral"}>
                  {c.channel === "whatsapp"
                    ? "Requires business setup"
                    : "Demo configuration"}
                </Badge>
              </div>
              <h2 className="capitalize">{c.channel}</h2>
              <Toggle
                label="Enable demo previews"
                checked={c.enabled}
                onChange={(enabled) =>
                  dispatch({ type: "channel", config: { ...c, enabled } })
                }
              />
              <label className="field">
                {c.channel === "telegram"
                  ? "Demo channel label"
                  : c.channel === "email"
                    ? "Example address"
                    : "Example number · opt-in required"}
                <input
                  type={c.channel === "email" ? "email" : "text"}
                  value={c.destination}
                  placeholder={
                    c.channel === "whatsapp"
                      ? "+62… (demo only)"
                      : "Demo destination"
                  }
                  onChange={(e) =>
                    dispatch({
                      type: "channel",
                      config: { ...c, destination: e.target.value },
                    })
                  }
                />
              </label>
              {c.channel === "whatsapp" && (
                <p className="small-text muted">
                  Live setup requires official WhatsApp Business, recipient
                  consent, and approved templates where required.
                </p>
              )}
              <div className="trigger-list">
                <h3>Notify me when</h3>
                {Object.entries(triggerLabels).map(([trigger, label]) => (
                  <label className="check-line" key={trigger}>
                    <input
                      type="checkbox"
                      checked={c.triggers.includes(trigger as Trigger)}
                      onChange={(e) =>
                        dispatch({
                          type: "channel",
                          config: {
                            ...c,
                            triggers: e.target.checked
                              ? [...c.triggers, trigger as Trigger]
                              : c.triggers.filter((t) => t !== trigger),
                          },
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  dispatch({ type: "preview", channel: c.channel });
                  setPreview(c.channel);
                }}
              >
                <Bell size={15} />
                Test preview
              </Button>
              <small className="muted block">
                No credentials stored. Delivery unavailable.
              </small>
            </Card>
          );
        })}
      </div>
      <Card>
        <SectionHeading title="Keep the signal, lose the noise">
          <Badge>Demo preferences</Badge>
        </SectionHeading>
        <Toggle
          label="Quiet hours · 22:00–07:00 WIB"
          description="Stored as a demo preference. Previews remain inspectable; no delivery scheduler runs."
          checked={state.quietHours}
          onChange={(quietHours) =>
            dispatch({
              type: "preferences",
              quietHours,
              retention: state.retention,
            })
          }
        />
        <p className="small-text muted">
          One preview per incident, channel, and trigger. No raw-event spam.
          Provider retries: unavailable until a real notification adapter is
          configured.
        </p>
      </Card>
      <Card>
        <SectionHeading title="Preview & delivery log">
          <select
            aria-label="Filter notification channel"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All channels</option>
            {state.channels.map((c) => (
              <option key={c.channel}>{c.channel}</option>
            ))}
          </select>
        </SectionHeading>
        {state.notifications.filter(
          (n) => filter === "all" || n.channel === filter,
        ).length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Trigger</th>
                  <th>Channel</th>
                  <th>Incident</th>
                  <th>Status</th>
                  <th>Confirmation</th>
                </tr>
              </thead>
              <tbody>
                {[...state.notifications]
                  .reverse()
                  .filter((n) => filter === "all" || n.channel === filter)
                  .map((n) => (
                    <tr key={n.id}>
                      <td>
                        <strong>
                          {n.trigger === "test"
                            ? "Test preview"
                            : triggerLabels[n.trigger]}
                        </strong>
                        <small>{n.id}</small>
                      </td>
                      <td className="capitalize">{n.channel}</td>
                      <td>
                        {n.incidentId === "TEST" ? (
                          "Test only"
                        ) : (
                          <Link
                            className="text-link"
                            href={`${PROJECT}/sentinel/incidents/${n.incidentId}`}
                          >
                            {n.incidentId}
                          </Link>
                        )}
                      </td>
                      <td>
                        <Badge tone="blue">Simulated preview</Badge>
                      </td>
                      <td>
                        <small>
                          Provider ID: none
                          <br />
                          Attempted: never
                          <br />
                          Delivered: not confirmed
                        </small>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Your previews will appear here"
            description="Use a test preview or simulate an incident with an enabled notification trigger."
          />
        )}
      </Card>
      <Modal
        open={preview !== null}
        onOpenChange={(o) => {
          if (!o) setPreview(null);
        }}
        title={`${preview || "Channel"} test preview`}
        description="This message stays in the prototype. No real delivery is attempted."
      >
        <div className="notification-preview">
          <strong>[WetScan] Test notification</strong>
          <p>
            Project: Orderly Demo
            <br />
            Trigger: Test only
            <br />
            Status: Simulated preview
            <br />
            No real threat or outcome is asserted.
          </p>
          <Badge tone="blue">
            No provider message ID · No delivery confirmation
          </Badge>
        </div>
      </Modal>
    </div>
  );
}
export function StagingForm() {
  const { state, dispatch } = useDemo();
  const [url, setUrl] = useState(state.staging.url);
  const [authorized, setAuthorized] = useState(state.staging.authorized);
  const [paths, setPaths] = useState(state.staging.paths);
  const [rate, setRate] = useState(state.staging.rate);
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        let valid = false;
        try {
          const parsed = new URL(url);
          valid =
            parsed.protocol === "https:" &&
            parsed.hostname.endsWith(".test") &&
            !parsed.username &&
            !parsed.password;
        } catch {}
        if (!valid || !authorized || !paths.startsWith("/")) {
          setError(
            "Use an HTTPS staging hostname ending in .test, confirm authorization, and provide a path beginning with /.",
          );
          return;
        }
        dispatch({
          type: "staging",
          staging: { url, authorized, paths, rate },
        });
        setError("");
        toast.success("Demo staging scope saved. No DAST runner is connected.");
      }}
    >
      <label className="field">
        Staging URL
        <input
          type="url"
          required
          value={url}
          aria-invalid={!!error}
          aria-describedby={error ? "staging-error" : undefined}
          placeholder="https://staging.orderly.test"
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <div className="two-fields">
        <label className="field">
          Allowed paths
          <input
            required
            value={paths}
            onChange={(e) => setPaths(e.target.value)}
          />
        </label>
        <label className="field">
          Requests / second
          <input
            type="number"
            min="1"
            max="5"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
        </label>
      </div>
      <label className="check-line">
        <input
          type="checkbox"
          checked={authorized}
          onChange={(e) => setAuthorized(e.target.checked)}
        />
        I own this staging target or have explicit permission to test it.
      </label>
      <Notice tone="amber">
        Only fictional .test hosts are accepted in this demo. Scope: GET
        requests, maximum 60 seconds, at most 5 requests/sec. No production
        testing or network requests occur.
      </Notice>
      {error && (
        <p id="staging-error" className="form-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="secondary">
        Save demo staging scope
      </Button>
    </form>
  );
}
export function Integrations() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="INTEGRATIONS"
        title="Connect only what you need."
        description="Code, test scope, runtime evidence, and communication each have their own boundary."
      />
      <Card>
        <SectionHeading title="Source code">
          <Badge>Read-only by default</Badge>
        </SectionHeading>
        <div className="two-columns connector-grid">
          {["GitHub", "GitLab"].map((provider) => (
            <div className="connector" key={provider}>
              <GitBranch size={30} />
              <div>
                <h3>{provider}</h3>
                <p>Repository content & metadata · least-privilege access.</p>
                <Badge tone="blue">Demo connection only</Badge>
              </div>
              <LinkButton
                secondary
                href={`/onboarding?provider=${provider.toLowerCase()}`}
              >
                Explore demo repository <ArrowRight size={15} />
              </LinkButton>
            </div>
          ))}
        </div>
        <p className="muted small-text">
          No OAuth flow runs here. Production adapters must obtain explicit
          repository grants and store credentials securely on the server.
        </p>
      </Card>
      <div className="two-columns">
        <Card>
          <SectionHeading title="Staging test target">
            <Badge>Separate authorization</Badge>
          </SectionHeading>
          <StagingForm />
        </Card>
        <div className="stack">
          <Card>
            <Radio size={25} />
            <h3>Runtime telemetry</h3>
            <Badge>Not connected</Badge>
            <p>Only the local deterministic demo adapter produces events.</p>
            <LinkButton secondary href={`${PROJECT}/sentinel`}>
              Explore Sentinel simulation
            </LinkButton>
          </Card>
          <Card>
            <BrainCircuit size={25} />
            <h3>Optional AI adapter</h3>
            <Badge>Not configured</Badge>
            <p>
              No provider or model selected. The full prototype works with AI
              disabled.
            </p>
            <LinkButton secondary href="/app/settings">
              Review configuration boundary
            </LinkButton>
          </Card>
          <Card>
            <Bell size={25} />
            <h3>Notification channels</h3>
            <p>
              Telegram, email, and WhatsApp each have separate setup and preview
              semantics.
            </p>
            <LinkButton secondary href="/app/notifications">
              Manage notifications
            </LinkButton>
          </Card>
        </div>
      </div>
    </div>
  );
}
export function Reports() {
  const { state } = useDemo();
  const summary = `WetScan demo review — ${state.projectName}\nMode: local synthetic fixtures. No live protection.\nRepository: ${state.provider} / ${state.branch} / a1b2c3d (fictional)\nFIND-102: ${state.findingStatus}\nOther findings: 2 inferred demo records\nDAST: not run. Production telemetry: not connected.\nIncidents: ${state.incidents.length}; synthetic verified outcomes: ${state.incidents.filter((i) => i.responseState === "neutralization_verified").length}\nNotification previews: ${state.notifications.length}; actual delivery: not attempted\nNo production deployment enforcement. Not a pentest certification.`;
  return (
    <div className="page report-page">
      <PageHeader
        eyebrow="REPORTS"
        title="A clearer picture, ready to share."
        description="Evidence, boundaries, and remaining work. Without an invented security score."
        action={
          <>
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(summary);
                  toast.success("Demo review summary copied.");
                } catch {
                  toast.error(
                    "Clipboard unavailable. Use print to save the report.",
                  );
                }
              }}
            >
              <Clipboard size={15} />
              Copy summary
            </Button>
            <Button onClick={() => window.print()}>
              <Printer size={16} />
              Print report
            </Button>
          </>
        }
      />
      <Card className="report-document">
        <div className="report-heading">
          <ShieldCheck size={30} />
          <div>
            <span className="eyebrow">WETSCAN SECURITY REVIEW</span>
            <h2>{state.projectName}</h2>
          </div>
          <Badge tone="blue">Demo data</Badge>
        </div>
        <p>13 November 2026 · Northstar Studio · main · a1b2c3d (synthetic)</p>
        <Notice>
          This is a scoped prototype review using fictional evidence. It is not
          a pentest certification or an assurance of security.
        </Notice>
        <h3>What was reviewed</h3>
        <div className="checks-list">
          <div>
            <span>Orders API access control · FIND-102</span>
            <Badge tone="amber">
              {state.findingStatus.replaceAll("_", " ")}
            </Badge>
          </div>
          <div>
            <span>Dependency inventory · ADV-009</span>
            <Badge>Potential fixture match</Badge>
          </div>
          <div>
            <span>Workflow invariant</span>
            <Badge>{state.integrity.replaceAll("_", " ")} · demo</Badge>
          </div>
        </div>
        <h3>What remains unknown</h3>
        <p>
          Real repository code, staging behavior, runtime attack activity,
          enforcement effectiveness, advisory reachability, and recipient
          delivery have not been verified.
        </p>
        <h3>Incident & response evidence</h3>
        {state.incidents.length ? (
          state.incidents.map((i) => (
            <div className="report-incident" key={i.id}>
              <Link href={`${PROJECT}/sentinel/incidents/${i.id}`}>
                {i.id} · {i.title}
              </Link>
              <p>
                {i.responseState.replaceAll("_", " ")} · {i.timeline.length}{" "}
                synthetic events · {i.status}
              </p>
            </div>
          ))
        ) : (
          <p>No incident simulations have run.</p>
        )}
        <h3>Recommended next action</h3>
        <p>
          Review FIND-102 and its ownership-check example. Obtain authorized
          repository and staging access before replacing demo adapters with real
          services.
        </p>
        <pre className="report-summary">
          <code>{summary}</code>
        </pre>
      </Card>
    </div>
  );
}
export function Settings() {
  const { state, dispatch, dark, setDark } = useDemo();
  const [name, setName] = useState(state.projectName);
  const [retention, setRetention] = useState(state.retention);
  return (
    <div className="page">
      <PageHeader
        eyebrow="TEAM & SETTINGS"
        title="Make room for your way of working."
        description="A few thoughtful defaults. Clear ownership and configuration boundaries."
      />
      <div className="two-columns">
        <div className="stack">
          <Card>
            <SectionHeading title="Appearance">
              <Sun size={20} />
            </SectionHeading>
            <p>
              Light is the default. Both themes preserve evidence and severity
              semantics.
            </p>
            <div className="theme-choices">
              <button
                className={!dark ? "selected" : ""}
                onClick={() => setDark(false)}
              >
                <Sun size={22} />
                Light{!dark && <CheckCircle2 size={15} />}
              </button>
              <button
                className={dark ? "selected" : ""}
                onClick={() => setDark(true)}
              >
                <Moon size={22} />
                Dark{dark && <CheckCircle2 size={15} />}
              </button>
            </div>
          </Card>
          <Card>
            <h2>Project scope</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                dispatch({
                  type: "project",
                  name: name.trim(),
                  provider: state.provider,
                  branch: state.branch,
                });
                toast.success("Demo project name saved.");
              }}
            >
              <label className="field">
                Display name
                <input
                  required
                  maxLength={50}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <Button variant="secondary" type="submit">
                Save project name
              </Button>
            </form>
            <dl className="inspector-meta">
              <div>
                <dt>Environment</dt>
                <dd>Staging only</dd>
              </div>
              <div>
                <dt>Data</dt>
                <dd>Fictional, local state</dd>
              </div>
              <div>
                <dt>Language</dt>
                <dd>English · prototype</dd>
              </div>
            </dl>
            <p className="muted small-text">
              Indonesian localization is deferred. No incomplete language toggle
              is shown.
            </p>
          </Card>
          <Card>
            <h2>Privacy & retention</h2>
            <label className="field">
              Demo retention preference
              <select
                value={retention}
                onChange={(e) => setRetention(e.target.value)}
              >
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
              </select>
            </label>
            <p>
              This is a preference preview. Demo records live in memory and
              clear on full reload or Reset Demo. No backend retention scheduler
              exists.
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                dispatch({
                  type: "preferences",
                  retention,
                  quietHours: state.quietHours,
                });
                toast.success("Demo retention preference saved.");
              }}
            >
              Save preference
            </Button>
          </Card>
        </div>
        <div className="stack">
          <Card>
            <SectionHeading title="Your team">
              <Badge>2 demo members</Badge>
            </SectionHeading>
            {["Wildhan", "Daud"].map((name) => (
              <div className="team-row" key={name}>
                <span className="avatar">{name.charAt(0)}</span>
                <div>
                  <strong>{name}</strong>
                  <small>Workspace owner · demo profile</small>
                </div>
                <Badge>Owner</Badge>
              </div>
            ))}
            <p className="muted small-text">
              Production invitations and authentication are outside this
              prototype.
            </p>
          </Card>
          <Card>
            <BrainCircuit size={30} />
            <h2>AI, when you choose.</h2>
            <Badge>Not configured</Badge>
            <p>
              Provider-neutral interface, disabled by default. No vendor, model,
              or API key is selected.
            </p>
            <details>
              <summary>Production extension point</summary>
              <p>
                Implement the AIProvider interface in src/services/adapters.ts,
                select a provider on the server, and apply redaction and usage
                limits. AI must not decide response enforcement or verify
                outcomes.
              </p>
            </details>
            <Button variant="secondary" disabled>
              Owner provider selection required
            </Button>
          </Card>
          <Notice>
            Preferences and demo data remain local to this browser tab. No
            account or authentication backend is connected.
          </Notice>
        </div>
      </div>
    </div>
  );
}
