"use client";
import { LiveSentinelNav } from "./live-nav";
import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Empty,
  Notice,
  PageHeader,
} from "@/components/ui";
import type { ChannelView, DeliveryView } from "../notifications/store";

const names: Record<string, string> = {
  telegram: "Telegram",
  email: "Email",
  whatsapp: "WhatsApp",
};
const stateLabel: Record<
  string,
  [string, "neutral" | "blue" | "green" | "amber" | "red"]
> = {
  pending: ["Queued · not yet sent", "amber"],
  attempted: ["Attempted · awaiting outcome", "amber"],
  // Provider acceptance is NOT delivery and NOT a read receipt.
  provider_accepted: ["Provider accepted · delivery not confirmed", "blue"],
  delivered: ["Delivered (provider evidence)", "green"],
  failed: ["Failed", "red"],
  unknown: ["Unknown outcome", "amber"],
  suppressed: ["Not sent", "neutral"],
};
const reasons: Record<string, string> = {
  channel_disabled: "Channel is disabled.",
  consent_missing: "Recipient consent is missing.",
  channel_unavailable: "Channel is not available.",
  trigger_filtered: "Trigger is filtered out.",
  controlled_test_excluded: "Controlled-test incidents are excluded.",
  severity_below_minimum: "Below the minimum severity.",
  throttled: "Hourly limit reached.",
  deferred_quiet_hours: "Deferred until quiet hours end.",
  destination_changed: "Destination changed after queueing.",
  enqueue_failed: "Could not be queued.",
  provider_not_configured: "Provider not configured on the sender.",
  provider_auth_failed: "Provider rejected the credentials.",
  recipient_forbidden: "Recipient blocked or forbade the bot.",
  destination_rejected: "Provider rejected the destination.",
  rate_limited: "Provider rate limit; retrying.",
  provider_5xx: "Provider error; retrying.",
  network_or_timeout: "Network timeout; outcome uncertain.",
  previous_attempt_outcome_unknown: "Earlier attempt outcome was unknown.",
  attempts_exhausted: "Retries exhausted.",
  attempts_exhausted_outcome_unknown: "Retries exhausted; outcome uncertain.",
};
const errors: Record<string, string> = {
  notifications_not_configured:
    "Notifications are not configured (NOT_CONFIGURED). Database migration 0006 is not applied.",
  revision_conflict:
    "This channel changed in another session. Refresh and retry.",
  consent_required: "Record recipient consent first.",
  destination_required: "Enter a destination first.",
  destination_not_verified:
    "Send a test message and wait for provider acceptance before enabling.",
  channel_unavailable:
    "This channel is unavailable until official business setup is complete.",
  invalid_destination: "That destination is not valid for this channel.",
  invalid_timezone: "Choose a valid IANA timezone, e.g. Asia/Jakarta.",
  invalid_quiet_hours: "Quiet hours need different start and end times.",
  throttled: "Too many test messages in the last hour.",
  retry_in_progress: "A retry is already in progress.",
  invalid_state: "Only failed or unknown deliveries can be retried.",
  channel_not_ready: "Enable the channel with consent before retrying.",
};
async function api(path: string, body?: unknown) {
  const r = await fetch(path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok)
    throw Error(
      errors[j.error] ??
        (r.status === 401 ? "Sign in again." : "Request rejected."),
    );
  return j;
}
const hex = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
const at = (v: string) =>
  new Date(v).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" }) + " WIB";
const hm = (m: number | null) =>
  m === null
    ? ""
    : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function ChannelCard({
  c,
  run,
  busy,
}: {
  c: ChannelView;
  run: (b: unknown) => Promise<void>;
  busy: boolean;
}) {
  const [destination, setDestination] = useState("");
  const [consent, setConsent] = useState(false);
  const [minSeverity, setMinSeverity] = useState(c.minSeverity);
  const [controlled, setControlled] = useState(c.includeControlledTest);
  const [qe, setQe] = useState(c.quiet.enabled);
  const [tz, setTz] = useState(c.quiet.timezone ?? "Asia/Jakarta");
  const [qs, setQs] = useState(hm(c.quiet.startMinute) || "22:00");
  const [qEnd, setQEnd] = useState(hm(c.quiet.endMinute) || "06:00");
  const base = {
    action: "save_channel",
    channel: c.channel,
    ...(c.revision ? { expectedRevision: c.revision } : {}),
  };
  if (!c.available)
    return (
      <Card>
        <h3>{names[c.channel]}</h3>
        <Badge tone="neutral">Requires business setup · Not configured</Badge>
        <p className="small-text muted">{c.unavailableReason}</p>
      </Card>
    );
  const statusBadge = c.enabled ? (
    <Badge tone="green">Enabled</Badge>
  ) : c.consentAt ? (
    <Badge tone="amber">Consent recorded · disabled</Badge>
  ) : (
    <Badge tone="neutral">Not enabled</Badge>
  );
  return (
    <Card>
      <h3>{names[c.channel]}</h3>
      {statusBadge}{" "}
      {c.destinationMasked && (
        <Badge tone={c.destinationVerified ? "blue" : "amber"}>
          {c.destinationMasked} ·{" "}
          {c.destinationVerified ? "test accepted by provider" : "untested"}
        </Badge>
      )}
      <div className="form-grid">
        <label>
          {c.channel === "telegram"
            ? "Telegram chat ID (numeric)"
            : "Recipient email"}
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder={
              c.destinationMasked ??
              (c.channel === "telegram"
                ? "e.g. 123456789"
                : "owner@example.com")
            }
            autoComplete="off"
          />
        </label>
        <label className="check-line">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          I own or am authorized to use this destination and consent to receive
          Sentinel notifications there.
        </label>
        <Button
          variant="secondary"
          disabled={busy || (!destination && !consent)}
          onClick={() =>
            run({
              ...base,
              ...(destination ? { destination } : {}),
              ...(consent ? { consent: true } : {}),
            }).then(() => {
              setDestination("");
              setConsent(false);
            })
          }
        >
          Save destination
        </Button>
      </div>
      <div className="form-grid">
        <label>
          Minimum severity
          <select
            value={minSeverity}
            onChange={(e) =>
              setMinSeverity(e.target.value as typeof minSeverity)
            }
          >
            <option value="low">Low and above</option>
            <option value="medium">Medium and above</option>
            <option value="high">High only</option>
          </select>
        </label>
        <label className="check-line">
          <input
            type="checkbox"
            checked={controlled}
            onChange={(e) => setControlled(e.target.checked)}
          />
          Include controlled-test incidents
        </label>
        <label className="check-line">
          <input
            type="checkbox"
            checked={qe}
            onChange={(e) => setQe(e.target.checked)}
          />
          Quiet hours
        </label>
        {qe && (
          <>
            <label>
              Timezone (IANA)
              <input value={tz} onChange={(e) => setTz(e.target.value)} />
            </label>
            <label>
              From
              <input
                type="time"
                value={qs}
                onChange={(e) => setQs(e.target.value)}
              />
            </label>
            <label>
              Until
              <input
                type="time"
                value={qEnd}
                onChange={(e) => setQEnd(e.target.value)}
              />
            </label>
          </>
        )}
        <Button
          variant="secondary"
          disabled={busy || !c.revision}
          onClick={() =>
            run({
              ...base,
              minSeverity,
              includeControlledTest: controlled,
              quiet: qe
                ? { enabled: true, timezone: tz, start: qs, end: qEnd }
                : { enabled: false },
            })
          }
        >
          Save preferences
        </Button>
      </div>
      <div className="actions-row">
        <Button
          disabled={busy || !c.consentAt || !c.destinationMasked}
          onClick={() =>
            run({ action: "test", channel: c.channel, idempotencyKey: hex() })
          }
        >
          Send one test message
        </Button>
        {c.enabled ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => run({ ...base, enabled: false })}
          >
            Disable
          </Button>
        ) : (
          <Button
            disabled={busy || !c.consentAt || !c.destinationVerified}
            onClick={() => run({ ...base, enabled: true })}
          >
            Enable notifications
          </Button>
        )}
        {c.consentAt && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => run({ ...base, consent: false })}
          >
            Revoke consent
          </Button>
        )}
      </div>
      {!c.destinationVerified && c.consentAt && (
        <p className="small-text muted">
          A provider-accepted test message is required before enabling.
          Acceptance is not read confirmation.
        </p>
      )}
    </Card>
  );
}

export function LiveNotifications({ projectId }: { projectId: string }) {
  const root = `/api/sentinel/projects/${encodeURIComponent(projectId)}/notifications`;
  const [channels, setChannels] = useState<ChannelView[] | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryView[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const load = useCallback(async () => {
    try {
      setError("");
      const [c, d] = await Promise.all([
        api(root),
        api(`${root}?view=deliveries`),
      ]);
      setChannels(c.channels);
      setDeliveries(d.deliveries);
      setNow(Date.now());
    } catch (e) {
      setChannels([]);
      setError((e as Error).message);
    }
  }, [root]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 10000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);
  const run = async (body: unknown) => {
    setBusy(true);
    try {
      await api(root, body);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const stale = (d: DeliveryView) =>
    d.state === "pending" &&
    now > 0 &&
    now - new Date(d.createdAt).getTime() > 120000;
  return (
    <>
      <PageHeader
        eyebrow="Sentinel"
        title="Notifications"
        description="Opt-in, project-scoped incident notifications with a durable delivery ledger. Messages are sent only by an isolated sender process; this page never holds provider credentials."
      />
      <LiveSentinelNav projectId={projectId} active="/notifications" />
      <Notice tone="neutral">
        Live configuration for this project only. Orderly Demo previews are
        unchanged and never send. A message accepted by Telegram or the email
        provider is not a read receipt or confirmed delivery.
      </Notice>
      {error && <Notice tone="amber">{error}</Notice>}
      {channels && channels.length === 0 && !error ? (
        <Card>
          <Empty
            title="NO-OP / NOT_CONFIGURED"
            description="No notification channels are available."
          />
        </Card>
      ) : (
        <div className="three-columns channel-grid">
          {(channels ?? []).map((c) => (
            <ChannelCard
              key={`${c.channel}:${c.revision}`}
              c={c}
              run={run}
              busy={busy}
            />
          ))}
        </div>
      )}
      <Card>
        <h3>Delivery history</h3>
        {deliveries.length === 0 ? (
          <Empty
            title="No deliveries yet"
            description="Deliveries appear here when an incident matches an enabled channel, or after a test message."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Channel</th>
                  <th>Trigger</th>
                  <th>State</th>
                  <th>Detail</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => {
                  const [label, tone] = stateLabel[d.state] ?? [
                    d.state,
                    "neutral" as const,
                  ];
                  return (
                    <tr key={d.deliveryId}>
                      <td>{at(d.createdAt)}</td>
                      <td>{names[d.channel]}</td>
                      <td>
                        {d.trigger.replaceAll("_", " ")}
                        {d.origin === "controlled_test" && d.trigger !== "test"
                          ? " · controlled test"
                          : ""}
                      </td>
                      <td>
                        <Badge tone={tone}>{label}</Badge>
                      </td>
                      <td>
                        {d.reason ? (reasons[d.reason] ?? d.reason) : ""}
                        {d.attemptCount
                          ? ` · ${d.attemptCount} attempt${d.attemptCount > 1 ? "s" : ""}`
                          : ""}
                        {d.deadLetter ? " · dead letter" : ""}
                        {stale(d)
                          ? " · no sender has picked this up (sender not running or not configured)"
                          : ""}
                      </td>
                      <td>
                        {["failed", "unknown"].includes(d.state) &&
                          d.trigger !== "test" && (
                            <Button
                              variant="secondary"
                              disabled={busy}
                              onClick={() =>
                                run({
                                  action: "retry",
                                  deliveryId: d.deliveryId,
                                  idempotencyKey: hex(),
                                })
                              }
                            >
                              Retry
                            </Button>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
