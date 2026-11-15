import type {
  AuthorizedSnapshot,
  Grant,
  RepositoryRef,
  ScanJob,
  Scope,
} from "../contracts";
export class LiveGuardError extends Error {
  constructor(
    public readonly code:
      | "invalid_input"
      | "not_found"
      | "source_integrity"
      | "source_limit"
      | "source_unavailable"
      | "cleanup_failed"
      | "revision_conflict"
      | "lease_lost"
      | "approval_required"
      | "not_configured"
      | "execution_not_ready",
    public readonly status = 503,
  ) {
    super(code);
  }
}
export interface ProjectAuthority {
  grant: Grant;
  repositoryId: string;
  repositoryName: string;
  branch: string;
  installationId: number;
  userId: number;
}
export interface SourceHead {
  commit: string;
  tree: string;
}
export interface SourceEntry {
  path: string;
  type: "tree" | "blob" | "commit";
  mode: string;
  sha: string;
  size?: number;
}
export interface SourceLease {
  head(signal: AbortSignal): Promise<SourceHead>;
  tree(
    sha: string,
    signal: AbortSignal,
  ): Promise<{ sha: string; truncated: boolean; entries: SourceEntry[] }>;
  blob(
    sha: string,
    signal: AbortSignal,
  ): Promise<{ sha: string; size: number; encoding: string; content: string }>;
  close(): Promise<void>;
}
export interface SourceAccess {
  authorize(): Promise<ProjectAuthority>;
  open(authority: ProjectAuthority, signal: AbortSignal): Promise<SourceLease>;
}
export interface CoverageExclusion {
  pathDigest: string;
  reason:
    | "sensitive_path"
    | "unsafe_path"
    | "symlink"
    | "submodule"
    | "file_limit"
    | "file_size"
    | "total_size"
    | "depth"
    | "binary"
    | "retrieval_failed";
}
export interface SourceCoverage {
  status: "complete" | "partial";
  treeTruncated: boolean;
  eligibleFiles: number;
  retrievedFiles: number;
  bytes: number;
  exclusions: CoverageExclusion[];
}
export interface GuardSnapshot extends AuthorizedSnapshot {
  sourceKind: "github";
  tree: string;
  policyVersion: "guard-source-v1";
  coverage: SourceCoverage;
}
export interface StoredScan {
  job: ScanJob;
  revision: number;
  coverage: SourceCoverage | null;
}
export interface LeaseFence {
  workerId: string;
  leaseToken: string;
}
export type ScanSummary = Pick<
  ScanJob,
  "id" | "status" | "repository" | "createdAt" | "finishedAt" | "sourceCoverage"
> & { revision: number };
export interface GuardStorage {
  create(grant: Grant, job: ScanJob): Promise<StoredScan>;
  get(grant: Grant, scope: Scope, id: string): Promise<StoredScan | null>;
  list(
    grant: Grant,
    scope: Scope,
    limit: number,
    after?: string,
  ): Promise<ScanSummary[]>;
  update(
    grant: Grant,
    job: ScanJob,
    revision: number,
    fence?: LeaseFence,
    coverage?: SourceCoverage,
  ): Promise<StoredScan>;
}
export function repositoryFor(
  authority: ProjectAuthority,
  commit: string,
): RepositoryRef {
  return {
    provider: "github",
    repositoryId: authority.repositoryId,
    branch: authority.branch,
    commit,
  };
}
