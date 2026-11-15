/** Grants are issued by a trusted server, never accepted from a client. */
export type Mode = "demo" | "live";
export const engines = [
  "sast",
  "sca",
  "secrets",
  "iac",
  "container",
  "sbom",
  "dast",
  "api",
  "integrity",
] as const;
export type Engine = (typeof engines)[number];
export type JobStatus =
  | "queued"
  | "preparing"
  | "running"
  | "normalizing"
  | "completed"
  | "completed_partial"
  | "failed"
  | "cancelled";
export type EngineStatus =
  | "not_configured"
  | "not_applicable"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "timed_out"
  | "skipped";
export type FindingStatus =
  | "potential"
  | "under_review"
  | "verified"
  | "fix_pending_retest"
  | "verified_fixed"
  | "false_positive"
  | "risk_accepted";
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export interface Scope {
  workspaceId: string;
  projectId: string;
  mode: Mode;
}
export interface Grant extends Scope {
  actorId: string;
  operations: readonly ("read" | "scan" | "triage" | "report")[];
  expiresAt: number;
}
export interface RepositoryRef {
  provider: "github" | "gitlab";
  repositoryId: string;
  branch: string;
  commit: string;
}
export interface Provenance {
  engine: Engine;
  scanner: string;
  version: string;
  ruleId: string;
  rulePack: string;
}
export interface Location {
  path?: string;
  line?: number;
  package?: string;
  installedVersion?: string;
  endpoint?: string;
}
export interface Evidence {
  id: string;
  commit: string;
  recordedAt: string;
  summary: string;
  artifactDigest: string;
  synthetic: boolean;
}
export interface Finding extends Scope {
  id: string;
  title: string;
  severity: Severity;
  confidence: "low" | "medium" | "high";
  status: FindingStatus;
  source: Provenance;
  location: Location;
  evidence: Evidence[];
}
export interface EngineRun {
  engine: Engine;
  status: EngineStatus;
  reason: string;
  scanner: string;
  version: string;
  rulePack: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
}
export interface AuditEvent {
  actorId: string;
  at: string;
  action: string;
  subjectId: string;
  reason: string;
}
export interface SourceCoverageSummary {
  status: "complete" | "partial";
  retrievedFiles: number;
  excludedFiles: number;
  treeTruncated: boolean;
}
export interface ScanJob extends Scope {
  sourceCoverage?: SourceCoverageSummary;
  id: string;
  idempotencyKey: string;
  requestedEngines: Engine[];
  repository: RepositoryRef;
  profile: "quick" | "standard" | "full";
  status: JobStatus;
  createdAt: string;
  finishedAt?: string;
  runs: EngineRun[];
  findings: Finding[];
  audit: AuditEvent[];
}
export interface ScanRequest extends Scope {
  repository: RepositoryRef;
  profile: ScanJob["profile"];
  engines: Engine[];
  idempotencyKey: string;
}
export interface SnapshotFile {
  path: string;
  size: number;
  sha256: string;
}
export interface AuthorizedSnapshot extends Scope {
  coverage?: {
    status: "complete" | "partial";
    retrievedFiles: number;
    treeTruncated: boolean;
    exclusions: readonly { reason: string }[];
  };
  repository: RepositoryRef;
  digest: string;
  files: SnapshotFile[];
  expiresAt: number;
}
export interface SnapshotPort {
  acquire(
    grant: Grant,
    request: ScanRequest,
    signal?: AbortSignal,
  ): Promise<AuthorizedSnapshot>;
  dispose(snapshot: AuthorizedSnapshot): Promise<void>;
}
export interface PersistencePort {
  create(grant: Grant, job: ScanJob): Promise<ScanJob>;
  get(grant: Grant, scope: Scope, jobId: string): Promise<ScanJob | null>;
  save(grant: Grant, job: ScanJob): Promise<void>;
}
export interface QueuePort {
  enqueue(grant: Grant, scope: Scope, jobId: string): Promise<void>;
  cancel(grant: Grant, scope: Scope, jobId: string): Promise<void>;
}
export interface ScannerPort {
  engine: Engine;
  execute(
    snapshot: AuthorizedSnapshot,
    signal: AbortSignal,
  ): Promise<{ run: EngineRun; findings: Finding[] }>;
}
export interface SandboxPort {
  ready: boolean;
  readOnly: boolean;
  nonRoot: boolean;
  egressControlled: boolean;
  cpuLimit: number;
  memoryMb: number;
  pidsLimit: number;
  timeoutMs: number;
}
export interface CanvasOverlay {
  nodeId: string;
  findingIds: string[];
  scope: Scope;
  commit: string;
}
export interface InvariantPlan extends Scope {
  id: string;
  kind:
    | "ownership"
    | "workflow_bypass"
    | "state_transition"
    | "replay"
    | "unauthorized_modification";
  description: string;
  confirmedBy: string;
  expectedStatus: number;
  synthetic: boolean;
}
export type IntegrationResult<T> =
  | { status: "available"; value: T }
  | {
      status: "not_integrated" | "not_configured";
      backlogId: string;
      reason: string;
    };
export interface CanvasPort {
  publish(
    grant: Grant,
    overlays: CanvasOverlay[],
  ): Promise<IntegrationResult<{ deliveryId: string }>>;
  plans(
    grant: Grant,
    scope: Scope,
  ): Promise<IntegrationResult<InvariantPlan[]>>;
}
export interface InventoryItem {
  name: string;
  version: string;
  ecosystem: string;
  license: string | null;
  sourcePath: string;
}
export interface IntelligencePort {
  publish(
    grant: Grant,
    scope: Scope,
    commit: string,
    inventory: InventoryItem[],
  ): Promise<IntegrationResult<{ deliveryId: string }>>;
}
export interface SentinelPort {
  publish(
    grant: Grant,
    scope: Scope,
    event: {
      type: "release_evaluated" | "remediation_retested";
      scanId: string;
      decision: string;
    },
  ): Promise<IntegrationResult<{ deliveryId: string }>>;
}
export interface AIProviderPort {
  configured: boolean;
  explain(input: {
    title: string;
    ruleId: string;
    redactedSummary: string;
  }): Promise<{ text: string; untrusted: true }>;
}
export interface DastScope {
  environment: "staging";
  origin: string;
  paths: string[];
  methods: ("GET" | "HEAD" | "OPTIONS")[];
  consentActor: string;
  proofId: string;
  expiresAt: number;
  requestsPerSecond: number;
  concurrency: number;
  timeoutMs: number;
  syntheticAccounts: boolean;
}
export interface EgressPort {
  /** Must validate and pin DNS answers and redirects at outbound layer. */ ready: boolean;
  validate(scope: DastScope): Promise<boolean>;
}
export interface RetestResult {
  findingId: string;
  beforeCommit: string;
  afterCommit: string;
  engineCompleted: boolean;
  targeted: boolean;
  expected?: string;
  observed?: string;
  evidence?: Evidence;
  outcome: "reproduced" | "not_detected" | "verified_fixed" | "not_executed";
}

export interface ReleaseCheckPort {
  publish(
    grant: Grant,
    scope: Scope,
    input: {
      scanId: string;
      commit: string;
      decision: "PASS" | "WARN" | "BLOCK" | "INCOMPLETE";
    },
  ): Promise<
    IntegrationResult<{
      provider: "github" | "gitlab";
      checkId: string;
      enforced: boolean;
    }>
  >;
}
/** Future live plan handed off by Canvas; never inferred into execution automatically. */
export interface TestPlan extends Scope {
  id: string;
  invariant: InvariantPlan;
  staging: DastScope;
  actors: { reference: string; synthetic: true; role: string }[];
  preconditions: string[];
  steps: {
    id: string;
    method: "GET" | "HEAD" | "OPTIONS";
    path: string;
    actorReference: string;
    expected: {
      status: number;
      bodyFields: { name: string; equals: string | number | boolean }[];
      unchangedResourceReferences: string[];
    };
  }[];
  redactionFields: string[];
  cleanup: {
    resourceReference: string;
    action: "dispose_synthetic_resource" | "revoke_test_session";
  }[];
  approval: { actorId: string; at: string; expiresAt: string; proofId: string };
}
