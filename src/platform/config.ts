import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";

export type Purpose = "app" | "worker" | "migration";
export type ApprovedAction =
  "runtime" | "migrate_up" | "migrate_down" | "integration_test";
export type Environment = Readonly<Record<string, string | undefined>>;
export interface Target {
  host: string;
  port: number;
  database: string;
  marker: string;
}
export interface DatabaseApproval {
  schemaVersion: 1;
  status: "APPROVED";
  approvedBy: string;
  approvedAt: string;
  target: Target;
  actions: ApprovedAction[];
  migrationPlanSha256: string;
}
export class PlatformError extends Error {
  constructor(
    public readonly code:
      | "not_configured"
      | "approval_required"
      | "target_denied"
      | "invalid_input"
      | "scope_denied"
      | "idempotency_conflict"
      | "lease_lost"
      | "database_unavailable",
  ) {
    super(code);
  }
}
export const roleNames = {
  app: "wetscan_app",
  worker: "wetscan_sentinel_worker",
  migration: "wetscan_migrator",
} as const;
export function integer(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new PlatformError("invalid_input");
  return n;
}
export function parseApproval(
  value: unknown,
  target: Target,
  action: ApprovedAction,
  plan?: string,
): DatabaseApproval {
  const a = value as DatabaseApproval | undefined;
  if (
    !a ||
    a.schemaVersion !== 1 ||
    a.status !== "APPROVED" ||
    typeof a.approvedBy !== "string" ||
    !a.approvedBy.trim() ||
    !Number.isFinite(Date.parse(a.approvedAt)) ||
    Date.parse(a.approvedAt) > Date.now() + 60000 ||
    !Array.isArray(a.actions) ||
    !a.actions.includes(action)
  )
    throw new PlatformError("approval_required");
  if (
    !a.target ||
    !["127.0.0.1", "localhost"].includes(target.host) ||
    !/^wetscan_(dev|s01_test)(_[a-z0-9]+)?$/.test(target.database) ||
    !/^wetscan-s01:[a-f0-9-]{36}$/.test(target.marker) ||
    (["host", "port", "database", "marker"] as const).some(
      (k) => a.target[k] !== target[k],
    )
  )
    throw new PlatformError("target_denied");
  if (
    plan !== undefined &&
    (!/^[a-f0-9]{64}$/.test(plan) || a.migrationPlanSha256 !== plan)
  )
    throw new PlatformError("approval_required");
  if (
    action === "integration_test" &&
    !target.database.startsWith("wetscan_s01_test")
  )
    throw new PlatformError("target_denied");
  return a;
}
export interface ApprovedDatabaseConfig {
  target: Target;
  purpose: Purpose;
  user: string;
  password: string;
  max: number;
  approval: DatabaseApproval;
}
/** No ambient PG variables or connection strings are used. */
export async function approvedDatabaseConfig(
  env: Environment,
  purpose: Purpose,
  action: ApprovedAction = "runtime",
  plan?: string,
): Promise<ApprovedDatabaseConfig> {
  const approvalFile = env.SENTINEL_DB_APPROVAL_FILE;
  const secretFile = env[`SENTINEL_DB_${purpose.toUpperCase()}_PASSWORD_FILE`];
  if (!approvalFile || !secretFile) throw new PlatformError("not_configured");
  if (!isAbsolute(approvalFile) || !isAbsolute(secretFile))
    throw new PlatformError("invalid_input");
  const target: Target = {
    host: env.SENTINEL_DB_HOST ?? "127.0.0.1",
    port: integer(env.SENTINEL_DB_PORT, 55432, 1024, 65535),
    database: env.SENTINEL_DB_NAME ?? "wetscan_dev",
    marker: env.SENTINEL_DB_MARKER ?? "",
  };
  let approval: DatabaseApproval;
  try {
    approval = parseApproval(
      JSON.parse(await readFile(approvalFile, "utf8")),
      target,
      action,
      plan,
    );
  } catch (error) {
    if (error instanceof PlatformError) throw error;
    throw new PlatformError("approval_required");
  }
  let password: string;
  try {
    password = (await readFile(secretFile, "utf8")).trim();
  } catch {
    throw new PlatformError("not_configured");
  }
  if (
    password.length < 20 ||
    password.length > 512 ||
    /[\r\n\0]/.test(password)
  )
    throw new PlatformError("invalid_input");
  return {
    target,
    purpose,
    user: roleNames[purpose],
    password,
    max: purpose === "app" ? 5 : purpose === "migration" ? 1 : 3,
    approval,
  };
}
export function workerConfig(env: Environment) {
  return {
    concurrency: integer(env.SENTINEL_WORKER_CONCURRENCY, 2, 1, 2),
    pollMs: integer(env.SENTINEL_WORKER_POLL_MS, 1000, 100, 30000),
    leaseMs: integer(env.SENTINEL_JOB_LEASE_MS, 30000, 5000, 120000),
    heartbeatMs: integer(env.SENTINEL_WORKER_HEARTBEAT_MS, 10000, 100, 30000),
    timeoutMs: integer(env.SENTINEL_JOB_TIMEOUT_MS, 20000, 100, 60000),
    healthPort: integer(env.SENTINEL_WORKER_HEALTH_PORT, 3112, 1024, 65535),
    retentionDays: integer(env.SENTINEL_PLATFORM_RETENTION_DAYS, 30, 1, 90),
  };
}
