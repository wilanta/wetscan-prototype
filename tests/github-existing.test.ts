import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
import {
  newSession,
  getSession,
  profileFor,
  saveSession,
} from "../src/lib/auth/session";
import { authRoute } from "../src/lib/auth/http";
import { writeRecord } from "../src/lib/auth/store";
import {
  discoverInstallations,
  githubRequest,
  startFlow,
} from "../src/lib/auth/github";
import { GET as callback } from "../src/app/api/auth/github/callback/route";
import { POST as start } from "../src/app/api/auth/github/start/route";
import { GET as progress } from "../src/app/api/onboarding/route";
import type { Profile } from "../src/lib/auth/types";
const origin = "http://localhost:3110";
const permissions = { metadata: "read", contents: "read" };
const installation = (
  id = 77,
  app_id = 123,
  suspended_at: string | null = null,
) => ({
  id,
  app_id,
  suspended_at,
  account: { login: "team-" + id },
  permissions,
});
let directory: string;
let identity = 9000;
let listed = [installation()];
let appId = 123;
let suspended = false;
let deniedId = 0;
let fetcher: ReturnType<typeof vi.fn>;
function req(
  path: string,
  token?: string,
  data?: unknown,
  requestOrigin = origin,
) {
  return new NextRequest(origin + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      ...(token ? { cookie: "wetscan_session=" + token } : {}),
      ...(data === undefined
        ? {}
        : { origin: requestOrigin, "content-type": "application/json" }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
function json(value: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(value), { status, headers });
}
function cookie(response: Response) {
  return /wetscan_session=([a-f0-9]{64})/.exec(
    response.headers.get("set-cookie") ?? "",
  )![1];
}
async function created(signedIn = false, stored = false) {
  const value = await newSession({
    workspace: "Existing workspace",
    expiresAt: Date.now() + 600000,
    ...(signedIn ? { githubId: identity, userToken: "fixture-user" } : {}),
  });
  if (signedIn) {
    const profile: Profile = {
      githubId: identity,
      login: "fixture",
      workspace: "Existing workspace",
      repositories: [],
      email: "",
      securityNotifications: true,
      productUpdates: false,
      ...(stored ? { installationId: 77 } : {}),
    };
    await writeRecord("user-" + identity, profile);
  }
  return value;
}
async function authorize(token: string) {
  const flow = (await getSession(token))!.flow!;
  return callback(
    req(
      "/api/auth/github/callback?" +
        new URLSearchParams({ code: "fixture-code", state: flow.state }),
      token,
    ),
  );
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "wetscan-existing-test-"));
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("AUTH_DATA_DIR", directory);
  vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("hex"));
  vi.stubEnv("GITHUB_APP_ID", "123");
  vi.stubEnv("GITHUB_APP_SLUG", "test-app");
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "fixture-client");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "fixture-only");
  vi.stubEnv(
    "GITHUB_APP_PRIVATE_KEY",
    generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString(),
  );
});
beforeEach(() => {
  identity++;
  listed = [installation()];
  appId = 123;
  suspended = false;
  deniedId = 0;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/app")
      return json({
        id: 123,
        slug: "test-app",
        client_id: "fixture-client",
        permissions,
      });
    if (url.pathname === "/login/oauth/access_token")
      return json({ access_token: "fixture-user", expires_in: 28800 });
    if (url.pathname === "/user")
      return json({ id: identity, login: "fixture" });
    if (url.pathname === "/user/installations")
      return json({
        installations: url.searchParams.get("page") === "1" ? listed : [],
      });
    const match = /^\/app\/installations\/(\d+)$/.exec(url.pathname);
    if (match)
      return Number(match[1]) === deniedId
        ? json({}, 404)
        : json({
            ...installation(Number(match[1]), appId),
            suspended_at: suspended ? "2026-01-01" : null,
          });
    if (url.pathname.endsWith("/access_tokens")) {
      expect(JSON.parse(String(init?.body))).toEqual({ permissions });
      return json({ token: "fixture-installation" });
    }
    if (url.pathname.endsWith("/repositories"))
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
    if (url.pathname === "/installation/token")
      return new Response(null, { status: 204 });
    throw new Error("Unexpected fixture endpoint");
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  const target = resolve(directory);
  if (
    !basename(target).startsWith("wetscan-existing-test-") ||
    relative(resolve(tmpdir()), target).startsWith("..")
  )
    throw new Error("Unsafe test cleanup");
  await rm(target, { recursive: true, force: true });
});
describe("existing GitHub installations", () => {
  it("authorizes with PKCE, discovers one user installation and links it without visiting installation/new", async () => {
    const { token } = await created();
    const response = await start(
      req("/api/auth/github/start", token, { intent: "install" }),
    );
    const url = new URL((await response.json()).url);
    expect(url.pathname).toBe("/login/oauth/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const flow = (await getSession(token))!.flow!;
    const completed = await authorize(token);
    const rotated = cookie(completed);
    expect(completed.headers.get("location")).toBe(origin + "/onboarding");
    expect(await getSession(token)).toBeUndefined();
    expect((await getSession(rotated))!.flow).toBeUndefined();
    expect(
      await (await progress(req("/api/onboarding", rotated))).json(),
    ).toMatchObject({ step: "repositories", connected: true });
    const exchange = fetcher.mock.calls.find(([url]) =>
      String(url).includes("access_token"),
    )!;
    expect(JSON.parse(String(exchange[1]?.body)).code_verifier).toBe(
      flow.verifier,
    );
    expect(
      fetcher.mock.calls.some(
        ([url, init]) =>
          String(url).includes("/user/installations?") &&
          init?.headers.Authorization === "Bearer fixture-user",
      ),
    ).toBe(true);
    expect(
      JSON.stringify(
        await (await progress(req("/api/onboarding", rotated))).json(),
      ),
    ).not.toContain("fixture-user");
    const replay = await callback(
      req(
        "/api/auth/github/callback?code=fixture-code&state=" + flow.state,
        rotated,
      ),
    );
    expect(replay.headers.get("location")).toContain("invalid_state");
  });
  it("verifies a stored installation and current user without reinstalling or reauthorizing", async () => {
    const { token } = await created(true, true);
    const response = await start(
      req("/api/auth/github/start", token, { intent: "install" }),
    );
    expect(await response.json()).toEqual({ url: "/onboarding" });
    expect((await profileFor(await getSession(token)))!.installationId).toBe(
      77,
    );
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).endsWith("/app/installations/77"),
      ),
    ).toBe(true);
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).includes("/user/installations?"),
      ),
    ).toBe(true);
  });
  it("discovers installations with a valid existing OAuth session", async () => {
    const { token } = await created(true);
    expect(
      await (
        await start(req("/api/auth/github/start", token, { intent: "install" }))
      ).json(),
    ).toEqual({ url: "/onboarding" });
  });
  it("sends zero installations to a fresh installation flow, then verifies a new install through OAuth", async () => {
    listed = [];
    const { token } = await created();
    await start(req("/api/auth/github/start", token, { intent: "install" }));
    const oauth = (await getSession(token))!.flow!;
    const response = await authorize(token);
    const rotated = cookie(response);
    const install = new URL(response.headers.get("location")!);
    expect(install.origin + install.pathname).toBe(
      "https://github.com/apps/test-app/installations/new",
    );
    const flow = (await getSession(rotated))!.flow!;
    expect(flow.kind).toBe("install");
    expect(flow.state).not.toBe(oauth.state);
    listed = [installation()];
    const setup = await callback(
      req(
        "/api/auth/github/callback?" +
          new URLSearchParams({
            state: flow.state,
            installation_id: "77",
            setup_action: "install",
          }),
        rotated,
      ),
    );
    expect(new URL(setup.headers.get("location")!).pathname).toBe(
      "/login/oauth/authorize",
    );
    const completed = await authorize(rotated);
    expect(
      await (await progress(req("/api/onboarding", cookie(completed)))).json(),
    ).toMatchObject({ step: "repositories", connected: true });
  });
  it("persists multiple choices across reload and revalidates the selection", async () => {
    listed = [installation(), installation(78)];
    const { token } = await created();
    await start(req("/api/auth/github/start", token, { intent: "install" }));
    const completed = await authorize(token);
    const rotated = cookie(completed);
    const state = await (
      await progress(req("/api/onboarding", rotated))
    ).json();
    expect(state).toMatchObject({
      connected: false,
      step: "github",
      installations: [
        { id: 77, account: "team-77" },
        { id: 78, account: "team-78" },
      ],
    });
    expect((await getSession(rotated))!.flow).toBeUndefined();
    const response = await start(
      req("/api/auth/github/start", rotated, {
        intent: "select",
        installationId: 78,
      }),
    );
    expect(await response.json()).toEqual({ url: "/onboarding" });
    expect((await profileFor(await getSession(rotated)))!.installationId).toBe(
      78,
    );
    expect((await getSession(rotated))!.installationChoices).toBeUndefined();
  });
  it("completes an update callback for a previously connected profile and rechecks user access", async () => {
    const { token, session } = await created(true, true);
    startFlow(session, "install");
    await saveSession(token, session);
    const response = await callback(
      req(
        "/api/auth/github/callback?" +
          new URLSearchParams({
            state: session.flow!.state,
            installation_id: "77",
            setup_action: "update",
          }),
        token,
      ),
    );
    expect(new URL(response.headers.get("location")!).pathname).toBe(
      "/login/oauth/authorize",
    );
    const completed = await authorize(token);
    const rotated = cookie(completed);
    expect(
      await (await progress(req("/api/onboarding", rotated))).json(),
    ).toMatchObject({ step: "repositories", connected: true });
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).includes("/user/installations?"),
      ),
    ).toBe(true);
  });
  it("logs an internal repository failure without leaking exception values", async () => {
    const response = await authRoute(
      req("/api/onboarding/repositories?state=do-not-log"),
      async () => {
        throw Object.assign(new Error("token-secret-do-not-log"), {
          code: "EPERM",
        });
      },
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "server_error" });
    const logged = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logged).toContain("EPERM");
    expect(logged).toContain("repositories");
    expect(logged).not.toContain("do-not-log");
  });
  it("returns multiple choices from start for an already authenticated user", async () => {
    listed = [installation(), installation(78)];
    const { token } = await created(true);
    const response = await start(
      req("/api/auth/github/start", token, { intent: "install" }),
    );
    expect((await response.json()).installations).toHaveLength(2);
  });
  it.each(["foreign", "suspended", "removed", "inaccessible"])(
    "rejects a stored installation that is %s",
    async (kind) => {
      if (kind === "foreign") appId = 999;
      if (kind === "suspended") suspended = true;
      if (kind === "removed") deniedId = 77;
      if (kind === "inaccessible") listed = [];
      const { token } = await created(true, true);
      const response = await start(
        req("/api/auth/github/start", token, { intent: "install" }),
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "installation_denied" });
      expect(
        fetcher.mock.calls.some(([url]) =>
          String(url).endsWith("/access_tokens"),
        ),
      ).toBe(false);
    },
  );
  it.each([999, 0, -1, "77", 1.5, null])(
    "never trusts a client installation ID (%s)",
    async (id) => {
      const { token } = await created(true);
      const response = await start(
        req("/api/auth/github/start", token, {
          intent: "select",
          installationId: id,
        }),
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "installation_denied" });
      expect(
        (await profileFor(await getSession(token)))!.installationId,
      ).toBeUndefined();
    },
  );
  it("rejects a changed OAuth identity on the stored-session path", async () => {
    const { token } = await created(true, true);
    identity++;
    const response = await start(
      req("/api/auth/github/start", token, { intent: "install" }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "account_mismatch" });
  });
  it("requires same-origin mutations for installation selection", async () => {
    const { token } = await created(true);
    const response = await start(
      req(
        "/api/auth/github/start",
        token,
        { intent: "select", installationId: 77 },
        "https://evil.invalid",
      ),
    );
    expect(response.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("paginates and filters foreign and suspended discovery entries", async () => {
    const { session } = await created(true);
    listed = Array.from({ length: 100 }, (_, i) => installation(i + 1, 999));
    fetcher.mockImplementationOnce(async () => json({ installations: listed }));
    fetcher.mockImplementationOnce(async () =>
      json({
        installations: [
          installation(),
          installation(78, 123, "2026-01-01"),
          installation(79, 999),
        ],
      }),
    );
    expect(await discoverInstallations(session)).toEqual([
      { id: 77, account: "team-77" },
    ]);
    expect(String(fetcher.mock.calls[1][0])).toContain("page=2");
  });
  it("restarts OAuth for an expired stored user token without losing the installation ID", async () => {
    const { token, session } = await created(true, true);
    session.tokenExpiresAt = Date.now() - 1;
    await saveSession(token, session);
    const response = await start(
      req("/api/auth/github/start", token, { intent: "install" }),
    );
    expect(new URL((await response.json()).url).pathname).toBe(
      "/login/oauth/authorize",
    );
    expect((await getSession(token))!.flow).toMatchObject({
      kind: "connect",
      installationId: 77,
    });
  });
  it("rejects a forged setup callback on the OAuth discovery flow", async () => {
    const { token, session } = await created();
    startFlow(session, "connect");
    await saveSession(token, session);
    const response = await callback(
      req(
        "/api/auth/github/callback?code=fixture-code&installation_id=77&state=" +
          session.flow!.state,
        token,
      ),
    );
    expect(response.headers.get("location")).toContain("invalid_callback");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    [401, {}, "github_expired", 401],
    [403, {}, "github_denied", 403],
    [403, { "x-ratelimit-remaining": "0" }, "github_rate_limited", 429],
    [429, {}, "github_rate_limited", 429],
    [404, {}, "github_not_found", 404],
    [422, {}, "github_validation", 422],
    [500, {}, "github_unavailable", 502],
  ])(
    "maps upstream HTTP %s to a specific safe error",
    async (status, headers, code, mappedStatus) => {
      fetcher.mockResolvedValueOnce(
        json(
          { message: "do-not-log-provider-body" },
          status as number,
          headers as HeadersInit,
        ),
      );
      await expect(
        githubRequest("/user/installations", "fixture-user"),
      ).rejects.toMatchObject({ code, status: mappedStatus });
    },
  );
  it("distinguishes invalid App credentials from user authorization", async () => {
    fetcher.mockResolvedValueOnce(json({}, 401));
    await expect(githubRequest("/app", "fixture-only")).rejects.toMatchObject({
      code: "github_app_credentials",
      status: 503,
    });
  });
});
