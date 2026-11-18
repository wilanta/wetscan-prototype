import type { ApprovedDatabaseConfig } from "../../src/platform/config";
import { PlatformError } from "../../src/platform/config";
import type { SqlPool } from "../../src/platform/database";
import { identifier } from "../../src/platform/identity";
import {
  sealedAdmission,
  type JobAdmission,
} from "../../src/platform/job-admission";
import type { Migration } from "../../src/platform/migrations";
import type { DetectionActivation } from "../../src/features/sentinel/detection/activation";
import type { IncidentActivation } from "../../src/features/sentinel/incidents/activation";
import { object, uuid } from "../../src/features/sentinel/telemetry/validation";

export type AcceptancePacket = "s03" | "s04";

export interface AcceptanceIsolation {
  readonly packet: AcceptancePacket;
  readonly admission: JobAdmission;
  readonly protectedJobIds: readonly string[];
  readonly sourceId: string;
  readonly baselineSha256: string;
}
const acceptancePlans: Record<AcceptancePacket, string> = {
  s03: "c3e39f6fd43ee6eb2fbf5b244778955aab4cabb8a11ed3c66d791cf99a252a94",
  s04: "3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7",
};
const s04IncidentMigrationVersion = "0004_incidents";
const s04IncidentMigrationChecksum =
  "84b5b4987e498bbb047505cd81218716357ce5f1434fb466749c7ed433141663";
export function hasValidS04IncidentMigration(
  rows: readonly Pick<Migration, "version" | "checksum">[],
) {
  return rows.some(
    (m) =>
      m.version === s04IncidentMigrationVersion &&
      m.checksum === s04IncidentMigrationChecksum,
  );
}
function validIncidentActivation(
  incidents: IncidentActivation | undefined,
  detection: DetectionActivation,
  minTimestampMs?: number,
): incidents is IncidentActivation {
  if (
    !incidents ||
    incidents.scope.mode !== detection.scope.mode ||
    incidents.scope.workspaceId !== detection.scope.workspaceId ||
    incidents.scope.projectId !== detection.scope.projectId ||
    typeof incidents.notBefore !== "string" ||
    !Number.isFinite(Date.parse(incidents.notBefore))
  )
    return false;
  const incidentMs = Date.parse(incidents.notBefore);
  if (incidentMs < Date.parse(detection.notBefore)) return false;
  if (minTimestampMs !== undefined && incidentMs < minTimestampMs)
    return false;
  return true;
}
export function requestedAcceptanceIsolation(
  config: ApprovedDatabaseConfig,
  detection: DetectionActivation | undefined,
  requested: boolean,
  incidents?: IncidentActivation,
  migrations?: readonly Migration[],
) {
  const isolation = acceptanceIsolation(
    config,
    detection,
    incidents,
    migrations,
  );
  if (requested !== Boolean(isolation))
    throw new PlatformError("approval_required");
  return isolation;
}
/** Absence preserves normal maintenance. Presence must fully validate, never silently fall back. */
export function acceptanceIsolation(
  config: ApprovedDatabaseConfig,
  detection?: DetectionActivation,
  incidents?: IncidentActivation,
  migrations?: readonly Migration[],
): AcceptanceIsolation | undefined {
  const ext = config.approval as typeof config.approval & {
    s03RuntimeAcceptance?: unknown;
    s04RuntimeAcceptance?: unknown;
  };
  const hasS03 = ext.s03RuntimeAcceptance !== undefined;
  const hasS04 = ext.s04RuntimeAcceptance !== undefined;
  if (!hasS03 && !hasS04) return;
  if (hasS03 && hasS04) throw new PlatformError("approval_required");
  const packet: AcceptancePacket = hasS04 ? "s04" : "s03";
  const raw = hasS04 ? ext.s04RuntimeAcceptance : ext.s03RuntimeAcceptance;
  try {
    const a = object(raw, [
      "pauseMaintenance",
      "expiresAt",
      "protectedJobIds",
      "jobIds",
      "sourceId",
      "baselineSha256",
    ]);
    const approvedMs = Date.parse(config.approval.approvedAt);
    if (
      !detection ||
      !Number.isFinite(approvedMs) ||
      config.purpose !== "worker" ||
      config.user !== "wetscan_sentinel_worker" ||
      config.target.host !== "127.0.0.1" ||
      config.target.port !== 55432 ||
      config.target.database !== "wetscan_dev" ||
      config.target.marker !==
        "wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f" ||
      config.approval.migrationPlanSha256 !== acceptancePlans[packet] ||
      a.pauseMaintenance !== true ||
      typeof a.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(a.expiresAt)) ||
      Date.parse(a.expiresAt) > approvedMs + 600000 ||
      !Number.isFinite(Date.parse(detection.notBefore)) ||
      Date.parse(detection.notBefore) < approvedMs ||
      detection.scope.mode !== "live" ||
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
    if (packet === "s04") {
      if (!validIncidentActivation(incidents, detection, approvedMs))
        throw Error();
      if (migrations !== undefined && !hasValidS04IncidentMigration(migrations))
        throw Error();
    }
    const protectedIds = a.protectedJobIds as string[];
    for (const id of protectedIds) identifier(id);
    if (a.jobIds.some((id) => protectedIds.includes(id))) throw Error();
    const admission = sealedAdmission({
      scope: detection.scope,
      jobIds: a.jobIds,
      expiresAt: a.expiresAt,
    });
    return Object.freeze({
      packet,
      admission,
      protectedJobIds: Object.freeze([...protectedIds]),
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
  incidents?: IncidentActivation,
) {
  const isS04 = isolation.packet === "s04";
  if (isS04 && !validIncidentActivation(incidents, detection))
    throw new PlatformError("scope_denied");
  const c = await pool.connect();
  try {
    await c.query("BEGIN READ ONLY");
    if (isS04) {
      const applied = (
        await c.query(
          "SELECT version,checksum FROM platform.schema_migrations ORDER BY version",
        )
      ).rows as Pick<Migration, "version" | "checksum">[];
      if (!hasValidS04IncidentMigration(applied)) throw Error();
    }
    const collision = (
      await c.query(
        "SELECT EXISTS(SELECT 1 FROM platform.worker_heartbeats WHERE module='sentinel' AND worker_id=$1) AS present",
        [workerId],
      )
    ).rows[0];
    if (!collision || collision.present) throw Error();
    const rows = (
      await c.query(
        isS04
          ? `SELECT job_id,module,mode,workspace_id,project_id,kind,subject_ref,state,
      created_at >= $2::timestamptz AS new_enough, created_at >= $4::timestamptz AS incident_eligible,
      clock_timestamp() < $3::timestamptz AS unexpired
      FROM platform.jobs WHERE job_id=ANY($1::text[])`
          : `SELECT job_id,module,mode,workspace_id,project_id,kind,subject_ref,state,
      created_at >= $2::timestamptz AS new_enough, clock_timestamp() < $3::timestamptz AS unexpired
      FROM platform.jobs WHERE job_id=ANY($1::text[])`,
        isS04
          ? [
              [...isolation.admission.jobIds, ...isolation.protectedJobIds],
              detection.notBefore,
              isolation.admission.expiresAt,
              incidents!.notBefore,
            ]
          : [
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
        (isS04 && !r.incident_eligible) ||
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
