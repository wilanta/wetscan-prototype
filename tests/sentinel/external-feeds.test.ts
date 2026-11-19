import { describe, expect, it } from "vitest";
import {
  allowedProvider,
  FeedClient,
  FeedError,
  feedUrls,
} from "../../src/features/sentinel/external/feeds";

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
const client = (
  fetchImpl: typeof fetch,
  extra: Partial<ConstructorParameters<typeof FeedClient>[0]> = {},
) => {
  const sleeps: number[] = [];
  return {
    sleeps,
    c: new FeedClient({
      fetchImpl,
      signal: new AbortController().signal,
      sleep: async (ms) => void sleeps.push(ms),
      ...extra,
    }),
  };
};
const caught = async (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e) => e as FeedError,
  );

describe("S09 provider endpoint allowlist (SSRF)", () => {
  it("accepts exactly the official endpoints", () => {
    expect(allowedProvider(feedUrls.cisa_kev)).toBe("cisa_kev");
    expect(
      allowedProvider(
        `${feedUrls.ghsa}?type=reviewed&per_page=100&sort=updated&direction=asc&updated=%3E%3D2026-11-01`,
      ),
    ).toBe("ghsa");
    expect(allowedProvider(feedUrls.osv + "GHSA-35jh-r3h4-6jhm")).toBe("osv");
  });
  it("rejects look-alike hosts, schemes, ports, credentials, paths and unknown parameters", () => {
    for (const url of [
      "http://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
      "https://www.cisa.gov.evil.example/sites/default/files/feeds/known_exploited_vulnerabilities.json",
      "https://evil.example/https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
      "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json?x=1",
      "https://user:pw@api.github.com/advisories",
      "https://api.github.com:8443/advisories",
      "https://api.github.com/user",
      "https://api.github.com/advisories/../user",
      "https://api.github.com/advisories?access_token=x",
      "https://api.osv.dev/v1/query",
      "https://api.osv.dev/v1/vulns/../../x",
      "https://api.osv.dev/v1/vulns/GHSA-aaaa?x=1",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/advisories",
      "ftp://api.osv.dev/v1/vulns/CVE-2021-1",
      "not a url",
    ])
      expect(allowedProvider(url), url).toBeNull();
  });
  it("refuses non-allowlisted URLs before any network call", async () => {
    let calls = 0;
    const { c } = client((async () => (calls++, json({}))) as typeof fetch);
    expect(
      (await caught(c.getJson("https://169.254.169.254/", { maxBytes: 100 })))
        ?.code,
    ).toBe("unsafe_url");
    expect(calls).toBe(0);
  });
});

describe("S09 bounded fetching", () => {
  it("never follows redirects", async () => {
    let calls = 0;
    let seen: RequestInit | undefined;
    const { c } = client((async (_u: string, init: RequestInit) => {
      calls++;
      seen = init;
      return new Response(null, {
        status: 302,
        headers: { location: "https://169.254.169.254/" },
      });
    }) as unknown as typeof fetch);
    expect(
      (await caught(c.getJson(feedUrls.cisa_kev, { maxBytes: 1000 })))?.code,
    ).toBe("unsafe_redirect");
    expect(calls).toBe(1);
    expect(seen?.redirect).toBe("manual");
    expect(seen?.credentials).toBe("omit");
  });
  it("caps response size by declared length and by streamed bytes", async () => {
    const big = "x".repeat(5000);
    const { c } = client(
      (async () =>
        new Response(JSON.stringify({ big }), { status: 200 })) as typeof fetch,
    );
    expect(
      (await caught(c.getJson(feedUrls.cisa_kev, { maxBytes: 1000 })))?.code,
    ).toBe("response_too_large");
    const declared = client(
      (async () =>
        new Response("{}", {
          status: 200,
          headers: { "content-length": "999999" },
        })) as typeof fetch,
    ).c;
    expect(
      (await caught(declared.getJson(feedUrls.cisa_kev, { maxBytes: 1000 })))
        ?.code,
    ).toBe("response_too_large");
  });
  it("reports malformed JSON without retrying", async () => {
    let calls = 0;
    const { c } = client(
      (async () => (
        calls++,
        new Response("{not json", { status: 200 })
      )) as typeof fetch,
    );
    expect(
      (await caught(c.getJson(feedUrls.cisa_kev, { maxBytes: 1000 })))?.code,
    ).toBe("malformed_payload");
    expect(calls).toBe(1);
  });
  it("retries 5xx and timeouts with bounded backoff, then gives up", async () => {
    let calls = 0;
    const down = client(
      (async () => (
        calls++,
        new Response("", { status: 503 })
      )) as typeof fetch,
    );
    const err = await caught(
      down.c.getJson(feedUrls.cisa_kev, { maxBytes: 1000 }),
    );
    expect(err).toMatchObject({ code: "http_error", httpStatus: 503 });
    expect(calls).toBe(3); // 1 attempt + 2 bounded retries
    expect(down.sleeps).toHaveLength(2);
    expect(Math.max(...down.sleeps)).toBeLessThanOrEqual(8250);
    let n = 0;
    const flaky = client((async () => {
      if (n++ < 1) throw new DOMException("timeout", "TimeoutError");
      return json({ ok: true });
    }) as typeof fetch);
    expect(
      (await flaky.c.getJson(feedUrls.cisa_kev, { maxBytes: 1000 })).json,
    ).toEqual({ ok: true });
    const dead = client((async () => {
      throw new DOMException("timeout", "TimeoutError");
    }) as typeof fetch);
    expect(
      (await caught(dead.c.getJson(feedUrls.cisa_kev, { maxBytes: 1000 })))
        ?.code,
    ).toBe("timeout");
  });
  it("does not retry 4xx and treats 404 distinctly", async () => {
    let calls = 0;
    const { c } = client(
      (async () => (
        calls++,
        new Response("", { status: 404 })
      )) as typeof fetch,
    );
    expect(
      (
        await caught(
          c.getJson(feedUrls.osv + "GHSA-35jh-r3h4-6jhm", { maxBytes: 1000 }),
        )
      )?.code,
    ).toBe("not_found");
    expect(calls).toBe(1);
  });
  it("surfaces 429 / exhausted rate limits with the provider's retry hint and does not retry", async () => {
    let calls = 0;
    const a = client(
      (async () => (
        calls++,
        new Response("", { status: 429, headers: { "retry-after": "120" } })
      )) as typeof fetch,
    );
    const e = await caught(
      a.c.getJson(feedUrls.ghsa + "?type=reviewed", { maxBytes: 1000 }),
    );
    expect(e).toMatchObject({ code: "rate_limited", retryAfterMs: 120000 });
    expect(calls).toBe(1);
    const reset = Math.floor(Date.now() / 1000) + 600;
    const b = client(
      (async () =>
        new Response("", {
          status: 403,
          headers: {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(reset),
          },
        })) as typeof fetch,
    );
    const e2 = await caught(
      b.c.getJson(feedUrls.ghsa + "?type=reviewed", { maxBytes: 1000 }),
    );
    expect(e2?.code).toBe("rate_limited");
    expect(e2?.retryAfterMs).toBeGreaterThan(500_000);
    expect(e2?.retryAfterMs).toBeLessThanOrEqual(600_000);
  });
  it("caps absurd Retry-After values at one day", async () => {
    const { c } = client(
      (async () =>
        new Response("", {
          status: 429,
          headers: { "retry-after": "99999999" },
        })) as typeof fetch,
    );
    expect(
      (
        await caught(
          c.getJson(feedUrls.ghsa + "?type=reviewed", { maxBytes: 10 }),
        )
      )?.retryAfterMs,
    ).toBe(86_400_000);
  });
  it("supports conditional requests (ETag / 304)", async () => {
    let header: string | null = null;
    const { c } = client((async (_u: string, init: RequestInit) => {
      header =
        (init.headers as Record<string, string>)["If-None-Match"] ?? null;
      return new Response(null, { status: 304 });
    }) as unknown as typeof fetch);
    const r = await c.getJson(feedUrls.cisa_kev, {
      maxBytes: 100,
      etag: '"abc"',
    });
    expect(header).toBe('"abc"');
    expect(r).toMatchObject({ notModified: true, json: null, etag: '"abc"' });
  });
  it("follows pagination links only within the same allowlisted endpoint", async () => {
    const ok = client((async () =>
      json([], {
        headers: {
          link: `<${feedUrls.ghsa}?type=reviewed&after=abc>; rel="next"`,
        },
      })) as typeof fetch);
    expect(
      (await ok.c.getJson(feedUrls.ghsa + "?type=reviewed", { maxBytes: 100 }))
        .nextUrl,
    ).toContain("after=abc");
    for (const evil of [
      "https://evil.example/advisories?after=1",
      "https://api.github.com/user?after=1",
      "http://api.github.com/advisories?after=1",
    ]) {
      const c = client((async () =>
        json([], {
          headers: { link: `<${evil}>; rel="next"` },
        })) as typeof fetch).c;
      expect(
        (await c.getJson(feedUrls.ghsa + "?type=reviewed", { maxBytes: 100 }))
          .nextUrl,
      ).toBeNull();
    }
  });
  it("enforces a request budget", async () => {
    const { c } = client((async () => json({})) as typeof fetch, {
      maxRequests: 2,
    });
    await c.getJson(feedUrls.cisa_kev, { maxBytes: 100 });
    await c.getJson(feedUrls.cisa_kev, { maxBytes: 100 });
    expect(
      (await caught(c.getJson(feedUrls.cisa_kev, { maxBytes: 100 })))?.code,
    ).toBe("request_budget");
  });
  it("sends the optional GHSA token to api.github.com only and never leaks it", async () => {
    const token = "ghp_" + "a".repeat(36);
    const headers: Record<string, Record<string, string>> = {};
    const f = (async (u: string, init: RequestInit) => {
      headers[new URL(u).host] = init.headers as Record<string, string>;
      return new Response("", { status: 500 });
    }) as unknown as typeof fetch;
    const { c } = client(f, { ghsaToken: token, retries: 0 });
    const e1 = await caught(
      c.getJson(feedUrls.ghsa + "?type=reviewed", { maxBytes: 100 }),
    );
    const e2 = await caught(c.getJson(feedUrls.cisa_kev, { maxBytes: 100 }));
    const e3 = await caught(
      c.getJson(feedUrls.osv + "GHSA-35jh-r3h4-6jhm", { maxBytes: 100 }),
    );
    expect(headers["api.github.com"].Authorization).toBe(`Bearer ${token}`);
    expect(headers["www.cisa.gov"].Authorization).toBeUndefined();
    expect(headers["api.osv.dev"].Authorization).toBeUndefined();
    for (const e of [e1, e2, e3])
      expect(
        JSON.stringify([e?.message, e?.code, e?.stack ?? ""]),
      ).not.toContain(token);
  });
  it("aborts promptly when the caller aborts", async () => {
    const ac = new AbortController();
    ac.abort();
    const c = new FeedClient({
      fetchImpl: (async () => json({})) as typeof fetch,
      signal: ac.signal,
    });
    expect(
      (await caught(c.getJson(feedUrls.cisa_kev, { maxBytes: 100 })))?.code,
    ).toBe("aborted");
  });
});
