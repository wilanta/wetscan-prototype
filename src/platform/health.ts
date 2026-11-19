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
  "current" | "behind" | "checksum_mismatch" | "unknown_version" | "unverified";
/** Compares the applied ledger with the code's migration plan. Never "current" unless every version+checksum agrees. */
export function schemaStatus(
  applied: ReadonlyArray<ExpectedMigration>,
  expected?: ReadonlyArray<ExpectedMigration>,
): SchemaStatus {
  if (!expected) return "unverified";
  const want = new Map(expected.map((m) => [m.version, m.checksum]));
  if (applied.some((m) => !want.has(m.version))) return "unknown_version";
  if (applied.some((m) => want.get(m.version) !== m.checksum))
    return "checksum_mismatch";
  return applied.length < want.size ? "behind" : "current";
}
/**
 * `expected` (the code's migration plan) lets health report the real schema state; without it the schema is
 * `unverified` and only the foundation migration is checked, as in S01.
 */
export async function platformHealth(
  db: PlatformDatabase,
  workerId?: string,
  expected?: ReadonlyArray<ExpectedMigration>,
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
      const schemaState = schemaStatus(ledger, expected);
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
          (schemaState === "current" || schemaState === "unverified")
            ? ("ready" as const)
            : ("degraded" as const),
        database: "connected" as const,
        schema: ledger.at(-1)?.version ?? "0001_foundation",
        schemaStatus: schemaState,
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
