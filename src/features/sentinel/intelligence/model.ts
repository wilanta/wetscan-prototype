import type {
  DetectionSeverity,
  EventKind,
  RuleDefinition,
  RuleStatus,
} from "../detection/model";
import type { SentinelScope } from "../types";

/** Bump when signature/grouping/proposal rules change; stored on every case and candidate. */
export const GROUPING_VERSION = 1 as const;
/** Cases join a group only when observed within this window of the group's latest observation (reproducible: no wall clock). */
export const GROUPING_WINDOW_DAYS = 30;
export const INTEL_SIMILARITY_DISCLAIMER =
  "Similarity is a deterministic indicator match. It does not prove a common attacker, successful exploitation, or that any incident was neutralized.";
export const intelLimits = {
  casesPerProject: 1000,
  candidatesPerProject: 200,
  tagsPerCase: 10,
  evidencePerCase: 500,
  revisions: 1000,
  auditPerSubject: 1000,
  detectionRules: 25,
} as const;

export type CaseStatus = "draft_pending_review" | "reviewed" | "dismissed";
/** Shelving only sets a case aside (releases the incident pin, leaves grouping). It is not resolution, rollback or deletion. */
export type ShelfState = "active" | "shelved";
export type CandidateReviewStatus = "DRAFT" | "APPROVED" | "REJECTED";
export type CaseOrigin = "runtime" | "controlled_test";

export interface CaseIndicators {
  schemaVersion: 1;
  ruleName: string;
  eventKinds: EventKind[];
  reasonCodes: string[];
  methods: string[];
  statusCodes: number[];
  routeTemplates: string[];
  evidenceCount: number;
  spanSeconds: number;
  alertCount: number;
}

export type EvidenceState = "available" | "missing";
export interface CaseEvidenceRef {
  id: string;
  sourceId: string;
  eventId: string;
  kind: EventKind;
  occurredAt: string;
  state: EvidenceState;
}
export type IncidentLiveState =
  | {
      state: "available";
      status: "open" | "investigating" | "closed";
      revision: number;
      changedSinceArchive: boolean;
    }
  | { state: "expired" };
export interface IntelCase extends SentinelScope {
  schemaVersion: 1;
  caseId: string;
  incidentId: string;
  sourceId: string;
  ruleId: string;
  ruleVersion: number;
  title: string;
  category: RuleDefinition["category"];
  severity: DetectionSeverity;
  origin: CaseOrigin;
  incidentStatusAtArchive: "open" | "investigating" | "closed";
  incidentRevisionAtArchive: number;
  incidentFirstObservedAt: string;
  incidentLastObservedAt: string;
  indicators: CaseIndicators;
  signature: string | null;
  groupingVersion: 1;
  tags: string[];
  status: CaseStatus;
  shelfState: ShelfState;
  archivedBy: string;
  archivedAt: string;
  updatedAt: string;
  revision: number;
  /** True while the source incident is pinned against retention by this active case. */
  incidentPinned: boolean;
  incident: IncidentLiveState;
  evidence: {
    total: number;
    available: number;
    missing: number;
    state: "complete" | "partial" | "unavailable";
  };
  /** Only populated in case detail. */
  evidenceRefs?: CaseEvidenceRef[];
}

export interface IntelGroup {
  groupId: string;
  groupingVersion: 1;
  origin: CaseOrigin;
  category: RuleDefinition["category"];
  matchedOn: {
    eventKinds: EventKind[];
    reasonCodes: string[];
    methods: string[];
    statusCodes: number[];
  };
  caseIds: string[];
  incidentIds: string[];
  members: { caseId: string; evidenceCount: number; spanSeconds: number }[];
  distinctSourceCount: number;
  severity: DetectionSeverity;
  firstObservedAt: string;
  lastObservedAt: string;
  windowDays: number;
  excludedOutsideWindow: number;
  confidence: "exact_indicator_match";
  explanation: string[];
  limitations: string[];
  candidateId: string | null;
}

export interface CandidateBasis {
  groupingVersion: 1;
  caseCount: number;
  distinctSourceCount: number;
  matchedOn: IntelGroup["matchedOn"];
  conditionsExpressed: string[];
  conditionsNotExpressed: string[];
  thresholdRationale: string;
  windowRationale: string;
  limitations: string[];
}
export interface RuleCandidate extends SentinelScope {
  schemaVersion: 1;
  candidateId: string;
  origin: CaseOrigin;
  signature: string;
  groupingVersion: 1;
  definition: RuleDefinition;
  basis: CandidateBasis;
  reviewStatus: CandidateReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  validatedBy: string | null;
  validatedAt: string | null;
  promotedRuleId: string | null;
  promotedBy: string | null;
  promotedAt: string | null;
  /** Live status of the S03 rule created from this candidate; owned by the detection engine, never set here. */
  ruleStatus: RuleStatus | null;
  proposedBy: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  caseIds: string[];
}

export type IntelAuditAction =
  | "case_archived"
  | "case_tagged"
  | "case_annotated"
  | "case_status_changed"
  | "case_shelf_changed"
  | "candidate_proposed"
  | "candidate_approved"
  | "candidate_rejected"
  | "candidate_validated"
  | "candidate_promoted";
export interface IntelAuditRecord extends SentinelScope {
  schemaVersion: 1;
  auditId: string;
  caseId: string | null;
  candidateId: string | null;
  sequence: number;
  action: IntelAuditAction;
  actorId: string;
  revision: number;
  summary: string;
  note: string | null;
  recordedAt: string;
}

export interface ArchivableIncident {
  incidentId: string;
  title: string;
  category: RuleDefinition["category"];
  severity: DetectionSeverity;
  status: "open" | "investigating" | "closed";
  origin: CaseOrigin;
  lastObservedAt: string;
}

export interface IntelOverview {
  cases: IntelCase[];
  groups: IntelGroup[];
  ungroupedCount: number;
  candidates: RuleCandidate[];
  archivableIncidents: ArchivableIncident[];
  audit: IntelAuditRecord[];
  grouping: { version: 1; windowDays: number; disclaimer: string };
  aiExplanation: { configured: false; status: "disabled"; reason: string };
}
export interface IntelCaseDetail {
  case: IntelCase;
  audit: IntelAuditRecord[];
  candidates: RuleCandidate[];
}
