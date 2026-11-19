import { it, expect, vi } from "vitest";
import type { GuardIpcPort } from "../../../worker/guard/ipc";
import { foundationResolver } from "../../../worker/guard/acceptance/resolver";
import { brokerFixture } from "./broker-fixture";
it.each([60000, 10000, 0])(
  "N04 offline CLOCK DOUBLE: server-issued grant TTL=%i cannot be misreported as a full-minute acceptance",
  async (ttl) => {
    const f = await brokerFixture();
    vi.useFakeTimers();
    const listeners = new Set<(value: unknown) => void>(),
      events: Record<string, unknown>[] = [];
    const issuedAt = Date.now(),
      grant = {
        ...f.grant,
        issuedAt: ttl ? issuedAt : undefined,
        expiresAt: issuedAt + (ttl || 60000),
      };
    const port: GuardIpcPort = {
      send: async (value) => {
        const v = value as Record<string, unknown>;
        if (v.type === "guard.auth.request")
          queueMicrotask(() => {
            for (const fn of listeners)
              fn({
                type: "guard.auth.response",
                version: 1,
                id: v.id,
                result: { grant },
              });
          });
        else if (v.type === "guard.acceptance.boundary") events.push(v);
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
    try {
      const task = remote.resolver.resolve(
          f.lease,
          new AbortController().signal,
        ),
        assertion = expect(task).rejects.toThrow();
      if (ttl === 60000) await vi.advanceTimersByTimeAsync(61000);
      await assertion;
      expect(events).toHaveLength(ttl === 60000 ? 1 : 0);
      if (ttl === 60000)
        expect(
          Number(events[0].observedAt) - Number(events[0].issuedAt),
        ).toBeGreaterThanOrEqual(60000);
    } finally {
      remote.close();
      vi.useRealTimers();
    }
  },
);
