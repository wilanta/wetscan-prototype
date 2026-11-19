import { describe, expect, it } from "vitest";
import {
  caseSignature,
  extractIndicators,
  groupCases,
  proposeRule,
  type GroupableCase,
} from "../../src/features/sentinel/intelligence/grouping";
import { definition } from "../../src/features/sentinel/detection/validation";
import type { CaseIndicators } from "../../src/features/sentinel/intelligence/model";
import type { SentinelEventV1 } from "../../src/features/sentinel/types";

const ev = (over: Partial<SentinelEventV1> = {}): SentinelEventV1 => ({
  schemaVersion: 1,
  eventId: "e",
  projectId: "github-1",
  occurredAt: "2026-11-01T00:00:00.000Z",
  kind: "http.suspicious_path",
  request: { method: "GET", routeTemplate: "/admin", statusCode: 404 },
  attributes: { reasonCode: "suspicious_path" },
  ...over,
});
const ind = (over: Partial<CaseIndicators> = {}): CaseIndicators => ({
  schemaVersion: 1,
  ruleName: "r",
  eventKinds: ["http.suspicious_path"],
  reasonCodes: ["suspicious_path"],
  methods: ["GET"],
  statusCodes: [404],
  routeTemplates: [],
  evidenceCount: 3,
  spanSeconds: 120,
  alertCount: 1,
  ...over,
});
let n = 0;
const mk = (over: Partial<GroupableCase> = {}): GroupableCase => {
  const i = ind(over.indicators as Partial<CaseIndicators> | undefined);
  n++;
  const origin = over.origin ?? "runtime";
  return {
    caseId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    incidentId: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    sourceId: "20000000-0000-4000-8000-000000000001",
    origin,
    category: "http",
    severity: "medium",
    signature: caseSignature(origin, "http", i),
    firstObservedAt: "2026-11-01T00:00:00.000Z",
    lastObservedAt: "2026-11-01T00:02:00.000Z",
    indicators: i,
    status: "draft_pending_review",
    shelfState: "active",
    ...over,
  };
};

describe("S08 indicator extraction", () => {
  it("copies only normalized allow-listed indicators, never actor hashes, IPs, queries or free text", () => {
    const i = extractIndicators({
      ruleName: "Rule",
      events: [
        {
          kind: "http.suspicious_path",
          occurredAt: "2026-11-01T00:00:00.000Z",
          event: ev({
            actorHash: "a".repeat(64),
            attributes: {
              reasonCode: "suspicious_path",
              note: "password=Canary123",
              ip: "198.51.100.7",
            },
          }),
        },
        {
          kind: "http.request",
          occurredAt: "2026-11-01T00:00:01.000Z",
          event: ev({
            kind: "http.request",
            request: { method: "TRACE", statusCode: 9999 },
            attributes: { reasonCode: "free-text-not-allowed" },
          }),
        },
      ],
      evidenceCount: 2,
      alertCount: 1,
      firstObservedAt: "2026-11-01T00:00:00.000Z",
      lastObservedAt: "2026-11-01T00:00:30.500Z",
    });
    expect(i.reasonCodes).toEqual(["suspicious_path"]);
    expect(i.methods).toEqual(["GET"]);
    expect(i.statusCodes).toEqual([404]);
    expect(i.eventKinds).toEqual(["http.request", "http.suspicious_path"]);
    expect(i.spanSeconds).toBe(31);
    expect(JSON.stringify(i)).not.toMatch(
      /Canary123|198\.51|aaaa|TRACE|free-text/,
    );
  });
  it("yields a null signature when no expressible indicator exists", () => {
    expect(
      caseSignature(
        "runtime",
        "http",
        ind({ reasonCodes: [], methods: [], statusCodes: [] }),
      ),
    ).toBeNull();
  });
  it("signature separates origin and category", () => {
    const a = caseSignature("runtime", "http", ind());
    expect(caseSignature("controlled_test", "http", ind())).not.toBe(a);
    expect(caseSignature("runtime", "decoy", ind())).not.toBe(a);
    expect(caseSignature("runtime", "http", ind())).toBe(a);
  });
});

describe("S08 deterministic grouping", () => {
  it("groups identical signatures, explains the match, and is independent of input order", () => {
    const cases = [mk(), mk(), mk()];
    const a = groupCases(cases);
    const b = groupCases([...cases].reverse());
    expect(a).toEqual(b);
    expect(a.groups).toHaveLength(1);
    const g = a.groups[0];
    expect(g.caseIds).toHaveLength(3);
    expect(g.confidence).toBe("exact_indicator_match");
    expect(g.explanation.join(" ")).toContain("suspicious_path");
    expect(g.limitations.join(" ")).toMatch(/not prove a common attacker/);
  });
  it("never groups a single case and counts it as ungrouped", () => {
    const r = groupCases([mk()]);
    expect(r.groups).toEqual([]);
    expect(r.ungroupedCount).toBe(1);
  });
  it("does not mix controlled_test and runtime cases", () => {
    const r = groupCases([mk(), mk({ origin: "controlled_test" })]);
    expect(r.groups).toEqual([]);
    expect(r.ungroupedCount).toBe(2);
  });
  it("does not group cases with different indicators or missing indicators", () => {
    const empty = { reasonCodes: [], methods: [], statusCodes: [] };
    const r = groupCases([
      mk(),
      mk({ indicators: ind({ methods: ["POST"] }) }),
      mk({ indicators: ind(empty) }),
      mk({ indicators: ind(empty) }),
    ]);
    expect(r.groups).toEqual([]);
    expect(r.ungroupedCount).toBe(4);
  });
  it("excludes shelved and dismissed cases", () => {
    const r = groupCases([
      mk(),
      mk({ shelfState: "shelved" }),
      mk({ status: "dismissed" }),
    ]);
    expect(r.groups).toEqual([]);
  });
  it("applies the 30-day window relative to the newest member, not the wall clock", () => {
    const old = mk({
      firstObservedAt: "2026-08-01T00:00:00.000Z",
      lastObservedAt: "2026-08-01T00:02:00.000Z",
    });
    const g = groupCases([mk(), mk(), old]).groups[0];
    expect(g.caseIds).toHaveLength(2);
    expect(g.excludedOutsideWindow).toBe(1);
  });
});

describe("S08 deterministic DRAFT rule proposal", () => {
  const group = () =>
    groupCases([
      mk({ indicators: ind({ evidenceCount: 5, spanSeconds: 30 }) }),
      mk({ indicators: ind({ evidenceCount: 3, spanSeconds: 200 }) }),
    ]).groups[0];
  it("builds a valid S03 definition that would have matched every member", () => {
    const p = proposeRule(group());
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(definition(p.definition)).toEqual(p.definition);
    expect(p.definition.threshold).toBe(3);
    expect(p.definition.windowSeconds).toBe(200);
    expect(p.definition.correlation).toBe("source");
    expect(p.definition.conditions).toEqual([
      { field: "attributes.reasonCode", op: "eq", value: "suspicious_path" },
      { field: "request.method", op: "eq", value: "GET" },
      { field: "request.statusCode", op: "eq", value: 404 },
    ]);
    expect(p.definition.description).toMatch(/not enabled/i);
    expect(p.basis.limitations.join(" ")).toMatch(/No back-test/);
  });
  it("reports indicators it cannot express instead of widening the rule", () => {
    const g = groupCases([
      mk({ indicators: ind({ methods: ["GET", "POST"] }) }),
      mk({ indicators: ind({ methods: ["GET", "POST"] }) }),
    ]).groups[0];
    const p = proposeRule(g);
    expect(p.ok && p.basis.conditionsNotExpressed[0]).toContain(
      "request.method",
    );
    expect(
      p.ok && p.definition.conditions.some((c) => c.field === "request.method"),
    ).toBe(false);
  });
  it("refuses when no condition can be expressed", () => {
    const both = ind({
      reasonCodes: ["a1" as never, "b1" as never],
      methods: [],
      statusCodes: [],
    });
    const g = groupCases([mk({ indicators: both }), mk({ indicators: both })])
      .groups[0];
    expect(proposeRule(g)).toEqual({
      ok: false,
      error: "no_expressible_condition",
    });
  });
});
