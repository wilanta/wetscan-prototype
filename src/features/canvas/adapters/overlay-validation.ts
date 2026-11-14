import type { SecurityOverlay } from "../types";
const states = [
  "not_scanned",
  "not_monitored",
  "available",
  "partial",
  "stale",
  "failed",
  "unavailable",
];
const text = (value: unknown, max = 4000): value is string =>
  typeof value === "string" && value.length <= max;
export function safeActionHref(href: unknown): string | undefined {
  return typeof href === "string" &&
    /^\/app\/projects\/[\w-]+\/(?:guard|sentinel)(?:\/[\w-]+)*$/.test(href)
    ? href
    : undefined;
}
/** Adapter responses are runtime trust boundaries too. Project/mode gate is applied by service. */
export function validateSecurityOverlay(
  value: SecurityOverlay,
): SecurityOverlay {
  if (
    !value ||
    !text(value.projectRef, 512) ||
    !["demo", "live", "unavailable"].includes(value.mode) ||
    !states.includes(value.guard) ||
    !states.includes(value.sentinel) ||
    !text(value.message) ||
    !Array.isArray(value.findings) ||
    value.findings.length > 2000 ||
    !Array.isArray(value.incidents) ||
    value.incidents.length > 2000
  )
    throw new Error("Invalid security overlay response");
  for (const f of value.findings) {
    if (
      !f ||
      ![f.id, f.nodeId, f.title, f.status, f.evidenceType, f.evidence].every(
        (v) => text(v),
      ) ||
      !["critical", "high", "medium", "low", "info"].includes(f.severity) ||
      !["Guard", "Sentinel", "Manual"].includes(f.source) ||
      !["review", "resolved"].includes(f.priority) ||
      typeof f.simulated !== "boolean"
    )
      throw new Error("Invalid finding response");
  }
  for (const i of value.incidents)
    if (
      !i ||
      ![i.id, i.nodeId, i.title, i.status].every((v) => text(v)) ||
      typeof i.simulated !== "boolean"
    )
      throw new Error("Invalid incident response");
  return {
    ...value,
    findings: value.findings.map((f) => ({
      ...f,
      href: safeActionHref(f.href),
    })),
    incidents: value.incidents.map((i) => ({
      ...i,
      href: safeActionHref(i.href),
    })),
  };
}
