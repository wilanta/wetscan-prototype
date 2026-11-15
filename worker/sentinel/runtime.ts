import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { PlatformError, type workerConfig } from "../../src/platform/config";
import type { PlatformDatabase, SqlPool } from "../../src/platform/database";
import { heartbeatWorker, platformHealth } from "../../src/platform/health";
import type { Migration } from "../../src/platform/migrations";
import { PostgresQueue } from "../../src/platform/queue";
import {
  retainInfrastructure,
  retainWorkerHeartbeats,
} from "../../src/platform/retention";
import { registeredScopes } from "../../src/features/sentinel/storage/projects";
import type { SentinelScope } from "../../src/features/sentinel/types";
import { executeLease } from "./executor";
import { retainTelemetry } from "../../src/features/sentinel/telemetry/store";
import {
  closeHealthServer,
  ShutdownCoordinator,
  within,
  type WorkerControl,
} from "./lifecycle";

export interface LifecycleEvent {
  event: "sentinel_lifecycle";
  phase: "started" | "shutdown_requested" | "stopped" | "shutdown_failed";
  pid: number;
  workerId: string;
  elapsedMs: number;
  reason?: string;
  port?: number;
}
export async function runSentinelWorker(input: {
  db: PlatformDatabase;
  pool: SqlPool;
  migrations: Migration[];
  options: ReturnType<typeof workerConfig>;
  workerId: string;
  control: WorkerControl;
  once?: boolean;
  report: (event: LifecycleEvent) => void;
}) {
  const { db, pool, migrations, options, workerId, control, report } = input;
  const started = Date.now();
  const emit = (
    phase: LifecycleEvent["phase"],
    extra: Partial<LifecycleEvent> = {},
  ) =>
    report({
      event: "sentinel_lifecycle",
      phase,
      pid: process.pid,
      workerId,
      elapsedMs: Date.now() - started,
      ...extra,
    });
  const stop = new ShutdownCoordinator(control, (reason) =>
    emit("shutdown_requested", { reason }),
  );
  const healthServer = createServer(async (req, res) => {
    if (req.method !== "GET" || req.url !== "/health") {
      res.writeHead(404);
      res.end();
      return;
    }
    if (stop.signal.aborted) {
      res.writeHead(503);
      res.end(JSON.stringify({ status: "stopping" }));
      return;
    }
    const health = await platformHealth(db, workerId);
    res.writeHead(health.status === "ready" ? 200 : 503, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(health));
  });
  healthServer.requestTimeout = 5000;
  healthServer.headersTimeout = 5000;
  healthServer.maxConnections = 10;
  let schemaReady = false;
  let pulse = Promise.resolve(),
    work = Promise.resolve();
  try {
    await db.transaction(async (tx) => {
      const rows = (
        await db.query(
          tx,
          "SELECT version,checksum FROM platform.schema_migrations ORDER BY version",
        )
      ).rows;
      if (
        rows.length !== migrations.length ||
        rows.some(
          (row, i) =>
            row.version !== migrations[i].version ||
            row.checksum !== migrations[i].checksum,
        )
      )
        throw new PlatformError("target_denied");
    });
    schemaReady = true;
    if (stop.signal.aborted) return;
    await new Promise<void>((resolve, reject) => {
      healthServer.once("error", reject);
      healthServer.listen(options.healthPort, "127.0.0.1", resolve);
    });
    const address = healthServer.address();
    emit("started", {
      port:
        typeof address === "object" && address
          ? address.port
          : options.healthPort,
    });
    pulse = (async () => {
      while (!stop.signal.aborted) {
        try {
          await heartbeatWorker(db, workerId, "running");
        } catch {
          /* Health reports DB failure. */
        }
        try {
          await delay(options.heartbeatMs, undefined, { signal: stop.signal });
        } catch {
          break;
        }
      }
    })();
    work = (async () => {
      let cursor: SentinelScope | undefined;
      while (!stop.signal.aborted) {
        try {
          await retainWorkerHeartbeats(db, options.retentionDays);
          if (stop.signal.aborted) break;
          const scopes = await registeredScopes(db, cursor);
          cursor = scopes.length === 100 ? scopes.at(-1) : undefined;
          for (const scope of scopes) {
            if (stop.signal.aborted) break;
            await retainInfrastructure(db, scope, options.retentionDays);
            if (migrations.some((m) => m.version === "0002_telemetry"))
              await retainTelemetry(db, scope);
            if (stop.signal.aborted) break;
            const queue = new PostgresQueue(db, scope, [
              "sentinel.maintenance",
            ]);
            const leases = await queue.claim({
              module: "sentinel",
              workerId,
              limit: options.concurrency,
              leaseMs: options.leaseMs,
            });
            await Promise.all(
              leases.map((lease) =>
                executeLease(
                  queue,
                  lease,
                  async (job, signal) => {
                    if (signal.aborted) throw new Error("stopping");
                    await retainInfrastructure(db, job, options.retentionDays);
                    if (migrations.some((m) => m.version === "0002_telemetry"))
                      await retainTelemetry(db, job);
                  },
                  {
                    heartbeatMs: options.heartbeatMs,
                    timeoutMs: options.timeoutMs,
                    signal: stop.signal,
                  },
                ),
              ),
            );
          }
        } catch {
          if (input.once) throw new PlatformError("database_unavailable");
          console.warn(
            JSON.stringify({
              status: "degraded",
              reason: "database_or_schema_unavailable",
            }),
          );
        }
        if (input.once || stop.signal.aborted) break;
        try {
          await delay(options.pollMs, undefined, { signal: stop.signal });
        } catch {
          break;
        }
      }
    })();
    // A pending DB/handler operation must not postpone entering bounded cleanup.
    const requested = new Promise<void>((resolve) => {
      if (stop.signal.aborted) resolve();
      else
        stop.signal.addEventListener("abort", () => resolve(), { once: true });
    });
    await Promise.race([work, requested]);
  } finally {
    stop.request("completed");
    try {
      await stop.finish(async () => {
        const deadline = Date.now() + 9000;
        const remaining = () => Math.max(1, deadline - Date.now());
        const httpClosed = closeHealthServer(healthServer);
        try {
          await within(
            Promise.allSettled([work, pulse]),
            Math.min(5000, remaining()),
          );
          await within(httpClosed, remaining());
          if (schemaReady)
            await within(
              heartbeatWorker(db, workerId, "stopped"),
              Math.min(2000, remaining()),
            );
        } finally {
          await within(pool.end(), remaining());
        }
      });
      emit("stopped");
    } catch {
      emit("shutdown_failed", { reason: "cleanup_failed_or_deadline" });
      throw new Error("worker_shutdown_failed");
    } finally {
      stop.dispose();
    }
  }
}
