import { PlatformDatabase } from "../../../platform/database";
import { PlatformError } from "../../../platform/config";
import type { SentinelProjectContext } from "../types";
import {
  MAX_OVERLAY_INCIDENTS,
  type OverlayEvidence,
  type OverlayIncident,
} from "./mapping";

const iso = (v: unknown) => new Date(v as string).toISOString();

/**
 * Read-only, scope-bound projection of open S04 incidents plus the route/method of their persisted evidence events.
 * Runs inside `db.scoped` (forced RLS); no scope value comes from the caller beyond the authorized context.
 */
export class CanvasOverlayStore {
  constructor(private db: PlatformDatabase) {}
  async openIncidents(
    context: SentinelProjectContext,
  ): Promise<{ incidents: OverlayIncident[]; truncated: boolean }> {
    if (this.db.module !== "sentinel") throw new PlatformError("scope_denied");
    const s = [
      context.scope.mode,
      context.scope.workspaceId,
      context.scope.projectId,
    ];
    return this.db.scoped(context.scope, async (tx) => {
      const rows = (
        await this.db.query(
          tx,
          `SELECT incident_id,title,status,severity,origin,source_id,first_observed_at,last_observed_at FROM sentinel.incidents WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND status IN ('open','investigating') ORDER BY last_observed_at DESC,incident_id DESC LIMIT ${MAX_OVERLAY_INCIDENTS + 1}`,
          s,
        )
      ).rows;
      const truncated = rows.length > MAX_OVERLAY_INCIDENTS;
      const page = rows.slice(0, MAX_OVERLAY_INCIDENTS);
      const evidence = page.length
        ? (
            await this.db.query(
              tx,
              `SELECT ie.incident_id,e.source_id,e.event_id,e.occurred_at,e.event->'request'->>'routeTemplate' AS route,e.event->'request'->>'method' AS method,src.origin FROM sentinel.incident_evidence ie JOIN sentinel.telemetry_events e USING(mode,workspace_id,project_id,source_id,event_id) JOIN sentinel.telemetry_sources src USING(mode,workspace_id,project_id,source_id) WHERE ie.mode=$1 AND ie.workspace_id=$2 AND ie.project_id=$3 AND ie.incident_id=ANY($4::uuid[]) ORDER BY ie.incident_id,e.occurred_at,e.event_id LIMIT 5000`,
              [...s, page.map((r) => r.incident_id)],
            )
          ).rows
        : [];
      const byIncident = new Map<string, OverlayEvidence[]>();
      for (const r of evidence) {
        const list = byIncident.get(r.incident_id) ?? [];
        if (list.length < 50)
          list.push({
            eventId: r.event_id,
            sourceId: r.source_id,
            origin:
              r.origin === "controlled_test" ? "controlled_test" : "runtime",
            occurredAt: iso(r.occurred_at),
            method: r.method ?? undefined,
            routeTemplate: r.route ?? undefined,
          });
        byIncident.set(r.incident_id, list);
      }
      return {
        truncated,
        incidents: page.map((r) => ({
          incidentId: r.incident_id,
          title: r.title,
          status: r.status,
          severity: r.severity,
          origin: r.origin,
          sourceId: r.source_id,
          firstObservedAt: iso(r.first_observed_at),
          lastObservedAt: iso(r.last_observed_at),
          evidence: byIncident.get(r.incident_id) ?? [],
        })),
      };
    });
  }
}
