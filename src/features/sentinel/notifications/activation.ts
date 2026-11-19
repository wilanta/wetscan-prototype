import type { DatabaseApproval } from "../../../platform/config";
import { PlatformError } from "../../../platform/config";
import { object, timestamp } from "../telemetry/validation";
import { channels, type NotificationChannel } from "./model";
import type { SentinelScope } from "../types";

export interface NotificationActivation {
  scope: SentinelScope;
  notBefore: string;
  channels: NotificationChannel[];
}
/**
 * Fail-closed: the sender runs only with an owner approval block bound to ONE live project scope.
 * `SENTINEL_NOTIFIER_ENABLED=1` alone never enables anything; WhatsApp can never be approved here (H06).
 * Block: { mode:"live", workspaceId, projectId, notBefore, channels:["telegram"|"email"], approvedUse:"owner_controlled_notifications" }
 */
export function notificationActivation(
  approval: DatabaseApproval,
  enabled: boolean,
): NotificationActivation | undefined {
  if (!enabled) return;
  const raw = (approval as DatabaseApproval & { notifications?: unknown })
    .notifications;
  try {
    const r = object(raw, [
      "mode",
      "workspaceId",
      "projectId",
      "notBefore",
      "channels",
      "approvedUse",
    ]);
    if (
      r.mode !== "live" ||
      r.approvedUse !== "owner_controlled_notifications" ||
      typeof r.workspaceId !== "string" ||
      !r.workspaceId ||
      typeof r.projectId !== "string" ||
      !/^github-[1-9][0-9]*$/.test(r.projectId) ||
      !Array.isArray(r.channels) ||
      !r.channels.length ||
      r.channels.some(
        (c) =>
          !(channels as readonly string[]).includes(c as string) ||
          c === "whatsapp",
      )
    )
      throw Error();
    const notBefore = timestamp(r.notBefore);
    if (Date.parse(notBefore) < Date.parse(approval.approvedAt)) throw Error();
    return {
      scope: {
        mode: "live",
        workspaceId: r.workspaceId,
        projectId: r.projectId,
      },
      notBefore,
      channels: [...new Set(r.channels as NotificationChannel[])],
    };
  } catch {
    throw new PlatformError("approval_required");
  }
}
