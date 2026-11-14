import type { InvariantPlan } from "./contracts";
import { GuardError } from "./security";
export interface IntegrityResult {
  planId: string;
  status: "passed" | "failed" | "not_executed";
  expected: number;
  observed: number | null;
  synthetic: true;
  summary: string;
}
/** Controlled in-memory model only. No request or repository mutation. */
export function runSyntheticInvariant(
  plan: InvariantPlan,
  patched: boolean,
): IntegrityResult {
  if (plan.mode !== "demo" || !plan.synthetic || !plan.confirmedBy.trim())
    throw new GuardError(
      "forbidden",
      "Confirmed synthetic demo plans only; live runner is unavailable.",
    );
  const expected = (
    {
      ownership: 403,
      workflow_bypass: 409,
      state_transition: 409,
      replay: 409,
      unauthorized_modification: 403,
    } as const
  )[plan.kind];
  if (plan.expectedStatus !== expected)
    throw new GuardError(
      "invalid_input",
      "Expected status differs from this fixture contract.",
    );
  const resource = {
    owner: "dummy-b",
    state: "locked",
    processed: true,
    amount: 10,
  };
  const actor = "dummy-a";
  let observed = 200;
  switch (plan.kind) {
    case "ownership":
      if (patched && resource.owner !== actor) observed = 403;
      break;
    case "workflow_bypass":
      if (patched && resource.state !== "approved") observed = 409;
      break;
    case "state_transition":
      if (patched && resource.state === "locked") observed = 409;
      break;
    case "replay":
      if (patched && resource.processed) observed = 409;
      break;
    case "unauthorized_modification":
      if (patched && resource.owner !== actor) observed = 403;
      else resource.amount = 11;
      break;
  }
  return {
    planId: plan.id,
    status: expected === observed ? "passed" : "failed",
    expected,
    observed,
    synthetic: true,
    summary:
      "Executed controlled in-memory fixture only. No HTTP request, customer data or payment action.",
  };
}
