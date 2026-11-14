import type { WorkflowModel } from "../types";
export const templateNames = [
  "Order status lock",
  "Locked academic grades",
  "Approval workflow",
] as const;
export function workflowTemplate(index: number, id: string): WorkflowModel {
  const name = templateNames[index] ?? templateNames[0];
  return {
    id,
    name,
    nodeIds: [],
    status: "policy_defined",
    states: ["Draft", "Approved", "Locked", "Edited"].map((label) => ({
      id: label.toLowerCase(),
      label,
    })),
    transitions: [
      {
        id: "approve",
        from: "draft",
        to: "approved",
        actor: "Reviewer",
        forbidden: false,
        precondition: "Actor is an authorized reviewer",
        endpoint: "<approval-endpoint>",
        expectedHttp: 200,
        assertion: "State becomes approved",
        hypothesis: "Review cannot be bypassed",
      },
      {
        id: "lock",
        from: "approved",
        to: "locked",
        actor: "Admin",
        forbidden: false,
        precondition: "Record has been approved",
        endpoint: "<lock-endpoint>",
        expectedHttp: 200,
        assertion: "State becomes locked",
        hypothesis: "Only authorized actors can lock",
      },
      {
        id: "edit",
        from: "locked",
        to: "edited",
        actor: index === 1 ? "Student" : "Customer",
        forbidden: true,
        precondition: "Record is locked",
        endpoint: "<update-endpoint>",
        expectedHttp: 403,
        assertion: "Protected fields and locked state remain unchanged",
        hypothesis: "Updating after lock should be rejected",
      },
    ],
    invariants: ["Locked records cannot be modified"],
    protectedFields: [index === 1 ? "grade" : "status"],
  };
}
export function removeState(
  workflow: WorkflowModel,
  id: string,
): WorkflowModel {
  return {
    ...workflow,
    states: workflow.states.filter((s) => s.id !== id),
    transitions: workflow.transitions.filter(
      (t) => t.from !== id && t.to !== id,
    ),
  };
}
export function workflowTestPlan(projectRef: string, workflow: WorkflowModel) {
  const states = new Set(workflow.states.map((s) => s.id));
  if (
    workflow.transitions.some((t) => !states.has(t.from) || !states.has(t.to))
  )
    throw new Error("A transition references a missing state");
  return {
    schemaVersion: 1,
    projectRef,
    workflowId: workflow.id,
    name: workflow.name,
    runner: "Guard Integrity · not connected",
    status: "not_executed",
    nodeIds: workflow.nodeIds.slice().sort(),
    invariants: workflow.invariants,
    protectedFields: workflow.protectedFields,
    cases: workflow.transitions
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((t) => ({
        ...t,
        expectedState: t.forbidden ? t.from : t.to,
        status: "not_executed",
      })),
  };
}
