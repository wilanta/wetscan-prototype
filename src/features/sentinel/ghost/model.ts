import type { DetectionRule, SecurityAlert } from "../detection/model";
import type { SecurityIncident } from "../incidents/model";
import type { SourceView } from "../telemetry/validation";
import type { SentinelScope, StoredSecurityEvent } from "../types";

export const DEFAULT_GHOST_DECOY_PATH = "/__wetscan/ghost-decoy";
export const GHOST_FALSE_POSITIVE_POLICY =
  "A decoy hit is a suspicious signal, never proof of compromise. Benign scanners or crawlers can trigger this endpoint. Automated blocking, credential capture, and session hijacking are disabled.";

export const ghostLimits = {
  decoysPerProject: 10,
  revisions: 1000,
  maxRateLimitPerMin: 120,
  defaultRateLimitPerMin: 30,
} as const;

export type GhostDecoyConnectionStatus =
  | "disabled"
  | "not_configured"
  | "connected"
  | "stale"
  | "disconnected"
  | "failed";

export type GhostAuditAction = "created" | "updated" | "enabled" | "disabled";

export interface GhostDecoyRecord extends SentinelScope {
  schemaVersion: 1;
  decoyId: string;
  sourceId: string;
  sourceName: string;
  name: string;
  environment: "local" | "staging" | "production";
  origin: "runtime" | "controlled_test";
  targetRef: string;
  decoyPath: string;
  enabled: boolean;
  ownedAppConfirmed: boolean;
  responseStatus: 200 | 204 | 404;
  rateLimitPerMin: number;
  h07ProofId: string | null;
  falsePositiveNotice: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  lastHitAt: string | null;
  sourceEnabled: boolean;
  sourceStatus: SourceView["status"];
  activeCredentials: number;
  lastContactAt: string | null;
  lastIngestedAt: string | null;
  connectionStatus: GhostDecoyConnectionStatus;
}

export interface GhostAuditRecord extends SentinelScope {
  schemaVersion: 1;
  auditId: string;
  decoyId: string;
  sequence: number;
  action: GhostAuditAction;
  actorId: string;
  revision: number;
  summary: string;
  recordedAt: string;
}

export interface GhostOverview {
  decoys: GhostDecoyRecord[];
  sources: SourceView[];
  rule: DetectionRule | null;
  ruleStatus: "not_seeded" | "DRAFT" | "ENABLED" | "DISABLED";
  hits: StoredSecurityEvent[];
  alerts: SecurityAlert[];
  incidents: SecurityIncident[];
  audit: GhostAuditRecord[];
  falsePositivePolicy: string;
  futureS08Archive: {
    available: false;
    reason: string;
    eligibleIncidentCount: number;
  };
}
