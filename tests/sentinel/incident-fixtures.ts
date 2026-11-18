import { scope } from "../platform/helpers";
import {
  alertId,
  context,
  detectionLease,
  event,
  eventRow,
  rule,
  ruleId,
  ruleRow,
  sourceId,
  start,
} from "./detection-fixtures";
import type {
  IncidentTimelineRecord,
  SecurityIncident,
} from "../../src/features/sentinel/incidents/model";
import { deterministicUuid } from "../../src/features/sentinel/incidents/validation";
import { fingerprint } from "../../src/platform/identity";

export {
  alertId,
  context,
  detectionLease,
  event,
  eventRow,
  rule,
  ruleId,
  ruleRow,
  sourceId,
  start,
};

export const matchKey = "b".repeat(64);
export const correlationKey = "a".repeat(64);
export const incidentId = deterministicUuid({
  kind: "sentinel.incident.v1",
  scope,
  deduplicationKey: matchKey,
});

export function alertRow() {
  const r = rule();
  return {
    mode: scope.mode,
    workspace_id: scope.workspaceId,
    project_id: scope.projectId,
    alert_id: alertId,
    rule_id: r.ruleId,
    rule_version: r.version,
    rule_name: r.definition.name,
    definition: r.definition,
    source_id: sourceId,
    schema_version: 1,
    category: r.definition.category,
    severity: r.definition.severity,
    confidence: r.definition.confidence,
    origin: "controlled_test" as const,
    correlation_key: correlationKey,
    window_start: start,
    window_end: "2026-11-15T00:05:00.000Z",
    first_observed_at: start,
    last_observed_at: start,
    detected_at: start,
    matched_event_count: 5,
    deduplication_key: matchKey,
  };
}

export function incidentRow(
  overrides: Partial<{
    incident_id: string;
    status: "open" | "investigating" | "closed";
    severity: "low" | "medium" | "high";
    origin: "runtime" | "controlled_test";
    revision: number;
    closed_at: string | null;
    closed_by: string | null;
    close_reason: string | null;
  }> = {},
) {
  const r = rule();
  return {
    mode: scope.mode,
    workspace_id: scope.workspaceId,
    project_id: scope.projectId,
    incident_id: overrides.incident_id ?? incidentId,
    source_id: sourceId,
    primary_alert_id: alertId,
    rule_id: r.ruleId,
    rule_version: r.version,
    rule_name: r.definition.name,
    schema_version: 1,
    title: `${r.definition.name} (Controlled test)`,
    summary: `${r.definition.description} Matched 5 http event(s) on source ${sourceId}.`,
    category: r.definition.category,
    severity: overrides.severity ?? r.definition.severity,
    status: overrides.status ?? "open",
    verification_status: "not_requested",
    archived: false,
    origin: overrides.origin ?? "controlled_test",
    correlation_key: correlationKey,
    deduplication_key: matchKey,
    first_observed_at: start,
    last_observed_at: start,
    opened_at: start,
    updated_at: start,
    closed_at: overrides.closed_at ?? null,
    closed_by: overrides.closed_by ?? null,
    close_reason: overrides.close_reason ?? null,
    last_actor_id: "system:sentinel-worker",
    revision: overrides.revision ?? 1,
    cursor_at: "2026-11-15T00:00:00.000000Z",
  };
}

export interface TimelineRowFixture {
  mode: typeof scope.mode;
  workspace_id: string;
  project_id: string;
  incident_id: string;
  timeline_id: string;
  sequence: number;
  schema_version: 1;
  event_type: IncidentTimelineRecord["type"];
  actor_id: string;
  actor_type: IncidentTimelineRecord["actorType"];
  from_status: IncidentTimelineRecord["fromStatus"];
  to_status: IncidentTimelineRecord["toStatus"];
  summary: string;
  metadata: Record<string, string | number | boolean | null>;
  idempotency_key: string;
  incident_revision: number;
  occurred_at: string;
  recorded_at: string;
}

export function timelineRows(id = incidentId): TimelineRowFixture[] {
  const key1 = fingerprint({
    kind: "sentinel.timeline.alert_created.v1",
    scope,
    incidentId: id,
    alertId,
  });
  const key2 = fingerprint({
    kind: "sentinel.timeline.incident_opened.v1",
    scope,
    incidentId: id,
    alertId,
  });
  return [
    {
      mode: scope.mode,
      workspace_id: scope.workspaceId,
      project_id: scope.projectId,
      incident_id: id,
      timeline_id: deterministicUuid({
        kind: "sentinel.timeline.v1",
        scope,
        incidentId: id,
        idempotencyKey: key1,
      }),
      sequence: 1,
      schema_version: 1,
      event_type: "alert_created",
      actor_id: "system:sentinel-worker",
      actor_type: "system",
      from_status: null,
      to_status: null,
      summary: `Alert ${alertId} recorded by rule ${rule().definition.name} v2 (controlled_test).`,
      metadata: {
        alertId,
        ruleId,
        ruleVersion: 2,
        origin: "controlled_test",
        matchedEventCount: 5,
      },
      idempotency_key: key1,
      incident_revision: 1,
      occurred_at: start,
      recorded_at: start,
    },
    {
      mode: scope.mode,
      workspace_id: scope.workspaceId,
      project_id: scope.projectId,
      incident_id: id,
      timeline_id: deterministicUuid({
        kind: "sentinel.timeline.v1",
        scope,
        incidentId: id,
        idempotencyKey: key2,
      }),
      sequence: 2,
      schema_version: 1,
      event_type: "incident_opened",
      actor_id: "system:sentinel-worker",
      actor_type: "system",
      from_status: null,
      to_status: "open",
      summary: `Incident opened from alert ${alertId} with status OPEN (controlled_test).`,
      metadata: {
        alertId,
        status: "open",
        verificationStatus: "not_requested",
        origin: "controlled_test",
      },
      idempotency_key: key2,
      incident_revision: 1,
      occurred_at: start,
      recorded_at: start,
    },
  ];
}

export function incidentFixture(): SecurityIncident {
  const r = incidentRow();
  const ev = event(1);
  return {
    ...scope,
    schemaVersion: 1,
    incidentId: r.incident_id,
    sourceId: r.source_id,
    primaryAlertId: r.primary_alert_id,
    ruleId: r.rule_id,
    ruleVersion: r.rule_version,
    ruleName: r.rule_name,
    title: r.title,
    summary: r.summary,
    category: r.category,
    severity: r.severity,
    status: r.status,
    verificationStatus: "not_requested",
    archived: false,
    origin: r.origin,
    correlationKey: r.correlation_key,
    deduplicationKey: r.deduplication_key,
    alertIds: [alertId],
    evidenceIds: [ev.evidence.id],
    evidenceRefs: [ev.evidence],
    occurredAt: start,
    firstObservedAt: start,
    lastObservedAt: start,
    openedAt: start,
    updatedAt: start,
    closedAt: null,
    closedBy: null,
    closeReason: null,
    lastActorId: r.last_actor_id,
    revision: 1,
  };
}

export function timelineFixture(): IncidentTimelineRecord[] {
  const ev = event(1);
  return timelineRows().map((r) => ({
    ...scope,
    schemaVersion: 1,
    timelineId: r.timeline_id,
    incidentId: r.incident_id,
    sequence: r.sequence,
    revision: r.sequence,
    incidentRevision: r.incident_revision,
    type: r.event_type,
    actorId: r.actor_id,
    actorType: r.actor_type,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    summary: r.summary,
    metadata: r.metadata,
    idempotencyKey: r.idempotency_key,
    occurredAt: r.occurred_at,
    recordedAt: r.recorded_at,
    evidenceIds: [ev.evidence.id],
    evidenceRefs: [ev.evidence],
  }));
}
