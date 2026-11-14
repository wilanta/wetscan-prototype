import type { SentinelScope } from "../features/sentinel/types";
import { PlatformDatabase } from "./database";
import { PlatformError } from "./config";

/** Expire only stale module infrastructure metadata; never delete a current worker heartbeat. */
export async function retainWorkerHeartbeats(db: PlatformDatabase, days = 30) {
  if (!Number.isInteger(days) || days < 1 || days > 90)
    throw new PlatformError("invalid_input");
  return db.transaction(async (tx) => {
    db.requireWorker(tx);
    const result = await db.query(
      tx,
      `DELETE FROM platform.worker_heartbeats WHERE (module,worker_id) IN (
      SELECT module,worker_id FROM platform.worker_heartbeats WHERE module=$1
      AND last_seen_at<clock_timestamp()-($2::int*interval '1 day')
      ORDER BY last_seen_at LIMIT 100 FOR UPDATE SKIP LOCKED)`,
      [db.module, days],
    );
    return result.rowCount ?? 0;
  });
}

/** Bounded terminal infrastructure cleanup only. No event/incident tables exist in S01. */
export async function retainInfrastructure(
  db: PlatformDatabase,
  scope: SentinelScope,
  days = 30,
) {
  if (!Number.isInteger(days) || days < 1 || days > 90)
    throw new PlatformError("invalid_input");
  return db.scoped(scope, async (tx) => {
    db.requireWorker(tx);
    const s = [db.module, scope.mode, scope.workspaceId, scope.projectId, days];
    const hold = await db.query(
      tx,
      `SELECT retention_hold,(last_cleanup_at IS NULL OR last_cleanup_at<clock_timestamp()-interval '1 hour') AS due FROM sentinel.project_bindings WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 FOR UPDATE`,
      s.slice(1, 4),
    );
    if (!hold.rows[0] || hold.rows[0].retention_hold || !hold.rows[0].due)
      return { deletedJobs: 0, deletedOutbox: 0 };
    const outbox = await db.query(
      tx,
      `DELETE FROM platform.notification_outbox WHERE (module,mode,workspace_id,project_id,delivery_id) IN (
      SELECT o.module,o.mode,o.workspace_id,o.project_id,o.delivery_id FROM platform.notification_outbox o JOIN platform.jobs j USING(module,mode,workspace_id,project_id,job_id)
      WHERE o.module=$1 AND o.mode=$2 AND o.workspace_id=$3 AND o.project_id=$4 AND o.state IN ('accepted','failed') AND j.state IN ('completed','failed','cancelled')
      AND o.finished_at<clock_timestamp()-($5::int*interval '1 day') ORDER BY o.finished_at LIMIT 100 FOR UPDATE OF o SKIP LOCKED)`,
      s,
    );
    const jobs = await db.query(
      tx,
      `DELETE FROM platform.jobs WHERE (module,mode,workspace_id,project_id,job_id) IN (
      SELECT j.module,j.mode,j.workspace_id,j.project_id,j.job_id FROM platform.jobs j WHERE j.module=$1 AND j.mode=$2 AND j.workspace_id=$3 AND j.project_id=$4
      AND j.state IN ('completed','failed','cancelled') AND j.finished_at<clock_timestamp()-($5::int*interval '1 day')
      AND NOT EXISTS(SELECT 1 FROM platform.notification_outbox o WHERE o.module=j.module AND o.mode=j.mode AND o.workspace_id=j.workspace_id AND o.project_id=j.project_id AND o.job_id=j.job_id)
      ORDER BY j.finished_at LIMIT 100 FOR UPDATE SKIP LOCKED)`,
      s,
    );
    if ((jobs.rowCount ?? 0) < 100 && (outbox.rowCount ?? 0) < 100)
      await db.query(
        tx,
        `UPDATE sentinel.project_bindings SET last_cleanup_at=clock_timestamp() WHERE mode=$1 AND workspace_id=$2 AND project_id=$3`,
        s.slice(1, 4),
      );
    return {
      deletedJobs: jobs.rowCount ?? 0,
      deletedOutbox: outbox.rowCount ?? 0,
    };
  });
}
