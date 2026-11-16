import { it, expect, vi, afterEach } from "vitest";
import type { GuardIpcPort } from "../../../worker/guard/ipc";
import { foundationResolver } from "../../../worker/guard/acceptance/resolver";
import * as security from "../../../src/features/guard/security";
import { brokerFixture } from "./broker-fixture";
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function fixture(ttl = 60000, missingIssued = false, sendFails = false) {
  const f = await brokerFixture();
  vi.useFakeTimers();
  const issuedAt = Date.now(),
    grant = Object.freeze({
      ...f.grant,
      issuedAt: missingIssued ? undefined : issuedAt,
      expiresAt: issuedAt + ttl,
    });
  const listeners = new Set<(value: unknown) => void>(),
    events: Record<string, unknown>[] = [],
    requests: string[] = [];
  const port: GuardIpcPort = {
    send: async (value) => {
      const v = value as Record<string, unknown>;
      if (v.type === "guard.auth.request") {
        requests.push(String(v.op));
        queueMicrotask(() => {
          for (const fn of listeners)
            fn({
              type: "guard.auth.response",
              version: 1,
              id: v.id,
              result: { grant },
            });
        });
      } else if (v.type === "guard.acceptance.boundary") {
        if (sendFails) throw Error("offline IPC unknown");
        events.push(v);
      }
    },
    message: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    disconnect: () => () => {},
  };
  const remote = foundationResolver(port, () => f.lease, "N04");
  return { ...f, grant, remote, events, requests, issuedAt };
}
it("N04 CLOCK DOUBLE: original 60s grant stays unchanged; no boundary at60s/60999ms; actual forbidden precedes the61s proof", async () => {
  const f = await fixture(),
    spy = vi.spyOn(security, "authorize"),
    original = structuredClone(f.grant);
  try {
    let settled = false;
    const task = f.remote.resolver
      .resolve(f.lease, new AbortController().signal)
      .finally(() => {
        settled = true;
      });
    const assertion = expect(task).rejects.toThrow("execution_not_ready");
    await vi.advanceTimersByTimeAsync(60000);
    expect(settled).toBe(false);
    expect(f.events).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    expect(f.events).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.results[1].type).toBe("throw");
    expect(spy.mock.results[1].value).toMatchObject({ code: "forbidden" });
    expect(f.events).toHaveLength(1);
    expect(f.events[0]).toMatchObject({
      issuedAt: f.issuedAt,
      expiresAt: f.issuedAt + 60000,
      authorizationCheckedAt: f.issuedAt + 61000,
      observedAt: f.issuedAt + 61000,
      authorization: {
        operation: "scan",
        outcome: "denied",
        errorCode: "forbidden",
      },
    });
    expect(f.grant).toEqual(original);
    expect(f.requests).toEqual(["resolve"]);
  } finally {
    f.remote.close();
  }
});
it.each([10000, 0, 61000])(
  "N04 CLOCK DOUBLE: TTL%i is rejected without an expiry proof or source request",
  async (ttl) => {
    const f = await fixture(ttl);
    try {
      await expect(f.remote.resolver.resolve(f.lease)).rejects.toThrow(
        "execution_not_ready",
      );
      expect(f.events).toEqual([]);
      expect(f.requests).toEqual(["resolve"]);
    } finally {
      f.remote.close();
    }
  },
);
it("N04 rejects missing server issuedAt", async () => {
  const f = await fixture(60000, true);
  try {
    await expect(f.remote.resolver.resolve(f.lease)).rejects.toThrow(
      "execution_not_ready",
    );
    expect(f.events).toEqual([]);
  } finally {
    f.remote.close();
  }
});
it.each([
  "unexpected_success",
  "unknown",
  "code_shaped_forbidden",
  "other_guard_error",
])(
  "N04 CLOCK DOUBLE: %s after holding cannot publish a successful boundary or acquire source",
  async (mode) => {
    const f = await fixture(),
      actual = security.authorize;
    vi.spyOn(security, "authorize")
      .mockImplementationOnce(actual)
      .mockImplementation(() => {
        if (mode === "unexpected_success") return;
        if (mode === "code_shaped_forbidden") throw { code: "forbidden" };
        if (mode === "other_guard_error")
          throw new security.GuardError("invalid_input", "offline test");
        throw Error("offline unknown");
      });
    try {
      const task = f.remote.resolver.resolve(f.lease),
        assertion = expect(task).rejects.toBeDefined();
      await vi.advanceTimersByTimeAsync(61000);
      await assertion;
      expect(f.events).toEqual([]);
      expect(f.requests).toEqual(["resolve"]);
    } finally {
      f.remote.close();
    }
  },
);
it("N04 CLOCK DOUBLE: abort during hold never publishes success", async () => {
  const f = await fixture(),
    abort = new AbortController();
  try {
    const task = f.remote.resolver.resolve(f.lease, abort.signal),
      assertion = expect(task).rejects.toThrow("source_unavailable");
    await vi.advanceTimersByTimeAsync(60000);
    abort.abort();
    await assertion;
    expect(f.events).toEqual([]);
    expect(f.requests).toEqual(["resolve"]);
  } finally {
    f.remote.close();
  }
});
it("N04 CLOCK DOUBLE: unknown proof delivery failure cannot continue to preparation", async () => {
  const f = await fixture(60000, false, true);
  try {
    const task = f.remote.resolver.resolve(f.lease),
      assertion = expect(task).rejects.toThrow("offline IPC unknown");
    await vi.advanceTimersByTimeAsync(61000);
    await assertion;
    expect(f.events).toEqual([]);
    expect(f.requests).toEqual(["resolve"]);
  } finally {
    f.remote.close();
  }
});
