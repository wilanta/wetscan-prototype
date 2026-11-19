import { it, expect, vi, afterEach } from "vitest";
import type { DurableJobPort } from "../../../src/features/sentinel/platform-contracts";
import { executeLease } from "../../../worker/sentinel/executor";
import { acceptanceRetry } from "../../../worker/guard/acceptance/n04";
import { brokerFixture } from "./broker-fixture";
import { PlatformDatabase } from "../../../src/platform/database";
import { PostgresGuardStore } from "../../../src/features/guard/live/persistence";
import { RecordingClient, fakePool } from "../../platform/helpers";
afterEach(() => vi.useRealTimers());
it.each([
  "forbidden",
  "unknown",
  "timeout",
  "stopping",
  "proof_delivery_failure",
])(
  "N04 with real shared executor and OFFLINE queue: %s never schedules retry/complete/enqueue",
  async (mode) => {
    const f = await brokerFixture();
    vi.useFakeTimers();
    const retry = vi.fn(async () => {}),
      report = vi.fn(async (proof: unknown) => {
        expect(proof).toMatchObject({ retryScheduled: false });
        if (mode === "proof_delivery_failure")
          throw Error("offline IPC unknown");
      });
    const complete = vi.fn(async () => {}),
      enqueue = vi.fn(async () => ({
        jobId: f.lease.job.jobId,
        duplicate: false,
      }));
    const queue: DurableJobPort = {
      enqueue,
      complete,
      retry: acceptanceRetry("N04", retry, report),
      cancel: vi.fn(async () => {}),
      claim: vi.fn(async () => [f.lease]),
      heartbeat: vi.fn(async () => f.lease),
    };
    const abort = new AbortController();
    const task = executeLease(
      queue,
      f.lease,
      async (_job, signal) => {
        if (mode === "timeout" || mode === "stopping")
          await new Promise<void>((_, reject) =>
            signal.addEventListener(
              "abort",
              () => reject(Error("offline abort")),
              { once: true },
            ),
          );
        else throw Object.assign(Error("offline handler"), { code: mode });
      },
      { signal: abort.signal, heartbeatMs: 5000, timeoutMs: 10000 },
    );
    if (mode === "timeout") await vi.advanceTimersByTimeAsync(10000);
    if (mode === "stopping") {
      await vi.advanceTimersByTimeAsync(1);
      abort.abort();
    }
    expect(await task).toBe("lease_lost");
    expect(retry).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledOnce();
    expect(report.mock.calls[0][0]).toMatchObject({
      jobId: f.lease.job.jobId,
      workerId: f.lease.workerId,
      attempt: 1,
      retryScheduled: false,
    });
  },
);
it("non-N04 acceptance preserves the existing production executor retry behavior", async () => {
  const f = await brokerFixture(),
    retry = vi.fn(async () => {}),
    report = vi.fn(async () => {});
  const queue: DurableJobPort = {
    retry: acceptanceRetry("N06", retry, report),
    enqueue: vi.fn(),
    cancel: vi.fn(),
    claim: vi.fn(),
    heartbeat: vi.fn(),
    complete: vi.fn(),
  };
  expect(queue.retry).toBe(retry);
  expect(
    await executeLease(
      queue,
      f.lease,
      async () => {
        throw Error("offline handler");
      },
      {
        signal: new AbortController().signal,
        heartbeatMs: 5000,
        timeoutMs: 10000,
      },
    ),
  ).toBe("retry_scheduled");
  expect(retry).toHaveBeenCalledOnce();
  expect(report).not.toHaveBeenCalled();
});
it.each([false, true])(
  "N04 retained-job cancellation uses the actual store over SQL doubles: failure=%s never inserts or schedules retry",
  async (failure) => {
    const f = await brokerFixture(),
      client = new RecordingClient();
    client.respond = async (sql) => {
      if (failure && sql.startsWith("UPDATE platform.jobs"))
        throw Error("offline unknown SQL result");
      return {
        rows: sql.startsWith("SELECT job,revision")
          ? [
              {
                job: f.job,
                revision: 1,
                coverage: null,
                fingerprint: "offline",
              },
            ]
          : [],
        rowCount: 1,
      };
    };
    const store = new PostgresGuardStore(
      new PlatformDatabase(fakePool(client), false, "guard"),
    );
    if (failure)
      await expect(
        store.cancel(f.grant, f.binding, f.binding.jobId),
      ).rejects.toThrow("offline unknown SQL result");
    else await store.cancel(f.grant, f.binding, f.binding.jobId);
    const sql = client.calls.map((c) => c.sql).join("\n");
    expect(sql).not.toMatch(
      /\bINSERT\b|SET state=CASE WHEN attempts>=max_attempts/,
    );
    expect(sql).toContain("cancel_requested=true");
    expect(sql).toContain("lease_owner=NULL,lease_token=NULL,lease_until=NULL");
    expect(
      client.calls.filter((c) => c.sql.startsWith("UPDATE platform.jobs")),
    ).toHaveLength(1);
    expect(sql).toContain(failure ? "ROLLBACK" : "COMMIT");
    if (failure) expect(sql).not.toContain("COMMIT");
  },
);
