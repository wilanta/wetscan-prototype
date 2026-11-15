import type { DetectionRule } from "../../src/features/sentinel/detection/model";
import type { StoredSecurityEvent } from "../../src/features/sentinel/types";
import { seedRules } from "../../src/features/sentinel/detection/seeds";
import { scope, lease } from "../platform/helpers";
import type { JobLease } from "../../src/features/sentinel/platform-contracts";
export const sourceId = "00000000-0000-4000-8000-000000000001",
  ruleId = "00000000-0000-4000-8000-000000000002",
  alertId = "00000000-0000-4000-8000-000000000003";
export const start = "2026-11-15T00:00:00.000Z";
export const context = {
  scope,
  actorId: "github-user-7",
  repositoryId: "123",
  canvasProjectRef: "github-user-7/github-123",
};
export function rule(): DetectionRule {
  return {
    ...scope,
    schemaVersion: 1,
    ruleId,
    revision: 2,
    version: 2,
    status: "ENABLED",
    definition: structuredClone(seedRules[3].definition),
    enabledAt: start,
    createdAt: start,
    updatedAt: start,
    actorId: "github-user-7",
    supported: true,
    unsupportedReason: null,
  };
}
export function event(n = 1): StoredSecurityEvent {
  const eventId = `00000000-0000-4000-8000-${String(n + 10).padStart(12, "0")}`;
  return {
    ...scope,
    schemaVersion: 1,
    revision: 1,
    sourceId,
    ingestedAt: `2026-11-15T00:00:${String(n % 60).padStart(2, "0")}.000Z`,
    event: {
      schemaVersion: 1,
      eventId,
      projectId: scope.projectId,
      occurredAt: start,
      kind: "http.request",
      request: { statusCode: 500 },
    },
    evidence: {
      id: `telemetry:${sourceId}:${eventId}`,
      sourceId,
      origin: "controlled_test",
      occurredAt: start,
      recordedAt: start,
    },
  };
}
export function detectionLease(): JobLease {
  const l = lease();
  return {
    ...l,
    job: {
      ...l.job,
      kind: "sentinel.telemetry.accepted",
      subjectRef: `${sourceId}/${event().event.eventId}`,
    },
  };
}
export function ruleRow(r = rule()) {
  return {
    mode: r.mode,
    workspace_id: r.workspaceId,
    project_id: r.projectId,
    rule_id: r.ruleId,
    current_version: r.revision,
    version: r.version,
    status: r.status,
    definition: r.definition,
    enabled_at: r.enabledAt,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    actor_id: r.actorId,
  };
}
export function eventRow(e = event()) {
  return {
    mode: e.mode,
    workspace_id: e.workspaceId,
    project_id: e.projectId,
    source_id: e.sourceId,
    event_id: e.event.eventId,
    event: e.event,
    occurred_at: e.event.occurredAt,
    ingested_at: e.ingestedAt,
    origin: e.evidence.origin,
  };
}
