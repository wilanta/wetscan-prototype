import type {
  DurableJob,
  DurableJobPort,
  JobLease,
} from "../../src/features/sentinel/platform-contracts";
import { backoffMs } from "../../src/platform/identity";

export type JobHandler = (
  job: DurableJob,
  signal: AbortSignal,
) => Promise<void>;
export interface ExecutionOptions {
  heartbeatMs: number;
  timeoutMs: number;
  signal: AbortSignal;
}
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new Error("aborted"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}
/** All handlers must honor cancellation and fence their own effects; S01 only installs maintenance. */
export async function executeLease(
  queue: DurableJobPort,
  initial: JobLease,
  handler: JobHandler,
  options: ExecutionOptions,
) {
  let lease = initial,
    lost = false,
    failure: "worker_stopping" | "handler_timeout" | "handler_failed" =
      "handler_failed";
  const controller = new AbortController(),
    heartbeatStop = new AbortController();
  const relay = () => {
    failure = "worker_stopping";
    controller.abort();
  };
  options.signal.addEventListener("abort", relay, { once: true });
  if (options.signal.aborted) relay();
  const timer = setTimeout(() => {
    failure = "handler_timeout";
    controller.abort();
  }, options.timeoutMs);
  const heartbeat = (async () => {
    try {
      while (!heartbeatStop.signal.aborted) {
        await pause(options.heartbeatMs, heartbeatStop.signal);
        lease = await queue.heartbeat(lease);
      }
    } catch {
      if (!heartbeatStop.signal.aborted) {
        lost = true;
        controller.abort();
      }
    }
  })();
  let succeeded = false;
  try {
    if (controller.signal.aborted) throw new Error("aborted");
    await Promise.race([
      Promise.resolve().then(() => handler(lease.job, controller.signal)),
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        ),
      ),
    ]);
    succeeded = !controller.signal.aborted;
  } catch {
    /* Fixed failure codes only; exceptions never enter logs or stored metadata. */
  } finally {
    clearTimeout(timer);
    heartbeatStop.abort();
    await heartbeat;
    options.signal.removeEventListener("abort", relay);
  }
  if (lost) return "lease_lost" as const;
  try {
    if (succeeded) {
      await queue.complete(lease);
      return "completed" as const;
    }
    await queue.retry(lease, {
      availableAt: new Date(
        Date.now() + backoffMs(lease.job.attempts),
      ).toISOString(),
      redactedError: failure,
    });
    return "retry_scheduled" as const;
  } catch {
    return "lease_lost" as const;
  }
}
