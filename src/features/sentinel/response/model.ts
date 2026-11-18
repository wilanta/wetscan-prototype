import type { SentinelScope } from "../types";

/** `applied` is a target receipt only; `verified` requires an independent verifier audit row. */
export const responseStatuses = [
  "awaiting_approval",
  "approved",
  "denied",
  "applying",
  "applied",
  "apply_failed",
  "verification_pending",
  "verified",
  "failed",
  "inconclusive",
  "rolled_back",
  "expired",
] as const;
export type ResponseStatus = (typeof responseStatuses)[number];
/** States that may hold (or be about to hold) live enforcement on the target. */
export const activeStatuses: readonly ResponseStatus[] = [
  "approved",
  "applying",
  "applied",
  "verification_pending",
  "verified",
  "failed",
  "inconclusive",
];
/** Allowed single-step moves; anything else is a bug or an attack. */
export const transitions: Record<ResponseStatus, readonly ResponseStatus[]> = {
  awaiting_approval: ["approved", "denied"],
  approved: ["applying", "denied", "rolled_back", "expired"],
  denied: [],
  applying: ["applied", "apply_failed", "rolled_back", "expired"],
  applied: ["verification_pending", "rolled_back", "expired"],
  apply_failed: [],
  verification_pending: [
    "verified",
    "failed",
    "inconclusive",
    "rolled_back",
    "expired",
  ],
  verified: ["rolled_back", "expired"],
  failed: ["rolled_back", "expired"],
  inconclusive: ["rolled_back", "expired"],
  rolled_back: [],
  expired: [],
};
export const responseLimits = {
  maxTtlSeconds: 600,
  minTtlSeconds: 10,
  approvalWindowMs: 15 * 60_000,
  revisions: 1000,
  auditPerAction: 200,
  reconcileBatch: 100,
} as const;
export const responseJobKinds = {
  apply: "sentinel.response.apply",
  verify: "sentinel.response.verify",
  expire: "sentinel.response.expire",
  reconcile: "sentinel.response.reconcile",
} as const;
export type ResponseAuditEvent =
  | "response_proposed"
  | "human_approved"
  | "approval_denied"
  | "apply_started"
  | "mitigation_applied"
  | "apply_failed"
  | "verification_pending"
  | "verification_recorded"
  | "neutralization_verified"
  | "verification_failed"
  | "verification_inconclusive"
  | "rollback"
  | "expiry"
  | "reconcile_adopted"
  | "reconcile_cleanup";

export interface ResponseTarget extends SentinelScope {
  targetId: string;
  kind: "local_fixture";
  origin: string;
  maxTtlSeconds: number;
  approverActorIds: string[];
  allowSelfApproval: boolean;
  h03ProofId: string;
  enabled: boolean;
}
export interface ResponseAction extends SentinelScope {
  schemaVersion: 1;
  actionId: string;
  incidentId: string;
  targetId: string;
  incidentOrigin: "runtime" | "controlled_test";
  operation: "temporary_rate_limit";
  ttlSeconds: number;
  status: ResponseStatus;
  proposedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalExpiresAt: string | null;
  appliedAt: string | null;
  expiresAt: string | null;
  policyReasons: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface ResponseAuditRecord {
  auditId: string;
  actionId: string;
  sequence: number;
  eventType: ResponseAuditEvent;
  actorId: string;
  actorType: "system" | "user";
  fromStatus: ResponseStatus | null;
  toStatus: ResponseStatus | null;
  summary: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
}
