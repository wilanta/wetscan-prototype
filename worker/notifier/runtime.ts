import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { PlatformError, type workerConfig } from "../../src/platform/config";
import type { PlatformDatabase, SqlPool } from "../../src/platform/database";
import type { Migration } from "../../src/platform/migrations";
import { PostgresQueue } from "../../src/platform/queue";
import { executeLease } from "../sentinel/executor";
import {
  closeHealthServer,
  ShutdownCoordinator,
  within,
  type WorkerControl,
} from "../sentinel/lifecycle";
import { processLease } from "./handler";
import { SenderStore } from "../../src/features/sentinel/notifications/sender-store";
import {
  notificationJobKind,
  type NotificationChannel,
  type SenderPort,
} from "../../src/features/sentinel/notifications/model";
import type { NotificationActivation } from "../../src/features/sentinel/notifications/activation";

export interface NotifierEvent {
  event: "notifier_lifecycle";
  phase: "started" | "shutdown_requested" | "stopped" | "shutdown_failed";
  pid: number;
  workerId: string;
  reason?: string;
  port?: number;
}
/** Credential-isolated sender lane. Holds provider adapters; the main Sentinel worker holds none. */
export async function runNotifier(input: {
  db: PlatformDatabase;
  pool: SqlPool;
  migrations: Migration[];
  options: ReturnType<typeof workerConfig>;
  activation: NotificationActivation;
  senders: ReadonlyMap<NotificationChannel, SenderPort>;
  workerId: string;
  control: WorkerControl;
  healthPort: number;
  once?: boolean;
  report: (event: NotifierEvent) => void;
}) {
  const {
    db,
    pool,
    migrations,
    options,
    activation,
    senders,
    workerId,
    control,
  } = input;
  const emit = (
    phase: NotifierEvent["phase"],
    extra: Partial<NotifierEvent> = {},
  ) =>
    input.report({
      event: "notifier_lifecycle",
      phase,
      pid: process.pid,
      workerId,
      ...extra,
    });
  const stop = new ShutdownCoordinator(control, (reason) =>
    emit("shutdown_requested", { reason }),
  );
  const health = createServer((req, res) => {
    if (req.method !== "GET" || req.url !== "/health") {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(stop.signal.aborted ? 503 : 200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    // Presence of adapters only; never a token, destination or ledger content.
    res.end(
      JSON.stringify({
        status: stop.signal.aborted ? "stopping" : "ready",
        lane: "notifier",
        channels: Object.fromEntries(
          activation.channels.map((c) => [
            c,
            senders.has(c) ? "adapter_loaded" : "not_configured",
          ]),
        ),
        whatsapp: "requires_business_setup",
      }),
    );
  });
  health.requestTimeout = 5000;
  health.headersTimeout = 5000;
  health.maxConnections = 10;
  const queue = new PostgresQueue(
    db,
    activation.scope,
    [notificationJobKind],
    activation.notBefore,
  );
  const store = new SenderStore(db, queue);
  let work = Promise.resolve();
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
          (r, i) =>
            r.version !== migrations[i].version ||
            r.checksum !== migrations[i].checksum,
        )
      )
        throw new PlatformError("target_denied");
    });
    if (stop.signal.aborted) return;
    await new Promise<void>((resolve, reject) => {
      health.once("error", reject);
      health.listen(input.healthPort, "127.0.0.1", resolve);
    });
    const address = health.address();
    emit("started", {
      port:
        typeof address === "object" && address
          ? address.port
          : input.healthPort,
    });
    work = (async () => {
      while (!stop.signal.aborted) {
        try {
          await store.sweep(activation.scope);
          const leases = await queue.claim({
            module: "sentinel",
            workerId,
            limit: Math.min(options.concurrency, 2),
            leaseMs: options.leaseMs,
          });
          await Promise.all(
            leases.map((lease) =>
              executeLease(
                queue,
                lease,
                (_job, signal, current) =>
                  processLease(store, senders, current, signal),
                {
                  heartbeatMs: options.heartbeatMs,
                  timeoutMs: options.timeoutMs,
                  signal: stop.signal,
                },
              ),
            ),
          );
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
        const closed = closeHealthServer(health);
        try {
          await within(Promise.allSettled([work]), Math.min(5000, remaining()));
          await within(closed, remaining());
        } finally {
          await within(pool.end(), remaining());
        }
      });
      emit("stopped");
    } catch {
      emit("shutdown_failed", { reason: "cleanup_failed_or_deadline" });
      throw new Error("notifier_shutdown_failed");
    } finally {
      stop.dispose();
    }
  }
}
