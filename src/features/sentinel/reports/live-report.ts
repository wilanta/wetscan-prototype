/**
 * S10 evidence-aware live report. Pure builders + CSV serializer; no I/O.
 *
 * Every section is built from an explicit whitelist of aggregate fields. Nothing here ever copies actor ids,
 * notification destinations, provider message ids, raw events, request attributes, secrets or repository content.
 * A section is `ok` only when its producer answered; a missing producer is `not_configured`/`unavailable`, never an
 * empty "all clear".
 */
export const REPORT_WINDOWS = [1, 7, 30] as const;
export type ReportWindow = (typeof REPORT_WINDOWS)[number];
export const REPORT_LIMITS = { exposures: 50, rows: 2000 } as const;

export type Section<T> =
  | { state: "ok"; asOf: string; data: T }
  | { state: "not_configured"; asOf: string }
  | { state: "unavailable"; asOf: string };

type Counts = Record<string, number>;
export interface LiveReport {
  schemaVersion: 1;
  kind: "wetscan.sentinel.live_report";
  mode: "live";
  synthetic: false;
  generatedAt: string;
  scope: { projectId: string };
  windowDays: ReportWindow;
  sections: {
    telemetry: Section<{
      sources: {
        sourceId: string;
        name: string;
        origin: string;
        environment: string;
        status: string;
        lastContactAt: string | null;
        lastIngestedAt: string | null;
      }[];
      sourceStatusCounts: Counts;
      events: { total: number; byKind: Counts; byOrigin: Counts };
    }>;
    detection: Section<{
      alerts: { total: number; bySeverity: Counts; byOrigin: Counts };
    }>;
    incidents: Section<{
      total: number;
      byStatus: Counts;
      bySeverity: Counts;
      byOrigin: Counts;
      note: string;
    }>;
    responses: Section<{
      total: number;
      byStatus: Counts;
      independentlyVerified: number;
      appliedNotVerified: number;
      note: string;
    }>;
    notifications: Section<{
      channels: {
        channel: string;
        enabled: boolean;
        available: boolean;
        consentRecorded: boolean;
        destinationVerified: boolean;
      }[];
      deliveries: {
        total: number;
        byState: Counts;
        providerAccepted: number;
        delivered: number;
        deadLetters: number;
      };
      note: string;
    }>;
    ghost: Section<{
      decoys: { total: number; enabled: number; byOrigin: Counts };
      ruleStatus: string;
      hits: number;
      alerts: number;
      incidents: number;
      note: string;
    }>;
    internalIntelligence: Section<{
      cases: number;
      groups: number;
      candidates: { total: number; byReviewStatus: Counts };
      note: string;
    }>;
    externalIntelligence: Section<{
      sources: {
        provider: string;
        status: string;
        freshness: string;
        lastSuccessAt: string | null;
      }[];
      catalog: { advisories: number; kev: number; withdrawn: number };
      inventory: {
        source: "repository_lockfile" | "none";
        commitSha: string | null;
        collectedAt: string | null;
        itemCount: number;
        expired: boolean;
      };
      exposure: {
        assessment: string;
        reason: string | null;
        items: {
          advisory: string;
          ecosystem: string;
          package: string;
          version: string;
          kev: boolean;
          severity: string;
          conflicting: boolean;
        }[];
        truncated: boolean;
      };
      note: string;
    }>;
  };
  integrations: Record<string, { id: string; status: string; detail: string }>;
  limitations: string[];
}

/** Statuses are tied to the real Guard ports in tests/sentinel/live-report.test.ts. */
export const integrationStatus: LiveReport["integrations"] = {
  canvas: {
    id: "CAN-008",
    status: "implemented",
    detail:
      "Incidents are placed on the Canvas graph only when persisted route evidence matches exactly one source-observed API node of the pinned revision; the rest are listed as not placed.",
  },
  guardInventory: {
    id: "GRD-020",
    status: "not_integrated",
    detail:
      "No Guard dependency-inventory producer exists. The S09 repository-lockfile inventory is independent and is not Guard output.",
  },
  guardPipeline: {
    id: "GRD-021",
    status: "not_integrated",
    detail:
      "No Guard release_evaluated / remediation_retested producer exists. No pipeline audit events are shown.",
  },
};
export const REPORT_LIMITATIONS = [
  "Counts cover only telemetry that authorized sources actually delivered; absence of events or incidents is not evidence of safety.",
  "An applied response is a target receipt; only an independent verifier result counts as verified neutralization.",
  "Provider acceptance of a notification is not confirmed delivery or reading.",
  "A Ghost decoy hit is a signal, not proof of a successful attack.",
  "An advisory or potential exposure is declared-dependency context, not observed exploitation or proof of deployment.",
  "Controlled-test records are labelled and are not runtime evidence.",
  "Figures reflect each module's current stored state at the generation time and its retention limits.",
];

export const countBy = <T>(
  items: readonly T[],
  key: (item: T) => string,
): Counts => {
  const out: Counts = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
};
export function groupedCounts(
  rows: readonly Record<string, unknown>[],
  key: string,
): Counts {
  const out: Counts = {};
  for (const r of rows)
    out[String(r[key])] = (out[String(r[key])] ?? 0) + Number(r.n);
  return out;
}

const FORMULA = /^[=+\-@\t\r]/;
/** Quote every cell; neutralize spreadsheet formulas (OWASP CSV injection). */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

type Row = [section: string, metric: string, key: string, value: unknown];
function flatten(report: LiveReport): Row[] {
  const rows: Row[] = [];
  const add = (...r: Row) => rows.push(r);
  const counts = (s: string, metric: string, c: Counts) => {
    for (const [k, v] of Object.entries(c)) add(s, metric, k, v);
  };
  for (const [name, section] of Object.entries(report.sections)) {
    add(name, "state", "", section.state);
    add(name, "as_of", "", section.asOf);
  }
  const t = report.sections.telemetry;
  if (t.state === "ok") {
    counts("telemetry", "source_status", t.data.sourceStatusCounts);
    for (const s of t.data.sources)
      add(
        "telemetry",
        "source",
        `${s.origin}/${s.environment}`,
        `${s.name} · ${s.status} · last ingested ${s.lastIngestedAt ?? "never"}`,
      );
    add("telemetry", "events_total", "", t.data.events.total);
    counts("telemetry", "events_by_kind", t.data.events.byKind);
    counts("telemetry", "events_by_origin", t.data.events.byOrigin);
  }
  const d = report.sections.detection;
  if (d.state === "ok") {
    add("detection", "alerts_total", "", d.data.alerts.total);
    counts("detection", "alerts_by_severity", d.data.alerts.bySeverity);
    counts("detection", "alerts_by_origin", d.data.alerts.byOrigin);
  }
  const i = report.sections.incidents;
  if (i.state === "ok") {
    add("incidents", "total", "", i.data.total);
    counts("incidents", "by_status", i.data.byStatus);
    counts("incidents", "by_severity", i.data.bySeverity);
    counts("incidents", "by_origin", i.data.byOrigin);
  }
  const r = report.sections.responses;
  if (r.state === "ok") {
    add("responses", "total", "", r.data.total);
    counts("responses", "by_status", r.data.byStatus);
    add(
      "responses",
      "independently_verified",
      "",
      r.data.independentlyVerified,
    );
    add("responses", "applied_not_verified", "", r.data.appliedNotVerified);
  }
  const n = report.sections.notifications;
  if (n.state === "ok") {
    for (const c of n.data.channels)
      add(
        "notifications",
        "channel",
        c.channel,
        `enabled=${c.enabled} available=${c.available} consent=${c.consentRecorded} destination_verified=${c.destinationVerified}`,
      );
    add("notifications", "deliveries_total", "", n.data.deliveries.total);
    counts("notifications", "deliveries_by_state", n.data.deliveries.byState);
    add(
      "notifications",
      "provider_accepted",
      "",
      n.data.deliveries.providerAccepted,
    );
    add(
      "notifications",
      "delivered_confirmed",
      "",
      n.data.deliveries.delivered,
    );
    add("notifications", "dead_letters", "", n.data.deliveries.deadLetters);
  }
  const g = report.sections.ghost;
  if (g.state === "ok") {
    add("ghost", "decoys_total", "", g.data.decoys.total);
    add("ghost", "decoys_enabled", "", g.data.decoys.enabled);
    add("ghost", "rule_status", "", g.data.ruleStatus);
    add("ghost", "hits", "", g.data.hits);
    add("ghost", "alerts", "", g.data.alerts);
    add("ghost", "incidents", "", g.data.incidents);
  }
  const ii = report.sections.internalIntelligence;
  if (ii.state === "ok") {
    add("internal_intelligence", "cases", "", ii.data.cases);
    add("internal_intelligence", "groups", "", ii.data.groups);
    counts(
      "internal_intelligence",
      "candidates_by_review_status",
      ii.data.candidates.byReviewStatus,
    );
  }
  const e = report.sections.externalIntelligence;
  if (e.state === "ok") {
    for (const s of e.data.sources)
      add(
        "external_intelligence",
        "feed",
        s.provider,
        `${s.status} · ${s.freshness} · last success ${s.lastSuccessAt ?? "never"}`,
      );
    add(
      "external_intelligence",
      "catalog_advisories",
      "",
      e.data.catalog.advisories,
    );
    add("external_intelligence", "catalog_kev", "", e.data.catalog.kev);
    add(
      "external_intelligence",
      "inventory",
      e.data.inventory.source,
      `${e.data.inventory.itemCount} items · commit ${e.data.inventory.commitSha ?? "none"} · expired=${e.data.inventory.expired}`,
    );
    add(
      "external_intelligence",
      "exposure_assessment",
      e.data.exposure.reason ?? "",
      e.data.exposure.assessment,
    );
    for (const x of e.data.exposure.items)
      add(
        "external_intelligence",
        "potential_exposure",
        x.advisory,
        `${x.ecosystem}:${x.package}@${x.version} · severity ${x.severity} · kev=${x.kev}`,
      );
  }
  for (const [k, v] of Object.entries(report.integrations))
    add("integrations", k, v.id, `${v.status}: ${v.detail}`);
  for (const l of report.limitations) add("limitations", "note", "", l);
  return rows.slice(0, REPORT_LIMITS.rows);
}
export function reportToCsv(report: LiveReport): string {
  const header = [
    "report",
    "generated_at",
    "project_id",
    "window_days",
    "section",
    "metric",
    "key",
    "value",
  ];
  const meta = [
    "wetscan.sentinel.live_report (live, not synthetic)",
    report.generatedAt,
    report.scope.projectId,
    report.windowDays,
  ];
  return (
    [header, ...flatten(report).map((r) => [...meta, ...r])]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n") + "\r\n"
  );
}
export function reportFilename(
  projectId: string,
  generatedAt: string,
  format: "json" | "csv",
) {
  return `wetscan-sentinel-report-${projectId.replace(/[^a-z0-9-]/gi, "")}-${generatedAt.slice(0, 10)}.${format}`;
}
