import { fixtureTarget } from "./catalog";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import { join } from "node:path";
import { regularJson } from "./package";
import type { ExecutionPacket, ExecutionApproval } from "./approval";
export const initialSentinelProjection =
  "45e7cfe26767e26ad96ceda0dd2a53649a10ea7a5453844ac50ee30867e1095d";
export interface PreservationProjection {
  sentinel: {
    scope: string;
    preserved: boolean;
    beforeSha256: string;
    afterSha256: string;
    differentSections: unknown[];
    state: {
      database: string;
      serverPort: number;
      owner: string;
      marker: string;
    };
  };
  guard: {
    caseId: string;
    database: string;
    port: number;
    marker: string;
    owner: string;
    projectionSha256: string;
    excludedJob: string | null;
    excludedWorkers: string[];
    currentCaseScans: number;
    currentCaseJobs: number;
    observedAt: string;
    rlsVerified: boolean;
  };
}
export function validateProjection(
  p: PreservationProjection,
  caseId: string,
  jobId: string | null,
  workers: readonly string[],
) {
  const s = p?.sentinel,
    g = p?.guard;
  if (
    !s ||
    !g ||
    s.scope !==
      "isolated G01 database; external Sentinel database not observed" ||
    !s.preserved ||
    s.beforeSha256 !== initialSentinelProjection ||
    s.afterSha256 !== initialSentinelProjection ||
    !Array.isArray(s.differentSections) ||
    s.differentSections.length ||
    s.state?.database !== fixtureTarget.database ||
    s.state.serverPort !== fixtureTarget.port ||
    s.state.owner !== "wetscan_guard_migrator" ||
    s.state.marker !== fixtureTarget.marker ||
    g.caseId !== caseId ||
    g.database !== fixtureTarget.database ||
    g.port !== fixtureTarget.port ||
    g.marker !== fixtureTarget.marker ||
    g.owner !== "wetscan_guard_migrator" ||
    !/^[a-f0-9]{64}$/.test(g.projectionSha256) ||
    g.excludedJob !== jobId ||
    JSON.stringify(g.excludedWorkers) !== JSON.stringify(workers) ||
    !Number.isInteger(g.currentCaseScans) ||
    g.currentCaseScans < 0 ||
    !Number.isInteger(g.currentCaseJobs) ||
    g.currentCaseJobs < 0 ||
    !Number.isFinite(Date.parse(g.observedAt)) ||
    Date.parse(g.observedAt) > Date.now() + 60000 ||
    g.rlsVerified !== true
  )
    throw new LiveGuardError("execution_not_ready");
}
/** Strip all unneeded operator input; never persist headers, cookies, credentials or raw SQL data. */
export function publicProjection(
  input: PreservationProjection,
  p: ExecutionPacket,
) {
  validateProjection(input, p.caseId, p.binding?.jobId ?? null, p.workerIds);
  const s = input.sentinel,
    g = input.guard;
  return {
    sentinel: {
      scope: s.scope,
      preserved: s.preserved,
      beforeSha256: s.beforeSha256,
      afterSha256: s.afterSha256,
      differentSections: s.differentSections,
      state: {
        database: s.state.database,
        serverPort: s.state.serverPort,
        owner: s.state.owner,
        marker: s.state.marker,
      },
    },
    guard: {
      caseId: g.caseId,
      database: g.database,
      port: g.port,
      marker: g.marker,
      owner: g.owner,
      projectionSha256: g.projectionSha256,
      excludedJob: g.excludedJob,
      excludedWorkers: g.excludedWorkers,
      currentCaseScans: g.currentCaseScans,
      currentCaseJobs: g.currentCaseJobs,
      observedAt: g.observedAt,
      rlsVerified: g.rlsVerified,
    },
  };
}
export async function requireBeforeProjection(
  p: ExecutionPacket,
  a: ExecutionApproval,
  root: string,
) {
  const before = publicProjection(
    (await regularJson(
      join(
        /* turbopackIgnore: true */ root,
        p.runId + ".preservation.before.json",
      ),
    )) as PreservationProjection,
    p,
  );
  if (
    before.guard.currentCaseJobs !== 0 ||
    before.guard.currentCaseScans !== 0 ||
    Date.parse(before.guard.observedAt) < Date.parse(a.approvedAt) - 300000 ||
    Date.now() - Date.parse(before.guard.observedAt) > p.limits.minutes * 60000
  )
    throw new LiveGuardError("execution_not_ready");
  return before;
}
/** Operator-supplied results from the frozen target-checked READ ONLY SQL, never a config ready flag. */
export function preserved(
  before: PreservationProjection,
  after: PreservationProjection,
  caseId: string,
  jobId: string | null,
  workers: readonly string[],
) {
  for (const p of [before, after])
    validateProjection(p, caseId, jobId, workers);
  if (
    before.guard.projectionSha256 !== after.guard.projectionSha256 ||
    before.guard.currentCaseScans !== 0 ||
    before.guard.currentCaseJobs !== 0 ||
    after.guard.currentCaseScans !== (jobId ? 1 : 0) ||
    after.guard.currentCaseJobs !== (jobId ? 1 : 0) ||
    Date.parse(after.guard.observedAt) < Date.parse(before.guard.observedAt)
  )
    throw new LiveGuardError("execution_not_ready");
  return {
    sentinelPreserved: true,
    originalRowsPreserved: true,
    scope: "G01_FIXTURE_ONLY",
    externalSentinel: "NOT_VERIFIED",
    externalReason: "TARGET_NOT_IDENTIFIED",
  };
}
