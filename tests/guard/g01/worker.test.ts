import { expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { runGuardWorker } from "../../../worker/guard/runtime";
import type { DurableJobPort } from "../../../src/features/sentinel/platform-contracts";
const scope = {
  mode: "live" as const,
  workspaceId: "github-user-7:fixture",
  projectId: "github-123",
};
function setup() {
  const control = Object.assign(new EventEmitter(), {
      connected: true,
      disconnect: vi.fn(),
    }),
    close = vi.fn(async () => {}),
    claim = vi.fn(async () => []),
    report = vi.fn();
  const queue: DurableJobPort = {
    claim,
    enqueue: vi.fn(),
    heartbeat: vi.fn(),
    complete: vi.fn(),
    retry: vi.fn(),
    cancel: vi.fn(),
  };
  return {
    control,
    close,
    claim,
    report,
    queue,
    input: {
      workerId: "guard-test",
      control,
      close,
      scopes: async () => [scope],
      queue: () => queue,
      handler: vi.fn(async () => {}),
      verifyReady: vi.fn(async () => {}),
      report,
      once: true,
    },
  };
}
it("claims only Guard jobs and closes its independent lifecycle", async () => {
  const f = setup();
  await runGuardWorker(f.input);
  expect(f.claim).toHaveBeenCalledWith({
    module: "guard",
    workerId: "guard-test",
    limit: 1,
    leaseMs: 30000,
  });
  expect(f.close).toHaveBeenCalledOnce();
  expect(f.report).toHaveBeenCalledWith({ module: "guard", phase: "stopped" });
  expect(f.control.listenerCount("message")).toBe(0);
});
it("ignores Sentinel shutdown messages and accepts private Guard IPC", async () => {
  const f = setup();
  let requested = false;
  const task = runGuardWorker({
    ...f.input,
    once: false,
    scopes: async () => {
      if (!requested) {
        requested = true;
        setTimeout(() => {
          f.control.emit("message", { type: "sentinel.shutdown", version: 1 });
          expect(f.close).not.toHaveBeenCalled();
          f.control.emit("message", { type: "guard.shutdown", version: 1 });
        }, 5);
      }
      return [];
    },
  });
  await task;
  expect(f.close).toHaveBeenCalledOnce();
});
it("closes after startup or queue failure instead of reporting a healthy empty result", async () => {
  const f = setup();
  f.input.verifyReady.mockRejectedValue(new Error("schema mismatch"));
  await expect(runGuardWorker(f.input)).rejects.toThrow();
  expect(f.claim).not.toHaveBeenCalled();
  expect(f.close).toHaveBeenCalledOnce();
  const g = setup();
  g.claim.mockRejectedValue(new Error("database outage"));
  await expect(runGuardWorker(g.input)).rejects.toThrow();
  expect(g.report).toHaveBeenCalledWith({
    module: "guard",
    phase: "degraded",
    reason: "queue_or_database_unavailable",
  });
  expect(g.close).toHaveBeenCalledOnce();
});
it("rejects a lease from the wrong module before running any handler", async () => {
  const f = setup();
  f.claim.mockResolvedValue([
    { job: { ...scope, module: "sentinel", kind: "sentinel.maintenance" } },
  ] as never[]);
  await expect(runGuardWorker(f.input)).rejects.toThrow();
  expect(f.input.handler).not.toHaveBeenCalled();
});

it("forwards the executor's renewed lease into the Guard handler", async () => {
  const { brokerFixture } = await import("./broker-fixture");
  const b = await brokerFixture(),
    f = setup();
  const renewed = {
    ...b.lease,
    job: { ...b.lease.job, revision: 3 },
    expiresAt: new Date(Date.now() + 45000).toISOString(),
  };
  vi.mocked(f.queue.claim).mockResolvedValue([b.lease]);
  vi.mocked(f.queue.heartbeat).mockResolvedValue(renewed);
  vi.useFakeTimers();
  try {
    const handler = vi.fn<
      import("../../../worker/sentinel/executor").LeaseAwareJobHandler
    >(async (_job, _signal, latest) => {
      await new Promise((done) => setTimeout(done, 5100));
      expect(latest()).toEqual(renewed);
    });
    const task = runGuardWorker({
      ...f.input,
      workerId: b.lease.workerId,
      handler,
    });
    await vi.advanceTimersByTimeAsync(5200);
    await task;
    expect(handler).toHaveBeenCalledOnce();
    expect(f.queue.heartbeat).toHaveBeenCalledOnce();
    expect(f.queue.complete).toHaveBeenCalledWith(renewed);
  } finally {
    vi.useRealTimers();
  }
});
