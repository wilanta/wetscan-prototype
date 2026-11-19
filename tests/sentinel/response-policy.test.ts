import { describe, expect, it } from "vitest";
import {
  evaluatePolicy,
  approverDenial,
  canTransition,
} from "../../src/features/sentinel/response/policy";
import {
  responseCommand,
  commandKey,
} from "../../src/features/sentinel/response/validation";
import {
  responseStatuses,
  type ResponseTarget,
} from "../../src/features/sentinel/response/model";

const target: ResponseTarget = {
  mode: "live",
  workspaceId: "w",
  projectId: "github-1",
  targetId: "11111111-1111-4111-8111-111111111111",
  kind: "local_fixture",
  origin: "http://127.0.0.1:4999",
  maxTtlSeconds: 600,
  approverActorIds: ["github-user-1"],
  allowSelfApproval: false,
  h03ProofId: "h03-test",
  enabled: true,
};
const base = {
  incident: { status: "open" as const, evidenceCount: 1 },
  target,
  ttlSeconds: 120,
  activeActionOnTarget: false,
};
const key = "a".repeat(64);
const uid = "22222222-2222-4222-8222-222222222222";

describe("S05 policy", () => {
  it("allows a configured target with evidence", () =>
    expect(evaluatePolicy(base)).toEqual({ eligible: true, reasons: [] }));
  it("denies_when_target_missing_or_disabled", () => {
    expect(evaluatePolicy({ ...base, target: undefined }).reasons).toContain(
      "target_not_configured",
    );
    expect(
      evaluatePolicy({ ...base, target: { ...target, enabled: false } })
        .reasons,
    ).toContain("target_disabled");
  });
  it("severity_never_authorizes: policy has no severity input", () => {
    // Even if a caller smuggles severity, a missing target still denies.
    const r = evaluatePolicy({
      ...base,
      target: undefined,
      severity: "high",
    } as never);
    expect(r.eligible).toBe(false);
  });
  it("denies_ttl_above_min_target_env_max", () => {
    expect(evaluatePolicy({ ...base, ttlSeconds: 601 }).reasons).toContain(
      "ttl_above_target_maximum",
    );
    expect(
      evaluatePolicy({
        ...base,
        ttlSeconds: 90,
        target: { ...target, maxTtlSeconds: 60 },
      }).reasons,
    ).toContain("ttl_above_target_maximum");
    expect(evaluatePolicy({ ...base, ttlSeconds: 1 }).reasons).toContain(
      "ttl_invalid",
    );
  });
  it("denies_closed_incident_no_evidence_and_second_active", () => {
    expect(
      evaluatePolicy({
        ...base,
        incident: { status: "closed", evidenceCount: 1 },
      }).reasons,
    ).toContain("incident_closed");
    expect(
      evaluatePolicy({
        ...base,
        incident: { status: "open", evidenceCount: 0 },
      }).reasons,
    ).toContain("no_evidence");
    expect(
      evaluatePolicy({ ...base, activeActionOnTarget: true }).reasons,
    ).toContain("active_action_on_target");
  });
  it("verified_only_from_verification_pending", () => {
    for (const s of responseStatuses)
      expect(canTransition(s, "verified")).toBe(s === "verification_pending");
    expect(canTransition("applied", "verified")).toBe(false);
    expect(canTransition("rolled_back", "applying")).toBe(false);
  });
  it("approver_rules_self_approval_and_membership", () => {
    expect(approverDenial({ actor: "x", proposer: "y", target })).toBe(
      "actor_not_approver",
    );
    expect(
      approverDenial({
        actor: "github-user-1",
        proposer: "github-user-1",
        target,
      }),
    ).toBe("self_approval_prohibited");
    expect(
      approverDenial({
        actor: "github-user-1",
        proposer: "github-user-1",
        target: { ...target, allowSelfApproval: true },
      }),
    ).toBeUndefined();
    expect(
      approverDenial({
        actor: "github-user-1",
        proposer: "github-user-2",
        target,
      }),
    ).toBeUndefined();
  });
});

describe("S05 command validation", () => {
  it("accepts valid propose/approve and ignores nothing", () => {
    expect(
      responseCommand({
        action: "propose",
        incidentId: uid,
        targetId: uid,
        ttlSeconds: 60,
        idempotencyKey: key,
      }),
    ).toMatchObject({ action: "propose", ttlSeconds: 60 });
    expect(
      responseCommand({
        action: "approve",
        actionId: uid,
        expectedRevision: 1,
      }),
    ).toMatchObject({ action: "approve", note: null });
  });
  it("rejects_unknown_fields_scope_fields_and_bad_values", () => {
    for (const bad of [
      {
        action: "propose",
        incidentId: uid,
        targetId: uid,
        ttlSeconds: 60,
        idempotencyKey: key,
        workspaceId: "w",
      },
      {
        action: "propose",
        incidentId: uid,
        targetId: uid,
        ttlSeconds: 601,
        idempotencyKey: key,
      },
      {
        action: "propose",
        incidentId: uid,
        targetId: uid,
        ttlSeconds: 60.5,
        idempotencyKey: key,
      },
      {
        action: "propose",
        incidentId: uid,
        targetId: uid,
        ttlSeconds: 60,
        idempotencyKey: "short",
      },
      { action: "approve", actionId: uid, expectedRevision: 0 },
      { action: "approve", actionId: uid, expectedRevision: 1, ttlSeconds: 5 },
      { action: "rollback", actionId: "nope", expectedRevision: 1 },
      { action: "apply", actionId: uid, expectedRevision: 1 },
      {
        action: "deny",
        actionId: uid,
        expectedRevision: 1,
        note: "token: abc",
      },
    ])
      expect(() => responseCommand(bad)).toThrow();
  });
  it("commandKey is deterministic per action+revision", () => {
    expect(commandKey(uid, "approve", 1)).toBe(commandKey(uid, "approve", 1));
    expect(commandKey(uid, "approve", 1)).not.toBe(
      commandKey(uid, "approve", 2),
    );
    expect(commandKey(uid, "approve", 1)).toMatch(/^[a-f0-9]{64}$/);
  });
});
