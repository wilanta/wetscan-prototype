import { execFileSync } from "node:child_process";
import { readFile, lstat, realpath } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { QueryResultRow } from "pg";
import type { SqlClient } from "../src/platform/database";
import { verifyAuditPackageBindings } from "./sentinel-audit-package";
import { parseObject } from "./sentinel-provision-package";
import {
  captureReadOnlyDevState,
  readOnlyDevStateQueries,
} from "./sentinel-dev-acceptance";
import {
  arg,
  assertPrivateAcl,
  exclusiveJson,
  inspectApprovalHistory,
  loadPreservationInputs,
  loadProvisionInputs,
  privatePath,
  treeHashes,
  verifyPreserved,
} from "./sentinel-provision-owner";
import {
  hash,
  verifyProvisionStart,
  type ProvisionState,
} from "./sentinel-provision-safety";
import {
  provisionDiagnostics,
  provisionFailure,
} from "./sentinel-provision-diagnostics";
import {
  AuditError,
  auditCheck,
  auditApprovalName,
  auditMaximumMs,
  auditTarget,
  validateAuditAuthorization,
} from "./sentinel-readonly-audit-contract";

export const auditIdentitySql = `SELECT current_database() AS database,current_user AS username,
shobj_description(d.oid,'pg_database') AS marker,current_setting('server_version_num')::int AS version,
current_setting('default_transaction_read_only') AS default_read_only,current_setting('transaction_read_only') AS read_only,
r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,
(SELECT count(*)::int FROM pg_auth_members WHERE member=r.oid) AS memberships
FROM pg_database d JOIN pg_roles r ON r.rolname=current_user WHERE d.datname=current_database()`;
export const auditPermissionsSql =
  "SELECT bool_and(has_table_privilege(current_user,t,'SELECT')) AS can_read FROM unnest($1::text[]) AS t";
const begin = "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY";
export function auditAllowedQueries(tables: string[]) {
  auditCheck(
    tables.length === 25 &&
      new Set(tables).size === 25 &&
      tables.every((t) => /^(platform|sentinel)\.[a-z_]+$/.test(t)),
    "audit_table_inventory",
  );
  return new Set<string>([
    begin,
    "COMMIT",
    "ROLLBACK",
    ...Object.values(readOnlyDevStateQueries),
    ...tables.map(
      (t) =>
        `SELECT to_jsonb(r)::text AS value FROM ${t} r ORDER BY to_jsonb(r)::text`,
    ),
  ]);
}
export const auditPoolOptions = (password: string, runId: string) => ({
  ...auditTarget,
  user: "wetscan_migrator",
  password,
  ssl: false,
  max: 1,
  connectionTimeoutMillis: 3000,
  idleTimeoutMillis: 1000,
  statement_timeout: 5000,
  query_timeout: 6000,
  idle_in_transaction_session_timeout: 5000,
  options: "-c default_transaction_read_only=on -c lock_timeout=1000",
  application_name: `wetscan-s04-preservation-audit-${runId}`,
  allowExitOnIdle: true,
});
/** No generic runtime authorization or unrestricted SQL port is exposed. */
export class ReadOnlyAuditPool {
  private readonly pool: pg.Pool;
  private active?: { release: (destroy?: boolean) => void };
  private ended?: Promise<void>;
  attempts = 0;
  constructor(
    password: string,
    runId: string,
    private readonly allowed: Set<string>,
    private readonly guard: () => void,
  ) {
    this.pool = new pg.Pool(auditPoolOptions(password, runId));
    this.pool.on("error", () => {
      /* Never export driver messages. */
    });
  }
  async connect(): Promise<SqlClient> {
    this.guard();
    auditCheck(++this.attempts === 1, "audit_single_connection");
    const client = await this.pool.connect();
    let released = false;
    const release = (destroy = false) => {
      if (!released) {
        released = true;
        this.active = undefined;
        client.release(destroy);
      }
    };
    this.active = { release };
    try {
      this.guard();
      const row = (await client.query(auditIdentitySql)).rows[0];
      auditCheck(
        row &&
          row.database === auditTarget.database &&
          row.username === "wetscan_migrator" &&
          row.marker === auditTarget.marker &&
          row.version === 170012 &&
          row.default_read_only === "on" &&
          row.read_only === "on" &&
          !row.rolsuper &&
          !row.rolbypassrls &&
          !row.rolcreatedb &&
          !row.rolcreaterole &&
          row.memberships === 0,
        "audit_database_identity",
      );
      this.guard();
      const tables = [...this.allowed]
        .filter((s) => s.startsWith("SELECT to_jsonb(r)::text AS value FROM "))
        .map((s) => s.split(" FROM ")[1].split(" r ORDER ")[0]);
      auditCheck(
        (await client.query(auditPermissionsSql, [tables])).rows[0]
          ?.can_read === true,
        "audit_role_permissions",
      );
      return {
        query: async <R extends QueryResultRow>(
          sql: string,
          values?: unknown[],
        ) => {
          auditCheck(!released, "audit_connection_closed");
          auditCheck(this.allowed.has(sql), "audit_sql_denied");
          if (sql !== "ROLLBACK") this.guard();
          return client.query<R>(sql, values);
        },
        release,
      };
    } catch (error) {
      release(true);
      throw error;
    }
  }
  abort() {
    this.active?.release(true);
  }
  end() {
    this.abort();
    return (this.ended ??= this.pool.end());
  }
}
type Inputs = Awaited<ReturnType<typeof loadProvisionInputs>>;
export function verifyReadOnlyAuditState(
  state: ProvisionState,
  inputs: Pick<Inputs, "pre" | "before" | "plan">,
) {
  auditCheck(
    JSON.stringify(state.ledger.map((r) => [r.version, r.checksum])) ===
      JSON.stringify(
        inputs.plan.migrations.map((r) => [r.version, r.checksum]),
      ),
    "audit_migration_identity",
  );
  verifyProvisionStart(
    state,
    inputs.pre,
    inputs.before.deterministicState.rowHashesByTable,
  );
  const expectedJobs = [
    ...inputs.pre.protectedJobIds,
    ...inputs.pre.historicalCompletedJobIds,
    ...inputs.pre.priorAttemptJobs.map((j) => j.job_id),
  ].sort();
  auditCheck(
    JSON.stringify(state.jobsInventory.map((j) => j.job_id).sort()) ===
      JSON.stringify(expectedJobs),
    "audit_job_identity_set",
  );
  return {
    status: "PASS",
    phase: "preservation-audit",
    database: auditTarget.database,
    marker: auditTarget.marker,
    role: "wetscan_migrator",
    transactionReadOnly: true,
    historicalRowsVerified: 91,
    historicalJobsVerified: 16,
    protectedQueuedJobs: 8,
    historicalNonQueuedJobs: 6,
    priorAcceptanceJobs: 2,
    historicalHeartbeatsVerified: 8,
    incidentId: "8e8cc956-88cf-585f-ae59-6d47eb6996dc",
    incidentEvidenceAndTimelinePreserved: true,
    disabledSources: 3,
    activeCredentials: 0,
    disabledRules: 3,
    containedRuleRevision: 3,
    unexpectedRows: 0,
    activeLeases: 0,
    expiredLeases: 0,
    orphanEvidence: 0,
    unexpectedSessions: 0,
    provisioningExecuted: false,
    databaseMutations: 0,
    s04Status: "IMPLEMENTED_PENDING_ACCEPTANCE",
  };
}
export async function performReadOnlyAudit(deps: {
  pool: Pick<ReadOnlyAuditPool, "connect" | "abort" | "end">;
  inputs: Pick<Inputs, "pre" | "before" | "plan">;
  guard: () => void;
  remainingMs: number;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  try {
    auditCheck(
      deps.remainingMs > 0 && deps.remainingMs <= auditMaximumMs,
      "audit_deadline",
    );
    timer = setTimeout(() => {
      expired = true;
      deps.pool.abort();
    }, deps.remainingMs);
    deps.guard();
    const state = await captureReadOnlyDevState(deps.pool, true);
    deps.guard();
    const result = verifyReadOnlyAuditState(state, deps.inputs);
    return {
      result,
      hashes: {
        rowHashesByTable: state.rowHashesByTable,
        jobIds: state.jobsInventory.map((j) => j.job_id).sort(),
        heartbeatIds: state.workerHeartbeats.map((h) => h.worker_id).sort(),
        ruleIds: state.rules.map((r) => r.rule_id).sort(),
        incidentIds: state.existingIncidents.map((i) => i.incident_id).sort(),
      },
    };
  } catch (error) {
    if (expired) throw new AuditError("audit_deadline");
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    try {
      await deps.pool.end();
    } catch {
      throw new AuditError("audit_pool_cleanup_failed");
    }
  }
}
function assertNoRuntime() {
  const script = `$p=@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne ${process.pid} -and $_.Name -match '^node(?:\\.exe)?$' -and $_.CommandLine -match 'worker[\\\\/](sentinel|guard)|next[\\\\/]dist[\\\\/]bin[\\\\/]next|next-server|sentinel-dev-acceptance|sentinel-provision-owner' }); $l=@(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue); Write-Output ($p.Count + $l.Count)`;
  auditCheck(
    execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf8", windowsHide: true },
    ).trim() === "0",
    "audit_runtime_conflict",
  );
}
async function credentialPath(path: string) {
  const file = await privatePath(path);
  const info = await lstat(file);
  auditCheck(
    info.isFile() &&
      info.nlink === 1 &&
      !info.isSymbolicLink() &&
      (await realpath(file)) === file,
    "audit_credential_path",
  );
  assertPrivateAcl(file, true);
  return file;
}
async function auditCodeHashes(preserved: Record<string, string>) {
  const result = { ...preserved },
    repo = fileURLToPath(new URL("..", import.meta.url));
  for (const file of [
    "scripts/sentinel-readonly-audit.ts",
    "scripts/sentinel-readonly-audit-contract.ts",
    "scripts/Invoke-S04ReadOnlyAudit.ps1",
    "scripts/sentinel-readonly-audit-common.ps1",
    "scripts/sentinel-readonly-audit-watchdog.ps1",
    "scripts/sentinel-audit-package.ts",
  ])
    result[join(repo, file)] = hash(await readFile(join(repo, file)));
  return result;
}
export function validateAuditManifest(
  value: unknown,
  required: Record<string, string>,
) {
  auditCheck(
    value && typeof value === "object" && !Array.isArray(value),
    "audit_manifest_format",
  );
  const pins = value as Record<string, string>;
  const repo = resolve(fileURLToPath(new URL("..", import.meta.url))),
    root = resolve("C:/Users/sheil/.wetscan-sentinel");
  auditCheck(
    Object.keys(pins).length > 0 &&
      Object.entries(pins).every(
        ([p, h]) =>
          isAbsolute(p) &&
          [repo, root].some((r) => p.startsWith(r + sep)) &&
          typeof h === "string" &&
          /^[a-f0-9]{64}$/.test(h),
      ),
    "audit_manifest_boundary",
  );
  auditCheck(
    Object.entries(required).every(([p, h]) => pins[p] === h),
    "audit_manifest_pin",
  );
  return pins;
}
async function reviewedManifest(required: Record<string, string>) {
  const file = await credentialPath(arg("input-manifest") ?? "");
  const bytes = await readFile(file),
    expected = arg("input-manifest-sha256") ?? "";
  auditCheck(
    /^[a-f0-9]{64}$/.test(expected) && hash(bytes) === expected,
    "audit_manifest_hash",
  );
  const pins = validateAuditManifest(parseObject(bytes), required);
  for (const path of Object.keys(pins)) {
    const info = await lstat(path);
    auditCheck(
      info.isFile() &&
        !info.isSymbolicLink() &&
        info.nlink === 1 &&
        (await realpath(path)) === path,
      "audit_manifest_boundary",
    );
  }
  await verifyPreserved(pins);
  await verifyAuditPackageBindings(
    file,
    pins,
    arg(
      "migration-password-file",
      "C:/Users/sheil/.wetscan-sentinel/s01-20261114/secrets/migration.password",
    )!,
  );
  return { ...pins, [file]: expected };
}
export async function auditOffline() {
  const inputs = await loadProvisionInputs();
  await reviewedManifest(await auditCodeHashes(inputs.preserved));
  assertNoRuntime();
  await credentialPath(
    arg(
      "migration-password-file",
      "C:/Users/sheil/.wetscan-sentinel/s01-20261114/secrets/migration.password",
    )!,
  );
  // No password is read, no pool constructed, no output or authorization created.
  return {
    status: "OFFLINE_READY",
    phase: "preservation-audit",
    databaseConnections: 0,
    executionPerformed: false,
    inputHashes: Object.keys(inputs.preserved).length,
    maximumDurationMs: auditMaximumMs,
  };
}
export async function auditLive() {
  auditCheck(
    process.env.SENTINEL_READONLY_AUDIT_EXECUTION === "1",
    "audit_opt_in",
  );
  for (const [k, v] of Object.entries(process.env))
    if (
      v &&
      (/^SENTINEL_PROVISION_/.test(k) ||
        /^SENTINEL_H04C_B2_EXECUTION$/.test(k) ||
        /^SENTINEL_DB_(APP|WORKER|BOOTSTRAP|TEST)_PASSWORD_FILE$/.test(k) ||
        k === "SENTINEL_DB_APPROVAL_FILE")
    )
      throw new AuditError("audit_ambient_permissions");
  const output = await privatePath(arg("artifact-dir") ?? "");
  auditCheck(
    output.startsWith(resolve("C:/Users/sheil/.wetscan-sentinel") + sep),
    "audit_output_boundary",
  );
  assertPrivateAcl(output);
  const runId = arg("run-id") ?? "";
  const approvalPath = join(output, auditApprovalName);
  assertPrivateAcl(approvalPath, true);
  const approvalBytes = await readFile(approvalPath);
  const approval = JSON.parse(approvalBytes.toString());
  const binding = { runId, outputDirectory: output, nowMs: Date.now() };
  const authorization = validateAuditAuthorization(approval, binding);
  auditCheck(
    authorization.inputManifestSha256 === arg("input-manifest-sha256"),
    "audit_manifest_binding",
  );
  const approvalHash = hash(approvalBytes);
  const records = await inspectApprovalHistory();
  auditCheck(
    records.filter(
      (r) =>
        r.path === approvalPath &&
        r.sha256 === approvalHash &&
        r.phase === "preservation-audit",
    ).length === 1,
    "audit_approval_discovery",
  );
  const inputs = await loadPreservationInputs(
    records.filter((r) => r.path !== approvalPath),
  );
  const preserved = {
    ...(await reviewedManifest(await auditCodeHashes(inputs.preserved))),
    ...inputs.preserved,
    ...(await treeHashes("C:/Users/sheil/.wetscan-sentinel", output)),
  };
  await exclusiveJson(join(output, "input-hashes.private.json"), preserved);
  assertNoRuntime();
  const deadline = Date.parse(authorization.expiresAt),
    clock = performance.now(),
    remaining = deadline - Date.now();
  const guard = () => {
    auditCheck(
      Date.now() < deadline && performance.now() - clock < remaining,
      "audit_deadline",
    );
    auditCheck(
      hash(readFileSync(approvalPath)) === approvalHash,
      "audit_approval_changed",
    );
    validateAuditAuthorization(approval, { ...binding, nowMs: Date.now() });
  };
  guard();
  const secret = await credentialPath(arg("migration-password-file") ?? "");
  const password = (await readFile(secret, "utf8")).trim();
  auditCheck(
    password.length >= 20 &&
      password.length <= 512 &&
      !/[\r\n\0]/.test(password),
    "audit_credential_format",
  );
  const pool = new ReadOnlyAuditPool(
    password,
    runId,
    auditAllowedQueries(Object.keys(inputs.pre.preRecoveryRowHashesByTable)),
    guard,
  );
  const audit = await performReadOnlyAudit({
    pool,
    inputs,
    guard,
    remainingMs: remaining,
  });
  guard();
  assertNoRuntime();
  await verifyPreserved(preserved);
  // Configuration, archived-session absence and auth hashes are checked again
  // after the read-only pool has closed, before any PASS evidence is published.
  await reviewedManifest(await auditCodeHashes(inputs.preserved));
  guard();
  const finalHistory = await inspectApprovalHistory();
  await loadPreservationInputs(
    finalHistory.filter((r) => r.path !== approvalPath),
  );
  auditCheck(
    hash(await readFile(approvalPath)) === approvalHash,
    "audit_approval_changed",
  );
  await exclusiveJson(join(output, "row-hashes.sanitized.json"), audit.hashes);
  const result = { ...audit.result, runId, outputDirectory: output };
  await exclusiveJson(join(output, "audit-result.sanitized.json"), result);
  return result;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const operation = process.argv[2] ?? "offline";
  (async () => {
    auditCheck(
      operation === "offline" || operation === "audit",
      "audit_operation_denied",
    );
    console.log(
      JSON.stringify(
        await (operation === "offline" ? auditOffline() : auditLive()),
      ),
    );
  })().catch((error) => {
    const safe = provisionFailure(error, provisionDiagnostics("unknown"));
    console.error(
      JSON.stringify({
        ...safe,
        phase: "preservation-audit",
        reason:
          error instanceof AuditError
            ? error.code
            : safe.reason === "provision_validation_failed"
              ? "audit_validation_failed"
              : safe.reason,
        diagnostic: {
          ...safe.diagnostic,
          operation: "preservation-audit",
          ...(error instanceof AuditError ? { errorClass: "AuditError" } : {}),
        },
      }),
    );
    process.exitCode = 1;
  });
}
