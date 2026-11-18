import { createHash } from "node:crypto";
import { stat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { QueryResultRow } from "pg";
import {
  approvedDatabaseConfig,
  PlatformError,
  parseApproval,
  type ApprovedAction,
  type DatabaseApproval,
  type Environment,
  type Purpose,
  type Target,
} from "../../src/platform/config";
import type { SqlClient, SqlPool } from "../../src/platform/database";
import { PlatformDatabase } from "../../src/platform/database";
import { identifier } from "../../src/platform/identity";
import type { Migration } from "../../src/platform/migrations";
import { PostgresQueue } from "../../src/platform/queue";
import { detectionActivation } from "../../src/features/sentinel/detection/activation";
import { retainDetection } from "../../src/features/sentinel/detection/retention";
import { incidentActivation } from "../../src/features/sentinel/incidents/activation";
import { retainIncidents } from "../../src/features/sentinel/incidents/retention";
import { retainTelemetry } from "../../src/features/sentinel/telemetry/store";
import {
  object,
  timestamp,
  uuid,
} from "../../src/features/sentinel/telemetry/validation";
import type { SentinelScope } from "../../src/features/sentinel/types";
import {
  acceptanceIsolation,
  requestedAcceptanceIsolation,
  verifyAcceptanceJobs,
} from "../../worker/sentinel/acceptance";
import {
  reviewedS04Plan,
  verifyPopulatedS04DownRefusal,
} from "./incident-acceptance-safety";

export const s04DevTarget: Target = {
  host: "127.0.0.1",
  port: 55432,
  database: "wetscan_dev",
  marker: "wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f",
};

export const s04DevProjectScope: SentinelScope = {
  mode: "live",
  workspaceId: "github-user-187839747:test",
  projectId: "github-998736528",
};

export const s04DevContainer = {
  context: "desktop-linux",
  containerName: "wetscan-sentinel-s04-postgres-792151c53653",
  containerId:
    "178eef261a5e1a7163bd4943dafd4b8bc8bdc77dfcc80be9270517c60b21a4f4",
  image:
    "sha256:99d1a998c76487d3abb48b141505bda5dcf8089c0c4cd7be40f75de314fa32f0",
  volume: "wetscan_sentinel_s04_dev_clone_20261117_792151c53653",
  portBinding: "127.0.0.1:55432->5432/tcp",
} as const;

export const s04Tables = [
  "incident_alerts",
  "incident_evidence",
  "incident_timeline",
  "incident_timeline_evidence",
  "incidents",
] as const;

export const s04ExplicitIndexes = [
  "incident_alerts_lookup",
  "incident_evidence_event",
  "incident_timeline_evidence_event",
  "incident_timeline_order",
  "incidents_filters",
  "incidents_query",
] as const;

export const s04DevBaseline = {
  tableCount: 25,
  preS04TableCount: 20,
  s04TableCount: 5,
  historicalRows: 91,
  protectedQueuedJobs: 8,
  historicalDigest:
    "4fba3a8a893cf25adcf5ea3902dedac650b0230d0982ca49f211e2b4033f034a",
  backupSizeBytes: 110541,
  backupSha256:
    "67e363879f95475b5b4fae81cabe9816196d06ce84d27bee3f39dd2cfb83430e",
  planSha256: reviewedS04Plan,
  migration0004Sha256:
    "84b5b4987e498bbb047505cd81218716357ce5f1434fb466749c7ed433141663",
} as const;

export const s04DevPriorAttemptDefaults = {
  ruleId: "7ad1deb8-e555-44ec-be98-b7def574781d",
  initialStatus: "ENABLED",
  initialRevision: 2,
  finalStatus: "DISABLED",
  finalRevision: 3,
} as const;

export const h04cB2Phases = [
  "preflight",
  "contain-rule",
  "app-session",
  "provision-ingest",
  "seal-worker",
  "worker-run",
  "verify-incidents",
  "negative-matrix",
  "cleanup",
  "postflight",
] as const;

export type H04CB2Phase = (typeof h04cB2Phases)[number];

export interface H04CB2PhaseMetadata {
  phase: H04CB2Phase;
  expiresAt: string;
}

export interface H04CB2GateOptions {
  phase: H04CB2Phase;
  maxTtlMs: number;
  nowMs?: number;
}

export interface ProtectedJobBaselineRow {
  job_id: string;
  kind: string;
  mode: string;
  workspace_id: string;
  project_id: string;
  state: string;
  revision: number;
  attempts: number;
  max_attempts: number;
  cancel_requested: boolean;
  fence: number;
  lease_owner: string | null;
  subject_ref?: string;
  subject_ref_prefix?: string;
  created_at: string;
  available_at: string;
  finished_at: string | null;
  last_error: string | null;
}

export interface WorkerHeartbeatBaselineRow {
  module?: string;
  worker_id: string;
  status: string;
  started_at?: string;
  last_seen_at?: string;
}

/** Migration-defined columns on platform.worker_heartbeats (0001_foundation.up.sql). */
export const workerHeartbeatColumns = [
  "module",
  "worker_id",
  "started_at",
  "last_seen_at",
  "status",
] as const;

/** Migration-defined columns on sentinel.incidents (0004_incidents.up.sql). */
export const incidentColumns = [
  "mode",
  "workspace_id",
  "project_id",
  "incident_id",
  "source_id",
  "primary_alert_id",
  "rule_id",
  "rule_version",
  "schema_version",
  "title",
  "summary",
  "category",
  "severity",
  "status",
  "verification_status",
  "archived",
  "origin",
  "correlation_key",
  "deduplication_key",
  "first_observed_at",
  "last_observed_at",
  "opened_at",
  "updated_at",
  "closed_at",
  "closed_by",
  "close_reason",
  "last_actor_id",
  "revision",
] as const;

const whereSqlKeywords = new Set([
  "and",
  "or",
  "not",
  "is",
  "null",
  "true",
  "false",
  "in",
  "any",
]);

function extractSqlColumnName(expr: string): string {
  let cleaned = expr.trim();
  while (/::[a-z_][a-z0-9_]*$/i.test(cleaned)) {
    cleaned = cleaned.replace(/::[a-z_][a-z0-9_]*$/i, "").trim();
  }
  const dotted = /^[a-z_][a-z0-9_]*\.([a-z_][a-z0-9_]*)$/i.exec(cleaned);
  if (dotted) {
    return dotted[1].toLowerCase();
  }
  return cleaned.toLowerCase();
}

/** Validates single-table SELECT SQL references only migration-defined columns for expectedTable. */
export function assertSingleTableSelectColumns(
  sql: string,
  expectedTable: string,
  allowedColumns: readonly string[],
): void {
  const normalized = sql.trim().replace(/\s+/g, " ");
  const match =
    /^SELECT\s+(.+?)\s+FROM\s+([a-z_]+\.[a-z_]+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s*;)?$/i.exec(
      normalized,
    );
  if (!match || match[2].toLowerCase() !== expectedTable.toLowerCase()) {
    throw new PlatformError("target_denied");
  }

  const allowed = new Set(allowedColumns.map((c) => c.toLowerCase()));
  const [, selectClause, , whereClause, orderByClause] = match;

  for (const item of selectClause.split(",")) {
    const expr = item.split(/\s+AS\s+/i)[0] ?? "";
    const col = extractSqlColumnName(expr);
    if (!/^[a-z_][a-z0-9_]*$/.test(col) || !allowed.has(col)) {
      throw new PlatformError("target_denied");
    }
  }

  if (whereClause) {
    const stripped = whereClause
      .replace(/'[^']*'/g, " ")
      .replace(/::[a-z_][a-z0-9_]*/gi, " ")
      .replace(/\$\d+/g, " ");
    const tokens = stripped.match(/[a-z_][a-z0-9_]*/gi) ?? [];
    for (const token of tokens) {
      const lower = token.toLowerCase();
      if (!whereSqlKeywords.has(lower) && !allowed.has(lower)) {
        throw new PlatformError("target_denied");
      }
    }
  }

  if (orderByClause) {
    for (const item of orderByClause.split(",")) {
      const expr = item.replace(/\s+(ASC|DESC)$/i, "").trim();
      const col = extractSqlColumnName(expr);
      if (!/^[a-z_][a-z0-9_]*$/.test(col) || !allowed.has(col)) {
        throw new PlatformError("target_denied");
      }
    }
  }
}

export interface SourceStatusBaselineRow {
  source_id: string;
  enabled: boolean;
  active_credentials: number;
}

export interface RuleStatusBaselineRow {
  rule_id: string;
  status: string;
  revision?: number;
}

export interface PreRecoverySnapshot {
  schemaVersion: 1;
  recordedAt: string;
  target: Target;
  historicalDigest: string;
  tableCount: number;
  s04Empty: boolean;
  recoveryMode: boolean;
  tableCounts: Readonly<Record<string, number>>;
  preRecoveryRowHashesByTable: Readonly<Record<string, readonly string[]>>;
  protectedJobIds: readonly string[];
  historicalCompletedJobIds: readonly string[];
  priorAttemptJobs: readonly ProtectedJobBaselineRow[];
  priorSources: readonly SourceStatusBaselineRow[];
  priorRules: readonly RuleStatusBaselineRow[];
  priorRuleRowHashesById?: Readonly<Record<string, string>>;
  historicalHeartbeats: readonly WorkerHeartbeatBaselineRow[];
  existingIncidentIds: readonly string[];
  orphanedTimelineEvidenceCount: number;
  preRecoverySha256: string;
}

export interface AuthorizedRuleTransition {
  ruleId: string;
  ruleRowBeforeHash: string;
  finalStatus: string;
}

export interface IncidentListCandidate {
  incidentId: string;
  sourceId: string;
  ruleId: string;
}

export interface DevPostflightSnapshot {
  activeLeases: number;
  expiredLeases: number;
  liveSessions: readonly unknown[];
  runningProcesses: readonly unknown[];
  workerHeartbeats: readonly WorkerHeartbeatBaselineRow[];
  historicalHeartbeats?: readonly WorkerHeartbeatBaselineRow[];
  requiredStoppedWorkerIds?: readonly string[];
  backupBytes: number;
  backupSha256: string;
  sources: readonly SourceStatusBaselineRow[];
  rules: readonly RuleStatusBaselineRow[];
  requiredDisabledSourceIds?: readonly string[];
  requiredDisabledRuleIds?: readonly string[];
  orphanedTimelineEvidenceCount?: number;
  persistedTextSamples: readonly string[];
  canarySecrets: readonly string[];
}

export interface SealedS04ApprovalInput {
  approvedBy: string;
  approvedAt: string;
  ttlMs: number;
  sourceId: string;
  protectedJobIds: readonly string[];
  priorAttemptJobIds?: readonly string[];
  jobIds: readonly string[];
  earliestJobCreatedAt?: string;
  detectionNotBefore?: string;
  incidentsNotBefore?: string;
  baselineSha256?: string;
  migrations?: readonly Migration[];
}

export interface NegativePostgresResult {
  crossProjectRlsApp: boolean;
  crossProjectRlsWorker: boolean;
  appLeastPrivilegeDmlDenied: boolean;
  workerAppendOnlyDmlDenied: boolean;
  workerFencingAndIdempotency: boolean;
  rolledBackRetentionPins: {
    incidentPreserved: boolean;
    alertPreserved: boolean;
    evidencePreserved: boolean;
    batchesBefore: number;
    batchesAfterRollback: number;
    eventsBefore: number;
    eventsAfterRollback: number;
  };
  populatedDownRefusal: boolean;
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function assertSameDevTarget(target: Target): void {
  if (
    target.host !== s04DevTarget.host ||
    target.port !== s04DevTarget.port ||
    target.database !== s04DevTarget.database ||
    target.marker !== s04DevTarget.marker
  ) {
    throw new PlatformError("target_denied");
  }
}

/** Reject relative paths and any location inside the workspace repo so secrets stay out of Git/OneDrive sync. */
export function assertSafeDevArtifactDir(
  artifactDir: string,
  repoRoot: string,
): string {
  if (!artifactDir || !isAbsolute(artifactDir)) {
    throw new PlatformError("invalid_input");
  }
  const absDir = resolve(artifactDir);
  const absRepo = resolve(repoRoot);
  const rel = relative(absRepo, absDir);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    throw new PlatformError("target_denied");
  }
  return absDir;
}

/** Pure synchronous validator for H04C-B2 phase approvals. Fails closed on migrate_down, expiry, TTL overflow, or wrong target/plan. */
export function parseH04CB2PhaseApproval(
  value: unknown,
  action: ApprovedAction,
  options: H04CB2GateOptions,
): DatabaseApproval & { h04cB2: H04CB2PhaseMetadata } {
  if (action === "migrate_down" || action === "integration_test") {
    throw new PlatformError("target_denied");
  }
  const parsed = parseApproval(
    value,
    s04DevTarget,
    action,
    s04DevBaseline.planSha256,
  );
  assertSameDevTarget(parsed.target);
  if (
    parsed.actions.includes("migrate_down") ||
    parsed.actions.includes("integration_test")
  ) {
    throw new PlatformError("target_denied");
  }
  const ext = parsed as DatabaseApproval & { h04cB2?: unknown };
  try {
    const meta = object(ext.h04cB2, ["phase", "expiresAt"]);
    if (
      typeof meta.phase !== "string" ||
      meta.phase !== options.phase ||
      !h04cB2Phases.includes(options.phase)
    ) {
      throw Error();
    }
    const expiresAt = timestamp(meta.expiresAt);
    const approvedMs = Date.parse(parsed.approvedAt);
    const expiresMs = Date.parse(expiresAt);
    const nowMs = options.nowMs ?? Date.now();
    if (
      !Number.isFinite(approvedMs) ||
      !Number.isFinite(expiresMs) ||
      expiresMs <= approvedMs ||
      expiresMs - approvedMs > options.maxTtlMs ||
      nowMs >= expiresMs
    ) {
      throw Error();
    }
    return {
      ...parsed,
      h04cB2: { phase: options.phase, expiresAt },
    };
  } catch {
    throw new PlatformError("approval_required");
  }
}

/** Requires explicit SENTINEL_H04C_B2_EXECUTION=1 opt-in, least-privilege role separation, and a valid bounded DEV approval. */
export async function requireH04CB2ExecutionGate(
  env: Environment,
  purpose: Purpose,
  action: ApprovedAction,
  options: H04CB2GateOptions,
) {
  if (env.SENTINEL_H04C_B2_EXECUTION !== "1") {
    throw new PlatformError("approval_required");
  }
  if (
    (purpose === "worker" || purpose === "app") &&
    env.SENTINEL_DB_MIGRATION_PASSWORD_FILE
  ) {
    throw new PlatformError("target_denied");
  }
  const config = await approvedDatabaseConfig(
    env,
    purpose,
    action,
    s04DevBaseline.planSha256,
  );
  assertSameDevTarget(config.target);
  parseH04CB2PhaseApproval(config.approval, action, options);
  return config;
}

/** Builds a strictly sealed s04RuntimeAcceptance worker approval and cross-validates every worker/isolation invariant before emission. */
export function buildSealedS04RuntimeApproval(input: SealedS04ApprovalInput) {
  if (!input.approvedBy.trim()) throw new PlatformError("invalid_input");
  const approvedAt = timestamp(input.approvedAt);
  const approvedMs = Date.parse(approvedAt);
  if (
    !Number.isSafeInteger(input.ttlMs) ||
    input.ttlMs < 1000 ||
    input.ttlMs > 600000
  ) {
    throw new PlatformError("invalid_input");
  }
  const expiresAt = new Date(approvedMs + input.ttlMs).toISOString();
  const detectionNotBefore = timestamp(input.detectionNotBefore ?? approvedAt);
  const incidentsNotBefore = timestamp(
    input.incidentsNotBefore ?? detectionNotBefore,
  );
  const detectionMs = Date.parse(detectionNotBefore);
  const incidentsMs = Date.parse(incidentsNotBefore);
  if (detectionMs < approvedMs || incidentsMs < detectionMs) {
    throw new PlatformError("invalid_input");
  }
  if (input.earliestJobCreatedAt !== undefined) {
    const earliestJobMs = Date.parse(timestamp(input.earliestJobCreatedAt));
    if (incidentsMs > earliestJobMs) {
      throw new PlatformError("invalid_input");
    }
  }
  const sourceId = uuid(input.sourceId);
  if (
    input.protectedJobIds.length !== s04DevBaseline.protectedQueuedJobs ||
    new Set(input.protectedJobIds).size !== s04DevBaseline.protectedQueuedJobs
  ) {
    throw new PlatformError("invalid_input");
  }
  for (const id of input.protectedJobIds) identifier(id);
  if (
    input.jobIds.length < 1 ||
    input.jobIds.length > 12 ||
    new Set(input.jobIds).size !== input.jobIds.length
  ) {
    throw new PlatformError("invalid_input");
  }
  const priorAttemptSet = new Set(input.priorAttemptJobIds ?? []);
  for (const id of input.priorAttemptJobIds ?? []) identifier(id);
  for (const id of input.jobIds) {
    identifier(id);
    if (input.protectedJobIds.includes(id) || priorAttemptSet.has(id)) {
      throw new PlatformError("target_denied");
    }
  }
  const baselineSha256 =
    input.baselineSha256 ?? s04DevBaseline.historicalDigest;
  if (!/^[a-f0-9]{64}$/.test(baselineSha256)) {
    throw new PlatformError("invalid_input");
  }

  const approval = {
    schemaVersion: 1 as const,
    status: "APPROVED" as const,
    approvedBy: input.approvedBy.trim(),
    approvedAt,
    target: { ...s04DevTarget },
    actions: ["runtime" as const],
    migrationPlanSha256: s04DevBaseline.planSha256,
    detection: {
      ...s04DevProjectScope,
      notBefore: detectionNotBefore,
      processNewTelemetry: true as const,
    },
    incidents: {
      ...s04DevProjectScope,
      notBefore: incidentsNotBefore,
      createFromNewAlerts: true as const,
    },
    s04RuntimeAcceptance: {
      pauseMaintenance: true as const,
      expiresAt,
      protectedJobIds: [...input.protectedJobIds],
      jobIds: [...input.jobIds],
      sourceId,
      baselineSha256,
    },
    h04cB2: {
      phase: "worker-run" as const,
      expiresAt,
    },
  };

  // Validate against actual worker/feature activation gates before returning.
  const config = {
    target: s04DevTarget,
    purpose: "worker" as const,
    user: "wetscan_sentinel_worker",
    password: "validation-only-placeholder",
    max: 3,
    approval: parseH04CB2PhaseApproval(approval, "runtime", {
      phase: "worker-run",
      maxTtlMs: 600000,
      nowMs: approvedMs,
    }),
  };
  const detection = detectionActivation(config.approval, true);
  const incidents = incidentActivation(config.approval, true, detection);
  requestedAcceptanceIsolation(
    config,
    detection,
    true,
    incidents,
    input.migrations as Migration[] | undefined,
  );
  return approval;
}

export function assertWorkerHealthPayload(payload: unknown): void {
  const h = payload as Record<string, unknown> | null;
  if (
    !h ||
    (h.acceptanceIsolation !== undefined && h.acceptanceIsolation !== true) ||
    h.maintenance !== "paused_for_expiring_local_acceptance" ||
    h.jobAdmission !== "sealed_job_ids" ||
    h.incidents !== "enabled_for_approved_new_alerts"
  ) {
    throw new PlatformError("scope_denied");
  }
}

function canonicalPreRecoveryBody(
  snapshot: Omit<PreRecoverySnapshot, "preRecoverySha256">,
) {
  return {
    schemaVersion: snapshot.schemaVersion,
    recordedAt: snapshot.recordedAt,
    target: {
      host: snapshot.target.host,
      port: snapshot.target.port,
      database: snapshot.target.database,
      marker: snapshot.target.marker,
    },
    historicalDigest: snapshot.historicalDigest,
    tableCount: snapshot.tableCount,
    s04Empty: snapshot.s04Empty,
    recoveryMode: snapshot.recoveryMode,
    tableCounts: snapshot.tableCounts,
    preRecoveryRowHashesByTable: snapshot.preRecoveryRowHashesByTable,
    protectedJobIds: snapshot.protectedJobIds,
    historicalCompletedJobIds: snapshot.historicalCompletedJobIds,
    priorAttemptJobs: snapshot.priorAttemptJobs,
    priorSources: snapshot.priorSources,
    priorRules: snapshot.priorRules,
    priorRuleRowHashesById: snapshot.priorRuleRowHashesById ?? {},
    historicalHeartbeats: snapshot.historicalHeartbeats,
    existingIncidentIds: snapshot.existingIncidentIds,
    orphanedTimelineEvidenceCount: snapshot.orphanedTimelineEvidenceCount,
  };
}

/** Computes the integrity digest over all canonical fields of a DEV pre-recovery baseline snapshot. */
export function computePreRecoverySha256(
  snapshot: Omit<PreRecoverySnapshot, "preRecoverySha256">,
): string {
  return sha256Hex(JSON.stringify(canonicalPreRecoveryBody(snapshot)));
}

/** Stamps a pre-recovery snapshot with its canonical SHA-256 checksum. */
export function buildPreRecoverySnapshot(
  snapshot: Omit<PreRecoverySnapshot, "preRecoverySha256">,
): PreRecoverySnapshot {
  return {
    ...snapshot,
    preRecoverySha256: computePreRecoverySha256(snapshot),
  };
}

/** Validates structure, target pinning, zero-orphan invariant, terminal prior jobs, and SHA-256 digest of a pre-recovery snapshot. */
export function verifyPreRecoverySnapshot(raw: unknown): PreRecoverySnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new PlatformError("target_denied");
  }
  const s = raw as PreRecoverySnapshot;
  if (
    s.schemaVersion !== 1 ||
    typeof s.recordedAt !== "string" ||
    !s.target ||
    s.historicalDigest !== s04DevBaseline.historicalDigest ||
    s.tableCount !== s04DevBaseline.tableCount ||
    s.orphanedTimelineEvidenceCount !== 0 ||
    typeof s.preRecoverySha256 !== "string" ||
    !s.preRecoveryRowHashesByTable ||
    Object.keys(s.preRecoveryRowHashesByTable).length !==
      s04DevBaseline.tableCount ||
    !Array.isArray(s.protectedJobIds) ||
    s.protectedJobIds.length !== s04DevBaseline.protectedQueuedJobs ||
    !Array.isArray(s.priorAttemptJobs) ||
    !Array.isArray(s.historicalHeartbeats)
  ) {
    throw new PlatformError("target_denied");
  }
  assertSameDevTarget(s.target);
  for (const hb of s.historicalHeartbeats) {
    if (
      !hb ||
      typeof hb !== "object" ||
      typeof hb.worker_id !== "string" ||
      typeof hb.status !== "string" ||
      "stopped_at" in hb
    ) {
      throw new PlatformError("target_denied");
    }
  }
  for (const job of s.priorAttemptJobs) {
    if (job.state !== "completed" && job.state !== "failed") {
      throw new PlatformError("target_denied");
    }
  }
  if (computePreRecoverySha256(s) !== s.preRecoverySha256) {
    throw new PlatformError("target_denied");
  }
  return s;
}

function multisetCounts(hashes: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const digest of hashes) {
    counts.set(digest, (counts.get(digest) ?? 0) + 1);
  }
  return counts;
}

function assertJobImmutable(
  orig: ProtectedJobBaselineRow,
  current: ProtectedJobBaselineRow | undefined,
  allowedStates: readonly string[],
): void {
  if (
    !current ||
    !allowedStates.includes(current.state) ||
    current.state !== orig.state ||
    current.attempts !== orig.attempts ||
    current.max_attempts !== orig.max_attempts ||
    current.revision !== orig.revision ||
    current.fence !== orig.fence ||
    current.lease_owner !== orig.lease_owner ||
    current.finished_at !== orig.finished_at ||
    current.last_error !== orig.last_error ||
    current.created_at !== orig.created_at ||
    (orig.subject_ref !== undefined &&
      current.subject_ref !== undefined &&
      current.subject_ref !== orig.subject_ref)
  ) {
    throw new PlatformError("target_denied");
  }
}

export function verifyHistoricalMultisetPreserved(input: {
  beforeRowHashesByTable: Readonly<Record<string, readonly string[]>>;
  afterRowHashesByTable: Readonly<Record<string, readonly string[]>>;
  preRecoveryRowHashesByTable?: Readonly<Record<string, readonly string[]>>;
  authorizedRuleTransition?: AuthorizedRuleTransition;
  protectedJobsBefore: readonly ProtectedJobBaselineRow[];
  historicalCompletedJobIds?: readonly string[];
  priorAttemptJobs?: readonly ProtectedJobBaselineRow[];
  allJobsAfter: readonly ProtectedJobBaselineRow[];
  admittedJobIds: readonly string[];
  sourceId: string;
}): void {
  const tables = Object.keys(input.beforeRowHashesByTable);
  if (tables.length !== s04DevBaseline.preS04TableCount) {
    throw new PlatformError("target_denied");
  }
  for (const table of tables) {
    const afterCounts = multisetCounts(
      input.afterRowHashesByTable[table] ?? [],
    );
    const beforeCounts = multisetCounts(
      input.beforeRowHashesByTable[table] ?? [],
    );
    for (const [digest, required] of beforeCounts) {
      if ((afterCounts.get(digest) ?? 0) < required) {
        throw new PlatformError("target_denied");
      }
    }
  }

  if (input.preRecoveryRowHashesByTable) {
    const preTables = Object.keys(input.preRecoveryRowHashesByTable);
    if (preTables.length !== s04DevBaseline.tableCount) {
      throw new PlatformError("target_denied");
    }
    for (const table of preTables) {
      const afterCounts = multisetCounts(
        input.afterRowHashesByTable[table] ?? [],
      );
      const preCounts = multisetCounts(
        input.preRecoveryRowHashesByTable[table] ?? [],
      );
      for (const [digest, required] of preCounts) {
        const present = afterCounts.get(digest) ?? 0;
        if (present >= required) continue;
        const transition = input.authorizedRuleTransition;
        const allowedSingleRuleSwap =
          table === "sentinel.detection_rules" &&
          transition !== undefined &&
          transition.finalStatus === "DISABLED" &&
          digest === transition.ruleRowBeforeHash &&
          required - present === 1;
        if (!allowedSingleRuleSwap) {
          throw new PlatformError("target_denied");
        }
      }
    }
  }

  if (input.protectedJobsBefore.length !== s04DevBaseline.protectedQueuedJobs) {
    throw new PlatformError("target_denied");
  }
  const afterById = new Map(input.allJobsAfter.map((j) => [j.job_id, j]));
  const protectedSet = new Set<string>();
  for (const orig of input.protectedJobsBefore) {
    protectedSet.add(orig.job_id);
    if (orig.state !== "queued" || orig.attempts !== 0) {
      throw new PlatformError("target_denied");
    }
    assertJobImmutable(orig, afterById.get(orig.job_id), ["queued"]);
  }

  const historicalCompletedSet = new Set(input.historicalCompletedJobIds ?? []);
  for (const histId of historicalCompletedSet) {
    const current = afterById.get(histId);
    if (!current || current.state === "queued") {
      throw new PlatformError("target_denied");
    }
  }

  const priorAttemptSet = new Set<string>();
  for (const orig of input.priorAttemptJobs ?? []) {
    if (orig.state !== "completed" && orig.state !== "failed") {
      throw new PlatformError("target_denied");
    }
    priorAttemptSet.add(orig.job_id);
    assertJobImmutable(orig, afterById.get(orig.job_id), [
      "completed",
      "failed",
    ]);
  }

  const admittedSet = new Set(input.admittedJobIds);
  for (const jobId of admittedSet) {
    if (
      protectedSet.has(jobId) ||
      historicalCompletedSet.has(jobId) ||
      priorAttemptSet.has(jobId)
    ) {
      throw new PlatformError("scope_denied");
    }
  }

  for (const job of input.allJobsAfter) {
    if (
      protectedSet.has(job.job_id) ||
      historicalCompletedSet.has(job.job_id) ||
      priorAttemptSet.has(job.job_id)
    ) {
      continue;
    }
    const subjectRef = job.subject_ref ?? job.subject_ref_prefix ?? "";
    const fromApprovedSource =
      subjectRef === input.sourceId ||
      subjectRef.startsWith(`${input.sourceId}/`);
    if (!admittedSet.has(job.job_id) || !fromApprovedSource) {
      throw new PlatformError("scope_denied");
    }
  }
}

/** Verifies worker heartbeats cleanly: immutable historical entries stay untouched while every new or recovery worker reaches stopped. */
export function verifyWorkerHeartbeatsClean(input: {
  current: readonly WorkerHeartbeatBaselineRow[];
  historical?: readonly WorkerHeartbeatBaselineRow[];
  requiredStoppedWorkerIds?: readonly string[];
}): void {
  if (input.historical === undefined) {
    if (input.current.some((h) => h.status !== "stopped")) {
      throw new PlatformError("target_denied");
    }
  } else {
    const currentById = new Map(input.current.map((h) => [h.worker_id, h]));
    const historicalById = new Map(
      input.historical.map((h) => [h.worker_id, h]),
    );
    for (const orig of input.historical) {
      const curr = currentById.get(orig.worker_id);
      if (
        !curr ||
        curr.status !== orig.status ||
        (orig.module !== undefined && curr.module !== orig.module) ||
        (orig.started_at !== undefined &&
          curr.started_at !== orig.started_at) ||
        (orig.last_seen_at !== undefined &&
          curr.last_seen_at !== orig.last_seen_at)
      ) {
        throw new PlatformError("target_denied");
      }
    }
    for (const curr of input.current) {
      if (!historicalById.has(curr.worker_id) && curr.status !== "stopped") {
        throw new PlatformError("target_denied");
      }
    }
  }

  const currentById = new Map(input.current.map((h) => [h.worker_id, h]));
  for (const workerId of input.requiredStoppedWorkerIds ?? []) {
    const row = currentById.get(workerId);
    if (!row || row.status !== "stopped") {
      throw new PlatformError("target_denied");
    }
  }
}

/** Deterministically selects the single recovery incident matching sourceId/ruleId (and optional incidentId) rather than taking the first list row. */
export function selectRecoveryIncident<T extends IncidentListCandidate>(
  items: readonly T[],
  expected: { sourceId: string; ruleId: string; incidentId?: string },
): T {
  const matches = items.filter((item) =>
    expected.incidentId
      ? item.incidentId === expected.incidentId &&
        item.sourceId === expected.sourceId &&
        item.ruleId === expected.ruleId
      : item.sourceId === expected.sourceId && item.ruleId === expected.ruleId,
  );
  if (matches.length !== 1) {
    throw new PlatformError("target_denied");
  }
  return matches[0];
}

export function verifyCleanShutdownAndPostflight(
  snapshot: DevPostflightSnapshot,
): void {
  if (
    snapshot.activeLeases !== 0 ||
    snapshot.expiredLeases !== 0 ||
    snapshot.liveSessions.length !== 0 ||
    snapshot.runningProcesses.length !== 0 ||
    (snapshot.orphanedTimelineEvidenceCount !== undefined &&
      snapshot.orphanedTimelineEvidenceCount !== 0)
  ) {
    throw new PlatformError("target_denied");
  }
  verifyWorkerHeartbeatsClean({
    current: snapshot.workerHeartbeats,
    historical: snapshot.historicalHeartbeats,
    requiredStoppedWorkerIds: snapshot.requiredStoppedWorkerIds,
  });
  if (
    snapshot.backupBytes !== s04DevBaseline.backupSizeBytes ||
    snapshot.backupSha256 !== s04DevBaseline.backupSha256
  ) {
    throw new PlatformError("target_denied");
  }
  const sourceById = new Map(snapshot.sources.map((s) => [s.source_id, s]));
  for (const requiredSourceId of snapshot.requiredDisabledSourceIds ?? []) {
    const src = sourceById.get(requiredSourceId);
    if (!src || src.enabled || src.active_credentials !== 0) {
      throw new PlatformError("scope_denied");
    }
  }
  const ruleById = new Map(snapshot.rules.map((r) => [r.rule_id, r]));
  for (const requiredRuleId of snapshot.requiredDisabledRuleIds ?? []) {
    const rule = ruleById.get(requiredRuleId);
    if (!rule || rule.status !== "DISABLED") {
      throw new PlatformError("scope_denied");
    }
  }
  if (
    snapshot.sources.some((s) => s.enabled || s.active_credentials !== 0) ||
    snapshot.rules.some((r) => r.status !== "DISABLED")
  ) {
    throw new PlatformError("scope_denied");
  }
  const serialized = snapshot.persistedTextSamples.join("\n");
  for (const canary of snapshot.canarySecrets) {
    if (canary && serialized.includes(canary)) {
      throw new PlatformError("invalid_input");
    }
  }
  if (
    /\b(?:ws2\.[A-Za-z0-9_-]+\.[a-f0-9]{64}|gh[pousr]_[A-Za-z0-9_]{12,}|Bearer\s+[A-Za-z0-9._-]{16,})\b/.test(
      serialized,
    )
  ) {
    throw new PlatformError("invalid_input");
  }
}

export async function verifyBackupArtifactIntact(backupPath: string) {
  const info = await stat(backupPath);
  const bytes = await readFile(backupPath);
  const digest = sha256Hex(bytes);
  if (
    info.size !== s04DevBaseline.backupSizeBytes ||
    digest !== s04DevBaseline.backupSha256
  ) {
    throw new PlatformError("target_denied");
  }
  return { size: info.size, sha256: digest };
}

/**
 * Wraps ONE connection in a hard-pinned BEGIN ... ROLLBACK boundary so PlatformDatabase.scoped()
 * runs against SAVEPOINTs and can NEVER commit mutations (e.g., retention tests over historical batches).
 */
export function createRollbackOnlyClientPool(client: SqlClient): {
  pool: SqlPool;
  beginOuter: () => Promise<void>;
  rollbackOuter: () => Promise<void>;
} {
  let depth = 0;
  let seq = 0;
  const stack: string[] = [];
  let outerStarted = false;
  let outerRolledBack = false;

  const proxyClient: SqlClient = {
    async query<R extends QueryResultRow = QueryResultRow>(
      sql: string,
      values?: unknown[],
    ) {
      if (!outerStarted || outerRolledBack) {
        throw new PlatformError("scope_denied");
      }
      const normalized = sql
        .trim()
        .replace(/;+\s*$/, "")
        .toUpperCase();
      if (normalized === "BEGIN" || normalized.startsWith("BEGIN ")) {
        const sp = `h04cb2_sp_${++seq}`;
        stack.push(sp);
        depth++;
        return client.query<R>(`SAVEPOINT ${sp}`);
      }
      if (normalized === "COMMIT") {
        const sp = stack.pop();
        if (!sp || depth <= 0) throw new PlatformError("scope_denied");
        depth--;
        return client.query<R>(`RELEASE SAVEPOINT ${sp}`);
      }
      if (normalized === "ROLLBACK") {
        const sp = stack.pop();
        if (!sp || depth <= 0) throw new PlatformError("scope_denied");
        depth--;
        return client.query<R>(`ROLLBACK TO SAVEPOINT ${sp}`);
      }
      return client.query<R>(sql, values);
    },
    release() {
      /* Underlying client is exclusively released by rollbackOuter(). */
    },
  };

  const pool: SqlPool = {
    async connect() {
      if (!outerStarted || outerRolledBack) {
        throw new PlatformError("scope_denied");
      }
      return proxyClient;
    },
    async end() {
      /* Underlying pool lifecycle belongs to caller. */
    },
  };

  return {
    pool,
    async beginOuter() {
      if (outerStarted) return;
      await client.query("BEGIN");
      outerStarted = true;
    },
    async rollbackOuter() {
      if (!outerStarted || outerRolledBack) return;
      outerRolledBack = true;
      try {
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    },
  };
}

export async function withRollbackOnlyDatabase<T>(
  pool: SqlPool,
  worker: boolean,
  work: (db: PlatformDatabase, rawClient: SqlClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  const wrapper = createRollbackOnlyClientPool(client);
  try {
    await wrapper.beginOuter();
    const db = new PlatformDatabase(wrapper.pool, worker, "sentinel");
    return await work(db, client);
  } finally {
    await wrapper.rollbackOuter().catch(() => {
      client.release(true);
    });
  }
}

async function setScopedGucs(
  client: SqlClient,
  scope: SentinelScope,
): Promise<void> {
  await client.query(
    "SELECT set_config('wetscan.workspace',$1,true),set_config('wetscan.project',$2,true),set_config('wetscan.mode',$3,true),set_config('wetscan.module','sentinel',true)",
    [scope.workspaceId, scope.projectId, scope.mode],
  );
}

async function expectSqlDenied(
  client: SqlClient,
  sql: string,
  values: unknown[],
  label: string,
): Promise<void> {
  await client.query("SAVEPOINT neg_dml");
  try {
    await client.query(sql, values);
    await client.query("ROLLBACK TO SAVEPOINT neg_dml");
    throw new Error(`expected_denial_but_succeeded:${label}`);
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT neg_dml").catch(() => {});
    const pgCode = (err as { code?: unknown })?.code;
    if (pgCode !== "42501") {
      throw new Error(`unexpected_sql_error_${label}:${String(pgCode)}`);
    }
  } finally {
    await client.query("RELEASE SAVEPOINT neg_dml").catch(() => {});
  }
}

async function verifyCrossProjectRls(
  pool: SqlPool,
  roleLabel: "app" | "worker",
  scope: SentinelScope,
  incidentId: string,
  alertId: string,
  eventId: string,
  sourceId: string,
): Promise<boolean> {
  const fakeScope: SentinelScope = {
    mode: "live",
    workspaceId: `${scope.workspaceId}-other`,
    projectId: "github-999999999999",
  };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setScopedGucs(client, fakeScope);
    for (const table of s04Tables) {
      const r = await client.query(
        `SELECT count(*)::int AS count FROM sentinel.${table}`,
      );
      if (Number(r.rows[0]?.count ?? -1) !== 0) {
        throw new Error(`rls_leak_${roleLabel}_${table}`);
      }
    }
    if (roleLabel === "worker") {
      await expectSqlDenied(
        client,
        `INSERT INTO sentinel.incident_alerts (mode,workspace_id,project_id,incident_id,alert_id) VALUES ($1,$2,$3,$4,$5)`,
        [scope.mode, scope.workspaceId, scope.projectId, incidentId, alertId],
        `worker_rls_insert_incident_alerts_${sourceId}`,
      );
      await expectSqlDenied(
        client,
        `INSERT INTO sentinel.incident_evidence (mode,workspace_id,project_id,incident_id,source_id,event_id) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          scope.mode,
          scope.workspaceId,
          scope.projectId,
          incidentId,
          sourceId,
          eventId,
        ],
        `worker_rls_insert_incident_evidence`,
      );
    }
    await client.query("ROLLBACK");
    return true;
  } finally {
    client.release();
  }
}

/**
 * Runs non-destructive negative, RLS, least-privilege DML, lease fencing/idempotency,
 * rolled-back retention-pin, and populated-DOWN refusal checks against real DEV pools.
 */
export async function runNegativePostgresMatrix(input: {
  appPool: SqlPool;
  workerPool: SqlPool;
  migrationPool: SqlPool;
  migrations: readonly Migration[];
  scope: SentinelScope;
  sourceId: string;
  incidentId: string;
  alertId: string;
  eventId: string;
  completedAdmittedJobId: string;
  protectedJobIds: readonly string[];
  workerConfig: {
    isolation: ReturnType<typeof acceptanceIsolation>;
    detection: ReturnType<typeof detectionActivation>;
    incidents: ReturnType<typeof incidentActivation>;
  };
}): Promise<NegativePostgresResult> {
  const crossProjectRlsApp = await verifyCrossProjectRls(
    input.appPool,
    "app",
    input.scope,
    input.incidentId,
    input.alertId,
    input.eventId,
    input.sourceId,
  );
  const crossProjectRlsWorker = await verifyCrossProjectRls(
    input.workerPool,
    "worker",
    input.scope,
    input.incidentId,
    input.alertId,
    input.eventId,
    input.sourceId,
  );

  // Least-privilege DML denials as wetscan_app (inside rolled-back scoped tx).
  const appClient = await input.appPool.connect();
  try {
    await appClient.query("BEGIN");
    await setScopedGucs(appClient, input.scope);
    for (const [label, sql, values] of [
      [
        "app_insert_incident_alerts",
        "INSERT INTO sentinel.incident_alerts (mode,workspace_id,project_id,incident_id,alert_id) VALUES ($1,$2,$3,$4,$5)",
        [
          input.scope.mode,
          input.scope.workspaceId,
          input.scope.projectId,
          input.incidentId,
          input.alertId,
        ],
      ],
      [
        "app_insert_incident_evidence",
        "INSERT INTO sentinel.incident_evidence (mode,workspace_id,project_id,incident_id,source_id,event_id) VALUES ($1,$2,$3,$4,$5,$6)",
        [
          input.scope.mode,
          input.scope.workspaceId,
          input.scope.projectId,
          input.incidentId,
          input.sourceId,
          input.eventId,
        ],
      ],
      [
        "app_update_incidents_title",
        "UPDATE sentinel.incidents SET title='tampered' WHERE incident_id=$1",
        [input.incidentId],
      ],
      [
        "app_update_incidents_dedup",
        "UPDATE sentinel.incidents SET deduplication_key='tampered' WHERE incident_id=$1",
        [input.incidentId],
      ],
      [
        "app_update_incident_timeline",
        "UPDATE sentinel.incident_timeline SET summary='tampered' WHERE incident_id=$1",
        [input.incidentId],
      ],
      [
        "app_delete_incidents",
        "DELETE FROM sentinel.incidents WHERE incident_id=$1",
        [input.incidentId],
      ],
      [
        "app_delete_incident_timeline",
        "DELETE FROM sentinel.incident_timeline WHERE incident_id=$1",
        [input.incidentId],
      ],
    ] as const) {
      await expectSqlDenied(appClient, sql, [...values], label);
    }
    await appClient.query("ROLLBACK");
  } finally {
    appClient.release();
  }

  // Append-only DML denials as wetscan_sentinel_worker. DELETE is deliberately NOT denied here:
  // migration 0004 grants it to the worker solely for expired closed-incident retention (see
  // SENTINEL_S04_MIGRATION_REVIEW); the retention-pin rollback check below covers that path.
  const workerClient = await input.workerPool.connect();
  try {
    await workerClient.query("BEGIN");
    await setScopedGucs(workerClient, input.scope);
    for (const [label, sql] of [
      [
        "worker_update_incident_timeline",
        "UPDATE sentinel.incident_timeline SET summary='tampered' WHERE incident_id=$1",
      ],

      [
        "worker_update_incident_timeline_evidence",
        "UPDATE sentinel.incident_timeline_evidence SET incident_id=incident_id WHERE incident_id=$1",
      ],
    ] as const) {
      await expectSqlDenied(workerClient, sql, [input.incidentId], label);
    }
    await workerClient.query("ROLLBACK");
  } finally {
    workerClient.release();
  }

  // Fencing & idempotency checks via PostgresQueue without mutating completed or protected rows.
  const isolation = input.workerConfig.isolation;
  const detection = input.workerConfig.detection;
  const incidents = input.workerConfig.incidents;
  if (!isolation || !detection || !incidents) {
    throw new PlatformError("approval_required");
  }
  await verifyAcceptanceJobs(
    input.workerPool,
    isolation,
    detection,
    `neg-check-${Date.now()}`,
    incidents,
  );
  const queueDb = new PlatformDatabase(input.workerPool, true, "sentinel");
  const queue = new PostgresQueue(
    queueDb,
    input.scope,
    ["sentinel.telemetry.accepted"],
    incidents.notBefore,
    isolation.admission,
  );
  const claimed = await queue.claim({
    module: "sentinel",
    workerId: "fencing-probe",
    limit: 2,
    leaseMs: 30000,
  });
  if (claimed.length !== 0) {
    throw new Error(`expected_zero_claims_on_completed_jobs:${claimed.length}`);
  }
  const staleLease = {
    job: {
      schemaVersion: 1 as const,
      module: "sentinel" as const,
      ...input.scope,
      jobId: input.completedAdmittedJobId,
      kind: "sentinel.telemetry.accepted",
      subjectRef: `${input.sourceId}/${input.eventId}`,
      idempotencyKey: "stale-probe",
      revision: 99,
      attempts: 1,
      maxAttempts: 3,
      availableAt: detection.notBefore,
      cancelRequested: false,
    },
    workerId: "stale-worker",
    leaseToken: "99:00000000-0000-4000-8000-000000000000",
    expiresAt: isolation.admission.expiresAt,
  };
  let staleHeartbeatRejected = false;
  try {
    await queue.heartbeat(staleLease);
  } catch (err) {
    if (err instanceof PlatformError && err.code === "lease_lost") {
      staleHeartbeatRejected = true;
    }
  }
  let staleCompleteRejected = false;
  try {
    await queue.complete(staleLease);
  } catch (err) {
    if (err instanceof PlatformError && err.code === "lease_lost") {
      staleCompleteRejected = true;
    }
  }
  if (!staleHeartbeatRejected || !staleCompleteRejected) {
    throw new Error("stale_lease_fencing_failed");
  }

  // Rolled-back retention pin verification (zero committed deletes).
  const countScopeRows = async (c: SqlClient) => {
    const r = await c.query(
      "SELECT (SELECT count(*)::int FROM sentinel.telemetry_batches WHERE mode=$1 AND workspace_id=$2 AND project_id=$3) AS batches,(SELECT count(*)::int FROM sentinel.telemetry_events WHERE mode=$1 AND workspace_id=$2 AND project_id=$3) AS events",
      [input.scope.mode, input.scope.workspaceId, input.scope.projectId],
    );
    return {
      batches: Number(r.rows[0].batches),
      events: Number(r.rows[0].events),
    };
  };
  const observeScopeCounts = async () => {
    const obs = await input.workerPool.connect();
    try {
      await obs.query("BEGIN READ ONLY");
      await setScopedGucs(obs, input.scope);
      const counts = await countScopeRows(obs);
      await obs.query("COMMIT");
      return counts;
    } finally {
      obs.release();
    }
  };
  const beforeCounts = await observeScopeCounts();

  const rollbackPinResult = await withRollbackOnlyDatabase(
    input.workerPool,
    true,
    async (rollbackDb, rawClient) => {
      await retainIncidents(rollbackDb, input.scope);
      await retainDetection(rollbackDb, input.scope, true);
      await retainTelemetry(rollbackDb, input.scope, true);
      await setScopedGucs(rawClient, input.scope);
      const incCheck = await rawClient.query(
        "SELECT EXISTS(SELECT 1 FROM sentinel.incidents WHERE incident_id=$1) AS ok",
        [input.incidentId],
      );
      const alertCheck = await rawClient.query(
        "SELECT EXISTS(SELECT 1 FROM sentinel.detection_alerts WHERE alert_id=$1) AS ok",
        [input.alertId],
      );
      const evCheck = await rawClient.query(
        "SELECT EXISTS(SELECT 1 FROM sentinel.telemetry_events WHERE event_id=$1) AS ok",
        [input.eventId],
      );
      return {
        incidentPreserved: Boolean(incCheck.rows[0]?.ok),
        alertPreserved: Boolean(alertCheck.rows[0]?.ok),
        evidencePreserved: Boolean(evCheck.rows[0]?.ok),
      };
    },
  );

  const afterCounts = await observeScopeCounts();
  if (
    !rollbackPinResult.incidentPreserved ||
    !rollbackPinResult.alertPreserved ||
    !rollbackPinResult.evidencePreserved ||
    afterCounts.batches !== beforeCounts.batches ||
    afterCounts.events !== beforeCounts.events
  ) {
    throw new Error("retention_pin_or_rollback_invariant_failed");
  }

  // Protected populated 0004_incidents DOWN refusal using runtime-approved migration pool.
  const downRefusalAudit = await verifyPopulatedS04DownRefusal(
    input.migrationPool,
    [...input.migrations],
  );
  if (
    downRefusalAudit.blockedStatements.length > 0 ||
    !downRefusalAudit.lockTimeoutConfigured ||
    !downRefusalAudit.clientReleased ||
    downRefusalAudit.inTransaction
  ) {
    throw new Error("populated_down_refusal_failed");
  }

  return {
    crossProjectRlsApp,
    crossProjectRlsWorker,
    appLeastPrivilegeDmlDenied: true,
    workerAppendOnlyDmlDenied: true,
    workerFencingAndIdempotency: true,
    rolledBackRetentionPins: {
      ...rollbackPinResult,
      batchesBefore: beforeCounts.batches,
      batchesAfterRollback: afterCounts.batches,
      eventsBefore: beforeCounts.events,
      eventsAfterRollback: afterCounts.events,
    },
    populatedDownRefusal: true,
  };
}

export interface ContainRulePinSpec {
  ruleId: string;
  initialStatus: string;
  initialRevision: number;
  finalStatus: string;
  finalRevision: number;
}

export const s04DevContainRulePin: ContainRulePinSpec = {
  ruleId: s04DevPriorAttemptDefaults.ruleId,
  initialStatus: s04DevPriorAttemptDefaults.initialStatus,
  initialRevision: s04DevPriorAttemptDefaults.initialRevision,
  finalStatus: s04DevPriorAttemptDefaults.finalStatus,
  finalRevision: s04DevPriorAttemptDefaults.finalRevision,
};

/** Verifies pre-mutation rule containment state strictly matches the owner-pinned rule, status, and revision. */
export function assertPinnedContainRuleTarget(input: {
  ruleId: string;
  expectedInitialRevision?: number;
  preRecoveryRule?: RuleStatusBaselineRow;
  liveRule?: RuleStatusBaselineRow;
  sources: readonly SourceStatusBaselineRow[];
  activeLeases: number;
  expiredLeases: number;
  orphanedTimelineEvidence: number;
  pin?: ContainRulePinSpec;
}): ContainRulePinSpec {
  const pin = input.pin ?? s04DevContainRulePin;
  if (
    input.ruleId !== pin.ruleId ||
    (input.expectedInitialRevision !== undefined &&
      input.expectedInitialRevision !== pin.initialRevision)
  ) {
    throw new PlatformError("target_denied");
  }
  if (
    input.activeLeases !== 0 ||
    input.expiredLeases !== 0 ||
    input.orphanedTimelineEvidence !== 0
  ) {
    throw new PlatformError("target_denied");
  }
  if (input.sources.some((s) => s.enabled || s.active_credentials !== 0)) {
    throw new PlatformError("scope_denied");
  }
  if (!input.preRecoveryRule || !input.liveRule) {
    throw new PlatformError("scope_denied");
  }
  if (
    input.preRecoveryRule.rule_id !== pin.ruleId ||
    input.preRecoveryRule.status !== pin.initialStatus ||
    input.preRecoveryRule.revision !== pin.initialRevision ||
    input.liveRule.rule_id !== pin.ruleId ||
    input.liveRule.status !== pin.initialStatus ||
    input.liveRule.revision !== pin.initialRevision
  ) {
    throw new PlatformError("target_denied");
  }
  return pin;
}

/** Verifies post-mutation rule containment transitioned strictly to the owner-pinned final status and revision. */
export function assertPinnedContainRuleOutcome(input: {
  ruleId: string;
  updatedRule?: RuleStatusBaselineRow;
  pin?: ContainRulePinSpec;
}): RuleStatusBaselineRow & { revision: number } {
  const pin = input.pin ?? s04DevContainRulePin;
  if (
    input.ruleId !== pin.ruleId ||
    !input.updatedRule ||
    input.updatedRule.rule_id !== pin.ruleId ||
    input.updatedRule.status !== pin.finalStatus ||
    input.updatedRule.revision !== pin.finalRevision
  ) {
    throw new PlatformError("target_denied");
  }
  return {
    ...input.updatedRule,
    revision: input.updatedRule.revision,
  };
}

/** platformHealth is 503/degraded while any failed job exists; accept only the preserved historical failed jobs. */
export function isKnownDegradedWorkerHealth(
  status: number | undefined,
  health: unknown,
  preservedFailedJobs: number,
): boolean {
  const h = health as
    | {
        status?: string;
        worker?: string;
        queue?: { failed?: number; expired?: number };
      }
    | null
    | undefined;
  return (
    status === 503 &&
    h?.status === "degraded" &&
    h.worker === "running" &&
    h.queue?.expired === 0 &&
    h.queue?.failed === preservedFailedJobs
  );
}
