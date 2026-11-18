import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PlatformError,
  workerConfig,
  type ApprovedAction,
  type Purpose,
} from "../src/platform/config";
import { ApprovedPool } from "../src/platform/database";
import { migrationPlan } from "../src/platform/migrations";
import { detectionActivation } from "../src/features/sentinel/detection/activation";
import { incidentActivation } from "../src/features/sentinel/incidents/activation";
import { requestedAcceptanceIsolation } from "../worker/sentinel/acceptance";
import {
  assertPinnedContainRuleOutcome,
  assertPinnedContainRuleTarget,
  assertSafeDevArtifactDir,
  assertSameDevTarget,
  assertSingleTableSelectColumns,
  assertWorkerHealthPayload,
  buildPreRecoverySnapshot,
  buildSealedS04RuntimeApproval,
  incidentColumns,
  requireH04CB2ExecutionGate,
  runNegativePostgresMatrix,
  selectRecoveryIncident,
  s04DevBaseline,
  s04DevContainRulePin,
  s04DevContainer,
  s04DevPriorAttemptDefaults,
  s04DevProjectScope,
  s04DevTarget,
  s04ExplicitIndexes,
  s04Tables,
  verifyBackupArtifactIntact,
  verifyCleanShutdownAndPostflight,
  verifyHistoricalMultisetPreserved,
  verifyPreRecoverySnapshot,
  verifyWorkerHeartbeatsClean,
  workerHeartbeatColumns,
  type AuthorizedRuleTransition,
  type ContainRulePinSpec,
  type PreRecoverySnapshot,
  type ProtectedJobBaselineRow,
  type WorkerHeartbeatBaselineRow,
} from "../tests/sentinel/dev-acceptance-safety";

const NON_WORKER_TTL_MS = 1_800_000;
const WORKER_TTL_MS = 600_000;

interface RunContext {
  schemaVersion: 1;
  artifactDir: string;
  origin: string;
  recoveryMode: boolean;
  preRecoveryBaselineFile?: string;
  containmentFile?: string;
  priorSourceIds: string[];
  priorRuleIds: string[];
  priorAttemptJobIds: string[];
  priorIncidentIds: string[];
  sourceId: string;
  ruleId: string;
  ruleRevision: number;
  preIngestAt: string;
  canaryValues: string[];
  credentialFile?: string;
  protectedJobIds: string[];
  admittedJobIds: string[];
  batchIds: string[];
  eventIds: string[];
  firstEventOccurredAt?: string;
  incidentId?: string;
  alertIds: string[];
  workerIds: string[];
}

interface ContainmentRecord {
  schemaVersion: 1;
  recordedAt: string;
  ruleId: string;
  previousStatus: string;
  previousRevision: number;
  finalStatus: string;
  finalRevision: number;
  alreadyDisabled: boolean;
  ruleRowBeforeHash?: string;
  preRecoverySha256: string;
}

function argValue(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function requireArg(flag: string): string {
  const v = argValue(flag);
  if (!v) throw new PlatformError("invalid_input");
  return v;
}

function repoRootPath(): string {
  return resolve(fileURLToPath(new URL("..", import.meta.url)));
}

function runningProcessesMatching(
  pattern: string,
): { ProcessId: number; Name: string }[] {
  const raw = execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.Name -match 'node|tsx' -and ($_.CommandLine -match '${pattern}') } | Select-Object ProcessId,Name | ConvertTo-Json -Compress`,
    ],
    { encoding: "utf8" },
  ).trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function runningWorkerOrAppProcesses() {
  return runningProcessesMatching(
    "worker/sentinel|worker\\\\sentinel|worker/guard|worker\\\\guard|next dev|next start",
  );
}

function runningWorkerProcesses() {
  return runningProcessesMatching(
    "worker/sentinel|worker\\\\sentinel|worker/guard|worker\\\\guard",
  );
}

function inspectDevDocker() {
  const context = execFileSync("docker", ["context", "show"], {
    encoding: "utf8",
  }).trim();
  const inspected = JSON.parse(
    execFileSync("docker", ["inspect", s04DevContainer.containerName], {
      encoding: "utf8",
    }),
  )[0];
  if (
    context !== s04DevContainer.context ||
    inspected.Id !== s04DevContainer.containerId ||
    inspected.Image !== s04DevContainer.image ||
    !inspected.State?.Running ||
    inspected.Mounts.filter((m: { Type: string }) => m.Type === "volume")
      .length !== 1 ||
    !inspected.Mounts.some(
      (m: { Name: string; Destination: string }) =>
        m.Name === s04DevContainer.volume &&
        m.Destination === "/var/lib/postgresql/data",
    ) ||
    JSON.stringify(inspected.NetworkSettings?.Ports) !==
      JSON.stringify({
        "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "55432" }],
      })
  ) {
    throw new PlatformError("target_denied");
  }
  return {
    context,
    containerName: s04DevContainer.containerName,
    containerId: inspected.Id as string,
    image: inspected.Image as string,
    volume: s04DevContainer.volume,
    running: true,
  };
}

async function httpRequestJson(
  url: string,
  options: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {},
) {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.headers,
    body: options.body,
    redirect: "manual",
    signal: AbortSignal.timeout(options.timeoutMs ?? 10000),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { rawText: text };
  }
  return { status: response.status, json, headers: response.headers };
}

async function openGatedPool(
  purpose: Purpose,
  action: ApprovedAction,
  phase: Parameters<typeof requireH04CB2ExecutionGate>[3]["phase"],
  maxTtlMs: number,
  envOverrides?: NodeJS.ProcessEnv,
) {
  const env = envOverrides ?? process.env;
  const config = await requireH04CB2ExecutionGate(env, purpose, action, {
    phase,
    maxTtlMs,
  });
  return { config, pool: new ApprovedPool(config) };
}

export const readOnlyDevStateQueries = {
  identity:
    "SELECT current_database() AS database,current_user AS role,current_setting('transaction_read_only') AS transaction_read_only,shobj_description(d.oid,'pg_database') AS marker,inet_server_port() AS server_port FROM pg_database d WHERE datname=current_database()",
  ledger:
    "SELECT version,checksum FROM platform.schema_migrations ORDER BY version",
  tables:
    "SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname IN ('platform','sentinel') AND c.relkind='r' ORDER BY 1,2",
  s04Indexes:
    "SELECT indexname FROM pg_indexes WHERE schemaname='sentinel' AND indexname=ANY($1::text[]) ORDER BY 1",
  jobsInventory:
    "SELECT job_id,kind,mode,workspace_id,project_id,state,revision,attempts,max_attempts,cancel_requested,fence,lease_owner,subject_ref,left(subject_ref,36) AS subject_ref_prefix,created_at::text AS created_at,available_at::text AS available_at,lease_until::text AS lease_until,finished_at::text AS finished_at,last_error FROM platform.jobs ORDER BY created_at,job_id",
  activeLeases:
    "SELECT count(*)::int AS count FROM platform.jobs WHERE state='leased' AND lease_until>=clock_timestamp()",
  expiredLeases:
    "SELECT count(*)::int AS count FROM platform.jobs WHERE state='leased' AND lease_until<clock_timestamp()",
  workerHeartbeats:
    "SELECT module,worker_id,status,started_at::text AS started_at,last_seen_at::text AS last_seen_at FROM platform.worker_heartbeats ORDER BY started_at,worker_id",
  liveSessions:
    "SELECT pid,datname,usename,application_name,state FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND (datname=current_database() OR application_name LIKE 'wetscan-sentinel%') ORDER BY pid",
  sources:
    "SELECT source_id,enabled,origin,environment,(SELECT count(*)::int FROM sentinel.telemetry_credentials c WHERE c.source_id=s.source_id AND c.revoked_at IS NULL) AS active_credentials FROM sentinel.telemetry_sources s ORDER BY created_at,source_id",
  rules:
    "SELECT r.rule_id,v.status,r.current_version AS revision FROM sentinel.detection_rules r JOIN sentinel.detection_rule_versions v ON v.mode=r.mode AND v.workspace_id=r.workspace_id AND v.project_id=r.project_id AND v.rule_id=r.rule_id AND v.version=r.current_version ORDER BY r.created_at,r.rule_id",
  ruleRows:
    "SELECT rule_id,to_jsonb(r)::text AS value FROM sentinel.detection_rules r ORDER BY rule_id",
  existingIncidents:
    "SELECT incident_id,source_id,rule_id,status FROM sentinel.incidents ORDER BY opened_at,incident_id",
  orphanedTimelineEvidence:
    "SELECT count(*)::int AS count FROM sentinel.incident_timeline_evidence ite LEFT JOIN sentinel.incident_timeline t USING(mode,workspace_id,project_id,incident_id,timeline_id) WHERE t.timeline_id IS NULL",
  clockNow: "SELECT clock_timestamp()::text AS now",
} as const;

export async function captureReadOnlyDevState(
  pool: Pick<ApprovedPool, "connect">,
  includeRows = false,
) {
  const queries = readOnlyDevStateQueries;
  assertSingleTableSelectColumns(
    queries.workerHeartbeats,
    "platform.worker_heartbeats",
    workerHeartbeatColumns,
  );
  assertSingleTableSelectColumns(
    queries.existingIncidents,
    "sentinel.incidents",
    incidentColumns,
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");

    const identity = (await client.query(queries.identity)).rows[0];
    const ledger = (await client.query(queries.ledger)).rows;
    const tables = (await client.query(queries.tables)).rows as {
      nspname: string;
      relname: string;
    }[];
    const s04Indexes = (
      await client.query(queries.s04Indexes, [[...s04ExplicitIndexes]])
    ).rows;
    const jobsInventory = (await client.query(queries.jobsInventory))
      .rows as ProtectedJobBaselineRow[];
    const activeLeases = Number(
      (await client.query(queries.activeLeases)).rows[0]?.count ?? -1,
    );
    const expiredLeases = Number(
      (await client.query(queries.expiredLeases)).rows[0]?.count ?? -1,
    );
    const workerHeartbeats = (await client.query(queries.workerHeartbeats))
      .rows as WorkerHeartbeatBaselineRow[];
    const liveSessions = (await client.query(queries.liveSessions)).rows;
    const sources = (await client.query(queries.sources)).rows as {
      source_id: string;
      enabled: boolean;
      origin: string;
      environment: string;
      active_credentials: number;
    }[];
    const rules = (await client.query(queries.rules)).rows as {
      rule_id: string;
      status: string;
      revision: number;
    }[];
    const ruleRowHashesById = Object.fromEntries(
      (await client.query(queries.ruleRows)).rows.map((r) => [
        String(r.rule_id),
        createHash("sha256").update(String(r.value)).digest("hex"),
      ]),
    );
    const existingIncidents = (await client.query(queries.existingIncidents))
      .rows as {
      incident_id: string;
      source_id: string;
      rule_id: string;
      status: string;
    }[];
    const orphanedTimelineEvidence = Number(
      (await client.query(queries.orphanedTimelineEvidence)).rows[0]?.count ??
        -1,
    );
    const clockNow = String(
      (await client.query(queries.clockNow)).rows[0]?.now ?? "",
    );

    const rowHashesByTable: Record<string, string[]> = {};
    const rowsByTable: Record<
      string,
      { hash: string; row: Record<string, unknown> }[]
    > = {};
    const tableCounts: Record<string, number> = {};
    for (const t of tables) {
      if (
        !/^(platform|sentinel)$/.test(t.nspname) ||
        !/^[a-z_]+$/.test(t.relname)
      )
        throw new PlatformError("target_denied");
      const full = `${t.nspname}.${t.relname}`;
      const rows = (
        await client.query(
          `SELECT to_jsonb(r)::text AS value FROM ${t.nspname}.${t.relname} r ORDER BY to_jsonb(r)::text`,
        )
      ).rows.map((r) => ({
        hash: createHash("sha256").update(String(r.value)).digest("hex"),
        row: includeRows
          ? (JSON.parse(String(r.value)) as Record<string, unknown>)
          : {},
      }));
      if (includeRows) rowsByTable[full] = rows;
      rowHashesByTable[full] = rows.map((r) => r.hash);
      tableCounts[full] = rows.length;
    }

    await client.query("COMMIT");
    return {
      identity,
      ledger,
      tables,
      s04Indexes,
      jobsInventory,
      activeLeases,
      expiredLeases,
      workerHeartbeats,
      liveSessions,
      sources,
      rules,
      ruleRowHashesById,
      existingIncidents,
      orphanedTimelineEvidence,
      clockNow,
      rowHashesByTable,
      rowsByTable,
      tableCounts,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export function buildPlanSummary() {
  return {
    action: "review_only",
    databaseConnections: 0,
    target: s04DevTarget,
    projectScope: s04DevProjectScope,
    planSha256: s04DevBaseline.planSha256,
    baseline: s04DevBaseline,
    supportsPartialDevRecovery: true,
    priorAttemptDefaultRuleId: s04DevPriorAttemptDefaults.ruleId,
    priorAttemptContainRulePin: s04DevContainRulePin,
    phases: [
      "preflight",
      "contain-rule",
      "provision-and-ingest",
      "seal-worker",
      "worker-run",
      "ingest-duplicate",
      "verify-incidents",
      "ui-verify",
      "negative-matrix",
      "cleanup",
      "postflight",
    ],
    requiredOptInEnv: "SENTINEL_H04C_B2_EXECUTION=1",
    prohibitions: [
      "migrate_down approval grant forbidden",
      "integration_test approval grant forbidden",
      "no fallback to unrestricted worker loop",
      "retention pin checks run exclusively inside BEGIN ... ROLLBACK",
      "never requeue or retry prior exhausted failed jobs",
    ],
  };
}

async function loadPreRecoverySnapshot(
  filePath: string,
): Promise<PreRecoverySnapshot> {
  assertSafeDevArtifactDir(filePath, repoRootPath());
  const raw = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  return verifyPreRecoverySnapshot(raw);
}

async function loadOptionalContainment(
  filePath: string,
): Promise<ContainmentRecord | null> {
  assertSafeDevArtifactDir(filePath, repoRootPath());
  const exists = await stat(filePath).catch(() => null);
  if (!exists) return null;
  const parsed = JSON.parse(
    await readFile(filePath, "utf8"),
  ) as ContainmentRecord;
  if (
    parsed.schemaVersion !== 1 ||
    parsed.ruleId !== s04DevContainRulePin.ruleId ||
    parsed.previousStatus !== s04DevContainRulePin.initialStatus ||
    parsed.previousRevision !== s04DevContainRulePin.initialRevision ||
    parsed.finalStatus !== s04DevContainRulePin.finalStatus ||
    parsed.finalRevision !== s04DevContainRulePin.finalRevision ||
    parsed.alreadyDisabled !== false ||
    typeof parsed.preRecoverySha256 !== "string"
  ) {
    throw new PlatformError("target_denied");
  }
  return parsed;
}

function categorizeJobsAgainstH04CA(
  allJobs: readonly ProtectedJobBaselineRow[],
  baselineBefore: {
    deterministicState: {
      details: { jobsInventory: ProtectedJobBaselineRow[] };
    };
  },
  sources: readonly {
    source_id: string;
    enabled: boolean;
    active_credentials: number;
  }[],
) {
  const baselineJobs = baselineBefore.deterministicState.details.jobsInventory;
  const protectedJobsBefore = baselineJobs.filter((j) => j.state === "queued");
  const historicalCompletedJobIds = baselineJobs
    .filter((j) => j.state !== "queued")
    .map((j) => j.job_id);
  const historicalJobIdSet = new Set(baselineJobs.map((j) => j.job_id));
  const sourceById = new Map(sources.map((s) => [s.source_id, s]));

  const priorAttemptJobs: ProtectedJobBaselineRow[] = [];
  for (const job of allJobs) {
    if (historicalJobIdSet.has(job.job_id)) continue;
    if (
      (job.state !== "completed" && job.state !== "failed") ||
      job.lease_owner !== null
    ) {
      throw new PlatformError("target_denied");
    }
    const subjectRef = job.subject_ref ?? job.subject_ref_prefix ?? "";
    const matchedSource = sources.find(
      (s) =>
        subjectRef === s.source_id || subjectRef.startsWith(`${s.source_id}/`),
    );
    const src = matchedSource
      ? sourceById.get(matchedSource.source_id)
      : undefined;
    if (!src || src.enabled || src.active_credentials !== 0) {
      throw new PlatformError("scope_denied");
    }
    priorAttemptJobs.push(job);
  }

  return {
    protectedJobsBefore,
    historicalCompletedJobIds,
    priorAttemptJobs,
  };
}

async function readContext(
  contextPath: string,
  artifactDir: string,
): Promise<RunContext> {
  assertSafeDevArtifactDir(artifactDir, repoRootPath());
  return JSON.parse(await readFile(contextPath, "utf8")) as RunContext;
}

async function contextCanaries(ctx: RunContext): Promise<string[]> {
  const expected = join(ctx.artifactDir, "h04c-b2-ingest-credential.secret");
  if (ctx.credentialFile && resolve(ctx.credentialFile) !== resolve(expected))
    throw new PlatformError("target_denied");
  const credential = (await readFile(expected, "utf8")).trim();
  return [
    ...ctx.canaryValues,
    ...(/^ws2\.[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(credential)
      ? [credential]
      : []),
  ];
}

async function writePrivateJson(filePath: string, value: unknown) {
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(filePath, 0o600).catch(() => {});
}

async function readBaselineBefore(): Promise<{
  digest: string;
  deterministicState: {
    rowHashesByTable: Record<string, string[]>;
    details: { jobsInventory: ProtectedJobBaselineRow[] };
  };
}> {
  const h04cARoot = (
    await readFile(".local/sentinel/s04-h04c-a-private-directory.txt", "utf8")
  )
    .replace(/^\uFEFF/, "")
    .trim();
  const parsed = JSON.parse(
    await readFile(join(h04cARoot, "before.json"), "utf8"),
  ) as {
    digest: string;
    deterministicState: {
      rowHashesByTable: Record<string, string[]>;
      details: { jobsInventory: ProtectedJobBaselineRow[] };
    };
  };
  if (parsed.digest !== s04DevBaseline.historicalDigest) {
    throw new PlatformError("target_denied");
  }
  return parsed;
}

async function runPreflight() {
  const artifactDir = assertSafeDevArtifactDir(
    requireArg("artifact-dir"),
    repoRootPath(),
  );
  const backupPath = requireArg("backup-file");
  const plan = await migrationPlan();
  if (plan.sha256 !== s04DevBaseline.planSha256) {
    throw new PlatformError("target_denied");
  }
  if (runningWorkerOrAppProcesses().length !== 0) {
    throw new PlatformError("target_denied");
  }
  const docker = inspectDevDocker();
  const backup = await verifyBackupArtifactIntact(backupPath);
  const baselineBefore = await readBaselineBefore();

  if (runningWorkerProcesses().length !== 0) {
    throw new PlatformError("target_denied");
  }
  const { pool } = await openGatedPool(
    "migration",
    "runtime",
    "preflight",
    NON_WORKER_TTL_MS,
  );
  try {
    const state = await captureReadOnlyDevState(pool);
    const idRow = state.identity as Record<string, unknown>;
    if (
      idRow.database !== s04DevTarget.database ||
      idRow.marker !== s04DevTarget.marker ||
      idRow.transaction_read_only !== "on"
    ) {
      throw new PlatformError("target_denied");
    }
    if (
      state.tables.length !== s04DevBaseline.tableCount ||
      state.ledger.length !== 4 ||
      state.s04Indexes.length !== s04ExplicitIndexes.length ||
      state.activeLeases !== 0 ||
      state.expiredLeases !== 0 ||
      state.liveSessions.length !== 0 ||
      state.orphanedTimelineEvidence !== 0
    ) {
      throw new PlatformError("target_denied");
    }
    const row0004 = state.ledger.find((l) => l.version === "0004_incidents");
    if (row0004?.checksum !== s04DevBaseline.migration0004Sha256) {
      throw new PlatformError("target_denied");
    }
    const s04TableCounts: Record<string, number> = {};
    for (const tbl of s04Tables) {
      const count = state.tableCounts[`sentinel.${tbl}`] ?? -1;
      if (count < 0) throw new PlatformError("target_denied");
      s04TableCounts[tbl] = count;
    }
    const s04Empty = Object.values(s04TableCounts).every((c) => c === 0);
    const { protectedJobsBefore, historicalCompletedJobIds, priorAttemptJobs } =
      categorizeJobsAgainstH04CA(
        state.jobsInventory,
        baselineBefore,
        state.sources,
      );
    const recoveryMode = !s04Empty || priorAttemptJobs.length > 0;
    verifyHistoricalMultisetPreserved({
      beforeRowHashesByTable:
        baselineBefore.deterministicState.rowHashesByTable,
      afterRowHashesByTable: state.rowHashesByTable,
      protectedJobsBefore,
      historicalCompletedJobIds,
      priorAttemptJobs,
      allJobsAfter: state.jobsInventory,
      admittedJobIds: [],
      sourceId: "00000000-0000-4000-8000-000000000000",
    });

    const recordedAt = new Date().toISOString();
    const preRecoverySnapshot = buildPreRecoverySnapshot({
      schemaVersion: 1,
      recordedAt,
      target: s04DevTarget,
      historicalDigest: s04DevBaseline.historicalDigest,
      tableCount: state.tables.length,
      s04Empty,
      recoveryMode,
      tableCounts: state.tableCounts,
      preRecoveryRowHashesByTable: state.rowHashesByTable,
      protectedJobIds: protectedJobsBefore.map((j) => j.job_id),
      historicalCompletedJobIds,
      priorAttemptJobs,
      priorSources: state.sources.map((s) => ({
        source_id: s.source_id,
        enabled: s.enabled,
        active_credentials: s.active_credentials,
      })),
      priorRules: state.rules.map((r) => ({
        rule_id: r.rule_id,
        status: r.status,
        revision: r.revision,
      })),
      priorRuleRowHashesById: state.ruleRowHashesById,
      historicalHeartbeats: state.workerHeartbeats,
      existingIncidentIds: state.existingIncidents.map((i) => i.incident_id),
      orphanedTimelineEvidenceCount: state.orphanedTimelineEvidence,
    });
    const preRecoveryBaselineFile = join(
      artifactDir,
      "pre-recovery-baseline.json",
    );
    await writePrivateJson(preRecoveryBaselineFile, preRecoverySnapshot);

    const summary = {
      status: "PASS",
      recordedAt,
      target: s04DevTarget,
      docker,
      backup,
      tableCount: state.tables.length,
      s04Empty,
      recoveryMode,
      s04TableCounts,
      preRecoveryBaselineFile,
      preRecoverySha256: preRecoverySnapshot.preRecoverySha256,
      protectedJobIds: protectedJobsBefore.map((j) => j.job_id),
      historicalCompletedCount: historicalCompletedJobIds.length,
      priorAttemptJobs: priorAttemptJobs.map((j) => ({
        jobId: j.job_id,
        state: j.state,
        attempts: j.attempts,
      })),
      existingIncidentIds: state.existingIncidents.map((i) => i.incident_id),
      enabledPriorRuleIds: state.rules
        .filter((r) => r.status !== "DISABLED")
        .map((r) => r.rule_id),
      disabledPriorRuleIds: state.rules
        .filter((r) => r.status === "DISABLED")
        .map((r) => r.rule_id),
      activePriorSourceIds: state.sources
        .filter((s) => s.enabled || s.active_credentials !== 0)
        .map((s) => s.source_id),
      historicalHeartbeatIds: state.workerHeartbeats.map((h) => ({
        workerId: h.worker_id,
        status: h.status,
      })),
      orphanedTimelineEvidenceCount: state.orphanedTimelineEvidence,
    };
    await writePrivateJson(join(artifactDir, "preflight.json"), summary);
    console.log(JSON.stringify(summary));
  } finally {
    await pool.end();
  }
}

export interface ContainRuleExecutionDeps {
  pool: Pick<ApprovedPool, "connect">;
  preRecovery: PreRecoverySnapshot;
  origin: string;
  cookie: string;
  ruleId: string;
  expectedRevision?: number;
  pin?: ContainRulePinSpec;
  httpRequest?: typeof httpRequestJson;
}

/**
 * Disables the owner-pinned prior synthetic rule only when pre-recovery baseline,
 * live database row, and API transition all strictly match the pinned status and revision.
 */
export async function executeContainRule(
  deps: ContainRuleExecutionDeps,
): Promise<ContainmentRecord> {
  const pin = deps.pin ?? s04DevContainRulePin;
  if (
    deps.ruleId !== pin.ruleId ||
    (deps.expectedRevision !== undefined &&
      deps.expectedRevision !== pin.initialRevision)
  ) {
    throw new PlatformError("target_denied");
  }
  const trimmedCookie = deps.cookie.trim();
  if (!/(?:^|;\s*)wetscan_session=[a-f0-9]{64}(?:\s*;|$)/.test(trimmedCookie)) {
    throw new PlatformError("approval_required");
  }

  const beforeState = await captureReadOnlyDevState(deps.pool);
  const preRecoveryRule = deps.preRecovery.priorRules.find(
    (r) => r.rule_id === pin.ruleId,
  );
  const liveRule = beforeState.rules.find((r) => r.rule_id === pin.ruleId);
  assertPinnedContainRuleTarget({
    ruleId: deps.ruleId,
    expectedInitialRevision: deps.expectedRevision,
    preRecoveryRule,
    liveRule,
    sources: beforeState.sources,
    activeLeases: beforeState.activeLeases,
    expiredLeases: beforeState.expiredLeases,
    orphanedTimelineEvidence: beforeState.orphanedTimelineEvidence,
    pin,
  });

  const requestFn = deps.httpRequest ?? httpRequestJson;
  const baseApi = `${deps.origin}/api/sentinel/projects/${s04DevProjectScope.projectId}`;
  const disableRes = await requestFn(`${baseApi}/rules`, {
    method: "POST",
    headers: {
      cookie: trimmedCookie,
      origin: deps.origin,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "disable",
      ruleId: pin.ruleId,
      // Strictly send the owner-approved pinned revision; never substitute liveRule.revision.
      expectedRevision: pin.initialRevision,
    }),
  });
  if (disableRes.status !== 200) {
    throw new Error(`contain_rule_disable_failed:${disableRes.status}`);
  }
  const body = disableRes.json as {
    ruleId?: unknown;
    status?: unknown;
    revision?: unknown;
  } | null;
  if (
    !body ||
    body.ruleId !== pin.ruleId ||
    body.status !== pin.finalStatus ||
    body.revision !== pin.finalRevision
  ) {
    throw new PlatformError("target_denied");
  }

  const afterState = await captureReadOnlyDevState(deps.pool);
  const updated = assertPinnedContainRuleOutcome({
    ruleId: pin.ruleId,
    updatedRule: afterState.rules.find((r) => r.rule_id === pin.ruleId),
    pin,
  });

  return {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    ruleId: pin.ruleId,
    previousStatus: pin.initialStatus,
    previousRevision: pin.initialRevision,
    finalStatus: pin.finalStatus,
    finalRevision: updated.revision,
    alreadyDisabled: false,
    ruleRowBeforeHash: deps.preRecovery.priorRuleRowHashesById?.[pin.ruleId],
    preRecoverySha256: deps.preRecovery.preRecoverySha256,
  };
}

async function runContainRule() {
  const artifactDir = assertSafeDevArtifactDir(
    requireArg("artifact-dir"),
    repoRootPath(),
  );
  const origin = argValue("origin") ?? "http://127.0.0.1:3000";
  const cookieFile = requireArg("cookie-file");
  assertSafeDevArtifactDir(cookieFile, repoRootPath());
  const ruleId = argValue("rule-id") ?? s04DevContainRulePin.ruleId;
  const expectedRevisionRaw = argValue("expected-revision");
  let expectedRevision: number | undefined;
  if (expectedRevisionRaw !== undefined) {
    if (!/^[1-9]\d*$/.test(expectedRevisionRaw)) {
      throw new PlatformError("invalid_input");
    }
    expectedRevision = Number(expectedRevisionRaw);
  }
  if (
    ruleId !== s04DevContainRulePin.ruleId ||
    (expectedRevision !== undefined &&
      expectedRevision !== s04DevContainRulePin.initialRevision)
  ) {
    throw new PlatformError("target_denied");
  }

  const preRecoveryPath =
    argValue("pre-recovery") ?? join(artifactDir, "pre-recovery-baseline.json");
  const preRecovery = await loadPreRecoverySnapshot(preRecoveryPath);
  const cookie = (await readFile(cookieFile, "utf8")).trim();
  if (!/(?:^|;\s*)wetscan_session=[a-f0-9]{64}(?:\s*;|$)/.test(cookie)) {
    throw new PlatformError("approval_required");
  }

  if (runningWorkerProcesses().length !== 0) {
    throw new PlatformError("target_denied");
  }
  const { pool } = await openGatedPool(
    "migration",
    "runtime",
    "contain-rule",
    NON_WORKER_TTL_MS,
  );
  try {
    const record = await executeContainRule({
      pool,
      preRecovery,
      origin,
      cookie,
      ruleId,
      expectedRevision,
    });
    await writePrivateJson(join(artifactDir, "containment.json"), record);
    console.log(
      JSON.stringify({
        status: "PASS",
        phase: "contain-rule",
        ruleId: record.ruleId,
        previousStatus: record.previousStatus,
        previousRevision: record.previousRevision,
        finalStatus: record.finalStatus,
        finalRevision: record.finalRevision,
        alreadyDisabled: record.alreadyDisabled,
      }),
    );
  } finally {
    await pool.end();
  }
}

async function runProvisionAndIngest() {
  const { runProvisionOperation } = await import("./sentinel-provision-owner");
  return runProvisionOperation("execute");
}

async function runSealWorker() {
  const artifactDir = assertSafeDevArtifactDir(
    requireArg("artifact-dir"),
    repoRootPath(),
  );
  const contextPath = requireArg("context");
  const outApprovalPath = requireArg("out-approval");
  assertSafeDevArtifactDir(outApprovalPath, repoRootPath());
  const ctx = await readContext(contextPath, artifactDir);
  const cutoffIso = argValue("not-before") ?? ctx.preIngestAt;
  const preRecovery = ctx.preRecoveryBaselineFile
    ? await loadPreRecoverySnapshot(ctx.preRecoveryBaselineFile)
    : null;

  if (runningWorkerProcesses().length !== 0) {
    throw new PlatformError("target_denied");
  }
  const { pool } = await openGatedPool(
    "migration",
    "runtime",
    "seal-worker",
    NON_WORKER_TTL_MS,
  );
  try {
    const state = await captureReadOnlyDevState(pool);
    const excludedSet = new Set([
      ...ctx.protectedJobIds,
      ...(preRecovery?.historicalCompletedJobIds ?? []),
      ...(ctx.priorAttemptJobIds ?? []),
    ]);
    const candidates = state.jobsInventory.filter(
      (j) =>
        !excludedSet.has(j.job_id) &&
        j.state === "queued" &&
        Date.parse(j.created_at) >= Date.parse(cutoffIso) &&
        (j.subject_ref?.startsWith(`${ctx.sourceId}/`) ||
          j.subject_ref_prefix === ctx.sourceId),
    );
    if (candidates.length < 1 || candidates.length > 12) {
      throw new Error(`unexpected_admitted_job_count:${candidates.length}`);
    }
    const earliestJobCreatedAt = candidates
      .map((c) => new Date(c.created_at).toISOString())
      .sort()[0];
    const effectiveCutoffMs = Math.min(
      Date.now(),
      Date.parse(cutoffIso),
      Date.parse(earliestJobCreatedAt) - 100,
    );
    const effectiveCutoffIso = new Date(effectiveCutoffMs).toISOString();
    const approvedMs = effectiveCutoffMs;
    const approvedAt = effectiveCutoffIso;
    const ttlMs = Math.min(
      WORKER_TTL_MS,
      Math.max(120_000, Date.now() - approvedMs + 300_000),
    );
    const plan = await migrationPlan();
    const jobIds = candidates.map((c) => c.job_id);
    const sealed = buildSealedS04RuntimeApproval({
      approvedBy: "owner-h04c-b2-sealed",
      approvedAt,
      ttlMs,
      sourceId: ctx.sourceId,
      protectedJobIds: ctx.protectedJobIds,
      priorAttemptJobIds: ctx.priorAttemptJobIds ?? [],
      jobIds,
      earliestJobCreatedAt,
      detectionNotBefore: effectiveCutoffIso,
      incidentsNotBefore: effectiveCutoffIso,
      baselineSha256:
        preRecovery?.preRecoverySha256 ?? s04DevBaseline.historicalDigest,
      migrations: plan.migrations,
    });
    await writePrivateJson(outApprovalPath, sealed);
    ctx.admittedJobIds = [...new Set([...ctx.admittedJobIds, ...jobIds])];
    await writePrivateJson(contextPath, ctx);
    console.log(
      JSON.stringify({
        status: "PASS",
        phase: "seal-worker",
        admittedJobIds: jobIds,
        expiresAt: sealed.s04RuntimeAcceptance.expiresAt,
      }),
    );
  } finally {
    await pool.end();
  }
}

async function runSealedWorker() {
  const artifactDir = assertSafeDevArtifactDir(
    requireArg("artifact-dir"),
    repoRootPath(),
  );
  const contextPath = requireArg("context");
  const ctx = await readContext(contextPath, artifactDir);
  if (
    process.env.SENTINEL_ACCEPTANCE_ISOLATION !== "1" ||
    process.env.SENTINEL_DETECTION_ENABLED !== "1" ||
    process.env.SENTINEL_INCIDENTS_ENABLED !== "1"
  ) {
    throw new PlatformError("approval_required");
  }
  const { config, pool } = await openGatedPool(
    "worker",
    "runtime",
    "worker-run",
    WORKER_TTL_MS,
  );
  assertSameDevTarget(config.target);
  const plan = await migrationPlan();
  const detection = detectionActivation(config.approval, true);
  const incidents = incidentActivation(config.approval, true, detection);
  const isolation = requestedAcceptanceIsolation(
    config,
    detection,
    true,
    incidents,
    plan.migrations,
  );
  if (!isolation) throw new PlatformError("approval_required");
  const opts = workerConfig(process.env);
  const preservedFailedJobs = (
    await captureReadOnlyDevState(pool)
  ).jobsInventory.filter((j) => j.state === "failed").length;

  const mainPath = join(repoRootPath(), "worker/sentinel/main.ts");
  const sanitizedEnv: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV ?? "production",
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    SENTINEL_H04C_B2_EXECUTION: "1",
    SENTINEL_ACCEPTANCE_ISOLATION: "1",
    SENTINEL_DETECTION_ENABLED: "1",
    SENTINEL_INCIDENTS_ENABLED: "1",
    SENTINEL_DB_HOST: config.target.host,
    SENTINEL_DB_PORT: String(config.target.port),
    SENTINEL_DB_NAME: config.target.database,
    SENTINEL_DB_MARKER: config.target.marker,
    SENTINEL_DB_APPROVAL_FILE: process.env.SENTINEL_DB_APPROVAL_FILE,
    SENTINEL_DB_WORKER_PASSWORD_FILE:
      process.env.SENTINEL_DB_WORKER_PASSWORD_FILE,
    SENTINEL_WORKER_HEALTH_PORT: String(opts.healthPort),
  };

  const child = spawn(process.execPath, ["--import", "tsx", mainPath], {
    cwd: repoRootPath(),
    env: sanitizedEnv,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });

  const logs: string[] = [];
  child.stdout?.on("data", (d) => logs.push(String(d)));
  child.stderr?.on("data", (d) => logs.push(String(d)));

  try {
    const deadlineMs = Math.min(
      Date.parse(isolation.admission.expiresAt) - 10_000,
      Date.now() + 90_000,
    );
    let healthVerified = false;
    let healthPayload: unknown = null;
    let completed = false;

    while (Date.now() < deadlineMs) {
      if (child.exitCode !== null) {
        throw new Error(`worker_exited_early:${child.exitCode}`);
      }
      if (!healthVerified) {
        let healthRes: Awaited<ReturnType<typeof httpRequestJson>> | undefined;
        try {
          healthRes = await httpRequestJson(
            `http://127.0.0.1:${opts.healthPort}/health`,
            { timeoutMs: 2000 },
          );
        } catch {
          /* Health server may still be starting up. */
        }
        // platformHealth reports 503/degraded for any preserved historical failed job;
        // accept that one known cause only, never expired leases or an unknown failure.
        const h = healthRes?.json as
          | {
              status?: string;
              worker?: string;
              queue?: { failed?: number; expired?: number };
            }
          | undefined;
        const knownDegraded =
          healthRes?.status === 503 &&
          h?.status === "degraded" &&
          h.worker === "running" &&
          h.queue?.expired === 0 &&
          h.queue?.failed === preservedFailedJobs;
        if (healthRes?.status === 200 || knownDegraded) {
          assertWorkerHealthPayload(healthRes!.json);
          healthPayload = healthRes!.json;
          healthVerified = true;
        }
      }
      if (!completed) {
        const c = await pool.connect();
        try {
          await c.query("BEGIN READ ONLY");
          const r = await c.query(
            "SELECT job_id,state FROM platform.jobs WHERE job_id=ANY($1::text[])",
            [[...isolation.admission.jobIds]],
          );
          await c.query("COMMIT");
          if (
            r.rows.length === isolation.admission.jobIds.length &&
            r.rows.every((row) => row.state === "completed")
          ) {
            completed = true;
          }
        } finally {
          c.release();
        }
      }
      if (healthVerified && completed) {
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    if (!healthVerified || !completed) {
      throw new Error("worker_acceptance_timeout_or_health_failed");
    }

    const exitPromise = new Promise<number | null>((resolveExit) =>
      child.once("exit", (code) => resolveExit(code)),
    );
    child.send({ type: "sentinel.shutdown", version: 1 });
    const code = await Promise.race([
      exitPromise,
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("worker_shutdown_timeout")), 15000),
      ),
    ]);
    if (code !== 0) {
      throw new Error(`worker_nonzero_exit:${String(code)}`);
    }

    const preRecovery = ctx.preRecoveryBaselineFile
      ? await loadPreRecoverySnapshot(ctx.preRecoveryBaselineFile)
      : null;
    const state = await captureReadOnlyDevState(pool);
    if (
      state.activeLeases !== 0 ||
      state.expiredLeases !== 0 ||
      state.orphanedTimelineEvidence !== 0
    ) {
      throw new PlatformError("target_denied");
    }
    // The worker picks its own random id: identify it as the single new heartbeat row.
    const known = new Set([
      ...(preRecovery?.historicalHeartbeats ?? []).map((h) => h.worker_id),
      ...ctx.workerIds,
    ]);
    const fresh = state.workerHeartbeats.filter((h) => !known.has(h.worker_id));
    if (fresh.length !== 1) throw new PlatformError("target_denied");
    const nextWorkerIds = [...ctx.workerIds, fresh[0].worker_id];
    verifyWorkerHeartbeatsClean({
      current: state.workerHeartbeats,
      historical: preRecovery?.historicalHeartbeats,
      requiredStoppedWorkerIds: nextWorkerIds,
    });
    ctx.workerIds = nextWorkerIds;
    await writePrivateJson(contextPath, ctx);
    console.log(
      JSON.stringify({
        status: "PASS",
        phase: "worker-run",
        admittedCompleted: isolation.admission.jobIds,
        healthVerified,
        healthPayload,
        cleanShutdownCode: code,
      }),
    );
  } catch (err) {
    if (child.exitCode === null) {
      try {
        child.send({ type: "sentinel.shutdown", version: 1 });
      } catch {
        child.kill();
      }
    }
    throw err;
  } finally {
    await pool.end();
  }
}

async function runIngestDuplicate() {
  const artifactDir = assertSafeDevArtifactDir(
    requireArg("artifact-dir"),
    repoRootPath(),
  );
  const contextPath = requireArg("context");
  const ctx = await readContext(contextPath, artifactDir);
  const credential = (
    await readFile(
      join(artifactDir, "h04c-b2-ingest-credential.secret"),
      "utf8",
    )
  ).trim();

  if (runningWorkerProcesses().length !== 0) {
    throw new PlatformError("target_denied");
  }
  const { pool } = await openGatedPool(
    "migration",
    "runtime",
    "provision-ingest",
    NON_WORKER_TTL_MS,
  );
  let cutoffIso: string;
  try {
    const state = await captureReadOnlyDevState(pool);
    if (state.activeLeases !== 0) throw new PlatformError("target_denied");
    cutoffIso = new Date(Date.parse(state.clockNow) - 500).toISOString();
  } finally {
    await pool.end();
  }

  // Keep occurredAt inside the exact same 600s window as Batch 1 so evaluation coalesces evidence onto the correlated incident.
  const batch2Id = randomUUID();
  const event2Id = randomUUID();
  const nowIso = new Date().toISOString();
  const anchorMs = Date.parse(ctx.firstEventOccurredAt ?? nowIso);
  const windowStartMs = Math.floor(anchorMs / 600_000) * 600_000;
  const windowEndMs = windowStartMs + 600_000;
  const event2OccurredAt = new Date(
    Math.max(anchorMs, Math.min(Date.now(), windowEndMs - 1)),
  ).toISOString();
  const batch2 = {
    schemaVersion: 1,
    batchId: batch2Id,
    sentAt: nowIso,
    events: [
      {
        schemaVersion: 1,
        eventId: event2Id,
        projectId: s04DevProjectScope.projectId,
        occurredAt: event2OccurredAt,
        kind: "http.request",
        severityHint: "low",
        request: {
          method: "GET",
          routeTemplate: "/api/v1/orders/canaryOrderItem",
          statusCode: 403,
        },
        attributes: {
          reasonCode: "forbidden",
          durationMs: 9,
          controlled: true,
        },
      },
    ],
  };

  const ingest2 = await httpRequestJson(`${ctx.origin}/api/sentinel/ingest`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${credential}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(batch2),
  });
  if (ingest2.status !== 202) {
    throw new Error(`ingest2_failed:${ingest2.status}`);
  }
  ctx.batchIds.push(batch2Id);
  ctx.eventIds.push(event2Id);
  ctx.canaryValues.push("canaryOrderItem");
  await writePrivateJson(contextPath, ctx);
  console.log(
    JSON.stringify({
      status: "PASS",
      phase: "ingest-duplicate",
      batch2Id,
      event2Id,
      cutoffIso,
    }),
  );
}

async function runVerifyIncidents() {
  const artifactDir = assertSafeDevArtifactDir(
    requireArg("artifact-dir"),
    repoRootPath(),
  );
  const contextPath = requireArg("context");
  const cookieFile = requireArg("cookie-file");
  assertSafeDevArtifactDir(cookieFile, repoRootPath());
  const cookie = (await readFile(cookieFile, "utf8")).trim();
  const ctx = await readContext(contextPath, artifactDir);
  const baseApi = `${ctx.origin}/api/sentinel/projects/${s04DevProjectScope.projectId}`;
  const headers = {
    cookie,
    origin: ctx.origin,
    "content-type": "application/json",
  };

  const listRes = await httpRequestJson(`${baseApi}/incidents`, {
    headers: { cookie },
  });
  if (listRes.status !== 200) {
    throw new Error(`incident_list_failed:${listRes.status}`);
  }
  const listBody = listRes.json as {
    items: Array<{
      incidentId: string;
      sourceId: string;
      ruleId: string;
      status: string;
      revision: number;
      alertIds: string[];
    }>;
  };
  const inc = selectRecoveryIncident(listBody.items, {
    sourceId: ctx.sourceId,
    ruleId: ctx.ruleId,
  });
  if ((ctx.priorIncidentIds ?? []).includes(inc.incidentId)) {
    throw new PlatformError("target_denied");
  }
  ctx.incidentId = inc.incidentId;
  ctx.alertIds = [...inc.alertIds];

  // Secret-bearing note MUST reject with 400 before mutation.
  const secretNote = await httpRequestJson(`${baseApi}/incidents`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "investigate",
      incidentId: inc.incidentId,
      expectedRevision: inc.revision,
      note: "bearer super_secret_token_should_never_store",
    }),
  });
  if (secretNote.status !== 400) {
    throw new Error(`expected_400_secret_note:${secretNote.status}`);
  }

  // Transition open -> investigating.
  const invRes = await httpRequestJson(`${baseApi}/incidents`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "investigate",
      incidentId: inc.incidentId,
      expectedRevision: inc.revision,
      note: "Starting H04C-B2 live investigation.",
    }),
  });
  if (invRes.status !== 200) {
    throw new Error(`investigate_failed:${invRes.status}`);
  }
  const invRev = (invRes.json as { revision: number }).revision;

  // Stale revision conflict -> 409 without mutating DB.
  const staleRes = await httpRequestJson(`${baseApi}/incidents`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "close",
      incidentId: inc.incidentId,
      expectedRevision: inc.revision,
      reason: "Stale revision attempt",
    }),
  });
  if (staleRes.status !== 409) {
    throw new Error(`expected_409_revision_conflict:${staleRes.status}`);
  }

  // Close -> closed.
  const closeRes = await httpRequestJson(`${baseApi}/incidents`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "close",
      incidentId: inc.incidentId,
      expectedRevision: invRev,
      reason: "H04C-B2 close check",
    }),
  });
  if (closeRes.status !== 200) {
    throw new Error(`close_failed:${closeRes.status}`);
  }
  const closeRev = (closeRes.json as { revision: number }).revision;

  // Reopen -> investigating + cleared closedAt.
  const reopenRes = await httpRequestJson(`${baseApi}/incidents`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "reopen",
      incidentId: inc.incidentId,
      expectedRevision: closeRev,
      reason: "H04C-B2 reopen verification",
    }),
  });
  if (reopenRes.status !== 200) {
    throw new Error(`reopen_failed:${reopenRes.status}`);
  }

  // Fetch full details and verify timeline + redacted evidence + zero leaked canaries.
  const detailRes = await httpRequestJson(
    `${baseApi}/incidents?incidentId=${inc.incidentId}`,
    { headers: { cookie } },
  );
  if (detailRes.status !== 200) {
    throw new Error(`detail_failed:${detailRes.status}`);
  }
  const detailText = JSON.stringify(detailRes.json);
  for (const canary of await contextCanaries(ctx)) {
    if (canary && detailText.includes(canary)) {
      throw new Error("canary_secret_leaked_in_incident_detail");
    }
  }
  const detail = detailRes.json as {
    incident: { status: string; closedAt: string | null; revision: number };
    timeline: { type: string }[];
    evidence: unknown[];
  };
  if (
    detail.incident.status !== "investigating" ||
    detail.incident.closedAt !== null ||
    detail.evidence.length < 2 ||
    !detail.timeline.some((t) => t.type === "alert_created") ||
    !detail.timeline.some((t) => t.type === "incident_opened") ||
    !detail.timeline.some((t) => t.type === "incident_closed")
  ) {
    throw new Error("incident_transition_or_timeline_invariant_failed");
  }

  await writePrivateJson(contextPath, ctx);
  console.log(
    JSON.stringify({
      status: "PASS",
      phase: "verify-incidents",
      incidentId: inc.incidentId,
      finalStatus: detail.incident.status,
      finalRevision: detail.incident.revision,
      alertCount: inc.alertIds.length,
      evidenceCount: detail.evidence.length,
      timelineCount: detail.timeline.length,
    }),
  );
}

async function runNegativeMatrixPhase() {
  const artifactDir = assertSafeDevArtifactDir(
    requireArg("artifact-dir"),
    repoRootPath(),
  );
  const contextPath = requireArg("context");
  const ctx = await readContext(contextPath, artifactDir);
  if (
    !ctx.incidentId ||
    !ctx.alertIds[0] ||
    !ctx.eventIds[0] ||
    !ctx.admittedJobIds[0]
  ) {
    throw new PlatformError("invalid_input");
  }

  const workerApprovalFile = requireArg("worker-approval-file");
  const appApprovalFile = requireArg("app-approval-file");
  const migrationApprovalFile = requireArg("migration-approval-file");

  const plan = await migrationPlan();
  const appCfg = await openGatedPool(
    "app",
    "runtime",
    "negative-matrix",
    NON_WORKER_TTL_MS,
    {
      ...process.env,
      SENTINEL_DB_APPROVAL_FILE: appApprovalFile,
      SENTINEL_DB_MIGRATION_PASSWORD_FILE: undefined,
    },
  );
  const workerCfg = await openGatedPool(
    "worker",
    "runtime",
    "negative-matrix",
    NON_WORKER_TTL_MS,
    {
      ...process.env,
      SENTINEL_DB_APPROVAL_FILE: workerApprovalFile,
      SENTINEL_DB_MIGRATION_PASSWORD_FILE: undefined,
    },
  );
  const migCfg = await openGatedPool(
    "migration",
    "runtime",
    "negative-matrix",
    NON_WORKER_TTL_MS,
    {
      ...process.env,
      SENTINEL_DB_APPROVAL_FILE: migrationApprovalFile,
    },
  );

  try {
    const det = detectionActivation(workerCfg.config.approval, true);
    const inc = incidentActivation(workerCfg.config.approval, true, det);
    const iso = requestedAcceptanceIsolation(
      workerCfg.config,
      det,
      true,
      inc,
      plan.migrations,
    );
    const result = await runNegativePostgresMatrix({
      appPool: appCfg.pool,
      workerPool: workerCfg.pool,
      migrationPool: migCfg.pool,
      migrations: plan.migrations,
      scope: s04DevProjectScope,
      sourceId: ctx.sourceId,
      incidentId: ctx.incidentId,
      alertId: ctx.alertIds[0],
      eventId: ctx.eventIds[0],
      completedAdmittedJobId: ctx.admittedJobIds[0],
      protectedJobIds: ctx.protectedJobIds,
      workerConfig: { isolation: iso, detection: det, incidents: inc },
    });
    await writePrivateJson(join(artifactDir, "negative-matrix.json"), result);
    console.log(
      JSON.stringify({ status: "PASS", phase: "negative-matrix", result }),
    );
  } finally {
    await Promise.allSettled([
      appCfg.pool.end(),
      workerCfg.pool.end(),
      migCfg.pool.end(),
    ]);
  }
}

async function runCleanup() {
  const artifactDir = assertSafeDevArtifactDir(
    requireArg("artifact-dir"),
    repoRootPath(),
  );
  const contextPath = requireArg("context");
  const cookieFile = requireArg("cookie-file");
  assertSafeDevArtifactDir(cookieFile, repoRootPath());
  const ctx = await readContext(contextPath, artifactDir);
  const cookie = (await readFile(cookieFile, "utf8")).trim();
  const baseApi = `${ctx.origin}/api/sentinel/projects/${s04DevProjectScope.projectId}`;
  const headers = {
    cookie,
    origin: ctx.origin,
    "content-type": "application/json",
  };

  // Revoke credential, disable source, disable rule.
  const revokeRes = await httpRequestJson(`${baseApi}/sources`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "revoke", sourceId: ctx.sourceId }),
  });
  if (revokeRes.status !== 200)
    throw new Error(`revoke_failed:${revokeRes.status}`);

  const disableSrc = await httpRequestJson(`${baseApi}/sources`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "disable", sourceId: ctx.sourceId }),
  });
  if (disableSrc.status !== 200)
    throw new Error(`disable_src_failed:${disableSrc.status}`);

  const disableRule = await httpRequestJson(`${baseApi}/rules`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "disable",
      ruleId: ctx.ruleId,
      expectedRevision: ctx.ruleRevision,
    }),
  });
  if (disableRule.status !== 200)
    throw new Error(`disable_rule_failed:${disableRule.status}`);

  // Verify BOTH current recovery AND prior-attempt synthetic sources and rules are disabled / revoked.
  const srcListRes = await httpRequestJson(`${baseApi}/sources`, {
    headers: { cookie },
  });
  if (srcListRes.status !== 200)
    throw new Error(`cleanup_sources_list_failed:${srcListRes.status}`);
  const srcItems = ((srcListRes.json as { sources?: unknown[] })?.sources ??
    []) as Array<{
    sourceId: string;
    enabled: boolean;
    activeCredentials: number;
  }>;
  const requiredDisabledSources = new Set([
    ctx.sourceId,
    ...(ctx.priorSourceIds ?? []),
  ]);
  for (const sid of requiredDisabledSources) {
    const row = srcItems.find((s) => s.sourceId === sid);
    if (!row || row.enabled || row.activeCredentials !== 0) {
      throw new Error(`cleanup_source_still_active:${sid}`);
    }
  }

  const ruleListRes = await httpRequestJson(`${baseApi}/rules`, {
    headers: { cookie },
  });
  if (ruleListRes.status !== 200)
    throw new Error(`cleanup_rules_list_failed:${ruleListRes.status}`);
  const ruleItems = ((ruleListRes.json as { rules?: unknown[] })?.rules ??
    []) as Array<{
    ruleId: string;
    status: string;
  }>;
  const requiredDisabledRules = new Set([
    ctx.ruleId,
    ...(ctx.priorRuleIds ?? []),
  ]);
  if (ctx.recoveryMode)
    requiredDisabledRules.add(s04DevPriorAttemptDefaults.ruleId);
  for (const rid of requiredDisabledRules) {
    const row = ruleItems.find((r) => r.ruleId === rid);
    if (!row || row.status !== "DISABLED") {
      throw new Error(`cleanup_rule_not_disabled:${rid}`);
    }
  }

  // Confirm revoked ingest credential returns 401.
  const credFile = join(artifactDir, "h04c-b2-ingest-credential.secret");
  const secretStat = await stat(credFile).catch(() => null);
  if (secretStat) {
    const cred = (await readFile(credFile, "utf8")).trim();
    if (cred) {
      const revokedTest = await httpRequestJson(
        `${ctx.origin}/api/sentinel/ingest`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${cred}`,
            "content-type": "application/json",
          },
          body: "{}",
        },
      );
      if (revokedTest.status !== 401) {
        throw new Error(
          `revoked_credential_still_accepted:${revokedTest.status}`,
        );
      }
    }
    await writeFile(credFile, "REVOKED_AND_CLEARED\n", {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  // Close all specified approval files.
  const approvalFiles = (argValue("close-approvals") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const file of approvalFiles) {
    assertSafeDevArtifactDir(file, repoRootPath());
    const parsed = JSON.parse(await readFile(file, "utf8")) as Record<
      string,
      unknown
    >;
    await writePrivateJson(file, {
      ...parsed,
      status: "CLOSED_AFTER_H04C_B2",
      actions: [],
      closedAt: new Date().toISOString(),
    });
  }

  console.log(
    JSON.stringify({
      status: "PASS",
      phase: "cleanup",
      revokedSourceId: ctx.sourceId,
      disabledRuleId: ctx.ruleId,
      closedApprovals: approvalFiles.length,
    }),
  );
}

async function runPostflight() {
  const artifactDir = assertSafeDevArtifactDir(
    requireArg("artifact-dir"),
    repoRootPath(),
  );
  const contextPath = requireArg("context");
  const backupPath = requireArg("backup-file");
  const ctx = await readContext(contextPath, artifactDir);
  const preRecoveryArg =
    argValue("pre-recovery") ?? ctx.preRecoveryBaselineFile;
  const preRecovery =
    ctx.recoveryMode || preRecoveryArg
      ? await loadPreRecoverySnapshot(
          preRecoveryArg ?? join(artifactDir, "pre-recovery-baseline.json"),
        )
      : null;
  const containmentPath =
    argValue("containment") ??
    ctx.containmentFile ??
    join(artifactDir, "containment.json");
  const containment = await loadOptionalContainment(containmentPath);
  const procs = runningWorkerOrAppProcesses();
  const backup = await verifyBackupArtifactIntact(backupPath);
  const baselineBefore = await readBaselineBefore();

  if (runningWorkerProcesses().length !== 0) {
    throw new PlatformError("target_denied");
  }
  const { pool } = await openGatedPool(
    "migration",
    "runtime",
    "postflight",
    NON_WORKER_TTL_MS,
  );
  try {
    const state = await captureReadOnlyDevState(pool);
    const protectedJobsBefore =
      baselineBefore.deterministicState.details.jobsInventory.filter(
        (j) => j.state === "queued",
      );
    const historicalCompletedJobIds =
      baselineBefore.deterministicState.details.jobsInventory
        .filter((j) => j.state !== "queued")
        .map((j) => j.job_id);

    let authorizedRuleTransition: AuthorizedRuleTransition | undefined;
    if (
      preRecovery &&
      containment &&
      containment.preRecoverySha256 === preRecovery.preRecoverySha256 &&
      containment.ruleRowBeforeHash &&
      containment.ruleId === s04DevContainRulePin.ruleId &&
      preRecovery.priorRules.some(
        (r) =>
          r.rule_id === containment.ruleId &&
          r.status === s04DevContainRulePin.initialStatus &&
          r.revision === s04DevContainRulePin.initialRevision,
      )
    ) {
      const currentContainedRule = state.rules.find(
        (r) => r.rule_id === containment.ruleId,
      );
      if (
        currentContainedRule?.status === s04DevContainRulePin.finalStatus &&
        currentContainedRule?.revision === s04DevContainRulePin.finalRevision
      ) {
        authorizedRuleTransition = {
          ruleId: containment.ruleId,
          ruleRowBeforeHash: containment.ruleRowBeforeHash,
          finalStatus: currentContainedRule.status,
        };
      }
    }

    verifyHistoricalMultisetPreserved({
      beforeRowHashesByTable:
        baselineBefore.deterministicState.rowHashesByTable,
      afterRowHashesByTable: state.rowHashesByTable,
      preRecoveryRowHashesByTable: preRecovery?.preRecoveryRowHashesByTable,
      authorizedRuleTransition,
      protectedJobsBefore,
      historicalCompletedJobIds,
      priorAttemptJobs: preRecovery?.priorAttemptJobs,
      allJobsAfter: state.jobsInventory,
      admittedJobIds: ctx.admittedJobIds,
      sourceId: ctx.sourceId,
    });

    const client = await pool.connect();
    let persistedTextSamples: string[] = [];
    try {
      await client.query("BEGIN READ ONLY");
      const ev = await client.query(
        "SELECT to_jsonb(r)::text AS txt FROM sentinel.telemetry_events r WHERE source_id=$1",
        [ctx.sourceId],
      );
      const inc = await client.query(
        "SELECT to_jsonb(r)::text AS txt FROM sentinel.incidents r WHERE source_id=$1",
        [ctx.sourceId],
      );
      const tl = await client.query(
        "SELECT to_jsonb(r)::text AS txt FROM sentinel.incident_timeline r WHERE incident_id=$1",
        [ctx.incidentId],
      );
      persistedTextSamples = [...ev.rows, ...inc.rows, ...tl.rows].map((x) =>
        String(x.txt),
      );
      if (
        persistedTextSamples.some((text) =>
          /ws2\.[A-Za-z0-9_-]+\.[a-f0-9]{64}/.test(text),
        )
      )
        throw new PlatformError("target_denied");
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const requiredDisabledSourceIds = [
      ...new Set([ctx.sourceId, ...(ctx.priorSourceIds ?? [])]),
    ];
    const requiredDisabledRuleIds = [
      ...new Set([
        ctx.ruleId,
        ...(ctx.priorRuleIds ?? []),
        ...(ctx.recoveryMode ? [s04DevPriorAttemptDefaults.ruleId] : []),
      ]),
    ];

    verifyCleanShutdownAndPostflight({
      activeLeases: state.activeLeases,
      expiredLeases: state.expiredLeases,
      liveSessions: state.liveSessions,
      runningProcesses: procs,
      workerHeartbeats: state.workerHeartbeats,
      historicalHeartbeats: preRecovery?.historicalHeartbeats,
      requiredStoppedWorkerIds: ctx.workerIds,
      backupBytes: backup.size,
      backupSha256: backup.sha256,
      sources: state.sources.filter(
        (s) =>
          requiredDisabledSourceIds.includes(s.source_id) ||
          s.enabled ||
          s.active_credentials !== 0,
      ),
      rules: state.rules.filter(
        (r) =>
          requiredDisabledRuleIds.includes(r.rule_id) ||
          r.status !== "DISABLED",
      ),
      requiredDisabledSourceIds,
      requiredDisabledRuleIds,
      orphanedTimelineEvidenceCount: state.orphanedTimelineEvidence,
      persistedTextSamples,
      canarySecrets: await contextCanaries(ctx),
    });

    const postflight = {
      status: "PASS",
      recordedAt: new Date().toISOString(),
      recoveryMode: ctx.recoveryMode,
      preRecoverySha256: preRecovery?.preRecoverySha256 ?? null,
      tableCount: state.tables.length,
      ledger: state.ledger,
      backup,
      activeLeases: state.activeLeases,
      expiredLeases: state.expiredLeases,
      liveSessions: state.liveSessions.length,
      runningProcesses: procs.length,
      orphanedTimelineEvidence: state.orphanedTimelineEvidence,
      verifiedStoppedWorkers: ctx.workerIds,
      historicalHeartbeatCount: preRecovery?.historicalHeartbeats.length ?? 0,
      disabledSyntheticRuleIds: requiredDisabledRuleIds,
      disabledSyntheticSourceIds: requiredDisabledSourceIds,
      preservedPriorAttemptJobIds: ctx.priorAttemptJobIds ?? [],
      preservedPriorIncidentIds: ctx.priorIncidentIds ?? [],
      tableCounts: state.tableCounts,
    };
    await writePrivateJson(join(artifactDir, "postflight.json"), postflight);
    console.log(JSON.stringify(postflight));
  } finally {
    await pool.end();
  }
}

async function runUiVerify() {
  const artifactDir = assertSafeDevArtifactDir(
    requireArg("artifact-dir"),
    repoRootPath(),
  );
  const contextPath = requireArg("context");
  const cookieFile = requireArg("cookie-file");
  assertSafeDevArtifactDir(cookieFile, repoRootPath());
  const ctx = await readContext(contextPath, artifactDir);
  if (!ctx.incidentId) throw new PlatformError("invalid_input");

  const rawCookie = (await readFile(cookieFile, "utf8")).trim();
  const sessionPair = rawCookie
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith("wetscan_session="));
  if (!sessionPair) throw new PlatformError("approval_required");
  const sessionValue = sessionPair.slice("wetscan_session=".length);

  const exerciseTransitions = argValue("exercise-transitions") === "1";
  const expectedStatus = argValue("expect-status");
  const baseUrl = new URL(ctx.origin);

  const { chromium } = await import("playwright");
  const channel = process.env.AUTH_TEST_BROWSER_CHANNEL || "msedge";
  const browser = await chromium.launch({
    channel,
    headless: true,
  });

  try {
    const context = await browser.newContext({ baseURL: ctx.origin });
    await context.addCookies([
      {
        name: "wetscan_session",
        value: sessionValue,
        domain: baseUrl.hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage();

    // 1. Demo vs Live isolation: /app/projects/orderly-demo/sentinel/incidents makes 0 /api/sentinel/ requests.
    let demoApiCalls = 0;
    page.on("request", (req) => {
      if (
        page.url().includes("/orderly-demo/") &&
        req.url().includes("/api/sentinel/")
      ) {
        demoApiCalls++;
      }
    });
    await page.goto("/app/projects/orderly-demo/sentinel/incidents", {
      waitUntil: "networkidle",
    });
    if (demoApiCalls !== 0) {
      throw new Error(`demo_triggered_api_calls:${demoApiCalls}`);
    }

    // 2. Real Live Incidents page (zero page.route mocks).
    await page.goto(
      `/app/projects/${s04DevProjectScope.projectId}/sentinel/incidents`,
      { waitUntil: "networkidle" },
    );
    await page.getByLabel("Incident status").waitFor({ timeout: 10000 });
    await page.getByLabel("Incident severity").waitFor({ timeout: 10000 });
    await page.getByLabel("Provenance").waitFor({ timeout: 10000 });

    const targetActions = page.locator(".actions", {
      has: page.locator(`a[href$="/incidents/${ctx.incidentId}"]`),
    });
    for (let hop = 0; hop < 5; hop++) {
      if ((await targetActions.count()) > 0) break;
      const loadOlderBtn = page.getByRole("button", {
        name: "Load older incidents",
      });
      if (!(await loadOlderBtn.isVisible().catch(() => false))) break;
      await loadOlderBtn.click();
      await page.waitForLoadState("networkidle").catch(() => {});
    }
    if ((await targetActions.count()) !== 1) {
      throw new Error(
        `expected_exact_recovery_incident_card:${ctx.incidentId}`,
      );
    }
    const inspectBtn = targetActions.getByRole("button", {
      name: "Inspect incident",
    });
    await inspectBtn.waitFor({ timeout: 10000 });
    await inspectBtn.click();

    const detailRegion = page.getByRole("region", {
      name: "Incident investigation detail",
    });
    await detailRegion.waitFor({ timeout: 10000 });
    const selectedDetailText = (await detailRegion.textContent()) ?? "";
    if (!selectedDetailText.includes(ctx.incidentId)) {
      throw new Error(`selected_wrong_incident_detail:${ctx.incidentId}`);
    }
    for (const priorId of ctx.priorIncidentIds ?? []) {
      if (
        priorId &&
        priorId !== ctx.incidentId &&
        selectedDetailText.includes(priorId)
      ) {
        throw new Error(`selected_prior_attempt_incident:${priorId}`);
      }
    }
    await page
      .getByRole("region", { name: "Investigation timeline" })
      .waitFor({ timeout: 10000 });
    await page
      .getByRole("region", { name: "Linked alerts" })
      .waitFor({ timeout: 10000 });
    const evidenceRegion = page.getByRole("region", {
      name: "Linked redacted evidence",
    });
    await evidenceRegion.waitFor({ timeout: 10000 });

    const bodyText = (await page.locator("body").textContent()) ?? "";
    const evidenceText = (await evidenceRegion.textContent()) ?? "";
    if (!evidenceText.includes(":redacted")) {
      throw new Error("missing_redacted_route_in_ui_evidence");
    }
    for (const canary of await contextCanaries(ctx)) {
      if (canary && bodyText.includes(canary)) {
        throw new Error("canary_secret_leaked_in_ui_dom");
      }
    }

    if (expectedStatus) {
      const detailText = (await detailRegion.textContent()) ?? "";
      if (!detailText.toLowerCase().includes(expectedStatus.toLowerCase())) {
        throw new Error(`expected_ui_status_${expectedStatus}`);
      }
    }

    if (exerciseTransitions) {
      const closeBtn = detailRegion.getByRole("button", {
        name: "Close incident",
      });
      if (await closeBtn.isVisible()) {
        await detailRegion
          .getByRole("textbox", { name: "Close reason" })
          .fill("H04C-B2 live UI close verification");
        await closeBtn.click();
        await detailRegion
          .getByRole("button", { name: "Reopen investigation" })
          .waitFor({ timeout: 10000 });
      }
      const reopenBtn = detailRegion.getByRole("button", {
        name: "Reopen investigation",
      });
      await reopenBtn.waitFor({ timeout: 10000 });
      await detailRegion
        .getByRole("textbox", { name: "Reopen reason" })
        .fill("H04C-B2 live UI reopen verification");
      await reopenBtn.click();
      await detailRegion
        .getByRole("button", { name: "Close incident" })
        .waitFor({ timeout: 10000 });
    }

    // 3. Permalink view.
    await page.goto(
      `/app/projects/${s04DevProjectScope.projectId}/sentinel/incidents/${ctx.incidentId}`,
      { waitUntil: "networkidle" },
    );
    await page
      .getByRole("region", { name: "Incident investigation detail" })
      .waitFor({ timeout: 10000 });

    console.log(
      JSON.stringify({
        status: "PASS",
        phase: "ui-verify",
        demoApiCalls,
        incidentId: ctx.incidentId,
        redactedEvidencePresent: true,
        canariesRedacted: true,
        exerciseTransitions,
      }),
    );
  } finally {
    await browser.close();
  }
}

export async function runCli(command = process.argv[2] ?? "plan") {
  if (command === "plan") {
    console.log(JSON.stringify(buildPlanSummary(), null, 2));
    return;
  }
  switch (command) {
    case "preflight":
      return runPreflight();
    case "contain-rule":
      return runContainRule();
    case "provision-and-ingest":
      return runProvisionAndIngest();
    case "seal-worker":
      return runSealWorker();
    case "worker-run":
      return runSealedWorker();
    case "ingest-duplicate":
      return runIngestDuplicate();
    case "verify-incidents":
      return runVerifyIncidents();
    case "ui-verify":
      return runUiVerify();
    case "negative-matrix":
      return runNegativeMatrixPhase();
    case "cleanup":
      return runCleanup();
    case "postflight":
      return runPostflight();
    default:
      throw new PlatformError("invalid_input");
  }
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  runCli().catch((err) => {
    console.error(
      JSON.stringify({
        status: "blocked",
        reason:
          err instanceof PlatformError
            ? err.code
            : err instanceof Error
              ? err.message
              : "acceptance_failed",
      }),
    );
    process.exitCode = 1;
  });
}
