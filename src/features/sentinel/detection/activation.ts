import type { DatabaseApproval } from "../../../platform/config";
import { PlatformError } from "../../../platform/config";
import { object, timestamp } from "../telemetry/validation";
import type { SentinelScope } from "../types";

export interface DetectionActivation {
  scope: SentinelScope;
  notBefore: string;
}
/** A new private owner-reviewed runtime record must opt in and exclude historical jobs. No ambient switch alone grants processing. */
export function detectionActivation(
  approval: DatabaseApproval,
  enabled: boolean,
): DetectionActivation | undefined {
  if (!enabled) return;
  const raw = (approval as DatabaseApproval & { detection?: unknown })
    .detection;
  try {
    const d = object(raw, [
      "mode",
      "workspaceId",
      "projectId",
      "notBefore",
      "processNewTelemetry",
    ]);
    if (
      d.mode !== "live" ||
      d.processNewTelemetry !== true ||
      typeof d.workspaceId !== "string" ||
      !/^github-user-[1-9]\d*:.{1,100}$/.test(d.workspaceId) ||
      typeof d.projectId !== "string" ||
      !/^github-[1-9]\d{0,15}$/.test(d.projectId)
    )
      throw Error();
    const notBefore = timestamp(d.notBefore);
    if (Date.parse(notBefore) < Date.parse(approval.approvedAt)) throw Error();
    return {
      scope: {
        mode: "live",
        workspaceId: d.workspaceId,
        projectId: d.projectId,
      },
      notBefore,
    };
  } catch {
    throw new PlatformError("approval_required");
  }
}
