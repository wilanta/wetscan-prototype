import type { Mode, Scope } from "../guard/contracts";

/** Same structural identity as Guard; always derived/authorized on the server. */
export type SentinelScope = Scope;
export type SentinelMode = Mode;
export type EvidenceOrigin =
  "runtime" | "observed_scan" | "controlled_test" | "fixture" | "demo";
export interface EvidenceRef {
  id: string;
  sourceId: string;
  origin: EvidenceOrigin;
  occurredAt: string;
  recordedAt: string;
}
export interface VersionedRecord extends SentinelScope {
  schemaVersion: 1;
  revision: number;
}
export interface SentinelProjectContext {
  scope: SentinelScope;
  actorId: string;
  repositoryId: string;
  /** Canvas snapshot ref differs from its route project ID. */
  canvasProjectRef: string;
}
export interface TelemetrySource extends VersionedRecord {
  sourceId: string;
  origin: "runtime" | "controlled_test" | "fixture" | "demo";
  environment: "local" | "staging" | "production";
  status: "not_configured" | "connected" | "disconnected" | "stale" | "failed";
  lastIngestedAt: string | null;
}
/** Untrusted producer input. S02 must add strict wire validation and limits. */
export interface SentinelEventV1 {
  schemaVersion: 1;
  eventId: string;
  projectId: string;
  occurredAt: string;
  kind:
    | "auth.failed"
    | "http.suspicious_path"
    | "http.request"
    | "ghost.decoy_triggered";
  severityHint?: "info" | "low" | "medium" | "high";
  actorHash?: string;
  request?: { method?: string; routeTemplate?: string; statusCode?: number };
  attributes?: Record<string, string | number | boolean>;
}
/** Server-bound credential scope/source overrides any client identity claim. */
export interface StoredSecurityEvent extends VersionedRecord {
  event: SentinelEventV1;
  sourceId: string;
  ingestedAt: string;
  evidence: EvidenceRef;
}
export interface RuleRef {
  ruleId: string;
  revision: number;
  status: "DRAFT" | "ENABLED" | "DISABLED" | "REJECTED";
}
export interface Alert extends VersionedRecord {
  alertId: string;
  sourceId: string;
  rule: RuleRef;
  eventIds: string[];
  evidenceIds: string[];
  occurredAt: string;
}
export type LifecycleEvent =
  | "ingested"
  | "normalized"
  | "rule_matched"
  | "alert_created"
  | "incident_opened"
  | "policy_evaluating"
  | "response_proposed"
  | "human_approved"
  | "mitigation_applied"
  | "verification_pending"
  | "neutralization_verified"
  | "verification_failed"
  | "verification_inconclusive"
  | "rollback"
  | "expiry"
  | "incident_closed";
export type VerificationStatus =
  "not_requested" | "pending" | "verified" | "failed" | "inconclusive";
export interface Incident extends VersionedRecord {
  incidentId: string;
  sourceId: string;
  alertIds: string[];
  evidenceIds: string[];
  status: "open" | "investigating" | "closed";
  verificationStatus: VerificationStatus;
  archived: boolean;
  occurredAt: string;
}
export interface TimelineEntry extends VersionedRecord {
  timelineId: string;
  incidentId: string;
  type: LifecycleEvent;
  actorId: string;
  occurredAt: string;
  evidenceIds: string[];
}
export interface ResponseProposal extends VersionedRecord {
  actionId: string;
  incidentId: string;
  targetRef: string;
  operation: "temporary_rate_limit";
  ttlSeconds: number;
  idempotencyKey: string;
  approval: {
    actorId: string;
    approvedAt: string;
    expiresAt: string;
    proofId: string;
  } | null;
}
export interface VerificationResult extends VersionedRecord {
  actionId: string;
  verificationStatus: VerificationStatus;
  maliciousReplayBlocked: boolean | null;
  benignControlAllowed: boolean | null;
  evidenceIds: string[];
  checkedAt: string;
}
export type Channel = "telegram" | "email" | "whatsapp";
export type DeliveryStatus =
  "preview" | "queued" | "accepted" | "delivered" | "failed" | "not_configured";
export interface NotificationMessage extends VersionedRecord {
  deliveryId: string;
  incidentId: string;
  channel: Channel;
  destinationRef: string;
  trigger:
    | "alert_created"
    | "mitigation_applied"
    | "neutralization_verified"
    | "verification_failed"
    | "new_exposure"
    | "test";
  redactedText: string;
  idempotencyKey: string;
}
