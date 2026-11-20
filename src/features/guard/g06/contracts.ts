import type { Finding, InventoryItem, ScanJob } from "../contracts";
import type { Decision } from "../g04/policy";

export interface G06ExtendedScanJob extends ScanJob {
  guardRemediation?: Array<{
    id?: string;
    findingId?: string;
    retest?: string;
  }>;
  guardRetests?: Array<{
    findingId?: string;
    outcome?: string;
    verifiedFixed?: boolean;
  }>;
}

export interface G06Scope {
  workspaceId: string;
  projectId: string;
  repositoryId?: number;
  repositoryName?: string;
}

export type G06ErrorCode =
  | "not_configured"
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "invalid_input"
  | "revision_conflict"
  | "conflict"
  | "lease_lost"
  | "consumer_unavailable";

export class G06Error extends Error {
  constructor(
    readonly code: G06ErrorCode,
    readonly status: number,
    message: string = code,
  ) {
    super(message);
    this.name = "G06Error";
  }
}

export type G06CanvasCoverage =
  | "available"
  | "partial"
  | "stale"
  | "not_scanned"
  | "unavailable";

export type G06MappingBasis =
  | "evidence_source_path"
  | "manifest_package_root"
  | "api_route_exact";

export type G06UnmatchedReason =
  | "no_location"
  | "no_matching_node"
  | "ambiguous_nodes"
  | "stale_commit"
  | "no_graph_revision";

export type G06Severity = "critical" | "high" | "medium" | "low" | "info";

export interface G06MappedFinding {
  id: string;
  findingKey: string;
  nodeId: string;
  title: string;
  severity: G06Severity;
  confidence: Finding["confidence"];
  engine: string;
  sourceLayer: "g02" | "g05";
  status: string;
  priority: "review" | "resolved";
  basis: G06MappingBasis;
  path?: string;
  line?: number;
  endpoint?: string;
  scanId: string;
  commitSha: string;
  evidenceSummary: string;
  href: string;
}

export interface G06UnmatchedFinding {
  id: string;
  title: string;
  severity: G06Severity;
  engine: string;
  sourceLayer: "g02" | "g05";
  status: string;
  path?: string;
  endpoint?: string;
  reason: G06UnmatchedReason;
  detail: string;
  scanId: string;
  commitSha: string;
  href: string;
}

export interface G06CanvasOverlayPayload {
  version: "guard.canvas.v1";
  projectId: string;
  commitSha: string | null;
  graphRevision: string;
  graphSourceRevision: string | null;
  scanId: string | null;
  g05RunId: string | null;
  coverageStatus: G06CanvasCoverage;
  staleReasons: string[];
  mappedFindings: G06MappedFinding[];
  unmatchedFindings: G06UnmatchedFinding[];
  summary: {
    totalEvaluated: number;
    mappedCount: number;
    unmatchedCount: number;
    reviewCount: number;
    bySeverity: Record<G06Severity, number>;
    byEngine: Record<string, number>;
  };
  generatedAt: string;
}

export interface G06CanvasOverlayRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  commitSha: string;
  graphRevision: string;
  scanId: string;
  g05RunId: string | null;
  coverageStatus: G06CanvasCoverage;
  mappedCount: number;
  unmatchedCount: number;
  overlayDigest: string;
  overlay: G06CanvasOverlayPayload;
  staleReasons: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  retentionUntil: string;
}

export type G06OutboxTopic = "intelligence_inventory" | "sentinel_pipeline";

export type G06OutboxState =
  | "pending"
  | "leased"
  | "retry_scheduled"
  | "acknowledged"
  | "conflict"
  | "failed";

export type G06AttemptOutcome =
  | "acknowledged"
  | "retryable_error"
  | "consumer_unavailable"
  | "conflict"
  | "rejected"
  | "permanent_failure"
  | "lease_expired";

export interface G06OutboxRecord {
  deliveryId: string;
  workspaceId: string;
  projectId: string;
  topic: G06OutboxTopic;
  scanId: string;
  commitSha: string;
  idempotencyKey: string;
  payloadDigest: string;
  eventType: string;
  schemaVersion: string;
  payload: Record<string, unknown>;
  state: G06OutboxState;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  leaseOwner: string | null;
  leaseToken: string | null;
  leaseUntil: string | null;
  lastError: string | null;
  consumerStatus: string | null;
  consumerAckRef: string | null;
  acknowledgedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  retentionUntil: string;
}

export interface G06DeliveryAttemptRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  deliveryId: string;
  topic: G06OutboxTopic;
  attempt: number;
  workerId: string;
  outcome: G06AttemptOutcome;
  httpStatus: number | null;
  consumerRef: string | null;
  errorCode: string | null;
  errorDetail: string | null;
  startedAt: string;
  finishedAt: string;
}

export interface G06IntelligenceSyncRecord {
  syncId: string;
  workspaceId: string;
  projectId: string;
  deliveryId: string;
  scanId: string;
  commitSha: string;
  inventoryDigest: string;
  lockfilePath: string;
  itemCount: number;
  unsupportedCount: number;
  syncStatus:
    | "pending"
    | "acknowledged"
    | "consumer_unavailable"
    | "project_not_registered"
    | "failed";
  sentinelSnapshotId: string | null;
  exposureAssessment:
    | "potential_exposure"
    | "no_match_within_coverage"
    | "cannot_assess"
    | null;
  exposureCount: number;
  exposureSummary: {
    advisoriesEvaluated?: number;
    catalogLastSuccessAt?: string | null;
    unsupportedEcosystems?: string[];
    exposures?: Array<{
      canonicalId: string;
      packageName: string;
      installedVersion: string;
      severity: string;
      kev: boolean;
      summary: string;
    }>;
    message?: string;
    errorCode?: string;
  };
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
  retentionUntil: string;
}

export type G06ReportStatus =
  | "VERIFIED"
  | "PARTIAL"
  | "INCOMPLETE"
  | "BLOCKED"
  | "NOT_CONFIGURED"
  | "STALE"
  | "FAILED";

export interface G06UnifiedReportBody {
  version: "guard.unified-report.v1";
  reportId: string;
  generatedAt: string;
  projectId: string;
  repositoryName: string | null;
  commitSha: string | null;
  branch: string | null;
  overallStatus: G06ReportStatus;
  statusReasons: string[];
  source: {
    acquisitionMethod: "github_only";
    excludedMethods: ["gitlab", "zip_upload"];
    latestScanId: string | null;
    latestScanStatus: string | null;
    profile: string | null;
    sourceCoverage: {
      totalFiles: number;
      scannedFiles: number;
      skippedFiles: number;
      omittedReasons: string[];
      incomplete: boolean;
    } | null;
  };
  staticScanning: {
    status: G06ReportStatus;
    engines: Array<{
      engine: string;
      status: string;
      findings: number;
      version?: string;
      rulesHash?: string;
      summary: string;
    }>;
    findingsTotal: number;
    activeFindings: number;
    bySeverity: Record<G06Severity, number>;
  };
  sbomAndInventory: {
    status: G06ReportStatus;
    format: string | null;
    itemCount: number;
    unsupportedCount: number;
    unknownLicenseCount: number;
    digest: string | null;
    samplePackages?: Pick<
      InventoryItem,
      "ecosystem" | "name" | "version" | "license"
    >[];
  };
  remediationAndRetest: {
    status: G06ReportStatus | "NOT_CONNECTED";
    g03Merged: boolean;
    guidanceCount: number;
    retestCount: number;
    verifiedFixedCount: number;
    note: string;
  };
  cicdPolicy: {
    status: G06ReportStatus;
    policyDecision: Decision | null;
    enforced: boolean;
    evaluationId: string | null;
    checkRunId: string | null;
    checkPublished: boolean;
    deploymentCount: number;
    note: string;
  };
  dastAndIntegrity: {
    status: G06ReportStatus;
    enabled: boolean;
    runId: string | null;
    runStatus: string | null;
    findingsTotal: number;
    verifiedFixedCount: number;
    cleanupStatus: string | null;
    note: string;
  };
  integrations: {
    canvas: {
      status: G06CanvasCoverage;
      overlayId: string | null;
      mappedCount: number;
      unmatchedCount: number;
      staleReasons: string[];
    };
    intelligence: {
      status: G06ReportStatus;
      syncStatus: G06IntelligenceSyncRecord["syncStatus"] | null;
      deliveryState: G06OutboxState | null;
      snapshotId: string | null;
      exposureAssessment:
        | G06IntelligenceSyncRecord["exposureAssessment"]
        | null;
      exposureCount: number;
      itemCount: number;
    };
    sentinel: {
      status: G06ReportStatus;
      deliveryState: G06OutboxState | null;
      lastAttemptOutcome: G06AttemptOutcome | null;
      attempts: number;
      pendingCount: number;
      acknowledgedCount: number;
      securityIncidentGenerated: false;
      note: string;
    };
  };
  limitations: string[];
  evidenceRefs: string[];
}

export interface G06UnifiedReportRecord {
  reportId: string;
  workspaceId: string;
  projectId: string;
  commitSha: string | null;
  scanId: string | null;
  g05RunId: string | null;
  g04EvaluationId: string | null;
  overallStatus: G06ReportStatus;
  reportDigest: string;
  body: G06UnifiedReportBody;
  createdBy: string;
  createdAt: string;
  retentionUntil: string;
}

export interface G06AuditRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  actor: string;
  action: string;
  subjectId: string;
  detail: Record<string, unknown>;
  occurredAt: string;
}

export interface G06Overview {
  projectId: string;
  configured: boolean;
  scopeNote: string;
  canvas: {
    latestOverlay: G06CanvasOverlayRecord | null;
  };
  intelligence: {
    latestSync: G06IntelligenceSyncRecord | null;
    outbox: G06OutboxRecord[];
  };
  sentinel: {
    outbox: G06OutboxRecord[];
    recentAttempts: G06DeliveryAttemptRecord[];
    consumerConfigured: boolean;
  };
  reports: G06UnifiedReportRecord[];
}
