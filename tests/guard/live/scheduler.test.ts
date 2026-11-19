import { it, expect, vi } from "vitest";
import { ProductScheduler } from "../../../worker/guard/product-scheduler";
import { LiveGuardError } from "../../../src/features/guard/live/model";
it("registers only deferred work, serializes two jobs and deduplicates the same capability", async () => {
  const s = new ProductScheduler(),
    tasks: (() => Promise<void>)[] = [],
    events: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const first = vi.fn(async () => {
    events.push("one_start");
    await gate;
    events.push("one_end");
  });
  const second = vi.fn(async () => {
    events.push("two");
  });
  s.schedule("one", first, (t) => tasks.push(t));
  s.schedule("one", first, (t) => tasks.push(t));
  s.schedule("two", second, (t) => tasks.push(t));
  expect(first).not.toHaveBeenCalled();
  expect(tasks).toHaveLength(2);
  const a = tasks[0](),
    b = tasks[1]();
  await Promise.resolve();
  await Promise.resolve();
  expect(second).not.toHaveBeenCalled();
  release();
  await Promise.all([a, b]);
  expect(events).toEqual(["one_start", "one_end", "two"]);
  expect(s.status()).toMatchObject({
    pending: 0,
    running: 0,
    quarantined: false,
  });
});
it("refuses excess pending requests before scheduling more work", () => {
  const s = new ProductScheduler();
  for (let i = 0; i < 32; i++)
    s.schedule(
      String(i),
      async () => {},
      () => {},
    );
  expect(() =>
    s.schedule(
      "excess",
      async () => {},
      () => {},
    ),
  ).toThrow("execution_not_ready");
});
it("releases a failed after-response registration without running work", () => {
  const s = new ProductScheduler(),
    work = vi.fn();
  expect(() =>
    s.schedule("one", work, () => {
      throw Error("defer_failed");
    }),
  ).toThrow();
  expect(work).not.toHaveBeenCalled();
  expect(s.status().pending).toBe(0);
});
it("cleanup unknown quarantines pending and new work, without a second execution", async () => {
  const s = new ProductScheduler(),
    tasks: (() => Promise<void>)[] = [],
    next = vi.fn();
  s.schedule(
    "one",
    async () => {
      throw new LiveGuardError("cleanup_failed");
    },
    (t) => tasks.push(t),
  );
  s.schedule("two", next, (t) => tasks.push(t));
  await Promise.all(tasks.map((t) => t()));
  expect(next).not.toHaveBeenCalled();
  expect(s.status().quarantined).toBe(true);
  expect(() => s.assertReady()).toThrow();
});
it("ordinary authorization failure is not retried and does not invent cleanup proof", async () => {
  const s = new ProductScheduler(),
    tasks: (() => Promise<void>)[] = [],
    work = vi.fn(async () => {
      throw Error("revoked");
    });
  s.schedule("one", work, (t) => tasks.push(t));
  await tasks[0]();
  expect(work).toHaveBeenCalledOnce();
  expect(s.status().quarantined).toBe(false);
});
