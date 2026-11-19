import type { DatabaseApproval } from "../../../platform/config";
import { PlatformError } from "../../../platform/config";
import { object, timestamp, uuid } from "../telemetry/validation";
import type { IncidentActivation } from "../incidents/activation";
import type { SentinelScope } from "../types";

export interface ResponseActivation {
  scope: SentinelScope;
  notBefore: string;
  targetId: string;
}
/**
 * Fail-closed: response jobs run only with an explicit owner approval block bound to the active S04 incident scope.
 * `SENTINEL_RESPONSE_ENABLED` alone never enables anything. Absent approval ⇒ the response queue is never created.
 */
export function responseActivation(
  approval: DatabaseApproval,
  enabled: boolean,
  incidents?: IncidentActivation,
): ResponseActivation | undefined {
  if (!enabled) return;
  if (!incidents) throw new PlatformError("approval_required");
  const raw = (approval as DatabaseApproval & { response?: unknown }).response;
  try {
    const r = object(raw, [
      "mode",
      "workspaceId",
      "projectId",
      "notBefore",
      "targetId",
      "approvedUse",
    ]);
    if (
      r.mode !== "live" ||
      r.approvedUse !== "local_fixture_rate_limit" ||
      r.workspaceId !== incidents.scope.workspaceId ||
      r.projectId !== incidents.scope.projectId
    )
      throw Error();
    const notBefore = timestamp(r.notBefore);
    if (
      Date.parse(notBefore) < Date.parse(approval.approvedAt) ||
      Date.parse(notBefore) < Date.parse(incidents.notBefore)
    )
      throw Error();
    return {
      scope: { ...incidents.scope, mode: "live" },
      notBefore,
      targetId: uuid(r.targetId),
    };
  } catch {
    throw new PlatformError("approval_required");
  }
}
