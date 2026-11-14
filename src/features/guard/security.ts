import type { DastScope, EgressPort, Grant, Scope } from "./contracts";
export class GuardError extends Error {
  constructor(
    public readonly code:
      | "forbidden"
      | "invalid_input"
      | "not_configured"
      | "invalid_transition"
      | "evidence_required",
    message: string,
  ) {
    super(message);
  }
}
export function authorize(
  grant: Grant,
  scope: Scope,
  operation: Grant["operations"][number],
  now = Date.now(),
): void {
  if (
    !grant.actorId ||
    grant.expiresAt <= now ||
    grant.workspaceId !== scope.workspaceId ||
    grant.projectId !== scope.projectId ||
    grant.mode !== scope.mode ||
    !grant.operations.includes(operation)
  )
    throw new GuardError("forbidden", "Project-scoped authorization required.");
}
export function safePath(input: string): string {
  const path = input.replaceAll("\\", "/");
  if (
    !path ||
    path.length > 512 ||
    /[\u0000-\u001f\u007f<>:"|?*%]/.test(path) ||
    path.startsWith("/") ||
    path
      .split("/")
      .some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          /[. ]$/.test(p) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p),
      )
  )
    throw new GuardError("invalid_input", "Unsafe snapshot path.");
  if (
    path
      .split("/")
      .some((p) =>
        /^(\.env(?:\..*)?|\.git|node_modules|\.next|\.ssh|\.aws|credentials(?:\..*)?|secrets?(?:\..*)?|id_rsa|id_ed25519)$/i.test(
          p,
        ),
      ) ||
    /\.(pem|key|p12|pfx|der)$/i.test(path)
  )
    throw new GuardError("invalid_input", "Sensitive or excluded path.");
  return path;
}
export function redact(input: string): string {
  return input
    .slice(0, 4000)
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
      "[REDACTED PRIVATE KEY]",
    )
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|AKIA[A-Z0-9]{16})\b/g,
      "[REDACTED]",
    )
    .replace(
      /\b(authorization|cookie|set-cookie|password|secret|token|api[_-]?key)\s*[:=]\s*[^\r\n,;]+/gi,
      "$1: [REDACTED]",
    )
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@[^\s]+/gi, "[REDACTED URL]");
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new GuardError("invalid_input", "Invalid scanner object.");
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 512): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new GuardError("invalid_input", "Invalid scanner text.");
  return value;
}
export function array(value: unknown, max = 10000): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new GuardError("invalid_input", "Invalid scanner array.");
  return value;
}
export function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw new GuardError("invalid_input", "Invalid source line.");
  return value;
}
export async function digest(input: string): Promise<string> {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buffer), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
export async function allowDast(
  scope: DastScope,
  egress: EgressPort,
  enabled = false,
): Promise<void> {
  if (!enabled || !egress.ready)
    throw new GuardError(
      "not_configured",
      "DAST is disabled until an enforcing egress sandbox is configured.",
    );
  let url: URL;
  try {
    url = new URL(scope.origin);
  } catch {
    throw new GuardError("invalid_input", "Invalid staging origin.");
  }
  if (
    scope.environment !== "staging" ||
    url.protocol !== "https:" ||
    url.origin !== scope.origin ||
    url.username ||
    url.password ||
    !/^[a-z][a-z0-9.-]*\.[a-z]{2,}$/i.test(url.hostname) ||
    /(?:^|\.)(localhost|local|internal|test|invalid)$/i.test(url.hostname) ||
    !scope.consentActor ||
    !scope.proofId ||
    scope.expiresAt <= Date.now() ||
    scope.expiresAt > Date.now() + 86400000 ||
    !scope.syntheticAccounts ||
    !scope.paths.length ||
    scope.paths.some(
      (p) =>
        !p.startsWith("/") || p.startsWith("//") || /[?#%\\\s]|\.\./.test(p),
    ) ||
    !scope.methods.length ||
    scope.methods.some((m) => !["GET", "HEAD", "OPTIONS"].includes(m)) ||
    scope.requestsPerSecond <= 0 ||
    scope.requestsPerSecond > 2 ||
    scope.concurrency !== 1 ||
    scope.timeoutMs < 1 ||
    scope.timeoutMs > 60000 ||
    !(await egress.validate(scope))
  )
    throw new GuardError(
      "forbidden",
      "Authorized staging scope and enforced egress validation required.",
    );
}
