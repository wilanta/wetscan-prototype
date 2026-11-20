export const G05_SCANNER_VERSION = "wetscan-g05-dast-integrity/1.0.0";
export const G05_JOB_KIND = "guard.g05.verify" as const;

export type G05Scope = {
  workspaceId: string;
  projectId: string;
};

export type G05TargetEnvironment = "staging" | "local_synthetic";
export type G05HttpMethod = "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";
export type G05Category =
  | "dast_header"
  | "dast_tls"
  | "dast_auth"
  | "dast_cors"
  | "dast_session"
  | "dast_authz"
  | "dast_response"
  | "auth_matrix"
  | "integrity_ownership"
  | "integrity_workflow_bypass"
  | "integrity_state_transition"
  | "integrity_replay"
  | "integrity_unauthorized_modification";

export type G05InvariantFamily =
  | "ownership"
  | "workflow_bypass"
  | "state_transition"
  | "replay"
  | "unauthorized_modification";

export type G05AccountRole = "anonymous" | "user_a" | "user_b" | "privileged" | "custom";
export type G05AuthStrategy = "none" | "bearer_login" | "cookie_login" | "header_token";
export type G05AccountStatus = "configured" | "active" | "expired" | "revoked" | "cleaned";

export type G05TrustIntegrationStatus =
  | "CONNECTED"
  | "NOT_CONNECTED"
  | "INVALID_PLAN"
  | "STALE"
  | "NOT_AUTHORIZED";

export type G05RunStatus =
  | "draft"
  | "pending_authorization"
  | "queued"
  | "running"
  | "completed"
  | "completed_partial"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "not_configured"
  | "not_applicable";

export type G05CaseOutcome =
  | "VERIFIED_PASS"
  | "VERIFIED_FAIL"
  | "INCONCLUSIVE"
  | "NOT_EXECUTED"
  | "CANCELLED"
  | "CLEANUP_FAILED";

export type G05Severity = "critical" | "high" | "medium" | "low" | "info";
export type G05FindingStatus =
  | "potential"
  | "under_review"
  | "verified"
  | "fix_pending_retest"
  | "verified_fixed"
  | "false_positive"
  | "risk_accepted";

export interface G05TargetConfig {
  allowedRoutes: string[];
  allowedMethods: G05HttpMethod[];
  maxRequests: number;
  maxConcurrency: number;
  rateLimitRps: number;
  maxResponseBytes: number;
  timeoutMs: number;
  approvedCategories: G05Category[];
  allowedSyntheticResources: string[];
  cleanupPolicy: "delete_created_and_revoke_sessions" | "reset_endpoint_and_revoke_sessions";
  cleanupEndpoint?: string;
}

export interface G05TargetRecord {
  workspaceId: string;
  projectId: string;
  id: string;
  revision: number;
  name: string;
  environment: G05TargetEnvironment;
  origin: string;
  serviceIdentity: string | null;
  owner: string;
  status: "draft" | "active" | "revoked";
  config: G05TargetConfig;
  targetDigest: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface G05ExecutionGrant {
  workspaceId: string;
  projectId: string;
  id: string;
  targetId: string;
  targetRevision: number;
  targetDigest: string;
  consentActor: string;
  proofId: string;
  authorizationRef: string;
  approvedCategories: G05Category[];
  status: "active" | "revoked";
  expiresAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
  createdAt: string;
}

/** Public DTO only: ciphertext and raw secrets NEVER leave server storage or appear in API responses. */
export interface G05TestAccountView {
  workspaceId: string;
  projectId: string;
  id: string;
  targetId: string;
  role: G05AccountRole;
  customRoleName: string | null;
  label: string;
  synthetic: true;
  usernameRef: string;
  authStrategy: G05AuthStrategy;
  loginPath: string | null;
  credentialConfigured: boolean;
  credentialFingerprint: string | null;
  status: G05AccountStatus;
  expiresAt: string;
  lastVerifiedAt: string | null;
  revokedAt: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface G05TrustActor {
  id: string;
  label: string;
  mappedRole?: G05AccountRole;
}

export interface G05TrustResource {
  id: string;
  label: string;
  nodeId?: string;
  routePrefix?: string;
}

export interface G05TrustRule {
  id: string;
  roleId: string;
  resourceId: string;
  action: string;
  ownership: string;
  allowed: boolean;
  confirmed: boolean;
  endpoint?: string;
  method?: G05HttpMethod;
}

export interface G05CanvasTrustPlan {
  workspaceId: string;
  projectId: string;
  id: string;
  canvasGraphRevision: string;
  planVersion: number;
  targetCommit: string | null;
  sourcePlanDigest: string;
  integrationStatus: G05TrustIntegrationStatus;
  confirmed: boolean;
  confirmedBy: string;
  confirmedAt: string | null;
  expiresAt: string | null;
  plan: {
    actors: G05TrustActor[];
    resources: G05TrustResource[];
    rules: G05TrustRule[];
    boundaryNodeIds: string[];
  };
  validationErrors: string[];
  createdBy: string;
  createdAt: string;
}

export interface G05WorkflowTransitionDef {
  id: string;
  from: string;
  to: string;
  actor: string;
  actorRole: G05AccountRole;
  forbidden: boolean;
  precondition: string;
  endpoint: string;
  method: G05HttpMethod;
  expectedHttp: number;
  assertion: string;
  hypothesis: string;
  replaySensitive?: boolean;
  idempotent?: boolean;
}

export interface G05WorkflowImport {
  workspaceId: string;
  projectId: string;
  id: string;
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
  canvasGraphRevision: string;
  sourceDigest: string;
  validationStatus: "valid" | "rejected";
  validationErrors: string[];
  definition: {
    states: { id: string; label: string }[];
    transitions: G05WorkflowTransitionDef[];
    invariants: string[];
    protectedFields: string[];
    replayExpectation: string;
    cleanupStrategy: string;
  };
  endpointMappings: { transitionId: string; endpoint: string; method: G05HttpMethod; mapped: boolean }[];
  trustPlanId: string | null;
  createdBy: string;
  createdAt: string;
}

export type G05Profile = "dast_baseline" | "auth_matrix" | "integrity_suite" | "full_g05";

export interface G05PlannedCase {
  caseId: string;
  category: G05Category;
  invariantFamily: G05InvariantFamily | null;
  title: string;
  actorRole: G05AccountRole;
  method: G05HttpMethod;
  path: string;
  expectedStatus: number[];
  expectedBehavior: string;
  stateChanging: boolean;
  idempotencyRequired: boolean;
  cleanupAction: "none" | "delete_order" | "revoke_session";
  sourceRef: string;
}

export interface G05TestPlan {
  workspaceId: string;
  projectId: string;
  id: string;
  version: number;
  targetId: string;
  targetRevision: number;
  trustPlanId: string | null;
  workflowImportId: string | null;
  profile: G05Profile;
  categories: G05Category[];
  cases: G05PlannedCase[];
  planDigest: string;
  createdBy: string;
  createdAt: string;
}

export interface G05RunSummary {
  totalCases: number;
  passed: number;
  failed: number;
  inconclusive: number;
  notExecuted: number;
  cancelled: number;
  cleanupFailed: number;
  findingsCreated: number;
  decision: "PASS" | "FAIL" | "INCOMPLETE" | "BLOCKED";
}

export interface G05RunCoverage {
  executedCategories: G05Category[];
  skippedCategories: G05Category[];
  invariantsVerified: G05InvariantFamily[];
  invariantsFailed: G05InvariantFamily[];
  targetEnvironment: G05TargetEnvironment;
  tlsApplicable: boolean;
  localSyntheticPinned: boolean;
}

export interface G05Run {
  workspaceId: string;
  projectId: string;
  id: string;
  idempotencyKey: string;
  fingerprint: string;
  testPlanId: string;
  targetId: string;
  targetRevision: number;
  grantId: string;
  trustPlanId: string | null;
  workflowImportId: string | null;
  retestOfRunId: string | null;
  retestCaseIds: string[] | null;
  status: G05RunStatus;
  scannerVersion: string;
  scopeDigest: string;
  evidenceDigest: string | null;
  executedRequests: number;
  maxRequests: number;
  cleanupStatus: "not_needed" | "pending" | "verified" | "failed";
  summary: G05RunSummary;
  coverage: G05RunCoverage;
  revision: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface G05CaseResult {
  workspaceId: string;
  projectId: string;
  runId: string;
  caseId: string;
  category: G05Category;
  invariantFamily: G05InvariantFamily | null;
  actorRole: G05AccountRole;
  httpMethod: string;
  requestPath: string;
  status: G05CaseOutcome;
  severity: G05Severity;
  expectedBehavior: {
    statusCodes: number[];
    summary: string;
    stateInvariant?: string;
  };
  observedBehavior: {
    httpStatus: number | null;
    summary: string;
    redactedHeaders?: Record<string, string>;
    redactedBodyExcerpt?: string;
    errorCode?: string;
  };
  preState: Record<string, unknown> | null;
  postState: Record<string, unknown> | null;
  cleanupStatus: "not_needed" | "verified" | "failed";
  cleanupReceipt: Record<string, unknown> | null;
  evidenceDigest: string;
  executedRequests: number;
  startedAt: string;
  finishedAt: string;
}

export interface G05Finding {
  workspaceId: string;
  projectId: string;
  id: string;
  runId: string;
  caseId: string;
  engine: "dast" | "api" | "integrity";
  title: string;
  severity: G05Severity;
  confidence: "low" | "medium" | "high";
  status: G05FindingStatus;
  endpoint: string;
  invariantFamily: G05InvariantFamily | null;
  summary: string;
  evidence: {
    runId: string;
    caseId: string;
    recordedAt: string;
    expected: string;
    observed: string;
    evidenceDigest: string;
    syntheticTarget: boolean;
  }[];
  retestOfFindingId: string | null;
  triageReason: string | null;
  triagedBy: string | null;
  triagedAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface G05Report {
  workspaceId: string;
  projectId: string;
  id: string;
  runId: string;
  runRevision: number;
  targetId: string;
  targetRevision: number;
  reportDigest: string;
  body: {
    schemaVersion: 1;
    module: "guard-g05";
    scope: G05Scope;
    run: G05Run;
    target: { id: string; revision: number; environment: G05TargetEnvironment; origin: string; targetDigest: string };
    cases: G05CaseResult[];
    findings: G05Finding[];
    limitations: string[];
  };
  createdBy: string;
  createdAt: string;
}

export interface G05AuditEntry {
  id: number;
  workspaceId: string;
  projectId: string;
  at: string;
  actor: string;
  action: string;
  subject: string | null;
  detail: Record<string, unknown>;
}
