import { createHash } from "node:crypto";
import { assertSameScope } from "../scope";
import type { StoredSecurityEvent } from "../types";
import { detectionLimits, type DetectionRule, type Evaluation } from "./model";
import { definition } from "./validation";
import { micros, preciseTime } from "./time";

const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function eventWindow(at: string, seconds: number) {
  const start = Math.floor(Date.parse(at) / (seconds * 1000)) * seconds * 1000;
  return {
    start: new Date(start).toISOString(),
    end: new Date(start + seconds * 1000).toISOString(),
  };
}
/** Pure event-time evaluator. No local clock, SQL, code execution, raw actor fallback or regex language. */
export function evaluate(
  rule: DetectionRule,
  anchor: StoredSecurityEvent,
  events: readonly StoredSecurityEvent[],
  signal?: AbortSignal,
): Evaluation {
  const d = definition(rule.definition);
  assertSameScope(rule, anchor);
  if (
    !Number.isFinite(Date.parse(anchor.event.occurredAt)) ||
    !Number.isFinite(Date.parse(anchor.ingestedAt))
  )
    throw Error("invalid_stored_event");
  if (events.length > detectionLimits.events)
    throw Error("evaluation_capacity");
  const window = eventWindow(anchor.event.occurredAt, d.windowSeconds),
    correlationKey = digest([
      rule.mode,
      rule.workspaceId,
      rule.projectId,
      anchor.sourceId,
      anchor.evidence.origin,
      d.correlation,
    ]);
  const result: Evaluation = {
    outcome: "rule_not_applicable",
    reason: "rule_inactive",
    matched: false,
    correlationKey,
    matchKey: digest([
      1,
      rule.mode,
      rule.workspaceId,
      rule.projectId,
      rule.ruleId,
      rule.version,
      anchor.sourceId,
      correlationKey,
      window.start,
    ]),
    windowStart: window.start,
    windowEnd: window.end,
    evidence: [],
  };
  const check = () => {
    if (signal?.aborted) throw Error("cancelled");
  };
  check();
  if (rule.status !== "ENABLED" || !rule.enabledAt) return result;
  if (d.correlation === "actor_hash")
    return { ...result, reason: "actor_identity_not_persisted" };
  if (
    !d.eventKinds.includes(anchor.event.kind) ||
    micros(anchor.ingestedAt) < micros(rule.enabledAt)
  )
    return { ...result, reason: "kind_or_activation_cutoff" };
  if (
    micros(anchor.ingestedAt) >
    micros(window.end) + BigInt(detectionLimits.lateSeconds) * 1000000n
  )
    return {
      ...result,
      outcome: "late_event",
      reason: "window_finalized_at_ingestion",
    };
  const seen = new Map<string, StoredSecurityEvent>();
  for (const e of events) {
    check();
    assertSameScope(rule, e);
    const occurred = Date.parse(e.event.occurredAt),
      ingested = Date.parse(e.ingestedAt);
    if (!Number.isFinite(occurred) || !Number.isFinite(ingested))
      throw Error("invalid_stored_event");
    if (
      e.sourceId !== anchor.sourceId ||
      e.evidence.origin !== anchor.evidence.origin ||
      !["runtime", "controlled_test"].includes(e.evidence.origin) ||
      !d.eventKinds.includes(e.event.kind) ||
      occurred < Date.parse(window.start) ||
      occurred >= Date.parse(window.end) ||
      micros(e.ingestedAt) < micros(rule.enabledAt) ||
      micros(e.ingestedAt) >
        micros(window.end) + BigInt(detectionLimits.lateSeconds) * 1000000n
    )
      continue;
    if (
      !d.conditions.every((c) => {
        const actual =
          c.field === "request.statusCode"
            ? e.event.request?.statusCode
            : c.field === "request.method"
              ? e.event.request?.method
              : c.field === "attributes.durationMs"
                ? e.event.attributes?.durationMs
                : e.event.attributes?.reasonCode;
        return c.op === "eq"
          ? actual === c.value
          : typeof actual === "number" &&
              typeof c.value === "number" &&
              (c.op === "gte" ? actual >= c.value : actual <= c.value);
      })
    )
      continue;
    const key = `${e.sourceId}/${e.event.eventId}`,
      prior = seen.get(key);
    if (prior && JSON.stringify(prior) !== JSON.stringify(e))
      throw Error("conflicting_stored_event");
    seen.set(key, e);
  }
  result.evidence = [...seen.values()].sort(
    (a, b) =>
      order(preciseTime(a.event.occurredAt), preciseTime(b.event.occurredAt)) ||
      order(a.sourceId, b.sourceId) ||
      order(a.event.eventId, b.event.eventId),
  );
  if (result.evidence.length < d.threshold)
    return {
      ...result,
      outcome: "insufficient_evidence",
      reason: "threshold_not_reached",
    };
  if (
    d.suppressionWindows.some(
      (w) =>
        anchor.event.occurredAt >= w.from && anchor.event.occurredAt < w.to,
    )
  )
    return {
      ...result,
      matched: true,
      outcome: "alert_suppressed",
      reason: "explicit_event_time_window",
    };
  return {
    ...result,
    matched: true,
    outcome: "alert_created",
    reason: "threshold_reached",
  };
}
