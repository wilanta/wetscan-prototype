import { PlatformDatabase } from "./database";

export async function heartbeatWorker(
  db: PlatformDatabase,
  workerId: string,
  status: "running" | "stopping" | "stopped",
) {
  return db.transaction(async (tx) => {
    db.requireWorker(tx);
    await db.query(
      tx,
      `INSERT INTO platform.worker_heartbeats(module,worker_id,status) VALUES($1,$2,$3)
      ON CONFLICT(module,worker_id) DO UPDATE SET last_seen_at=clock_timestamp(),status=EXCLUDED.status`,
      [db.module, workerId, status],
    );
  });
}
export interface ExpectedMigration {
  version: string;
  checksum: string;
}
export type SchemaStatus =
  | "current"
  | "behind"
  | "checksum_mismatch"
  | "ahead_compatible"
  | "ahead_unverified"
  | "unverified";
export interface SchemaOptions {
  /**
   * Highest migration version the operator has verified as an additive, backward-compatible change for THIS build
   * (`SENTINEL_SCHEMA_AHEAD_ACCEPTED_THROUGH`). Without it a database that is ahead of the code is never healthy.
   */
  acceptAheadThrough?: string;
}
const VERSION = /^\d{4}_[a-z0-9_]+$/;
const num = (v: string) => Number(v.slice(0, 4));
/**
 * Compares the applied ledger with the code's migration plan, overlap first:
 * - every version both sides know must carry the same checksum, else `checksum_mismatch` (unhealthy);
 * - a required version missing from the database is `behind` (unhealthy);
 * - versions only the database knows are `ahead_compatible` (healthy, with a warning) ONLY when they are a gap-free,
 *   well-formed suffix right after the code's last migration AND the operator accepted them through that version;
 *   anything else (gap, out-of-order, malformed, not accepted) is `ahead_unverified` (unhealthy).
 * Never "current" unless every version+checksum agrees exactly.
 */
export function schemaStatus(
  applied: ReadonlyArray<ExpectedMigration>,
  expected?: ReadonlyArray<ExpectedMigration>,
  options: SchemaOptions = {},
): SchemaStatus {
  if (!expected) return "unverified";
  const want = new Map(expected.map((m) => [m.version, m.checksum]));
  const have = new Map(applied.map((m) => [m.version, m.checksum]));
  if (
    applied.some(
      (m) => want.has(m.version) && want.get(m.version) !== m.checksum,
    )
  )
    return "checksum_mismatch";
  if (expected.some((m) => !have.has(m.version))) return "behind";
  const extras = applied
    .filter((m) => !want.has(m.version))
    .sort((x, y) => (x.version < y.version ? -1 : 1));
  if (!extras.length) return "current";
  const last = [...want.keys()].sort().at(-1)!;
  const wellFormed = extras.every(
    (m, i) =>
      VERSION.test(m.version) &&
      /^[a-f0-9]{64}$/.test(m.checksum) &&
      VERSION.test(last) &&
      num(m.version) === num(last) + 1 + i,
  );
  const accepted = options.acceptAheadThrough;
  return wellFormed &&
    accepted !== undefined &&
    VERSION.test(accepted) &&
    accepted >= extras[extras.length - 1].version
    ? "ahead_compatible"
    : "ahead_unverified";
}
/**
 * `expected` (the code's migration plan) lets health report the real schema state; without it the schema is
 * `unverified` and only the foundation migration is checked, as in S01.
 */
export async function platformHealth(
  db: PlatformDatabase,
  workerId?: string,
  expected?: ReadonlyArray<ExpectedMigration>,
  options: SchemaOptions = {},
) {
  try {
    return await db.transaction(async (tx) => {
      db.requireWorker(tx);
      const migration = await db.query(
        tx,
        "SELECT version FROM platform.schema_migrations WHERE version='0001_foundation'",
      );
      if (migration.rows[0]?.version !== "0001_foundation")
        throw new Error("schema_not_ready");
      const ledger = (
        await db.query(
          tx,
          "SELECT version,checksum FROM platform.schema_migrations ORDER BY version",
        )
      ).rows as ExpectedMigration[];
      const schemaState = schemaStatus(ledger, expected, options);
      const planned = new Set(expected?.map((m) => m.version));
      const warnings =
        schemaState === "ahead_compatible"
          ? [
              `schema_ahead_of_code:${ledger
                .filter((m) => !planned.has(m.version))
                .map((m) => m.version)
                .join(",")}`,
            ]
          : [];
      const heartbeat = await db.query(
        tx,
        `SELECT count(*)::int AS fresh FROM platform.worker_heartbeats WHERE module=$1 AND status='running'
        AND last_seen_at>clock_timestamp()-interval '30 seconds' AND ($2::text IS NULL OR worker_id=$2)`,
        [db.module, workerId ?? null],
      );
      const queue = (
        await db.query(
          tx,
          `SELECT count(*) FILTER(WHERE state='queued')::int AS queued,
        count(*) FILTER(WHERE state='leased' AND lease_until>clock_timestamp())::int AS leased,
        count(*) FILTER(WHERE state='leased' AND lease_until<=clock_timestamp())::int AS expired,
        count(*) FILTER(WHERE state='failed')::int AS failed,
        COALESCE(EXTRACT(EPOCH FROM clock_timestamp()-min(available_at) FILTER(WHERE state='queued' AND available_at<=clock_timestamp())),0)::float AS lag_seconds
        FROM platform.jobs WHERE module=$1`,
          [db.module],
        )
      ).rows[0];
      const pending = (
        await db.query(
          tx,
          "SELECT count(*)::int AS n FROM platform.notification_outbox WHERE module=$1 AND state='pending'",
          [db.module],
        )
      ).rows[0].n;
      const fresh = Number(heartbeat.rows[0].fresh) > 0;
      return {
        status:
          fresh &&
          !Number(queue.expired) &&
          !Number(queue.failed) &&
          (schemaState === "current" ||
            schemaState === "unverified" ||
            schemaState === "ahead_compatible")
            ? ("ready" as const)
            : ("degraded" as const),
        database: "connected" as const,
        schema: ledger.at(-1)?.version ?? "0001_foundation",
        schemaStatus: schemaState,
        warnings,
        worker: fresh ? ("running" as const) : ("stale_or_stopped" as const),
        queue: {
          queued: Number(queue.queued),
          leased: Number(queue.leased),
          expired: Number(queue.expired),
          failed: Number(queue.failed),
          lagSeconds: Number(queue.lag_seconds),
        },
        outbox: {
          pending: Number(pending),
          provider: "not_configured" as const,
        },
        telemetry: "not_implemented" as const,
      };
    });
  } catch {
    return {
      status: "unavailable" as const,
      database: "unavailable_or_schema_missing" as const,
      worker: "unknown" as const,
      telemetry: "not_implemented" as const,
    };
  }
}
