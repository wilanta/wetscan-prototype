import { describe, it, expect, vi } from "vitest";
import { DetectionStore } from "../../src/features/sentinel/detection/store";
import { PlatformDatabase } from "../../src/platform/database";
import { RecordingClient, fakePool, scope } from "../platform/helpers";
import {
  context,
  rule,
  event,
  ruleRow,
  eventRow,
  ruleId,
  alertId,
  detectionLease,
  start,
} from "./detection-fixtures";
import { PostgresQueue } from "../../src/platform/queue";
import { detectionActivation } from "../../src/features/sentinel/detection/activation";
import { retainTelemetry } from "../../src/features/sentinel/telemetry/store";
import { retainDetection } from "../../src/features/sentinel/detection/retention";
import { executeLease } from "../../worker/sentinel/executor";

function setup(
  options: {
    worker?: boolean;
    prior?: boolean;
    cooling?: boolean;
    existingAlert?: boolean;
    leaseLost?: boolean;
    failEvidence?: boolean;
  } = {},
) {
  const c = new RecordingClient();
  c.authorizedProject = scope.projectId;
  c.respond = async (sql) => {
    if (sql.startsWith("SELECT job_id FROM platform.jobs"))
      return {
        rows: options.leaseLost ? [] : [{ job_id: "job-1" }],
        rowCount: options.leaseLost ? 0 : 1,
      };
    if (sql.startsWith("SELECT r.*")) return { rows: [ruleRow()], rowCount: 1 };
    if (sql.includes("SELECT e.*") && sql.includes("event_id=$5"))
      return { rows: [eventRow()], rowCount: 1 };
    if (sql.includes("SELECT e.*"))
      return {
        rows: Array.from({ length: 5 }, (_, i) => eventRow(event(i + 1))),
        rowCount: 5,
      };
    if (sql.startsWith("SELECT outcome"))
      return {
        rows: options.prior ? [{ outcome: "alert_created" }] : [],
        rowCount: options.prior ? 1 : 0,
      };
    if (sql.startsWith("SELECT alert_id"))
      return {
        rows: options.existingAlert ? [{ alert_id: alertId }] : [],
        rowCount: options.existingAlert ? 1 : 0,
      };
    if (sql.startsWith("SELECT last_alert_at"))
      return { rows: [{ active: !!options.cooling }], rowCount: 1 };
    if (sql.startsWith("SELECT count(*)"))
      return { rows: [{ n: 0 }], rowCount: 1 };
    if (
      options.failEvidence &&
      sql.startsWith("INSERT INTO sentinel.detection_evidence")
    )
      throw Error("fixture database failure");
    return { rows: [], rowCount: 1 };
  };
  return {
    c,
    store: new DetectionStore(
      new PlatformDatabase(fakePool(c), options.worker ?? false),
    ),
  };
}
describe("S03 persistence protocols - SQL doubles, not live database evidence", () => {
  it("refuses processing and retention through a Guard-module database handle",async()=>{
    const c=new RecordingClient(),db=new PlatformDatabase(fakePool(c),true,"guard");
    await expect(new DetectionStore(db).process(detectionLease(),new AbortController().signal)).rejects.toThrow("scope_denied");
    await expect(retainDetection(db,scope)).rejects.toThrow("scope_denied");
    expect(c.calls).toHaveLength(0);
  });
  it("persists alert, evidence and evaluation in one scoped transaction before commit", async () => {
    const { c, store } = setup({ worker: true });
    expect(
      await store.process(detectionLease(), new AbortController().signal),
    ).toEqual(["alert_created"]);
    const sql = c.calls.map((x) => x.sql);
    expect(
      sql.some((x) => x.startsWith("INSERT INTO sentinel.detection_alerts")),
    ).toBe(true);
    expect(
      sql.findIndex(
        (x) => x.includes("FOR UPDATE") && x.includes("lease_token"),
      ),
    ).toBeLessThan(
      sql.findIndex((x) =>
        x.startsWith("INSERT INTO sentinel.detection_alerts"),
      ),
    );
    expect(
      sql.filter((x) =>
        x.startsWith("INSERT INTO sentinel.detection_evidence"),
      ),
    ).toHaveLength(1);
    expect(sql.at(-1)).toBe("COMMIT");
    expect(sql.some((x) => x.includes("notification_outbox"))).toBe(false);
  });
  it("rolls back every side effect when evidence insertion fails", async () => {
    const { c, store } = setup({ worker: true, failEvidence: true });
    await expect(
      store.process(detectionLease(), new AbortController().signal),
    ).rejects.toThrow();
    expect(c.calls.at(-1)?.sql).toBe("ROLLBACK");
  });
  it("persisted evaluation short-circuits duplicate delivery after a crash before acknowledgment", async () => {
    const { c, store } = setup({ worker: true, prior: true });
    expect(
      await store.process(detectionLease(), new AbortController().signal),
    ).toEqual(["alert_created"]);
    expect(c.calls.some((x) => x.sql.startsWith("INSERT"))).toBe(false);
  });
  it("updates an existing window without allocating another alert or cooldown", async () => {
    const { c, store } = setup({ worker: true, existingAlert: true });
    expect(
      await store.process(detectionLease(), new AbortController().signal),
    ).toEqual(["alert_deduplicated"]);
    expect(
      c.calls.some((x) =>
        x.sql.startsWith("INSERT INTO sentinel.detection_alerts"),
      ),
    ).toBe(false);
    expect(
      c.calls.some((x) => x.sql.startsWith("UPDATE sentinel.detection_alerts")),
    ).toBe(true);
  });
  it("cooldown persists a suppressed match without discarding the source evidence", async () => {
    const { c, store } = setup({ worker: true, cooling: true });
    expect(
      await store.process(detectionLease(), new AbortController().signal),
    ).toEqual(["alert_suppressed"]);
    const call = c.calls.find((x) =>
      x.sql.startsWith("INSERT INTO sentinel.detection_evaluations"),
    )!;
    expect(call.values).toContain("cooldown");
    expect(call.values).toContain(true);
    expect(c.calls.some((x) => x.sql.startsWith("DELETE"))).toBe(false);
  });
  it.each(["app", "guard", "unsupported", "malformed", "lost", "cancelled"])(
    "rejects %s processing authority before writes",
    async (type) => {
      const { c, store } = setup({
          worker: type !== "app",
          leaseLost: type === "lost",
        }),
        l = detectionLease(),
        stop = new AbortController();
      if (type === "guard") l.job.module = "guard";
      if (type === "unsupported") l.job.kind = "sentinel.outbox";
      if (type === "malformed") l.job.subjectRef = "invalid";
      if (type === "cancelled") stop.abort();
      await expect(store.process(l, stop.signal)).rejects.toThrow();
      expect(c.calls.some((x) => /^(INSERT|UPDATE|DELETE)/.test(x.sql))).toBe(
        false,
      );
    },
  );
  it("rule update uses expected revision and rejects enabled edits", async () => {
    const { c, store } = setup();
    await expect(
      store.command(context, {
        action: "update",
        ruleId,
        expectedRevision: 1,
        definition: rule().definition,
      }),
    ).rejects.toThrow("revision_conflict");
    await expect(
      store.command(context, {
        action: "update",
        ruleId,
        expectedRevision: 2,
        definition: rule().definition,
      }),
    ).rejects.toThrow("disable_before_edit");
    expect(c.calls.some((x) => x.sql.startsWith("UPDATE"))).toBe(false);
  });
  it("disable appends immutable definition/audit and advances one revision", async () => {
    const { c, store } = setup();
    expect(
      await store.command(context, {
        action: "disable",
        ruleId,
        expectedRevision: 2,
      }),
    ).toMatchObject({ revision: 3, status: "DISABLED" });
    expect(
      c.calls.some((x) =>
        x.sql.startsWith("UPDATE sentinel.detection_rule_versions"),
      ),
    ).toBe(false);
    expect(
      c.calls.find((x) =>
        x.sql.startsWith("INSERT INTO sentinel.detection_audit"),
      )?.values,
    ).toContain("github-user-7");
  });
  it("unregistered bindings never get silently enabled by rule management", async () => {
    const { c, store } = setup();
    c.authorizedProject = undefined;
    const respond = c.respond;
    c.respond = async (s, v) =>
      s.startsWith("SELECT project_id FROM sentinel.project_bindings")
        ? { rows: [], rowCount: 0 }
        : respond(s, v);
    await expect(
      store.command(context, {
        action: "create",
        definition: rule().definition,
      }),
    ).rejects.toThrow("project_not_registered");
    expect(c.calls.some((x) => x.sql.startsWith("INSERT"))).toBe(false);
  });
  it("seeding twice returns existing IDs without changing their state", async () => {
    const { c, store } = setup();
    const respond = c.respond;
    c.respond = async (s, v) =>
      s.startsWith("SELECT rule_id FROM sentinel.detection_rules")
        ? { rows: [{ rule_id: ruleId }], rowCount: 1 }
        : respond(s, v);
    expect(await store.command(context, { action: "seed" })).toMatchObject({
      ruleIds: [ruleId, ruleId, ruleId, ruleId],
      automaticallyEnabled: false,
    });
    expect(c.calls.some((x) => x.sql.startsWith("INSERT"))).toBe(false);
  });
  it.each([
    "severity=critical",
    "severity=",
    "sourceId=",
    "ruleId=",
    "ruleId=notuuid",
    "sourceId=notuuid",
    "limit=101",
    "limit=0",
    "sql=select",
    "severity=low&severity=high",
    "from=2026-11-15T00:00:00Z&to=2026-11-14T00:00:00Z",
    "cursor=bad",
  ])("rejects invalid alert query %s", async (q) => {
    const { store } = setup();
    await expect(
      store.alerts(context, new URLSearchParams(q)),
    ).rejects.toThrow();
  });
  it("alert cursor preserves DB microseconds and a fixed filter/window", async () => {
    const { c, store } = setup();
    const respond = c.respond;
    const row = {
      ...eventRow(),
      alert_id: alertId,
      rule_id: ruleId,
      rule_version: 2,
      rule_name: "HTTP",
      category: "http",
      severity: "low",
      confidence: 40,
      correlation_key: "a".repeat(64),
      window_start: start,
      window_end: "2026-11-15T00:05:00Z",
      first_observed_at: start,
      last_observed_at: start,
      detected_at: start,
      matched_event_count: 5,
      deduplication_key: "b".repeat(64),
      cursor_at: "2026-11-15T00:00:00.123456Z",
    };
    c.respond = async (sql, v) =>
      sql.includes("AS query_now")
        ? { rows: [{ query_now: "2026-11-15T00:01:00.123456Z" }], rowCount: 1 }
        : sql.startsWith("SELECT a.*")
          ? { rows: [row, row], rowCount: 2 }
          : respond(sql, v);
    const page = await store.alerts(context, new URLSearchParams("limit=1"));
    expect(page.window.to).toBe("2026-11-15T00:01:00.123456Z");
    expect(page.window.from).toBe("2026-11-14T00:01:00.123456Z");
    expect(page.nextCursor).toBeTruthy();
    const cursor = JSON.parse(
      Buffer.from(page.nextCursor!, "base64url").toString(),
    );
    expect(cursor.at).toBe(row.cursor_at);
    await store.alerts(
      context,
      new URLSearchParams({ limit: "1", cursor: page.nextCursor! }),
    );
    const call = c.calls.filter((x) => x.sql.startsWith("SELECT a.*")).at(-1)!;
    expect(call.values[8]).toBe(row.cursor_at);
    await expect(
      store.alerts(
        context,
        new URLSearchParams({ severity: "high", cursor: page.nextCursor! }),
      ),
    ).rejects.toThrow("invalid_cursor");
  });
  it.each([
    "from=2026-11-15T00:00:00.000002Z&to=2026-11-15T00:00:00.000001Z",
    "from=2026-10-15T00:00:00.000000Z&to=2026-11-15T00:00:00.000001Z",
  ])("enforces alert windows with microsecond precision: %s", async (query) => {
    const { store } = setup();
    await expect(
      store.alerts(context, new URLSearchParams(query)),
    ).rejects.toThrow("invalid_window");
  });
});
describe("S03 activation, cutoff and retention protocols", () => {
  const base = {
    schemaVersion: 1 as const,
    status: "APPROVED" as const,
    approvedBy: "fixture",
    approvedAt: start,
    target: {
      host: "127.0.0.1",
      port: 55432,
      database: "wetscan_s01_test",
      marker: "wetscan-s01:00000000-0000-4000-8000-000000000001",
    },
    actions: ["runtime" as const],
    migrationPlanSha256: "a".repeat(64),
  };
  it("requires a separate scoped activation extension; default remains disabled", () => {
    expect(detectionActivation(base, false)).toBeUndefined();
    expect(() => detectionActivation(base, true)).toThrow("approval_required");
  });
  it("refuses cutoff before approval, unknown keys and non-live scopes", () => {
    for (const change of [
      { notBefore: "2026-11-14T00:00:00Z" },
      { mode: "demo" },
      { replayOldJobs: true },
    ])
      expect(() =>
        detectionActivation(
          {
            ...base,
            detection: {
              ...scope,
              notBefore: start,
              processNewTelemetry: true,
              ...change,
            },
          } as typeof base,
          true,
        ),
      ).toThrow("approval_required");
  });
  it("retains the exact approved project and new-job cutoff", () => {
    expect(
      detectionActivation(
        {
          ...base,
          detection: { ...scope, notBefore: start, processNewTelemetry: true },
        } as typeof base,
        true,
      ),
    ).toEqual({ scope, notBefore: start });
  });
  it("queue cutoff applies to claim and expired-lease housekeeping; Guard remains denied", async () => {
    const c = new RecordingClient();
    c.authorizedProject = scope.projectId;
    c.respond = async (sql) => ({
      rows: sql.includes("max_running")
        ? [{ max_running: 2 }]
        : sql.includes("count(*)")
          ? [{ n: 0 }]
          : [],
      rowCount: 1,
    });
    const q = new PostgresQueue(
      new PlatformDatabase(fakePool(c), true),
      scope,
      ["sentinel.telemetry.accepted"],
      start,
    );
    await q.claim({
      module: "sentinel",
      workerId: "fixture",
      limit: 2,
      leaseMs: 30000,
    });
    const call = c.calls.find((x) => x.sql.startsWith("WITH candidates"))!;
    expect(call.sql).toContain("created_at>=$9");
    expect(call.values[8]).toBe(start);
    expect(
      c.calls
        .find((x) => x.sql.includes("attempts_exhausted"))
        ?.values.slice(4),
    ).toEqual([start, ["sentinel.telemetry.accepted"]]);
    await expect(
      q.claim({
        module: "guard",
        workerId: "fixture",
        limit: 1,
        leaseMs: 30000,
      }),
    ).rejects.toThrow("scope_denied");
  });
  it("telemetry retention excludes durable alert and evaluation references", async () => {
    const c = new RecordingClient();
    c.respond = async () => ({
      rows: [{ retention_hold: false }],
      rowCount: 1,
    });
    await retainTelemetry(new PlatformDatabase(fakePool(c), true), scope, true);
    const sql = c.calls.find((x) =>
      x.sql.startsWith("DELETE FROM sentinel.telemetry_events"),
    )!.sql;
    expect(sql).toContain("sentinel.detection_evidence");
    expect(sql).toContain("sentinel.detection_evaluations");
  });
  it("legal hold prevents derived deletion and linked events remain protected", async () => {
    const c = new RecordingClient();
    c.respond = async () => ({ rows: [{ retention_hold: true }], rowCount: 1 });
    expect(
      await retainDetection(new PlatformDatabase(fakePool(c), true), scope),
    ).toEqual({ alerts: 0, evaluations: 0 });
    expect(c.calls.some((x) => x.sql.startsWith("DELETE"))).toBe(false);
  });
  it("retention failure rolls back evidence releases as a unit", async () => {
    const c = new RecordingClient();
    c.respond = async (s) => {
      if (s.startsWith("DELETE")) throw Error("failure");
      return { rows: [{ retention_hold: false }], rowCount: 1 };
    };
    await expect(
      retainDetection(new PlatformDatabase(fakePool(c), true), scope),
    ).rejects.toThrow();
    expect(c.calls.at(-1)?.sql).toBe("ROLLBACK");
  });
  it("handler receives current lease revisions after heartbeat renewal", async () => {
    vi.useFakeTimers();
    try {
      const l = detectionLease(),
        q = {
          enqueue: vi.fn(),
          claim: vi.fn(),
          cancel: vi.fn(),
          heartbeat: vi.fn(async () => ({
            ...l,
            job: { ...l.job, revision: l.job.revision + 1 },
          })),
          complete: vi.fn(),
          retry: vi.fn(),
        };
      let current: (() => typeof l) | undefined, finish!: () => void;
      const run = executeLease(
        q,
        l,
        async (_job, _signal, getLease) => {
          current = getLease;
          await new Promise<void>((r) => {
            finish = r;
          });
        },
        {
          heartbeatMs: 10,
          timeoutMs: 100,
          signal: new AbortController().signal,
        },
      );
      await vi.advanceTimersByTimeAsync(11);
      expect(current!().job.revision).toBe(l.job.revision + 1);
      finish();
      expect(await run).toBe("completed");
    } finally {
      vi.useRealTimers();
    }
  });
});
