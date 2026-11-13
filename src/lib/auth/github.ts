import "server-only";
import { createHash, randomBytes, sign, timingSafeEqual } from "node:crypto";
import { AuthError, githubCallbackUrl, githubConfig } from "./config";
import type { Repository, Session } from "./types";

type GitHubRepository = {
  id: number;
  full_name: string;
  private: boolean;
  default_branch: string;
};
type Installation = {
  id: number;
  app_id: number;
  suspended_at: string | null;
  permissions?: { metadata?: string; contents?: string };
};
function requireReadPermissions(permissions?: Installation["permissions"]) {
  if (
    !permissions ||
    !["read", "write"].includes(permissions.metadata ?? "") ||
    !["read", "write"].includes(permissions.contents ?? "")
  ) {
    throw new AuthError("github_permissions", 403);
  }
}
type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
};
export async function githubRequest<T>(
  path: string,
  token: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("https://api.github.com" + path, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    redirect: "error",
  });
  if (
    !response.ok &&
    response.status === 404 &&
    path.startsWith("/app/installations/")
  )
    throw new AuthError("installation_denied", 403);
  if (
    !response.ok &&
    response.status === 422 &&
    path.endsWith("/access_tokens")
  )
    throw new AuthError("github_permissions", 403);
  if (!response.ok)
    throw new AuthError(
      response.status === 401
        ? "github_expired"
        : response.status === 403 || response.status === 429
          ? "github_denied"
          : "github_unavailable",
      502,
    );
  return response.json() as Promise<T>;
}
async function tokenRequest(
  body: Record<string, string>,
): Promise<TokenResponse> {
  const app = githubConfig();
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      ...body,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    redirect: "error",
  });
  if (!response.ok) throw new AuthError("github_unavailable", 502);
  const result = (await response.json()) as TokenResponse;
  if (!result.access_token || result.error)
    throw new AuthError("github_expired", 401);
  return result;
}
function applyToken(session: Session, token: TokenResponse) {
  session.userToken = token.access_token;
  session.tokenExpiresAt = token.expires_in
    ? Date.now() + token.expires_in * 1000
    : undefined;
  session.refreshToken = token.refresh_token;
}
export async function exchangeCode(
  code: string,
  verifier: string,
  session: Session,
) {
  applyToken(
    session,
    await tokenRequest({
      code,
      code_verifier: verifier,
      redirect_uri: githubCallbackUrl(),
    }),
  );
}
export async function userToken(session: Session) {
  if (!session.userToken) throw new AuthError("unauthenticated", 401);
  if (session.tokenExpiresAt && session.tokenExpiresAt < Date.now() + 60000) {
    if (!session.refreshToken) throw new AuthError("github_expired", 401);
    applyToken(
      session,
      await tokenRequest({
        grant_type: "refresh_token",
        refresh_token: session.refreshToken,
      }),
    );
  }
  return session.userToken!;
}
export function validState(actual: string | null, expected: string) {
  if (
    !actual ||
    !/^[a-f0-9]{64}$/.test(actual) ||
    actual.length !== expected.length
  )
    return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
export function startFlow(
  session: Session,
  kind: "install" | "login" | "verify",
  installationId?: number,
) {
  const app = githubConfig();
  const state = randomBytes(32).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  session.flow = {
    state,
    kind,
    expiresAt: Date.now() + 10 * 60 * 1000,
    verifier,
    installationId,
  };
  // An active session must not expire while its freshly issued state is valid.
  session.expiresAt = Math.max(session.expiresAt, session.flow.expiresAt);
  if (kind === "install") {
    const installationUrl = new URL(
      "https://github.com/apps/" + app.slug + "/installations/new",
    );
    installationUrl.searchParams.set("state", state);
    // GitHub uses the App's configured Setup URL after installation, not redirect_uri.
    return installationUrl.toString();
  }
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: app.clientId,
    redirect_uri: githubCallbackUrl(),
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}
function appJwt() {
  const app = githubConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: app.id }),
  ).toString("base64url");
  const unsigned = header + "." + payload;
  return (
    unsigned +
    "." +
    sign("RSA-SHA256", Buffer.from(unsigned), app.privateKey).toString(
      "base64url",
    )
  );
}
export async function verifyAppConfiguration() {
  const app = githubConfig();
  const registered = await githubRequest<{
    id: number;
    slug: string;
    client_id: string;
    permissions: Installation["permissions"];
  }>("/app", appJwt());
  if (
    String(registered.id) !== app.id ||
    registered.slug !== app.slug ||
    registered.client_id !== app.clientId
  ) {
    throw new AuthError("github_app_mismatch", 503);
  }
  requireReadPermissions(registered.permissions);
}
export async function verifyAppInstallation(installationId: number) {
  if (!Number.isSafeInteger(installationId) || installationId < 1)
    throw new AuthError("installation_denied", 403);
  const installation = await githubRequest<Installation>(
    "/app/installations/" + installationId,
    appJwt(),
  );
  if (
    installation.id !== installationId ||
    String(installation.app_id) !== githubConfig().id ||
    installation.suspended_at
  ) {
    throw new AuthError("installation_denied", 403);
  }
  requireReadPermissions(installation.permissions);
}
export async function verifyInstallation(
  session: Session,
  installationId: number,
) {
  const token = await userToken(session);
  // Installation IDs are untrusted callback input. Verify user membership first.
  for (let page = 1; ; page++) {
    const data = await githubRequest<{ installations: Installation[] }>(
      "/user/installations?per_page=100&page=" + page,
      token,
    );
    const installation = data.installations.find(
      (item) =>
        item.id === installationId &&
        String(item.app_id) === githubConfig().id &&
        !item.suspended_at,
    );
    if (installation) return;
    if (data.installations.length < 100)
      throw new AuthError("installation_denied", 403);
  }
}
async function repositoryPages(path: string, token: string) {
  const repositories: GitHubRepository[] = [];
  for (let page = 1; ; page++) {
    const data = await githubRequest<{ repositories: GitHubRepository[] }>(
      path + "?per_page=100&page=" + page,
      token,
    );
    repositories.push(...data.repositories);
    if (data.repositories.length < 100) return repositories;
  }
}
export async function accessibleRepositories(
  session: Session,
  installationId: number,
): Promise<Repository[]> {
  await verifyInstallation(session, installationId);
  const installation = await githubRequest<{ token: string }>(
    "/app/installations/" + installationId + "/access_tokens",
    appJwt(),
    "POST",
    { permissions: { metadata: "read", contents: "read" } },
  );
  // Intersect app grants with repositories the signed-in user can access.
  // Installation tokens never leave this function.
  try {
    const [appRepos, userRepos] = await Promise.all([
      repositoryPages("/installation/repositories", installation.token),
      repositoryPages(
        "/user/installations/" + installationId + "/repositories",
        await userToken(session),
      ),
    ]);
    const userIds = new Set(userRepos.map((repo) => repo.id));
    return appRepos
      .filter((repo) => userIds.has(repo.id))
      .map((repo) => ({
        id: repo.id,
        fullName: repo.full_name,
        private: repo.private,
        defaultBranch: repo.default_branch,
      }));
  } finally {
    await fetch("https://api.github.com/installation/token", {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + installation.token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    }).catch(() => undefined);
  }
}
