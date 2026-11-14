import type {
  TrustModel,
  TrustPolicy,
  TrustVerificationResult,
} from "../types";
export function updatePolicy(
  model: TrustModel,
  policy: TrustPolicy,
): TrustModel {
  if (
    !model.roles.some((r) => r.id === policy.roleId) ||
    !model.resources.some((r) => r.id === policy.resourceId) ||
    !policy.action.trim()
  )
    throw new Error("Role, resource and action are required");
  return {
    ...model,
    policies: [...model.policies.filter((p) => p.id !== policy.id), policy],
  };
}
export function observedPolicy(
  policyId: string,
  result?: TrustVerificationResult,
): string {
  const observation = result?.observations.find((o) => o.policyId === policyId);
  return observation && result?.status === "simulated" && observation.simulated
    ? `Simulated · ${observation.result}`
    : "Not tested";
}
export function trustTestPlan(projectRef: string, model: TrustModel) {
  return {
    schemaVersion: 1,
    projectRef,
    runner: "Guard authorization · not connected",
    status: "not_executed",
    boundaries: model.boundaryNodeIds.slice().sort(),
    cases: model.policies
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((p) => ({
        ...p,
        actor: model.roles.find((r) => r.id === p.roleId)?.label,
        resource: model.resources.find((r) => r.id === p.resourceId)?.label,
        endpoint: "<authorized-staging-endpoint>",
        expectedHttp: p.allowed ? 200 : 403,
        ready: p.confirmed,
        observed: "not_tested",
      })),
  };
}
