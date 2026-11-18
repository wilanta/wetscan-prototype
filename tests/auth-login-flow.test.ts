import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { NextRequest } from "next/server";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hooks = vi.hoisted(() => ({
  setters: [] as ReturnType<typeof vi.fn>[],
  effects: [] as (() => void)[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const setter = vi.fn();
    hooks.setters.push(setter);
    return [initial, setter];
  },
  useEffect: (effect: () => void) => {
    hooks.effects.push(effect);
  },
}));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("@/components/ui", () => ({ Button: "button", Card: "section" }));
vi.mock("@/components/logo", () => ({ Logo: "span" }));
vi.mock("lucide-react", () => ({ GitBranch: "svg" }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/store", () => ({
  exclusive: (work: () => unknown) => work(),
  writeRecord: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(),
  newSession: vi.fn(),
  profileFor: vi.fn(),
  requestToken: vi.fn(),
  saveSession: vi.fn(),
  setSessionCookie: vi.fn(),
}));
import { Login } from "../src/components/auth/login";
import { authFetch, errorMessage } from "../src/components/auth/api";
import { POST as start } from "../src/app/api/auth/github/start/route";
import {
  getSession,
  newSession,
  profileFor,
  saveSession,
  setSessionCookie,
} from "../src/lib/auth/session";
import { writeRecord } from "../src/lib/auth/store";
import { AuthWindowPolicy } from "../scripts/sentinel-owner-reauth-app.mjs";

const origin = "http://localhost:3000";
function button(
  node: ReactNode,
):
  | ReactElement<{ onClick: () => Promise<void>; disabled: boolean }>
  | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return;
  if (node.type === "button") return node as ReturnType<typeof button>;
  return Children.toArray(node.props.children).map(button).find(Boolean);
}
function localFetch(policy = new AuthWindowPolicy()) {
  const fetch = vi.fn(async (url, init) => {
    if (url === "/api/onboarding")
      return Response.json({ authenticated: false });
    expect(url).toBe("/api/auth/github/start");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
    expect(JSON.parse(init.body)).toEqual({ intent: "login" });
    policy.route(init.method, url);
    return start(
      new NextRequest(origin + url, {
        ...init,
        headers: { ...init.headers, origin },
      }),
    );
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
beforeEach(() => {
  hooks.setters.length = 0;
  hooks.effects.length = 0;
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("AUTH_SECRET", "SYNTHETIC_NOT_A_REAL_SECRET_32_BYTES");
  vi.stubEnv(
    "AUTH_DATA_DIR",
    join(tmpdir(), "wetscan-in-memory-only-no-files"),
  );
  vi.stubEnv("GITHUB_APP_ID", "123");
  vi.stubEnv("GITHUB_APP_SLUG", "synthetic");
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "synthetic-client");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "SYNTHETIC");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "SYNTHETIC_NOT_USED_FOR_LOGIN_START");
  vi.mocked(getSession).mockResolvedValue(undefined);
  vi.mocked(profileFor).mockResolvedValue(undefined);
  vi.mocked(newSession).mockResolvedValue({
    token: "a".repeat(64),
    session: { workspace: "", expiresAt: Date.now() + 3600000 },
  });
  vi.mocked(saveSession).mockResolvedValue(undefined);
  vi.stubGlobal("window", { location: { assign: vi.fn(), replace: vi.fn() } });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("real login onClick to real OAuth-start route, in-memory dependencies", () => {
  it("constructs the GitHub authorization navigation with exact origin/callback and PKCE", async () => {
    const fetch = localFetch();
    const click = button(Login({}));
    expect(click?.props.disabled).toBe(false);
    await click!.props.onClick();
    expect(fetch).toHaveBeenCalledTimes(1);
    const url = new URL(
      vi.mocked(window.location.assign).mock.calls[0][0].toString(),
    );
    expect(url.origin + url.pathname).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      origin + "/api/auth/github/callback",
    );
    expect(url.searchParams.get("client_id")).toBe("synthetic-client");
    expect(url.searchParams.get("state")).toMatch(/^[a-f0-9]{64}$/);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/);
    expect(getSession).toHaveBeenCalledWith(undefined);
    expect(saveSession).toHaveBeenCalledTimes(1); // mock only; no filesystem access
    expect(setSessionCookie).toHaveBeenCalledTimes(1);
    expect(writeRecord).not.toHaveBeenCalled();
  });
  it("loads the anonymous onboarding response without navigation or session writes", async () => {
    const fetch = localFetch();
    Login({});
    hooks.effects[0]();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      "/api/onboarding",
      expect.objectContaining({ method: "GET" }),
    );
    expect(window.location.replace).not.toHaveBeenCalled();
    expect(newSession).not.toHaveBeenCalled();
    expect(saveSession).not.toHaveBeenCalled();
  });
  it("rejects a mismatched configured origin before any session operation", async () => {
    localFetch();
    vi.stubEnv("APP_URL", "http://localhost:3001");
    await button(Login({}))!.props.onClick();
    expect(hooks.setters[1]).toHaveBeenCalledWith(
      errorMessage("invalid_origin"),
    );
    expect(getSession).not.toHaveBeenCalled();
    expect(newSession).not.toHaveBeenCalled();
    expect(saveSession).not.toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });
  it("does not admit another start after a policy failure", async () => {
    const policy = new AuthWindowPolicy();
    expect(() => policy.provider("https://example.com")).toThrow();
    localFetch(policy);
    await button(Login({}))!.props.onClick();
    expect(getSession).not.toHaveBeenCalled();
    expect(newSession).not.toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });
  it("turns Failed to fetch into a sanitized STOP message and never retries", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch SYNTHETIC_SECRET");
    });
    vi.stubGlobal("fetch", fetch);
    await button(Login({}))!.props.onClick();
    expect(hooks.setters[1]).toHaveBeenCalledWith(
      errorMessage("auth_network_unavailable"),
    );
    expect(JSON.stringify(hooks.setters[1].mock.calls)).not.toContain(
      "SYNTHETIC_SECRET",
    );
    expect(hooks.setters[0]).toHaveBeenLastCalledWith(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(window.location.assign).not.toHaveBeenCalled();
    expect(newSession).not.toHaveBeenCalled();
  });
});

describe("sanitized authentication responses", () => {
  it.each([403, 500, 200])(
    "handles unreadable responses (HTTP %s)",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("SYNTHETIC_SECRET", { status })),
      );
      await expect(
        authFetch("/api/auth/github/start", { intent: "login" }),
      ).rejects.toThrow(errorMessage("auth_invalid_response"));
    },
  );
  it("displays the restricted host's JSON STOP classification", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "auth_window_stopped" }, { status: 403 }),
      ),
    );
    await expect(
      authFetch("/api/auth/github/start", { intent: "login" }),
    ).rejects.toThrow(errorMessage("auth_window_stopped"));
  });
  it("does not expose unknown server error text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "SYNTHETIC_SECRET" }, { status: 500 }),
      ),
    );
    await expect(
      authFetch("/api/auth/github/start", { intent: "login" }),
    ).rejects.toThrow(errorMessage("unknown"));
  });
});
