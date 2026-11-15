import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { PlatformDatabase } from "../../src/platform/database";
import { RecordingClient, fakePool, scope } from "../platform/helpers";
import {
  TelemetryStore,
  retainTelemetry,
} from "../../src/features/sentinel/telemetry/store";
import {
  hash,
  issueCredential,
  parseBatch,
} from "../../src/features/sentinel/telemetry/validation";
import { fingerprint } from "../../src/platform/identity";
const context = {
  scope,
  actorId: "github-user-7",
  repositoryId: "123",
  canvasProjectRef: "github-user-7/github-123",
};
const sourceId = randomUUID(),
  key = issueCredential(scope, sourceId);
const input = () => {
  const at = new Date().toISOString();
  return {
    schemaVersion: 1,
    batchId: randomUUID(),
    sentAt: at,
    events: [
      {
        schemaVersion: 1,
        eventId: randomUUID(),
        projectId: scope.projectId,
        occurredAt: at,
        kind: "http.request",
        request: { routeTemplate: "/api/users/alice?token=private" },
      },
    ],
  };
};
function setup() {
  const client = new RecordingClient();
  client.authorizedProject = scope.projectId;
  client.respond = async (sql) => ({
    rows: sql.startsWith("SELECT s.*")
      ? [{ ...scope, project_id: scope.projectId, server_now: new Date() }]
      : sql.startsWith("SELECT token_hash")
        ? [{ token_hash: key.digest }]
        : sql.includes("count(*)")
          ? [{ n: 0, queued_count: 0 }]
          : [],
    rowCount: 1,
  });
  const db = new PlatformDatabase(fakePool(client));
  return { client, db, store: new TelemetryStore(db) };
}
describe("S02 transactional store protocol (SQL doubles; NOT PostgreSQL)", () => {
  it("atomically persists only redacted event and a scoped durable reference", async () => {
    const { client, store } = setup(),
      receipt = await store.ingest(key.token, input());
    expect(receipt.events).toHaveLength(1);
    const sql = client.calls.find((c) =>
      c.sql.startsWith("INSERT INTO sentinel.telemetry_events"),
    )!;
    expect(sql.values.slice(0, 4)).toEqual([
      "live",
      scope.workspaceId,
      scope.projectId,
      sourceId,
    ]);
    expect(sql.values.at(-1)).not.toMatch(/alice|private|token/);
    expect(
      client.calls.find((c) => c.sql.startsWith("INSERT INTO platform.jobs"))
        ?.values,
    ).toContain("sentinel.telemetry.accepted");
    expect(client.calls.at(-1)?.sql).toBe("COMMIT");
    const locking = client.calls.findIndex((c) =>
        c.sql.startsWith("SELECT project_id"),
      ),
      counting = client.calls.findIndex((c) =>
        c.sql.includes("count(*)::int AS n FROM sentinel.telemetry_events"),
      );
    expect(locking).toBeLessThan(counting);
  });
  it.each([undefined, "f".repeat(64)])(
    "rejects missing/revoked or invalid credential before event writes",
    async (digest) => {
      const { client, store } = setup(),
        respond = client.respond;
      client.respond = async (sql, values) =>
        sql.startsWith("SELECT token_hash")
          ? { rows: digest ? [{ token_hash: digest }] : [], rowCount: 0 }
          : respond(sql, values);
      await expect(store.ingest(key.token, input())).rejects.toThrow(
        "invalid_credential",
      );
      expect(client.calls.some((c) => c.sql.startsWith("INSERT"))).toBe(false);
      expect(client.calls.at(-1)?.sql).toBe("ROLLBACK");
    },
  );
  it("rejects nonexistent/disabled/wrong-scope source", async () => {
    const { client, store } = setup(),
      respond = client.respond;
    client.respond = async (sql, values) =>
      sql.startsWith("SELECT s.*")
        ? { rows: [], rowCount: 0 }
        : respond(sql, values);
    await expect(store.ingest(key.token, input())).rejects.toThrow(
      "invalid_credential",
    );
    expect(client.calls[2].values.slice(0, 4)).toEqual([
      "live",
      scope.workspaceId,
      scope.projectId,
      sourceId,
    ]);
  });
  it("returns original receipt on identical nonce; changed nonce content conflicts", async () => {
    const { client, store } = setup(),
      b = input(),
      digest = fingerprint(parseBatch(b, scope.projectId, Date.now())),
      respond = client.respond,
      receipt = [{ eventId: b.events[0].eventId, duplicate: false }];
    client.respond = async (sql, values) =>
      sql.startsWith("SELECT fingerprint,receipt")
        ? { rows: [{ fingerprint: digest, receipt }], rowCount: 1 }
        : respond(sql, values);
    expect((await store.ingest(key.token, b)).duplicate).toBe(true);
    expect(client.calls.some((c) => c.sql.startsWith("INSERT"))).toBe(false);
    b.events[0].kind = "auth.failed";
    await expect(store.ingest(key.token, b)).rejects.toThrow("replay_conflict");
  });
  it("deduplicates event ID across batches without another job", async () => {
    const { client, store } = setup(),
      b = input(),
      eventHash = fingerprint(
        parseBatch(b, scope.projectId, Date.now()).events[0],
      ),
      respond = client.respond;
    client.respond = async (sql, values) =>
      sql.startsWith("SELECT fingerprint FROM sentinel.telemetry_events")
        ? { rows: [{ fingerprint: eventHash }], rowCount: 1 }
        : respond(sql, values);
    expect((await store.ingest(key.token, b)).events[0].duplicate).toBe(true);
    expect(
      client.calls.some((c) => c.sql.startsWith("INSERT INTO platform.jobs")),
    ).toBe(false);
  });
  it("rolls back all event writes if enqueue capacity is exhausted", async () => {
    const { client, store } = setup(),
      respond = client.respond;
    client.respond = async (sql, values) =>
      sql.includes("AS queued_count")
        ? { rows: [{ queued_count: 1000 }], rowCount: 1 }
        : respond(sql, values);
    await expect(store.ingest(key.token, input())).rejects.toMatchObject({
      code: "pending_processing_limit",
      status: 429,
    });
    expect(
      client.calls.some((c) =>
        c.sql.startsWith("INSERT INTO sentinel.telemetry_events"),
      ),
    ).toBe(true);
    expect(client.calls.at(-1)?.sql).toBe("ROLLBACK");
  });
  it("durable rate rejection prevents event writes", async () => {
    const { client, store } = setup(),
      respond = client.respond;
    client.respond = async (sql, values) =>
      sql.startsWith("UPDATE sentinel.telemetry_sources SET rate_window")
        ? { rows: [], rowCount: 0 }
        : respond(sql, values);
    await expect(store.ingest(key.token, input())).rejects.toMatchObject({
      status: 429,
    });
    expect(client.calls.some((c) => c.sql.startsWith("INSERT"))).toBe(false);
  });
  it.each(["events", "batches"])(
    "project %s capacity rolls back before persistence",
    async (table) => {
      const { client, store } = setup(),
        respond = client.respond;
      client.respond = async (sql, values) =>
        sql.startsWith(
          `SELECT count(*)::int AS n FROM sentinel.telemetry_${table}`,
        )
          ? { rows: [{ n: table === "events" ? 100000 : 10000 }], rowCount: 1 }
          : respond(sql, values);
      await expect(store.ingest(key.token, input())).rejects.toMatchObject({
        status: 429,
      });
      expect(client.calls.some((c) => c.sql.startsWith("INSERT"))).toBe(false);
      expect(client.calls.at(-1)?.sql).toBe("ROLLBACK");
    },
  );
  it("stores a hash, never plaintext, when registering an authorized binding", async () => {
    const { client, store } = setup(),
      created = await store.create(context, {
        name: "Owned local app",
        environment: "local",
        origin: "controlled_test",
      });
    const call = client.calls.find((c) =>
      c.sql.startsWith("INSERT INTO sentinel.telemetry_credentials"),
    )!;
    expect(call.values.at(-1)).toBe(hash(created.credential));
    expect(JSON.stringify(client.calls)).not.toContain(created.credential);
    expect(created.showOnce).toBe(true);
  });
  it("rotation locks source and revokes existing keys before inserting replacement", async () => {
    const { client, store } = setup(),
      respond = client.respond;
    client.respond = async (sql, values) =>
      sql.startsWith("SELECT enabled")
        ? { rows: [{ enabled: true }], rowCount: 1 }
        : respond(sql, values);
    const result = await store.change(context, sourceId, "rotate");
    expect(result).toHaveProperty("credential");
    const revoke = client.calls.findIndex((c) =>
        c.sql.startsWith("UPDATE sentinel.telemetry_credentials"),
      ),
      insert = client.calls.findIndex((c) =>
        c.sql.startsWith("INSERT INTO sentinel.telemetry_credentials"),
      );
    expect(revoke).toBeLessThan(insert);
    expect(
      client.calls.find((c) => c.sql.startsWith("SELECT enabled"))?.sql,
    ).toContain("FOR UPDATE");
  });
  it("unbound cross-project management is not found and rolls back", async () => {
    const { client, store } = setup();
    await expect(
      store.change(context, randomUUID(), "revoke"),
    ).rejects.toMatchObject({ status: 404 });
    expect(client.calls.at(-1)?.sql).toBe("ROLLBACK");
  });
  it("source statuses use actual DB timestamps, never fixture records", async () => {
    const { client, store } = setup();
    client.respond = async () => ({
      rows: [
        {
          workspace_id: scope.workspaceId,
          project_id: scope.projectId,
          source_id: sourceId,
          name: "Owned",
          origin: "controlled_test",
          environment: "local",
          revision: 1,
          enabled: true,
          active_credentials: 1,
          server_now: new Date("2026-11-14T08:10:00Z"),
          last_contact_at: new Date("2026-11-14T08:07:00Z"),
          last_ingested_at: null,
        },
      ],
      rowCount: 1,
    });
    expect((await store.sources(context))[0]).toMatchObject({
      status: "stale",
      lastContactAt: "2026-11-14T08:07:00.000Z",
      lastIngestedAt: null,
    });
  });
  it("cursor binds project, filter and fixed window and preserves PostgreSQL microseconds", async () => {
    const { client, store } = setup(),
      id = randomUUID(),
      at = "2026-11-14T08:00:00.123456Z";
    client.respond = async () => ({
      rows: [
        {
          source_id: sourceId,
          event_id: id,
          cursor_at: at,
          ingested_at: new Date(at),
          occurred_at: new Date(at),
          event: {},
          origin: "runtime",
        },
        { source_id: sourceId, event_id: randomUUID() },
      ],
      rowCount: 2,
    });
    const query = new URLSearchParams({
        limit: "1",
        from: "2026-11-14T00:00:00Z",
        to: "2026-11-15T00:00:00Z",
      }),
      page = await store.events(context, query);
    expect(page.nextCursor).toBeTruthy();
    query.set("cursor", page.nextCursor!);
    await store.events(context, query);
    expect(
      client.calls.findLast((c) => c.sql.startsWith("SELECT e.*"))?.values[8],
    ).toBe(at);
    query.set("severity", "high");
    await expect(store.events(context, query)).rejects.toThrow(
      "invalid_cursor",
    );
  });
  it.each([
    "kind=bad",
    "limit=101",
    "severity=critical",
    "sourceId=bad",
    "from=bad",
    "kind=http.request&kind=auth.failed",
    "unknown=x",
  ])("rejects malformed event filters before connecting: %s", async (raw) => {
    const { store, client } = setup();
    await expect(
      store.events(context, new URLSearchParams(raw)),
    ).rejects.toThrow();
    expect(client.calls).toHaveLength(0);
  });
  it("retention requires worker authority and respects legal hold before deleting", async () => {
    const { db } = setup();
    await expect(retainTelemetry(db, scope)).rejects.toThrow("scope_denied");
    const client = new RecordingClient();
    client.respond = async () => ({
      rows: [{ retention_hold: true }],
      rowCount: 1,
    });
    expect(
      await retainTelemetry(
        new PlatformDatabase(fakePool(client), true),
        scope,
      ),
    ).toEqual({ events: 0, batches: 0 });
    expect(client.calls.some((c) => c.sql.startsWith("DELETE"))).toBe(false);
  });
});
