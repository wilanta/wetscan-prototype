import { expect, it } from "vitest";
import {
  emptyReadDiagnostics,
  GuardReadError,
  failedRead,
  publicConfiguration,
  safeReadDiagnostics,
  successfulRead,
} from "../../../src/features/guard/g03/read-diagnostics";
import { exportUnavailableSelection } from "../../../src/features/guard/g03/selection-export";
it("records failed scan-history configuration without pretending there are zero scans", () => {
  const diagnostics = emptyReadDiagnostics();
  diagnostics.readiness = successfulRead();
  diagnostics.configuration = publicConfiguration({
    database: "approval_required",
    schema: "unverified",
    product: { repositoryScanning: "BLOCKED" },
  });
  diagnostics.scanHistory = failedRead(
    new GuardReadError("approval_required", 503),
  );
  const result = exportUnavailableSelection(
    "github-123",
    "owner/test",
    [],
    true,
    diagnostics,
  );
  expect(result).toMatchObject({
    storageStatus: "UNAVAILABLE",
    scanId: null,
    readDiagnostics: {
      scanHistory: { httpStatus: 503, errorCode: "approval_required" },
      scanView: { status: "NOT_REQUESTED" },
      configuration: {
        database: "approval_required",
        schema: "unverified",
        repositoryScanning: "BLOCKED",
      },
    },
  });
  expect(result.currentHeadVerified).toBe(false);
});
it.each([
  "not_configured",
  "not_found",
  "github_unavailable",
  "invalid_response",
])("retains fixed public error code %s and HTTP status", (code) => {
  expect(failedRead(new GuardReadError(code, 503))).toMatchObject({
    status: "ERROR",
    httpStatus: 503,
    errorCode: code,
  });
});
it("never serializes arbitrary exceptions, SQL, token-like values or response fields", () => {
  const hidden = "PRIVATE_ERROR_PAYLOAD_MARKER";
  const diagnostics = emptyReadDiagnostics();
  diagnostics.scanHistory = failedRead(new GuardReadError(hidden, 503));
  diagnostics.scanView = failedRead(Error(hidden));
  diagnostics.configuration = publicConfiguration({
    database: hidden,
    schema: "verified",
    password: hidden,
    product: { repositoryScanning: "BLOCKED", reason: hidden },
  });
  const result = safeReadDiagnostics(diagnostics);
  expect(JSON.stringify(result)).not.toContain(hidden);
  expect(result?.scanHistory.errorCode).toBe("unrecognized_error");
  expect(result?.scanView.httpStatus).toBeNull();
  expect(result?.configuration?.database).toBeNull();
});
it("bounds statuses and removes unknown diagnostic fields", () => {
  const diagnostics = emptyReadDiagnostics();
  diagnostics.scanHistory = failedRead(
    new GuardReadError("not_configured", 700),
  );
  Reflect.set(diagnostics, "privateState", "PRIVATE_DIAGNOSTIC_FIELD");
  expect(safeReadDiagnostics(diagnostics)?.scanHistory.httpStatus).toBeNull();
  expect(JSON.stringify(safeReadDiagnostics(diagnostics))).not.toContain(
    "PRIVATE_DIAGNOSTIC_FIELD",
  );
  expect(safeReadDiagnostics()).toBeNull();
});
