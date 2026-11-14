import { describe, expect, it } from "vitest";
import { PlatformDatabase } from "../../src/platform/database";
import { platformHealth } from "../../src/platform/health";
import {
  retainInfrastructure,
  retainWorkerHeartbeats,
} from "../../src/platform/retention";
import { disableProject } from "../../src/features/sentinel/storage/projects";
import { RecordingClient, fakePool, scope } from "./helpers";

describe("health, retention and revocation failure paths - SQL doubles", () => {
  it("refuses heartbeat cleanup on an app principal before issuing a delete", async () => {
    const client = new RecordingClient();
    await expect(
      retainWorkerHeartbeats(new PlatformDatabase(fakePool(client))),
    ).rejects.toThrow("scope_denied");
    expect(client.calls.some((c) => c.sql.startsWith("DELETE"))).toBe(false);
  });
  it("reports unavailable without leaking driver secrets or claiming telemetry", async () => {
    const pool = fakePool(new RecordingClient());
    pool.connect = async () => {
      throw new Error("secret driver details");
    };
    const health = await platformHealth(new PlatformDatabase(pool, true));
    expect(health.status).toBe("unavailable");
    expect(health.telemetry).toBe("not_implemented");
    expect(JSON.stringify(health)).not.toContain("secret");
  });
  it.each(["hold", "not_due", "missing"])(
    "does not delete infrastructure when retention is %s",
    async (reason) => {
      const client = new RecordingClient();
      client.respond = async (sql) => ({
        rows:
          sql.startsWith("SELECT retention_hold") && reason !== "missing"
            ? [{ retention_hold: reason === "hold", due: reason !== "not_due" }]
            : [],
        rowCount: 0,
      });
      expect(
        await retainInfrastructure(
          new PlatformDatabase(fakePool(client), true),
          scope,
        ),
      ).toEqual({ deletedJobs: 0, deletedOutbox: 0 });
      expect(client.calls.some((c) => c.sql.startsWith("DELETE"))).toBe(false);
    },
  );
  it("rolls back disabling a binding and cancelling jobs if attempt cleanup fails", async () => {
    const client = new RecordingClient(),
      db = new PlatformDatabase(fakePool(client));
    client.respond = async (sql) => {
      if (sql.startsWith("UPDATE platform.job_attempts"))
        throw new Error("fixture cleanup failure");
      return { rows: [], rowCount: 1 };
    };
    await expect(
      db.scoped(scope, (tx) => disableProject(db, tx, scope)),
    ).rejects.toThrow("fixture cleanup failure");
    expect(
      client.calls.some((c) => c.sql.startsWith("UPDATE platform.jobs")),
    ).toBe(true);
    expect(client.calls.at(-1)?.sql).toBe("ROLLBACK");
    expect(client.calls.some((c) => c.sql === "COMMIT")).toBe(false);
  });
});
