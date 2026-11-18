import type {
  EvidenceRef,
  Incident,
  SentinelScope,
  StoredSecurityEvent,
  TimelineEntry,
} from "../types";
import type {
  DetectionSeverity,
  RuleDefinition,
  SecurityAlert,
} from "../detection/model";

export type IncidentStatus = Incident["status"];
export type IncidentTimelineEventType =
  | "alert_created"
  | "incident_opened"
  | "incident_closed";

export interface SecurityIncident extends Incident {
  schemaVersion: 1;
  incidentId: string;
  sourceId: string;
  primaryAlertId: string;
  ruleId: string;
  ruleVersion: number;
  ruleName: string;
  title: string;
  summary: string;
  category: RuleDefinition["category"];
  severity: DetectionSeverity;
  status: IncidentStatus;
  verificationStatus: "not_requested";
  archived: false;
  origin: "runtime" | "controlled_test";
  correlationKey: string;
  deduplicationKey: string;
  alertIds: string[];
  evidenceIds: string[];
  evidenceRefs: EvidenceRef[];
  occurredAt: string;
  firstObservedAt: string;
  lastObservedAt: string;
  openedAt: string;
  updatedAt: string;
  closedAt: string | null;
  closedBy: string | null;
  closeReason: string | null;
  lastActorId: string;
  revision: number;
}

export interface IncidentTimelineRecord extends TimelineEntry {
  schemaVersion: 1;
  timelineId: string;
  incidentId: string;
  sequence: number;
  revision: number;
  incidentRevision: number;
  type: IncidentTimelineEventType;
  actorId: string;
  actorType: "system" | "user";
  fromStatus: IncidentStatus | null;
  toStatus: IncidentStatus | null;
  summary: string;
  metadata: Record<string, string | number | boolean | null>;
  idempotencyKey: string;
  occurredAt: string;
  recordedAt: string;
  evidenceIds: string[];
  evidenceRefs: EvidenceRef[];
}

export interface IncidentPage {
  items: SecurityIncident[];
  nextCursor: string | null;
  window: { from: string; to: string };
}

export interface IncidentDetailRecord {
  incident: SecurityIncident;
  alerts: SecurityAlert[];
  evidence: StoredSecurityEvent[];
  timeline: IncidentTimelineRecord[];
}

export const incidentLimits = {
  incidents: 10000,
  timelineEntriesPerIncident: 1000,
  revisions: 1000,
  evidencePerIncident: 500,
  retentionDays: 30,
} as const;

export type IncidentScopeFilter = {
  scope: SentinelScope;
  source: string | null;
  rule: string | null;
  severity: string | null;
  status: string | null;
  origin: string | null;
};
