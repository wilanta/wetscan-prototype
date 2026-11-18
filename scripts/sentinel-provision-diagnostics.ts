import { PlatformError } from "../src/platform/config";
import type { DatabaseConnectionEvent } from "../src/platform/database";
import { ApprovalHistoryError } from "./sentinel-approval-history";
import { ProvisionError } from "./sentinel-provision-safety";

export type ProvisionStage =
  | "operation_dispatch"
  | "output_validation"
  | "execution_opt_in"
  | "approval_validation"
  | "database_configuration"
  | "input_validation"
  | "process_isolation"
  | "pool_setup"
  | "database_connect"
  | "database_identity_query"
  | "database_identity_validation"
  | "read_only_snapshot"
  | "migration_validation"
  | "historical_validation"
  | "artifact_write"
  | "phase_operation"
  | "pool_cleanup";
export function provisionDiagnostics(operation: string) {
  return {
    operation: [
      "offline",
      "approvals-check",
      "audit-start",
      "audit-end",
      "audit-failure-end",
      "execute",
      "recover",
    ].includes(operation)
      ? operation
      : "unknown",
    stage: "operation_dispatch" as ProvisionStage,
    databaseConnectAttempts: 0,
    transportConnected: false,
    identityVerified: false,
    identityFailure: undefined as
      | Extract<
          DatabaseConnectionEvent,
          { stage: "identity_rejected" }
        >["reason"]
      | undefined,
  };
}
export type ProvisionDiagnostics = ReturnType<typeof provisionDiagnostics>;
export function observeProvisionDatabase(
  context: ProvisionDiagnostics,
  event: DatabaseConnectionEvent,
) {
  if (event.stage === "connect_attempt") {
    context.stage = "database_connect";
    context.databaseConnectAttempts++;
    context.transportConnected = false;
    context.identityVerified = false;
    context.identityFailure = undefined;
  } else if (event.stage === "identity_query") {
    context.transportConnected = true;
    context.stage = "database_identity_query";
  } else if (event.stage === "identity_rejected") {
    context.stage = "database_identity_validation";
    context.identityFailure = event.reason;
  } else {
    context.identityVerified = true;
    context.stage = "read_only_snapshot";
  }
}
// Never serialize an Error, message, stack, URL, path, SQL, or arbitrary driver code.
const driverFailures: Record<string, string> = {
  ECONNREFUSED: "connection_refused",
  ETIMEDOUT: "connection_timeout",
  ECONNRESET: "connection_reset",
  EPIPE: "connection_closed",
  ENOTFOUND: "name_resolution_failed",
  EAI_AGAIN: "name_resolution_failed",
  "28P01": "authentication_failed",
  "28000": "authentication_failed",
  "3D000": "database_missing",
  "42501": "database_permission_denied",
  "57P03": "database_not_ready",
};
function driverFailure(
  error: unknown,
): { category: string; driverCode?: string } | undefined {
  if (!error || typeof error !== "object") return;
  const value = error as {
    code?: unknown;
    message?: unknown;
    errors?: unknown;
  };
  if (
    typeof value.code === "string" &&
    Object.hasOwn(driverFailures, value.code)
  )
    return { category: driverFailures[value.code], driverCode: value.code };
  // pg-pool uses these fixed messages for a connection timeout without errno.
  if (
    value.message === "Connection terminated due to connection timeout" ||
    value.message === "timeout exceeded when trying to connect"
  )
    return { category: "connection_timeout" };
  if (error instanceof AggregateError && Array.isArray(value.errors)) {
    const failures = value.errors.slice(0, 8).map((e) => driverFailureLeaf(e));
    if (
      failures.length &&
      failures.every((f) => f && f.category === failures[0]?.category)
    )
      return failures[0];
  }
}
function driverFailureLeaf(error: unknown) {
  return error instanceof AggregateError ? undefined : driverFailure(error);
}
export function provisionFailure(
  error: unknown,
  context: ProvisionDiagnostics,
) {
  const driver = driverFailure(error);
  const reason =
    error instanceof ProvisionError
      ? error.code
      : error instanceof ApprovalHistoryError
        ? error.message
        : "provision_validation_failed";
  const errorClass =
    error instanceof ProvisionError
      ? "ProvisionError"
      : error instanceof ApprovalHistoryError
        ? "ApprovalHistoryError"
        : error instanceof PlatformError
          ? "PlatformError"
          : error instanceof AggregateError
            ? "AggregateError"
            : error instanceof SyntaxError
              ? "SyntaxError"
              : error instanceof Error
                ? "Error"
                : "Unknown";
  const category = context.identityFailure
    ? `identity_${context.identityFailure}`
    : (driver?.category ??
      (error instanceof PlatformError
        ? error.code
        : error instanceof ApprovalHistoryError
          ? "approval_history_failed"
          : context.stage === "approval_validation"
            ? "approval_validation_failed"
            : context.stage === "historical_validation"
              ? "historical_preservation_failed"
              : context.stage === "migration_validation"
                ? "migration_identity_failed"
                : "validation_failed"));
  return {
    status: "NOT_VERIFIED",
    reason,
    diagnostic: {
      ...context,
      errorClass,
      category,
      ...(driver?.driverCode ? { driverCode: driver.driverCode } : {}),
    },
  };
}
