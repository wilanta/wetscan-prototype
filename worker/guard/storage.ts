import { PlatformDatabase } from "../../src/platform/database";
import { heartbeatWorker } from "../../src/platform/health";
import type { Scope } from "../../src/features/guard/contracts";
import { GuardPostgresQueue } from "../../src/features/guard/live/queue";
import { LiveGuardError } from "../../src/features/guard/live/model";
/** S01 transaction/heartbeat conventions, Guard-only scheduler projection and queue. No connection on import. */
export function guardWorkerStorage(db: PlatformDatabase, workerId: string) {
  if (db.module !== "guard" || !db.worker)
    throw new LiveGuardError("approval_required");
  let cursor: Scope | undefined;
  return {
    async scopes(): Promise<Scope[]> {
      return db.transaction(async (tx) => {
        db.requireWorker(tx);
        const rows = (
          await db.query(
            tx,
            "SELECT mode,workspace_id,project_id FROM guard.pending_scopes($1,$2)",
            [cursor?.workspaceId ?? null, cursor?.projectId ?? null],
          )
        ).rows;
        const scopes = rows.map((row) => ({
          mode: row.mode as "live",
          workspaceId: String(row.workspace_id),
          projectId: String(row.project_id),
        }));
        cursor = scopes.length === 100 ? scopes.at(-1) : undefined;
        return scopes;
      });
    },
    queue: (scope: Scope) => new GuardPostgresQueue(db, scope),
    heartbeat: (status: "running" | "stopping" | "stopped") =>
      heartbeatWorker(db, workerId, status),
    async health() {
      return db.transaction(async (tx) => {
        const schema = await db.query(
          tx,
          "SELECT version FROM guard.schema_migrations WHERE version='0001_guard'",
        );
        const pulse = await db.query(
          tx,
          "SELECT status,last_seen_at>clock_timestamp()-interval '30 seconds' AS fresh FROM platform.worker_heartbeats WHERE module='guard' AND worker_id=$1",
          [workerId],
        );
        return {
          module: "guard",
          schema: schema.rowCount === 1 ? "configured" : "unverified",
          worker: pulse.rows[0]?.fresh
            ? pulse.rows[0].status
            : "stale_or_stopped",
          execution: "G02_NOT_CONFIGURED",
        };
      });
    },
  };
}
