import * as dns from "node:dns/promises";
import * as http from "node:http";
import * as https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import type {
  G05HttpMethod,
  G05TargetRecord,
} from "./contracts";

export interface LocalSyntheticTargetPin {
  allowedOrigin: string;
  serviceIdentity: string;
  healthPath?: string;
}

export class EgressBlockedError extends Error {
  constructor(
    public readonly reason:
      | "invalid_origin"
      | "private_ip_denied"
      | "metadata_ip_denied"
      | "dns_resolution_failed"
      | "dns_rebinding_detected"
      | "route_not_allowed"
      | "method_not_allowed"
      | "redirect_out_of_scope"
      | "local_synthetic_not_authorized"
      | "service_identity_mismatch"
      | "request_limit_exceeded"
      | "concurrency_limit_exceeded"
      | "response_size_exceeded"
      | "timeout"
      | "cancelled"
      | "grant_invalid"
      | "network_error",
    message: string,
  ) {
    super(message);
  }
}

export type DnsLookupFn = (
  hostname: string,
) => Promise<{ address: string; family: 4 | 6 }[]>;

const defaultDnsLookup: DnsLookupFn = async (hostname) => {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => ({
    address: r.address,
    family: r.family === 6 ? 6 : 4,
  }));
};

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n < 0 || n > 255) return null;
    num = ((num << 8) | n) >>> 0;
  }
  return num;
}

function inCidr4(ipNum: number, base: string, bits: number): boolean {
  const baseNum = ipv4ToInt(base)!;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipNum & mask) === (baseNum & mask);
}

export function isMetadataIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  return inCidr4(n, "169.254.0.0", 16) || inCidr4(n, "100.100.100.200", 32);
}

export function isDisallowedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true;
  const blocked: [string, number][] = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  return blocked.some(([base, bits]) => inCidr4(n, base, bits));
}

function parseIpv6Groups(raw: string): number[] | null {
  if (!raw || raw.includes("%")) return null;
  let addr = raw.toLowerCase();
  const lastColon = addr.lastIndexOf(":");
  if (lastColon !== -1 && addr.slice(lastColon + 1).includes(".")) {
    const v4 = ipv4ToInt(addr.slice(lastColon + 1));
    if (v4 === null) return null;
    const hi = ((v4 >>> 16) & 0xffff).toString(16);
    const lo = (v4 & 0xffff).toString(16);
    addr = `${addr.slice(0, lastColon)}:${hi}:${lo}`;
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - (left.length + right.length);
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const parts = [...left, ...Array<string>(missing).fill("0"), ...right];
  if (parts.length !== 8) return null;
  const groups: number[] = [];
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    groups.push(parseInt(part, 16));
  }
  return groups;
}

export function isDisallowedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isDisallowedIpv4(ip);
  if (family !== 6) return true;
  const g = parseIpv6Groups(ip);
  if (!g) return true;
  // Unspecified :: or loopback ::1
  if (g.slice(0, 7).every((x) => x === 0) && (g[7] === 0 || g[7] === 1))
    return true;
  // IPv4-mapped ::ffff:0:0/96 or IPv4-compatible ::/96
  if (
    g.slice(0, 5).every((x) => x === 0) &&
    (g[5] === 0xffff || g[5] === 0)
  ) {
    const v4 = `${(g[6] >>> 8) & 0xff}.${g[6] & 0xff}.${(g[7] >>> 8) & 0xff}.${g[7] & 0xff}`;
    return isDisallowedIpv4(v4);
  }
  // NAT64 64:ff9b::/96 and 64:ff9b:1::/48
  if (g[0] === 0x0064 && (g[1] === 0xff9b || g[1] === 0xff9b)) return true;
  // Teredo 2001:0000::/32
  if (g[0] === 0x2001 && g[1] === 0x0000) return true;
  // Documentation 2001:db8::/32
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;
  // 6to4 2002::/16 — check embedded v4
  if (g[0] === 0x2002) {
    const v4 = `${(g[1] >>> 8) & 0xff}.${g[1] & 0xff}.${(g[2] >>> 8) & 0xff}.${g[2] & 0xff}`;
    return isDisallowedIpv4(v4);
  }
  // ULA fc00::/7
  if ((g[0] & 0xfe00) === 0xfc00) return true;
  // Link-local fe80::/10, site-local fec0::/10, multicast ff00::/8
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0 || (g[0] & 0xff00) === 0xff00)
    return true;
  return false;
}

export function loadLocalSyntheticPinFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): LocalSyntheticTargetPin | null {
  const file = env.GUARD_G05_SYNTHETIC_TARGET_FILE;
  if (file) {
    if (!isAbsolute(file)) return null;
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as LocalSyntheticTargetPin;
      if (
        typeof parsed?.allowedOrigin === "string" &&
        typeof parsed?.serviceIdentity === "string" &&
        parsed.serviceIdentity.length >= 4
      ) {
        return parsed;
      }
    } catch {
      return null;
    }
  }
  if (env.GUARD_G05_SYNTHETIC_ORIGIN && env.GUARD_G05_SYNTHETIC_IDENTITY) {
    return {
      allowedOrigin: env.GUARD_G05_SYNTHETIC_ORIGIN,
      serviceIdentity: env.GUARD_G05_SYNTHETIC_IDENTITY,
      healthPath: "/healthz",
    };
  }
  return null;
}

export function validatePathAllowed(
  rawPath: string,
  allowedRoutes: readonly string[],
): string {
  if (
    !rawPath.startsWith("/") ||
    rawPath.startsWith("//") ||
    /[\u0000-\u001f\u007f\\\s#]/.test(rawPath)
  )
    throw new EgressBlockedError("route_not_allowed", "Malformed request path.");
  const decoded = (() => {
    try {
      return decodeURIComponent(rawPath.split("?")[0]);
    } catch {
      throw new EgressBlockedError("route_not_allowed", "Invalid URL encoding in path.");
    }
  })();
  if (
    decoded.split("/").some((seg) => seg === ".." || seg === ".") ||
    rawPath.includes("..")
  )
    throw new EgressBlockedError("route_not_allowed", "Path traversal denied.");
  const pathname = rawPath.split("?")[0];
  const matched = allowedRoutes.some((pattern) => {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2);
      return pathname === prefix || pathname.startsWith(prefix + "/");
    }
    return pathname === pattern || pathname.startsWith(pattern + "/");
  });
  if (!matched)
    throw new EgressBlockedError(
      "route_not_allowed",
      `Path ${pathname} is outside approved target routes.`,
    );
  return rawPath;
}

export interface PinnedEndpoint {
  url: URL;
  address: string;
  family: 4 | 6;
  port: number;
  isLocalSynthetic: boolean;
}

export async function resolveAndValidateTarget(
  target: Pick<G05TargetRecord, "environment" | "origin" | "serviceIdentity">,
  options: {
    localPin?: LocalSyntheticTargetPin | null;
    dnsLookup?: DnsLookupFn;
  } = {},
): Promise<PinnedEndpoint> {
  let url: URL;
  try {
    url = new URL(target.origin);
  } catch {
    throw new EgressBlockedError("invalid_origin", "Invalid target origin URL.");
  }
  if (url.origin !== target.origin || url.username || url.password)
    throw new EgressBlockedError("invalid_origin", "Origin must not contain credentials or path.");

  if (target.environment === "local_synthetic") {
    const pin = options.localPin;
    if (!pin)
      throw new EgressBlockedError(
        "local_synthetic_not_authorized",
        "Local synthetic staging target is not authorized in this runtime.",
      );
    let pinUrl: URL;
    try {
      pinUrl = new URL(pin.allowedOrigin);
    } catch {
      throw new EgressBlockedError("local_synthetic_not_authorized", "Invalid local synthetic pin.");
    }
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      url.origin !== pinUrl.origin ||
      !target.serviceIdentity ||
      target.serviceIdentity !== pin.serviceIdentity
    ) {
      throw new EgressBlockedError(
        "local_synthetic_not_authorized",
        "Origin or service identity does not match the authorized local synthetic pin.",
      );
    }
    const port = Number(url.port || "80");
    return {
      url,
      address: "127.0.0.1",
      family: 4,
      port,
      isLocalSynthetic: true,
    };
  }

  // External staging: strict HTTPS public domain, never IP literal or private/metadata address
  if (
    target.environment !== "staging" ||
    url.protocol !== "https:" ||
    isIP(url.hostname) !== 0 ||
    !/^[a-z][a-z0-9.-]*\.[a-z]{2,}$/i.test(url.hostname) ||
    /(?:^|\.)(localhost|local|internal|test|invalid)$/i.test(url.hostname)
  ) {
    throw new EgressBlockedError(
      "invalid_origin",
      "External staging targets require HTTPS and a valid public domain.",
    );
  }

  const lookup = options.dnsLookup ?? defaultDnsLookup;
  let records: { address: string; family: 4 | 6 }[];
  try {
    records = await lookup(url.hostname);
  } catch {
    throw new EgressBlockedError("dns_resolution_failed", "DNS lookup failed for staging host.");
  }
  if (!records.length)
    throw new EgressBlockedError("dns_resolution_failed", "No DNS records returned.");

  // Reject if ANY resolved address is private, loopback, link-local, metadata, or reserved.
  for (const rec of records) {
    if (isMetadataIpv4(rec.address)) {
      throw new EgressBlockedError(
        "metadata_ip_denied",
        "Target resolved to a cloud metadata IP address.",
      );
    }
    if (isDisallowedIp(rec.address)) {
      throw new EgressBlockedError(
        "private_ip_denied",
        "Target resolved to a disallowed private/internal IP address.",
      );
    }
  }

  const chosen = records[0];
  return {
    url,
    address: chosen.address,
    family: chosen.family,
    port: Number(url.port || "443"),
    isLocalSynthetic: false,
  };
}

export interface EnforcedHttpResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  bodyText: string;
  bodyJson: unknown;
  truncated: boolean;
  redirectLocation: string | null;
  redirectOutOfScope: boolean;
  tlsProtocol: string | null;
  tlsAuthorized: boolean | null;
  remoteAddress: string | null;
}

export interface EnforcedHttpOptions {
  target: G05TargetRecord;
  localPin?: LocalSyntheticTargetPin | null;
  dnsLookup?: DnsLookupFn;
  signal?: AbortSignal;
  verifyGrantActive?: () => Promise<void>;
}

/**
 * Outbound HTTP/HTTPS client enforcing pinned DNS/IP, no proxy bypass, route/method allowlist,
 * manual redirect checks, request count cap, concurrency cap, RPS rate limiting, response-byte cap, and timeouts.
 */
export class EnforcedHttpClient {
  private pinned: PinnedEndpoint | null = null;
  private requestsSent = 0;
  private inFlight = 0;
  private lastDispatchAt = 0;
  private identityVerified = false;
  private readonly dnsLookup: DnsLookupFn;

  constructor(private readonly opts: EnforcedHttpOptions) {
    this.dnsLookup = opts.dnsLookup ?? defaultDnsLookup;
  }

  get executedRequests() {
    return this.requestsSent;
  }

  async initialize(): Promise<PinnedEndpoint> {
    this.pinned = await resolveAndValidateTarget(this.opts.target, {
      localPin: this.opts.localPin,
      dnsLookup: this.dnsLookup,
    });
    if (this.pinned.isLocalSynthetic && !this.identityVerified) {
      await this.verifyLocalSyntheticIdentity();
    }
    return this.pinned;
  }

  async verifyLocalSyntheticIdentity(): Promise<void> {
    if (!this.pinned?.isLocalSynthetic) return;
    const healthPath = this.opts.localPin?.healthPath ?? "/healthz";
    const resp = await this.dispatchRaw("GET", healthPath, {}, undefined, true);
    const headerVal = resp.headers["x-wetscan-synthetic-target"];
    const actual = Array.isArray(headerVal) ? headerVal[0] : headerVal;
    if (resp.status !== 200 || actual !== this.opts.target.serviceIdentity) {
      throw new EgressBlockedError(
        "service_identity_mismatch",
        "Connected local service identity did not match the authorized synthetic target.",
      );
    }
    this.identityVerified = true;
  }

  async request(input: {
    method: G05HttpMethod;
    path: string;
    headers?: Record<string, string>;
    body?: string;
    followInScopeRedirects?: boolean;
  }): Promise<EnforcedHttpResponse> {
    if (this.opts.signal?.aborted)
      throw new EgressBlockedError("cancelled", "Run was cancelled.");
    if (this.opts.verifyGrantActive) await this.opts.verifyGrantActive();
    if (!this.pinned) await this.initialize();

    if (!this.opts.target.config.allowedMethods.includes(input.method)) {
      throw new EgressBlockedError(
        "method_not_allowed",
        `Method ${input.method} is not permitted by target scope.`,
      );
    }
    validatePathAllowed(input.path, this.opts.target.config.allowedRoutes);

    const maxFollow = input.followInScopeRedirects ? 2 : 0;
    let currentMethod = input.method;
    let currentPath = input.path;
    let currentBody = input.body;

    for (let hop = 0; hop <= maxFollow; hop++) {
      const response = await this.dispatchRaw(
        currentMethod,
        currentPath,
        input.headers ?? {},
        currentBody,
        false,
      );
      if (response.redirectLocation) {
        const check = this.inspectRedirect(response.redirectLocation);
        if (!check.inScope) {
          return { ...response, redirectOutOfScope: true };
        }
        if (hop === maxFollow) return response;
        if (response.status === 303 || ((response.status === 301 || response.status === 302) && currentMethod === "POST")) {
          currentMethod = "GET";
          currentBody = undefined;
        }
        currentPath = check.nextPath!;
        continue;
      }
      return response;
    }
    throw new EgressBlockedError("network_error", "Unexpected redirect loop termination.");
  }

  inspectRedirect(location: string): { inScope: boolean; nextPath?: string; reason?: string } {
    let parsed: URL;
    try {
      parsed = new URL(location, this.opts.target.origin);
    } catch {
      return { inScope: false, reason: "invalid_redirect_url" };
    }
    if (parsed.origin !== this.opts.target.origin) {
      return { inScope: false, reason: "cross_origin_redirect_denied" };
    }
    if (isIP(parsed.hostname) !== 0 && !this.pinned?.isLocalSynthetic && isDisallowedIp(parsed.hostname)) {
      return { inScope: false, reason: "disallowed_ip_redirect" };
    }
    try {
      const nextPath = parsed.pathname + parsed.search;
      validatePathAllowed(nextPath, this.opts.target.config.allowedRoutes);
      return { inScope: true, nextPath };
    } catch {
      return { inScope: false, reason: "redirect_path_out_of_scope" };
    }
  }

  private async dispatchRaw(
    method: G05HttpMethod,
    path: string,
    reqHeaders: Record<string, string>,
    body: string | undefined,
    isHealthProbe: boolean,
  ): Promise<EnforcedHttpResponse> {
    if (!this.pinned)
      throw new EgressBlockedError("dns_resolution_failed", "Endpoint not resolved.");
    if (this.opts.signal?.aborted)
      throw new EgressBlockedError("cancelled", "Run aborted.");
    if (this.requestsSent >= this.opts.target.config.maxRequests) {
      throw new EgressBlockedError(
        "request_limit_exceeded",
        `Reached target maxRequests cap (${this.opts.target.config.maxRequests}).`,
      );
    }
    if (this.inFlight >= this.opts.target.config.maxConcurrency) {
      throw new EgressBlockedError(
        "concurrency_limit_exceeded",
        "Concurrency limit exceeded.",
      );
    }

    // Rate limiting
    const minGapMs = Math.ceil(1000 / Math.max(0.1, this.opts.target.config.rateLimitRps));
    const waitMs = this.lastDispatchAt + minGapMs - Date.now();
    if (waitMs > 0 && !isHealthProbe) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, waitMs);
        const onAbort = () => {
          clearTimeout(timer);
          reject(new EgressBlockedError("cancelled", "Cancelled while waiting on rate limiter."));
        };
        this.opts.signal?.addEventListener("abort", onAbort, { once: true });
      });
    }

    // Re-check DNS before dispatching external requests to detect DNS rebinding!
    if (!this.pinned.isLocalSynthetic) {
      const fresh = await this.dnsLookup(this.pinned.url.hostname).catch(() => []);
      if (!fresh.length || fresh.some((r) => isDisallowedIp(r.address))) {
        throw new EgressBlockedError(
          "dns_rebinding_detected",
          "Target hostname resolved to a disallowed IP address.",
        );
      }
      if (!fresh.some((r) => r.address === this.pinned!.address)) {
        throw new EgressBlockedError(
          "dns_rebinding_detected",
          "Target hostname DNS answer mutated during execution (DNS rebinding guard).",
        );
      }
    }

    this.requestsSent++;
    this.inFlight++;
    this.lastDispatchAt = Date.now();
    const pinned = this.pinned;
    const maxBytes = this.opts.target.config.maxResponseBytes;
    const timeoutMs = Math.min(this.opts.target.config.timeoutMs, 30000);

    try {
      return await new Promise<EnforcedHttpResponse>((resolve, reject) => {
        let settled = false;
        const finishErr = (err: EgressBlockedError) => {
          if (!settled) {
            settled = true;
            reject(err);
          }
        };

        const headers: Record<string, string> = {
          "user-agent": "WetScan-Guard-G05/1.0",
          accept: "application/json, text/plain, */*",
          connection: "close",
          ...reqHeaders,
        };
        if (body !== undefined) {
          headers["content-length"] = String(Buffer.byteLength(body, "utf8"));
        }

        // Custom lookup pinned to the validated IP (never consults OS DNS again for socket connect).
        const pinnedLookup: LookupFunction = (_host, opts, cb) => {
          if (typeof opts === "function") {
            (opts as unknown as (e: null, a: string, f: number) => void)(
              null,
              pinned.address,
              pinned.family,
            );
            return;
          }
          if ((opts as { all?: boolean }).all) {
            cb(null, [{ address: pinned.address, family: pinned.family }] as unknown as string, pinned.family);
            return;
          }
          cb(null, pinned.address, pinned.family);
        };

        const requestFn = pinned.url.protocol === "https:" ? https.request : http.request;
        const req = requestFn(
          {
            protocol: pinned.url.protocol,
            hostname: pinned.url.hostname,
            port: pinned.port,
            path,
            method,
            headers,
            agent: false,
            lookup: pinnedLookup,
            timeout: timeoutMs,
          },
          (res) => {
            const chunks: Buffer[] = [];
            let total = 0;
            let truncated = false;
            const socket = res.socket as (import("node:net").Socket & {
              getProtocol?: () => string | null;
              authorized?: boolean;
            }) | null;
            const remoteAddress = socket?.remoteAddress ?? null;
            if (remoteAddress && remoteAddress !== pinned.address && !(pinned.isLocalSynthetic && remoteAddress === "127.0.0.1")) {
              res.destroy();
              req.destroy();
              finishErr(
                new EgressBlockedError(
                  "dns_rebinding_detected",
                  "Connected peer IP mismatched pinned address.",
                ),
              );
              return;
            }

            res.on("data", (chunk: Buffer) => {
              total += chunk.byteLength;
              if (total > maxBytes) {
                truncated = true;
                res.destroy();
                req.destroy();
                finishErr(
                  new EgressBlockedError(
                    "response_size_exceeded",
                    `Response exceeded maxResponseBytes (${maxBytes}).`,
                  ),
                );
                return;
              }
              chunks.push(chunk);
            });

            res.on("end", () => {
              if (settled) return;
              settled = true;
              const status = res.statusCode ?? 0;
              const bodyText = Buffer.concat(chunks).toString("utf8");
              let bodyJson: unknown = null;
              try {
                if (bodyText.trim()) bodyJson = JSON.parse(bodyText);
              } catch {
                bodyJson = null;
              }
              const locHeader = res.headers.location;
              const redirectLocation =
                status >= 300 && status < 400 && typeof locHeader === "string"
                  ? locHeader
                  : null;
              resolve({
                status,
                headers: res.headers,
                bodyText,
                bodyJson,
                truncated,
                redirectLocation,
                redirectOutOfScope: false,
                tlsProtocol: typeof socket?.getProtocol === "function" ? socket.getProtocol() : null,
                tlsAuthorized: typeof socket?.authorized === "boolean" ? socket.authorized : null,
                remoteAddress,
              });
            });

            res.on("error", (err) => {
              finishErr(new EgressBlockedError("network_error", err.message));
            });
          },
        );

        const onAbort = () => {
          req.destroy();
          finishErr(new EgressBlockedError("cancelled", "Request aborted."));
        };
        if (this.opts.signal) {
          if (this.opts.signal.aborted) {
            onAbort();
            return;
          }
          this.opts.signal.addEventListener("abort", onAbort, { once: true });
        }

        req.on("timeout", () => {
          req.destroy();
          finishErr(new EgressBlockedError("timeout", "Request timed out."));
        });
        req.on("error", (err) => {
          finishErr(new EgressBlockedError("network_error", err.message));
        });
        if (body !== undefined) req.write(body);
        req.end();
      });
    } finally {
      this.inFlight = Math.max(0, this.inFlight - 1);
    }
  }
}
