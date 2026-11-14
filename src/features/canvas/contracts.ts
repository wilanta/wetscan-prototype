import type {
  ArchitectureGraph,
  GraphMode,
  SecurityOverlay,
  TrustVerificationResult,
  UserCanvasOverlay,
  WorkflowTestResult,
} from "./types";
export interface SnapshotEntry {
  path: string;
  size: number;
  symlink?: boolean;
}
export interface RepositorySnapshot {
  sourceKind: "local_test" | "github" | "gitlab";
  repositoryRef: string;
  revision: string;
  branch?: string;
  diagnostics?: readonly import("./types").AnalysisDiagnostic[];
  listFiles(): Promise<readonly SnapshotEntry[]>;
  readTextFile(path: string): Promise<string | null>;
}
/** Server-side only. Implementer must authorize workspace + project on every call (CAN-001/002). */
export interface AuthorizedRepositorySnapshotReader {
  getSnapshot(input: {
    authenticatedWorkspaceId: string;
    projectId: string;
    revision?: string;
  }): Promise<RepositorySnapshot>;
}
export type RepositorySnapshotPort = AuthorizedRepositorySnapshotReader;
export interface CanvasGraphSource {
  mode: GraphMode;
  loadGraph(request: {
    projectRef: string;
    revision?: string;
  }): Promise<ArchitectureGraph>;
}
export interface CanvasOverlaySource {
  mode: "demo" | "live" | "unavailable";
  getSecurity(projectRef: string): Promise<SecurityOverlay>;
  getTrustVerification(projectRef: string): Promise<TrustVerificationResult>;
  getWorkflowTests(projectRef: string): Promise<WorkflowTestResult>;
}
export interface CanvasPersistencePort {
  load(projectRef: string): Promise<UserCanvasOverlay | null>;
  save(projectRef: string, overlay: UserCanvasOverlay): Promise<void>;
  reset(projectRef: string): Promise<void>;
}
export interface GuardFindingsOverlaySource {
  getSecurity(projectRef: string): Promise<SecurityOverlay>;
}
export interface SentinelIncidentOverlaySource {
  getSecurity(projectRef: string): Promise<SecurityOverlay>;
}
export interface GuardTrustTestSource {
  getTrustVerification(projectRef: string): Promise<TrustVerificationResult>;
}
export interface GuardIntegrityTestSource {
  getWorkflowTests(projectRef: string): Promise<WorkflowTestResult>;
}
