import type { ApprovedDatabaseConfig } from "../../src/platform/config";
import { PlatformError } from "../../src/platform/config";
import type { SqlPool } from "../../src/platform/database";
import {
  sealedAdmission,
  type JobAdmission,
} from "../../src/platform/job-admission";
import type { DetectionActivation } from "../../src/features/sentinel/detection/activation";
import { object, uuid } from "../../src/features/sentinel/telemetry/validation";

export interface AcceptanceIsolation {
  readonly admission: JobAdmission;
  readonly protectedJobIds: readonly string[];
  readonly sourceId: string;
  readonly baselineSha256: string;
}
const plan = "c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94";
export function requestedAcceptanceIsolation(
  config: ApprovedDatabaseConfig,
  detection: DetectionActivation | undefined,
  requested: boolean,
) {
  const isolation = acceptanceIsolation(config, detection);
  if (requested !== Boolean(isolation))
    throw new PlatformError("approval_required");
  return isolation;
}
/** Absence preserves normal maintenance. Presence must fully validate, never silently fall back. */
export function acceptanceIsolation(
  config: ApprovedDatabaseConfig,
  detection?: DetectionActivation,
): AcceptanceIsolation | undefined {
  const raw = (
    config.approval as typeof config.approval & {
      s03RuntimeAcceptance?: unknown;
    }
  ).s03RuntimeAcceptance;
  if (raw === undefined) return;
  try {
    const a = object(raw, [
      "pauseMaintenance",
      "expiresAt",
      "protectedJobIds",
      "jobIds",
      "sourceId",
      "baselineSha256",
    ]);
    if (
      !detection ||
      config.purpose !== "worker" ||
      config.user !== "wetscan_sentinel_worker" ||
      config.target.host !== "127.0.0.1" ||
      config.target.port !== 55432 ||
      config.target.database !== "wetscan_dev" ||
      config.target.marker !==
        "wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f" ||
      config.approval.migrationPlanSha256 !== plan ||
      a.pauseMaintenance !== true ||
      typeof a.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(a.expiresAt)) ||
      Date.parse(a.expiresAt) >
        Date.parse(config.approval.approvedAt) + 600000 ||
      Date.parse(detection.notBefore) <
        Date.parse(config.approval.approvedAt) ||
      detection.scope.workspaceId !== "github-user-187839747:test" ||
      detection.scope.projectId !== "github-998736528" ||
      typeof a.baselineSha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(a.baselineSha256) ||
      !Array.isArray(a.jobIds) ||
      !a.jobIds.every((v) => typeof v === "string") ||
      !Array.isArray(a.protectedJobIds) ||
      a.protectedJobIds.length !== 8 ||
      !a.protectedJobIds.every((v) => typeof v === "string") ||
      new Set(a.protectedJobIds).size !== 8
    )
      throw Error();
    const protectedIds = a.protectedJobIds as string[];
    if (a.jobIds.some((id) => protectedIds.includes(id))) throw Error();
    const admission = sealedAdmission({
      scope: detection.scope,
      jobIds: a.jobIds,
      expiresAt: a.expiresAt,
    });
    return Object.freeze({
      admission,
      protectedJobIds: Object.freeze([...a.protectedJobIds]),
      sourceId: uuid(a.sourceId),
      baselineSha256: a.baselineSha256,
    });
  } catch {
    throw new PlatformError("approval_required");
  }
}
/** Read-only proof before even a new heartbeat: exact IDs/subjects/source/scope/cutoff and protected queued rows. */
export async function verifyAcceptanceJobs(
  pool: SqlPool,
  isolation: AcceptanceIsolation,
  detection: DetectionActivation,
  workerId: string,
) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const collision = (
      await c.query(
        "SELECT EXISTS(SELECT 1 FROM platform.worker_heartbeats WHERE module='sentinel' AND worker_id=$1) AS present",
        [workerId],
      )
    ).rows[0];
    if (!collision || collision.present) throw Error();
    const rows = (
      await c.query(
        `SELECT job_id,module,mode,workspace_id,project_id,kind,subject_ref,state,
      created_at >= $2::timestamptz AS new_enough, clock_timestamp() < $3::timestamptz AS unexpired
      FROM platform.jobs WHERE job_id=ANY($1::text[])`,
        [
          [...isolation.admission.jobIds, ...isolation.protectedJobIds],
          detection.notBefore,
          isolation.admission.expiresAt,
        ],
      )
    ).rows;
    if (rows.length !== isolation.admission.jobIds.length + 8) throw Error();
    for (const r of rows) {
      if (
        r.module !== "sentinel" ||
        r.mode !== detection.scope.mode ||
        r.workspace_id !== detection.scope.workspaceId ||
        r.project_id !== detection.scope.projectId ||
        r.kind !== "sentinel.telemetry.accepted" ||
        !r.unexpired
      )
        throw Error();
      if (isolation.protectedJobIds.includes(r.job_id)) {
        if (r.state !== "queued" || r.new_enough) throw Error();
      } else if (
        !r.new_enough ||
        !["queued", "completed"].includes(r.state) ||
        !r.subject_ref.startsWith(isolation.sourceId + "/")
      )
        throw Error();
    }
    const source = (
      await c.query(
        "SELECT origin,environment FROM sentinel.telemetry_sources WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND source_id=$4",
        [
          detection.scope.mode,
          detection.scope.workspaceId,
          detection.scope.projectId,
          isolation.sourceId,
        ],
      )
    ).rows;
    if (
      source.length !== 1 ||
      source[0].origin !== "controlled_test" ||
      source[0].environment !== "local"
    )
      throw Error();
    await c.query("COMMIT");
  } catch {
    await c.query("ROLLBACK");
    throw new PlatformError("scope_denied");
  } finally {
    c.release();
  }
}
