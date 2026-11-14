import { EventEmitter } from "node:events";
import { createServer, request } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PlatformDatabase } from "../../src/platform/database";
import { workerConfig } from "../../src/platform/config";
import {
  runSentinelWorker,
  type LifecycleEvent,
} from "../../worker/sentinel/runtime";
import {
  closeHealthServer,
  ShutdownCoordinator,
  within,
} from "../../worker/sentinel/lifecycle";
import { executeLease } from "../../worker/sentinel/executor";
import { fakePool, RecordingClient, lease, scope } from "./helpers";
import { PostgresQueue } from "../../src/platform/queue";

afterEach(() => vi.useRealTimers());
const shutdown = { type: "sentinel.shutdown", version: 1 };
function control() {
  return Object.assign(new EventEmitter(), {
    connected: true,
    disconnect: vi.fn(),
  });
}
function fixture(pending?: Promise<void>) {
  const client = new RecordingClient(),
    pool = fakePool(client),
    parent = control();
  const workerId = randomUUID(),
    records = new Map([["historical-stale", "running"]]);
  const events: LifecycleEvent[] = [];
  let began!: (port: number) => void, pulse!: () => void, polling!: () => void;
  const started = new Promise<number>((r) => {
    began = r;
  });
  const heartbeat = new Promise<void>((r) => {
    pulse = r;
  });
  const polled = new Promise<void>((r) => {
    polling = r;
  });
  client.respond = async (sql, values) => {
    if (sql.startsWith("SELECT version,checksum"))
      return {
        rows: [{ version: "0001_foundation", checksum: "fixture" }],
        rowCount: 1,
      };
    if (sql.startsWith("INSERT INTO platform.worker_heartbeats")) {
      records.set(String(values[1]), String(values[2]));
      if (values[2] === "running") pulse();
    }
    if (sql.startsWith("SELECT mode,workspace_id,project_id")) {
      polling();
      await pending;
    }
    if (sql.startsWith("SELECT version FROM"))
      return { rows: [{ version: "0001_foundation" }], rowCount: 1 };
    if (sql.includes("AS fresh"))
      return {
        rows: [{ fresh: records.get(String(values[1])) === "running" ? 1 : 0 }],
        rowCount: 1,
      };
    if (sql.includes("AS lag_seconds"))
      return {
        rows: [{ queued: 0, leased: 0, expired: 0, failed: 0, lag_seconds: 0 }],
        rowCount: 1,
      };
    if (sql.includes("AS n")) return { rows: [{ n: 0 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const run = runSentinelWorker({
    db: new PlatformDatabase(pool, true),
    pool,
    migrations: [
      { version: "0001_foundation", checksum: "fixture", up: "", down: "" },
    ],
    options: { ...workerConfig({}), healthPort: 0 },
    workerId,
    control: parent,
    report: (e) => {
      events.push(e);
      if (e.phase === "started") began(e.port!);
    },
  });
  return {
    client,
    pool,
    parent,
    workerId,
    records,
    events,
    started,
    heartbeat,
    polled,
    run,
  };
}

describe("shutdown coordinator - deterministic lifecycle boundaries", () => {
  it("cancels an idle timer immediately and clears deadline timers", async () => {
    vi.useFakeTimers();
    const parent = control(),
      notify = vi.fn(),
      coordinator = new ShutdownCoordinator(parent, notify);
    const idle = delay(30000, undefined, { signal: coordinator.signal }).catch(
      () => "aborted",
    );
    parent.emit("message", shutdown);
    expect(await idle).toBe("aborted");
    await expect(within(Promise.resolve(1), 9000)).resolves.toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    coordinator.dispose();
  });
  it("coalesces repeated signals and IPC requests into one cleanup", async () => {
    const parent = control(),
      notify = vi.fn(),
      cleanup = vi.fn(async () => {});
    const coordinator = new ShutdownCoordinator(parent, notify, "win32");
    parent.emit("SIGBREAK");
    parent.emit("SIGINT");
    parent.emit("SIGTERM");
    parent.emit("message", shutdown);
    const first = coordinator.finish(cleanup),
      second = coordinator.finish(cleanup);
    expect(first).toBe(second);
    await first;
    expect(notify).toHaveBeenCalledExactlyOnceWith("SIGBREAK");
    expect(cleanup).toHaveBeenCalledOnce();
    coordinator.dispose();
    expect(parent.eventNames()).toEqual([]);
  });
  it("supports Unix termination without installing SIGBREAK", () => {
    const parent = control(),
      notify = vi.fn();
    const coordinator = new ShutdownCoordinator(parent, notify, "linux");
    expect(parent.listenerCount("SIGBREAK")).toBe(0);
    parent.emit("SIGTERM");
    expect(notify).toHaveBeenCalledExactlyOnceWith("SIGTERM");
    coordinator.dispose();
  });
  it("refuses malformed commands and messages without an inherited channel", () => {
    const parent = Object.assign(new EventEmitter(), { connected: false }),
      notify = vi.fn();
    const coordinator = new ShutdownCoordinator(parent, notify);
    parent.emit("message", shutdown);
    expect(coordinator.signal.aborted).toBe(false);
    coordinator.dispose();
    const inherited = control(),
      connected = new ShutdownCoordinator(inherited, notify);
    for (const message of [
      null,
      {},
      { type: "sentinel.shutdown", version: 2 },
      "shutdown",
    ])
      inherited.emit("message", message);
    expect(connected.signal.aborted).toBe(false);
    inherited.emit("disconnect");
    expect(connected.signal.aborted).toBe(true);
    connected.dispose();
  });
  it("reports a bounded drain failure instead of silently succeeding", async () => {
    vi.useFakeTimers();
    const result = within(new Promise(() => {}), 5000);
    const checked = expect(result).rejects.toThrow("shutdown_deadline");
    await vi.advanceTimersByTimeAsync(5001);
    await checked;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("worker runtime - real local HTTP, SQL doubles, no PostgreSQL durability claim", () => {
  it("shuts down idle polling, closes HTTP/pool, and preserves the previous stale heartbeat across restart", async () => {
    const old = fixture();
    const oldPort = await old.started;
    await old.heartbeat;
    const response = await fetch(`http://127.0.0.1:${oldPort}/health`);
    expect(response.status).toBe(200);
    expect((await response.json()).worker).toBe("running");
    old.parent.emit("message", shutdown);
    old.parent.emit("message", shutdown);
    await old.run;
    expect(old.pool.end).toHaveBeenCalledOnce();
    expect(old.records.get(old.workerId)).toBe("stopped");
    expect(old.records.get("historical-stale")).toBe("running");
    expect(
      old.events.filter((e) => e.phase === "shutdown_requested"),
    ).toHaveLength(1);
    await expect(fetch(`http://127.0.0.1:${oldPort}/health`)).rejects.toThrow();
    const fresh = fixture();
    const newPort = await fresh.started;
    await fresh.heartbeat;
    expect(fresh.workerId).not.toBe(old.workerId);
    const health = await fetch(`http://127.0.0.1:${newPort}/health`);
    expect(health.status).toBe(200);
    await health.arrayBuffer();
    fresh.parent.emit("message", shutdown);
    await fresh.run;
    expect(fresh.records.get(fresh.workerId)).toBe("stopped");
    expect(fresh.pool.end).toHaveBeenCalledOnce();
  });
  it("waits for an operation to settle and never starts claims after the stop request", async () => {
    let release!: () => void;
    const pending = new Promise<void>((r) => {
        release = r;
      }),
      f = fixture(pending);
    await f.started;
    await f.polled;
    f.parent.emit("message", shutdown);
    await Promise.resolve();
    expect(f.pool.end).not.toHaveBeenCalled();
    release();
    await f.run;
    expect(f.client.calls.some((c) => c.sql.includes("WITH candidates"))).toBe(
      false,
    );
    expect(f.records.get(f.workerId)).toBe("stopped");
    expect(f.pool.end).toHaveBeenCalledOnce();
  });
  it("closes the pool even when the stopped-heartbeat write fails", async () => {
    const f = fixture();
    await f.started;
    await f.heartbeat;
    const respond = f.client.respond;
    f.client.respond = async (sql, values) => {
      if (
        sql.startsWith("INSERT INTO platform.worker_heartbeats") &&
        values[2] === "stopped"
      )
        throw Error("fixture_failure");
      return respond(sql, values);
    };
    f.parent.emit("message", shutdown);
    await expect(f.run).rejects.toThrow("worker_shutdown_failed");
    expect(f.pool.end).toHaveBeenCalledOnce();
    expect(f.events.some((e) => e.phase === "shutdown_failed")).toBe(true);
    expect(f.events.some((e) => e.phase === "stopped")).toBe(false);
  });
  it("bounds a non-settling polling operation and does not fabricate a stopped heartbeat", async () => {
    let release!: () => void;
    const f = fixture(
      new Promise<void>((r) => {
        release = r;
      }),
    );
    await f.started;
    await f.polled;
    f.parent.emit("message", shutdown);
    await expect(f.run).rejects.toThrow("worker_shutdown_failed");
    expect(f.pool.end).toHaveBeenCalledOnce();
    expect(f.records.get(f.workerId)).toBe("running");
    release(); // Finish the harmless double; no application operation may begin.
  }, 10000);
  it("closes an incomplete HTTP request without leaving a socket or timer", async () => {
    const server = createServer(() => {});
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("missing listener");
    const req = request({
      host: "127.0.0.1",
      port: address.port,
      method: "POST",
      headers: { "Content-Length": "100" },
    });
    req.on("error", () => {});
    const socketClosed = new Promise<void>((r) => req.on("close", r));
    req.write("partial");
    await new Promise<void>((r) => server.once("connection", () => r()));
    await closeHealthServer(server);
    await socketClosed;
    expect(server.listening).toBe(false);
  });
  it("refuses Guard claims before touching SQL", async () => {
    const client = new RecordingClient(),
      pool = fakePool(client);
    const queue = new PostgresQueue(new PlatformDatabase(pool, true), scope, [
      "sentinel.maintenance",
    ]);
    await expect(
      queue.claim({
        module: "guard",
        workerId: "new-worker",
        limit: 1,
        leaseMs: 30000,
      }),
    ).rejects.toThrow("scope_denied");
    expect(client.calls).toEqual([]);
  });
  it("does not settle a restarted lease when the old handler resolves late", async () => {
    let oldFinish!: () => void;
    const stop = new AbortController(),
      initial = lease();
    const queue = {
      enqueue: vi.fn(),
      claim: vi.fn(),
      heartbeat: vi.fn(),
      cancel: vi.fn(),
      complete: vi.fn(async (l: typeof initial) => {
        if (l.leaseToken === initial.leaseToken) throw Error("lease_lost");
      }),
      retry: vi.fn(async () => {
        throw Error("lease_lost");
      }),
    };
    const old = executeLease(
      queue,
      initial,
      () =>
        new Promise<void>((r) => {
          oldFinish = r;
        }),
      { signal: stop.signal, heartbeatMs: 10000, timeoutMs: 20000 },
    );
    await Promise.resolve();
    stop.abort();
    expect(await old).toBe("lease_lost");
    const renewed = {
      ...initial,
      workerId: "restarted",
      leaseToken: "2:new-fence",
      job: { ...initial.job, revision: 3 },
    };
    expect(
      await executeLease(queue, renewed, async () => {}, {
        signal: new AbortController().signal,
        heartbeatMs: 10000,
        timeoutMs: 20000,
      }),
    ).toBe("completed");
    oldFinish();
    await Promise.resolve();
    expect(queue.complete).toHaveBeenCalledExactlyOnceWith(renewed);
  });
});
