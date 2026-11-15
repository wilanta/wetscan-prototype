import type { SentinelScope, StoredSecurityEvent } from "../types";

export type RuleStatus = "DRAFT" | "ENABLED" | "DISABLED";
export type DetectionSeverity = "low" | "medium" | "high";
export type EventKind = StoredSecurityEvent["event"]["kind"];
export type Condition =
  | {
      field: "request.statusCode" | "attributes.durationMs";
      op: "eq" | "gte" | "lte";
      value: number;
    }
  | {
      field: "request.method" | "attributes.reasonCode";
      op: "eq";
      value: string;
    };
export interface RuleDefinition {
  schemaVersion: 1;
  name: string;
  description: string;
  category: "authentication" | "http" | "decoy";
  severity: DetectionSeverity;
  confidence: number;
  eventKinds: EventKind[];
  conditions: Condition[];
  correlation: "source" | "actor_hash";
  windowSeconds: number;
  threshold: number;
  cooldownSeconds: number;
  suppressionWindows: { from: string; to: string }[];
}
export interface DetectionRule extends SentinelScope {
  schemaVersion: 1;
  ruleId: string;
  revision: number;
  version: number;
  status: RuleStatus;
  definition: RuleDefinition;
  enabledAt: string | null;
  createdAt: string;
  updatedAt: string;
  actorId: string;
  supported: boolean;
  unsupportedReason: "actor_identity_not_persisted" | null;
}
export type EvaluationOutcome =
  | "rule_not_applicable"
  | "insufficient_evidence"
  | "late_event"
  | "alert_suppressed"
  | "alert_created"
  | "alert_deduplicated";
export interface Evaluation {
  outcome: EvaluationOutcome;
  reason: string;
  matched: boolean;
  matchKey: string;
  correlationKey: string;
  windowStart: string;
  windowEnd: string;
  evidence: StoredSecurityEvent[];
}
export interface SecurityAlert extends SentinelScope {
  schemaVersion: 1;
  alertId: string;
  ruleId: string;
  ruleVersion: number;
  ruleName: string;
  sourceId: string;
  category: RuleDefinition["category"];
  severity: DetectionSeverity;
  confidence: number;
  origin: "runtime" | "controlled_test";
  correlationKey: string;
  windowStart: string;
  windowEnd: string;
  firstObservedAt: string;
  lastObservedAt: string;
  detectedAt: string;
  matchedEventCount: number;
  deduplicationKey: string;
  suppressionStatus: "not_suppressed";
}
export interface AlertPage {
  items: SecurityAlert[];
  nextCursor: string | null;
  window: { from: string; to: string };
}
export const detectionLimits = {
  rules: 25,
  versions: 100,
  events: 500,
  conditions: 8,
  lateSeconds: 300,
  alerts: 10000,
  evaluations: 100000,
  suppressedEvidence: 50000,
} as const;
