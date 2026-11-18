import type { DatabaseApproval } from "../../../platform/config";
import { PlatformError } from "../../../platform/config";
import { object, timestamp } from "../telemetry/validation";
import type { DetectionActivation } from "../detection/activation";
import type { SentinelScope } from "../types";

export interface IncidentActivation {
  scope: SentinelScope;
  notBefore: string;
}

/** Requires explicit owner runtime approval and active S03 detection scope; never backfills historical S03 alerts. */
export function incidentActivation(
  approval: DatabaseApproval,
  enabled: boolean,
  detection?: DetectionActivation,
): IncidentActivation | undefined {
  if (!enabled) return;
  if (!detection) throw new PlatformError("approval_required");
  const raw = (approval as DatabaseApproval & { incidents?: unknown })
    .incidents;
  try {
    const inc = object(raw, [
      "mode",
      "workspaceId",
      "projectId",
      "notBefore",
      "createFromNewAlerts",
    ]);
    if (
      inc.mode !== "live" ||
      inc.createFromNewAlerts !== true ||
      inc.workspaceId !== detection.scope.workspaceId ||
      inc.projectId !== detection.scope.projectId
    )
      throw Error();
    const notBefore = timestamp(inc.notBefore);
    if (
      Date.parse(notBefore) < Date.parse(approval.approvedAt) ||
      Date.parse(notBefore) < Date.parse(detection.notBefore)
    )
      throw Error();
    return {
      scope: {
        mode: "live",
        workspaceId: detection.scope.workspaceId,
        projectId: detection.scope.projectId,
      },
      notBefore,
    };
  } catch {
    throw new PlatformError("approval_required");
  }
}
