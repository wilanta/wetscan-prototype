import { afterEach, describe, expect, it, vi } from "vitest";
import { PlatformDatabase } from "../../src/platform/database";
import { TelemetryStore } from "../../src/features/sentinel/telemetry/store";
import { RecordingClient, fakePool, scope } from "../platform/helpers";

const context = {
  scope,
  actorId: "github-user-7",
  repositoryId: "123",
  canvasProjectRef: "github-user-7/github-123",
};
const source = "11111111-1111-4111-8111-111111111111";
const ids = [1, 2, 3, 4].map(
  (n) => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`,
);
const canonical = (s: string) =>
  s.replace(
    /(?:\.(\d+))?Z$/,
    (_, fraction = "") => `.${fraction.padEnd(6, "0")}Z`,
  );

function fixture() {
  const client = new RecordingClient();
  let clock = "2026-11-15T08:00:00.124001Z";
  const records = ids.slice(0, 3).map((id, i) => ({
    source_id: source,
    event_id: id,
    cursor_at:
      i === 0 ? "2026-11-15T08:00:00.123455Z" : "2026-11-15T08:00:00.123456Z",
    ingested_at: "2026-11-15T08:00:00.123456Z",
    occurred_at: "2026-11-15T08:00:00Z",
    event: { eventId: id },
    origin: "controlled_test",
  }));
  client.respond = async (sql, params) => {
    if (sql.includes("AS query_now"))
      return { rows: [{ query_now: clock }], rowCount: 1 };
    if (!sql.startsWith("SELECT e.*")) return { rows: [], rowCount: 0 };
    const selected = records
      .filter(
        (r) =>
          r.cursor_at >= canonical(String(params[6])) &&
          r.cursor_at <= canonical(String(params[7])) &&
          (!params[8] ||
            [r.cursor_at, r.source_id, r.event_id].join("/") <
              [params[8], params[9], params[10]].join("/")),
      )
      .sort((a, b) =>
        [b.cursor_at, b.source_id, b.event_id]
          .join("/")
          .localeCompare([a.cursor_at, a.source_id, a.event_id].join("/")),
      )
      .slice(0, Number(params[12]));
    return { rows: selected, rowCount: selected.length };
  };
  return {
    store: new TelemetryStore(new PlatformDatabase(fakePool(client))),
    client,
    records,
    advance: () => {
      clock = "2026-11-15T09:00:00.999999Z";
    },
  };
}
afterEach(() => vi.useRealTimers());
describe("event pagination window regressions (SQL doubles, not PostgreSQL)", () => {
  it.each([-10000, 0, 10000])(
    "immediate retrieval uses database time with host offset %i ms, including submillisecond rows",
    async (offset) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.parse("2026-11-15T08:00:00.123Z") + offset);
      const { store } = fixture();
      const page = await store.events(context, new URLSearchParams());
      expect(page.items.map((i) => i.event.eventId).sort()).toEqual(
        ids.slice(0, 3),
      );
      expect(page.window).toEqual({
        from: "2026-11-14T08:00:00.124001Z",
        to: "2026-11-15T08:00:00.124001Z",
      });
    },
  );
  it("keeps one precise window through ties, microsecond boundaries and later inserts", async () => {
    const { store, records, advance, client } = fixture();
    const q = new URLSearchParams({ limit: "1", sourceId: source });
    const first = await store.events(context, q);
    expect(first.items[0].event.eventId).toBe(ids[2]);
    records.push({
      ...records[0],
      event_id: ids[3],
      event: { eventId: ids[3] },
      cursor_at: "2026-11-15T08:00:00.124002Z",
    });
    advance();
    const visited = [first.items[0].event.eventId];
    let next = first.nextCursor;
    while (next && visited.length < 5) {
      q.set("cursor", next);
      const page = await store.events(context, q);
      expect(page.window).toEqual(first.window);
      visited.push(...page.items.map((i) => i.event.eventId));
      next = page.nextCursor;
    }
    expect(visited).toEqual([ids[2], ids[1], ids[0]]);
    expect(
      client.calls.filter((c) => c.sql.includes("AS query_now")),
    ).toHaveLength(1);
  });
  it("honors inclusive explicit microsecond bounds without consulting the host clock", async () => {
    const { store } = fixture();
    const page = await store.events(
      context,
      new URLSearchParams({
        from: "2026-11-15T08:00:00.123456Z",
        to: "2026-11-15T08:00:00.123456Z",
      }),
    );
    expect(page.items.map((i) => i.event.eventId)).toEqual([ids[2], ids[1]]);
    expect(page.window.from).toBe("2026-11-15T08:00:00.123456Z");
  });
  it("rejects changed cursor windows, scope and filters", async () => {
    const { store } = fixture();
    const first = await store.events(
      context,
      new URLSearchParams({ limit: "1" }),
    );
    for (const [key, value] of [
      ["to", "2026-11-15T09:00:00Z"],
      ["kind", "auth.failed"],
    ]) {
      await expect(
        store.events(
          context,
          new URLSearchParams({ cursor: first.nextCursor!, [key]: value }),
        ),
      ).rejects.toThrow();
    }
    await expect(
      store.events(
        { ...context, scope: { ...scope, projectId: "github-456" } },
        new URLSearchParams({ cursor: first.nextCursor! }),
      ),
    ).rejects.toThrow("invalid_cursor");
  });
});
