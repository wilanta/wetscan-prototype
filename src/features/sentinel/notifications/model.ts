import { createHash } from "node:crypto";
import { backoffMs } from "../../../platform/identity";

/** Delivery ledger states. `provider_accepted` is NOT `delivered`; `delivered` needs verified provider evidence. */
export const deliveryStates = [
  "pending",
  "attempted",
  "provider_accepted",
  "delivered",
  "failed",
  "unknown",
  "suppressed",
] as const;
export type DeliveryState = (typeof deliveryStates)[number];
export const channels = ["telegram", "email", "whatsapp"] as const;
export type NotificationChannel = (typeof channels)[number];
export const severities = ["low", "medium", "high"] as const;
export type NotificationSeverity = (typeof severities)[number];
export type DeliveryTrigger = "incident_opened" | "test" | "manual_retry";
export const triggerKinds = ["incident_opened"] as const;
export const notificationJobKind = "sentinel.outbox";
export const notificationLimits = {
  textChars: 1000,
  titleChars: 160,
  maxAttempts: 5,
  quietMaxDeferMs: 12 * 3600 * 1000,
  maxRetryAfterMs: 15 * 60 * 1000,
  timeoutMs: 8000,
  responseBytes: 16384,
  retentionDays: 30,
} as const;

export interface ChannelConfig {
  channel: NotificationChannel;
  enabled: boolean;
  destination: string | null;
  destinationHash: string | null;
  consentAt: string | null;
  consentBy: string | null;
  minSeverity: NotificationSeverity;
  triggers: string[];
  includeControlledTest: boolean;
  quiet: { enabled: boolean; timezone: string | null; startMinute: number | null; endMinute: number | null };
  throttlePerHour: number;
  revision: number;
}
export interface DeliveryPayload {
  severity?: NotificationSeverity;
  title?: string;
  incidentId?: string;
  origin?: "runtime" | "controlled_test";
}

export const destinationHash = (channel: NotificationChannel, destination: string) =>
  createHash("sha256").update(`${channel}\0${destination}`).digest("hex");
/** Destinations are validated per channel; recipients never come from telemetry. */
export function validDestination(channel: NotificationChannel, value: string): boolean {
  if (channel === "telegram") return /^-?[1-9][0-9]{4,15}$/.test(value);
  if (channel === "email")
    return (
      value.length <= 254 &&
      /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$/.test(value)
    );
  return false; // WhatsApp stays unavailable until H06.
}
export function maskDestination(channel: NotificationChannel, value: string | null): string | null {
  if (!value) return null;
  if (channel === "email") {
    const [local, domain] = value.split("@");
    return `${local.slice(0, 1)}***@${domain}`;
  }
  return `…${value.slice(-4)}`;
}
export function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz.length <= 64 && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(tz);
  } catch {
    return false;
  }
}
const severityRank = { low: 1, medium: 2, high: 3 } as const;
export const meetsSeverity = (actual: NotificationSeverity, min: NotificationSeverity) =>
  severityRank[actual] >= severityRank[min];

/** Local minute-of-day in an explicit IANA timezone. */
export function localMinute(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  return Number(parts.find((p) => p.type === "hour")!.value) * 60 + Number(parts.find((p) => p.type === "minute")!.value);
}
/** Quiet window is [start,end) in the explicit timezone and may cross midnight. Returns when it ends, if active. */
export function quietUntil(
  now: Date,
  quiet: ChannelConfig["quiet"],
): Date | null {
  if (!quiet.enabled || !quiet.timezone || quiet.startMinute === null || quiet.endMinute === null) return null;
  const m = localMinute(now, quiet.timezone);
  const { startMinute: s, endMinute: e } = quiet;
  const inside = s < e ? m >= s && m < e : m >= s || m < e;
  if (!inside) return null;
  const delta = ((e - m + 1440) % 1440) || 1440;
  const minuteFloor = Math.floor(now.getTime() / 60000) * 60000;
  return new Date(minuteFloor + delta * 60000);
}

/** Redact secrets/credentials from any text bound for a provider or a log. Control characters are removed. */
export function redact(text: string, max: number = notificationLimits.textChars): string {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g, "[redacted-token]")
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "[redacted]")
    .replace(/\b(?:re|sk|pk|ghp|gho|ghs|github_pat|xox[a-z])_[A-Za-z0-9_-]{16,}\b/g, "[redacted-token]")
    .replace(/\b[A-Fa-f0-9]{40,}\b/g, "[redacted-hex]")
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, "[redacted-token]")
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@")
    .slice(0, max);
}
export function messageText(
  trigger: DeliveryTrigger,
  payload: DeliveryPayload,
): string {
  if (trigger === "test")
    return "[WetScan TEST] Controlled test notification from Sentinel. This is not a real incident.";
  const origin = payload.origin === "controlled_test" ? "Controlled test" : "Runtime";
  return redact(
    [
      `WetScan Sentinel — ${String(payload.severity ?? "unknown").toUpperCase()} incident opened`,
      redact(String(payload.title ?? "Incident"), notificationLimits.titleChars),
      `Origin: ${origin}`,
      payload.incidentId ? `Incident: ${payload.incidentId}` : "",
      "Provider acceptance of this message is not a read receipt.",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}
export const emailSubject = (trigger: DeliveryTrigger, payload: DeliveryPayload) =>
  trigger === "test"
    ? "[WetScan TEST] Sentinel notification test"
    : redact(`WetScan Sentinel: ${String(payload.severity ?? "").toUpperCase()} incident — ${payload.title ?? "Incident"}`, 200).replace(/[\r\n]+/g, " ");

export type SendOutcome =
  | { kind: "accepted"; providerMessageId: string; acceptedAt: string }
  | { kind: "retryable"; code: string; retryAfterMs?: number; /** request may have reached the provider */ ambiguous?: boolean }
  | { kind: "permanent"; code: string }
  | { kind: "not_configured" };
/** Provider-agnostic sender port: only the credential-isolated notifier process ever instantiates one. */
export interface SenderPort {
  channel: NotificationChannel;
  send(input: { destination: string; text: string; subject: string; deliveryId: string }, signal: AbortSignal): Promise<SendOutcome>;
}
/** Bounded, jittered retry time: never earlier than a provider's retry-after (capped). */
export function retryAt(attempt: number, retryAfterMs?: number, now = Date.now()): string {
  const wait = Math.max(backoffMs(attempt), Math.min(retryAfterMs ?? 0, notificationLimits.maxRetryAfterMs));
  return new Date(now + wait).toISOString();
}
