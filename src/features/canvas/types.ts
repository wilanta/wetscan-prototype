export type GraphMode = "demo" | "snapshot" | "live" | "unavailable";
export type Origin = "verified" | "inferred" | "user_added";
export const nodeKinds = [
  "frontend",
  "api",
  "backend",
  "auth",
  "database",
  "cache",
  "storage",
  "queue",
  "external_service",
  "repository",
  "ci",
  "hosting",
  "telemetry",
  "service_group",
  "unknown",
] as const;
export type NodeKind = (typeof nodeKinds)[number];
export type Relationship =
  | "http_call"
  | "imports"
  | "reads"
  | "writes"
  | "authenticates"
  | "publishes"
  | "subscribes"
  | "builds"
  | "deploys"
  | "hosts"
  | "depends_on"
  | "sends_events"
  | "unknown";
export interface Evidence {
  id: string;
  kind:
    | "source_file"
    | "manifest"
    | "config"
    | "api_spec"
    | "provider"
    | "runtime"
    | "manual";
  sourcePath?: string;
  startLine?: number;
  endLine?: number;
  summary: string;
  origin: Origin;
  sourceRevision?: string;
}
export interface ComponentNode {
  id: string;
  kind: NodeKind;
  label: string;
  technology?: string;
  description?: string;
  evidenceIds: string[];
  origin: Origin;
  status: "observed_in_source" | "inferred" | "manual";
  groupId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}
export interface ComponentEdge {
  id: string;
  source: string;
  target: string;
  relationship: Relationship;
  evidenceIds: string[];
  origin: Origin;
  description?: string;
}
export interface AnalysisDiagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  sourcePath?: string;
}
export interface DiscoveryCoverage {
  capability: string;
  status: "supported" | "partial" | "unsupported";
  detail: string;
}
export interface ArchitectureGraph {
  schemaVersion: 1;
  analyzerVersion: string;
  projectRef: string;
  mode: GraphMode;
  revision: string;
  branch?: string;
  environment: "local" | "staging" | "production" | "unknown";
  generatedAt: string;
  nodes: ComponentNode[];
  edges: ComponentEdge[];
  evidence: Evidence[];
  diagnostics: AnalysisDiagnostic[];
  coverage: DiscoveryCoverage[];
}
export interface Point {
  x: number;
  y: number;
}
export interface CanvasGroup {
  id: string;
  label: string;
  nodeIds: string[];
  collapsed: boolean;
}
export interface TrustRole {
  id: string;
  label: string;
}
export interface TrustResource {
  id: string;
  label: string;
  nodeId?: string;
}
export interface TrustPolicy {
  id: string;
  roleId: string;
  resourceId: string;
  action: string;
  ownership: string;
  allowed: boolean;
  confirmed: boolean;
}
export interface TrustModel {
  roles: TrustRole[];
  resources: TrustResource[];
  policies: TrustPolicy[];
  boundaryNodeIds: string[];
}
export interface WorkflowState {
  id: string;
  label: string;
}
export interface WorkflowTransition {
  id: string;
  from: string;
  to: string;
  actor: string;
  forbidden: boolean;
  precondition: string;
  endpoint: string;
  expectedHttp: number;
  assertion: string;
  hypothesis: string;
}
export interface WorkflowModel {
  id: string;
  name: string;
  nodeIds: string[];
  states: WorkflowState[];
  transitions: WorkflowTransition[];
  invariants: string[];
  protectedFields: string[];
  status: "policy_defined" | "test_pending";
}
export interface UserCanvasOverlay {
  schemaVersion: 1;
  projectRef: string;
  nodePositions: Record<string, Point>;
  manualNodes: ComponentNode[];
  manualEdges: ComponentEdge[];
  hiddenNodeIds: string[];
  unconfirmedEdgeIds: string[];
  annotations: Record<string, string>;
  groups: CanvasGroup[];
  trustModel: TrustModel;
  workflowModels: WorkflowModel[];
}
export type CoverageState =
  | "not_scanned"
  | "not_monitored"
  | "available"
  | "partial"
  | "stale"
  | "failed"
  | "unavailable";
export interface FindingSummary {
  id: string;
  nodeId: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  source: "Guard" | "Sentinel" | "Manual";
  status: string;
  evidenceType: string;
  evidence: string;
  href?: string;
  simulated: boolean;
  priority: "review" | "resolved";
}
export interface IncidentSummary {
  id: string;
  nodeId: string;
  title: string;
  status: string;
  href?: string;
  simulated: boolean;
}
export interface SecurityOverlay {
  projectRef: string;
  mode: "demo" | "live" | "unavailable";
  guard: CoverageState;
  sentinel: CoverageState;
  findings: FindingSummary[];
  incidents: IncidentSummary[];
  message: string;
}
export interface TrustVerificationResult {
  projectRef: string;
  status: "not_tested" | "simulated";
  observations: { policyId: string; result: string; simulated: boolean }[];
}
export interface WorkflowTestResult {
  projectRef: string;
  status: "not_executed" | "simulated";
  results: { workflowId: string; result: string; simulated: boolean }[];
}
export interface CanvasDocument {
  graph: ArchitectureGraph;
  overlay: UserCanvasOverlay;
  security: SecurityOverlay;
}
