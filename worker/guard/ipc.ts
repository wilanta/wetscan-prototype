import { randomUUID } from "node:crypto";
import type { ChildProcess } from "node:child_process";
import { LiveGuardError } from "../../src/features/guard/live/model";
export interface GuardIpcPort {
  send(value: unknown): Promise<void>;
  message(listener: (value: unknown) => void): () => void;
  disconnect(listener: () => void): () => void;
}
/** Only inherited Node IPC. No HTTP listener, socket address, token file or alternate network channel. */
export function privateIpcPort(
  channel: NodeJS.Process | ChildProcess,
): GuardIpcPort {
  if (!channel.connected || !channel.send)
    throw new LiveGuardError("approval_required");
  return {
    send(value) {
      return new Promise((done, fail) => {
        if (!channel.connected)
          return fail(new LiveGuardError("source_unavailable"));
        const send = channel.send as (
          v: unknown,
          cb: (e: Error | null) => void,
        ) => boolean;
        send.call(channel, value, (error) =>
          error ? fail(new LiveGuardError("source_unavailable")) : done(),
        );
      });
    },
    message(listener) {
      channel.on("message", listener);
      return () => {
        channel.removeListener("message", listener);
      };
    },
    disconnect(listener) {
      channel.on("disconnect", listener);
      return () => {
        channel.removeListener("disconnect", listener);
      };
    },
  };
}
const codes = [
  "invalid_input",
  "not_found",
  "lease_lost",
  "approval_required",
  "source_limit",
  "source_unavailable",
  "cleanup_failed",
] as const;
export function safeBrokerCode(error: unknown): (typeof codes)[number] {
  return error instanceof LiveGuardError && codes.includes(error.code as never)
    ? (error.code as (typeof codes)[number])
    : "source_unavailable";
}
export function boundedPacket(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Buffer.byteLength(JSON.stringify(value)) > 2000000
  )
    throw new LiveGuardError("invalid_input", 400);
  return value as Record<string, unknown>;
}
export function attachGuardBroker(
  port: GuardIpcPort,
  handle: (
    packet: Record<string, unknown>,
    signal: AbortSignal,
  ) => Promise<unknown>,
) {
  const active = new Map<
    string,
    { abort: AbortController; task: Promise<void> }
  >();
  let closed = false;
  const receive = (value: unknown) => {
    let packet: Record<string, unknown>;
    try {
      packet = boundedPacket(value);
    } catch {
      return;
    }
    if (
      packet.version !== 1 ||
      typeof packet.id !== "string" ||
      !/^[a-f0-9-]{36}$/.test(packet.id)
    )
      return;
    if (packet.type === "guard.auth.cancel") {
      active.get(packet.id)?.abort.abort();
      return;
    }
    if (packet.type !== "guard.auth.request" || closed) return;
    const id = packet.id;
    if (active.has(id) || active.size >= 4) {
      void port
        .send({
          type: "guard.auth.response",
          version: 1,
          id,
          error: "source_unavailable",
        })
        .catch(() => undefined);
      return;
    }
    const abort = new AbortController();
    const task = Promise.resolve().then(async () => {
      try {
        const result = await handle(packet, abort.signal);
        if (abort.signal.aborted || closed) return;
        boundedPacket({ result });
        await port.send({
          type: "guard.auth.response",
          version: 1,
          id,
          result,
        });
      } catch (error) {
        if (!closed)
          await port
            .send({
              type: "guard.auth.response",
              version: 1,
              id,
              error: safeBrokerCode(error),
            })
            .catch(() => undefined);
      } finally {
        active.delete(id);
      }
    });
    active.set(id, { abort, task });
  };
  const offMessage = port.message(receive),
    offDisconnect = port.disconnect(() => {
      closed = true;
      for (const request of active.values()) request.abort.abort();
    });
  return async () => {
    closed = true;
    offMessage();
    offDisconnect();
    const tasks = [...active.values()];
    for (const request of tasks) request.abort.abort();
    await Promise.allSettled(tasks.map((t) => t.task));
  };
}
export function guardRpcClient(port: GuardIpcPort, timeoutMs = 25000) {
  const pending = new Map<
    string,
    { finish(error?: Error, result?: unknown): void; cancel(): void }
  >();
  let closed = false;
  const offMessage = port.message((value) => {
    let packet: Record<string, unknown>;
    try {
      packet = boundedPacket(value);
    } catch {
      return;
    }
    if (
      packet.type !== "guard.auth.response" ||
      packet.version !== 1 ||
      typeof packet.id !== "string"
    )
      return;
    const request = pending.get(packet.id);
    if (!request) return;
    if (packet.error !== undefined)
      request.finish(
        new LiveGuardError(
          codes.includes(packet.error as never)
            ? (packet.error as (typeof codes)[number])
            : "source_unavailable",
        ),
      );
    else request.finish(undefined, packet.result);
  });
  const close = () => {
    if (closed) return;
    closed = true;
    for (const request of [...pending.values()]) request.cancel();
    offMessage();
    offDisconnect();
  };
  const offDisconnect = port.disconnect(close);
  return {
    close,
    call(
      payload: Record<string, unknown>,
      signal?: AbortSignal,
    ): Promise<unknown> {
      if (closed || signal?.aborted || pending.size >= 4)
        return Promise.reject(new LiveGuardError("source_unavailable"));
      const id = randomUUID();
      return new Promise((done, fail) => {
        let settled = false;
        const cancel = () => {
          void port
            .send({ type: "guard.auth.cancel", version: 1, id })
            .catch(() => undefined);
          finish(new LiveGuardError("source_unavailable"));
        };
        const timer = setTimeout(cancel, timeoutMs);
        const finish = (error?: Error, result?: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener("abort", cancel);
          pending.delete(id);
          if (error) fail(error);
          else done(result);
        };
        pending.set(id, { finish, cancel });
        signal?.addEventListener("abort", cancel, { once: true });
        try {
          boundedPacket(payload);
        } catch {
          finish(new LiveGuardError("invalid_input", 400));
          return;
        }
        void port
          .send({ ...payload, type: "guard.auth.request", version: 1, id })
          .catch(() => finish(new LiveGuardError("source_unavailable")));
      });
    },
  };
}
