import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type {
  SentinelEventV1,
  SentinelScope,
  TelemetrySource,
  StoredSecurityEvent,
} from "../types";

export class TelemetryError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
  }
}
export const limits = {
  bodyBytes: 65536,
  batch: 25,
  pastMs: 300000,
  futureMs: 30000,
  sourceCap: 100,
  projectEvents: 100000,
  projectBatches: 10000,
} as const;
export const kinds = [
  "auth.failed",
  "http.suspicious_path",
  "http.request",
  "ghost.decoy_triggered",
] as const;
export const severities = ["info", "low", "medium", "high"] as const;
export function object(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    throw new TelemetryError("invalid_payload");
  return value as Record<string, unknown>;
}
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    throw new TelemetryError("invalid_id");
  return value.toLowerCase();
}
export function timestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new TelemetryError("invalid_timestamp");
  const normalized = new Date(value).toISOString();
  if (normalized.slice(0, 10) !== value.slice(0, 10))
    throw new TelemetryError("invalid_timestamp");
  return normalized;
}
export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function sameHash(left: string, right: string) {
  return (
    /^[a-f0-9]{64}$/.test(left) &&
    /^[a-f0-9]{64}$/.test(right) &&
    timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"))
  );
}
export interface CredentialRoute extends SentinelScope {
  sourceId: string;
  credentialId: string;
}
export function issueCredential(scope: SentinelScope, sourceId: string) {
  const route: CredentialRoute = {
    mode: scope.mode,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    sourceId,
    credentialId: randomUUID(),
  };
  const token = `ws2.${Buffer.from(JSON.stringify(route)).toString("base64url")}.${randomBytes(32).toString("hex")}`;
  return { route, token, digest: hash(token) };
}
export function credentialRoute(token: string): CredentialRoute {
  try {
    if (
      token.length > 1200 ||
      !/^ws2\.[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(token)
    )
      throw Error();
    const route = object(
      JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
      ),
      ["mode", "workspaceId", "projectId", "sourceId", "credentialId"],
    );
    if (
      route.mode !== "live" ||
      typeof route.workspaceId !== "string" ||
      route.workspaceId.length > 256 ||
      !/^github-user-[1-9]\d*:.{1,100}$/.test(route.workspaceId) ||
      typeof route.projectId !== "string" ||
      !/^github-[1-9]\d{0,15}$/.test(route.projectId)
    )
      throw Error();
    return {
      mode: "live",
      workspaceId: route.workspaceId,
      projectId: route.projectId,
      sourceId: uuid(route.sourceId),
      credentialId: uuid(route.credentialId),
    };
  } catch {
    throw new TelemetryError("invalid_credential", 401);
  }
}

const staticSegments = new Set([
  "api",
  "v1",
  "v2",
  "auth",
  "login",
  "logout",
  "signin",
  "users",
  "orders",
  "health",
  "ghost",
  "decoy",
  "__wetscan",
  "ghost-decoy",
  ".well-known",
  "admin",
  ".env",
  "wp-admin",
  "robots.txt",
  "favicon.ico",
]);
export function redactRoute(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 512 ||
    !value.startsWith("/") ||
    /[\x00-\x1f]/.test(value)
  )
    throw new TelemetryError("invalid_route");
  return value
    .split(/[?#]/, 1)[0]
    .split("/")
    .map((segment) =>
      !segment || staticSegments.has(segment)
        ? segment
        : ":redacted",
    )
    .join("/");
}
const decoyPathCategories = new Set(["wetscan_decoy", "well_known_decoy"]);
const signalClassifications = new Set([
  "decoy_access",
  "automated_crawler_or_scanner",
  "controlled_test_hit",
]);
const reasons = new Set([
  "invalid_credentials",
  "unauthorized",
  "forbidden",
  "not_found",
  "suspicious_path",
  "controlled_probe",
  "decoy_hit",
  "request_completed",
]);
export interface Batch {
  schemaVersion: 1;
  batchId: string;
  sentAt: string;
  events: SentinelEventV1[];
}
export function parseBatch(
  input: unknown,
  projectId: string,
  now: number,
): Batch {
  const batch = object(input, ["schemaVersion", "batchId", "sentAt", "events"]);
  if (
    batch.schemaVersion !== 1 ||
    !Array.isArray(batch.events) ||
    !batch.events.length ||
    batch.events.length > limits.batch
  )
    throw new TelemetryError("invalid_batch");
  const checkTime = (value: unknown) => {
    const at = timestamp(value);
    const drift = Date.parse(at) - now;
    if (drift < -limits.pastMs || drift > limits.futureMs)
      throw new TelemetryError("outside_clock_window");
    return at;
  };
  const seen = new Set<string>();
  const events = batch.events.map((value) => {
    const e = object(value, [
      "schemaVersion",
      "eventId",
      "projectId",
      "occurredAt",
      "kind",
      "severityHint",
      "actorHash",
      "request",
      "attributes",
    ]);
    if (
      e.schemaVersion !== 1 ||
      e.projectId !== projectId ||
      !kinds.includes(e.kind as (typeof kinds)[number]) ||
      (e.severityHint !== undefined &&
        !severities.includes(e.severityHint as (typeof severities)[number]))
    )
      throw new TelemetryError("invalid_event");
    const eventId = uuid(e.eventId);
    if (seen.has(eventId)) throw new TelemetryError("duplicate_batch_event");
    seen.add(eventId);
    const event: SentinelEventV1 = {
      schemaVersion: 1,
      eventId,
      projectId,
      occurredAt: checkTime(e.occurredAt),
      kind: e.kind as SentinelEventV1["kind"],
      severityHint: (e.severityHint ??
        "info") as SentinelEventV1["severityHint"],
    };
    // Actor identifiers are intentionally discarded, including supplied hashes. Never persist IP/email identifiers.
    if (
      e.actorHash !== undefined &&
      (typeof e.actorHash !== "string" || !/^[a-f0-9]{64}$/.test(e.actorHash))
    )
      throw new TelemetryError("invalid_actor_hash");
    if (e.request !== undefined) {
      const r = object(e.request, ["method", "routeTemplate", "statusCode"]);
      event.request = {};
      if (r.method !== undefined) {
        if (
          typeof r.method !== "string" ||
          ![
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "HEAD",
            "OPTIONS",
          ].includes(r.method)
        )
          throw new TelemetryError("invalid_method");
        event.request.method = r.method;
      }
      if (r.routeTemplate !== undefined)
        event.request.routeTemplate = redactRoute(r.routeTemplate);
      if (r.statusCode !== undefined) {
        if (
          !Number.isInteger(r.statusCode) ||
          Number(r.statusCode) < 100 ||
          Number(r.statusCode) > 599
        )
          throw new TelemetryError("invalid_status");
        event.request.statusCode = Number(r.statusCode);
      }
    }
    if (e.attributes !== undefined) {
      const a = object(e.attributes, [
        "reasonCode",
        "durationMs",
        "controlled",
        "decoyPathCategory",
        "signalClassification",
        "correlationId",
      ]);
      event.attributes = {};
      if (a.reasonCode !== undefined) {
        if (typeof a.reasonCode !== "string")
          throw new TelemetryError("invalid_attribute");
        event.attributes.reasonCode = reasons.has(a.reasonCode)
          ? a.reasonCode
          : "redacted";
      }
      if (a.durationMs !== undefined) {
        if (
          !Number.isFinite(a.durationMs) ||
          Number(a.durationMs) < 0 ||
          Number(a.durationMs) > 3600000
        )
          throw new TelemetryError("invalid_attribute");
        event.attributes.durationMs = Number(a.durationMs);
      }
      if (a.decoyPathCategory !== undefined) {
        if (
          typeof a.decoyPathCategory !== "string" ||
          !decoyPathCategories.has(a.decoyPathCategory)
        )
          throw new TelemetryError("invalid_attribute");
        event.attributes.decoyPathCategory = a.decoyPathCategory;
      }
      if (a.signalClassification !== undefined) {
        if (
          typeof a.signalClassification !== "string" ||
          !signalClassifications.has(a.signalClassification)
        )
          throw new TelemetryError("invalid_attribute");
        event.attributes.signalClassification = a.signalClassification;
      }
      if (a.correlationId !== undefined) {
        event.attributes.correlationId = uuid(a.correlationId);
      }
      if (a.controlled !== undefined) {
        if (typeof a.controlled !== "boolean")
          throw new TelemetryError(
            "invalid_attribute",
          ); /* provenance is always server-derived */
      }
    }
    return event;
  });
  return {
    schemaVersion: 1,
    batchId: uuid(batch.batchId),
    sentAt: checkTime(batch.sentAt),
    events,
  };
}
export interface SourceView extends TelemetrySource {
  name: string;
  enabled: boolean;
  activeCredentials: number;
  lastContactAt: string | null;
  retentionDays: number;
  rateLimit: number;
}
export interface EventPage {
  items: StoredSecurityEvent[];
  nextCursor: string | null;
  window: { from: string; to: string };
}
export interface SourceInput {
  name: string;
  environment: "local" | "staging" | "production";
  origin: "runtime" | "controlled_test";
  retentionDays: number;
  rateLimit: number;
}
export function sourceInput(value: unknown): SourceInput {
  const v = object(value, [
    "name",
    "environment",
    "origin",
    "retentionDays",
    "rateLimit",
  ]);
  if (
    typeof v.name !== "string" ||
    !/^[A-Za-z][A-Za-z0-9 ._-]{0,59}$/.test(v.name) ||
    /[A-Za-z0-9_-]{25,}/.test(v.name) ||
    !["local", "staging", "production"].includes(String(v.environment)) ||
    !["runtime", "controlled_test"].includes(String(v.origin))
  )
    throw new TelemetryError("invalid_source");
  const retentionDays = v.retentionDays ?? 7,
    rateLimit = v.rateLimit ?? 1000;
  if (
    !Number.isInteger(retentionDays) ||
    Number(retentionDays) < 1 ||
    Number(retentionDays) > 30 ||
    !Number.isInteger(rateLimit) ||
    Number(rateLimit) < 1 ||
    Number(rateLimit) > 6000
  )
    throw new TelemetryError("invalid_limits");
  return {
    name: v.name,
    environment: v.environment as SourceInput["environment"],
    origin: v.origin as SourceInput["origin"],
    retentionDays: Number(retentionDays),
    rateLimit: Number(rateLimit),
  };
}
