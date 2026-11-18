import {
  responseLimits,
  transitions,
  type ResponseStatus,
  type ResponseTarget,
} from "./model";

export interface PolicyInput {
  incident: {
    status: "open" | "investigating" | "closed";
    evidenceCount: number;
  };
  target: ResponseTarget | undefined;
  ttlSeconds: number;
  activeActionOnTarget: boolean;
  /** Severity is deliberately NOT an input: it can never authorize enforcement. */
}
export interface PolicyResult {
  eligible: boolean;
  reasons: string[];
}
/** Transparent, deterministic policy. Every denial reason is stored with the proposal. */
export function evaluatePolicy(i: PolicyInput): PolicyResult {
  const r: string[] = [];
  if (!i.target) r.push("target_not_configured");
  else {
    if (!i.target.enabled) r.push("target_disabled");
    if (
      i.ttlSeconds >
      Math.min(i.target.maxTtlSeconds, responseLimits.maxTtlSeconds)
    )
      r.push("ttl_above_target_maximum");
  }
  if (
    !Number.isInteger(i.ttlSeconds) ||
    i.ttlSeconds < responseLimits.minTtlSeconds
  )
    r.push("ttl_invalid");
  if (i.incident.status === "closed") r.push("incident_closed");
  if (i.incident.evidenceCount < 1) r.push("no_evidence");
  if (i.activeActionOnTarget) r.push("active_action_on_target");
  return { eligible: r.length === 0, reasons: r };
}
export function canTransition(from: ResponseStatus, to: ResponseStatus) {
  return transitions[from].includes(to);
}
/** `verified` is reachable only from `verification_pending`. */
export function assertTransition(from: ResponseStatus, to: ResponseStatus) {
  if (!canTransition(from, to)) throw new Error("invalid_transition");
}
export interface ApprovalCheck {
  actor: string;
  proposer: string;
  target: Pick<ResponseTarget, "approverActorIds" | "allowSelfApproval">;
}
export function approverDenial(c: ApprovalCheck): string | undefined {
  if (!c.target.approverActorIds.includes(c.actor)) return "actor_not_approver";
  if (c.actor === c.proposer && !c.target.allowSelfApproval)
    return "self_approval_prohibited";
}
