import { PlatformDatabase } from "../../../platform/database";
import type { SentinelProjectContext } from "../types";
import { TelemetryStore } from "../telemetry/store";
import { ResponseStore } from "../response/store";
import { NotificationStore } from "../notifications/store";
import { GhostStore } from "../ghost/store";
import { IntelligenceStore } from "../intelligence/store";
import { ExternalService } from "../external/service";
import {
  REPORT_LIMITATIONS,
  REPORT_LIMITS,
  countBy,
  groupedCounts,
  integrationStatus,
  type LiveReport,
  type ReportWindow,
  type Section,
} from "./live-report";

const WINDOW_SQL = "clock_timestamp()-make_interval(days=>$4::int)";

async function section<T>(
  asOf: string,
  work: () => Promise<T>,
): Promise<Section<T>> {
  try {
    return { state: "ok", asOf, data: await work() };
  } catch (error) {
    // 42P01 = tables not migrated: report NOT_CONFIGURED, never a fake empty/ok state.
    return (error as { code?: string })?.code === "42P01"
      ? { state: "not_configured", asOf }
      : { state: "unavailable", asOf };
  }
}

/** Bounded aggregate reads only (GROUP BY counts); raw events/alerts never leave the database layer. */
export async function aggregates(
  db: PlatformDatabase,
  context: SentinelProjectContext,
  days: ReportWindow,
) {
  const v = [
    context.scope.mode,
    context.scope.workspaceId,
    context.scope.projectId,
    days,
  ];
  const base = "mode=$1 AND workspace_id=$2 AND project_id=$3";
  return db.scoped(context.scope, async (tx) => {
    const q = async (sql: string) => (await db.query(tx, sql, v)).rows;
    return {
      events: await q(
        `SELECT e.kind,s.origin,count(*)::int AS n FROM sentinel.telemetry_events e JOIN sentinel.telemetry_sources s USING(mode,workspace_id,project_id,source_id) WHERE e.${base.replaceAll(" AND ", " AND e.")} AND e.occurred_at>=${WINDOW_SQL} GROUP BY e.kind,s.origin`,
      ),
      alerts: await q(
        `SELECT severity,origin,count(*)::int AS n FROM sentinel.detection_alerts WHERE ${base} AND detected_at>=${WINDOW_SQL} GROUP BY severity,origin`,
      ),
      incidents: await q(
        `SELECT status,severity,origin,count(*)::int AS n FROM sentinel.incidents WHERE ${base} AND last_observed_at>=${WINDOW_SQL} GROUP BY status,severity,origin`,
      ),
    };
  });
}

export async function collectLiveReport(
  db: PlatformDatabase,
  context: SentinelProjectContext,
  days: ReportWindow,
  now = new Date(),
): Promise<LiveReport> {
  const asOf = now.toISOString();
  const telemetry = new TelemetryStore(db);
  // One bounded aggregate query shared by three sections; each section still reports its own failure.
  const agg = aggregates(db, context, days);
  agg.catch(() => undefined);
  const [
    telemetrySection,
    detection,
    incidents,
    responses,
    notifications,
    ghost,
    internalIntelligence,
    externalIntelligence,
  ] = await Promise.all([
    section(asOf, async () => {
      const [sources, a] = await Promise.all([telemetry.sources(context), agg]);
      return {
        sources: sources.slice(0, 50).map((s) => ({
          sourceId: s.sourceId,
          name: s.name,
          origin: s.origin,
          environment: s.environment,
          status: s.status,
          lastContactAt: s.lastContactAt,
          lastIngestedAt: s.lastIngestedAt,
        })),
        sourceStatusCounts: countBy(sources, (s) => s.status),
        events: {
          total: a.events.reduce((t, r) => t + Number(r.n), 0),
          byKind: groupedCounts(a.events, "kind"),
          byOrigin: groupedCounts(a.events, "origin"),
        },
      };
    }),
    section(asOf, async () => {
      const a = await agg;
      return {
        alerts: {
          total: a.alerts.reduce((t, r) => t + Number(r.n), 0),
          bySeverity: groupedCounts(a.alerts, "severity"),
          byOrigin: groupedCounts(a.alerts, "origin"),
        },
      };
    }),
    section(asOf, async () => {
      const a = await agg;
      return {
        total: a.incidents.reduce((t, r) => t + Number(r.n), 0),
        byStatus: groupedCounts(a.incidents, "status"),
        bySeverity: groupedCounts(a.incidents, "severity"),
        byOrigin: groupedCounts(a.incidents, "origin"),
        note: "Incidents with activity in the window. Closing an incident ends the investigation workflow only; it does not verify mitigation.",
      };
    }),
    section(asOf, async () => {
      const list = await new ResponseStore(db).list(context);
      const byStatus = countBy(list, (r) => r.status);
      return {
        total: list.length,
        byStatus,
        independentlyVerified: byStatus.verified ?? 0,
        appliedNotVerified:
          (byStatus.applied ?? 0) +
          (byStatus.verification_pending ?? 0) +
          (byStatus.inconclusive ?? 0),
        note: "Most recent 50 actions. 'applied' is a target receipt; only 'verified' reflects an independent verifier result.",
      };
    }),
    section(asOf, async () => {
      const store = new NotificationStore(db);
      const [channels, deliveries] = await Promise.all([
        store.channels(context),
        store.deliveries(context, 100),
      ]);
      return {
        channels: channels.map((c) => ({
          channel: c.channel,
          enabled: c.enabled,
          available: c.available,
          consentRecorded: c.consentAt !== null,
          destinationVerified: c.destinationVerified,
        })),
        deliveries: {
          total: deliveries.length,
          byState: countBy(deliveries, (d) => d.state),
          providerAccepted: deliveries.filter((d) => d.providerAcceptedAt)
            .length,
          delivered: deliveries.filter((d) => d.deliveredAt).length,
          deadLetters: deliveries.filter((d) => d.deadLetter).length,
        },
        note: "Most recent 100 deliveries. Provider acceptance is not confirmed delivery or reading.",
      };
    }),
    section(asOf, async () => {
      const o = await new GhostStore(db).overview(context);
      return {
        decoys: {
          total: o.decoys.length,
          enabled: o.decoys.filter((d) => d.enabled).length,
          byOrigin: countBy(o.decoys, (d) => d.origin),
        },
        ruleStatus: o.ruleStatus,
        hits: o.hits.length,
        alerts: o.alerts.length,
        incidents: o.incidents.length,
        note: o.falsePositivePolicy,
      };
    }),
    section(asOf, async () => {
      const o = await new IntelligenceStore(db).overview(context, {});
      return {
        cases: o.cases.length,
        groups: o.groups.length,
        candidates: {
          total: o.candidates.length,
          byReviewStatus: countBy(o.candidates, (c) => c.reviewStatus),
        },
        note: "Candidates are DRAFT proposals; none is enabled automatically.",
      };
    }),
    section(asOf, async () => {
      const service = new ExternalService(db);
      const [overview, exposure] = await Promise.all([
        service.overview(context),
        service.exposures(context),
      ]);
      const snapshot = overview.inventory.snapshot;
      return {
        sources: overview.sources.map((s) => ({
          provider: s.provider,
          status: s.status,
          freshness: s.freshness,
          lastSuccessAt: s.lastSuccessAt,
        })),
        catalog: overview.catalog,
        inventory: {
          source: snapshot
            ? ("repository_lockfile" as const)
            : ("none" as const),
          commitSha: snapshot?.commitSha ?? null,
          collectedAt: snapshot?.collectedAt ?? null,
          itemCount: snapshot?.itemCount ?? 0,
          expired: overview.inventory.expired,
        },
        exposure: {
          assessment: exposure.assessment,
          reason: exposure.reason,
          items: exposure.exposures
            .slice(0, REPORT_LIMITS.exposures)
            .map((x) => ({
              advisory: x.canonicalId,
              ecosystem: x.ecosystem,
              package: x.packageName,
              version: x.installedVersion,
              kev: x.kev,
              severity: x.topSeverity,
              conflicting: x.conflicting,
            })),
          truncated:
            exposure.truncated ||
            exposure.exposures.length > REPORT_LIMITS.exposures,
        },
        note: exposure.disclaimer,
      };
    }),
  ]);
  return {
    schemaVersion: 1,
    kind: "wetscan.sentinel.live_report",
    mode: "live",
    synthetic: false,
    generatedAt: asOf,
    scope: { projectId: context.scope.projectId },
    windowDays: days,
    sections: {
      telemetry: telemetrySection,
      detection,
      incidents,
      responses,
      notifications,
      ghost,
      internalIntelligence,
      externalIntelligence,
    },
    integrations: integrationStatus,
    limitations: REPORT_LIMITATIONS,
  };
}
