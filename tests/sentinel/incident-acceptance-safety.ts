import { realpath, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { isAbsolute, resolve, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import type { QueryResultRow } from "pg";
import {
  parseApproval,
  PlatformError,
  type ApprovedAction,
  type DatabaseApproval,
  type Target,
} from "../../src/platform/config";
import type { SqlClient, SqlPool } from "../../src/platform/database";
import {
  applyMigrations,
  type Migration,
} from "../../src/platform/migrations";
import type { EvidenceSnapshot } from "./telemetry-retest-safety";
import { uuid, object } from "../../src/features/sentinel/telemetry/validation";

export const reviewedS04Plan =
  "3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7";

export const s04TestTarget: Target = {
  host: "127.0.0.1",
  port: 55432,
  database: "wetscan_s01_test",
  marker: "wetscan-s01:9f3560a6-127f-42a6-abaf-9f45951e6bd5",
};

export const s04RequiredApprovalActions: readonly ApprovedAction[] = [
  "integration_test",
  "migrate_up",
];

export function snapshotDigest(snapshot: EvidenceSnapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export const s04ApprovedOperations = [
  "up_up",
  "new_fixtures",
  "correlate_fixture_alerts",
  "status_transitions",
  "retention_pins",
  "negative_dml_rollback",
  "populated_down_refusal",
] as const;

export const s04DownRefusalLockTimeoutSql = "SET LOCAL lock_timeout = '3000ms'";

export const s04DownRefusalAllowedSql: ReadonlySet<string> = new Set([
  "BEGIN",
  "ROLLBACK",
  "SELECT pg_advisory_xact_lock(7342001)",
  "SELECT to_regclass('platform.schema_migrations') AS ledger,to_regnamespace('platform') AS platform,to_regnamespace('sentinel') AS sentinel",
  "SELECT version,checksum FROM platform.schema_migrations ORDER BY version",
  "LOCK TABLE sentinel.incident_timeline_evidence,sentinel.incident_timeline,sentinel.incident_evidence,sentinel.incident_alerts,sentinel.incidents,sentinel.detection_alerts,sentinel.detection_evidence,sentinel.telemetry_events,platform.jobs IN ACCESS EXCLUSIVE MODE",
  "SELECT EXISTS(SELECT 1 FROM sentinel.incident_timeline_evidence LIMIT 1) AS occupied",
  "SELECT EXISTS(SELECT 1 FROM sentinel.incident_timeline LIMIT 1) AS occupied",
  "SELECT EXISTS(SELECT 1 FROM sentinel.incident_evidence LIMIT 1) AS occupied",
  "SELECT EXISTS(SELECT 1 FROM sentinel.incident_alerts LIMIT 1) AS occupied",
  "SELECT EXISTS(SELECT 1 FROM sentinel.incidents LIMIT 1) AS occupied",
]);

export function isAllowedS04DownRefusalSql(
  sql: string,
  values?: unknown[],
): boolean {
  if (values !== undefined && values.length > 0) return false;
  if (
    /\b(DROP|DELETE|TRUNCATE|ALTER|INSERT|UPDATE|CREATE|GRANT|REVOKE|COMMIT|COPY|VACUUM)\b/i.test(
      sql,
    )
  )
    return false;
  return s04DownRefusalAllowedSql.has(sql);
}

export interface S04DownRefusalAudit {
  statements: string[];
  blockedStatements: string[];
  lockTimeoutConfigured: boolean;
  inTransaction: boolean;
  clientReleased: boolean;
  destroyedOnRelease: boolean;
}

export function createS04DownRefusalPool(pool: SqlPool): {
  pool: SqlPool;
  audit: S04DownRefusalAudit;
} {
  const audit: S04DownRefusalAudit = {
    statements: [],
    blockedStatements: [],
    lockTimeoutConfigured: false,
    inTransaction: false,
    clientReleased: false,
    destroyedOnRelease: false,
  };
  const guarded: SqlPool = {
    connect: async () => {
      const c = await pool.connect();
      const client: SqlClient = {
        async query<R extends QueryResultRow = QueryResultRow>(
          sql: string,
          values?: unknown[],
        ): Promise<{ rows: R[]; rowCount: number | null }> {
          if (!isAllowedS04DownRefusalSql(sql, values)) {
            audit.blockedStatements.push(sql);
            throw new Error("blocked_unapproved_down_sql");
          }
          const result = await c.query<R>(sql, values);
          audit.statements.push(sql);
          if (sql === "BEGIN") {
            audit.inTransaction = true;
            try {
              await c.query(s04DownRefusalLockTimeoutSql);
              audit.lockTimeoutConfigured = true;
            } catch (error) {
              try {
                await c.query("ROLLBACK");
                audit.statements.push("ROLLBACK");
                audit.inTransaction = false;
              } catch {
                /* release(true) will destroy the session */
              }
              throw error;
            }
          } else if (sql === "ROLLBACK") {
            audit.inTransaction = false;
          }
          return result;
        },
        release: (destroy) => {
          const forceDestroy = Boolean(destroy) || audit.inTransaction;
          audit.clientReleased = true;
          audit.destroyedOnRelease = forceDestroy;
          c.release(forceDestroy);
        },
      };
      return client;
    },
    end: async () => {},
  };
  return { pool: guarded, audit };
}

export function assertS04DownRefusalAudit(
  caught: unknown,
  audit: S04DownRefusalAudit,
): S04DownRefusalAudit {
  if (!(caught instanceof PlatformError) || caught.code !== "target_denied") {
    throw new Error(
      caught instanceof Error
        ? `unexpected_down_refusal_outcome:${caught.message}`
        : "expected_target_denied_not_thrown",
    );
  }
  if (
    audit.blockedStatements.length > 0 ||
    !audit.lockTimeoutConfigured ||
    !audit.clientReleased ||
    audit.inTransaction ||
    audit.destroyedOnRelease ||
    audit.statements[0] !== "BEGIN" ||
    audit.statements.at(-1) !== "ROLLBACK" ||
    !audit.statements.includes("SELECT pg_advisory_xact_lock(7342001)") ||
    !audit.statements.some((s) =>
      s.startsWith("LOCK TABLE sentinel.incident_timeline_evidence,"),
    ) ||
    !audit.statements.some((s) =>
      /^SELECT EXISTS\(SELECT 1 FROM sentinel\.incident_[a-z_]+ LIMIT 1\) AS occupied$/.test(
        s,
      ),
    ) ||
    audit.statements.some((s) =>
      /\b(DROP|DELETE|TRUNCATE|ALTER|INSERT|UPDATE|CREATE|GRANT|REVOKE|COMMIT)\b/i.test(
        s,
      ),
    )
  ) {
    throw new Error("invalid_down_refusal_audit");
  }
  return audit;
}

export async function verifyPopulatedS04DownRefusal(
  pool: SqlPool,
  migrations: Migration[],
): Promise<S04DownRefusalAudit> {
  const { pool: guarded, audit } = createS04DownRefusalPool(pool);
  let caught: unknown;
  try {
    await applyMigrations(guarded, migrations, "down");
  } catch (error) {
    caught = error;
  }
  return assertS04DownRefusalAudit(caught, audit);
}

export async function incidentAcceptancePermission(
  approval: DatabaseApproval & { s04Acceptance?: unknown },
) {
  parseApproval(approval, s04TestTarget, "integration_test", reviewedS04Plan);
  parseApproval(approval, s04TestTarget, "migrate_up", reviewedS04Plan);
  if (
    !Array.isArray(approval.actions) ||
    approval.actions.length !== s04RequiredApprovalActions.length ||
    s04RequiredApprovalActions.some((a) => !approval.actions.includes(a)) ||
    approval.actions.some((a) => !s04RequiredApprovalActions.includes(a))
  )
    throw new PlatformError("approval_required");
  const raw = (approval as DatabaseApproval & { s04Acceptance?: unknown })
    .s04Acceptance;
  const p = object(raw, [
    "fixtureId",
    "baselineSha256",
    "backupFile",
    "backupSha256",
    "operations",
  ]);
  const fixtureId = uuid(p.fixtureId);
  if (
    typeof p.baselineSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(p.baselineSha256) ||
    typeof p.backupFile !== "string" ||
    !isAbsolute(p.backupFile) ||
    typeof p.backupSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(p.backupSha256) ||
    JSON.stringify(p.operations) !== JSON.stringify(s04ApprovedOperations)
  )
    throw new PlatformError("approval_required");
  const path = await realpath(resolve(p.backupFile)),
    rel = relative(process.cwd(), path);
  const outside = isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`);
  if (!outside || /onedrive/i.test(path))
    throw new PlatformError("target_denied");
  if (!(await stat(path)).isFile())
    throw new PlatformError("approval_required");
  const info = await stat(path),
    digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  if (!info.size || digest.digest("hex") !== p.backupSha256)
    throw new PlatformError("approval_required");
  return {
    fixtureId,
    workspaceId: `github-user-7:s04-${fixtureId}`,
    baselineSha256: p.baselineSha256,
  };
}

export function preserveS03(before: EvidenceSnapshot, after: EvidenceSnapshot) {
  for (const [table, hashes] of Object.entries(before.rows)) {
    const retained = (after.rows[table] ?? []).slice();
    for (const hash of hashes) {
      const at = retained.indexOf(hash);
      if (at < 0) throw Error("historical_row_changed:" + table);
      retained.splice(at, 1);
    }
  }
  const oldTables = new Set(
    before.structure.catalog.map((r) => `${r.nspname}.${r.relname}`),
  );
  if (
    JSON.stringify(before.ledger) !==
      JSON.stringify(after.ledger.slice(0, before.ledger.length)) ||
    JSON.stringify(before.structure.roles) !==
      JSON.stringify(after.structure.roles)
  )
    throw Error("historical_identity_or_ledger_changed");
  for (const type of ["catalog", "policies", "grants"] as const) {
    const key = (r: Record<string, unknown>) =>
      type === "catalog"
        ? `${r.nspname}.${r.relname}`
        : type === "policies"
          ? `${r.schemaname}.${r.tablename}`
          : `${r.table_schema}.${r.table_name}`;
    const selected = after.structure[type].filter((r) => oldTables.has(key(r)));
    if (JSON.stringify(before.structure[type]) !== JSON.stringify(selected))
      throw Error("historical_catalog_or_permissions_changed:" + type);
  }
}

export interface FullS04Snapshot {
  rows: Record<string, string[]>;
  counts: Record<string, number>;
  ledger: Array<{ version: string; checksum: string; applied_at: string }>;
  catalogCount: number;
  activeLeases: number;
}

const hashJsonRow = (s: string) =>
  createHash("sha256").update(s).digest("hex");

/** Read-only 25-table snapshot covering S01-S04 tables to protect both historical S01-S03 data and committed H04B fixtures. */
export async function fullS04EvidenceSnapshot(
  pool: SqlPool,
): Promise<FullS04Snapshot> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const existingTables = (
      await client.query(
        "SELECT n.nspname||'.'||c.relname AS name FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname IN ('sentinel','platform') AND c.relkind='r' ORDER BY 1",
      )
    ).rows.map((r) => String(r.name));
    const tableSet = new Set(existingTables);
    const rows: Record<string, string[]> = {};
    for (const table of existingTables) {
      rows[table] = (
        await client.query(
          `SELECT to_jsonb(t)::text AS value FROM ${table} t ORDER BY to_jsonb(t)::text`,
        )
      ).rows.map((r) => hashJsonRow(String(r.value)));
    }
    const ledger = (
      await client.query(
        "SELECT version,checksum,applied_at::text AS applied_at FROM platform.schema_migrations ORDER BY version",
      )
    ).rows as Array<{ version: string; checksum: string; applied_at: string }>;
    const activeLeases = tableSet.has("platform.jobs")
      ? Number(
          (
            await client.query(
              "SELECT count(*)::int AS n FROM platform.jobs WHERE state='leased' AND lease_until>clock_timestamp()",
            )
          ).rows[0]?.n ?? 0,
        )
      : 0;
    await client.query("COMMIT");
    return {
      rows,
      counts: Object.fromEntries(
        Object.entries(rows).map(([k, v]) => [k, v.length]),
      ),
      ledger,
      catalogCount: existingTables.length,
      activeLeases,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Verifies every pre-existing row hash across all S01-S04 tables and migration ledger entries remain intact. */
export function preserveAllS04CommittedRows(
  before: FullS04Snapshot,
  after: FullS04Snapshot,
): void {
  if (JSON.stringify(before.ledger) !== JSON.stringify(after.ledger)) {
    throw Error("historical_ledger_changed");
  }
  for (const [table, hashes] of Object.entries(before.rows)) {
    const remaining = (after.rows[table] ?? []).slice();
    for (const hash of hashes) {
      const idx = remaining.indexOf(hash);
      if (idx < 0) throw Error(`historical_or_accepted_row_changed:${table}`);
      remaining.splice(idx, 1);
    }
  }
}
