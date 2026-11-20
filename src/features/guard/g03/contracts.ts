import type { AuditEvent, Engine, ScanJob } from "../contracts";

export class G03Error extends Error {
  constructor(
    readonly code: string,
    readonly status = 409,
  ) {
    super(code);
  }
}
export interface SourceBinding {
  repositoryId: string;
  branch: string;
  baseCommit: string;
  tree: string;
  path: string;
  blob: string;
  sourceSha256: string;
}
export interface SourceFile extends SourceBinding {
  content: string;
}
export interface Edit {
  oldText: string;
  newText: string;
}
export interface Patch extends Edit, SourceBinding {
  diff: string;
  digest: string;
  afterSha256: string;
  syntax: "passed";
  repositoryTests: "NOT_RUN";
}
export interface Advice {
  explanation: string;
  rootCause: string;
  recommendation: string;
  securityConsequences: string;
  compatibilityRisks: string;
  verification: string;
  alternative: string;
}
export interface ProviderPlan {
  provider: string;
  model: string;
  promptVersion: string;
  policyVersion: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  reservedMicroUsd: number;
}
export interface Proposal {
  version: 1;
  id: string;
  requestKey: string;
  requestSha256: string;
  findingId: string;
  evidenceSha256: string;
  binding: SourceBinding | null;
  baseCommit: string;
  actorId: string;
  createdAt: string;
  state: "reserved" | "completed" | "failed";
  consent: {
    ai: boolean;
    source: boolean;
    path: string | null;
    at: string;
    plan: ProviderPlan | null;
  };
  advice?: Advice;
  providerResult?: {
    responseId: string;
    inputTokens: number;
    outputTokens: number;
  };
  patch?: Patch;
  failure?: string;
  review?: {
    decision: "approved" | "rejected";
    actorId: string;
    at: string;
    reason: string;
    patchDigest: string;
  };
  pr?: {
    state: "reserved" | "unknown" | "open" | "closed" | "merged";
    branch: string;
    actorId: string;
    approvedAt: string;
    patchDigest: string;
    number?: number;
    url?: string;
    headCommit?: string;
    mergeCommit?: string;
    checkedAt?: string;
  };
}
export interface Retest {
  id: string;
  proposalId: string;
  findingId: string;
  actorId: string;
  beforeCommit: string;
  afterCommit: string;
  targetBranch: string;
  engine: Engine;
  createdAt: string;
  scanId?: string;
  state: "reserved" | "queued" | "compared" | "unknown";
  outcome: "fixed" | "still_present" | "inconclusive" | "not_verified";
  evidenceOutcome:
    | "verified_fixed"
    | "reproduced"
    | "not_detected"
    | "inconclusive"
    | "not_verified";
  verifiedFixed: boolean;
  reason: string;
  beforeArtifact?: string;
  afterArtifact?: string;
  sourceSha256?: string;
  invalidatedAt?: string;
  observations?: {
    at: string;
    outcome: Retest["outcome"];
    evidenceOutcome: Retest["evidenceOutcome"];
    verifiedFixed: boolean;
    reason: string;
    afterCommit: string;
  }[];
}
export interface DurableReport {
  id: string;
  createdAt: string;
  expiresAt: string;
  sourceRevision: number;
  body: Record<string, unknown>;
}
export interface G03State {
  version: 1;
  proposals: Proposal[];
  retests: Retest[];
  reports: DurableReport[];
  audit: AuditEvent[];
}
export type G03Job = ScanJob & { guardG03?: G03State };
export interface Snapshot {
  job: G03Job;
  revision: number;
  retentionUntil: string;
}
export const emptyState = (): G03State => ({
  version: 1,
  proposals: [],
  retests: [],
  reports: [],
  audit: [],
});
