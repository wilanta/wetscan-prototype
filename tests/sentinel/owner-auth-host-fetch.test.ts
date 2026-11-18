import { afterEach, describe, expect, it, vi } from "vitest";
import { getVersionInfo } from "next/dist/server/dev/hot-reloader-shared-utils.js";
import {
  AuthWindowPolicy,
  createAuthWindowFetch,
} from "../../scripts/sentinel-owner-reauth-app.mjs";

const probe = "https://registry.npmjs.org/-/package/next/dist-tags";
const exchangeUrl = "https://github.com/login/oauth/access_token";
const exchange = {
  method: "POST",
  body: JSON.stringify({ code: "SYNTHETIC", code_verifier: "SYNTHETIC_PKCE" }),
};
const token = {
  access_token: "SYNTHETIC_ACCESS",
  refresh_token: "SYNTHETIC_REFRESH",
  expires_in: 28800,
};
function oauth() {
  const policy = new AuthWindowPolicy();
  policy.route("POST", "/api/auth/github/start");
  policy.route("GET", "/api/auth/github/callback");
  return policy;
}
afterEach(() => vi.unstubAllGlobals());

describe("installed Next startup probe, with no server or network", () => {
  it("reproduces the original one-blocked-operation signature", async () => {
    const policy = new AuthWindowPolicy();
    const failures = vi.fn();
    const fetch = vi.fn(async (url, init = {}) => {
      try {
        policy.provider(url, init);
      } catch {
        failures();
        throw Error("auth_window_provider_failed");
      }
      throw Error("NO_NETWORK_ALLOWED");
    });
    vi.stubGlobal("fetch", fetch);
    expect((await getVersionInfo()).staleness).toBe("unknown");
    expect(fetch).toHaveBeenCalledExactlyOnceWith(probe);
    expect(failures).toHaveBeenCalledTimes(1);
    expect(policy.receipt(false)).toMatchObject({
      starts: 0,
      callbacks: 0,
      tokenExchanges: 0,
      identities: 0,
      blockedOperations: 1,
    });
  });
  it("denies the exact optional startup probe locally without invalidating OAuth", async () => {
    const policy = new AuthWindowPolicy();
    const network = vi.fn();
    const failure = vi.fn();
    vi.stubGlobal(
      "fetch",
      createAuthWindowFetch(policy, network, failure, () => true),
    );
    expect((await getVersionInfo()).staleness).toBe("unknown");
    expect(network).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
    expect(policy.receipt(false)).toMatchObject({
      offlineVersionProbes: 1,
      blockedOperations: 0,
      starts: 0,
      callbacks: 0,
      tokenExchanges: 0,
      identities: 0,
    });
    expect(policy.route("POST", "/api/auth/github/start")).toBe("start");
  });
  it("does not exempt a second version check or any check after preparation", async () => {
    let preparing = true;
    const policy = new AuthWindowPolicy();
    const network = vi.fn();
    const failure = vi.fn();
    const fetch = createAuthWindowFetch(
      policy,
      network,
      failure,
      () => preparing,
    );
    expect((await fetch(probe)).status).toBe(503);
    preparing = false;
    await expect(fetch(probe)).rejects.toThrow("auth_window_provider_failed");
    expect(network).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledWith(
      "provider_fetch",
      "next_version_probe",
    );
    await expect(
      createAuthWindowFetch(new AuthWindowPolicy(), network, failure)(probe),
    ).rejects.toThrow();
    const second = createAuthWindowFetch(
      new AuthWindowPolicy(),
      network,
      failure,
      () => true,
    );
    await second(probe);
    await expect(second(probe)).rejects.toThrow();
  });
  it.each([
    [probe, { method: "POST" }],
    [probe, { headers: { Authorization: "SYNTHETIC_SECRET" } }],
    [probe + "?token=SYNTHETIC_SECRET", {}],
    ["http://registry.npmjs.org/-/package/next/dist-tags", {}],
    ["https://example.com", {}],
    ["http://localhost:55432", {}],
  ])("keeps every other startup request blocked (%s)", async (url, init) => {
    const policy = new AuthWindowPolicy();
    const network = vi.fn();
    const failure = vi.fn();
    await expect(
      createAuthWindowFetch(policy, network, failure, () => true)(url, init),
    ).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
    expect(policy.blockedOperations).toBe(1);
    expect(JSON.stringify(failure.mock.calls)).not.toContain(
      "SYNTHETIC_SECRET",
    );
    expect(() => policy.route("POST", "/api/auth/github/start")).toThrow();
  });
});

describe("restricted OAuth fetch integration", () => {
  it("allows exactly one valid exchange and owner identity, with no refresh", async () => {
    const policy = oauth();
    const network = vi.fn(async (url) =>
      Response.json(
        url === exchangeUrl
          ? token
          : { id: 187839747, login: "synthetic-owner" },
      ),
    );
    const failure = vi.fn();
    const fetch = createAuthWindowFetch(policy, network, failure);
    await fetch(exchangeUrl, exchange);
    await fetch("https://api.github.com/user");
    expect(policy.receipt(true).status).toBe("CALLBACK_COMPLETE");
    expect(network).toHaveBeenCalledTimes(2);
    expect(failure).not.toHaveBeenCalled();
    await expect(fetch(exchangeUrl, exchange)).rejects.toThrow();
    expect(network).toHaveBeenCalledTimes(2);
  });
  it("rejects refresh and unrelated providers without forwarding requests", async () => {
    for (const [url, init] of [
      [
        exchangeUrl,
        {
          method: "POST",
          body: JSON.stringify({
            refresh_token: "SYNTHETIC_SECRET",
            grant_type: "refresh_token",
          }),
        },
      ],
      ["https://api.github.com/repos/owner/repo?token=SYNTHETIC_SECRET", {}],
    ] as const) {
      const network = vi.fn();
      const failure = vi.fn();
      await expect(
        createAuthWindowFetch(oauth(), network, failure)(url, init),
      ).rejects.toThrow();
      expect(network).not.toHaveBeenCalled();
      expect(JSON.stringify(failure.mock.calls)).not.toContain(
        "SYNTHETIC_SECRET",
      );
    }
  });
  it.each([
    { ...token, expires_in: 1799 },
    { ...token, refresh_token: undefined },
    { ...token, access_token: undefined },
    { ...token, error: "SYNTHETIC_SECRET" },
  ])("retains token-response checks", async (body) => {
    const failure = vi.fn();
    const network = vi.fn(async () => Response.json(body));
    await expect(
      createAuthWindowFetch(oauth(), network, failure)(exchangeUrl, exchange),
    ).rejects.toThrow("auth_window_provider_failed");
    expect(failure).toHaveBeenCalledWith("provider_fetch", "oauth_exchange");
    expect(JSON.stringify(failure.mock.calls)).not.toContain(
      "SYNTHETIC_SECRET",
    );
  });
  it("retains owner identity verification and sanitizes network failures", async () => {
    const policy = oauth();
    const failure = vi.fn();
    const network = vi.fn(async (url) =>
      Response.json(url === exchangeUrl ? token : { id: 42, login: "wrong" }),
    );
    const fetch = createAuthWindowFetch(policy, network, failure);
    await fetch(exchangeUrl, exchange);
    await expect(fetch("https://api.github.com/user")).rejects.toThrow();
    expect(failure).toHaveBeenLastCalledWith(
      "provider_fetch",
      "github_identity",
    );
    const broken = createAuthWindowFetch(
      oauth(),
      vi.fn(async () => {
        throw Error("SYNTHETIC_SECRET");
      }),
      failure,
    );
    await expect(broken(exchangeUrl, exchange)).rejects.toThrow(
      "auth_window_provider_failed",
    );
    expect(JSON.stringify(failure.mock.calls)).not.toContain(
      "SYNTHETIC_SECRET",
    );
  });
});
