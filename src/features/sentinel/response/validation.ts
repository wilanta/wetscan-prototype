import { fingerprint } from "../../../platform/identity";
import { object, TelemetryError, uuid } from "../telemetry/validation";
import { cleanNote } from "../incidents/validation";
import { responseLimits } from "./model";

export type ResponseCommand =
  | {
      action: "propose";
      incidentId: string;
      targetId: string;
      ttlSeconds: number;
      idempotencyKey: string;
    }
  | {
      action: "approve" | "deny" | "rollback";
      actionId: string;
      expectedRevision: number;
      note: string | null;
    };

export function responseCommand(input: unknown): ResponseCommand {
  const c = object(input, [
    "action",
    "incidentId",
    "targetId",
    "ttlSeconds",
    "idempotencyKey",
    "actionId",
    "expectedRevision",
    "note",
  ]);
  const only = (allowed: string[]) => {
    if (Object.keys(c).some((k) => k !== "action" && !allowed.includes(k)))
      throw new TelemetryError("invalid_payload");
  };
  if (c.action === "propose") {
    only(["incidentId", "targetId", "ttlSeconds", "idempotencyKey"]);
    const ttl = c.ttlSeconds;
    if (
      typeof ttl !== "number" ||
      !Number.isInteger(ttl) ||
      ttl < responseLimits.minTtlSeconds ||
      ttl > responseLimits.maxTtlSeconds
    )
      throw new TelemetryError("invalid_ttl");
    if (
      typeof c.idempotencyKey !== "string" ||
      !/^[a-f0-9]{64}$/.test(c.idempotencyKey)
    )
      throw new TelemetryError("invalid_idempotency_key");
    return {
      action: "propose",
      incidentId: uuid(c.incidentId),
      targetId: uuid(c.targetId),
      ttlSeconds: ttl,
      idempotencyKey: c.idempotencyKey,
    };
  }
  if (
    c.action === "approve" ||
    c.action === "deny" ||
    c.action === "rollback"
  ) {
    only(["actionId", "expectedRevision", "note"]);
    const rev = c.expectedRevision;
    if (
      typeof rev !== "number" ||
      !Number.isInteger(rev) ||
      rev < 1 ||
      rev > responseLimits.revisions
    )
      throw new TelemetryError("invalid_revision");
    const note =
      c.note === undefined || c.note === null
        ? null
        : cleanNote(c.note, 3, 280);
    return {
      action: c.action,
      actionId: uuid(c.actionId),
      expectedRevision: rev,
      note,
    };
  }
  throw new TelemetryError("invalid_action");
}
/** Deterministic key so a replayed command (same action + revision) returns the original result. */
export function commandKey(
  actionId: string,
  action: string,
  expectedRevision: number,
) {
  return fingerprint({ actionId, action, expectedRevision });
}
