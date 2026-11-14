import "server-only";
import { AuthError } from "./config";
import type { Session } from "./types";

export type CallbackStage =
  | "session"
  | "state"
  | "installation"
  | "authorization"
  | "identity"
  | "repositories"
  | "session_rotation";
const safeCodes = new Set([
  "configuration",
  "invalid_state",
  "invalid_callback",
  "github_setup_misconfigured",
  "github_cancelled",
  "github_expired",
  "github_denied",
  "github_unavailable",
  "github_app_credentials",
  "github_app_key_invalid",
  "github_rate_limited",
  "github_not_found",
  "github_validation",
  "github_invalid_request",
  "github_response",
  "github_oauth_error",
  "github_permissions",
  "github_app_mismatch",
  "installation_denied",
  "account_mismatch",
  "unauthenticated",
]);
export function callbackErrorCode(error: unknown) {
  return error instanceof AuthError && safeCodes.has(error.code)
    ? error.code
    : "server_error";
}
export function logCallbackFailure(
  error: unknown,
  details: {
    stage: CallbackStage;
    cookiePresent: boolean;
    sessionPresent: boolean;
    flowKind?: NonNullable<Session["flow"]>["kind"];
    statePresent: boolean;
    installationPresent: boolean;
    codePresent: boolean;
  },
) {
  // Intentionally omit error.message/stack, request URLs, headers and query values.
  console.warn("[WetScan auth] GitHub callback failed", {
    reason: callbackErrorCode(error),
    stage: details.stage,
    cookiePresent: details.cookiePresent,
    sessionPresent: details.sessionPresent,
    flowKind: details.flowKind ?? "none",
    statePresent: details.statePresent,
    installationPresent: details.installationPresent,
    codePresent: details.codePresent,
  });
}
