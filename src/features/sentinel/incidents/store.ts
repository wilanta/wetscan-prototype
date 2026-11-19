import { produceIncidentOpened } from "../notifications/store";
import type { QueryResultRow } from "pg";
import { PlatformDatabase } from "../../../platform/database";
import { PlatformError } from "../../../platform/config";
import { fingerprint } from "../../../platform/identity";
import type { TransactionContext } from "../platform-contracts";
import type {
  EvidenceRef,
  SentinelProjectContext,
  SentinelScope,
  StoredSecurityEvent,
} from "../types";
import { canonicalScope } from "../scope";
import { object, TelemetryError, uuid } from "../telemetry/validation";
import type {
  DetectionRule,
  Evaluation,
  SecurityAlert,
} from "../detection/model";
import { preciseTime, micros } from "../detection/time";
import {
  incidentLimits,
  type IncidentDetailRecord,
  type IncidentPage,
  type IncidentStatus,
  type IncidentTimelineEventType,
  type IncidentTimelineRecord,
  type SecurityIncident,
} from "./model";
import {
  deterministicUuid,
  incidentCommand,
  validateTransition,
} from "./validation";

const where = "mode=$1 AND workspace_id=$2 AND project_id=$3";
const scopeValues = (s: SentinelScope) => [s.mode, s.workspaceId, s.projectId];
const iso = (v: unknown) => new Date(v as string).toISOString();
const exactIngest = `to_char(e.ingested_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_ingested_at`;

function eventView(
  r: QueryResultRow,
  scope: SentinelScope,
): StoredSecurityEvent {
  return {
    ...scope,
    schemaVersion: 1,
    revision: 1,
    sourceId: r.source_id,
    event: r.event,
    ingestedAt: preciseTime(r.exact_ingested_at ?? iso(r.ingested_at)),
    evidence: {
      id: `telemetry:${r.source_id}:${r.event_id}`,
      sourceId: r.source_id,
      origin: r.origin,
      occurredAt: iso(r.occurred_at),
      recordedAt: iso(r.ingested_at),
    },
  };
}

function alertView(r: QueryResultRow, scope: SentinelScope): SecurityAlert {
  return {
    ...scope,
    schemaVersion: 1,
    alertId: r.alert_id,
    ruleId: r.rule_id,
    ruleVersion: r.rule_version,
    ruleName: r.rule_name,
    sourceId: r.source_id,
    category: r.category,
    severity: r.severity,
    confidence: r.confidence,
    origin: r.origin,
    correlationKey: r.correlation_key,
    windowStart: iso(r.window_start),
    windowEnd: iso(r.window_end),
    firstObservedAt: iso(r.first_observed_at),
    lastObservedAt: iso(r.last_observed_at),
    detectedAt: iso(r.detected_at),
    matchedEventCount: r.matched_event_count,
    deduplicationKey: r.deduplication_key,
    suppressionStatus: "not_suppressed",
  };
}

function incidentView(
  r: QueryResultRow,
  scope: SentinelScope,
  alertIds: string[],
  evidenceRefs: EvidenceRef[],
): SecurityIncident {
  const firstObservedAt = iso(r.first_observed_at);
  return {
    ...scope,
    schemaVersion: 1,
    incidentId: r.incident_id,
    sourceId: r.source_id,
    primaryAlertId: r.primary_alert_id,
    ruleId: r.rule_id,
    ruleVersion: r.rule_version,
    ruleName: r.rule_name ?? r.title,
    title: r.title,
    summary: r.summary,
    category: r.category,
    severity: r.severity,
    status: r.status as IncidentStatus,
    verificationStatus: "not_requested",
    archived: false,
    origin: r.origin,
    correlationKey: r.correlation_key,
    deduplicationKey: r.deduplication_key,
    alertIds,
    evidenceIds: evidenceRefs.map((e) => e.id),
    evidenceRefs,
    occurredAt: firstObservedAt,
    firstObservedAt,
    lastObservedAt: iso(r.last_observed_at),
    openedAt: iso(r.opened_at),
    updatedAt: iso(r.updated_at),
    closedAt: r.closed_at ? iso(r.closed_at) : null,
    closedBy: r.closed_by ?? null,
    closeReason: r.close_reason ?? null,
    lastActorId: r.last_actor_id,
    revision: Number(r.revision),
  };
}

function timelineView(
  r: QueryResultRow,
  scope: SentinelScope,
  evidenceRefs: EvidenceRef[],
): IncidentTimelineRecord {
  const sequence = Number(r.sequence);
  return {
    ...scope,
    schemaVersion: 1,
    timelineId: r.timeline_id,
    incidentId: r.incident_id,
    sequence,
    revision: sequence,
    incidentRevision: Number(r.incident_revision),
    type: r.event_type as IncidentTimelineEventType,
    actorId: r.actor_id,
    actorType: r.actor_type,
    fromStatus: (r.from_status as IncidentStatus | null) ?? null,
    toStatus: (r.to_status as IncidentStatus | null) ?? null,
    summary: r.summary,
    metadata: (r.metadata ?? {}) as Record<
      string,
      string | number | boolean | null
    >,
    idempotencyKey: r.idempotency_key,
    occurredAt: iso(r.occurred_at),
    recordedAt: iso(r.recorded_at),
    evidenceIds: evidenceRefs.map((e) => e.id),
    evidenceRefs,
  };
}

type InitialTimelineEntry = {
  type: IncidentTimelineEventType;
  fromStatus: IncidentStatus | null;
  toStatus: IncidentStatus | null;
  summary: string;
  metadata: Record<string, string | number | boolean | null>;
  idempotencyKey: string;
};

/** Builds deterministic initial timeline entries for an alert correlated into an incident. */
function buildInitialTimelineEntries(
  scope: SentinelScope,
  incidentId: string,
  alertId: string,
  rule: Pick<DetectionRule, "ruleId" | "version" | "definition">,
  origin: StoredSecurityEvent["evidence"]["origin"],
  matchedEventCount: number,
): [InitialTimelineEntry, InitialTimelineEntry] {
  return [
    {
      type: "alert_created",
      fromStatus: null,
      toStatus: null,
      summary:
        `Alert ${alertId} recorded by rule ${rule.definition.name} v${rule.version} (${origin}).`.slice(
          0,
          280,
        ),
      metadata: {
        alertId,
        ruleId: rule.ruleId,
        ruleVersion: rule.version,
        origin,
        matchedEventCount,
      },
      idempotencyKey: fingerprint({
        kind: "sentinel.timeline.alert_created.v1",
        scope,
        incidentId,
        alertId,
      }),
    },
    {
      type: "incident_opened",
      fromStatus: null,
      toStatus: "open",
      summary:
        `Incident opened from alert ${alertId} with status OPEN (${origin}).`.slice(
          0,
          280,
        ),
      metadata: {
        alertId,
        status: "open",
        verificationStatus: "not_requested",
        origin,
      },
      idempotencyKey: fingerprint({
        kind: "sentinel.timeline.incident_opened.v1",
        scope,
        incidentId,
        alertId,
      }),
    },
  ];
}

/** Inserts an append-only timeline row and returns its verified persisted timeline_id, failing closed if absent. */
async function appendCorrelationTimelineEntry(
  db: PlatformDatabase,
  tx: TransactionContext,
  scope: SentinelScope,
  s: string[],
  incidentId: string,
  sequence: number,
  incidentRevision: number,
  occurredAt: string,
  entry: InitialTimelineEntry,
): Promise<string> {
  if (sequence > incidentLimits.timelineEntriesPerIncident)
    throw new TelemetryError("timeline_capacity", 409);
  const timelineId = deterministicUuid({
    kind: "sentinel.timeline.v1",
    scope,
    incidentId,
    idempotencyKey: entry.idempotencyKey,
  });
  const inserted = await db.query(
    tx,
    `INSERT INTO sentinel.incident_timeline(mode,workspace_id,project_id,incident_id,timeline_id,sequence,schema_version,event_type,actor_id,actor_type,from_status,to_status,summary,metadata,idempotency_key,incident_revision,occurred_at) VALUES($1,$2,$3,$4,$5,$6,1,$7,'system:sentinel-worker','system',$8,$9,$10,$11::jsonb,$12,$13,$14) ON CONFLICT DO NOTHING RETURNING timeline_id`,
    [
      ...s,
      incidentId,
      timelineId,
      sequence,
      entry.type,
      entry.fromStatus,
      entry.toStatus,
      entry.summary,
      JSON.stringify(entry.metadata),
      entry.idempotencyKey,
      incidentRevision,
      occurredAt,
    ],
  );
  let persistedId = inserted.rows[0]?.timeline_id as string | undefined;
  if (!persistedId) {
    const existing = await db.query(
      tx,
      `SELECT timeline_id FROM sentinel.incident_timeline WHERE ${where} AND incident_id=$4 AND idempotency_key=$5`,
      [...s, incidentId, entry.idempotencyKey],
    );
    persistedId = existing.rows[0]?.timeline_id as string | undefined;
  }
  if (!persistedId) throw Error("incident_timeline_missing");
  return persistedId;
}

/** Links event evidence to verified persisted incident_timeline rows within the current transaction. */
async function linkTimelineEvidence(
  db: PlatformDatabase,
  tx: TransactionContext,
  s: string[],
  incidentId: string,
  timelineIds: string[],
  sourceId: string,
  eventIds: string[],
) {
  for (const timelineId of timelineIds) {
    await db.query(
      tx,
      `INSERT INTO sentinel.incident_timeline_evidence(mode,workspace_id,project_id,incident_id,timeline_id,source_id,event_id) SELECT $1,$2,$3,$4,$5,$6,event_id FROM unnest($7::uuid[]) AS event_id ON CONFLICT DO NOTHING`,
      [...s, incidentId, timelineId, sourceId, eventIds],
    );
  }
}

export async function correlateAlertIncident(
  db: PlatformDatabase,
  tx: TransactionContext,
  scope: SentinelScope,
  alertId: string,
  rule: Pick<DetectionRule, "ruleId" | "version" | "definition">,
  anchor: StoredSecurityEvent,
  result: Evaluation,
): Promise<{ incidentId: string; created: boolean } | null> {
  if (db.module !== "sentinel") throw new PlatformError("scope_denied");
  const cleanScope = canonicalScope(scope);
  db.requireScope(tx, cleanScope);
  db.requireWorker(tx);
  if (
    !result.matched ||
    (result.outcome !== "alert_created" &&
      result.outcome !== "alert_deduplicated") ||
    !result.evidence.length
  )
    return null;

  const sourceId = uuid(anchor.sourceId);
  uuid(alertId);
  uuid(rule.ruleId);
  for (const item of result.evidence) {
    if (
      item.mode !== cleanScope.mode ||
      item.workspaceId !== cleanScope.workspaceId ||
      item.projectId !== cleanScope.projectId ||
      item.sourceId !== sourceId
    )
      throw new PlatformError("scope_denied");
    uuid(item.event.eventId);
  }

  const s = scopeValues(cleanScope);
  const deduplicationKey = result.matchKey;
  const existing = (
    await db.query(
      tx,
      `SELECT incident_id FROM sentinel.incidents WHERE ${where} AND deduplication_key=$4`,
      [...s, deduplicationKey],
    )
  ).rows[0];

  let incidentId = existing?.incident_id as string | undefined;
  let created = false;
  const firstObservedAt = result.evidence[0].event.occurredAt;
  const lastObservedAt = result.evidence.at(-1)!.event.occurredAt;
  const origin = anchor.evidence.origin;

  if (!incidentId) {
    const count = Number(
      (
        await db.query(
          tx,
          `SELECT count(*)::int AS n FROM sentinel.incidents WHERE ${where}`,
          s,
        )
      ).rows[0].n,
    );
    if (count >= incidentLimits.incidents) throw Error("incident_capacity");
    incidentId = deterministicUuid({
      kind: "sentinel.incident.v1",
      scope: cleanScope,
      deduplicationKey,
    });
    const title =
      `${rule.definition.name} (${origin === "controlled_test" ? "Controlled test" : "Runtime"})`.slice(
        0,
        160,
      );
    const summary =
      `${rule.definition.description} Matched ${result.evidence.length} ${rule.definition.category} event(s) on source ${sourceId}.`.slice(
        0,
        512,
      );
    const inserted = await db.query(
      tx,
      `INSERT INTO sentinel.incidents(mode,workspace_id,project_id,incident_id,source_id,primary_alert_id,rule_id,rule_version,schema_version,title,summary,category,severity,status,verification_status,archived,origin,correlation_key,deduplication_key,first_observed_at,last_observed_at,last_actor_id,revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$10,$11,$12,'open','not_requested',false,$13,$14,$15,$16,$17,'system:sentinel-worker',1) ON CONFLICT(mode,workspace_id,project_id,deduplication_key) DO NOTHING RETURNING incident_id`,
      [
        ...s,
        incidentId,
        sourceId,
        alertId,
        rule.ruleId,
        rule.version,
        title,
        summary,
        rule.definition.category,
        rule.definition.severity,
        origin,
        result.correlationKey,
        deduplicationKey,
        firstObservedAt,
        lastObservedAt,
      ],
    );
    created = (inserted.rowCount ?? 0) > 0;
    if (!created) {
      const winner = (
        await db.query(
          tx,
          `SELECT incident_id FROM sentinel.incidents WHERE ${where} AND deduplication_key=$4`,
          [...s, deduplicationKey],
        )
      ).rows[0];
      if (!winner) throw Error("incident_correlation_failed");
      incidentId = winner.incident_id as string;
    }
  }

  await db.query(
    tx,
    `INSERT INTO sentinel.incident_alerts(mode,workspace_id,project_id,incident_id,alert_id,source_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
    [...s, incidentId, alertId, sourceId],
  );
  const eventIds = result.evidence.map((e) => e.event.eventId);
  await db.query(
    tx,
    `INSERT INTO sentinel.incident_evidence(mode,workspace_id,project_id,incident_id,source_id,event_id) SELECT $1,$2,$3,$4,$5,event_id FROM unnest($6::uuid[]) AS event_id ON CONFLICT DO NOTHING`,
    [...s, incidentId, sourceId, eventIds],
  );
  // Locks the parent incident row so concurrent timeline sequence calculations serialize.
  const updatedIncident = await db.query(
    tx,
    `UPDATE sentinel.incidents SET first_observed_at=LEAST(first_observed_at,$5),last_observed_at=GREATEST(last_observed_at,$6) WHERE ${where} AND incident_id=$4 RETURNING revision`,
    [...s, incidentId, firstObservedAt, lastObservedAt],
  );
  if (!updatedIncident.rowCount) throw Error("incident_correlation_failed");
  const incidentRevision = Number(updatedIncident.rows[0]?.revision ?? 1);

  const [alertCreatedEntry, incidentOpenedEntry] = buildInitialTimelineEntries(
    cleanScope,
    incidentId,
    alertId,
    rule,
    origin,
    result.evidence.length,
  );
  const timelineIds: string[] = [];

  if (created) {
    timelineIds.push(
      await appendCorrelationTimelineEntry(
        db,
        tx,
        cleanScope,
        s,
        incidentId,
        1,
        1,
        lastObservedAt,
        alertCreatedEntry,
      ),
      await appendCorrelationTimelineEntry(
        db,
        tx,
        cleanScope,
        s,
        incidentId,
        2,
        1,
        lastObservedAt,
        incidentOpenedEntry,
      ),
    );
  } else {
    const existingForAlert = await db.query(
      tx,
      `SELECT timeline_id FROM sentinel.incident_timeline WHERE ${where} AND incident_id=$4 AND (idempotency_key=$5 OR idempotency_key=$6 OR (event_type IN ('alert_created','incident_opened') AND metadata->>'alertId'=$7)) ORDER BY sequence ASC LIMIT 10`,
      [
        ...s,
        incidentId,
        alertCreatedEntry.idempotencyKey,
        incidentOpenedEntry.idempotencyKey,
        alertId,
      ],
    );
    if (existingForAlert.rows.length > 0) {
      for (const row of existingForAlert.rows) {
        timelineIds.push(row.timeline_id as string);
      }
    } else {
      const seqRow = (
        await db.query(
          tx,
          `SELECT COALESCE(max(sequence),0)::int AS max_seq FROM sentinel.incident_timeline WHERE ${where} AND incident_id=$4`,
          [...s, incidentId],
        )
      ).rows[0];
      const maxSeq = Number(seqRow?.max_seq ?? 0);
      if (maxSeq === 0) {
        timelineIds.push(
          await appendCorrelationTimelineEntry(
            db,
            tx,
            cleanScope,
            s,
            incidentId,
            1,
            incidentRevision,
            lastObservedAt,
            alertCreatedEntry,
          ),
          await appendCorrelationTimelineEntry(
            db,
            tx,
            cleanScope,
            s,
            incidentId,
            2,
            incidentRevision,
            lastObservedAt,
            incidentOpenedEntry,
          ),
        );
      } else {
        timelineIds.push(
          await appendCorrelationTimelineEntry(
            db,
            tx,
            cleanScope,
            s,
            incidentId,
            maxSeq + 1,
            incidentRevision,
            lastObservedAt,
            alertCreatedEntry,
          ),
        );
      }
    }
  }

  await linkTimelineEvidence(
    db,
    tx,
    s,
    incidentId,
    timelineIds,
    sourceId,
    eventIds,
  );

  // S06: durable, deduplicated notification intents in the SAME transaction (savepoint-isolated; never blocks detection).
  // Only runtime/controlled-test evidence may notify; demo, fixture and scan-observed origins never do.
  if (created && (origin === "runtime" || origin === "controlled_test"))
    await produceIncidentOpened(db, tx, cleanScope, {
      incidentId,
      title:
        `${rule.definition.name} (${origin === "controlled_test" ? "Controlled test" : "Runtime"})`.slice(0, 160),
      severity: rule.definition.severity,
      origin,
    });
  return { incidentId, created };
}

export class IncidentStore {
  constructor(readonly db: PlatformDatabase) {}

  /** Explicitly correlates a persisted S03 alert in the given scope into an S04 incident inside a worker transaction. */
  async correlateAlertById(scope: SentinelScope, alertId: string) {
    if (this.db.module !== "sentinel") throw new PlatformError("scope_denied");
    uuid(alertId);
    const cleanScope = canonicalScope(scope);
    return this.db.scoped(cleanScope, async (tx) => {
      this.db.requireWorker(tx);
      const s = scopeValues(cleanScope);
      const bound = await this.db.query(
        tx,
        `SELECT project_id FROM sentinel.project_bindings WHERE ${where} AND enabled FOR UPDATE`,
        s,
      );
      if (!bound.rowCount) throw new PlatformError("scope_denied");
      const alertRow = (
        await this.db.query(
          tx,
          `SELECT a.*,v.definition FROM sentinel.detection_alerts a JOIN sentinel.detection_rule_versions v ON a.mode=v.mode AND a.workspace_id=v.workspace_id AND a.project_id=v.project_id AND a.rule_id=v.rule_id AND a.rule_version=v.version WHERE a.mode=$1 AND a.workspace_id=$2 AND a.project_id=$3 AND a.alert_id=$4`,
          [...s, alertId],
        )
      ).rows[0];
      if (!alertRow) throw new TelemetryError("alert_not_found", 404);
      const evidenceRows = (
        await this.db.query(
          tx,
          `SELECT e.*,s.origin,${exactIngest} FROM sentinel.detection_evidence l JOIN sentinel.telemetry_events e USING(mode,workspace_id,project_id,source_id,event_id) JOIN sentinel.telemetry_sources s USING(mode,workspace_id,project_id,source_id) WHERE l.mode=$1 AND l.workspace_id=$2 AND l.project_id=$3 AND l.alert_id=$4 ORDER BY e.occurred_at,e.source_id,e.event_id LIMIT 500`,
          [...s, alertId],
        )
      ).rows;
      if (!evidenceRows.length)
        throw new TelemetryError("alert_evidence_missing", 409);
      const evidence = evidenceRows.map((r) => eventView(r, cleanScope));
      const def = alertRow.definition as DetectionRule["definition"];
      return correlateAlertIncident(
        this.db,
        tx,
        cleanScope,
        alertId,
        {
          ruleId: alertRow.rule_id,
          version: alertRow.rule_version,
          definition: def,
        },
        evidence.at(-1)!,
        {
          outcome: "alert_created",
          reason: "threshold_reached",
          matched: true,
          matchKey: alertRow.deduplication_key,
          correlationKey: alertRow.correlation_key,
          windowStart: iso(alertRow.window_start),
          windowEnd: iso(alertRow.window_end),
          evidence,
        },
      );
    });
  }

  async incidents(
    context: SentinelProjectContext,
    query: URLSearchParams,
  ): Promise<IncidentPage> {
    if (this.db.module !== "sentinel") throw new PlatformError("scope_denied");
    if (
      [...query.keys()].some(
        (k) =>
          ![
            "sourceId",
            "severity",
            "status",
            "ruleId",
            "origin",
            "from",
            "to",
            "cursor",
            "limit",
          ].includes(k) || query.getAll(k).length !== 1,
      )
    )
      throw new TelemetryError("invalid_filter");
    const source = query.get("sourceId"),
      rule = query.get("ruleId"),
      severity = query.get("severity"),
      status = query.get("status"),
      origin = query.get("origin");
    if (source !== null) uuid(source);
    if (rule !== null) uuid(rule);
    if (severity !== null && !["low", "medium", "high"].includes(severity))
      throw new TelemetryError("invalid_filter");
    if (
      status !== null &&
      !["open", "investigating", "closed"].includes(status)
    )
      throw new TelemetryError("invalid_filter");
    if (origin !== null && !["runtime", "controlled_test"].includes(origin))
      throw new TelemetryError("invalid_filter");
    const limit = Number(query.get("limit") ?? 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new TelemetryError("invalid_limit");
    const filter = fingerprint({
      scope: canonicalScope(context.scope),
      source,
      rule,
      severity,
      status,
      origin,
    });
    let cursor:
      | { at: string; id: string; from: string; to: string; filter: string }
      | undefined;
    if (query.has("cursor")) {
      try {
        if (query.get("cursor")!.length > 1800) throw Error();
        const v = object(
          JSON.parse(
            Buffer.from(query.get("cursor")!, "base64url").toString("utf8"),
          ),
          ["at", "id", "from", "to", "filter"],
        );
        if (v.filter !== filter) throw Error();
        v.at = preciseTime(v.at);
        v.from = preciseTime(v.from);
        v.to = preciseTime(v.to);
        uuid(v.id);
        cursor = v as unknown as typeof cursor;
      } catch {
        throw new TelemetryError("invalid_cursor");
      }
    }
    return this.db.scoped(context.scope, async (tx) => {
      const s = scopeValues(context.scope);
      const to = query.has("to")
        ? preciseTime(query.get("to"))
        : (cursor?.to ??
          preciseTime(
            (
              await this.db.query(
                tx,
                `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS query_now`,
              )
            ).rows[0].query_now,
          ));
      const from = query.has("from")
        ? preciseTime(query.get("from"))
        : (cursor?.from ??
          `${new Date(Date.parse(to) - 86400000).toISOString().slice(0, 19)}${to.slice(19)}`);
      const span = micros(to) - micros(from);
      if (
        span < 0n ||
        span > 31n * 86400000000n ||
        (cursor && (cursor.from !== from || cursor.to !== to))
      )
        throw new TelemetryError("invalid_window");
      const rows = (
        await this.db.query(
          tx,
          `SELECT i.*,v.definition->>'name' AS rule_name,to_char(i.last_observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM sentinel.incidents i JOIN sentinel.detection_rule_versions v ON i.mode=v.mode AND i.workspace_id=v.workspace_id AND i.project_id=v.project_id AND i.rule_id=v.rule_id AND i.rule_version=v.version WHERE i.mode=$1 AND i.workspace_id=$2 AND i.project_id=$3 AND ($4::uuid IS NULL OR i.source_id=$4) AND ($5::uuid IS NULL OR i.rule_id=$5) AND ($6::text IS NULL OR i.severity=$6) AND ($7::text IS NULL OR i.status=$7) AND ($8::text IS NULL OR i.origin=$8) AND i.last_observed_at>=$9 AND i.last_observed_at<=$10 AND ($11::timestamptz IS NULL OR (i.last_observed_at,i.incident_id)<($11,$12::uuid)) ORDER BY i.last_observed_at DESC,i.incident_id DESC LIMIT $13`,
          [
            ...s,
            source,
            rule,
            severity,
            status,
            origin,
            from,
            to,
            cursor?.at ?? null,
            cursor?.id ?? null,
            limit + 1,
          ],
        )
      ).rows;
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const ids = page.map((r) => r.incident_id as string);
      const alertLinks = ids.length
        ? (
            await this.db.query(
              tx,
              `SELECT incident_id,alert_id FROM sentinel.incident_alerts WHERE ${where} AND incident_id=ANY($4::uuid[]) ORDER BY linked_at ASC,alert_id ASC`,
              [...s, ids],
            )
          ).rows
        : [];
      const evidenceLinks = ids.length
        ? (
            await this.db.query(
              tx,
              `SELECT ie.incident_id,ie.source_id,ie.event_id,e.occurred_at,e.ingested_at,s.origin FROM sentinel.incident_evidence ie JOIN sentinel.telemetry_events e USING(mode,workspace_id,project_id,source_id,event_id) JOIN sentinel.telemetry_sources s USING(mode,workspace_id,project_id,source_id) WHERE ie.mode=$1 AND ie.workspace_id=$2 AND ie.project_id=$3 AND ie.incident_id=ANY($4::uuid[]) ORDER BY e.occurred_at ASC,ie.source_id ASC,ie.event_id ASC`,
              [...s, ids],
            )
          ).rows
        : [];
      const alertsByIncident = new Map<string, string[]>();
      for (const link of alertLinks) {
        const list = alertsByIncident.get(link.incident_id) ?? [];
        list.push(link.alert_id);
        alertsByIncident.set(link.incident_id, list);
      }
      const evidenceByIncident = new Map<string, EvidenceRef[]>();
      for (const link of evidenceLinks) {
        const list = evidenceByIncident.get(link.incident_id) ?? [];
        list.push({
          id: `telemetry:${link.source_id}:${link.event_id}`,
          sourceId: link.source_id,
          origin: link.origin,
          occurredAt: iso(link.occurred_at),
          recordedAt: iso(link.ingested_at),
        });
        evidenceByIncident.set(link.incident_id, list);
      }
      return {
        items: page.map((r) =>
          incidentView(
            r,
            context.scope,
            alertsByIncident.get(r.incident_id) ?? [r.primary_alert_id],
            evidenceByIncident.get(r.incident_id) ?? [],
          ),
        ),
        window: { from, to },
        nextCursor:
          rows.length > limit && last
            ? Buffer.from(
                JSON.stringify({
                  at: last.cursor_at,
                  id: last.incident_id,
                  from,
                  to,
                  filter,
                }),
              ).toString("base64url")
            : null,
      };
    });
  }

  async incidentDetails(
    context: SentinelProjectContext,
    incidentId: string,
  ): Promise<IncidentDetailRecord> {
    if (this.db.module !== "sentinel") throw new PlatformError("scope_denied");
    uuid(incidentId);
    return this.db.scoped(context.scope, async (tx) => {
      const s = [...scopeValues(context.scope), incidentId];
      const row = (
        await this.db.query(
          tx,
          `SELECT i.*,v.definition->>'name' AS rule_name FROM sentinel.incidents i JOIN sentinel.detection_rule_versions v ON i.mode=v.mode AND i.workspace_id=v.workspace_id AND i.project_id=v.project_id AND i.rule_id=v.rule_id AND i.rule_version=v.version WHERE i.mode=$1 AND i.workspace_id=$2 AND i.project_id=$3 AND i.incident_id=$4`,
          s,
        )
      ).rows[0];
      if (!row) throw new TelemetryError("not_found", 404);
      const alerts = (
        await this.db.query(
          tx,
          `SELECT a.*,v.definition->>'name' AS rule_name FROM sentinel.incident_alerts ia JOIN sentinel.detection_alerts a USING(mode,workspace_id,project_id,alert_id,source_id) JOIN sentinel.detection_rule_versions v ON a.mode=v.mode AND a.workspace_id=v.workspace_id AND a.project_id=v.project_id AND a.rule_id=v.rule_id AND a.rule_version=v.version WHERE ia.mode=$1 AND ia.workspace_id=$2 AND ia.project_id=$3 AND ia.incident_id=$4 ORDER BY a.detected_at DESC,a.alert_id DESC LIMIT 100`,
          s,
        )
      ).rows.map((r) => alertView(r, context.scope));
      const evidence = (
        await this.db.query(
          tx,
          `SELECT e.*,s.origin,${exactIngest} FROM sentinel.incident_evidence ie JOIN sentinel.telemetry_events e USING(mode,workspace_id,project_id,source_id,event_id) JOIN sentinel.telemetry_sources s USING(mode,workspace_id,project_id,source_id) WHERE ie.mode=$1 AND ie.workspace_id=$2 AND ie.project_id=$3 AND ie.incident_id=$4 ORDER BY e.occurred_at ASC,e.source_id ASC,e.event_id ASC LIMIT 500`,
          s,
        )
      ).rows.map((r) => eventView(r, context.scope));
      const evidenceById = new Map<string, EvidenceRef>(
        evidence.map((e) => [`${e.sourceId}:${e.event.eventId}`, e.evidence]),
      );
      const timelineRows = (
        await this.db.query(
          tx,
          `SELECT * FROM sentinel.incident_timeline WHERE ${where} AND incident_id=$4 ORDER BY sequence ASC,occurred_at ASC,timeline_id ASC LIMIT 1000`,
          s,
        )
      ).rows;
      const timelineEvidenceRows = (
        await this.db.query(
          tx,
          `SELECT timeline_id,source_id,event_id FROM sentinel.incident_timeline_evidence WHERE ${where} AND incident_id=$4 ORDER BY timeline_id ASC,source_id ASC,event_id ASC LIMIT 5000`,
          s,
        )
      ).rows;
      const timelineRefs = new Map<string, EvidenceRef[]>();
      for (const link of timelineEvidenceRows) {
        const ref = evidenceById.get(`${link.source_id}:${link.event_id}`) ?? {
          id: `telemetry:${link.source_id}:${link.event_id}`,
          sourceId: link.source_id,
          origin: row.origin,
          occurredAt: iso(row.first_observed_at),
          recordedAt: iso(row.opened_at),
        };
        const list = timelineRefs.get(link.timeline_id) ?? [];
        list.push(ref);
        timelineRefs.set(link.timeline_id, list);
      }
      return {
        incident: incidentView(
          row,
          context.scope,
          alerts.length ? alerts.map((a) => a.alertId) : [row.primary_alert_id],
          evidence.map((e) => e.evidence),
        ),
        alerts,
        evidence,
        timeline: timelineRows.map((r) =>
          timelineView(r, context.scope, timelineRefs.get(r.timeline_id) ?? []),
        ),
      };
    });
  }

  async command(context: SentinelProjectContext, input: unknown) {
    if (this.db.module !== "sentinel") throw new PlatformError("scope_denied");
    const cmd = incidentCommand(input);
    return this.db.scoped(context.scope, async (tx) => {
      const s = scopeValues(context.scope);
      const binding = await this.db.query(
        tx,
        `SELECT project_id FROM sentinel.project_bindings WHERE ${where} AND enabled FOR UPDATE`,
        s,
      );
      if (!binding.rowCount)
        throw new TelemetryError("project_not_registered", 409);
      const row = (
        await this.db.query(
          tx,
          `SELECT incident_id,source_id,status,revision,origin FROM sentinel.incidents WHERE ${where} AND incident_id=$4 FOR UPDATE`,
          [...s, cmd.incidentId],
        )
      ).rows[0];
      if (!row) throw new TelemetryError("not_found", 404);
      const currentRevision = Number(row.revision);
      if (currentRevision !== cmd.expectedRevision)
        throw new TelemetryError("revision_conflict", 409);
      if (currentRevision >= incidentLimits.revisions)
        throw new TelemetryError("revision_capacity", 409);
      const currentStatus = row.status as IncidentStatus;
      const nextStatus = validateTransition(currentStatus, cmd);
      const nextRevision = currentRevision + 1;
      const seqRow = (
        await this.db.query(
          tx,
          `SELECT COALESCE(max(sequence),0)::int AS max_seq FROM sentinel.incident_timeline WHERE ${where} AND incident_id=$4`,
          [...s, cmd.incidentId],
        )
      ).rows[0];
      const nextSequence = Number(seqRow?.max_seq ?? 0) + 1;
      if (nextSequence > incidentLimits.timelineEntriesPerIncident)
        throw new TelemetryError("timeline_capacity", 409);

      const updated =
        cmd.action === "close"
          ? await this.db.query(
              tx,
              `UPDATE sentinel.incidents SET status='closed',updated_at=clock_timestamp(),closed_at=clock_timestamp(),closed_by=$5,close_reason=$6,last_actor_id=$5,revision=$7 WHERE ${where} AND incident_id=$4 AND revision=$8 RETURNING incident_id`,
              [
                ...s,
                cmd.incidentId,
                context.actorId,
                cmd.reason,
                nextRevision,
                cmd.expectedRevision,
              ],
            )
          : await this.db.query(
              tx,
              `UPDATE sentinel.incidents SET status='investigating',updated_at=clock_timestamp(),closed_at=NULL,closed_by=NULL,close_reason=NULL,last_actor_id=$5,revision=$6 WHERE ${where} AND incident_id=$4 AND revision=$7 RETURNING incident_id`,
              [
                ...s,
                cmd.incidentId,
                context.actorId,
                nextRevision,
                cmd.expectedRevision,
              ],
            );
      if (!updated.rowCount) throw new TelemetryError("revision_conflict", 409);

      const eventType: IncidentTimelineEventType =
        cmd.action === "close" ? "incident_closed" : "incident_opened";
      const summary =
        cmd.action === "close"
          ? `Investigation closed by ${context.actorId}: ${cmd.reason}`.slice(
              0,
              280,
            )
          : cmd.action === "reopen"
            ? `Investigation reopened by ${context.actorId}: ${cmd.reason}`.slice(
                0,
                280,
              )
            : (cmd.note
                ? `Investigation started by ${context.actorId}: ${cmd.note}`
                : `Investigation started by ${context.actorId}.`
              ).slice(0, 280);
      const metadata: Record<string, string | number | boolean | null> =
        cmd.action === "close"
          ? {
              action: "close",
              reason: cmd.reason,
              verificationStatus: "not_requested",
              mitigationApplied: false,
            }
          : cmd.action === "reopen"
            ? {
                action: "reopen",
                reason: cmd.reason,
                verificationStatus: "not_requested",
              }
            : {
                action: "investigate",
                note: cmd.note,
                verificationStatus: "not_requested",
              };
      const cleanScope = canonicalScope(context.scope);
      const idempotencyKey = fingerprint({
        kind: "sentinel.timeline.transition.v1",
        scope: cleanScope,
        incidentId: cmd.incidentId,
        revision: nextRevision,
        action: cmd.action,
      });
      const timelineId = deterministicUuid({
        kind: "sentinel.timeline.v1",
        scope: cleanScope,
        incidentId: cmd.incidentId,
        idempotencyKey,
      });
      await this.db.query(
        tx,
        `INSERT INTO sentinel.incident_timeline(mode,workspace_id,project_id,incident_id,timeline_id,sequence,schema_version,event_type,actor_id,actor_type,from_status,to_status,summary,metadata,idempotency_key,incident_revision,occurred_at) VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,'user',$9,$10,$11,$12::jsonb,$13,$14,clock_timestamp())`,
        [
          ...s,
          cmd.incidentId,
          timelineId,
          nextSequence,
          eventType,
          context.actorId,
          currentStatus,
          nextStatus,
          summary,
          JSON.stringify(metadata),
          idempotencyKey,
          nextRevision,
        ],
      );
      await this.db.query(
        tx,
        `INSERT INTO sentinel.incident_timeline_evidence(mode,workspace_id,project_id,incident_id,timeline_id,source_id,event_id) SELECT mode,workspace_id,project_id,incident_id,$5::uuid,source_id,event_id FROM sentinel.incident_evidence WHERE ${where} AND incident_id=$4 ORDER BY source_id ASC,event_id ASC LIMIT 500`,
        [...s, cmd.incidentId, timelineId],
      );
      return {
        incidentId: cmd.incidentId,
        status: nextStatus,
        revision: nextRevision,
        verificationStatus: "not_requested" as const,
        timelineId,
      };
    });
  }
}
