import { describe, expect, it } from "vitest";
import { PlatformDatabase } from "../../src/platform/database";
import { retainTelemetry } from "../../src/features/sentinel/telemetry/store";
import { RecordingClient, fakePool, scope } from "../platform/helpers";

describe("least-privilege telemetry retention protocol (SQL doubles)", () => {
  it("serializes on the binding and deletes with no telemetry UPDATE/row-lock privilege", async () => {
    const client = new RecordingClient();
    client.respond = async (sql) => {
      if (/telemetry_/.test(sql) && /FOR UPDATE|FOR SHARE|^UPDATE/.test(sql))
        throw Error("42501");
      return sql.startsWith("SELECT retention_hold")
        ? { rows: [{ retention_hold: false }], rowCount: 1 }
        : { rows: [], rowCount: sql.startsWith("DELETE") ? 3 : 0 };
    };
    expect(
      await retainTelemetry(
        new PlatformDatabase(fakePool(client), true),
        scope,
      ),
    ).toEqual({ events: 3, batches: 3 });
    expect(
      client.calls.find((c) => c.sql.startsWith("SELECT retention_hold"))?.sql,
    ).toContain("FOR UPDATE");
    const deletes = client.calls.filter((c) => c.sql.startsWith("DELETE"));
    expect(deletes).toHaveLength(2);
    for (const d of deletes) {
      expect(d.values).toEqual([
        scope.mode,
        scope.workspaceId,
        scope.projectId,
      ]);
      expect(d.sql).toContain("LIMIT 100");
      expect(d.sql).toContain(
        "WHERE mode=$1 AND workspace_id=$2 AND project_id=$3",
      );
    }
    expect(deletes[0].sql).toContain("j.state IN ('queued','leased')");
    expect(client.calls.at(-1)?.sql).toBe("COMMIT");
  });
  it.each([{ rows: [] }, { rows: [{ retention_hold: true }] }])(
    "does no deletion for absent or held scope",
    async ({ rows }) => {
      const client = new RecordingClient();
      client.respond = async () => ({ rows, rowCount: rows.length });
      expect(
        await retainTelemetry(
          new PlatformDatabase(fakePool(client), true),
          scope,
        ),
      ).toEqual({ events: 0, batches: 0 });
      expect(client.calls.some((c) => c.sql.startsWith("DELETE"))).toBe(false);
    },
  );
  it.each([false, true])(
    "rejects app or Guard authority before any retention SQL (worker=%s)",
    async (worker) => {
      const client = new RecordingClient();
      await expect(
        retainTelemetry(
          new PlatformDatabase(
            fakePool(client),
            worker,
            worker ? "guard" : "sentinel",
          ),
          scope,
        ),
      ).rejects.toThrow("scope_denied");
      expect(
        client.calls.some((c) => /SELECT retention_hold|^DELETE/.test(c.sql)),
      ).toBe(false);
    },
  );
  it("rolls back the whole cleanup when receipt deletion fails", async () => {
    const client = new RecordingClient();
    client.respond = async (sql) => {
      if (sql.startsWith("DELETE FROM sentinel.telemetry_batches"))
        throw Error("injected_failure");
      return {
        rows: sql.startsWith("SELECT retention_hold")
          ? [{ retention_hold: false }]
          : [],
        rowCount: 1,
      };
    };
    await expect(
      retainTelemetry(new PlatformDatabase(fakePool(client), true), scope),
    ).rejects.toThrow("injected_failure");
    expect(client.calls.at(-1)?.sql).toBe("ROLLBACK");
  });
});
