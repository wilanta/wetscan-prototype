import { guardPreparationTiming } from "./timing";
import { setTimeout as delay } from "node:timers/promises";
import type { WorkerControl } from "../sentinel/lifecycle";
import { within } from "../sentinel/lifecycle";
import { executeLease } from "../sentinel/executor";
import type { LeaseAwareJobHandler } from "../sentinel/executor";
import type { DurableJobPort } from "../../src/features/sentinel/platform-contracts";
import type { Scope } from "../../src/features/guard/contracts";
import { LiveGuardError } from "../../src/features/guard/live/model";
export interface GuardWorkerDependencies {
  workerId: string;
  control: WorkerControl;
  scopes(): Promise<Scope[]>;
  queue(scope: Scope): DurableJobPort;
  handler: LeaseAwareJobHandler;
  verifyReady(): Promise<void>;
  close(): Promise<void>;
  report(event: { module: "guard"; phase: string; reason?: string }): void;
  once?: boolean;
  /** Trusted G01 acceptance composition only; prepare_only keeps its default budget. */
  handlerTimeoutMs?: number;
}
/** Guard-owned lifecycle/channel; shared S01 executor and bounded drain, no Sentinel scheduler or handlers. */
export async function runGuardWorker(input: GuardWorkerDependencies) {
  if (input.handlerTimeoutMs!==undefined && (!Number.isInteger(input.handlerTimeoutMs) || input.handlerTimeoutMs<guardPreparationTiming.handlerMs || input.handlerTimeoutMs>120000)) throw new LiveGuardError("invalid_input");
  const stop = new AbortController();
  const listeners: [string, (...args: unknown[]) => void][] = [];
  const listen = (name: string, fn: (...args: unknown[]) => void) => {
    input.control.on(name, fn);
    listeners.push([name, fn]);
  };
  const requestStop = () => {
    if (!stop.signal.aborted) {
      stop.abort();
      input.report({ module: "guard", phase: "stopping" });
    }
  };
  for (const signal of [
    "SIGINT",
    "SIGTERM",
    ...(process.platform === "win32" ? ["SIGBREAK"] : []),
  ])
    listen(signal, requestStop);
  if (input.control.connected) {
    listen("message", (value) => {
      if (
        value &&
        typeof value === "object" &&
        "type" in value &&
        value.type === "guard.shutdown" &&
        "version" in value &&
        value.version === 1
      )
        requestStop();
    });
    listen("disconnect", requestStop);
  }
  const inFlight = new Set<Promise<void>>();
  const trackedHandler: LeaseAwareJobHandler = (job, signal, currentLease) => {
    const task = Promise.resolve().then(() =>
      input.handler(job, signal, currentLease),
    );
    inFlight.add(task);
    void task.finally(() => inFlight.delete(task)).catch(() => undefined);
    return task;
  };
  let work: Promise<void> | undefined;
  try {
    await input.verifyReady();
    input.report({ module: "guard", phase: "started" });
    work = (async () => {
      while (!stop.signal.aborted) {
        try {
          const scopes = await input.scopes();
          if (scopes.length > 100)
            throw new LiveGuardError("invalid_input", 400);
          for (const scope of scopes) {
            if (stop.signal.aborted) break;
            if (scope.mode !== "live")
              throw new LiveGuardError("not_found", 404);
            const queue = input.queue(scope),
              leases = await queue.claim({
                module: "guard",
                workerId: input.workerId,
                limit: 1,
                leaseMs: 30000,
              });
            if (
              leases.some(
                (l) =>
                  l.job.module !== "guard" ||
                  l.job.kind !== "guard.scan.prepare" ||
                  l.job.mode !== scope.mode ||
                  l.job.workspaceId !== scope.workspaceId ||
                  l.job.projectId !== scope.projectId,
              )
            )
              throw new LiveGuardError("lease_lost", 409);
            for (const lease of leases) {
              if (stop.signal.aborted) break;
              await executeLease(queue, lease, trackedHandler, {
                signal: stop.signal,
                heartbeatMs: 5000,
                timeoutMs: input.handlerTimeoutMs ?? guardPreparationTiming.handlerMs,
              });
              try {
                await within(Promise.allSettled([...inFlight]), 5000);
              } catch {
                stop.abort();
                throw new LiveGuardError("cleanup_failed");
              }
            }
          }
        } catch {
          input.report({
            module: "guard",
            phase: "degraded",
            reason: "queue_or_database_unavailable",
          });
          if (input.once) throw new LiveGuardError("source_unavailable");
        }
        if (input.once || stop.signal.aborted) break;
        try {
          await delay(1000, undefined, { signal: stop.signal });
        } catch {
          break;
        }
      }
    })();
    const stopping = new Promise<void>((resolve) => {
      if (stop.signal.aborted) resolve();
      else
        stop.signal.addEventListener("abort", () => resolve(), { once: true });
    });
    await Promise.race([work, stopping]);
  } finally {
    stop.abort();
    try {
      await within(
        (async () => {
          try {
            await within(
              Promise.allSettled([...(work ? [work] : []), ...inFlight]),
              5000,
            );
          } finally {
            await input.close();
          }
        })(),
        9000,
      );
      input.report({ module: "guard", phase: "stopped" });
    } catch {
      input.report({
        module: "guard",
        phase: "shutdown_failed",
        reason: "cleanup_deadline",
      });
      throw new LiveGuardError("cleanup_failed");
    } finally {
      for (const [name, fn] of listeners)
        input.control.removeListener(name, fn);
      if (input.control.connected) input.control.disconnect?.();
    }
  }
}
