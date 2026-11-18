import { describe, expect, it } from "vitest";
import { PlatformError } from "../../src/platform/config";
import { ApprovalHistoryError } from "../../scripts/sentinel-approval-history";
import { ProvisionError } from "../../scripts/sentinel-provision-safety";
import {
  observeProvisionDatabase,
  provisionDiagnostics,
  provisionFailure,
} from "../../scripts/sentinel-provision-diagnostics";

describe("offline provision failure diagnostics", () => {
  it.each([
    ["ECONNREFUSED", "connection_refused"],
    ["ETIMEDOUT", "connection_timeout"],
    ["28P01", "authentication_failed"],
    ["28000", "authentication_failed"],
    ["3D000", "database_missing"],
    ["42501", "database_permission_denied"],
    ["57P03", "database_not_ready"],
    ["ECONNRESET", "connection_reset"],
    ["ENOTFOUND", "name_resolution_failed"],
  ])("classifies %s without exposing driver details", (code, category) => {
    const context = provisionDiagnostics("audit-start");
    observeProvisionDatabase(context, { stage: "connect_attempt" });
    const error = Object.assign(
      new Error(
        "postgres://PRIVATE_PASSWORD; wetscan_session=PRIVATE_COOKIE; SQL PRIVATE_TOKEN",
      ),
      { code, detail: "PRIVATE_DETAIL" },
    );
    const result = provisionFailure(error, context);
    expect(result.reason).toBe("provision_validation_failed");
    expect(result.diagnostic).toMatchObject({
      stage: "database_connect",
      databaseConnectAttempts: 1,
      transportConnected: false,
      identityVerified: false,
      driverCode: code,
      category,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE|postgres:\/\/|wetscan_session|stack|detail/,
    );
  });
  it.each([
    "Connection terminated due to connection timeout",
    "timeout exceeded when trying to connect",
  ])("classifies pg-pool timeout %s", (message) => {
    expect(
      provisionFailure(new Error(message), provisionDiagnostics("audit-start"))
        .diagnostic.category,
    ).toBe("connection_timeout");
  });
  it("handles AggregateError refusal while refusing mixed or unknown aggregate causes", () => {
    const refused = Object.assign(new Error("PRIVATE"), {
      code: "ECONNREFUSED",
    });
    const unknown = new Error("PRIVATE");
    const context = provisionDiagnostics("audit-start");
    expect(
      provisionFailure(new AggregateError([refused, refused]), context)
        .diagnostic.category,
    ).toBe("connection_refused");
    expect(
      provisionFailure(new AggregateError([refused, unknown]), context)
        .diagnostic.category,
    ).toBe("validation_failed");
    expect(
      provisionFailure(new AggregateError([]), context).diagnostic.category,
    ).toBe("validation_failed");
  });
  it.each(["marker", "role"] as const)(
    "distinguishes wrong %s after a successful transport connection",
    (reason) => {
      const context = provisionDiagnostics("audit-start");
      observeProvisionDatabase(context, { stage: "connect_attempt" });
      observeProvisionDatabase(context, { stage: "identity_query" });
      observeProvisionDatabase(context, { stage: "identity_rejected", reason });
      expect(
        provisionFailure(new PlatformError("target_denied"), context)
          .diagnostic,
      ).toMatchObject({
        stage: "database_identity_validation",
        category: `identity_${reason}`,
        errorClass: "PlatformError",
        transportConnected: true,
        identityVerified: false,
      });
    },
  );
  it.each([
    [
      "approval_validation",
      new ProvisionError("approval_expired"),
      "approval_validation_failed",
    ],
    [
      "historical_validation",
      new ProvisionError("historical_rows"),
      "historical_preservation_failed",
    ],
    [
      "migration_validation",
      new ProvisionError("migration_identity"),
      "migration_identity_failed",
    ],
    [
      "database_configuration",
      new PlatformError("not_configured"),
      "not_configured",
    ],
    [
      "input_validation",
      new ApprovalHistoryError("history_metadata"),
      "approval_history_failed",
    ],
  ] as const)(
    "preserves %s separately from transport failure",
    (stage, error, category) => {
      const context = provisionDiagnostics("audit-start");
      context.stage = stage;
      expect(provisionFailure(error, context).diagnostic).toMatchObject({
        stage,
        category,
        databaseConnectAttempts: 0,
        transportConnected: false,
      });
    },
  );
  it("records verified identity before snapshot errors, and resets facts on a subsequent connect", () => {
    const context = provisionDiagnostics("audit-start");
    for (const stage of [
      "connect_attempt",
      "identity_query",
      "identity_verified",
    ] as const)
      observeProvisionDatabase(context, { stage });
    expect(context).toMatchObject({
      stage: "read_only_snapshot",
      databaseConnectAttempts: 1,
      transportConnected: true,
      identityVerified: true,
    });
    observeProvisionDatabase(context, { stage: "connect_attempt" });
    expect(context).toMatchObject({
      databaseConnectAttempts: 2,
      transportConnected: false,
      identityVerified: false,
    });
  });
  it("does not serialize unknown error names, codes, nested causes, messages or operation input", () => {
    const error = Object.assign(new Error("PRIVATE_MESSAGE"), {
      name: "PRIVATE_NAME",
      code: "PRIVATE_CODE",
      cause: { password: "PRIVATE_PASSWORD" },
    });
    const result = provisionFailure(
      error,
      provisionDiagnostics("PRIVATE_OPERATION"),
    );
    expect(result.diagnostic).toMatchObject({
      errorClass: "Error",
      category: "validation_failed",
      operation: "unknown",
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
});
