import type { SentinelProjectContext, SentinelScope } from "../types";
import type { TransactionContext } from "../platform-contracts";
import { PlatformDatabase } from "../../../platform/database";
import { PlatformError } from "../../../platform/config";

/** Call from a trusted server after authorizeSentinelProject on every operation; no API added. */
export async function bindProject(
  db: PlatformDatabase,
  tx: TransactionContext,
  context: SentinelProjectContext,
) {
  db.requireScope(tx, context.scope);
  if (
    context.scope.mode !== "live" ||
    context.scope.projectId !== `github-${context.repositoryId}` ||
    !/^github-user-[1-9]\d*$/.test(context.actorId) ||
    context.canvasProjectRef !==
      `${context.actorId}/${context.scope.projectId}` ||
    !context.scope.workspaceId.startsWith(`${context.actorId}:`)
  )
    throw new PlatformError("scope_denied");
  const s = context.scope;
  await db.query(
    tx,
    `INSERT INTO sentinel.project_bindings(mode,workspace_id,project_id,repository_id,actor_id)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(mode,workspace_id,project_id) DO UPDATE SET
    enabled=true,actor_id=EXCLUDED.actor_id,revision=project_bindings.revision+1,updated_at=clock_timestamp()
    WHERE project_bindings.enabled IS DISTINCT FROM true OR project_bindings.actor_id IS DISTINCT FROM EXCLUDED.actor_id`,
    [s.mode, s.workspaceId, s.projectId, context.repositoryId, context.actorId],
  );
}
export async function registeredScopes(
  db: PlatformDatabase,
  after?: SentinelScope,
): Promise<SentinelScope[]> {
  return db.transaction(async (tx) => {
    db.requireWorker(tx);
    return (
      await db.query(
        tx,
        `SELECT mode,workspace_id,project_id FROM sentinel.project_bindings WHERE mode='live'
      AND ($1::text IS NULL OR (workspace_id,project_id)>($1,$2)) ORDER BY workspace_id,project_id LIMIT 100`,
        [after?.workspaceId ?? null, after?.projectId ?? null],
      )
    ).rows.map((r) => ({
      mode: r.mode as "live",
      workspaceId: r.workspace_id as string,
      projectId: r.project_id as string,
    }));
  });
}
export async function disableProject(
  db: PlatformDatabase,
  tx: TransactionContext,
  scope: SentinelScope,
) {
  db.requireScope(tx, scope);
  await db.query(
    tx,
    `UPDATE sentinel.project_bindings SET enabled=false,revision=revision+1,updated_at=clock_timestamp() WHERE mode=$1 AND workspace_id=$2 AND project_id=$3`,
    [scope.mode, scope.workspaceId, scope.projectId],
  );
  // Revoke queued/in-flight processing atomically; old leases lose their fencing authority.
  await db.query(
    tx,
    `UPDATE platform.jobs SET state='cancelled',cancel_requested=true,finished_at=clock_timestamp(),lease_owner=NULL,lease_token=NULL,lease_until=NULL,revision=revision+1
    WHERE module='sentinel' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND state IN ('queued','leased')`,
    [scope.mode, scope.workspaceId, scope.projectId],
  );
  await db.query(
    tx,
    `UPDATE platform.job_attempts a SET outcome='cancelled',finished_at=clock_timestamp() FROM platform.jobs j
    WHERE a.module=j.module AND a.mode=j.mode AND a.workspace_id=j.workspace_id AND a.project_id=j.project_id AND a.job_id=j.job_id
    AND j.module='sentinel' AND j.mode=$1 AND j.workspace_id=$2 AND j.project_id=$3 AND j.state='cancelled' AND a.finished_at IS NULL`,
    [scope.mode, scope.workspaceId, scope.projectId],
  );
  await db.query(
    tx,
    `UPDATE platform.notification_outbox o SET state='failed',finished_at=clock_timestamp() FROM platform.jobs j
    WHERE o.module=j.module AND o.mode=j.mode AND o.workspace_id=j.workspace_id AND o.project_id=j.project_id AND o.job_id=j.job_id
    AND j.module='sentinel' AND j.mode=$1 AND j.workspace_id=$2 AND j.project_id=$3 AND j.state='cancelled' AND o.state='pending'`,
    [scope.mode, scope.workspaceId, scope.projectId],
  );
}
