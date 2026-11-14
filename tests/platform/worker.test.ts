import { describe, expect, it, vi, afterEach } from "vitest";
import { executeLease } from "../../worker/sentinel/executor";
import { lease } from "./helpers";
import type {
  DurableJobPort,
  JobLease,
} from "../../src/features/sentinel/platform-contracts";
function queueDouble() {
  return {
    enqueue: vi.fn(),
    claim: vi.fn(),
    heartbeat: vi.fn(async (l: JobLease) => ({
      ...l,
      job: { ...l.job, revision: l.job.revision + 1 },
    })),
    complete: vi.fn<DurableJobPort["complete"]>(async () => {}),
    retry: vi.fn<DurableJobPort["retry"]>(async () => {}),
    cancel: vi.fn(),
  } satisfies DurableJobPort;
}
afterEach(() => vi.useRealTimers());
describe("worker lifecycle - port doubles, no DB durability claim", () => {
  it("completes bounded work with no notification/provider effect", async () => {
    const q = queueDouble(),
      handler = vi.fn(async () => {});
    expect(
      await executeLease(q, lease(), handler, {
        heartbeatMs: 100,
        timeoutMs: 500,
        signal: new AbortController().signal,
      }),
    ).toBe("completed");
    expect(q.complete).toHaveBeenCalledOnce();
    expect(q.retry).not.toHaveBeenCalled();
  });
  it("uses the renewed revision when completing, after all pending heartbeats settle", async () => {
    vi.useFakeTimers();
    const q = queueDouble();
    let finish!: () => void;
    const run = executeLease(
      q,
      lease(),
      () =>
        new Promise<void>((r) => {
          finish = r;
        }),
      { heartbeatMs: 10, timeoutMs: 100, signal: new AbortController().signal },
    );
    await vi.advanceTimersByTimeAsync(11);
    finish();
    await run;
    expect(q.heartbeat).toHaveBeenCalledOnce();
    expect(q.complete.mock.calls[0][0].job.revision).toBe(3);
  });
  it("loses authority on stale/revoked heartbeat; never completes or retries the old lease", async () => {
    vi.useFakeTimers();
    const q = queueDouble();
    q.heartbeat.mockRejectedValueOnce(new Error("stale lease"));
    const run = executeLease(q, lease(), () => new Promise(() => {}), {
      heartbeatMs: 10,
      timeoutMs: 100,
      signal: new AbortController().signal,
    });
    await vi.advanceTimersByTimeAsync(11);
    expect(await run).toBe("lease_lost");
    expect(q.complete).not.toHaveBeenCalled();
    expect(q.retry).not.toHaveBeenCalled();
  });
  it("times out a stalled handler and schedules a bounded durable retry", async () => {
    vi.useFakeTimers();
    const q = queueDouble();
    const run = executeLease(q, lease(), () => new Promise(() => {}), {
      heartbeatMs: 10,
      timeoutMs: 30,
      signal: new AbortController().signal,
    });
    await vi.advanceTimersByTimeAsync(31);
    expect(await run).toBe("retry_scheduled");
    expect(q.retry.mock.calls[0][1].redactedError).toBe("handler_timeout");
  });
  it("shutdown aborts active work and returns it for retry, without success", async () => {
    const q = queueDouble(),
      stop = new AbortController();
    let observed: AbortSignal | undefined;
    const run = executeLease(
      q,
      lease(),
      async (_, signal) => {
        observed = signal;
        await new Promise(() => {});
      },
      { heartbeatMs: 100, timeoutMs: 500, signal: stop.signal },
    );
    await Promise.resolve();
    stop.abort();
    expect(await run).toBe("retry_scheduled");
    expect(observed?.aborted).toBe(true);
    expect(q.retry.mock.calls[0][1].redactedError).toBe("worker_stopping");
  });
  it("does not expose handler exception data to storage", async () => {
    const q = queueDouble();
    await executeLease(
      q,
      lease(),
      async () => {
        throw new Error("untrusted sensitive exception");
      },
      {
        heartbeatMs: 100,
        timeoutMs: 500,
        signal: new AbortController().signal,
      },
    );
    expect(q.retry.mock.calls[0][1].redactedError).toBe("handler_failed");
  });
});
