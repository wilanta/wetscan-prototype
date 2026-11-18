import { fingerprint } from "../../../platform/identity";
import { object, TelemetryError, uuid } from "../telemetry/validation";
import { numberIn } from "../detection/validation";
import { incidentLimits, type IncidentStatus } from "./model";

export function deterministicUuid(seed: unknown): string {
  const h = fingerprint(seed);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function cleanNote(
  value: unknown,
  min: number,
  max: number,
  errorCode = "invalid_incident_note",
): string {
  if (typeof value !== "string") throw new TelemetryError(errorCode);
  const trimmed = value.trim();
  if (
    trimmed.length < min ||
    trimmed.length > max ||
    /[\x00-\x1f<>]/.test(trimmed) ||
    /(?:bearer\s+[a-z0-9._~+/-]+=*|wst_[a-z0-9._-]+|gh[pousr]_[a-z0-9_]+|password\s*[:=]|secret\s*[:=]|token\s*[:=])/i.test(
      trimmed,
    )
  )
    throw new TelemetryError(errorCode);
  return trimmed;
}

export type IncidentCommand =
  | {
      action: "investigate";
      incidentId: string;
      expectedRevision: number;
      note: string | null;
    }
  | {
      action: "close";
      incidentId: string;
      expectedRevision: number;
      reason: string;
    }
  | {
      action: "reopen";
      incidentId: string;
      expectedRevision: number;
      reason: string;
    };

export function incidentCommand(input: unknown): IncidentCommand {
  const c = object(input, [
    "action",
    "incidentId",
    "expectedRevision",
    "status",
    "reason",
    "note",
  ]);
  const incidentId = uuid(c.incidentId);
  const expectedRevision = numberIn(
    c.expectedRevision,
    1,
    incidentLimits.revisions,
  );
  const rawAction = String(c.action);
  if (
    !["investigate", "close", "reopen", "transition_status"].includes(rawAction)
  )
    throw new TelemetryError("invalid_action");

  if (rawAction === "transition_status") {
    if (c.status === "investigating") {
      if (c.reason !== undefined) {
        const reason = cleanNote(c.reason, 3, 280, "invalid_close_reason");
        return {
          action: "reopen",
          incidentId,
          expectedRevision,
          reason,
        };
      }
      const note =
        c.note === undefined || c.note === null
          ? null
          : cleanNote(c.note, 3, 280);
      return {
        action: "investigate",
        incidentId,
        expectedRevision,
        note,
      };
    }
    if (c.status === "closed") {
      if (c.note !== undefined) throw new TelemetryError("invalid_action");
      const reason = cleanNote(c.reason, 3, 280, "invalid_close_reason");
      return {
        action: "close",
        incidentId,
        expectedRevision,
        reason,
      };
    }
    throw new TelemetryError("invalid_transition", 409);
  }

  if (c.status !== undefined) throw new TelemetryError("invalid_action");

  if (rawAction === "investigate") {
    if (c.reason !== undefined) throw new TelemetryError("invalid_action");
    const note =
      c.note === undefined || c.note === null
        ? null
        : cleanNote(c.note, 3, 280);
    return {
      action: "investigate",
      incidentId,
      expectedRevision,
      note,
    };
  }

  if (c.note !== undefined) throw new TelemetryError("invalid_action");
  const reason = cleanNote(c.reason, 3, 280, "invalid_close_reason");
  return {
    action: rawAction as "close" | "reopen",
    incidentId,
    expectedRevision,
    reason,
  };
}

export function validateTransition(
  current: IncidentStatus,
  command: IncidentCommand,
): IncidentStatus {
  if (command.action === "investigate") {
    if (current !== "open") throw new TelemetryError("invalid_transition", 409);
    return "investigating";
  }
  if (command.action === "close") {
    if (current !== "open" && current !== "investigating")
      throw new TelemetryError("invalid_transition", 409);
    return "closed";
  }
  if (command.action === "reopen") {
    if (current !== "closed")
      throw new TelemetryError("invalid_transition", 409);
    return "investigating";
  }
  throw new TelemetryError("invalid_transition", 409);
}
