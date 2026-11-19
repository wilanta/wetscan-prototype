import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { referenceEmitter } from "../telemetry/emitter";
import { TelemetryError, uuid } from "../telemetry/validation";
import { DEFAULT_GHOST_DECOY_PATH, ghostLimits } from "./model";
import { decoyPathCategory, validateDecoyPath } from "./validation";

export type GhostSignalClassification =
  "decoy_access" | "automated_crawler_or_scanner" | "controlled_test_hit";

export interface GhostDecoyOptions {
  /** Safe default-disabled state: must be explicitly true to activate decoy emission. */
  enabled?: boolean;
  /** Explicit owner confirmation for the local/staging test application. */
  ownedApplicationConfirmed?: boolean;
  decoyPath?: string;
  responseStatus?: 200 | 204 | 404;
  ingestEndpoint: string;
  credential?: string;
  credentialFile?: string;
  rateLimitPerMinute?: number;
  dedupeWindowMs?: number;
  maxInFlight?: number;
  now?: () => number;
  onEmitError?: (code: string) => void;
}

export interface GhostDecoyStats {
  enabled: boolean;
  decoyPath: string;
  hitsAccepted: number;
  hitsDeduplicated: number;
  hitsRateLimited: number;
  emissionsSucceeded: number;
  emissionsFailed: number;
  lastErrorCode: string | null;
}

const CRAWLER_OR_SCANNER_PATTERN =
  /\b(?:bot|crawler|spider|slurp|googlebot|bingbot|yandex|duckduckbot|scanner|nuclei|nikto|nmap|curl|wget)\b/i;

const ALLOWED_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

const RESPONSE_HEADERS = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
} as const;

export function classifyDecoySignal(
  headers: Readonly<Record<string, string | string[] | undefined>>,
): GhostSignalClassification {
  const synthetic = headers["x-wetscan-synthetic-test"];
  if (synthetic === "1") return "controlled_test_hit";
  const ua = headers["user-agent"];
  const uaText = Array.isArray(ua) ? ua.join(" ") : (ua ?? "");
  if (uaText && CRAWLER_OR_SCANNER_PATTERN.test(uaText))
    return "automated_crawler_or_scanner";
  return "decoy_access";
}

function extractCorrelationId(
  headers: Readonly<Record<string, string | string[] | undefined>>,
): string | undefined {
  const raw = headers["x-wetscan-correlation-id"] ?? headers["idempotency-key"];
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  if (!candidate) return undefined;
  try {
    return uuid(candidate.trim());
  } catch {
    return undefined;
  }
}

async function resolveCredential(opts: GhostDecoyOptions): Promise<string> {
  if (opts.credentialFile) {
    if (!isAbsolute(opts.credentialFile))
      throw new TelemetryError("invalid_credential", 401);
    const content = (await readFile(opts.credentialFile, "utf8")).trim();
    if (!content) throw new TelemetryError("invalid_credential", 401);
    return content;
  }
  if (opts.credential && opts.credential.trim()) return opts.credential.trim();
  throw new TelemetryError("invalid_credential", 401);
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headOnly = false,
) {
  const headers: Record<string, string> = { ...RESPONSE_HEADERS };
  if (status !== 204)
    headers["content-type"] = "application/json; charset=utf-8";
  res.writeHead(status, headers);
  if (status === 204 || headOnly) {
    res.end();
    return;
  }
  res.end(JSON.stringify(body));
}

export function createGhostDecoyHandler(
  initialOptions: GhostDecoyOptions,
  transport: typeof fetch = fetch,
) {
  const decoyPath = validateDecoyPath(
    initialOptions.decoyPath ?? DEFAULT_GHOST_DECOY_PATH,
  );
  const responseStatus = initialOptions.responseStatus ?? 200;
  if (![200, 204, 404].includes(responseStatus))
    throw new TelemetryError("invalid_response_status");
  const rateLimitPerMinute =
    initialOptions.rateLimitPerMinute ?? ghostLimits.defaultRateLimitPerMin;
  if (
    !Number.isInteger(rateLimitPerMinute) ||
    rateLimitPerMinute < 1 ||
    rateLimitPerMinute > ghostLimits.maxRateLimitPerMin
  )
    throw new TelemetryError("invalid_rate_limit");
  const dedupeWindowMs = Math.max(
    1000,
    Math.min(300000, initialOptions.dedupeWindowMs ?? 60000),
  );
  const maxInFlight = Math.max(
    1,
    Math.min(16, initialOptions.maxInFlight ?? 8),
  );
  const clock = initialOptions.now ?? Date.now;

  let enabled = initialOptions.enabled === true;
  let ownedConfirmed = initialOptions.ownedApplicationConfirmed === true;
  let bucketMinute = -1;
  let bucketCount = 0;
  let inFlight = 0;
  let hitsAccepted = 0;
  let hitsDeduplicated = 0;
  let hitsRateLimited = 0;
  let emissionsSucceeded = 0;
  let emissionsFailed = 0;
  let lastErrorCode: string | null = null;
  const dedupeSeen = new Map<string, number>();

  const pruneDedupe = (nowMs: number) => {
    for (const [k, exp] of dedupeSeen.entries()) {
      if (exp <= nowMs) dedupeSeen.delete(k);
    }
    while (dedupeSeen.size >= 256) {
      const oldest = dedupeSeen.keys().next().value;
      if (!oldest) break;
      dedupeSeen.delete(oldest);
    }
  };

  const emitHit = async (
    method: string,
    pathName: string,
    classification: GhostSignalClassification,
    correlationId: string | undefined,
  ) => {
    const start = clock();
    if (inFlight >= maxInFlight) {
      emissionsFailed++;
      lastErrorCode = "decoy_in_flight_limit";
      initialOptions.onEmitError?.("decoy_in_flight_limit");
      return;
    }
    inFlight++;
    try {
      const credential = await resolveCredential(initialOptions);
      const emitter = referenceEmitter(
        {
          enabled: true,
          ownedApplicationConfirmed: true,
          endpoint: initialOptions.ingestEndpoint,
          credential,
        },
        transport,
      );
      const attributes: Record<string, string | number | boolean> = {
        reasonCode: "decoy_hit",
        decoyPathCategory: decoyPathCategory(decoyPath),
        signalClassification: classification,
        durationMs: Math.max(0, clock() - start),
      };
      if (correlationId) attributes.correlationId = correlationId;
      const batch = emitter.prepare(
        [
          {
            kind: "ghost.decoy_triggered",
            severityHint: "medium",
            request: {
              method: ALLOWED_METHODS.has(method) ? method : "GET",
              routeTemplate: pathName,
              statusCode: responseStatus,
            },
            attributes,
          },
        ],
        clock(),
      );
      await emitter.send(batch);
      emissionsSucceeded++;
    } catch (error) {
      emissionsFailed++;
      const code =
        error instanceof TelemetryError ? error.code : "decoy_emit_failed";
      lastErrorCode = code;
      initialOptions.onEmitError?.(code);
    } finally {
      inFlight--;
    }
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    // Discard request bodies immediately: the decoy never parses, logs, or captures request payloads.
    req.resume();
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const method = (req.method ?? "GET").toUpperCase();
    const headOnly = method === "HEAD";

    if (!enabled || !ownedConfirmed || url.pathname !== decoyPath) {
      sendJson(res, 404, { error: "not_found" }, headOnly);
      return;
    }
    if (!ALLOWED_METHODS.has(method)) {
      sendJson(res, 405, { error: "method_not_allowed" }, headOnly);
      return;
    }

    const nowMs = clock();
    const minute = Math.floor(nowMs / 60000);
    if (bucketMinute !== minute) {
      bucketMinute = minute;
      bucketCount = 0;
    }
    if (++bucketCount > rateLimitPerMinute) {
      hitsRateLimited++;
      sendJson(res, 429, { error: "rate_limited" }, headOnly);
      return;
    }

    const correlationId = extractCorrelationId(req.headers);
    pruneDedupe(nowMs);
    if (correlationId) {
      const seenUntil = dedupeSeen.get(correlationId);
      if (seenUntil && seenUntil > nowMs) {
        hitsDeduplicated++;
        sendJson(
          res,
          responseStatus,
          responseStatus === 404
            ? { error: "not_found" }
            : {
                status: "ok",
                decoy: "controlled_test_inert",
                notice:
                  "Harmless decoy endpoint response. No real credentials or operations exist here.",
              },
          headOnly,
        );
        return;
      }
      dedupeSeen.set(correlationId, nowMs + dedupeWindowMs);
    }

    hitsAccepted++;
    const classification = classifyDecoySignal(req.headers);
    await emitHit(method, url.pathname, classification, correlationId);
    sendJson(
      res,
      responseStatus,
      responseStatus === 404
        ? { error: "not_found" }
        : {
            status: "ok",
            decoy: "controlled_test_inert",
            notice:
              "Harmless decoy endpoint response. No real credentials or operations exist here.",
          },
      headOnly,
    );
  };

  return {
    decoyPath,
    handle,
    setEnabled(next: boolean, confirmed = ownedConfirmed) {
      enabled = next === true;
      ownedConfirmed = confirmed === true;
    },
    isEnabled() {
      return enabled && ownedConfirmed;
    },
    stats(): GhostDecoyStats {
      return {
        enabled: enabled && ownedConfirmed,
        decoyPath,
        hitsAccepted,
        hitsDeduplicated,
        hitsRateLimited,
        emissionsSucceeded,
        emissionsFailed,
        lastErrorCode,
      };
    },
  };
}

export interface GhostFixture {
  origin: string;
  port: number;
  decoyPath: string;
  url: string;
  isEnabled(): boolean;
  setEnabled(next: boolean, confirmed?: boolean): void;
  stats(): GhostDecoyStats;
  stop(): Promise<void>;
}

/**
 * Starts the H07-approved loopback-only Ghost Lite decoy fixture bound strictly to 127.0.0.1.
 * Safe default-disabled unless `enabled: true` AND `ownedApplicationConfirmed: true`.
 */
export async function startGhostFixture(
  opts: GhostDecoyOptions & { port?: number },
  transport: typeof fetch = fetch,
): Promise<GhostFixture> {
  const controller = createGhostDecoyHandler(opts, transport);
  const server: Server = createServer((req, res) => {
    void controller.handle(req, res).catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: "decoy_unavailable" });
    });
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.maxConnections = 32;
  await new Promise<void>((ok, bad) => {
    server.once("error", bad);
    server.listen(opts.port ?? 0, "127.0.0.1", ok);
  });
  const port = (server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;
  return {
    origin,
    port,
    decoyPath: controller.decoyPath,
    url: `${origin}${controller.decoyPath}`,
    isEnabled: controller.isEnabled,
    setEnabled: controller.setEnabled,
    stats: controller.stats,
    stop: () => new Promise((ok) => server.close(() => ok())),
  };
}
