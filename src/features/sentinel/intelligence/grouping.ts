import { createHash } from "node:crypto";
import type {
  Condition,
  DetectionSeverity,
  EventKind,
  RuleDefinition,
} from "../detection/model";
import { definition as validateDefinition } from "../detection/validation";
import type { SentinelEventV1 } from "../types";
import {
  GROUPING_VERSION,
  GROUPING_WINDOW_DAYS,
  INTEL_SIMILARITY_DISCLAIMER,
  type CandidateBasis,
  type CaseIndicators,
  type CaseOrigin,
  type CaseStatus,
  type IntelGroup,
  type ShelfState,
} from "./model";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
// Must stay in sync with detection/validation.ts reasonCode allow-list; anything else is never copied into a case.
const REASON_CODES = [
  "invalid_credentials",
  "unauthorized",
  "forbidden",
  "not_found",
  "suspicious_path",
  "controlled_probe",
  "decoy_hit",
  "request_completed",
];
const rank: Record<DetectionSeverity, number> = { low: 1, medium: 2, high: 3 };
const uniq = <T extends string | number>(v: T[]) =>
  [...new Set(v)].sort() as T[];

/** Normalized, non-sensitive indicators only: no actor hash, IP, query, header or free-text attribute is ever copied. */
export function extractIndicators(input: {
  ruleName: string;
  events: { kind: EventKind; occurredAt: string; event: SentinelEventV1 }[];
  evidenceCount: number;
  alertCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
}): CaseIndicators {
  const reasonCodes: string[] = [];
  const methods: string[] = [];
  const statusCodes: number[] = [];
  const routes: string[] = [];
  for (const { event } of input.events) {
    const reason = event.attributes?.reasonCode;
    if (typeof reason === "string" && REASON_CODES.includes(reason))
      reasonCodes.push(reason);
    const method = event.request?.method;
    if (typeof method === "string" && METHODS.includes(method))
      methods.push(method);
    const status = event.request?.statusCode;
    if (Number.isInteger(status) && status! >= 100 && status! <= 599)
      statusCodes.push(status!);
    const route = event.request?.routeTemplate;
    if (typeof route === "string" && route.length <= 120) routes.push(route);
  }
  return {
    schemaVersion: 1,
    ruleName: input.ruleName.slice(0, 80),
    eventKinds: uniq(input.events.map((e) => e.kind)),
    reasonCodes: uniq(reasonCodes),
    methods: uniq(methods),
    statusCodes: uniq(statusCodes),
    routeTemplates: uniq(routes).slice(0, 5),
    evidenceCount: input.evidenceCount,
    spanSeconds: Math.max(
      0,
      Math.ceil(
        (Date.parse(input.lastObservedAt) - Date.parse(input.firstObservedAt)) /
          1000,
      ),
    ),
    alertCount: input.alertCount,
  };
}

/** Deterministic grouping signature (v1). Null when there is no expressible indicator beyond category/kind: such cases are never grouped. */
export function caseSignature(
  origin: CaseOrigin,
  category: RuleDefinition["category"],
  i: CaseIndicators,
): string | null {
  if (
    !i.eventKinds.length ||
    !(i.reasonCodes.length + i.methods.length + i.statusCodes.length)
  )
    return null;
  return createHash("sha256")
    .update(
      JSON.stringify({
        v: GROUPING_VERSION,
        origin,
        category,
        eventKinds: i.eventKinds,
        reasonCodes: i.reasonCodes,
        methods: i.methods,
        statusCodes: i.statusCodes,
      }),
    )
    .digest("hex");
}

export interface GroupableCase {
  caseId: string;
  incidentId: string;
  sourceId: string;
  origin: CaseOrigin;
  category: RuleDefinition["category"];
  severity: DetectionSeverity;
  signature: string | null;
  firstObservedAt: string;
  lastObservedAt: string;
  indicators: CaseIndicators;
  status: CaseStatus;
  shelfState: ShelfState;
}

const LIMITATIONS = [
  INTEL_SIMILARITY_DISCLAIMER,
  "Grouping uses exact matches on normalized indicators only; cases with missing indicators are never grouped.",
  "Indicators are snapshots taken when each case was archived.",
];

/** Pure and reproducible: same cases in, same groups out, in any input order. Caller must pass cases from ONE project scope. */
export function groupCases(cases: GroupableCase[]): {
  groups: IntelGroup[];
  ungroupedCount: number;
} {
  const eligible = cases.filter(
    (c) => c.shelfState === "active" && c.status !== "dismissed",
  );
  const bySignature = new Map<string, GroupableCase[]>();
  let ungrouped = cases.length - eligible.length;
  for (const c of eligible) {
    if (!c.signature) {
      ungrouped++;
      continue;
    }
    bySignature.set(c.signature, [...(bySignature.get(c.signature) ?? []), c]);
  }
  const groups: IntelGroup[] = [];
  for (const [signature, all] of [...bySignature].sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  )) {
    const anchor = Math.max(...all.map((c) => Date.parse(c.lastObservedAt)));
    const floor = anchor - GROUPING_WINDOW_DAYS * 86400000;
    const members = all
      .filter((c) => Date.parse(c.lastObservedAt) >= floor)
      .sort((a, b) =>
        a.lastObservedAt === b.lastObservedAt
          ? a.caseId < b.caseId
            ? -1
            : 1
          : a.lastObservedAt < b.lastObservedAt
            ? 1
            : -1,
      );
    const outside = all.length - members.length;
    if (members.length < 2) {
      ungrouped += all.length;
      continue;
    }
    const first = members[0];
    const sources = uniq(members.map((m) => m.sourceId));
    const severity = members.reduce<DetectionSeverity>(
      (s, m) => (rank[m.severity] > rank[s] ? m.severity : s),
      "low",
    );
    const matchedOn = {
      eventKinds: first.indicators.eventKinds,
      reasonCodes: first.indicators.reasonCodes,
      methods: first.indicators.methods,
      statusCodes: first.indicators.statusCodes,
    };
    groups.push({
      groupId: signature,
      groupingVersion: GROUPING_VERSION,
      origin: first.origin,
      category: first.category,
      matchedOn,
      caseIds: members.map((m) => m.caseId),
      incidentIds: members.map((m) => m.incidentId),
      members: members.map((m) => ({
        caseId: m.caseId,
        evidenceCount: m.indicators.evidenceCount,
        spanSeconds: m.indicators.spanSeconds,
      })),
      distinctSourceCount: sources.length,
      severity,
      firstObservedAt: members.reduce(
        (v, m) => (m.firstObservedAt < v ? m.firstObservedAt : v),
        members[0].firstObservedAt,
      ),
      lastObservedAt: members[0].lastObservedAt,
      windowDays: GROUPING_WINDOW_DAYS,
      excludedOutsideWindow: outside,
      confidence: "exact_indicator_match",
      explanation: [
        `${members.length} ${first.origin} cases in category "${first.category}" share identical event kinds [${matchedOn.eventKinds.join(", ")}].`,
        `Shared reason codes: ${matchedOn.reasonCodes.join(", ") || "none"}; methods: ${matchedOn.methods.join(", ") || "none"}; status codes: ${matchedOn.statusCodes.join(", ") || "none"}.`,
        `All members were last observed within ${GROUPING_WINDOW_DAYS} days of the newest member; ${outside} older case(s) with the same signature were excluded.`,
      ],
      limitations: LIMITATIONS,
      candidateId: null,
    });
  }
  return { groups, ungroupedCount: ungrouped };
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

/**
 * Deterministic DRAFT rule proposal. The rule would have matched every member incident
 * (threshold = smallest member evidence count; window = largest member span). Never enabled here.
 */
export function proposeRule(
  group: IntelGroup,
):
  | { ok: true; definition: RuleDefinition; basis: CandidateBasis }
  | { ok: false; error: string } {
  const expressed: string[] = [];
  const notExpressed: string[] = [];
  const conditions: Condition[] = [];
  const m = group.matchedOn;
  const single = <T extends string | number>(
    label: string,
    values: T[],
    build: (v: T) => Condition,
  ) => {
    if (values.length === 1) {
      conditions.push(build(values[0]));
      expressed.push(`${label}=${values[0]}`);
    } else if (values.length > 1)
      notExpressed.push(`${label} varies [${values.join(", ")}]`);
  };
  single("attributes.reasonCode", m.reasonCodes, (value) => ({
    field: "attributes.reasonCode",
    op: "eq",
    value,
  }));
  single("request.method", m.methods, (value) => ({
    field: "request.method",
    op: "eq",
    value,
  }));
  single("request.statusCode", m.statusCodes, (value) => ({
    field: "request.statusCode",
    op: "eq",
    value,
  }));
  if (!conditions.length)
    return { ok: false, error: "no_expressible_condition" };
  const threshold = clamp(
    Math.min(...group.members.map((x) => x.evidenceCount)),
    1,
    500,
  );
  const windowSeconds = clamp(
    Math.max(...group.members.map((x) => x.spanSeconds)),
    60,
    3600,
  );
  let def: RuleDefinition;
  try {
    def = validateDefinition({
      schemaVersion: 1,
      name: `Candidate ${group.category} pattern ${group.groupId.slice(0, 8)}`,
      description: `DRAFT proposed from ${group.caseIds.length} ${group.origin} cases (grouping v${GROUPING_VERSION}). Human review required; not enabled. Similarity does not prove a common attacker.`,
      category: group.category,
      severity: group.severity,
      confidence: 50,
      eventKinds: m.eventKinds,
      conditions,
      correlation: "source",
      windowSeconds,
      threshold,
      cooldownSeconds: 300,
      suppressionWindows: [],
    });
  } catch {
    return { ok: false, error: "proposal_failed_validation" };
  }
  return {
    ok: true,
    definition: def,
    basis: {
      groupingVersion: GROUPING_VERSION,
      caseCount: group.caseIds.length,
      distinctSourceCount: group.distinctSourceCount,
      matchedOn: m,
      conditionsExpressed: expressed,
      conditionsNotExpressed: notExpressed,
      thresholdRationale: `Smallest evidence count among member incidents (${threshold}).`,
      windowRationale: `Largest member observation span, clamped to 60-3600s (${windowSeconds}s).`,
      limitations: [
        ...LIMITATIONS,
        "Confidence is fixed at 50 for every candidate; this is a starting point for review, not a validated detector.",
        "No back-test against live telemetry has been run.",
      ],
    },
  };
}
