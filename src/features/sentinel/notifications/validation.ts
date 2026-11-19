import { object, TelemetryError, uuid } from "../telemetry/validation";
import {
  channels,
  severities,
  triggerKinds,
  validDestination,
  validTimezone,
  type NotificationChannel,
  type NotificationSeverity,
} from "./model";

export interface ChannelPatch {
  channel: NotificationChannel;
  /** Absent for first creation; otherwise must equal the stored revision. */
  expectedRevision?: number;
  enabled?: boolean;
  destination?: string | null;
  consent?: boolean;
  minSeverity?: NotificationSeverity;
  triggers?: string[];
  includeControlledTest?: boolean;
  quiet?: { enabled: boolean; timezone?: string; startMinute?: number; endMinute?: number };
  throttlePerHour?: number;
}
export type NotificationCommand =
  | ({ action: "save_channel" } & ChannelPatch)
  | { action: "test"; channel: NotificationChannel; idempotencyKey: string }
  | { action: "retry"; deliveryId: string; idempotencyKey: string };

const bad = (code = "invalid_payload") => new TelemetryError(code);
function channel(v: unknown): NotificationChannel {
  if (typeof v !== "string" || !(channels as readonly string[]).includes(v)) throw bad("invalid_channel");
  return v as NotificationChannel;
}
function key(v: unknown) {
  if (typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v)) throw bad("invalid_idempotency_key");
  return v;
}
function hhmm(v: unknown): number {
  if (typeof v !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw bad("invalid_quiet_hours");
  return Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
}
export function notificationCommand(input: unknown): NotificationCommand {
  const c = object(input, [
    "action", "channel", "expectedRevision", "enabled", "destination", "consent", "minSeverity", "triggers",
    "includeControlledTest", "quiet", "throttlePerHour", "idempotencyKey", "deliveryId",
  ]);
  const only = (allowed: string[]) => {
    if (Object.keys(c).some((k) => k !== "action" && !allowed.includes(k))) throw bad();
  };
  if (c.action === "test") {
    only(["channel", "idempotencyKey"]);
    return { action: "test", channel: channel(c.channel), idempotencyKey: key(c.idempotencyKey) };
  }
  if (c.action === "retry") {
    only(["deliveryId", "idempotencyKey"]);
    return { action: "retry", deliveryId: uuid(c.deliveryId), idempotencyKey: key(c.idempotencyKey) };
  }
  if (c.action !== "save_channel") throw bad("invalid_action");
  only(["channel", "expectedRevision", "enabled", "destination", "consent", "minSeverity", "triggers", "includeControlledTest", "quiet", "throttlePerHour"]);
  const out: ChannelPatch = { channel: channel(c.channel) };
  if (c.expectedRevision !== undefined) {
    if (typeof c.expectedRevision !== "number" || !Number.isInteger(c.expectedRevision) || c.expectedRevision < 1 || c.expectedRevision > 100000)
      throw bad("invalid_revision");
    out.expectedRevision = c.expectedRevision;
  }
  for (const k of ["enabled", "consent", "includeControlledTest"] as const) {
    if (c[k] === undefined) continue;
    if (typeof c[k] !== "boolean") throw bad();
    out[k] = c[k] as boolean;
  }
  if (c.destination !== undefined) {
    if (c.destination !== null) {
      if (typeof c.destination !== "string" || !validDestination(out.channel, c.destination.trim())) throw bad("invalid_destination");
      out.destination = c.destination.trim();
    } else out.destination = null;
  }
  if (c.minSeverity !== undefined) {
    if (typeof c.minSeverity !== "string" || !(severities as readonly string[]).includes(c.minSeverity)) throw bad("invalid_severity");
    out.minSeverity = c.minSeverity as NotificationSeverity;
  }
  if (c.triggers !== undefined) {
    if (!Array.isArray(c.triggers) || c.triggers.length > 4 || c.triggers.some((t) => !(triggerKinds as readonly string[]).includes(t as string)))
      throw bad("invalid_trigger");
    out.triggers = [...new Set(c.triggers as string[])];
  }
  if (c.throttlePerHour !== undefined) {
    if (typeof c.throttlePerHour !== "number" || !Number.isInteger(c.throttlePerHour) || c.throttlePerHour < 1 || c.throttlePerHour > 60)
      throw bad("invalid_throttle");
    out.throttlePerHour = c.throttlePerHour;
  }
  if (c.quiet !== undefined) {
    const q = object(c.quiet, ["enabled", "timezone", "start", "end"]);
    if (typeof q.enabled !== "boolean") throw bad("invalid_quiet_hours");
    if (!q.enabled) out.quiet = { enabled: false };
    else {
      if (typeof q.timezone !== "string" || !validTimezone(q.timezone)) throw bad("invalid_timezone");
      const startMinute = hhmm(q.start), endMinute = hhmm(q.end);
      if (startMinute === endMinute) throw bad("invalid_quiet_hours");
      out.quiet = { enabled: true, timezone: q.timezone, startMinute, endMinute };
    }
  }
  return { action: "save_channel", ...out };
}
