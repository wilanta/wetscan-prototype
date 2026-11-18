import { describe, expect, it } from "vitest";
import { responseActivation } from "../../src/features/sentinel/response/activation";
import type { DatabaseApproval } from "../../src/platform/config";

const scope = {
  mode: "live" as const,
  workspaceId: "github-user-7:w",
  projectId: "github-1",
};
const incidents = { scope, notBefore: "2026-11-19T10:00:00.000Z" };
const base = {
  approvedAt: "2026-11-19T09:00:00.000Z",
  response: {
    mode: "live",
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    notBefore: "2026-11-19T10:00:00.000Z",
    targetId: "11111111-1111-4111-8111-111111111111",
    approvedUse: "local_fixture_rate_limit",
  },
};
const ap = (o: Record<string, unknown> = {}) =>
  ({ ...base, ...o }) as unknown as DatabaseApproval;

describe("S05 response activation is fail-closed", () => {
  it("flag off ⇒ undefined (NO-OP); flag alone never enables", () => {
    expect(responseActivation(ap(), false, incidents)).toBeUndefined();
    expect(() =>
      responseActivation(
        { approvedAt: base.approvedAt } as never,
        true,
        incidents,
      ),
    ).toThrow("approval_required");
  });
  it("requires active incident activation and an exact scope/use match", () => {
    expect(() => responseActivation(ap(), true, undefined)).toThrow(
      "approval_required",
    );
    expect(responseActivation(ap(), true, incidents)).toMatchObject({
      targetId: base.response.targetId,
      scope,
    });
    for (const bad of [
      { ...base.response, projectId: "github-2" },
      { ...base.response, workspaceId: "other" },
      { ...base.response, mode: "demo" },
      { ...base.response, approvedUse: "production_firewall" },
      { ...base.response, notBefore: "2026-11-19T08:00:00.000Z" },
      { ...base.response, extra: 1 },
      { ...base.response, targetId: "nope" },
    ])
      expect(() =>
        responseActivation(ap({ response: bad }), true, incidents),
      ).toThrow("approval_required");
  });
});
