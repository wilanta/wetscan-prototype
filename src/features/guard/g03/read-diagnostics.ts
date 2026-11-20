/** Fixed public read diagnostics. Never serialize Error.message, response bodies, headers or URLs. */
export class GuardReadError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
  ) {
    super(message);
  }
}
const codes = new Set([
  "approval_required",
  "not_configured",
  "configuration",
  "not_found",
  "guard_unavailable",
  "storage_unavailable",
  "github_unavailable",
  "unauthorized",
  "unauthenticated",
  "not_authenticated",
  "session_expired",
  "invalid_response",
  "request_failed",
  "source_integrity",
  "execution_not_ready",
]);
export interface ReadProbe {
  status: "NOT_REQUESTED" | "OK" | "ERROR";
  httpStatus: number | null;
  errorCode: string | null;
}
export interface SelectionReadDiagnostics {
  readiness: ReadProbe;
  scanHistory: ReadProbe;
  scanView: ReadProbe;
  configuration: {
    database: string | null;
    schema: string | null;
    repositoryScanning: string | null;
  } | null;
}
export function emptyReadDiagnostics(): SelectionReadDiagnostics {
  const probe = (): ReadProbe => ({
    status: "NOT_REQUESTED",
    httpStatus: null,
    errorCode: null,
  });
  return {
    readiness: probe(),
    scanHistory: probe(),
    scanView: probe(),
    configuration: null,
  };
}
export const successfulRead = (): ReadProbe => ({
  status: "OK",
  httpStatus: 200,
  errorCode: null,
});
export function failedRead(error: unknown): ReadProbe {
  return {
    status: "ERROR",
    httpStatus:
      error instanceof GuardReadError &&
      Number.isInteger(error.httpStatus) &&
      Number(error.httpStatus) >= 100 &&
      Number(error.httpStatus) <= 599
        ? error.httpStatus
        : null,
    errorCode:
      error instanceof GuardReadError && codes.has(error.message)
        ? error.message
        : "unrecognized_error",
  };
}
export function publicConfiguration(
  value: unknown,
): SelectionReadDiagnostics["configuration"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const pick = (s: unknown, allowed: string[]) =>
    typeof s === "string" && allowed.includes(s) ? s : null;
  const product =
    v.product && typeof v.product === "object"
      ? (v.product as Record<string, unknown>)
      : {};
  return {
    database: pick(v.database, [
      "approved",
      "approval_required",
      "not_configured",
      "unavailable",
    ]),
    schema: pick(v.schema, ["verified", "unverified", "not_configured"]),
    repositoryScanning: pick(product.repositoryScanning, [
      "CONFIGURED",
      "BLOCKED",
    ]),
  };
}
export function safeReadDiagnostics(
  value?: SelectionReadDiagnostics,
): SelectionReadDiagnostics | null {
  if (!value) return null;
  const probe = (p: ReadProbe): ReadProbe =>
    p?.status === "OK"
      ? successfulRead()
      : p?.status === "ERROR"
        ? failedRead(new GuardReadError(p.errorCode ?? "", p.httpStatus))
        : { status: "NOT_REQUESTED", httpStatus: null, errorCode: null };
  return {
    readiness: probe(value.readiness),
    scanHistory: probe(value.scanHistory),
    scanView: probe(value.scanView),
    configuration: value.configuration
      ? publicConfiguration({
          database: value.configuration.database,
          schema: value.configuration.schema,
          product: {
            repositoryScanning: value.configuration.repositoryScanning,
          },
        })
      : null,
  };
}
