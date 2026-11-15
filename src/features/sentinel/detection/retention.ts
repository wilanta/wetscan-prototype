import type { PlatformDatabase } from "../../../platform/database";
import type { SentinelScope } from "../types";
import { PlatformError } from "../../../platform/config";

/** Derived evidence has a fixed 30-day minimum; rule definitions/audit are not automatically deleted. */
export async function retainDetection(
  db: PlatformDatabase,
  scope: SentinelScope,
) {
  if(db.module!=="sentinel") throw new PlatformError("scope_denied");
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
    if (!held || held.retention_hold) return { alerts: 0, evaluations: 0 };
    const expiredEvaluations = (
      await db.query(
        tx,
        `SELECT rule_id,rule_version,source_id,event_id FROM sentinel.detection_evaluations d WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND evaluated_at<statement_timestamp()-interval '30 days' AND NOT EXISTS(SELECT 1 FROM platform.jobs j WHERE j.module='sentinel' AND j.mode=d.mode AND j.workspace_id=d.workspace_id AND j.project_id=d.project_id AND j.subject_ref=d.source_id::text||'/'||d.event_id::text AND j.state IN ('queued','leased')) ORDER BY evaluated_at,rule_id,source_id,event_id LIMIT 100`,
        s,
      )
    ).rows;
    const expiredKeys = JSON.stringify(expiredEvaluations);
    const keyJoin =
      "d.rule_id=x.rule_id AND d.rule_version=x.rule_version AND d.source_id=x.source_id AND d.event_id=x.event_id";
    const keyRows =
      "jsonb_to_recordset($4::jsonb) AS x(rule_id uuid,rule_version integer,source_id uuid,event_id uuid)";
    await db.query(
      tx,
      `DELETE FROM sentinel.detection_suppressed_evidence d USING ${keyRows} WHERE d.mode=$1 AND d.workspace_id=$2 AND d.project_id=$3 AND ${keyJoin}`,
      [...s, expiredKeys],
    );
    const evaluations = await db.query(
      tx,
      `DELETE FROM sentinel.detection_evaluations d USING ${keyRows} WHERE d.mode=$1 AND d.workspace_id=$2 AND d.project_id=$3 AND ${keyJoin}`,
      [...s, expiredKeys],
    );
    const expired = (
      await db.query(
        tx,
        `SELECT alert_id FROM sentinel.detection_alerts a WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND detected_at<statement_timestamp()-interval '30 days' AND NOT EXISTS(SELECT 1 FROM sentinel.detection_evidence e JOIN platform.jobs j ON j.module='sentinel' AND j.mode=e.mode AND j.workspace_id=e.workspace_id AND j.project_id=e.project_id AND j.subject_ref=e.source_id::text||'/'||e.event_id::text WHERE e.mode=a.mode AND e.workspace_id=a.workspace_id AND e.project_id=a.project_id AND e.alert_id=a.alert_id AND j.state IN ('queued','leased')) ORDER BY detected_at,alert_id LIMIT 100`,
        s,
      )
    ).rows.map((r) => r.alert_id);
    if (expired.length) {
      await db.query(
        tx,
        "DELETE FROM sentinel.detection_evidence WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND alert_id=ANY($4::uuid[])",
        [...s, expired],
      );
      await db.query(
        tx,
        "DELETE FROM sentinel.detection_alerts WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND alert_id=ANY($4::uuid[])",
        [...s, expired],
      );
    }
    await db.query(
      tx,
      `DELETE FROM sentinel.detection_cooldowns WHERE (mode,workspace_id,project_id,rule_id,rule_version,source_id,correlation_key) IN (SELECT mode,workspace_id,project_id,rule_id,rule_version,source_id,correlation_key FROM sentinel.detection_cooldowns WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND last_alert_at<statement_timestamp()-interval '30 days' ORDER BY last_alert_at LIMIT 100)`,
      s,
    );
    return { alerts: expired.length, evaluations: evaluations.rowCount ?? 0 };
  });
}
