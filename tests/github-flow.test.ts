import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, relative } from "node:path";
import { NextRequest, NextResponse } from "next/server";
vi.mock("server-only", () => ({}));
import {
  newSession,
  getSession,
  saveSession,
  setSessionCookie,
} from "../src/lib/auth/session";
import { startFlow } from "../src/lib/auth/github";
import { GET as callback } from "../src/app/api/auth/github/callback/route";
import { POST as start } from "../src/app/api/auth/github/start/route";
import { GET as progress } from "../src/app/api/onboarding/route";

const origin = "http://localhost:3107";
let directory: string;
const permissions = { metadata: "read", contents: "read" };
function req(path: string, token?: string, data?: unknown) {
  return new NextRequest(origin + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      ...(token ? { cookie: "wetscan_session=" + token } : {}),
      ...(data === undefined
        ? {}
        : { origin, "content-type": "application/json" }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
function cookie(response: Response) {
  return /wetscan_session=([a-f0-9]{64})/.exec(
    response.headers.get("set-cookie") ?? "",
  )?.[1];
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status });
}
function github(
  options: {
    slug?: string;
    installationAppId?: number;
    suspended?: boolean;
    contents?: string;
    upstreamError?: boolean;
  } = {},
) {
  const fetcher = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const granted = { ...permissions, contents: options.contents ?? "read" };
      if (options.upstreamError)
        throw new Error("upstream-code-cookie-token-secret-do-not-log");
      if (url.endsWith("/app"))
        return json({
          id: 123,
          slug: options.slug ?? "test-only-app",
          client_id: "test-client",
          permissions: granted,
        });
      if (url.endsWith("/app/installations/77"))
        return json({
          id: 77,
          app_id: options.installationAppId ?? 123,
          suspended_at: options.suspended ? "2026-01-01" : null,
          permissions: granted,
        });
      if (url.includes("/login/oauth/access_token"))
        return json({
          access_token: "fixture-user-token",
          expires_in: 28800,
          refresh_token: "fixture-refresh-token",
        });
      if (url.endsWith("/user"))
        return json({ id: 7001, login: "fixture-user" });
      if (url.includes("/user/installations?"))
        return json({
          installations: [{ id: 77, app_id: 123, suspended_at: null }],
        });
      if (url.endsWith("/access_tokens")) {
        expect(JSON.parse(String(init?.body))).toEqual({
          permissions: { metadata: "read", contents: "read" },
        });
        return json({ token: "fixture-installation-token" });
      }
      if (url.endsWith("/installation/token"))
        return new Response(null, { status: 204 });
      if (url.includes("/repositories?"))
        return json({
          repositories: [
            {
              id: 1,
              full_name: "fixture/private",
              private: true,
              default_branch: "main",
            },
          ],
        });
      throw new Error("Unexpected fixture request");
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
async function installationFlow() {
  const created = await newSession({
    workspace: "Regression Workspace",
    expiresAt: Date.now() + 5000,
  });
  startFlow(created.session, "install");
  await saveSession(created.token, created.session);
  return created;
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "wetscan-github-test-"));
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("AUTH_DATA_DIR", directory);
  vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("hex"));
  vi.stubEnv("GITHUB_APP_ID", "123");
  vi.stubEnv("GITHUB_APP_SLUG", "test-only-app");
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "test-client");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "fixture-only-secret");
  vi.stubEnv(
    "GITHUB_APP_PRIVATE_KEY",
    generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString(),
  );
});
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  const target = resolve(directory);
  if (
    !basename(target).startsWith("wetscan-github-test-") ||
    relative(resolve(tmpdir()), target).startsWith("..")
  )
    throw new Error("Unsafe fixture cleanup");
  await rm(target, { recursive: true, force: true });
});

describe("GitHub installation and OAuth regression", () => {
  it("checks the registered app before OAuth discovery and preserves installation URL generation", async () => {
    const fetcher = github();
    const { token } = await newSession({
      workspace: "Test",
      expiresAt: Date.now() + 5000,
    });
    const response = await start(
      req("/api/auth/github/start", token, { intent: "install" }),
    );
    const location = new URL((await response.json()).url);
    expect(location.pathname).toBe("/login/oauth/authorize");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    const session = (await getSession(token))!;
    expect(location.searchParams.get("state")).toBe(session.flow!.state);
    expect(session.expiresAt).toBeGreaterThanOrEqual(session.flow!.expiresAt);
    expect(
      fetcher.mock.calls.some(([url]) => String(url).endsWith("/app")),
    ).toBe(true);
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    const installation = new URL(startFlow(session, "install"));
    expect(installation.origin + installation.pathname).toBe(
      "https://github.com/apps/test-only-app/installations/new",
    );
    expect(installation.searchParams.get("state")).toBe(session.flow!.state);
  });
  it("rejects a mismatched slug before users can install the wrong app", async () => {
    github({ slug: "different-app" });
    const { token } = await newSession({
      workspace: "Test",
      expiresAt: Date.now() + 600000,
    });
    const response = await start(
      req("/api/auth/github/start", token, { intent: "install" }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "github_app_mismatch" });
    expect((await getSession(token))?.flow).toBeUndefined();
  });
  it.each(["install", "update"])(
    "validates setup_action=%s and refreshes cookie before separate OAuth",
    async (action) => {
      const fetcher = github();
      const { token, session } = await installationFlow();
      const installationState = session.flow!.state;
      const response = await callback(
        req(
          "/api/auth/github/callback?installation_id=77&setup_action=" +
            action +
            "&state=" +
            installationState,
          token,
        ),
      );
      const url = new URL(response.headers.get("location")!);
      expect(url.origin + url.pathname).toBe(
        "https://github.com/login/oauth/authorize",
      );
      expect(url.searchParams.get("redirect_uri")).toBe(
        origin + "/api/auth/github/callback",
      );
      expect(url.searchParams.get("state")).not.toBe(installationState);
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("code_challenge")).toHaveLength(43);
      expect(cookie(response)).toBe(token);
      const resumed = (await getSession(token))!;
      expect(resumed.flow).toMatchObject({
        kind: "verify",
        installationId: 77,
      });
      expect(resumed.expiresAt).toBeGreaterThanOrEqual(resumed.flow!.expiresAt);
      expect(
        fetcher.mock.calls.some(([url]) =>
          String(url).endsWith("/app/installations/77"),
        ),
      ).toBe(true);
      expect(
        fetcher.mock.calls.some(([url]) =>
          String(url).includes("/login/oauth/access_token"),
        ),
      ).toBe(false);
    },
  );
  it("continues installation through OAuth identity to repository selection without a GitHub App redirect loop", async () => {
    const fetcher = github();
    const { token, session } = await installationFlow();
    const setup = await callback(
      req(
        "/api/auth/github/callback?installation_id=77&setup_action=install&state=" +
          session.flow!.state,
        token,
      ),
    );
    const authorization = new URL(setup.headers.get("location")!);
    const oauthFlow = (await getSession(token))!.flow!;
    const completed = await callback(
      req(
        "/api/auth/github/callback?code=fixture-code&state=" +
          authorization.searchParams.get("state"),
        token,
      ),
    );
    expect(completed.headers.get("location")).toBe(origin + "/onboarding");
    const rotated = cookie(completed)!;
    expect(rotated).not.toBe(token);
    expect(await getSession(token)).toBeUndefined();
    expect(
      await (await progress(req("/api/onboarding", rotated))).json(),
    ).toMatchObject({
      authenticated: true,
      connected: true,
      step: "repositories",
      profile: { workspace: "Regression Workspace", login: "fixture-user" },
    });
    const exchange = fetcher.mock.calls.find(([url]) =>
      String(url).includes("/login/oauth/access_token"),
    )!;
    expect(JSON.parse(String(exchange[1]?.body))).toMatchObject({
      code: "fixture-code",
      code_verifier: oauthFlow.verifier,
      redirect_uri: origin + "/api/auth/github/callback",
    });
    expect((await getSession(rotated))!.flow).toBeUndefined();
    expect(
      (
        await callback(
          req(
            "/api/auth/github/callback?code=fixture-code&state=" +
              oauthFlow.state,
            rotated,
          ),
        )
      ).headers.get("location"),
    ).toContain("invalid_state");
  });
  it.each([{ installationAppId: 999 }, { suspended: true }])(
    "rejects foreign or suspended installations before OAuth (%j)",
    async (options) => {
      github(options);
      const { token, session } = await installationFlow();
      const response = await callback(
        req(
          "/api/auth/github/callback?installation_id=77&setup_action=install&state=" +
            session.flow!.state,
          token,
        ),
      );
      expect(response.headers.get("location")).toBe(
        origin + "/onboarding?error=installation_denied",
      );
      expect((await getSession(token))!.flow).toBeUndefined();
    },
  );
  it("reports missing Contents permission instead of claiming successful integration", async () => {
    github({ contents: "none" });
    const { token, session } = await installationFlow();
    const response = await callback(
      req(
        "/api/auth/github/callback?installation_id=77&state=" +
          session.flow!.state,
        token,
      ),
    );
    expect(response.headers.get("location")).toContain(
      "error=github_permissions",
    );
  });
  it("reports incompatible OAuth-on-install configuration instead of discarding the code and looping", async () => {
    github();
    const { token, session } = await installationFlow();
    const response = await callback(
      req(
        "/api/auth/github/callback?code=fixture-code&installation_id=77&state=" +
          session.flow!.state,
        token,
      ),
    );
    expect(response.headers.get("location")).toBe(
      origin + "/onboarding?error=github_setup_misconfigured",
    );
  });
  it.each([
    "installation_id=0",
    "installation_id=77bad",
    "installation_id=77&setup_action=other",
    "installation_id=77&state=duplicate",
  ])("rejects malformed setup callbacks (%s)", async (parameters) => {
    const fetcher = github();
    const { token, session } = await installationFlow();
    const response = await callback(
      req(
        "/api/auth/github/callback?" +
          parameters +
          "&state=" +
          session.flow!.state,
        token,
      ),
    );
    expect(response.headers.get("location")).toMatch(
      /error=(installation_denied|invalid_callback)/,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps a valid flow when a cookie-less callback arrives and logs no query values", async () => {
    const { token, session } = await installationFlow();
    const response = await callback(
      req(
        "/api/auth/github/callback?installation_id=77&code=secret-code-do-not-log&state=" +
          session.flow!.state,
      ),
    );
    expect(response.headers.get("location")).toContain("invalid_state");
    expect((await getSession(token))!.flow?.state).toBe(session.flow!.state);
    const logged = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logged).toContain('"cookiePresent":false');
    for (const sensitive of [
      session.flow!.state,
      token,
      "secret-code-do-not-log",
    ])
      expect(logged).not.toContain(sensitive);
  });
  it("sanitizes upstream exceptions in callback logs and redirects", async () => {
    github({ upstreamError: true });
    const { token, session } = await installationFlow();
    const response = await callback(
      req(
        "/api/auth/github/callback?installation_id=77&state=" +
          session.flow!.state,
        token,
      ),
    );
    expect(response.headers.get("location")).toBe(
      origin + "/onboarding?error=github_unavailable",
    );
    const logged = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logged).toContain('"stage":"installation"');
    expect(logged).not.toContain(
      "upstream-code-cookie-token-secret-do-not-log",
    );
    expect(logged).not.toContain(session.flow!.state);
  });
  it("uses a Secure, host-only, HttpOnly, Lax cookie for HTTPS callbacks", () => {
    vi.stubEnv("APP_URL", "https://wetscan.example");
    try {
      const response = NextResponse.json({});
      setSessionCookie(response, "f".repeat(64));
      const value = response.headers.get("set-cookie")!;
      expect(value).toContain("Secure");
      expect(value).toContain("HttpOnly");
      expect(value).toContain("SameSite=lax");
      expect(value).not.toContain("Domain=");
    } finally {
      vi.stubEnv("APP_URL", origin);
    }
  });
});
