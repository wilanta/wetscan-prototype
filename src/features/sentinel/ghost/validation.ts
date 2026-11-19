import { object, TelemetryError, uuid } from "../telemetry/validation";
import { DEFAULT_GHOST_DECOY_PATH, ghostLimits } from "./model";

const DECOY_PATH_PATTERN = /^\/(?:__wetscan|\.well-known)\/[a-z0-9-]{3,40}$/;
const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9 ._-]{0,59}$/;
const TARGET_REF_PATTERN = /^[a-z0-9][a-z0-9._:-]{1,118}$/;
const PROOF_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,80}$/;

export function validateDecoyPath(value: unknown): string {
  if (typeof value !== "string" || !DECOY_PATH_PATTERN.test(value))
    throw new TelemetryError("invalid_decoy_path");
  return value;
}

export function decoyPathCategory(
  decoyPath: string,
): "wetscan_decoy" | "well_known_decoy" {
  return decoyPath.startsWith("/__wetscan/")
    ? "wetscan_decoy"
    : "well_known_decoy";
}

function validateName(value: unknown): string {
  if (
    typeof value !== "string" ||
    !NAME_PATTERN.test(value) ||
    /[A-Za-z0-9_-]{25,}/.test(value)
  )
    throw new TelemetryError("invalid_decoy_name");
  return value;
}

function validateTargetRef(value: unknown): string {
  if (typeof value !== "string" || !TARGET_REF_PATTERN.test(value))
    throw new TelemetryError("invalid_target_ref");
  return value;
}

function validateResponseStatus(value: unknown): 200 | 204 | 404 {
  if (value !== 200 && value !== 204 && value !== 404)
    throw new TelemetryError("invalid_response_status");
  return value;
}

function validateRateLimit(value: unknown): number {
  if (
    !Number.isInteger(value) ||
    Number(value) < 1 ||
    Number(value) > ghostLimits.maxRateLimitPerMin
  )
    throw new TelemetryError("invalid_rate_limit");
  return Number(value);
}

function validateProofId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !PROOF_ID_PATTERN.test(value))
    throw new TelemetryError("invalid_proof_id");
  return value;
}

function validateRevision(value: unknown): number {
  if (
    !Number.isInteger(value) ||
    Number(value) < 1 ||
    Number(value) > ghostLimits.revisions
  )
    throw new TelemetryError("invalid_revision");
  return Number(value);
}

export type GhostCommand =
  | {
      action: "create";
      sourceId: string;
      name: string;
      targetRef: string;
      decoyPath: string;
      responseStatus: 200 | 204 | 404;
      rateLimitPerMin: number;
      ownedApplicationConfirmed: true;
      h07ProofId: string | null;
    }
  | {
      action: "enable";
      decoyId: string;
      expectedRevision: number;
      ownedApplicationConfirmed: true;
    }
  | {
      action: "disable";
      decoyId: string;
      expectedRevision: number;
    }
  | {
      action: "update";
      decoyId: string;
      expectedRevision: number;
      name?: string;
      targetRef?: string;
      decoyPath?: string;
      responseStatus?: 200 | 204 | 404;
      rateLimitPerMin?: number;
      h07ProofId?: string | null;
    };

export function ghostCommand(input: unknown): GhostCommand {
  const c = object(input, [
    "action",
    "sourceId",
    "decoyId",
    "expectedRevision",
    "name",
    "targetRef",
    "decoyPath",
    "responseStatus",
    "rateLimitPerMin",
    "ownedApplicationConfirmed",
    "h07ProofId",
  ]);
  if (c.action === "create") {
    if (c.decoyId !== undefined || c.expectedRevision !== undefined)
      throw new TelemetryError("invalid_action");
    if (c.ownedApplicationConfirmed !== true)
      throw new TelemetryError("owned_application_confirmation_required");
    return {
      action: "create",
      sourceId: uuid(c.sourceId),
      name: validateName(c.name),
      targetRef: validateTargetRef(c.targetRef ?? "local-fixture:127.0.0.1"),
      decoyPath: validateDecoyPath(c.decoyPath ?? DEFAULT_GHOST_DECOY_PATH),
      responseStatus: validateResponseStatus(c.responseStatus ?? 200),
      rateLimitPerMin: validateRateLimit(
        c.rateLimitPerMin ?? ghostLimits.defaultRateLimitPerMin,
      ),
      ownedApplicationConfirmed: true,
      h07ProofId: validateProofId(c.h07ProofId),
    };
  }
  if (c.sourceId !== undefined) throw new TelemetryError("invalid_action");
  const decoyId = uuid(c.decoyId);
  const expectedRevision = validateRevision(c.expectedRevision);
  if (c.action === "enable") {
    if (
      c.name !== undefined ||
      c.targetRef !== undefined ||
      c.decoyPath !== undefined ||
      c.responseStatus !== undefined ||
      c.rateLimitPerMin !== undefined ||
      c.h07ProofId !== undefined
    )
      throw new TelemetryError("invalid_action");
    if (c.ownedApplicationConfirmed !== true)
      throw new TelemetryError("owned_application_confirmation_required");
    return {
      action: "enable",
      decoyId,
      expectedRevision,
      ownedApplicationConfirmed: true,
    };
  }
  if (c.action === "disable") {
    if (
      c.name !== undefined ||
      c.targetRef !== undefined ||
      c.decoyPath !== undefined ||
      c.responseStatus !== undefined ||
      c.rateLimitPerMin !== undefined ||
      c.h07ProofId !== undefined ||
      c.ownedApplicationConfirmed !== undefined
    )
      throw new TelemetryError("invalid_action");
    return {
      action: "disable",
      decoyId,
      expectedRevision,
    };
  }
  if (c.action === "update") {
    if (c.ownedApplicationConfirmed !== undefined)
      throw new TelemetryError("invalid_action");
    const update: Extract<GhostCommand, { action: "update" }> = {
      action: "update",
      decoyId,
      expectedRevision,
    };
    let changed = false;
    if (c.name !== undefined) {
      update.name = validateName(c.name);
      changed = true;
    }
    if (c.targetRef !== undefined) {
      update.targetRef = validateTargetRef(c.targetRef);
      changed = true;
    }
    if (c.decoyPath !== undefined) {
      update.decoyPath = validateDecoyPath(c.decoyPath);
      changed = true;
    }
    if (c.responseStatus !== undefined) {
      update.responseStatus = validateResponseStatus(c.responseStatus);
      changed = true;
    }
    if (c.rateLimitPerMin !== undefined) {
      update.rateLimitPerMin = validateRateLimit(c.rateLimitPerMin);
      changed = true;
    }
    if (c.h07ProofId !== undefined) {
      update.h07ProofId = validateProofId(c.h07ProofId);
      changed = true;
    }
    if (!changed) throw new TelemetryError("invalid_action");
    return update;
  }
  throw new TelemetryError("invalid_action");
}
