import {
  object,
  timestamp,
  TelemetryError,
  kinds,
  uuid,
} from "../telemetry/validation";
import { detectionLimits, type Condition, type RuleDefinition } from "./model";

export function numberIn(value: unknown, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max)
    throw new TelemetryError("invalid_rule_number");
  return Number(value);
}
function label(v: unknown, max: number): string {
  if (
    typeof v !== "string" ||
    !v.trim() ||
    v.length > max ||
    /[\x00-\x1f<>]/.test(v)
  )
    throw new TelemetryError("invalid_rule_label");
  return v;
}
export function definition(input: unknown): RuleDefinition {
  const v = object(input, [
    "schemaVersion",
    "name",
    "description",
    "category",
    "severity",
    "confidence",
    "eventKinds",
    "conditions",
    "correlation",
    "windowSeconds",
    "threshold",
    "cooldownSeconds",
    "suppressionWindows",
  ]);
  if (
    v.schemaVersion !== 1 ||
    !["authentication", "http", "decoy"].includes(String(v.category)) ||
    !["low", "medium", "high"].includes(String(v.severity)) ||
    !["source", "actor_hash"].includes(String(v.correlation))
  )
    throw new TelemetryError("invalid_rule");
  if (
    !Array.isArray(v.eventKinds) ||
    !v.eventKinds.length ||
    v.eventKinds.length > 4 ||
    new Set(v.eventKinds).size !== v.eventKinds.length ||
    v.eventKinds.some((k) => !kinds.includes(k))
  )
    throw new TelemetryError("invalid_rule_kinds");
  if (
    !Array.isArray(v.conditions) ||
    v.conditions.length > detectionLimits.conditions
  )
    throw new TelemetryError("invalid_conditions");
  const conditions = v.conditions.map((raw): Condition => {
    const c = object(raw, ["field", "op", "value"]);
    if (
      c.field === "request.statusCode" ||
      c.field === "attributes.durationMs"
    ) {
      if (!["eq", "gte", "lte"].includes(String(c.op)))
        throw new TelemetryError("unsupported_operator");
      const value = numberIn(
        c.value,
        c.field === "request.statusCode" ? 100 : 0,
        c.field === "request.statusCode" ? 599 : 3600000,
      );
      return { field: c.field, op: c.op as "eq" | "gte" | "lte", value };
    }
    const strings =
      c.field === "request.method"
        ? ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
        : c.field === "attributes.reasonCode"
          ? [
              "invalid_credentials",
              "unauthorized",
              "forbidden",
              "not_found",
              "suspicious_path",
              "controlled_probe",
              "decoy_hit",
              "request_completed",
            ]
          : [];
    if (c.op !== "eq" || !strings.includes(String(c.value)))
      throw new TelemetryError("unsupported_condition");
    return {
      field: c.field as "request.method" | "attributes.reasonCode",
      op: "eq",
      value: String(c.value),
    };
  });
  if (!Array.isArray(v.suppressionWindows) || v.suppressionWindows.length > 8)
    throw new TelemetryError("invalid_suppression");
  const suppressionWindows = v.suppressionWindows
    .map((raw) => {
      const w = object(raw, ["from", "to"]),
        from = timestamp(w.from),
        to = timestamp(w.to);
      if (
        Date.parse(to) <= Date.parse(from) ||
        Date.parse(to) - Date.parse(from) > 7 * 86400000
      )
        throw new TelemetryError("invalid_suppression");
      return { from, to };
    })
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  return {
    schemaVersion: 1,
    name: label(v.name, 80),
    description: label(v.description, 400),
    category: v.category as RuleDefinition["category"],
    severity: v.severity as RuleDefinition["severity"],
    confidence: numberIn(v.confidence, 0, 100),
    eventKinds: [...v.eventKinds].sort(),
    conditions,
    correlation: v.correlation as RuleDefinition["correlation"],
    windowSeconds: numberIn(v.windowSeconds, 1, 3600),
    threshold: numberIn(v.threshold, 1, detectionLimits.events),
    cooldownSeconds: numberIn(v.cooldownSeconds, 0, 86400),
    suppressionWindows,
  };
}
export function ruleCommand(input: unknown) {
  const c = object(input, [
    "action",
    "ruleId",
    "expectedRevision",
    "definition",
  ]);
  if (
    !["create", "update", "enable", "disable", "seed"].includes(
      String(c.action),
    )
  )
    throw new TelemetryError("invalid_action");
  if (c.action === "seed") {
    if (
      c.ruleId !== undefined ||
      c.expectedRevision !== undefined ||
      c.definition !== undefined
    )
      throw new TelemetryError("invalid_action");
    return { action: "seed" as const };
  }
  if (c.action === "create") {
    if (c.ruleId !== undefined || c.expectedRevision !== undefined)
      throw new TelemetryError("invalid_action");
    return { action: "create" as const, definition: definition(c.definition) };
  }
  const ruleId = uuid(c.ruleId),
    expectedRevision = numberIn(
      c.expectedRevision,
      1,
      detectionLimits.versions,
    );
  if (c.action === "update")
    return {
      action: "update" as const,
      ruleId,
      expectedRevision,
      definition: definition(c.definition),
    };
  if (c.definition !== undefined) throw new TelemetryError("invalid_action");
  return { action: c.action as "enable" | "disable", ruleId, expectedRevision };
}
