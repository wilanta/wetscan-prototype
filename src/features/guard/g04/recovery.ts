import type { PlatformDatabase } from "../../../platform/database";
import type { Grant, Scope } from "../contracts";
import { PostgresGuardStore } from "../live/persistence";
import { repositoryScanKind } from "../live/product-policy";

/** Scan states that still claim to be doing work. */
const open = ["queued", "preparing", "running", "normalizing"];
export type Stranded = { stranded: false; reason: "terminal" | "missing" | "worker_alive" | "queued_waiting" } | { stranded: true; reason: "lease_expired" | "job_failed" | "job_cancelled" | "job_completed_scan_open" };

/**
 * Decides, from the durable rows only, whether a G02 repository scan can no longer make progress.
 * A live worker renews its lease every few seconds (lease 30 s); a lease expired by more than `graceMs` means the worker is gone
 * (process killed, hung container call). A `queued` scan is never "stranded": it simply has not been picked up (see resume).
 */
export async function inspectScan(db: PlatformDatabase, scope: Scope, scanId: string, graceMs: number): Promise<Stranded> {
  return db.scoped(scope, async (tx) => {
    const scan = (await db.query(tx, "SELECT status FROM guard.scans WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND scan_id=$4", [scope.mode, scope.workspaceId, scope.projectId, scanId])).rows[0];
    if (!scan) return { stranded: false, reason: "missing" as const };
    if (!open.includes(scan.status)) return { stranded: false, reason: "terminal" as const };
    const job = (await db.query(tx, "SELECT state, lease_until < clock_timestamp() - ($5||' milliseconds')::interval AS lease_dead FROM platform.jobs WHERE module='guard' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND job_id=$4", [scope.mode, scope.workspaceId, scope.projectId, scanId, String(graceMs)])).rows[0];
    if (!job) return { stranded: false, reason: "missing" as const };
    if (job.state === "queued") return { stranded: false, reason: "queued_waiting" as const };
    if (job.state === "leased") return job.lease_dead ? { stranded: true, reason: "lease_expired" as const } : { stranded: false, reason: "worker_alive" as const };
    // The queue already gave up on the job (attempts exhausted / cancelled / completed) but the scan row never reached a terminal state.
    return { stranded: true, reason: job.state === "failed" ? ("job_failed" as const) : job.state === "cancelled" ? ("job_cancelled" as const) : ("job_completed_scan_open" as const) };
  });
}

/**
 * Evidence-preserving recovery: uses G02's own cancel (one transaction: platform job -> cancelled, attempt closed, scan -> cancelled with an
 * audit entry). Findings, engine runs and coverage already stored on the scan are kept; nothing is deleted or rewritten.
 * Returns true only when this call actually moved a stranded scan to `cancelled`.
 */
export async function recoverStranded(db: PlatformDatabase, grant: Grant, scope: Scope, scanId: string, graceMs = 90_000): Promise<{ recovered: boolean; reason: string }> {
  const state = await inspectScan(db, scope, scanId, graceMs);
  if (!state.stranded) return { recovered: false, reason: state.reason };
  await new PostgresGuardStore(db, repositoryScanKind).cancel(grant, scope, scanId);
  return { recovered: true, reason: state.reason };
}
