import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import {
  attachGuardBroker,
  guardRpcClient,
  type GuardIpcPort,
} from "../../../worker/guard/ipc";
function pair() {
  const a = new EventEmitter(),
    b = new EventEmitter();
  const port = (own: EventEmitter, remote: EventEmitter): GuardIpcPort => ({
    async send(value) {
      queueMicrotask(() => remote.emit("message", structuredClone(value)));
    },
    message(fn) {
      own.on("message", fn);
      return () => {
        own.off("message", fn);
      };
    },
    disconnect(fn) {
      own.on("disconnect", fn);
      return () => {
        own.off("disconnect", fn);
      };
    },
  });
  return { a, b, parent: port(a, b), child: port(b, a) };
}
it("routes only private Guard packets and never returns arbitrary provider exception text", async () => {
  const p = pair(),
    detach = attachGuardBroker(p.parent, async () => {
      throw new Error("synthetic-provider-private-token-not-for-output");
    }),
    client = guardRpcClient(p.child);
  await expect(client.call({ op: "resolve" })).rejects.toThrow(
    "source_unavailable",
  );
  client.close();
  await detach();
  expect(p.a.listenerCount("message") + p.b.listenerCount("message")).toBe(0);
});
it("aborts server work on timeout and on explicit client cancellation", async () => {
  const p = pair(),
    aborted = vi.fn();
  const detach = attachGuardBroker(p.parent, async (_packet, signal) => {
    await new Promise<void>((done) =>
      signal.addEventListener(
        "abort",
        () => {
          aborted();
          done();
        },
        { once: true },
      ),
    );
    return { neverAccepted: true };
  });
  const client = guardRpcClient(p.child, 15);
  await expect(client.call({ op: "acquire" })).rejects.toThrow(
    "source_unavailable",
  );
  const controller = new AbortController(),
    request = client.call({ op: "acquire" }, controller.signal);
  await new Promise((done) => setTimeout(done, 1));
  controller.abort();
  await expect(request).rejects.toThrow("source_unavailable");
  client.close();
  await detach();
  expect(aborted).toHaveBeenCalledTimes(2);
});
it("disconnect and client close abort pending calls and remove listeners", async () => {
  const p = pair(),
    client = guardRpcClient(p.child);
  const call = client.call({ op: "resolve" });
  p.b.emit("disconnect");
  await expect(call).rejects.toThrow("source_unavailable");
  await expect(client.call({ op: "resolve" })).rejects.toThrow(
    "source_unavailable",
  );
  expect(p.b.listenerCount("message")).toBe(0);
  const q = pair(),
    aborted = vi.fn(),
    detach = attachGuardBroker(q.parent, async (_packet, signal) => {
      await new Promise<void>((done) =>
        signal.addEventListener(
          "abort",
          () => {
            aborted();
            done();
          },
          { once: true },
        ),
      );
      return {};
    }),
    c = guardRpcClient(q.child);
  const task = c.call({ op: "acquire" });
  await new Promise((done) => setTimeout(done, 1));
  c.close();
  await expect(task).rejects.toThrow();
  await detach();
  expect(aborted).toHaveBeenCalledOnce();
});
it("bounds IPC input before sending and rejects an already-aborted call", async () => {
  const p = pair(),
    send = vi.spyOn(p.child, "send"),
    client = guardRpcClient(p.child);
  await expect(client.call({ value: "x".repeat(2000001) })).rejects.toThrow(
    "invalid_input",
  );
  await expect(client.call({}, AbortSignal.abort())).rejects.toThrow(
    "source_unavailable",
  );
  expect(send).not.toHaveBeenCalled();
  client.close();
});
