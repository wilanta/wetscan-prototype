import type { QueryResultRow } from "pg";
import { describe, it, expect } from "vitest";
import { DetectionStore } from "../../src/features/sentinel/detection/store";
import {
  IncidentStore,
  correlateAlertIncident,
} from "../../src/features/sentinel/incidents/store";
import { seedRules } from "../../src/features/sentinel/detection/seeds";
import { evaluate } from "../../src/features/sentinel/detection/evaluator";
import type { SqlClient, SqlPool } from "../../src/platform/database";
import { retainIncidents } from "../../src/features/sentinel/incidents/retention";
import { retainDetection } from "../../src/features/sentinel/detection/retention";
import { retainTelemetry } from "../../src/features/sentinel/telemetry/store";
import { incidentActivation } from "../../src/features/sentinel/incidents/activation";
import { detectionActivation } from "../../src/features/sentinel/detection/activation";
import { PlatformDatabase } from "../../src/platform/database";
import { RecordingClient, fakePool, scope } from "../platform/helpers";
import {
  alertId,
  alertRow,
  context,
  correlationKey,
  detectionLease,
  event,
  eventRow,
  incidentId,
  incidentRow,
  matchKey,
  rule,
  ruleRow,
  sourceId,
  start,
  timelineRows,
} from "./incident-fixtures";

function setup(
  options: {
    worker?: boolean;
    existingIncident?: boolean;
    existingAlert?: boolean;
    cooling?: boolean;
    prior?: boolean;
    missingAlert?: boolean;
    missingEvidence?: boolean;
    failTimeline?: boolean;
    incidentStatus?: "open" | "investigating" | "closed";
    incidentRevision?: number;
    retentionHold?: boolean;
    expiredClosedIncident?: boolean;
  } = {},
) {
  const c = new RecordingClient();
  c.authorizedProject = scope.projectId;
  c.respond = async (sql, values) => {
    if (sql.startsWith("SELECT job_id FROM platform.jobs"))
      return { rows: [{ job_id: "job-1" }], rowCount: 1 };
    if (sql.startsWith("SELECT retention_hold"))
      return {
        rows: [{ retention_hold: !!options.retentionHold }],
        rowCount: 1,
      };
    if (sql.startsWith("SELECT i.incident_id FROM sentinel.incidents i"))
      return {
        rows: options.expiredClosedIncident ? [{ incident_id: incidentId }] : [],
        rowCount: options.expiredClosedIncident ? 1 : 0,
      };
    if (sql.startsWith("SELECT alert_id FROM sentinel.detection_alerts a"))
      return { rows: [{ alert_id: alertId }], rowCount: 1 };
    if (sql.startsWith("SELECT r.*")) return { rows: [ruleRow()], rowCount: 1 };
    if (sql.includes("SELECT e.*") && sql.includes("event_id=$5"))
      return { rows: [eventRow()], rowCount: 1 };
    if (sql.includes("FROM sentinel.detection_evidence l"))
      return {
        rows: options.missingEvidence
          ? []
          : Array.from({ length: 5 }, (_, i) => eventRow(event(i + 1))),
        rowCount: options.missingEvidence ? 0 : 5,
      };
    if (sql.includes("FROM sentinel.incident_evidence ie"))
      return {
        rows: Array.from({ length: 5 }, (_, i) => ({
          ...eventRow(event(i + 1)),
          incident_id: incidentId,
        })),
        rowCount: 5,
      };
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
    if (sql.startsWith("SELECT alert_id FROM sentinel.detection_alerts WHERE"))
      return {
        rows: options.existingAlert ? [{ alert_id: alertId }] : [],
        rowCount: options.existingAlert ? 1 : 0,
      };
    if (sql.startsWith("SELECT a.*,v.definition"))
      return {
        rows: options.missingAlert ? [] : [alertRow()],
        rowCount: options.missingAlert ? 0 : 1,
      };
    if (sql.startsWith("SELECT last_alert_at"))
      return { rows: [{ active: !!options.cooling }], rowCount: 1 };
    if (
      sql.startsWith(
        "SELECT incident_id FROM sentinel.incidents WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND deduplication_key=$4",
      )
    )
      return {
        rows: options.existingIncident ? [{ incident_id: incidentId }] : [],
        rowCount: options.existingIncident ? 1 : 0,
      };
    if (
      sql.startsWith(
        "SELECT incident_id,source_id,status,revision,origin FROM sentinel.incidents",
      )
    )
      return {
        rows: options.missingAlert
          ? []
          : [
              incidentRow({
                status: options.incidentStatus ?? "open",
                revision: options.incidentRevision ?? 1,
              }),
            ],
        rowCount: options.missingAlert ? 0 : 1,
      };
    if (sql.startsWith("SELECT i.*,v.definition->>'name' AS rule_name"))
      return {
        rows: options.missingAlert
          ? []
          : [
              incidentRow({
                status: options.incidentStatus ?? "open",
                revision: options.incidentRevision ?? 1,
              }),
            ],
        rowCount: options.missingAlert ? 0 : 1,
      };
    if (sql.startsWith("SELECT incident_id,alert_id FROM sentinel.incident_alerts"))
      return {
        rows: [{ incident_id: incidentId, alert_id: alertId }],
        rowCount: 1,
      };
    if (sql.includes("FROM sentinel.incident_alerts ia"))
      return { rows: [alertRow()], rowCount: 1 };
    if (
      options.failTimeline &&
      sql.startsWith("INSERT INTO sentinel.incident_timeline(")
    )
      throw Error("fixture timeline failure");
    if (sql.startsWith("INSERT INTO sentinel.incident_timeline("))
      return { rows: [{ timeline_id: values[4] }], rowCount: 1 };
    if (sql.startsWith("SELECT timeline_id FROM sentinel.incident_timeline"))
      return {
        rows: options.existingIncident
          ? timelineRows().map((t) => ({ timeline_id: t.timeline_id }))
          : [],
        rowCount: options.existingIncident ? 2 : 0,
      };
    if (sql.startsWith("UPDATE sentinel.incidents SET first_observed_at="))
      return {
        rows: [{ revision: options.incidentRevision ?? 1 }],
        rowCount: 1,
      };
    if (sql.startsWith("SELECT * FROM sentinel.incident_timeline"))
      return { rows: timelineRows(), rowCount: 2 };
    if (
      sql.startsWith(
        "SELECT timeline_id,source_id,event_id FROM sentinel.incident_timeline_evidence",
      )
    )
      return {
        rows: timelineRows().map((t) => ({
          timeline_id: t.timeline_id,
          source_id: sourceId,
          event_id: event(1).event.eventId,
        })),
        rowCount: 2,
      };
    if (sql.startsWith("SELECT COALESCE(max(sequence),0)::int AS max_seq"))
      return { rows: [{ max_seq: 2 }], rowCount: 1 };
    if (sql.startsWith("SELECT to_char(clock_timestamp()"))
      return {
        rows: [{ query_now: "2026-11-15T00:10:00.000000Z" }],
        rowCount: 1,
      };
    if (sql.startsWith("SELECT count(*)"))
      return { rows: [{ n: 0 }], rowCount: 1 };
    return { rows: [{ incident_id: incidentId }], rowCount: 1 };
  };
  const db = new PlatformDatabase(fakePool(c), options.worker ?? false);
  return {
    c,
    db,
    detectionStore: new DetectionStore(db),
    incidentStore: new IncidentStore(db),
  };
}

describe("S04 incident domain, timeline and retention protocols - SQL doubles", () => {
  it("creates a durable incident and append-only timeline entries when an eligible alert is persisted", async () => {
    const { c, detectionStore } = setup({ worker: true });
    expect(
      await detectionStore.process(
        detectionLease(),
        new AbortController().signal,
        { correlateIncidents: true },
      ),
    ).toEqual(["alert_created"]);
    const sql = c.calls.map((x) => x.sql);
    expect(
      sql.some((x) => x.startsWith("INSERT INTO sentinel.detection_alerts")),
    ).toBe(true);
    expect(
      sql.some((x) => x.startsWith("INSERT INTO sentinel.incidents(")),
    ).toBe(true);
    expect(
      sql.some((x) => x.startsWith("INSERT INTO sentinel.incident_alerts")),
    ).toBe(true);
    expect(
      sql.some((x) => x.startsWith("INSERT INTO sentinel.incident_evidence")),
    ).toBe(true);
    const timelineInserts = c.calls.filter((x) =>
      x.sql.startsWith("INSERT INTO sentinel.incident_timeline("),
    );
    expect(timelineInserts).toHaveLength(2);
    expect(timelineInserts[0].values).toContain("alert_created");
    expect(timelineInserts[1].values).toContain("incident_opened");
    expect(sql.at(-1)).toBe("COMMIT");
  });

  it("produces a deterministic incident identity and never creates duplicate incidents on retry or concurrent workers", async () => {
    const first = setup({ worker: true });
    const r1 = await first.incidentStore.correlateAlertById(scope, alertId);
    const second = setup({ worker: true, existingIncident: true });
    const r2 = await second.incidentStore.correlateAlertById(scope, alertId);
    expect(r1?.incidentId).toBe(incidentId);
    expect(r2?.incidentId).toBe(incidentId);
    expect(r1?.created).toBe(true);
    expect(r2?.created).toBe(false);
    expect(
      second.c.calls.some((x) =>
        x.sql.startsWith("INSERT INTO sentinel.incidents("),
      ),
    ).toBe(false);
  });

  it("never creates an incident when rule match is suppressed by cooldown or suppression window", async () => {
    const { c, detectionStore } = setup({ worker: true, cooling: true });
    expect(
      await detectionStore.process(
        detectionLease(),
        new AbortController().signal,
        { correlateIncidents: true },
      ),
    ).toEqual(["alert_suppressed"]);
    expect(
      c.calls.some((x) => x.sql.includes("sentinel.incident")),
    ).toBe(false);
  });

  it("short-circuits duplicate job delivery after a crash after persistence before queue acknowledgment", async () => {
    const { c, detectionStore } = setup({ worker: true, prior: true });
    expect(
      await detectionStore.process(
        detectionLease(),
        new AbortController().signal,
        { correlateIncidents: true },
      ),
    ).toEqual(["alert_created"]);
    expect(c.calls.some((x) => x.sql.startsWith("INSERT"))).toBe(false);
  });

  it("rolls back alert, incident and timeline writes atomically if timeline persistence fails", async () => {
    const { c, detectionStore } = setup({ worker: true, failTimeline: true });
    await expect(
      detectionStore.process(detectionLease(), new AbortController().signal, {
        correlateIncidents: true,
      }),
    ).rejects.toThrow("fixture timeline failure");
    expect(c.calls.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("rejects cross-project or cross-source evidence links and app-role incident creation", async () => {
    const appSetup = setup({ worker: false });
    await expect(
      appSetup.incidentStore.correlateAlertById(scope, alertId),
    ).rejects.toThrow("scope_denied");

    const guardDb = new PlatformDatabase(
      fakePool(new RecordingClient()),
      true,
      "guard",
    );
    const guardStore = new IncidentStore(guardDb);
    await expect(
      guardStore.correlateAlertById(scope, alertId),
    ).rejects.toThrow("scope_denied");
    await expect(
      guardStore.incidents(context, new URLSearchParams()),
    ).rejects.toThrow("scope_denied");
    await expect(guardStore.incidentDetails(context, incidentId)).rejects.toThrow(
      "scope_denied",
    );
    await expect(
      guardStore.command(context, {
        action: "investigate",
        incidentId,
        expectedRevision: 1,
      }),
    ).rejects.toThrow("scope_denied");
    await expect(retainIncidents(guardDb, scope)).rejects.toThrow(
      "scope_denied",
    );

    const workerSetup = setup({ worker: true });
    const badEvidence = event(1);
    badEvidence.projectId = "github-999";
    await expect(
      workerSetup.db.scoped(scope, (tx) =>
        correlateAlertIncident(
          workerSetup.db,
          tx,
          scope,
          alertId,
          rule(),
          event(1),
          {
            outcome: "alert_created",
            reason: "threshold_reached",
            matched: true,
            matchKey,
            correlationKey,
            windowStart: start,
            windowEnd: "2026-11-15T00:05:00.000Z",
            evidence: [badEvidence],
          },
        ),
      ),
    ).rejects.toThrow("scope_denied");
  });

  it("rejects missing alert or missing alert evidence without creating an incident", async () => {
    const missingAlert = setup({ worker: true, missingAlert: true });
    await expect(
      missingAlert.incidentStore.correlateAlertById(scope, alertId),
    ).rejects.toThrow("alert_not_found");

    const missingEvidence = setup({ worker: true, missingEvidence: true });
    await expect(
      missingEvidence.incidentStore.correlateAlertById(scope, alertId),
    ).rejects.toThrow("alert_evidence_missing");
  });

  it("transitions OPEN -> INVESTIGATING -> CLOSED -> INVESTIGATING with revision checks and preserves verificationStatus=not_requested", async () => {
    const openSetup = setup({ incidentStatus: "open", incidentRevision: 1 });
    const inv = await openSetup.incidentStore.command(context, {
      action: "investigate",
      incidentId,
      expectedRevision: 1,
      note: "Reviewing correlated HTTP 500 spike.",
    });
    expect(inv).toMatchObject({
      incidentId,
      status: "investigating",
      revision: 2,
      verificationStatus: "not_requested",
    });
    const invTimeline = openSetup.c.calls.find((x) =>
      x.sql.startsWith("INSERT INTO sentinel.incident_timeline("),
    )!;
    expect(invTimeline.values[6]).toBe("incident_opened");
    expect(invTimeline.values).not.toContain("policy_evaluating");
    expect(invTimeline.values[8]).toBe("open");
    expect(invTimeline.values[9]).toBe("investigating");
    expect(invTimeline.values[13]).toBe(2);
    const invMeta = JSON.parse(String(invTimeline.values[11])) as Record<
      string,
      unknown
    >;
    expect(invMeta.action).toBe("investigate");
    expect(invMeta.verificationStatus).toBe("not_requested");
    expect(invMeta).toEqual({
      action: "investigate",
      note: "Reviewing correlated HTTP 500 spike.",
      verificationStatus: "not_requested",
    });

    const invSetup = setup({
      incidentStatus: "investigating",
      incidentRevision: 2,
    });
    const closed = await invSetup.incidentStore.command(context, {
      action: "close",
      incidentId,
      expectedRevision: 2,
      reason: "Confirmed controlled synthetic probe during verification.",
    });
    expect(closed).toMatchObject({
      incidentId,
      status: "closed",
      revision: 3,
      verificationStatus: "not_requested",
    });
    const closeTimeline = invSetup.c.calls.find((x) =>
      x.sql.startsWith("INSERT INTO sentinel.incident_timeline("),
    )!;
    expect(closeTimeline.values[6]).toBe("incident_closed");
    expect(closeTimeline.values[8]).toBe("investigating");
    expect(closeTimeline.values[9]).toBe("closed");
    expect(closeTimeline.values[13]).toBe(3);
    const closeMeta = JSON.parse(String(closeTimeline.values[11])) as Record<
      string,
      unknown
    >;
    expect(closeMeta).toEqual({
      action: "close",
      reason: "Confirmed controlled synthetic probe during verification.",
      verificationStatus: "not_requested",
      mitigationApplied: false,
    });
    expect(String(closeTimeline.values[11])).not.toMatch(
      /neutralization_verified|mitigation_applied/,
    );

    const closedSetup = setup({
      incidentStatus: "closed",
      incidentRevision: 3,
    });
    const reopened = await closedSetup.incidentStore.command(context, {
      action: "reopen",
      incidentId,
      expectedRevision: 3,
      reason: "Additional telemetry batch requires follow-up review.",
    });
    expect(reopened).toMatchObject({
      incidentId,
      status: "investigating",
      revision: 4,
      verificationStatus: "not_requested",
    });
    const reopenTimeline = closedSetup.c.calls.find((x) =>
      x.sql.startsWith("INSERT INTO sentinel.incident_timeline("),
    )!;
    expect(reopenTimeline.values[6]).toBe("incident_opened");
    expect(reopenTimeline.values).not.toContain("policy_evaluating");
    expect(reopenTimeline.values[8]).toBe("closed");
    expect(reopenTimeline.values[9]).toBe("investigating");
    expect(reopenTimeline.values[13]).toBe(4);
    const reopenMeta = JSON.parse(String(reopenTimeline.values[11])) as Record<
      string,
      unknown
    >;
    expect(reopenMeta).toEqual({
      action: "reopen",
      reason: "Additional telemetry batch requires follow-up review.",
      verificationStatus: "not_requested",
    });
  });

  it("rejects stale revisions, invalid transitions and secret-bearing notes", async () => {
    const { incidentStore } = setup({
      incidentStatus: "open",
      incidentRevision: 2,
    });
    await expect(
      incidentStore.command(context, {
        action: "investigate",
        incidentId,
        expectedRevision: 1,
      }),
    ).rejects.toThrow("revision_conflict");
    await expect(
      incidentStore.command(context, {
        action: "reopen",
        incidentId,
        expectedRevision: 2,
        reason: "Cannot reopen an already open incident.",
      }),
    ).rejects.toThrow("invalid_transition");
    await expect(
      incidentStore.command(context, {
        action: "close",
        incidentId,
        expectedRevision: 2,
        reason: "Bearer secret_token_value",
      }),
    ).rejects.toThrow("invalid_close_reason");
  });

  it("returns ordered timeline, linked alerts, linked redacted evidence and supports cursor pagination", async () => {
    const { incidentStore } = setup();
    const page1 = await incidentStore.incidents(
      context,
      new URLSearchParams({
        status: "open",
        severity: "low",
        origin: "controlled_test",
        limit: "1",
        from: "2026-11-15T00:00:00Z",
        to: "2026-11-15T00:10:00Z",
      }),
    );
    expect(page1.items).toHaveLength(1);
    expect(page1.items[0]).toMatchObject({
      incidentId,
      status: "open",
      verificationStatus: "not_requested",
      origin: "controlled_test",
      alertIds: [alertId],
    });

    const details = await incidentStore.incidentDetails(context, incidentId);
    expect(details.incident.incidentId).toBe(incidentId);
    expect(details.alerts).toHaveLength(1);
    expect(details.evidence).toHaveLength(5);
    expect(details.timeline.map((t) => [t.sequence, t.type])).toEqual([
      [1, "alert_created"],
      [2, "incident_opened"],
    ]);
  });

  it("pins incident-linked alerts and telemetry events during retention and purges only expired closed incidents", async () => {
    const active = setup({ worker: true, expiredClosedIncident: false });
    expect(await retainIncidents(active.db, scope)).toEqual({
      incidents: 0,
      timeline: 0,
    });
    await retainDetection(active.db, scope, true);
    await retainTelemetry(active.db, scope, true, true);
    const detSql = active.c.calls.find((x) =>
      x.sql.startsWith("SELECT alert_id FROM sentinel.detection_alerts a"),
    )!.sql;
    expect(detSql).toContain("FROM sentinel.incidents i");
    expect(detSql).toContain("FROM sentinel.incident_alerts ia");
    const telSql = active.c.calls.find((x) =>
      x.sql.startsWith("DELETE FROM sentinel.telemetry_events"),
    )!.sql;
    expect(telSql).toContain("FROM sentinel.incident_evidence ie");
    expect(telSql).toContain("FROM sentinel.incident_timeline_evidence ite");

    const expired = setup({ worker: true, expiredClosedIncident: true });
    expect(await retainIncidents(expired.db, scope)).toEqual({
      incidents: 1,
      timeline: 1,
    });
    const deletes = expired.c.calls
      .filter((x) => x.sql.startsWith("DELETE FROM sentinel.incident"))
      .map((x) => x.sql.split(" ")[2]);
    expect(deletes).toEqual([
      "sentinel.incident_timeline_evidence",
      "sentinel.incident_timeline",
      "sentinel.incident_evidence",
      "sentinel.incident_alerts",
      "sentinel.incidents",
    ]);
  });

  it("requires explicit owner runtime approval and active detection scope before enabling incident creation", () => {
    const baseApproval = {
      schemaVersion: 1 as const,
      status: "APPROVED" as const,
      approvedBy: "owner",
      approvedAt: "2026-11-15T00:00:00Z",
      target: {
        host: "127.0.0.1",
        port: 55432,
        database: "wetscan_dev",
        marker: "wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f",
      },
      actions: ["runtime" as const],
      migrationPlanSha256: "a".repeat(64),
      detection: {
        mode: "live",
        workspaceId: "github-user-7:fixture",
        projectId: "github-123",
        notBefore: "2026-11-15T00:01:00Z",
        processNewTelemetry: true,
      },
      incidents: {
        mode: "live",
        workspaceId: "github-user-7:fixture",
        projectId: "github-123",
        notBefore: "2026-11-15T00:01:00Z",
        createFromNewAlerts: true,
      },
    };
    const det = detectionActivation(baseApproval, true);
    expect(incidentActivation(baseApproval, false, det)).toBeUndefined();
    expect(incidentActivation(baseApproval, true, det)?.scope).toEqual(scope);
    expect(() => incidentActivation(baseApproval, true, undefined)).toThrow(
      "approval_required",
    );
  });
});

interface PgLikeError extends Error {
  code: string;
  table?: string;
  constraint?: string;
}

function fkViolation(table: string, constraint: string, detail: string): PgLikeError {
  const err = new Error(`insert or update on table "${table}" violates foreign key constraint "${constraint}": ${detail}`) as PgLikeError;
  err.code = "23503";
  err.table = table;
  err.constraint = constraint;
  return err;
}

interface ConstraintState {
  projects: string[];
  rules: Array<ReturnType<typeof ruleRow>>;
  events: Array<ReturnType<typeof eventRow>>;
  evaluations: Array<{
    mode: string;
    workspace_id: string;
    project_id: string;
    rule_id: string;
    rule_version: number;
    source_id: string;
    event_id: string;
    outcome: string;
  }>;
  alerts: Array<Record<string, unknown>>;
  detectionEvidence: Array<{
    mode: string;
    workspace_id: string;
    project_id: string;
    alert_id: string;
    source_id: string;
    event_id: string;
  }>;
  incidents: Array<Record<string, unknown>>;
  incidentAlerts: Array<{
    mode: string;
    workspace_id: string;
    project_id: string;
    incident_id: string;
    alert_id: string;
    source_id: string;
  }>;
  incidentEvidence: Array<{
    mode: string;
    workspace_id: string;
    project_id: string;
    incident_id: string;
    source_id: string;
    event_id: string;
  }>;
  incidentTimeline: Array<{
    mode: string;
    workspace_id: string;
    project_id: string;
    incident_id: string;
    timeline_id: string;
    sequence: number;
    schema_version: 1;
    event_type: "alert_created" | "incident_opened" | "incident_closed";
    actor_id: string;
    actor_type: "system" | "user";
    from_status: "open" | "investigating" | "closed" | null;
    to_status: "open" | "investigating" | "closed" | null;
    summary: string;
    metadata: Record<string, unknown>;
    idempotency_key: string;
    incident_revision: number;
    occurred_at: string;
    recorded_at: string;
  }>;
  incidentTimelineEvidence: Array<{
    mode: string;
    workspace_id: string;
    project_id: string;
    incident_id: string;
    timeline_id: string;
    source_id: string;
    event_id: string;
  }>;
}

function createConstraintDouble(options: {
  worker?: boolean;
  onInsertTimeline?: (
    sql: string,
    values: unknown[],
    state: ConstraintState,
  ) => "skip_returning" | "throw" | void;
  onInsertTimelineEvidence?: (sql: string, values: unknown[]) => void;
} = {}) {
  const r = rule();
  r.definition = structuredClone(seedRules[3].definition);
  r.definition.windowSeconds = 600;
  r.definition.threshold = 1;
  r.definition.cooldownSeconds = 0;

  let state: ConstraintState = {
    projects: [`${scope.mode}:${scope.workspaceId}:${scope.projectId}`],
    rules: [ruleRow(r)],
    events: [],
    evaluations: [],
    alerts: [],
    detectionEvidence: [],
    incidents: [],
    incidentAlerts: [],
    incidentEvidence: [],
    incidentTimeline: [],
    incidentTimelineEvidence: [],
  };
  let txSnapshot: ConstraintState | null = null;
  const queries: { sql: string; values: unknown[] }[] = [];

  const scopeMatch = (
    row: { mode?: unknown; workspace_id?: unknown; project_id?: unknown },
    values: unknown[],
  ) =>
    row.mode === values[0] &&
    row.workspace_id === values[1] &&
    row.project_id === values[2];

  const client: SqlClient = {
    release: () => {},
    async query<R extends QueryResultRow = QueryResultRow>(
      sql: string,
      values: unknown[] = [],
    ) {
      queries.push({ sql, values });
      if (sql === "BEGIN") {
        txSnapshot = structuredClone(state);
        return { rows: [] as R[], rowCount: 0 };
      }
      if (sql === "COMMIT") {
        txSnapshot = null;
        return { rows: [] as R[], rowCount: 0 };
      }
      if (sql === "ROLLBACK") {
        if (txSnapshot) {
          state = txSnapshot;
          txSnapshot = null;
        }
        return { rows: [] as R[], rowCount: 0 };
      }
      if (sql.startsWith("SELECT set_config(")) {
        return { rows: [] as R[], rowCount: 1 };
      }
      if (sql.startsWith("SELECT project_id FROM sentinel.project_bindings")) {
        const key = `${values[0]}:${values[1]}:${values[2]}`;
        const ok = state.projects.includes(key);
        return {
          rows: (ok ? [{ project_id: values[2] }] : []) as unknown as R[],
          rowCount: ok ? 1 : 0,
        };
      }
      if (sql.startsWith("SELECT job_id FROM platform.jobs")) {
        return {
          rows: [{ job_id: values[3] }] as unknown as R[],
          rowCount: 1,
        };
      }
      if (
        sql.startsWith("SELECT e.*,s.origin") &&
        sql.includes("e.source_id=$4 AND e.event_id=$5")
      ) {
        const rows = state.events.filter(
          (e) =>
            scopeMatch(e, values) &&
            e.source_id === values[3] &&
            e.event_id === values[4],
        );
        return { rows: rows as unknown as R[], rowCount: rows.length };
      }
      if (sql.startsWith("SELECT r.*,v.version,v.status")) {
        const rows = state.rules.filter((ruleItem) =>
          scopeMatch(ruleItem, values),
        );
        return { rows: rows as unknown as R[], rowCount: rows.length };
      }
      if (sql.startsWith("SELECT outcome FROM sentinel.detection_evaluations")) {
        const rows = state.evaluations.filter(
          (ev) =>
            scopeMatch(ev, values) &&
            ev.rule_id === values[3] &&
            ev.rule_version === values[4] &&
            ev.source_id === values[5] &&
            ev.event_id === values[6],
        );
        return { rows: rows as unknown as R[], rowCount: rows.length };
      }
      if (
        sql.startsWith(
          "SELECT count(*)::int AS n FROM sentinel.detection_evaluations",
        )
      ) {
        const n = state.evaluations.filter((ev) => scopeMatch(ev, values)).length;
        return { rows: [{ n }] as unknown as R[], rowCount: 1 };
      }
      if (
        sql.startsWith("SELECT e.*,s.origin") &&
        sql.includes("e.occurred_at>=$5 AND e.occurred_at<$6")
      ) {
        const kinds = values[6] as string[];
        const rows = state.events
          .filter(
            (e) =>
              scopeMatch(e, values) &&
              e.source_id === values[3] &&
              Date.parse(e.occurred_at) >= Date.parse(String(values[4])) &&
              Date.parse(e.occurred_at) < Date.parse(String(values[5])) &&
              kinds.includes(e.event.kind) &&
              Date.parse(e.ingested_at) >= Date.parse(String(values[7])),
          )
          .sort(
            (a, b) =>
              Date.parse(a.occurred_at) - Date.parse(b.occurred_at) ||
              a.event_id.localeCompare(b.event_id),
          );
        return { rows: rows as unknown as R[], rowCount: rows.length };
      }
      if (
        sql.startsWith(
          "SELECT alert_id FROM sentinel.detection_alerts WHERE mode=$1",
        )
      ) {
        const rows = state.alerts.filter(
          (a) => scopeMatch(a, values) && a.deduplication_key === values[3],
        );
        return {
          rows: rows.map((a) => ({ alert_id: a.alert_id })) as unknown as R[],
          rowCount: rows.length,
        };
      }
      if (sql.startsWith("SELECT last_alert_at>")) {
        return { rows: [{ active: false }] as unknown as R[], rowCount: 1 };
      }
      if (
        sql.startsWith(
          "SELECT count(*)::int AS n FROM sentinel.detection_alerts",
        )
      ) {
        const n = state.alerts.filter((a) => scopeMatch(a, values)).length;
        return { rows: [{ n }] as unknown as R[], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO sentinel.detection_alerts(")) {
        state.alerts.push({
          mode: values[0],
          workspace_id: values[1],
          project_id: values[2],
          alert_id: values[3],
          rule_id: values[4],
          rule_version: values[5],
          source_id: values[6],
          schema_version: 1,
          category: values[7],
          severity: values[8],
          confidence: values[9],
          origin: values[10],
          correlation_key: values[11],
          window_start: values[12],
          window_end: values[13],
          first_observed_at: values[14],
          last_observed_at: values[15],
          detected_at: values[15],
          matched_event_count: values[16],
          deduplication_key: values[17],
        });
        return { rows: [] as R[], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO sentinel.detection_cooldowns(")) {
        return { rows: [] as R[], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO sentinel.detection_evidence(")) {
        const eventIds = values[5] as string[];
        for (const eid of eventIds) {
          const exists = state.detectionEvidence.some(
            (x) =>
              scopeMatch(x, values) &&
              x.alert_id === values[3] &&
              x.source_id === values[4] &&
              x.event_id === eid,
          );
          if (!exists) {
            state.detectionEvidence.push({
              mode: String(values[0]),
              workspace_id: String(values[1]),
              project_id: String(values[2]),
              alert_id: String(values[3]),
              source_id: String(values[4]),
              event_id: eid,
            });
          }
        }
        return { rows: [] as R[], rowCount: eventIds.length };
      }
      if (sql.startsWith("UPDATE sentinel.detection_alerts SET")) {
        const alert = state.alerts.find(
          (a) => scopeMatch(a, values) && a.alert_id === values[3],
        );
        if (alert) {
          alert.matched_event_count = Math.max(
            Number(alert.matched_event_count),
            Number(values[4]),
          );
          if (Date.parse(String(values[5])) < Date.parse(String(alert.first_observed_at)))
            alert.first_observed_at = values[5];
          if (Date.parse(String(values[6])) > Date.parse(String(alert.last_observed_at)))
            alert.last_observed_at = values[6];
        }
        return { rows: [] as R[], rowCount: alert ? 1 : 0 };
      }
      if (sql.startsWith("INSERT INTO sentinel.detection_evaluations(")) {
        state.evaluations.push({
          mode: String(values[0]),
          workspace_id: String(values[1]),
          project_id: String(values[2]),
          rule_id: String(values[3]),
          rule_version: Number(values[4]),
          source_id: String(values[5]),
          event_id: String(values[6]),
          outcome: String(values[7]),
        });
        return { rows: [] as R[], rowCount: 1 };
      }
      if (sql.startsWith("SELECT a.*,v.definition FROM sentinel.detection_alerts")) {
        const alert = state.alerts.find(
          (a) => scopeMatch(a, values) && a.alert_id === values[3],
        );
        if (!alert) return { rows: [] as R[], rowCount: 0 };
        const matchedRule = state.rules.find(
          (ruleItem) =>
            scopeMatch(ruleItem, values) && ruleItem.rule_id === alert.rule_id,
        );
        return {
          rows: [{ ...alert, definition: matchedRule?.definition }] as unknown as R[],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM sentinel.detection_evidence l")) {
        const linked = state.detectionEvidence
          .filter((l) => scopeMatch(l, values) && l.alert_id === values[3])
          .map((l) =>
            state.events.find(
              (e) =>
                scopeMatch(e, values) &&
                e.source_id === l.source_id &&
                e.event_id === l.event_id,
            )!,
          );
        return { rows: linked as unknown as R[], rowCount: linked.length };
      }
      if (
        sql.startsWith(
          "SELECT incident_id FROM sentinel.incidents WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND deduplication_key=$4",
        )
      ) {
        const inc = state.incidents.find(
          (i) => scopeMatch(i, values) && i.deduplication_key === values[3],
        );
        return {
          rows: (inc ? [{ incident_id: inc.incident_id }] : []) as unknown as R[],
          rowCount: inc ? 1 : 0,
        };
      }
      if (
        sql.startsWith("SELECT count(*)::int AS n FROM sentinel.incidents")
      ) {
        const n = state.incidents.filter((i) => scopeMatch(i, values)).length;
        return { rows: [{ n }] as unknown as R[], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO sentinel.incidents(")) {
        const conflict = state.incidents.some(
          (i) =>
            scopeMatch(i, values) &&
            (i.deduplication_key === values[14] || i.incident_id === values[3]),
        );
        if (conflict) return { rows: [] as R[], rowCount: 0 };
        state.incidents.push({
          mode: values[0],
          workspace_id: values[1],
          project_id: values[2],
          incident_id: values[3],
          source_id: values[4],
          primary_alert_id: values[5],
          rule_id: values[6],
          rule_version: values[7],
          schema_version: 1,
          title: values[8],
          summary: values[9],
          category: values[10],
          severity: values[11],
          status: "open",
          verification_status: "not_requested",
          archived: false,
          origin: values[12],
          correlation_key: values[13],
          deduplication_key: values[14],
          first_observed_at: values[15],
          last_observed_at: values[16],
          opened_at: values[15],
          updated_at: values[16],
          closed_at: null,
          closed_by: null,
          close_reason: null,
          last_actor_id: "system:sentinel-worker",
          revision: 1,
        });
        return {
          rows: [{ incident_id: values[3] }] as unknown as R[],
          rowCount: 1,
        };
      }
      if (sql.startsWith("INSERT INTO sentinel.incident_alerts(")) {
        const incOk = state.incidents.some(
          (i) =>
            scopeMatch(i, values) &&
            i.incident_id === values[3] &&
            i.source_id === values[5],
        );
        if (!incOk) throw fkViolation("incident_alerts", "incident_alerts_incident_fkey", String(values[3]));
        const exists = state.incidentAlerts.some(
          (ia) => scopeMatch(ia, values) && ia.alert_id === values[4],
        );
        if (!exists) {
          state.incidentAlerts.push({
            mode: String(values[0]),
            workspace_id: String(values[1]),
            project_id: String(values[2]),
            incident_id: String(values[3]),
            alert_id: String(values[4]),
            source_id: String(values[5]),
          });
        }
        return { rows: [] as R[], rowCount: exists ? 0 : 1 };
      }
      if (sql.startsWith("INSERT INTO sentinel.incident_evidence(")) {
        const incOk = state.incidents.some(
          (i) =>
            scopeMatch(i, values) &&
            i.incident_id === values[3] &&
            i.source_id === values[4],
        );
        if (!incOk) throw fkViolation("incident_evidence", "incident_evidence_incident_fkey", String(values[3]));
        let added = 0;
        for (const eid of values[5] as string[]) {
          const exists = state.incidentEvidence.some(
            (ie) =>
              scopeMatch(ie, values) &&
              ie.incident_id === values[3] &&
              ie.source_id === values[4] &&
              ie.event_id === eid,
          );
          if (!exists) {
            state.incidentEvidence.push({
              mode: String(values[0]),
              workspace_id: String(values[1]),
              project_id: String(values[2]),
              incident_id: String(values[3]),
              source_id: String(values[4]),
              event_id: eid,
            });
            added++;
          }
        }
        return { rows: [] as R[], rowCount: added };
      }
      if (sql.startsWith("UPDATE sentinel.incidents SET first_observed_at=")) {
        const inc = state.incidents.find(
          (i) => scopeMatch(i, values) && i.incident_id === values[3],
        );
        if (!inc) return { rows: [] as R[], rowCount: 0 };
        if (Date.parse(String(values[4])) < Date.parse(String(inc.first_observed_at)))
          inc.first_observed_at = values[4];
        if (Date.parse(String(values[5])) > Date.parse(String(inc.last_observed_at)))
          inc.last_observed_at = values[5];
        return {
          rows: [{ revision: inc.revision }] as unknown as R[],
          rowCount: 1,
        };
      }
      if (sql.startsWith("INSERT INTO sentinel.incident_timeline(")) {
        const hook = options.onInsertTimeline?.(sql, values, state);
        if (hook === "throw") throw Error("injected timeline failure");
        if (hook === "skip_returning") return { rows: [] as R[], rowCount: 0 };

        const incOk = state.incidents.some(
          (i) => scopeMatch(i, values) && i.incident_id === values[3],
        );
        if (!incOk)
          throw fkViolation(
            "incident_timeline",
            "incident_timeline_mode_workspace_id_project_id_incident_id_fkey",
            String(values[3]),
          );
        const onConflictDoNothing = sql.includes("ON CONFLICT DO NOTHING");
        const isCommandInsert = !onConflictDoNothing;
        // correlate uses 14 params with fixed actor 'system:sentinel-worker', command uses 14 params with actor=$8 and no ON CONFLICT
        const row = isCommandInsert
          ? {
              mode: String(values[0]),
              workspace_id: String(values[1]),
              project_id: String(values[2]),
              incident_id: String(values[3]),
              timeline_id: String(values[4]),
              sequence: Number(values[5]),
              schema_version: 1 as const,
              event_type: values[6] as "alert_created" | "incident_opened" | "incident_closed",
              actor_id: String(values[7]),
              actor_type: "user" as const,
              from_status: (values[8] ?? null) as "open" | "investigating" | "closed" | null,
              to_status: (values[9] ?? null) as "open" | "investigating" | "closed" | null,
              summary: String(values[10]),
              metadata: JSON.parse(String(values[11])),
              idempotency_key: String(values[12]),
              incident_revision: Number(values[13]),
              occurred_at: "2026-11-15T00:02:00.000Z",
              recorded_at: "2026-11-15T00:02:00.000Z",
            }
          : {
              mode: String(values[0]),
              workspace_id: String(values[1]),
              project_id: String(values[2]),
              incident_id: String(values[3]),
              timeline_id: String(values[4]),
              sequence: Number(values[5]),
              schema_version: 1 as const,
              event_type: values[6] as "alert_created" | "incident_opened" | "incident_closed",
              actor_id: "system:sentinel-worker",
              actor_type: "system" as const,
              from_status: (values[7] ?? null) as "open" | "investigating" | "closed" | null,
              to_status: (values[8] ?? null) as "open" | "investigating" | "closed" | null,
              summary: String(values[9]),
              metadata: JSON.parse(String(values[10])),
              idempotency_key: String(values[11]),
              incident_revision: Number(values[12]),
              occurred_at: String(values[13]),
              recorded_at: String(values[13]),
            };
        const dup = state.incidentTimeline.some(
          (t) =>
            scopeMatch(t, values) &&
            t.incident_id === row.incident_id &&
            (t.timeline_id === row.timeline_id ||
              t.sequence === row.sequence ||
              t.idempotency_key === row.idempotency_key),
        );
        if (dup) {
          if (onConflictDoNothing) return { rows: [] as R[], rowCount: 0 };
          throw Error("unique_violation");
        }
        state.incidentTimeline.push(row);
        return {
          rows: [{ timeline_id: row.timeline_id }] as unknown as R[],
          rowCount: 1,
        };
      }
      if (
        sql.startsWith("SELECT timeline_id FROM sentinel.incident_timeline")
      ) {
        let rows = state.incidentTimeline.filter(
          (t) => scopeMatch(t, values) && t.incident_id === values[3],
        );
        if (sql.includes("idempotency_key=$5 OR idempotency_key=$6")) {
          rows = rows.filter(
            (t) =>
              t.idempotency_key === values[4] ||
              t.idempotency_key === values[5] ||
              ((t.event_type === "alert_created" ||
                t.event_type === "incident_opened") &&
                t.metadata.alertId === values[6]),
          );
        } else if (sql.includes("idempotency_key=$5")) {
          rows = rows.filter((t) => t.idempotency_key === values[4]);
        }
        rows.sort((a, b) => a.sequence - b.sequence);
        return {
          rows: rows.map((t) => ({ timeline_id: t.timeline_id })) as unknown as R[],
          rowCount: rows.length,
        };
      }
      if (
        sql.startsWith(
          "SELECT COALESCE(max(sequence),0)::int AS max_seq FROM sentinel.incident_timeline",
        )
      ) {
        const seqs = state.incidentTimeline
          .filter((t) => scopeMatch(t, values) && t.incident_id === values[3])
          .map((t) => t.sequence);
        const max_seq = seqs.length ? Math.max(...seqs) : 0;
        return { rows: [{ max_seq }] as unknown as R[], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO sentinel.incident_timeline_evidence(")) {
        options.onInsertTimelineEvidence?.(sql, values);
        const incId = String(values[3]);
        const tlId = String(values[4]);
        // Enforces exact 0004 composite FK to sentinel.incident_timeline!
        const hasTimeline = state.incidentTimeline.some(
          (t) =>
            scopeMatch(t, values) &&
            t.incident_id === incId &&
            t.timeline_id === tlId,
        );
        if (!hasTimeline) {
          throw fkViolation(
            "incident_timeline_evidence",
            "incident_timeline_evidence_mode_workspace_id_project_id_in_fkey",
            `Key (mode, workspace_id, project_id, incident_id, timeline_id)=(${values[0]}, ${values[1]}, ${values[2]}, ${incId}, ${tlId}) is not present in table "incident_timeline".`,
          );
        }
        const evIds = sql.includes("FROM sentinel.incident_evidence")
          ? state.incidentEvidence
              .filter((ie) => scopeMatch(ie, values) && ie.incident_id === incId)
              .map((ie) => ({ source_id: ie.source_id, event_id: ie.event_id }))
          : (values[6] as string[]).map((event_id) => ({
              source_id: String(values[5]),
              event_id,
            }));
        let added = 0;
        for (const ev of evIds) {
          const hasEvidence = state.incidentEvidence.some(
            (ie) =>
              scopeMatch(ie, values) &&
              ie.incident_id === incId &&
              ie.source_id === ev.source_id &&
              ie.event_id === ev.event_id,
          );
          if (!hasEvidence) {
            throw fkViolation(
              "incident_timeline_evidence",
              "incident_timeline_evidence_mode_workspace_id_project_i_fkey1",
              `Key missing from "incident_evidence": ${ev.event_id}`,
            );
          }
          const exists = state.incidentTimelineEvidence.some(
            (ite) =>
              scopeMatch(ite, values) &&
              ite.incident_id === incId &&
              ite.timeline_id === tlId &&
              ite.source_id === ev.source_id &&
              ite.event_id === ev.event_id,
          );
          if (!exists) {
            state.incidentTimelineEvidence.push({
              mode: String(values[0]),
              workspace_id: String(values[1]),
              project_id: String(values[2]),
              incident_id: incId,
              timeline_id: tlId,
              source_id: ev.source_id,
              event_id: ev.event_id,
            });
            added++;
          }
        }
        return { rows: [] as R[], rowCount: added };
      }
      if (
        sql.startsWith(
          "SELECT i.*,v.definition->>'name' AS rule_name FROM sentinel.incidents i",
        )
      ) {
        const inc = state.incidents.find(
          (i) => scopeMatch(i, values) && i.incident_id === values[3],
        );
        if (!inc) return { rows: [] as R[], rowCount: 0 };
        const matchedRule = state.rules.find(
          (ruleItem) =>
            scopeMatch(ruleItem, values) && ruleItem.rule_id === inc.rule_id,
        );
        return {
          rows: [
            { ...inc, rule_name: matchedRule?.definition.name ?? r.definition.name },
          ] as unknown as R[],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM sentinel.incident_alerts ia")) {
        const rows = state.incidentAlerts
          .filter((ia) => scopeMatch(ia, values) && ia.incident_id === values[3])
          .map((ia) => {
            const alert = state.alerts.find(
              (a) => scopeMatch(a, values) && a.alert_id === ia.alert_id,
            )!;
            const matchedRule = state.rules.find(
              (ruleItem) =>
                scopeMatch(ruleItem, values) &&
                ruleItem.rule_id === alert.rule_id,
            );
            return {
              ...alert,
              rule_name: matchedRule?.definition.name ?? r.definition.name,
            };
          });
        return { rows: rows as unknown as R[], rowCount: rows.length };
      }
      if (sql.includes("FROM sentinel.incident_evidence ie")) {
        const rows = state.incidentEvidence
          .filter((ie) => scopeMatch(ie, values) && ie.incident_id === values[3])
          .map((ie) =>
            state.events.find(
              (e) =>
                scopeMatch(e, values) &&
                e.source_id === ie.source_id &&
                e.event_id === ie.event_id,
            )!,
          );
        return { rows: rows as unknown as R[], rowCount: rows.length };
      }
      if (sql.startsWith("SELECT * FROM sentinel.incident_timeline")) {
        const rows = state.incidentTimeline
          .filter((t) => scopeMatch(t, values) && t.incident_id === values[3])
          .sort((a, b) => a.sequence - b.sequence);
        return { rows: rows as unknown as R[], rowCount: rows.length };
      }
      if (
        sql.startsWith(
          "SELECT timeline_id,source_id,event_id FROM sentinel.incident_timeline_evidence",
        )
      ) {
        const rows = state.incidentTimelineEvidence.filter(
          (ite) => scopeMatch(ite, values) && ite.incident_id === values[3],
        );
        return { rows: rows as unknown as R[], rowCount: rows.length };
      }
      if (
        sql.startsWith(
          "SELECT incident_id,source_id,status,revision,origin FROM sentinel.incidents",
        )
      ) {
        const inc = state.incidents.find(
          (i) => scopeMatch(i, values) && i.incident_id === values[3],
        );
        return {
          rows: (inc
            ? [
                {
                  incident_id: inc.incident_id,
                  source_id: inc.source_id,
                  status: inc.status,
                  revision: inc.revision,
                  origin: inc.origin,
                },
              ]
            : []) as unknown as R[],
          rowCount: inc ? 1 : 0,
        };
      }
      if (sql.startsWith("UPDATE sentinel.incidents SET status='closed'")) {
        const inc = state.incidents.find(
          (i) =>
            scopeMatch(i, values) &&
            i.incident_id === values[3] &&
            i.revision === values[7],
        );
        if (!inc) return { rows: [] as R[], rowCount: 0 };
        inc.status = "closed";
        inc.closed_at = "2026-11-15T00:05:00.000Z";
        inc.closed_by = values[4];
        inc.close_reason = values[5];
        inc.last_actor_id = values[4];
        inc.revision = values[6];
        return {
          rows: [{ incident_id: inc.incident_id }] as unknown as R[],
          rowCount: 1,
        };
      }
      if (sql.startsWith("UPDATE sentinel.incidents SET status='investigating'")) {
        const inc = state.incidents.find(
          (i) =>
            scopeMatch(i, values) &&
            i.incident_id === values[3] &&
            i.revision === values[6],
        );
        if (!inc) return { rows: [] as R[], rowCount: 0 };
        inc.status = "investigating";
        inc.closed_at = null;
        inc.closed_by = null;
        inc.close_reason = null;
        inc.last_actor_id = values[4];
        inc.revision = values[5];
        return {
          rows: [{ incident_id: inc.incident_id }] as unknown as R[],
          rowCount: 1,
        };
      }
      // S06 notification producer (savepoint-isolated): no channels configured in these S04 regression doubles.
      if (/^(SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)/.test(sql.trim()))
        return { rows: [] as unknown as R[], rowCount: 0 };
      if (sql.includes("sentinel.notification_channels"))
        return { rows: [] as unknown as R[], rowCount: 0 };
      throw new Error(`Unhandled SQL in constraint double: ${sql}`);
    },
  };

  const pool: SqlPool = {
    connect: async () => client,
    end: async () => {},
  };
  const db = new PlatformDatabase(pool, options.worker ?? true);
  return {
    db,
    rule: r,
    detectionStore: new DetectionStore(db),
    incidentStore: new IncidentStore(db),
    getState: () => state,
    queries,
    addProject(projectScope: typeof scope) {
      state.projects.push(
        `${projectScope.mode}:${projectScope.workspaceId}:${projectScope.projectId}`,
      );
      const prRule = rule(
      );
      prRule.mode = projectScope.mode;
      prRule.workspaceId = projectScope.workspaceId;
      prRule.projectId = projectScope.projectId;
      prRule.definition = structuredClone(r.definition);
      state.rules.push(ruleRow(prRule));
    },
    addEvent(n: number, overrides: { scope?: typeof scope; sourceId?: string; occurredAt?: string; ingestedAt?: string } = {}) {
      const ev = event(n);
      const targetScope = overrides.scope ?? scope;
      const src = overrides.sourceId ?? sourceId;
      ev.mode = targetScope.mode;
      ev.workspaceId = targetScope.workspaceId;
      ev.projectId = targetScope.projectId;
      ev.sourceId = src;
      ev.event.projectId = targetScope.projectId;
      ev.event.occurredAt = overrides.occurredAt ?? start;
      ev.ingestedAt = overrides.ingestedAt ?? `2026-11-15T00:00:${String(n % 60).padStart(2, "0")}.000Z`;
      ev.evidence = {
        id: `telemetry:${src}:${ev.event.eventId}`,
        sourceId: src,
        origin: "controlled_test",
        occurredAt: ev.event.occurredAt,
        recordedAt: ev.ingestedAt,
      };
      state.events.push(eventRow(ev));
      return ev;
    },
  };
}

function makeJobLease(
  ev: ReturnType<typeof event>,
  jobId: string,
  extra?: Partial<ReturnType<typeof detectionLease>["job"]>,
) {
  const base = detectionLease();
  return {
    ...base,
    job: {
      ...base.job,
      mode: ev.mode,
      workspaceId: ev.workspaceId,
      projectId: ev.projectId,
      jobId,
      subjectRef: `${ev.sourceId}/${ev.event.eventId}`,
      idempotencyKey: `idem-${jobId}`,
      attempts: 1,
      availableAt: ev.ingestedAt,
      revision: 2,
      ...extra,
    },
  };
}

describe("S04 incident correlation regression coverage - stateful constraint SQL double", () => {
  it("1-3. creates incident + timeline on first alert, reuses incident on duplicate same-window alert with distinct job scope, and keeps timeline_evidence FK valid", async () => {
    const dbl = createConstraintDouble({ worker: true });
    const ev1 = dbl.addEvent(1, {
      occurredAt: "2026-11-15T00:01:00.000Z",
      ingestedAt: "2026-11-15T00:01:01.000Z",
    });
    const ev2 = dbl.addEvent(2, {
      occurredAt: "2026-11-15T00:02:00.000Z",
      ingestedAt: "2026-11-15T00:02:01.000Z",
    });

    const out1 = await dbl.detectionStore.process(
      makeJobLease(ev1, "job-first-window"),
      new AbortController().signal,
      { correlateIncidents: true },
    );
    expect(out1).toEqual(["alert_created"]);

    const out2 = await dbl.detectionStore.process(
      makeJobLease(ev2, "job-second-duplicate", { attempts: 3 }),
      new AbortController().signal,
      { correlateIncidents: true },
    );
    expect(out2).toEqual(["alert_deduplicated"]);

    const st = dbl.getState();
    expect(st.alerts).toHaveLength(1);
    expect(st.incidents).toHaveLength(1);
    expect(st.incidents[0].status).toBe("open");
    expect(st.incidents[0].revision).toBe(1);
    expect(st.incidentAlerts).toHaveLength(1);
    expect(st.incidentEvidence.map((e) => e.event_id)).toEqual([
      ev1.event.eventId,
      ev2.event.eventId,
    ]);
    expect(st.incidentTimeline.map((t) => [t.sequence, t.event_type])).toEqual([
      [1, "alert_created"],
      [2, "incident_opened"],
    ]);

    const timelineIds = new Set(st.incidentTimeline.map((t) => t.timeline_id));
    expect(st.incidentTimelineEvidence).toHaveLength(4);
    for (const ite of st.incidentTimelineEvidence) {
      expect(timelineIds.has(ite.timeline_id)).toBe(true);
    }

    const details = await dbl.incidentStore.incidentDetails(
      context,
      String(st.incidents[0].incident_id),
    );
    expect(details.evidence).toHaveLength(2);
    expect(details.timeline).toHaveLength(2);
    expect(details.timeline[0].evidenceRefs.map((e) => e.id)).toEqual([
      ev1.evidence.id,
      ev2.evidence.id,
    ]);
    expect(details.timeline[1].evidenceRefs.map((e) => e.id)).toEqual([
      ev1.evidence.id,
      ev2.evidence.id,
    ]);
  });

  it("2b-2c. correlates safely with pre-fix job-scoped metadata rows AND appends a distinct second alert at max(sequence)+1 without duplicating incident_opened", async () => {
    const dbl = createConstraintDouble({ worker: true });
    const ev1 = dbl.addEvent(1, {
      occurredAt: "2026-11-15T00:01:00.000Z",
      ingestedAt: "2026-11-15T00:01:01.000Z",
    });

    const r1 = await dbl.detectionStore.process(
      makeJobLease(ev1, "job-first"),
      new AbortController().signal,
      { correlateIncidents: true },
    );
    expect(r1).toEqual(["alert_created"]);

    // Simulate pre-fix DEV state where initial timeline_id and idempotency_key were hashed with lease1.job!
    const st = dbl.getState();
    const incId = String(st.incidents[0].incident_id);
    const createdAlertId = String(st.alerts[0].alert_id);
    const oldT0 = st.incidentTimeline[0].timeline_id;
    st.incidentTimeline[0].timeline_id = "11111111-1111-4111-8111-111111111111";
    st.incidentTimeline[0].idempotency_key = "c".repeat(64);
    st.incidentTimeline[1].timeline_id = "22222222-2222-4222-8222-222222222222";
    st.incidentTimeline[1].idempotency_key = "d".repeat(64);
    for (const ite of st.incidentTimelineEvidence) {
      ite.timeline_id =
        ite.timeline_id === oldT0
          ? "11111111-1111-4111-8111-111111111111"
          : "22222222-2222-4222-8222-222222222222";
    }

    const ev2 = dbl.addEvent(2, {
      occurredAt: "2026-11-15T00:02:00.000Z",
      ingestedAt: "2026-11-15T00:02:01.000Z",
    });

    await expect(
      dbl.detectionStore.process(
        makeJobLease(ev2, "job-second"),
        new AbortController().signal,
        { correlateIncidents: true },
      ),
    ).resolves.toEqual(["alert_deduplicated"]);

    expect(st.incidentTimeline).toHaveLength(2);
    expect(
      st.incidentTimelineEvidence.filter((ite) => ite.event_id === ev2.event.eventId),
    ).toHaveLength(2);

    // Move to investigating (revision 2) and correlate a distinct second alert into the same incident.
    await dbl.incidentStore.command(context, {
      incidentId: incId,
      action: "investigate",
      expectedRevision: 1,
      note: "checking",
    });
    const alertId2 = "00000000-0000-4000-8000-000000000099";
    const ev3 = dbl.addEvent(3, {
      occurredAt: "2026-11-15T00:03:00.000Z",
      ingestedAt: "2026-11-15T00:03:01.000Z",
    });
    st.alerts.push({
      ...st.alerts[0],
      alert_id: alertId2,
    });
    const eval2 = evaluate(dbl.rule, ev3, [ev1, ev2, ev3], new AbortController().signal);
    await dbl.db.scoped(scope, async (tx) => {
      const correlated = await correlateAlertIncident(
        dbl.db,
        tx,
        scope,
        alertId2,
        dbl.rule,
        ev3,
        { ...eval2, matchKey: String(st.incidents[0].deduplication_key) },
      );
      expect(correlated).toEqual({ incidentId: incId, created: false });
    });

    expect(createdAlertId).not.toBe(alertId2);
    expect(st.incidentTimeline.map((t) => [t.sequence, t.event_type, t.incident_revision])).toEqual([
      [1, "alert_created", 1],
      [2, "incident_opened", 1],
      [3, "incident_opened", 2],
      [4, "alert_created", 2],
    ]);
    expect(
      st.incidentTimelineEvidence.every((ite) =>
        st.incidentTimeline.some((t) => t.timeline_id === ite.timeline_id),
      ),
    ).toBe(true);
  });

  it("4. keeps repeated correlation and duplicate delivery processing idempotent", async () => {
    const dbl = createConstraintDouble({ worker: true });
    const ev1 = dbl.addEvent(1, {
      occurredAt: "2026-11-15T00:01:00.000Z",
      ingestedAt: "2026-11-15T00:01:01.000Z",
    });
    const ev2 = dbl.addEvent(2, {
      occurredAt: "2026-11-15T00:02:00.000Z",
      ingestedAt: "2026-11-15T00:02:01.000Z",
    });

    await dbl.detectionStore.process(
      makeJobLease(ev1, "job-1"),
      new AbortController().signal,
      { correlateIncidents: true },
    );
    await dbl.detectionStore.process(
      makeJobLease(ev2, "job-2"),
      new AbortController().signal,
      { correlateIncidents: true },
    );
    const createdAlertId = String(dbl.getState().alerts[0].alert_id);

    await dbl.detectionStore.process(
      makeJobLease(ev2, "job-2-redelivered"),
      new AbortController().signal,
      { correlateIncidents: true },
    );
    await dbl.incidentStore.correlateAlertById(scope, createdAlertId);
    await dbl.incidentStore.correlateAlertById(scope, createdAlertId);

    const st = dbl.getState();
    expect(st.alerts).toHaveLength(1);
    expect(st.incidents).toHaveLength(1);
    expect(st.incidents[0].revision).toBe(1);
    expect(st.incidentAlerts).toHaveLength(1);
    expect(st.incidentEvidence).toHaveLength(2);
    expect(st.incidentTimeline).toHaveLength(2);
    expect(st.incidentTimelineEvidence).toHaveLength(4);
  });

  it("5. refuses to issue or commit orphaned timeline evidence if persisted timeline row cannot be verified", async () => {
    let timelineEvidenceAttempted = false;
    const dbl = createConstraintDouble({
      worker: true,
      onInsertTimeline: () => "skip_returning",
      onInsertTimelineEvidence: () => {
        timelineEvidenceAttempted = true;
      },
    });
    const ev1 = dbl.addEvent(1, {
      occurredAt: "2026-11-15T00:01:00.000Z",
      ingestedAt: "2026-11-15T00:01:01.000Z",
    });

    await expect(
      dbl.detectionStore.process(
        makeJobLease(ev1, "job-conflict-skip"),
        new AbortController().signal,
        { correlateIncidents: true },
      ),
    ).rejects.toThrow("incident_timeline_missing");

    expect(timelineEvidenceAttempted).toBe(false);
    expect(dbl.queries.some((q) => q.sql === "ROLLBACK")).toBe(true);
    expect(dbl.getState().incidentTimelineEvidence).toHaveLength(0);
    expect(dbl.getState().incidents).toHaveLength(0);
  });

  it("6. rolls back all alert, evaluation, incident, alert-link, evidence, and timeline writes atomically on mid-correlation failure", async () => {
    let timelineInserts = 0;
    const dbl = createConstraintDouble({
      worker: true,
      onInsertTimeline: () => {
        timelineInserts++;
        if (timelineInserts === 2) return "throw";
      },
    });
    const ev1 = dbl.addEvent(1, {
      occurredAt: "2026-11-15T00:01:00.000Z",
      ingestedAt: "2026-11-15T00:01:01.000Z",
    });

    await expect(
      dbl.detectionStore.process(
        makeJobLease(ev1, "job-mid-failure"),
        new AbortController().signal,
        { correlateIncidents: true },
      ),
    ).rejects.toThrow("injected timeline failure");

    const st = dbl.getState();
    expect(st.evaluations).toHaveLength(0);
    expect(st.alerts).toHaveLength(0);
    expect(st.detectionEvidence).toHaveLength(0);
    expect(st.incidents).toHaveLength(0);
    expect(st.incidentAlerts).toHaveLength(0);
    expect(st.incidentEvidence).toHaveLength(0);
    expect(st.incidentTimeline).toHaveLength(0);
    expect(st.incidentTimelineEvidence).toHaveLength(0);
    expect(dbl.queries.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("7. isolates correlated incidents, alerts, evidence, and timeline entries across projects", async () => {
    const otherScope = { ...scope, projectId: "github-999" };
    const dbl = createConstraintDouble({ worker: true });
    dbl.addProject(otherScope);
    const evA = dbl.addEvent(1, {
      occurredAt: "2026-11-15T00:01:00.000Z",
      ingestedAt: "2026-11-15T00:01:01.000Z",
    });
    const evB = dbl.addEvent(2, {
      scope: otherScope,
      occurredAt: "2026-11-15T00:01:00.000Z",
      ingestedAt: "2026-11-15T00:01:01.000Z",
    });

    await dbl.detectionStore.process(
      makeJobLease(evA, "job-proj-a"),
      new AbortController().signal,
      { correlateIncidents: true },
    );
    await dbl.detectionStore.process(
      makeJobLease(evB, "job-proj-b"),
      new AbortController().signal,
      { correlateIncidents: true },
    );

    const st = dbl.getState();
    expect(st.incidents).toHaveLength(2);
    const incA = st.incidents.find((i) => i.project_id === "github-123")!;
    const incB = st.incidents.find((i) => i.project_id === "github-999")!;
    expect(incA.incident_id).not.toBe(incB.incident_id);
    await expect(
      dbl.incidentStore.incidentDetails(
        { ...context, scope: otherScope },
        String(incA.incident_id),
      ),
    ).rejects.toThrow("not_found");
  });

  it("8. preserves incident lifecycle transitions and optimistic revision semantics across duplicate correlation", async () => {
    const dbl = createConstraintDouble({ worker: true });
    const ev1 = dbl.addEvent(1, {
      occurredAt: "2026-11-15T00:01:00.000Z",
      ingestedAt: "2026-11-15T00:01:01.000Z",
    });
    const ev2 = dbl.addEvent(2, {
      occurredAt: "2026-11-15T00:02:00.000Z",
      ingestedAt: "2026-11-15T00:02:01.000Z",
    });
    const ev3 = dbl.addEvent(3, {
      occurredAt: "2026-11-15T00:03:00.000Z",
      ingestedAt: "2026-11-15T00:03:01.000Z",
    });

    await dbl.detectionStore.process(
      makeJobLease(ev1, "job-open"),
      new AbortController().signal,
      { correlateIncidents: true },
    );
    const incId = String(dbl.getState().incidents[0].incident_id);

    await dbl.incidentStore.command(context, {
      incidentId: incId,
      action: "investigate",
      expectedRevision: 1,
      note: "triage",
    });

    // Duplicate same-window event while investigating must keep status & revision 2
    await dbl.detectionStore.process(
      makeJobLease(ev2, "job-dup-while-investigating"),
      new AbortController().signal,
      { correlateIncidents: true },
    );
    expect(dbl.getState().incidents[0].status).toBe("investigating");
    expect(dbl.getState().incidents[0].revision).toBe(2);

    // Stale expectedRevision rejected
    await expect(
      dbl.incidentStore.command(context, {
        incidentId: incId,
        action: "close",
        expectedRevision: 1,
        reason: "stale revision attempt",
      }),
    ).rejects.toThrow("revision_conflict");

    // Close at revision 2 -> revision 3
    await dbl.incidentStore.command(context, {
      incidentId: incId,
      action: "close",
      expectedRevision: 2,
      reason: "resolved after triage",
    });
    expect(dbl.getState().incidents[0].status).toBe("closed");
    expect(dbl.getState().incidents[0].revision).toBe(3);

    // Duplicate same-window event while closed must keep closed state & revision 3
    await dbl.detectionStore.process(
      makeJobLease(ev3, "job-dup-while-closed"),
      new AbortController().signal,
      { correlateIncidents: true },
    );
    const closedInc = dbl.getState().incidents[0];
    expect(closedInc.status).toBe("closed");
    expect(closedInc.revision).toBe(3);
    expect(closedInc.closed_by).toBe(context.actorId);

    // Reopen at revision 3 -> revision 4
    await dbl.incidentStore.command(context, {
      incidentId: incId,
      action: "reopen",
      expectedRevision: 3,
      reason: "regression check",
    });
    const reopened = await dbl.incidentStore.incidentDetails(context, incId);
    expect(reopened.incident.status).toBe("investigating");
    expect(reopened.incident.revision).toBe(4);
    expect(reopened.evidence).toHaveLength(3);
    expect(reopened.timeline.map((t) => [t.sequence, t.type])).toEqual([
      [1, "alert_created"],
      [2, "incident_opened"],
      [3, "incident_opened"],
      [4, "incident_closed"],
      [5, "incident_opened"],
    ]);
  });
});
