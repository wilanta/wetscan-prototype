import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, relative } from "node:path";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
import { authConfig } from "../src/lib/auth/config";
import { seal, unseal, writeRecord, readRecord } from "../src/lib/auth/store";
import {
  getSession,
  newSession,
  profileFor,
  saveSession,
  sessionKey,
} from "../src/lib/auth/session";
import { accessibleRepositories, startFlow } from "../src/lib/auth/github";
import {
  POST as onboarding,
  GET as progress,
} from "../src/app/api/onboarding/route";
import { GET as repositories } from "../src/app/api/onboarding/repositories/route";
import { GET as callback } from "../src/app/api/auth/github/callback/route";
import { POST as logout } from "../src/app/api/auth/logout/route";
import { POST as start } from "../src/app/api/auth/github/start/route";
import { proxy } from "../src/proxy";
import type { Profile } from "../src/lib/auth/types";

const origin = "http://localhost:3107";
let directory: string;
let fixtureProfile: Profile;
function request(
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
function returnedCookie(response: Response) {
  return /wetscan_session=([a-f0-9]{64})/.exec(
    response.headers.get("set-cookie") ?? "",
  )?.[1];
}
function apiResult(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function mockGitHub(allowed = true) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/login/oauth/access_token"))
        return apiResult({
          access_token: "test-user-token",
          expires_in: 28800,
          refresh_token: "test-refresh-token",
        });
      if (url.endsWith("/app"))
        return apiResult({
          id: 123,
          slug: "test-only-app",
          client_id: "test-client",
          permissions: { metadata: "read", contents: "read" },
        });
      if (url.endsWith("/app/installations/77"))
        return apiResult({
          id: 77,
          app_id: 123,
          suspended_at: null,
          permissions: { metadata: "read", contents: "read" },
        });
      if (url.endsWith("/user"))
        return apiResult({ id: 42, login: "test-user" });
      if (url.includes("/user/installations?"))
        return apiResult({
          installations: allowed
            ? [{ id: 77, app_id: 123, suspended_at: null }]
            : [],
        });
      if (url.endsWith("/app/installations/77/access_tokens"))
        return apiResult({ token: "test-installation-token" });
      if (url.endsWith("/installation/token"))
        return new Response(null, { status: 204 });
      if (url.includes("/user/installations/77/repositories?"))
        return apiResult({
          repositories: [
            {
              id: 1,
              full_name: "test/private",
              private: true,
              default_branch: "main",
            },
          ],
        });
      if (url.includes("/installation/repositories?"))
        return apiResult({
          repositories: [
            {
              id: 1,
              full_name: "test/private",
              private: true,
              default_branch: "main",
            },
            {
              id: 2,
              full_name: "other/hidden",
              private: true,
              default_branch: "main",
            },
          ],
        });
      throw new Error("Unexpected test URL: " + url);
    }),
  );
  return calls;
}
async function signedIn() {
  const created = await newSession({
    workspace: "WetScan Test",
    githubId: 42,
    userToken: "test-user-token",
    expiresAt: Date.now() + 600000,
  });
  await writeRecord("user-42", fixtureProfile);
  return created;
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "wetscan-auth-test-"));
  const key = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("hex"));
  vi.stubEnv("AUTH_DATA_DIR", directory);
  vi.stubEnv("GITHUB_APP_ID", "123");
  vi.stubEnv("GITHUB_APP_SLUG", "test-only-app");
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "test-client");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", key);
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  vi.unstubAllEnvs();
  const target = resolve(directory);
  if (
    !basename(target).startsWith("wetscan-auth-test-") ||
    relative(resolve(tmpdir()), target).startsWith("..")
  )
    throw new Error("Unsafe test cleanup target");
  await rm(target, { recursive: true, force: true });
});
describe("server auth and onboarding security", () => {
  beforeAll(() => {
    fixtureProfile = {
      githubId: 42,
      login: "test-user",
      workspace: "WetScan Test",
      installationId: 77,
      repositories: [],
      email: "",
      securityNotifications: true,
      productUpdates: false,
    };
  });
  it("encrypts records, authenticates ciphertext and binds it to its record ID", async () => {
    const encrypted = seal({ secret: "fixture-token" }, "user-42");
    expect(encrypted.toString()).not.toContain("fixture-token");
    expect(unseal(encrypted, "user-42")).toEqual({ secret: "fixture-token" });
    expect(() => unseal(encrypted, "user-43")).toThrow();
    encrypted[30] ^= 1;
    expect(() => unseal(encrypted, "user-42")).toThrow();
    await writeRecord("user-42", fixtureProfile);
    expect(
      (await readFile(join(directory, "user-42.bin"))).toString(),
    ).not.toContain("test-user");
    expect(await readRecord("user-42")).toEqual(fixtureProfile);
  });
  it("rejects public/project-local auth storage", () => {
    vi.stubEnv("AUTH_DATA_DIR", join(process.cwd(), "public", "auth"));
    expect(authConfig).toThrow();
    vi.stubEnv("AUTH_DATA_DIR", directory);
  });
  it("requires exact Origin and refuses malformed JSON values", async () => {
    const crossSite = await onboarding(
      request(
        "/api/onboarding",
        undefined,
        { action: "workspace", workspace: "x" },
        "https://evil.invalid",
      ),
    );
    expect(crossSite.status).toBe(403);
    expect(
      (await onboarding(request("/api/onboarding", undefined, null))).status,
    ).toBe(400);
    expect(
      (await onboarding(request("/api/onboarding", undefined, []))).status,
    ).toBe(400);
  });
  it("persists anonymous workspace progress and uses opaque HttpOnly cookies", async () => {
    const response = await onboarding(
      request("/api/onboarding", undefined, {
        action: "workspace",
        workspace: "My Workspace",
      }),
    );
    const token = returnedCookie(response)!;
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    const resumed = await progress(request("/api/onboarding", token));
    expect(await resumed.json()).toMatchObject({
      step: "github",
      authenticated: false,
      profile: { workspace: "My Workspace" },
    });
    expect(
      JSON.stringify(
        await (await progress(request("/api/onboarding", token))).json(),
      ),
    ).not.toContain("userToken");
  });
  it("protects deep dashboard routes, incomplete onboarding, and account routes", async () => {
    expect(
      (await proxy(request("/app/projects/orderly-demo/canvas"))).headers.get(
        "location",
      ),
    ).toBe(origin + "/login");
    const { token } = await signedIn();
    expect((await proxy(request("/app", token))).headers.get("location")).toBe(
      origin + "/onboarding",
    );
    expect((await proxy(request("/account", token))).status).toBe(200);
    await writeRecord("user-42", {
      ...fixtureProfile,
      completedAt: new Date().toISOString(),
    });
    expect(
      (await proxy(request("/app/projects/orderly-demo/canvas", token))).status,
    ).toBe(200);
  });
  it("starts OAuth discovery before installation and resumes saved workspace", async () => {
    mockGitHub();
    const { token } = await newSession({
      workspace: "Test",
      expiresAt: Date.now() + 600000,
    });
    const response = await start(
      request("/api/auth/github/start", token, { intent: "install" }),
    );
    const url = new URL((await response.json()).url);
    expect(url.origin + url.pathname).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(url.searchParams.get("state")).toHaveLength(64);
    expect((await getSession(token))?.flow?.kind).toBe("connect");
  });
  it("requires valid state, expires flows, and consumes cancelled callbacks", async () => {
    const { token, session } = await newSession();
    startFlow(session, "install");
    await saveSession(token, session);
    const state = session.flow!.state;
    let response = await callback(
      request(
        "/api/auth/github/callback?state=" +
          "0".repeat(64) +
          "&installation_id=77",
        token,
      ),
    );
    expect(response.headers.get("location")).toContain("invalid_state");
    response = await callback(
      request(
        "/api/auth/github/callback?state=" + state + "&error=access_denied",
        token,
      ),
    );
    expect(response.headers.get("location")).toContain("github_cancelled");
    expect((await getSession(token))?.flow).toBeUndefined();
    startFlow(session, "login");
    session.flow!.expiresAt = Date.now() - 1;
    await saveSession(token, session);
    expect(
      (
        await callback(
          request(
            "/api/auth/github/callback?state=" + session.flow!.state,
            token,
          ),
        )
      ).headers.get("location"),
    ).toContain("invalid_state");
  });
  it("uses separate PKCE user authorization after setup, never trusting installation_id alone", async () => {
    mockGitHub();
    const { token, session } = await newSession({
      workspace: "Test",
      expiresAt: Date.now() + 600000,
    });
    startFlow(session, "install");
    await saveSession(token, session);
    const response = await callback(
      request(
        "/api/auth/github/callback?state=" +
          session.flow!.state +
          "&installation_id=77",
        token,
      ),
    );
    const url = new URL(response.headers.get("location")!);
    expect(url.pathname).toBe("/login/oauth/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect((await getSession(token))?.flow).toMatchObject({
      kind: "verify",
      installationId: 77,
    });
    expect((await getSession(token))?.githubId).toBeUndefined();
  });
  it("rejects installations inaccessible to the signed-in user before minting a token", async () => {
    const calls = mockGitHub(false);
    const { session } = await signedIn();
    await expect(accessibleRepositories(session, 77)).rejects.toMatchObject({
      code: "installation_denied",
    });
    expect(calls.some((url) => url.endsWith("/access_tokens"))).toBe(false);
  });
  it("intersects real API grants and keeps GitHub tokens out of API responses", async () => {
    const calls = mockGitHub();
    const { token } = await signedIn();
    const response = await repositories(
      request("/api/onboarding/repositories", token),
    );
    const payload = await response.json();
    expect(payload.repositories).toEqual([
      { id: 1, fullName: "test/private", private: true, defaultBranch: "main" },
    ]);
    expect(JSON.stringify(payload)).not.toContain("token");
    expect(calls.some((url) => url.endsWith("/installation/token"))).toBe(true);
    expect(
      (await repositories(request("/api/onboarding/repositories"))).status,
    ).toBe(401);
  });
  it("rejects forged repository IDs and completion without repository selection", async () => {
    mockGitHub();
    const { token } = await signedIn();
    expect(
      (
        await onboarding(
          request("/api/onboarding", token, {
            action: "repositories",
            repositoryIds: [2],
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await onboarding(
          request("/api/onboarding", token, {
            action: "complete",
            email: "test@example.invalid",
            securityNotifications: true,
            productUpdates: false,
          }),
        )
      ).status,
    ).toBe(400);
  });
  it("saves account drafts, completes onboarding, and skips it on returning login", async () => {
    mockGitHub();
    const { token, session } = await signedIn();
    expect(
      (
        await onboarding(
          request("/api/onboarding", token, {
            action: "repositories",
            repositoryIds: [1],
          }),
        )
      ).status,
    ).toBe(200);
    const account = {
      email: "test@example.invalid",
      securityNotifications: false,
      productUpdates: true,
    };
    await onboarding(
      request("/api/onboarding", token, { action: "account", ...account }),
    );
    expect(
      await (await progress(request("/api/onboarding", token))).json(),
    ).toMatchObject({ step: "account", profile: account });
    await onboarding(
      request("/api/onboarding", token, { action: "complete", ...account }),
    );
    expect((await profileFor(session))?.completedAt).toBeTruthy();
    startFlow(session, "login");
    await saveSession(token, session);
    const state = session.flow!.state;
    const result = await callback(
      request(
        "/api/auth/github/callback?state=" + state + "&code=test-code",
        token,
      ),
    );
    expect(result.headers.get("location")).toBe(origin + "/app");
    const rotated = returnedCookie(result)!;
    expect(rotated).not.toBe(token);
    expect(await getSession(token)).toBeUndefined();
    expect((await getSession(rotated))?.githubId).toBe(42);
    expect(
      (
        await callback(
          request(
            "/api/auth/github/callback?state=" + state + "&code=test-code",
            rotated,
          ),
        )
      ).headers.get("location"),
    ).toContain("invalid_state");
  });
  it("refreshes expired user tokens only on the server", async () => {
    const calls = mockGitHub();
    const { token, session } = await signedIn();
    session.tokenExpiresAt = Date.now() - 1000;
    session.refreshToken = "test-refresh-token";
    await saveSession(token, session);
    expect(
      (await repositories(request("/api/onboarding/repositories", token)))
        .status,
    ).toBe(200);
    expect(calls.some((url) => url.endsWith("/login/oauth/access_token"))).toBe(
      true,
    );
    expect((await getSession(token))?.tokenExpiresAt).toBeGreaterThan(
      Date.now(),
    );
  });
  it("invalidates session records on logout and leaves completed account progress durable", async () => {
    const { token, session } = await signedIn();
    await writeRecord("user-42", {
      ...fixtureProfile,
      completedAt: new Date().toISOString(),
    });
    const response = await logout(
      new NextRequest(origin + "/api/auth/logout", {
        method: "POST",
        headers: { origin, cookie: "wetscan_session=" + token },
      }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await getSession(token)).toBeUndefined();
    expect((await profileFor(session))?.completedAt).toBeTruthy();
  });
  it("fails closed for expired sessions and tampered server records", async () => {
    const { token, session } = await newSession();
    session.expiresAt = Date.now() - 1;
    await saveSession(token, session);
    expect(await getSession(token)).toBeUndefined();
    expect(await readRecord(sessionKey(token))).toBeUndefined();
    expect(await getSession("../escape")).toBeUndefined();
  });
});
