import { describe, expect, it } from "vitest";
import { PlatformDatabase } from "../../src/platform/database";
import { RecordingClient, fakePool, scope } from "./helpers";
describe("transaction plumbing - recording SQL double, not PostgreSQL", () => {
  it("uses one checked-out client and transaction-local project scope", async () => {
    const client = new RecordingClient(),
      pool = fakePool(client),
      db = new PlatformDatabase(pool);
    await db.scoped(scope, async (tx) => {
      db.requireScope(tx, scope);
      await db.query(tx, "SELECT $1", ["fixture"]);
    });
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(client.calls.map((c) => c.sql)).toEqual([
      "BEGIN",
      expect.stringContaining("set_config"),
      "SELECT $1",
      "COMMIT",
    ]);
    expect(client.calls[1].values).toEqual([
      scope.workspaceId,
      scope.projectId,
      "live",
      "sentinel",
    ]);
    expect(client.release).toHaveBeenCalledWith(false);
  });
  it("rolls back domain, job and outbox writes together when work fails", async () => {
    const client = new RecordingClient(),
      db = new PlatformDatabase(fakePool(client));
    await expect(
      db.scoped(scope, async (tx) => {
        await db.query(tx, "domain write");
        await db.query(tx, "job write");
        await db.query(tx, "outbox write");
        throw new Error("fixture failure");
      }),
    ).rejects.toThrow("fixture failure");
    expect(client.calls.at(-1)?.sql).toBe("ROLLBACK");
    expect(client.calls.some((c) => c.sql === "COMMIT")).toBe(false);
  });
  it("rejects escaped, foreign and cross-project transaction handles", async () => {
    const client = new RecordingClient(),
      db = new PlatformDatabase(fakePool(client)),
      other = new PlatformDatabase(fakePool(client));
    let escaped: { transactionId: string } | undefined;
    await db.scoped(scope, async (tx) => {
      escaped = tx;
      expect(() =>
        db.requireScope(tx, { ...scope, projectId: "github-456" }),
      ).toThrow();
      expect(() => other.query(tx, "forbidden")).toThrow();
    });
    expect(() => db.query(escaped!, "after commit")).toThrow();
  });
  it("denies a browser demo namespace and worker operations on an app client", async () => {
    const client = new RecordingClient(),
      db = new PlatformDatabase(fakePool(client));
    expect(() =>
      db.scoped({ ...scope, mode: "demo" }, async () => {}),
    ).toThrow();
    await db.transaction(async (tx) => {
      expect(() => db.requireWorker(tx)).toThrow();
      expect(() => db.requireScope(tx, scope)).toThrow();
    });
  });
  it("destroys a client whose rollback fails instead of returning a dirty connection", async () => {
    const client = new RecordingClient(),
      db = new PlatformDatabase(fakePool(client));
    client.respond = async (sql) => {
      if (sql === "ROLLBACK") throw new Error("broken connection");
      return { rows: [], rowCount: 0 };
    };
    await expect(
      db.transaction(async () => {
        throw new Error("work failed");
      }),
    ).rejects.toThrow("work failed");
    expect(client.release).toHaveBeenCalledWith(true);
  });
});
