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
import { DetectionStore } from "../../src/features/sentinel/detection/store";
import { retainDetection } from "../../src/features/sentinel/detection/retention";
import type { DetectionActivation } from "../../src/features/sentinel/detection/activation";
import type { ResponseActivation } from "../../src/features/sentinel/response/activation";
import { ResponseStore } from "../../src/features/sentinel/response/store";
import { responseJobKinds } from "../../src/features/sentinel/response/model";
import { adapterForTarget } from "../../src/features/sentinel/response/local-rate-limit-adapter";
import { FixtureVerifier } from "../../src/features/sentinel/response/verifier";
import { handleResponseJob } from "./response-handlers";
import { retainNotifications } from "../../src/features/sentinel/notifications/store";
import { retainIncidents } from "../../src/features/sentinel/incidents/retention";
import type { IncidentActivation } from "../../src/features/sentinel/incidents/activation";
import {
  hasValidS04IncidentMigration,
  verifyAcceptanceJobs,
  type AcceptanceIsolation,
} from "./acceptance";
import { assertAdmission } from "../../src/platform/job-admission";
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
  detection?: DetectionActivation;
  incidents?: IncidentActivation;
  /** S05: absent ⇒ the response queue is never created (NO-OP / NOT_CONFIGURED). */
  response?: ResponseActivation;
  env?: Readonly<Record<string, string | undefined>>;
  isolation?: AcceptanceIsolation;
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
    res.end(
      JSON.stringify({
        ...health,
        detection: input.detection
          ? "enabled_for_approved_new_jobs"
          : "disabled_pending_approval",
        maintenance: input.isolation
          ? "paused_for_expiring_local_acceptance"
          : "normal",
        jobAdmission: input.isolation ? "sealed_job_ids" : "normal",
        telemetryIngestion: "web_runtime_not_probed",
        incidents: input.incidents
          ? "enabled_for_approved_new_alerts"
          : migrations.some((m) => m.version === "0004_incidents")
            ? "disabled_pending_approval"
            : "not_implemented",
        response: input.response
          ? "enabled_for_approved_local_fixture"
          : "disabled_pending_approval",
        // Delivery lives in the credential-isolated notifier lane; this worker only produces ledger intents.
        notifications: "delegated_to_isolated_notifier",
      }),
    );
  });
  healthServer.requestTimeout = 5000;
  healthServer.headersTimeout = 5000;
  healthServer.maxConnections = 10;
  let schemaReady = false;
  let pulse = Promise.resolve(),
    work = Promise.resolve();
  let acceptanceDeadline: ReturnType<typeof setTimeout> | undefined;
  try {
    if (
      input.incidents &&
      (!input.detection ||
        !migrations.some((m) => m.version === "0004_incidents") ||
        input.incidents.scope.mode !== input.detection.scope.mode ||
        input.incidents.scope.workspaceId !==
          input.detection.scope.workspaceId ||
        input.incidents.scope.projectId !== input.detection.scope.projectId ||
        !Number.isFinite(Date.parse(input.incidents.notBefore)) ||
        Date.parse(input.incidents.notBefore) <
          Date.parse(input.detection.notBefore))
    )
      throw new PlatformError("approval_required");
    if (
      input.response &&
      (!input.incidents ||
        input.isolation ||
        !migrations.some((m) => m.version === "0005_response") ||
        input.response.scope.workspaceId !==
          input.incidents.scope.workspaceId ||
        input.response.scope.projectId !== input.incidents.scope.projectId ||
        Date.parse(input.response.notBefore) <
          Date.parse(input.incidents.notBefore))
    )
      throw new PlatformError("approval_required");
    if (input.isolation) {
      if (
        !input.detection ||
        (input.isolation.packet === "s04" &&
          (!input.incidents || !hasValidS04IncidentMigration(migrations)))
      )
        throw new PlatformError("approval_required");
      assertAdmission(input.isolation.admission, input.detection.scope);
      await verifyAcceptanceJobs(
        pool,
        input.isolation,
        input.detection,
        workerId,
        input.incidents,
      );
      acceptanceDeadline = setTimeout(
        () => stop.request("acceptance_expired"),
        Math.max(
          1,
          Date.parse(input.isolation.admission.expiresAt) - Date.now(),
        ),
      );
    }
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
          if (!input.isolation)
            await retainWorkerHeartbeats(db, options.retentionDays);
          if (stop.signal.aborted) break;
          const scopes = await registeredScopes(db, cursor);
          cursor = scopes.length === 100 ? scopes.at(-1) : undefined;
          for (const scope of scopes) {
            if (stop.signal.aborted) break;
            if (
              input.detection &&
              (scope.workspaceId !== input.detection.scope.workspaceId ||
                scope.projectId !== input.detection.scope.projectId)
            )
              continue;
            if (input.isolation)
              assertAdmission(input.isolation.admission, scope);
            if (!input.isolation)
              await retainInfrastructure(db, scope, options.retentionDays);
            const detectionReady = migrations.some(
              (m) => m.version === "0003_detection",
            );
            const incidentsReady = migrations.some(
              (m) => m.version === "0004_incidents",
            );
            if (incidentsReady && !input.isolation)
              await retainIncidents(db, scope);
            if (
              !input.isolation &&
              migrations.some((m) => m.version === "0006_notifications")
            )
              await retainNotifications(db, scope);
            if (detectionReady && !input.isolation)
              await retainDetection(db, scope, incidentsReady);
            if (
              !input.isolation &&
              migrations.some((m) => m.version === "0002_telemetry")
            )
              await retainTelemetry(db, scope, detectionReady, incidentsReady);
            if (stop.signal.aborted) break;
            if (
              input.response &&
              scope.workspaceId === input.response.scope.workspaceId &&
              scope.projectId === input.response.scope.projectId
            ) {
              const store = new ResponseStore(db);
              const env = input.env ?? process.env;
              await store.ensureReconcile(scope);
              const rq = new PostgresQueue(
                db,
                scope,
                Object.values(responseJobKinds),
                input.response.notBefore,
              );
              const rl = await rq.claim({
                module: "sentinel",
                workerId,
                limit: options.concurrency,
                leaseMs: options.leaseMs,
              });
              await Promise.all(
                rl.map((lease) =>
                  executeLease(
                    rq,
                    lease,
                    (job, signal) =>
                      handleResponseJob(job, signal, {
                        store,
                        adapter: (t) => adapterForTarget(env, t),
                        verifier: (t) =>
                          new FixtureVerifier({ origin: t.origin }),
                      }),
                    {
                      heartbeatMs: options.heartbeatMs,
                      timeoutMs: options.timeoutMs,
                      signal: stop.signal,
                    },
                  ),
                ),
              );
            }
            const claimNotBefore =
              input.isolation?.packet === "s04" && input.incidents
                ? input.incidents.notBefore
                : input.detection?.notBefore;
            const queue = new PostgresQueue(
              db,
              scope,
              input.detection
                ? ["sentinel.telemetry.accepted"]
                : ["sentinel.maintenance"],
              claimNotBefore,
              input.isolation?.admission,
            );
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
                  async (job, signal, currentLease) => {
                    if (signal.aborted) throw new Error("stopping");
                    if (input.isolation)
                      assertAdmission(
                        input.isolation.admission,
                        job,
                        job.jobId,
                      );
                    if (job.kind === "sentinel.telemetry.accepted") {
                      if (!input.detection || !detectionReady)
                        throw new PlatformError("scope_denied");
                      await new DetectionStore(db).process(
                        currentLease(),
                        signal,
                        {
                          correlateIncidents: Boolean(
                            input.incidents && incidentsReady,
                          ),
                        },
                      );
                      return;
                    }
                    if (input.isolation)
                      throw new PlatformError("scope_denied");
                    await retainInfrastructure(db, job, options.retentionDays);
                    if (incidentsReady) await retainIncidents(db, job);
                    if (detectionReady)
                      await retainDetection(db, job, incidentsReady);
                    if (migrations.some((m) => m.version === "0002_telemetry"))
                      await retainTelemetry(
                        db,
                        job,
                        detectionReady,
                        incidentsReady,
                      );
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
          if (input.isolation) {
            stop.request(
              Date.now() >= Date.parse(input.isolation.admission.expiresAt)
                ? "acceptance_expired"
                : "acceptance_failure",
            );
            throw new PlatformError("scope_denied");
          }
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
    if (acceptanceDeadline) clearTimeout(acceptanceDeadline);
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
