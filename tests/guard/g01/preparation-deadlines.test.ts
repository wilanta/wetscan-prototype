import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { runGuardWorker } from "../../../worker/guard/runtime";
import { guardRpcClient, type GuardIpcPort } from "../../../worker/guard/ipc";
import { snapshotPolicy } from "../../../src/features/guard/live/snapshot";
import { brokerFixture } from "./broker-fixture";

// Synthetic time and queue only: this never starts a worker process or connects to a service.
async function worker(duration: number, loseLease = false) {
  const b = await brokerFixture();
  let prepared = false;
  const control = Object.assign(new EventEmitter(), {
    connected: true,
    disconnect: vi.fn(),
  });
  const queue = {
    claim: vi.fn(async () => [b.lease]),
    enqueue: vi.fn(),
    heartbeat: vi.fn(async (lease: typeof b.lease) => {
      if (loseLease) throw new Error("synthetic lost lease");
      return {
        ...lease,
        expiresAt: new Date(Date.now() + 30000).toISOString(),
        job: { ...lease.job, revision: lease.job.revision + 1 },
      };
    }),
    complete: vi.fn(),
    retry: vi.fn(),
    cancel: vi.fn(),
  };
  const task = runGuardWorker({
    workerId: b.lease.workerId,
    control,
    close: vi.fn(async () => {}),
    scopes: async () => [b.binding],
    queue: () => queue,
    handler: async (_job, signal) =>
      new Promise<void>((done, fail) => {
        const timer = setTimeout(() => {
          prepared = true;
          done();
        }, duration);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          fail(new Error("synthetic abort"));
        }, { once: true });
      }),
    verifyReady: async () => {},
    report: vi.fn(),
    once: true,
  });
  return { task, queue, prepared: () => prepared };
}

it("allows the observed 40.585s preparation while renewing the 30s lease", async () => {
  vi.useFakeTimers();
  try {
    expect(snapshotPolicy.maxMs).toBe(45000);
    const f = await worker(40585);
    await vi.advanceTimersByTimeAsync(41000);
    await f.task;
    expect(f.prepared()).toBe(true);
    expect(f.queue.heartbeat).toHaveBeenCalledTimes(8);
    expect(f.queue.complete).toHaveBeenCalledWith(
      expect.objectContaining({ job: expect.objectContaining({ revision: 10 }) }),
    );
    expect(f.queue.retry).not.toHaveBeenCalled();
    expect(f.queue.claim).toHaveBeenCalledWith(expect.objectContaining({ leaseMs: 30000 }));
  } finally {
    vi.useRealTimers();
  }
});

it("still aborts preparation at 60s and schedules a redacted retry", async () => {
  vi.useFakeTimers();
  try {
    const f = await worker(80000);
    await vi.advanceTimersByTimeAsync(59999);
    expect(f.queue.retry).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await f.task;
    expect(f.prepared()).toBe(false);
    expect(f.queue.complete).not.toHaveBeenCalled();
    expect(f.queue.retry).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ redactedError: "handler_timeout" }),
    );
  } finally {
    vi.useRealTimers();
  }
});

it("lease loss still aborts promptly within the longer handler budget", async () => {
  vi.useFakeTimers();
  try {
    const f = await worker(40585, true);
    await vi.advanceTimersByTimeAsync(5000);
    await f.task;
    expect(f.prepared()).toBe(false);
    expect(f.queue.complete).not.toHaveBeenCalled();
    expect(f.queue.retry).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it.each([40585, 55001])("bounds the default RPC when source responds at %ims", async (duration) => {
  vi.useFakeTimers();
  let receive: (value: unknown) => void = () => {};
  const port: GuardIpcPort = {
    send: vi.fn(async (value) => {
      const packet = value as Record<string, unknown>;
      if (packet.type === "guard.auth.request")
        setTimeout(() => receive({
          type: "guard.auth.response", version: 1, id: packet.id, result: { fixture: true },
        }), duration);
    }),
    message: (fn) => { receive = fn; return () => {}; },
    disconnect: () => () => {},
  };
  const client = guardRpcClient(port);
  try {
    const result = client.call({ op: "acquire" });
    // Attach the rejection assertion before advancing the clock.
    const assertion = duration < 55000
      ? expect(result).resolves.toEqual({ fixture: true })
      : expect(result).rejects.toThrow("source_unavailable");
    await vi.advanceTimersByTimeAsync(55001);
    await assertion;
    const cancellations = vi.mocked(port.send).mock.calls.filter(
      ([value]) => (value as Record<string, unknown>).type === "guard.auth.cancel",
    );
    expect(cancellations).toHaveLength(duration < 55000 ? 0 : 1);
  } finally {
    client.close();
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
