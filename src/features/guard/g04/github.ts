/** Narrow GitHub transport + App installation token seam. Pure of Next/server-only so it can be tested with injected doubles. */
export type GhErrorKind = "unauthorized" | "permission_denied" | "not_found" | "rate_limited" | "validation" | "unavailable";
export class GhError extends Error {
  constructor(
    readonly kind: GhErrorKind,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(kind);
  }
}
export interface GhResponse {
  status: number;
  headers: Headers;
  json: unknown;
}
export type GhTransport = (method: "GET" | "POST" | "PATCH" | "DELETE", path: string, token: string, body?: unknown) => Promise<GhResponse>;

/** Fixed origin, no redirects, bounded time and size. Errors are mapped to fixed categories; bodies are never echoed. */
export const fetchTransport =
  (fetcher: typeof fetch = fetch): GhTransport =>
  async (method, path, token, body) => {
    if (!path.startsWith("/") || path.includes("..") || path.includes("//")) throw new GhError("validation", 400);
    let response: Response;
    try {
      response = await fetcher("https://api.github.com" + path, {
        method,
        headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new GhError("unavailable", 0);
    }
    let json: unknown = null;
    const text = await response.text().catch(() => "");
    if (text.length > 2_000_000) throw new GhError("unavailable", response.status);
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (response.ok) return { status: response.status, headers: response.headers, json };
    const retry = Number(response.headers.get("retry-after")),
      reset = Number(response.headers.get("x-ratelimit-reset"));
    const wait = Number.isFinite(retry) && retry > 0 ? retry * 1000 : Number.isFinite(reset) && reset > 0 ? Math.max(1000, reset * 1000 - Date.now()) : 60000;
    if (response.status === 429 || (response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")))) throw new GhError("rate_limited", response.status, Math.min(wait, 3600000));
    if (response.status === 401) throw new GhError("unauthorized", 401);
    if (response.status === 403) throw new GhError("permission_denied", 403);
    if (response.status === 404) throw new GhError("not_found", 404);
    if (response.status === 409 || response.status === 422) throw new GhError("validation", response.status);
    throw new GhError("unavailable", response.status);
  };

export interface InstallationAccess {
  token: string;
  expiresAt: number;
  permissions: Record<string, string>;
  repositorySelection: string;
}
/** Mints a repository-scoped installation token. Never a personal token: only the GitHub App can write Check Runs. */
export type InstallationTokens = (installationId: number, repositoryId: string, permissions: Record<string, "read" | "write">) => Promise<InstallationAccess>;

/** `jwt` is the App JWT (see appJwt in src/lib/auth/github.ts); injected so this module never reads the private key. */
export function installationTokens(transport: GhTransport, jwt: () => string): InstallationTokens {
  return async (installationId, repositoryId, permissions) => {
    if (!Number.isSafeInteger(installationId) || installationId < 1 || !/^[1-9]\d{0,15}$/.test(repositoryId)) throw new GhError("validation", 400);
    let r: GhResponse;
    try {
      r = await transport("POST", `/app/installations/${installationId}/access_tokens`, jwt(), { repository_ids: [Number(repositoryId)], permissions });
    } catch (e) {
      // GitHub answers 422 when the App was not granted a requested permission; 404 when the installation is gone.
      if (e instanceof GhError && e.kind === "validation") throw new GhError("permission_denied", 422);
      throw e;
    }
    const j = r.json as { token?: unknown; expires_at?: unknown; permissions?: Record<string, string>; repository_selection?: string } | null;
    if (!j || typeof j.token !== "string" || typeof j.expires_at !== "string" || !Number.isFinite(Date.parse(j.expires_at))) throw new GhError("unavailable", 502);
    return { token: j.token, expiresAt: Date.parse(j.expires_at), permissions: j.permissions ?? {}, repositorySelection: j.repository_selection ?? "" };
  };
}
export const revokeToken = (transport: GhTransport, token: string) => transport("DELETE", "/installation/token", token).then(() => undefined, () => undefined);
