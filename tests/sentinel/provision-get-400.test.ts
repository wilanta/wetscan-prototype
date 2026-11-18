import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../src/features/sentinel/server/telemetry-runtime", () => ({
  telemetryStore: vi.fn(),
}));
vi.mock("../../src/lib/auth/github", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/auth/github")>()),
  verifyAppInstallation: vi.fn().mockResolvedValue(undefined),
}));
import { NextRequest } from "next/server";
import { detectionRoute } from "../../src/features/sentinel/server/detection-http";
import { DetectionStore } from "../../src/features/sentinel/detection/store";
import { telemetryStore } from "../../src/features/sentinel/server/telemetry-runtime";
import { getSession, newSession } from "../../src/lib/auth/session";
import { writeRecord } from "../../src/lib/auth/store";
import type { Session } from "../../src/lib/auth/types";

const projectId = "github-998736528";
const ruleId = "7ad1deb8-e555-44ec-be98-b7def574781d";

/**
 * Offline reproduction of the real provisioning GET through the real route,
 * session store, Canvas authorization and GitHub token-refresh code. Only the
 * GitHub network (global fetch), the app-installation JWT call and the DB store
 * are doubled. No DEV/TEST database, GitHub request or live HTTP socket is used.
 */
describe("provision authenticated GET - actual route reproduction (synthetic GitHub)", () => {
  let directory: string;
  const github: { refresh: () => Response; installations: () => Response } = {
    refresh: () => new Response("{}"),
    installations: () => new Response("{}"),
  };
  const calls: string[] = [];

  function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
  async function seed(overrides: Partial<Session>) {
    const { token } = await newSession({
      githubId: 7,
      workspace: "synthetic",
      expiresAt: Date.now() + 600_000,
      userToken: "synthetic-old-user-token",
      tokenExpiresAt: Date.now() + 3_600_000,
      refreshToken: "synthetic-old-refresh-token",
      ...overrides,
    });
    return token;
  }
  function get(token: string | undefined, query: string, headers = {}) {
    return new NextRequest(
      `http://localhost:3000/api/sentinel/projects/${projectId}/rules${query}`,
      {
        headers: {
          ...(token ? { cookie: `wetscan_session=${token}` } : {}),
          ...headers,
        },
      },
    );
  }
  const expired = { tokenExpiresAt: Date.now() - 1_000 };
  const validQuery = `?ruleId=${ruleId}`;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "wetscan-get400-"));
    vi.stubEnv("AUTH_DATA_DIR", directory);
    vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("hex"));
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("GITHUB_APP_ID", "123");
    vi.stubEnv("GITHUB_APP_SLUG", "synthetic-app");
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "synthetic-client");
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "synthetic-client-secret");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "synthetic-not-a-key");
    await writeRecord("user-7", {
      githubId: 7,
      login: "owner",
      workspace: "synthetic",
      completedAt: "2026-11-15T00:00:00Z",
      installationId: 77,
      repositories: [{ id: 998736528 }],
    });
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    const target = resolve(directory);
    if (
      !basename(target).startsWith("wetscan-get400-") ||
      relative(resolve(tmpdir()), target).startsWith("..")
    )
      throw new Error("Unsafe fixture cleanup");
    await rm(target, { recursive: true, force: true });
  });
  beforeEach(() => {
    calls.length = 0;
    github.refresh = () =>
      json({
        access_token: "synthetic-new-user-token",
        expires_in: 28_800,
        refresh_token: "synthetic-new-refresh-token",
      });
    github.installations = () =>
      json({ installations: [{ id: 77, app_id: 123, suspended_at: null }] });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input instanceof Request ? input.url : input);
        calls.push(new URL(url).pathname);
        if (url === "https://github.com/login/oauth/access_token")
          return github.refresh();
        if (url === "https://api.github.com/user")
          return json({ id: 7, login: "owner" });
        if (url === `https://api.github.com/repositories/998736528`)
          return json({
            id: 998736528,
            full_name: "owner/repo",
            default_branch: "main",
          });
        if (url.startsWith("https://api.github.com/user/installations"))
          return github.installations();
        throw new Error("unexpected_external_request");
      }),
    );
    vi.mocked(telemetryStore).mockReset().mockResolvedValue({
      db: {},
    } as Awaited<ReturnType<typeof telemetryStore>>);
    vi.spyOn(DetectionStore.prototype, "ruleDetails").mockResolvedValue({
      rule: { ruleId },
    } as never);
  });

  it("uses the exact endpoint, method and query from the runner and the route accepts it", async () => {
    const source = await readFile(
      resolve("scripts/sentinel-provision-auth.ps1"),
      "utf8",
    );
    const uri = /\$uri = '([^']+)'/.exec(source)?.[1];
    expect(uri).toBe(
      `http://localhost:3000/api/sentinel/projects/${projectId}/rules?ruleId=${ruleId}`,
    );
    const session = await seed({});
    const response = await detectionRoute(
      new NextRequest(uri!, { headers: { cookie: `wetscan_session=${session}` } }),
      projectId,
      "rules",
    );
    expect(response.status).toBe(200);
    expect(DetectionStore.prototype.ruleDetails).toHaveBeenCalledTimes(1);
    // A fresh token needs no refresh; the successful contain-rule run had this shape.
    expect(calls).not.toContain("/login/oauth/access_token");
  });

  it("GET does not depend on Origin: a foreign Origin or Host-like header cannot cause HTTP 400", async () => {
    const session = await seed({});
    for (const headers of [
      { origin: "https://evil.test" },
      { origin: "http://127.0.0.1:3000" },
      { "x-forwarded-host": "evil.test" },
    ]) {
      const r = await detectionRoute(get(session, validQuery, headers), projectId, "rules");
      expect(r.status).toBe(200);
    }
  });

  it.each([
    [`?ruleId=not-a-uuid`, "invalid_id"],
    [`?ruleId=${ruleId}&extra=1`, "invalid_query"],
    [`?ruleId=${ruleId}&ruleId=${ruleId}`, "invalid_query"],
    [`?other=${ruleId}`, "invalid_query"],
  ])("a malformed query %s is an application-level 400 (%s) - not the provisioning request", async (query, code) => {
    const session = await seed({});
    const r = await detectionRoute(get(session, query), projectId, "rules");
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: code });
  });

  it.each([
    ["missing cookie", undefined],
    ["unknown session", "a".repeat(64)],
    ["malformed cookie value", "invalid"],
  ])("%s is HTTP 401, never 400", async (_name, token) => {
    const r = await detectionRoute(get(token, validQuery), projectId, "rules");
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "unauthenticated" });
  });

  it("REPRODUCES HTTP 400 for a valid request: expired GitHub user token and a rejected refresh (HTTP 200 + OAuth error body)", async () => {
    github.refresh = () => json({ error: "bad_refresh_token" });
    const session = await seed(expired);
    const r = await detectionRoute(get(session, validQuery), projectId, "rules");
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "github_oauth_error" });
    expect(calls).toEqual(["/login/oauth/access_token"]);
    expect(telemetryStore).not.toHaveBeenCalled();
    expect((await getSession(session))?.refreshToken).toBe(
      "synthetic-old-refresh-token",
    );
  });

  it("REPRODUCES HTTP 400 for a valid request: GitHub answers the refresh with HTTP 400", async () => {
    github.refresh = () => json({ error: "bad_request" }, 400);
    const session = await seed(expired);
    const r = await detectionRoute(get(session, validQuery), projectId, "rules");
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "github_invalid_request" });
    expect(telemetryStore).not.toHaveBeenCalled();
  });

  it("a successful refresh authorizes the same request and persists the rotated refresh token", async () => {
    const session = await seed(expired);
    const r = await detectionRoute(get(session, validQuery), projectId, "rules");
    expect(r.status).toBe(200);
    expect(calls.filter((c) => c === "/login/oauth/access_token")).toHaveLength(1);
    const stored = await getSession(session);
    expect(stored?.refreshToken).toBe("synthetic-new-refresh-token");
    expect(stored?.userToken).toBe("synthetic-new-user-token");
  });

  it("DEMONSTRATES the single-use refresh hazard: refresh succeeds, a later GitHub step fails, nothing is persisted", async () => {
    github.installations = () => json({ error: "synthetic" }, 500);
    const session = await seed(expired);
    const r = await detectionRoute(get(session, validQuery), projectId, "rules");
    expect(r.status).toBe(502);
    // GitHub already rotated the refresh token, but the old one is still stored.
    expect(calls).toContain("/login/oauth/access_token");
    expect((await getSession(session))?.refreshToken).toBe(
      "synthetic-old-refresh-token",
    );
  });

  it("an expired token without a refresh token is HTTP 401 github_expired", async () => {
    const session = await seed({ ...expired, refreshToken: undefined });
    const r = await detectionRoute(get(session, validQuery), projectId, "rules");
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "github_expired" });
  });

  it("only the rules route may return github_oauth_error as 400: no unexpected external request is made", async () => {
    github.refresh = () => json({ error: "bad_refresh_token" });
    const session = await seed(expired);
    await detectionRoute(get(session, validQuery), projectId, "rules");
    expect(calls.every((c) => c === "/login/oauth/access_token")).toBe(true);
  });
});
