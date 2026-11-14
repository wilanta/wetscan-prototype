import "server-only";
import {
  createHash,
  createPrivateKey,
  randomBytes,
  sign,
  timingSafeEqual,
} from "node:crypto";
import { AuthError, githubCallbackUrl, githubConfig } from "./config";
import type { InstallationChoice, Profile, Repository, Session } from "./types";

type GitHubRepository = {
  id: number;
  full_name: string;
  private: boolean;
  default_branch: string;
};
type Installation = {
  id: number;
  app_id: number;
  account?: { login?: string };
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
function githubHttpError(response: Response, app = false) {
  if (response.status === 401)
    return new AuthError(
      app ? "github_app_credentials" : "github_expired",
      app ? 503 : 401,
    );
  if (
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.get("x-ratelimit-remaining") === "0" ||
        response.headers.has("retry-after")))
  )
    return new AuthError("github_rate_limited", 429);
  if (response.status === 403) return new AuthError("github_denied", 403);
  if (response.status === 404) return new AuthError("github_not_found", 404);
  if (response.status === 422) return new AuthError("github_validation", 422);
  if (response.status === 400)
    return new AuthError("github_invalid_request", 400);
  return new AuthError(
    response.status >= 500 ? "github_unavailable" : "github_response",
    502,
  );
}
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
  }).catch(() => {
    throw new AuthError("github_unavailable", 502);
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
  if (!response.ok) throw githubHttpError(response, path.startsWith("/app"));
  return response.json().catch(() => {
    throw new AuthError("github_response", 502);
  }) as Promise<T>;
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
  }).catch(() => {
    throw new AuthError("github_unavailable", 502);
  });
  if (!response.ok) throw githubHttpError(response);
  const result = (await response.json().catch(() => {
    throw new AuthError("github_response", 502);
  })) as TokenResponse;
  if (result.error === "incorrect_client_credentials")
    throw new AuthError("github_app_credentials", 503);
  if (result.error === "redirect_uri_mismatch")
    throw new AuthError("github_setup_misconfigured", 503);
  if (
    result.error === "bad_verification_code" ||
    result.error === "expired_token"
  )
    throw new AuthError("github_expired", 401);
  if (result.error || !result.access_token)
    throw new AuthError("github_oauth_error", 400);
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
  kind: NonNullable<Session["flow"]>["kind"],
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
  let keyFailure = "pem_decode_failed";
  try {
    const header =
      /^-----BEGIN (RSA PRIVATE KEY|PRIVATE KEY)-----(?:\n|$)/.exec(
        app.privateKey,
      );
    if (!header) {
      keyFailure = "missing_pem_header";
      throw new AuthError("github_app_key_invalid", 503);
    }
    if (!app.privateKey.endsWith("-----END " + header[1] + "-----")) {
      keyFailure = "missing_pem_footer";
      throw new AuthError("github_app_key_invalid", 503);
    }
    const key = createPrivateKey({ key: app.privateKey, format: "pem" });
    // RS256 requires an RSA private key; other key types can produce an
    // incompatible signature even when Node accepts the SHA-256 digest name.
    if (key.asymmetricKeyType !== "rsa") {
      keyFailure = "unsupported_key_type";
      throw new AuthError("github_app_key_invalid", 503);
    }
    return (
      unsigned +
      "." +
      sign("RSA-SHA256", Buffer.from(unsigned), key).toString("base64url")
    );
  } catch {
    // Fixed categories only; never include the key, decoder message or stack.
    console.warn(
      "[WetScan auth] GitHub App signing failed",
      JSON.stringify({
        reason: "github_app_key_invalid",
        detail: keyFailure,
      }),
    );
    throw new AuthError("github_app_key_invalid", 503);
  }
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

// A user token is required: App JWT enumeration alone does not prove user access.
export async function discoverInstallations(
  session: Session,
): Promise<InstallationChoice[]> {
  const token = await userToken(session);
  const choices = new Map<number, InstallationChoice>();
  for (let page = 1; ; page++) {
    const data = await githubRequest<{ installations: Installation[] }>(
      "/user/installations?per_page=100&page=" + page,
      token,
    );
    for (const item of data.installations) {
      if (
        Number.isSafeInteger(item.id) &&
        item.id > 0 &&
        String(item.app_id) === githubConfig().id &&
        !item.suspended_at
      ) {
        choices.set(item.id, {
          id: item.id,
          account: item.account?.login || "Installation " + item.id,
        });
      }
    }
    if (data.installations.length < 100) return [...choices.values()];
  }
}
export async function verifyIdentity(session: Session) {
  const identity = await githubRequest<{ id: number; login: string }>(
    "/user",
    await userToken(session),
  );
  if (!Number.isSafeInteger(identity.id) || identity.id < 1 || !identity.login)
    throw new AuthError("github_denied", 403);
  if (session.githubId && session.githubId !== identity.id)
    throw new AuthError("account_mismatch", 403);
  return identity;
}
export async function linkInstallation(
  session: Session,
  profile: Profile,
  installationId: number,
) {
  await verifyAppInstallation(installationId);
  // Also checks /user/installations and intersects app grants with user repositories.
  const repositories = await accessibleRepositories(session, installationId);
  profile.repositories =
    profile.installationId === installationId
      ? profile.repositories.filter((repo) =>
          repositories.some((available) => available.id === repo.id),
        )
      : [];
  profile.installationId = installationId;
  delete session.installationChoices;
  delete session.flow;
}
