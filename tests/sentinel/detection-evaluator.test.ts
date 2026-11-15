import { describe, it, expect } from "vitest";
import {
  evaluate,
  eventWindow,
} from "../../src/features/sentinel/detection/evaluator";
import {
  definition,
  ruleCommand,
} from "../../src/features/sentinel/detection/validation";
import { seedRules } from "../../src/features/sentinel/detection/seeds";
import { event, rule, sourceId, start } from "./detection-fixtures";

describe("S03 pure deterministic evaluation, no database acceptance", () => {
  it("never backfills an event ingested one microsecond before activation", () => {
    const r = rule(),
      e = event();
    r.enabledAt = "2026-11-15T00:00:00.123456Z";
    e.ingestedAt = "2026-11-15T00:00:00.123455Z";
    expect(evaluate(r, e, [e]).reason).toBe("kind_or_activation_cutoff");
  });
  it("late-event boundary retains the final PostgreSQL microsecond", () => {
    const r = rule(),
      e = event();
    e.ingestedAt = "2026-11-15T00:10:00.000001Z";
    expect(evaluate(r, e, [e]).outcome).toBe("late_event");
  });
  it.each([0, 1, 4, 5, 6])("evaluates threshold for %i unique events", (n) => {
    const result = evaluate(
      rule(),
      event(),
      Array.from({ length: n }, (_, i) => event(i + 1)),
    );
    expect(result.matched).toBe(n >= 5);
    expect(result.evidence).toHaveLength(n);
    expect(result.outcome).toBe(
      n >= 5 ? "alert_created" : "insufficient_evidence",
    );
  });
  it("defines UTC tumbling buckets with inclusive start and exclusive end", () => {
    const r = rule();
    r.definition.threshold = 1;
    const a = event(),
      b = event(2);
    b.event.occurredAt = "2026-11-15T00:05:00.000Z";
    expect(evaluate(r, a, [a, b]).evidence.map((e) => e.event.eventId)).toEqual(
      [a.event.eventId],
    );
    expect(eventWindow(b.event.occurredAt, 300)).toEqual({
      start: "2026-11-15T00:05:00.000Z",
      end: "2026-11-15T00:10:00.000Z",
    });
  });
  it("sorts evidence and deduplicates identical source event references", () => {
    const es = Array.from({ length: 5 }, (_, i) => event(i + 1));
    expect(evaluate(rule(), es[0], [...es].reverse().concat(es[0]))).toEqual(
      evaluate(rule(), es[0], es),
    );
  });
  it("rejects conflicting duplicate stored content", () => {
    const e = event(),
      other = structuredClone(e);
    other.event.request!.statusCode = 400;
    expect(() => evaluate(rule(), e, [e, other])).toThrow(
      "conflicting_stored_event",
    );
  });
  it.each(["workspaceId", "projectId", "mode"] as const)(
    "rejects cross-scope %s",
    (key) => {
      const e = event();
      if (key === "mode") e.mode = "demo";
      else e[key] += "other";
      expect(() => evaluate(rule(), event(), [e])).toThrow("scope denied");
    },
  );
  it("does not correlate across sources or origins", () => {
    const es = Array.from({ length: 5 }, (_, i) => event(i + 1));
    es[4].sourceId = "00000000-0000-4000-8000-000000000099";
    expect(evaluate(rule(), es[0], es).matched).toBe(false);
    es[4].sourceId = sourceId;
    es[4].evidence.origin = "runtime";
    expect(evaluate(rule(), es[0], es).matched).toBe(false);
  });
  it("never merges missing actors or trusts a producer-supplied actor hash", () => {
    const r = rule();
    r.definition = seedRules[0].definition;
    const es = Array.from({ length: 5 }, (_, i) => event(i + 1));
    es.forEach((e) => {
      e.event.kind = "auth.failed";
      e.event.actorHash = "a".repeat(64);
    });
    expect(evaluate(r, es[0], es)).toMatchObject({
      outcome: "rule_not_applicable",
      reason: "actor_identity_not_persisted",
      matched: false,
    });
  });
  it.each(["DRAFT", "DISABLED"] as const)(
    "never evaluates %s rules",
    (status) => {
      const r = rule();
      r.status = status;
      expect(evaluate(r, event(), [event()]).outcome).toBe(
        "rule_not_applicable",
      );
    },
  );
  it("rejects backfill before rule activation", () => {
    const r = rule();
    r.enabledAt = "2026-11-15T00:01:00.000Z";
    expect(evaluate(r, event(), [event()]).reason).toBe(
      "kind_or_activation_cutoff",
    );
  });
  it("late-arrival boundary is inclusive, later arrivals are audited without matching", () => {
    const r = rule();
    r.definition.threshold = 1;
    const e = event();
    e.ingestedAt = "2026-11-15T00:10:00.000Z";
    expect(evaluate(r, e, [e]).matched).toBe(true);
    e.ingestedAt = "2026-11-15T00:10:00.001Z";
    expect(evaluate(r, e, [e]).outcome).toBe("late_event");
  });
  it("does not depend on worker wall clock or input arrival order", () => {
    const r = rule(),
      es = Array.from({ length: 5 }, (_, i) => event(i + 1));
    es[1].event.occurredAt = "2026-11-15T00:00:02.000Z";
    expect(evaluate(r, es[0], es)).toEqual(
      evaluate(r, es[0], es.slice().reverse()),
    );
  });
  it("binds stable match identity to rule version and window", () => {
    const r = rule(),
      a = evaluate(r, event(), []);
    r.version++;
    expect(evaluate(r, event(), []).matchKey).not.toBe(a.matchKey);
  });
  it("explicit suppression preserves evidence and reports a match separately", () => {
    const r = rule();
    r.definition.threshold = 1;
    r.definition.suppressionWindows = [
      { from: start, to: "2026-11-15T00:01:00.000Z" },
    ];
    expect(evaluate(r, event(), [event()])).toMatchObject({
      matched: true,
      outcome: "alert_suppressed",
      reason: "explicit_event_time_window",
    });
  });
  it("supports status, method and normalized duration and reason conditions", () => {
    const r = rule();
    r.definition.threshold = 1;
    r.definition.conditions = [
      { field: "request.statusCode", op: "lte", value: 500 },
      { field: "request.method", op: "eq", value: "POST" },
      { field: "attributes.durationMs", op: "gte", value: 10 },
      { field: "attributes.reasonCode", op: "eq", value: "request_completed" },
    ];
    const e = event();
    e.event.request!.method = "POST";
    e.event.attributes = { durationMs: 10, reasonCode: "request_completed" };
    expect(evaluate(r, e, [e]).matched).toBe(true);
    e.event.attributes.durationMs = 9;
    expect(evaluate(r, e, [e]).matched).toBe(false);
  });
  it("bounded memory and cancellation fail explicitly", () => {
    expect(() =>
      evaluate(
        rule(),
        event(),
        Array.from({ length: 501 }, () => event()),
      ),
    ).toThrow("capacity");
    const stop = new AbortController();
    stop.abort();
    expect(() => evaluate(rule(), event(), [], stop.signal)).toThrow(
      "cancelled",
    );
  });
  it.each([
    { sql: "SELECT 1" },
    { expression: "process.exit()" },
    { conditions: [{ field: "request.path", op: "eq", value: "/secret" }] },
    { conditions: [{ field: "request.method", op: "regex", value: ".*" }] },
    { threshold: 0 },
    { threshold: 501 },
    { windowSeconds: 0 },
    { windowSeconds: 3601 },
    { confidence: 101 },
    { correlation: "ip" },
    { suppressionWindows: [{ from: start, to: start }] },
  ])("strictly rejects unsafe rule definitions %j", (change) => {
    expect(() =>
      definition({ ...seedRules[3].definition, ...change }),
    ).toThrow();
  });
  it("all seed definitions validate and seed commands never accept hidden scope", () => {
    seedRules.forEach((s) =>
      expect(definition(s.definition).schemaVersion).toBe(1),
    );
    expect(() =>
      ruleCommand({ action: "seed", projectId: "github-456" }),
    ).toThrow();
    expect(() =>
      ruleCommand({
        action: "enable",
        ruleId: rule().ruleId,
        expectedRevision: 1,
        definition: seedRules[3].definition,
      }),
    ).toThrow();
  });
});
