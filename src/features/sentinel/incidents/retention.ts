import type { PlatformDatabase } from "../../../platform/database";
import type { SentinelScope } from "../types";
import { PlatformError } from "../../../platform/config";

/** Open and investigating incidents are pinned indefinitely; only closed incidents past the 30-day window without active jobs are deleted. */
export async function retainIncidents(
  db: PlatformDatabase,
  scope: SentinelScope,
) {
  if (db.module !== "sentinel") throw new PlatformError("scope_denied");
  return db.scoped(scope, async (tx) => {
    db.requireWorker(tx);
    const s = [scope.mode, scope.workspaceId, scope.projectId];
    const held = (
      await db.query(
        tx,
        "SELECT retention_hold FROM sentinel.project_bindings WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 FOR UPDATE",
        s,
      )
    ).rows[0];
    if (!held || held.retention_hold) return { incidents: 0, timeline: 0 };
    const expired = (
      await db.query(
        tx,
        `SELECT i.incident_id FROM sentinel.incidents i WHERE i.mode=$1 AND i.workspace_id=$2 AND i.project_id=$3 AND i.status='closed' AND i.closed_at IS NOT NULL AND i.closed_at<statement_timestamp()-interval '30 days' AND NOT EXISTS(SELECT 1 FROM sentinel.incident_evidence e JOIN platform.jobs j ON j.module='sentinel' AND j.mode=e.mode AND j.workspace_id=e.workspace_id AND j.project_id=e.project_id AND j.subject_ref=e.source_id::text||'/'||e.event_id::text WHERE e.mode=i.mode AND e.workspace_id=i.workspace_id AND e.project_id=i.project_id AND e.incident_id=i.incident_id AND j.state IN ('queued','leased')) ORDER BY i.closed_at,i.incident_id LIMIT 100`,
        s,
      )
    ).rows.map((r) => r.incident_id as string);
    if (!expired.length) return { incidents: 0, timeline: 0 };
    await db.query(
      tx,
      "DELETE FROM sentinel.incident_timeline_evidence WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND incident_id=ANY($4::uuid[])",
      [...s, expired],
    );
    const timeline = await db.query(
      tx,
      "DELETE FROM sentinel.incident_timeline WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND incident_id=ANY($4::uuid[])",
      [...s, expired],
    );
    await db.query(
      tx,
      "DELETE FROM sentinel.incident_evidence WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND incident_id=ANY($4::uuid[])",
      [...s, expired],
    );
    await db.query(
      tx,
      "DELETE FROM sentinel.incident_alerts WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND incident_id=ANY($4::uuid[])",
      [...s, expired],
    );
    await db.query(
      tx,
      "DELETE FROM sentinel.incidents WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND incident_id=ANY($4::uuid[])",
      [...s, expired],
    );
    return { incidents: expired.length, timeline: timeline.rowCount ?? 0 };
  });
}
