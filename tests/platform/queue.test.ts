import { describe, expect, it } from "vitest";
import { PlatformDatabase } from "../../src/platform/database";
import { PostgresQueue } from "../../src/platform/queue";
import { PostgresOutbox } from "../../src/platform/outbox";
import { fingerprint, backoffMs } from "../../src/platform/identity";
import { RecordingClient, fakePool, scope, job, lease } from "./helpers";
function setup(worker = false) {
  const client = new RecordingClient(),
    db = new PlatformDatabase(fakePool(client), worker);
  client.authorizedProject = scope.projectId;
  return {
    client,
    db,
    queue: new PostgresQueue(db, scope, ["sentinel.maintenance"]),
  };
}
describe("SQL adapter contracts - recording double, no durable SQL acceptance", () => {
  it("keeps idempotency payload hashing deterministic and collision safe", () => {
    expect(fingerprint({ b: 1, a: "two" })).toBe(
      fingerprint({ a: "two", b: 1 }),
    );
    expect(fingerprint(["a:b", "c"])).not.toBe(fingerprint(["a", "b:c"]));
    expect(backoffMs(1, () => 0)).toBe(1000);
    expect(backoffMs(100, () => 0)).toBe(60000);
  });
  it("inserts a scoped job on the caller's transaction, never a second connection", async () => {
    const { client, db, queue } = setup();
    client.respond = async (sql) => ({
      rows: sql.includes("RETURNING job_id") ? [{ job_id: "job-1" }] : [],
      rowCount: sql.includes("RETURNING job_id") ? 1 : 0,
    });
    await db.scoped(scope, async (tx) =>
      expect(await queue.enqueue(tx, job())).toEqual({
        jobId: "job-1",
        duplicate: false,
      }),
    );
    const insert = client.calls.find((c) =>
      c.sql.includes("INSERT INTO platform.jobs"),
    )!;
    expect(insert.values.slice(0, 5)).toEqual([
      "sentinel",
      "live",
      scope.workspaceId,
      "github-123",
      "job-1",
    ]);
  });
  it("refuses a conflicting idempotency key instead of replacing stored work", async () => {
    const { client, db, queue } = setup();
    client.respond = async (sql) => ({
      rows: sql.startsWith("SELECT job_id,fingerprint")
        ? [{ job_id: "original", fingerprint: "different" }]
        : [],
      rowCount: 0,
    });
    await expect(
      db.scoped(scope, (tx) => queue.enqueue(tx, job())),
    ).rejects.toThrow("idempotency_conflict");
    expect(client.calls.at(-1)?.sql).toBe("ROLLBACK");
  });
  it("denies wrong module and cross-project enqueue before SQL writes", async () => {
    const { client, db, queue } = setup();
    await expect(
      db.scoped(scope, (tx) =>
        queue.enqueue(tx, { ...job(), module: "guard" }),
      ),
    ).rejects.toThrow();
    await expect(
      db.scoped(scope, (tx) =>
        queue.enqueue(tx, { ...job(), projectId: "github-456" }),
      ),
    ).rejects.toThrow();
    expect(client.calls.some((c) => c.sql.includes("INSERT"))).toBe(false);
  });
  it("enforces worker/module limits before claim and uses SKIP LOCKED", async () => {
    const { client, queue } = setup(true);
    client.respond = async (sql) => ({
      rows: sql.includes("SELECT max_running")
        ? [{ max_running: 2 }]
        : sql.includes("AS n")
          ? [{ n: 0 }]
          : sql.includes("SELECT project_id")
            ? [{ project_id: scope.projectId }]
            : [],
      rowCount: sql.includes("SELECT project_id") ? 1 : 0,
    });
    await expect(
      queue.claim({
        module: "sentinel",
        workerId: "w1",
        limit: 2,
        leaseMs: 30000,
      }),
    ).resolves.toEqual([]);
    expect(
      client.calls.some(
        (c) => c.sql.includes("module_limits") && c.sql.includes("FOR UPDATE"),
      ),
    ).toBe(true);
    expect(
      client.calls.some(
        (c) =>
          c.sql.includes("SKIP LOCKED") && c.sql.includes("fence=j.fence+1"),
      ),
    ).toBe(true);
    await expect(
      queue.claim({
        module: "guard",
        workerId: "w1",
        limit: 2,
        leaseMs: 30000,
      }),
    ).rejects.toThrow();
  });
  it("returns no work when global capacity is occupied", async () => {
    const { client, queue } = setup(true);
    client.respond = async (sql) => ({
      rows: sql.includes("SELECT max_running")
        ? [{ max_running: 2 }]
        : sql.includes("AS n")
          ? [{ n: 2 }]
          : sql.includes("SELECT project_id")
            ? [{ project_id: scope.projectId }]
            : [],
      rowCount: sql.includes("SELECT project_id") ? 1 : 0,
    });
    expect(
      await queue.claim({
        module: "sentinel",
        workerId: "w",
        limit: 2,
        leaseMs: 30000,
      }),
    ).toEqual([]);
    expect(client.calls.some((c) => c.sql.includes("WITH candidates"))).toBe(
      false,
    );
  });
  it.each(["complete", "heartbeat"] as const)(
    "rejects stale %s tokens/expiry rather than success",
    async (method) => {
      const { client, queue } = setup(true);
      await expect(queue[method](lease())).rejects.toThrow("lease_lost");
      const mutation = client.calls.find((c) =>
        c.sql.startsWith("UPDATE platform.jobs"),
      )!;
      expect(mutation.sql).toContain("lease_token=$7");
      expect(mutation.sql).toContain("revision=$8");
      expect(mutation.sql).toContain("lease_until>clock_timestamp()");
    },
  );
  it("stores only a fixed retry reason, not secret-bearing exception text", async () => {
    const { client, queue } = setup(true);
    client.respond = async (sql) => ({
      rows: [],
      rowCount: sql.startsWith("UPDATE platform.jobs") ? 1 : 0,
    });
    await queue.retry(lease(), {
      availableAt: new Date().toISOString(),
      redactedError: "a provider secret would be here",
    });
    expect(client.calls.some((c) => c.values.includes("handler_failed"))).toBe(
      true,
    );
    expect(JSON.stringify(client.calls)).not.toContain("provider secret");
  });
  it("persists cancellation with full project/module scope and fences active work", async () => {
    const { client, queue } = setup();
    await queue.cancel(scope, "sentinel", "job-1");
    const update = client.calls.find((c) =>
      c.sql.startsWith("UPDATE platform.jobs"),
    )!;
    expect(update.sql).toContain("state='cancelled'");
    expect(update.sql).toContain("lease_token=NULL");
    expect(update.values).toEqual([
      "sentinel",
      "live",
      scope.workspaceId,
      scope.projectId,
      "job-1",
    ]);
  });
  it("rolls back an outbox failure together with its queued job", async () => {
    const { client, db, queue } = setup();
    client.respond = async (sql) => {
      if (sql.includes("INSERT INTO platform.notification_outbox"))
        throw new Error("fixture outbox failure");
      return { rows: [], rowCount: sql.includes("RETURNING job_id") ? 1 : 0 };
    };
    const outbox = new PostgresOutbox(queue);
    await expect(
      db.scoped(scope, (tx) =>
        outbox.append(tx, {
          ...scope,
          module: "sentinel",
          schemaVersion: 1,
          deliveryId: "delivery-1",
          topic: "future.notification",
          subjectRef: "case-ref",
          idempotencyKey: "notification-1",
          availableAt: new Date().toISOString(),
        }),
      ),
    ).rejects.toThrow("fixture outbox failure");
    expect(client.calls.some((c) => c.sql === "COMMIT")).toBe(false);
    expect(client.calls.at(-1)?.sql).toBe("ROLLBACK");
  });
});
