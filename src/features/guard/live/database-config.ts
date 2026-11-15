import { isAbsolute } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  ApprovedDatabaseConfig,
  DatabaseApproval,
  Target,
} from "../../../platform/config";
import { parseApproval } from "../../../platform/config";
import { LiveGuardError } from "./model";
export const guardRoles = {
  app: "wetscan_guard_app",
  worker: "wetscan_guard_worker",
  migration: "wetscan_guard_migrator",
} as const;
export interface GuardDatabaseApproval extends DatabaseApproval {
  module: "guard";
  purpose: keyof typeof guardRoles;
  expiresAt: string;
  role: string;
}
/** Reuse exact platform target/marker/plan rules; reject all existing Sentinel targets before secrets/pool. */
export function validateGuardApproval(
  input: unknown,
  purpose: keyof typeof guardRoles,
  plan: string,
  now = Date.now(),
): GuardDatabaseApproval {
  const value = input as GuardDatabaseApproval;
  if (
    !value ||
    value.module !== "guard" ||
    value.purpose !== purpose ||
    value.role !== guardRoles[purpose] ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    Date.parse(value.expiresAt) <= now ||
    !value.target ||
    ![
      "wetscan_dev",
      "wetscan_dev_guardg01",
      "wetscan_s01_test_guardg01",
    ].includes(value.target.database)
  )
    throw new LiveGuardError("approval_required");
  parseApproval(
    value,
    value.target,
    purpose === "migration" ? "migrate_up" : "runtime",
    plan,
  );
  return value;
}
export async function guardDatabaseConfig(
  environment: Readonly<Record<string, string | undefined>>,
  purpose: keyof typeof guardRoles,
  plan: string,
  expectedTarget?: Target,
): Promise<ApprovedDatabaseConfig & { approval: GuardDatabaseApproval }> {
  const approvalPath =
      environment[`GUARD_DB_${purpose.toUpperCase()}_APPROVAL_FILE`],
    passwordPath =
      environment[`GUARD_DB_${purpose.toUpperCase()}_PASSWORD_FILE`];
  if (!approvalPath || !passwordPath)
    throw new LiveGuardError("not_configured");
  if (!isAbsolute(approvalPath) || !isAbsolute(passwordPath))
    throw new LiveGuardError("approval_required");
  let approval: GuardDatabaseApproval;
  try {
    approval = validateGuardApproval(
      JSON.parse(await readFile(approvalPath, "utf8")),
      purpose,
      plan,
    );
  } catch {
    throw new LiveGuardError("approval_required");
  }
  if (
    expectedTarget &&
    (["host", "port", "database", "marker"] as const).some(
      (k) => approval.target[k] !== expectedTarget[k],
    )
  )
    throw new LiveGuardError("approval_required");
  // Only an operator's explicit active exact-target approval permits reading its purpose-specific credential at runtime.
  let password: string;
  try {
    password = (await readFile(passwordPath, "utf8")).trim();
  } catch {
    throw new LiveGuardError("not_configured");
  }
  if (
    password.length < 20 ||
    password.length > 512 ||
    /[\r\n\0]/.test(password)
  )
    throw new LiveGuardError("not_configured");
  return {
    target: approval.target,
    purpose,
    user: guardRoles[purpose],
    password,
    max: purpose === "migration" ? 1 : purpose === "worker" ? 2 : 3,
    approval,
  };
}
