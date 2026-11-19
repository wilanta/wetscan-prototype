import type { Provider } from "./model";

export type FeedErrorCode =
  | "unsafe_url"
  | "unsafe_redirect"
  | "timeout"
  | "network"
  | "rate_limited"
  | "http_error"
  | "not_found"
  | "response_too_large"
  | "malformed_payload"
  | "request_budget"
  | "aborted";
/** Fixed codes only: provider bodies, URLs and tokens never enter errors, logs or stored status. */
export class FeedError extends Error {
  constructor(
    readonly code: FeedErrorCode,
    readonly retryAfterMs: number | null = null,
    readonly httpStatus: number | null = null,
  ) {
    super(code);
  }
}
export const feedUrls = {
  cisa_kev:
    "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
  ghsa: "https://api.github.com/advisories",
  osv: "https://api.osv.dev/v1/vulns/",
} as const;
const ghsaParams = new Set([
  "type",
  "per_page",
  "sort",
  "direction",
  "modified",
  "after",
  "before",
  "updated",
]);
/** Strict endpoint allowlist: https, exact host, fixed path, no credentials/port/fragment, bounded query keys. */
export function allowedProvider(raw: string): Provider | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    u.hash ||
    raw.length > 600
  )
    return null;
  if (
    u.hostname === "www.cisa.gov" &&
    u.pathname === new URL(feedUrls.cisa_kev).pathname &&
    !u.search
  )
    return "cisa_kev";
  if (
    u.hostname === "api.github.com" &&
    u.pathname === "/advisories" &&
    [...u.searchParams.keys()].every((k) => ghsaParams.has(k))
  )
    return "ghsa";
  if (
    u.hostname === "api.osv.dev" &&
    /^\/v1\/vulns\/[A-Za-z0-9._:-]{3,64}$/.test(u.pathname) &&
    !u.search
  )
    return "osv";
  return null;
}
export interface FeedResponse {
  status: number;
  notModified: boolean;
  json: unknown;
  etag: string | null;
  nextUrl: string | null;
  bytes: number;
}
export interface FeedClientOptions {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  signal: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  maxRequests?: number;
  /** Sent only to api.github.com (GHSA). Never logged or returned. */
  ghsaToken?: string;
}
const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new FeedError("aborted"));
    const t = setTimeout(done, ms);
    function done() {
      signal.removeEventListener("abort", stop);
      resolve();
    }
    function stop() {
      clearTimeout(t);
      reject(new FeedError("aborted"));
    }
    signal.addEventListener("abort", stop, { once: true });
  });
const DAY = 86_400_000;
function retryAfter(h: Headers, now = Date.now()): number | null {
  const ra = h.get("retry-after");
  if (ra) {
    const secs = Number(ra);
    const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(ra) - now;
    if (Number.isFinite(ms)) return Math.min(Math.max(ms, 1000), DAY);
  }
  const reset = Number(h.get("x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0)
    return Math.min(Math.max(reset * 1000 - now, 1000), DAY);
  return null;
}
export class FeedClient {
  requests = 0;
  bytes = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: NonNullable<FeedClientOptions["sleep"]>;
  constructor(private readonly o: FeedClientOptions) {
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.sleep = o.sleep ?? pause;
  }
  async getJson(
    url: string,
    limits: { maxBytes: number; etag?: string | null },
  ): Promise<FeedResponse> {
    const provider = allowedProvider(url);
    if (!provider) throw new FeedError("unsafe_url");
    const max = this.o.retries ?? 2;
    for (let attempt = 0; ; attempt++) {
      if (this.o.signal.aborted) throw new FeedError("aborted");
      if (++this.requests > (this.o.maxRequests ?? 30))
        throw new FeedError("request_budget");
      try {
        return await this.once(url, provider, limits);
      } catch (e) {
        const retryable =
          e instanceof FeedError &&
          (["timeout", "network"].includes(e.code) ||
            (e.code === "http_error" && (e.httpStatus ?? 0) >= 500));
        if (!retryable || attempt >= max) throw e;
        await this.sleep(
          Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250),
          this.o.signal,
        );
      }
    }
  }
  private async once(
    url: string,
    provider: Provider,
    limits: { maxBytes: number; etag?: string | null },
  ): Promise<FeedResponse> {
    const headers: Record<string, string> = {
      Accept:
        provider === "ghsa"
          ? "application/vnd.github+json"
          : "application/json",
      "User-Agent": "wetscan-sentinel-feed-sync/1",
    };
    if (limits.etag) headers["If-None-Match"] = limits.etag;
    if (provider === "ghsa") {
      headers["X-GitHub-Api-Version"] = "2022-11-28";
      if (this.o.ghsaToken)
        headers.Authorization = `Bearer ${this.o.ghsaToken}`;
    }
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers,
        redirect: "manual",
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.any([
          this.o.signal,
          AbortSignal.timeout(this.o.timeoutMs ?? 10000),
        ]),
      });
    } catch {
      throw new FeedError(this.o.signal.aborted ? "aborted" : "timeout");
    }
    const status = response.status;
    const drop = () => response.body?.cancel().catch(() => undefined);
    if (status === 304) {
      await drop();
      return {
        status,
        notModified: true,
        json: null,
        etag: limits.etag ?? null,
        nextUrl: null,
        bytes: 0,
      };
    }
    if (status >= 300 && status < 400) {
      await drop();
      throw new FeedError("unsafe_redirect", null, status);
    }
    if (
      status === 429 ||
      (status === 403 &&
        (response.headers.get("x-ratelimit-remaining") === "0" ||
          response.headers.has("retry-after")))
    ) {
      await drop();
      throw new FeedError("rate_limited", retryAfter(response.headers), status);
    }
    if (status === 404) {
      await drop();
      throw new FeedError("not_found", null, status);
    }
    if (status !== 200) {
      await drop();
      throw new FeedError("http_error", null, status);
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > limits.maxBytes) {
      await drop();
      throw new FeedError("response_too_large", null, status);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new FeedError("malformed_payload", null, status);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limits.maxBytes)
          throw new FeedError("response_too_large", null, status);
        chunks.push(value);
      }
    } catch (e) {
      if (e instanceof FeedError) throw e;
      throw new FeedError(this.o.signal.aborted ? "aborted" : "network");
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    this.bytes += size;
    let json: unknown;
    try {
      json = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
      );
    } catch {
      throw new FeedError("malformed_payload", null, status);
    }
    // Pagination links must stay on the same allowlisted endpoint; anything else is dropped, never followed.
    const link = /<([^>]+)>;\s*rel="next"/.exec(
      response.headers.get("link") ?? "",
    )?.[1];
    return {
      status,
      notModified: false,
      json,
      etag: response.headers.get("etag")?.slice(0, 256) ?? null,
      nextUrl: link && allowedProvider(link) === provider ? link : null,
      bytes: size,
    };
  }
}
