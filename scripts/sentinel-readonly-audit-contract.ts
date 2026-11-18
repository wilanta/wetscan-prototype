import { isAbsolute } from "node:path";

export const auditKind = "wetscan-s04-dev-preservation-audit";
export const auditPhase = "preservation-audit";
export const auditAction = "read_only_audit";
export const auditMaximumMs = 120_000;
export const auditApprovalName = "dev-readonly-audit-approval.json";
export const auditTarget = {
  host: "127.0.0.1",
  port: 55432,
  database: "wetscan_dev",
  marker: "wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f",
} as const;
export const auditPlan =
  "3438a56e778b30afdd6acf03600638fe31e26c55c2ae5bf63d224f909c429ae7";
export class AuditError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export function auditCheck(ok: unknown, code: string): asserts ok {
  if (!ok) throw new AuditError(code);
}
function stamp(value: unknown): string {
  auditCheck(
    typeof value === "string" &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
      Number.isFinite(Date.parse(value)),
    "audit_approval_timestamp",
  );
  return value;
}
/** A separate action: generic runtime/migration/worker approval parsers reject it. */
export function auditApprovalMetadata(value: unknown) {
  auditCheck(
    value && typeof value === "object" && !Array.isArray(value),
    "audit_approval_metadata",
  );
  const a = value as Record<string, unknown>;
  auditCheck(
    Object.keys(a).every((k) =>
      [
        "schemaVersion",
        "kind",
        "phase",
        "status",
        "approvedBy",
        "approvedAt",
        "expiresAt",
        "actions",
        "target",
        "migrationPlanSha256",
        "inputManifestSha256",
        "runId",
        "outputDirectory",
        "closedAt",
      ].includes(k),
    ),
    "audit_approval_metadata",
  );
  auditCheck(
    typeof a.inputManifestSha256 === "string" &&
      /^[a-f0-9]{64}$/.test(a.inputManifestSha256),
    "audit_manifest_binding",
  );
  auditCheck(
    a.schemaVersion === 1 &&
      a.kind === auditKind &&
      a.phase === auditPhase &&
      (a.status === "APPROVED" || a.status === "CLOSED") &&
      typeof a.approvedBy === "string" &&
      /^[A-Za-z0-9 _:.\/-]{3,160}$/.test(a.approvedBy),
    "audit_approval_metadata",
  );
  auditCheck(
    a.target &&
      typeof a.target === "object" &&
      Object.keys(a.target).length === 4 &&
      Object.entries(auditTarget).every(
        ([k, v]) => (a.target as Record<string, unknown>)[k] === v,
      ) &&
      a.migrationPlanSha256 === auditPlan,
    "audit_target",
  );
  auditCheck(
    typeof a.runId === "string" &&
      /^[a-f0-9]{32}$/.test(a.runId) &&
      typeof a.outputDirectory === "string" &&
      isAbsolute(a.outputDirectory),
    "audit_approval_binding",
  );
  auditCheck(
    Array.isArray(a.actions) &&
      (a.status === "APPROVED"
        ? a.actions.length === 1 &&
          a.actions[0] === auditAction &&
          a.closedAt === undefined
        : a.actions.length === 0),
    "audit_approval_actions",
  );
  const approvedAt = stamp(a.approvedAt),
    expiresAt = stamp(a.expiresAt);
  auditCheck(
    Date.parse(expiresAt) > Date.parse(approvedAt) &&
      Date.parse(expiresAt) - Date.parse(approvedAt) <= auditMaximumMs,
    "audit_approval_ttl",
  );
  const closedAt = a.status === "CLOSED" ? stamp(a.closedAt) : null;
  if (closedAt)
    auditCheck(
      Date.parse(closedAt) >= Date.parse(approvedAt),
      "audit_approval_timestamp",
    );
  return {
    status: a.status as "APPROVED" | "CLOSED",
    actions: a.actions as string[],
    phase: a.phase as typeof auditPhase,
    approvedAt,
    expiresAt,
    closedAt,
    runId: a.runId,
    outputDirectory: a.outputDirectory,
    inputManifestSha256: a.inputManifestSha256,
  };
}
export function validateAuditAuthorization(
  value: unknown,
  binding: { runId: string; outputDirectory: string; nowMs: number },
) {
  const a = auditApprovalMetadata(value);
  auditCheck(
    a.status === "APPROVED" &&
      a.runId === binding.runId &&
      a.outputDirectory === binding.outputDirectory,
    "audit_approval_binding",
  );
  auditCheck(
    binding.nowMs >= Date.parse(a.approvedAt) &&
      binding.nowMs < Date.parse(a.expiresAt),
    "audit_approval_expired",
  );
  return a;
}
