import { createServer, type Server } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";

/**
 * Owner-controlled S05 response fixture. Loopback only; holds ONE reversible rate limit with its own TTL
 * (defense in depth: the limit disappears even if the Sentinel worker is dead). Synthetic: no real traffic is
 * proxied and nothing outside this process is changed.
 *
 *  PUT/GET/DELETE /admin/limit   bearer token required
 *  GET /probe/attack             429 while the limit is active (needs x-wetscan-probe header), else 200
 *  GET /probe/benign             200 (controllable only in tests)
 */
export interface Fixture {
  origin: string;
  port: number;
  /** Test controls (never reachable over HTTP). */
  state(): {
    active: boolean;
    actionId: string | null;
    expiresAt: string | null;
  };
  clear(): void;
  setBenignStatus(code: number): void;
  setAdminFailure(on: boolean): void;
  stop(): Promise<void>;
}
export async function startFixture(opts: {
  token: string;
  port?: number;
}): Promise<Fixture> {
  if (opts.token.length < 16) throw new Error("fixture_token_too_short");
  let limit: { actionId: string; expiresAtMs: number } | null = null;
  let benign = 200;
  let adminDown = false;
  const live = () => {
    if (limit && Date.now() >= limit.expiresAtMs) limit = null; // self-expiry
    return limit;
  };
  const authed = (h: string | undefined) => {
    const a = Buffer.from(h ?? "");
    const b = Buffer.from(`Bearer ${opts.token}`);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  const send = (
    res: import("node:http").ServerResponse,
    code: number,
    body: unknown,
  ) => {
    res.writeHead(code, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(body));
  };
  const view = () => {
    const l = live();
    return {
      active: Boolean(l),
      actionId: l?.actionId ?? null,
      expiresAt: l ? new Date(l.expiresAtMs).toISOString() : null,
    };
  };
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/probe/benign" && req.method === "GET")
      return send(res, benign, { ok: benign === 200 });
    if (url.pathname === "/probe/attack" && req.method === "GET") {
      if (!req.headers["x-wetscan-probe"])
        return send(res, 400, { error: "probe_header_required" });
      return live()
        ? send(res, 429, { limited: true })
        : send(res, 200, { limited: false });
    }
    if (url.pathname !== "/admin/limit")
      return send(res, 404, { error: "not_found" });
    if (!authed(req.headers.authorization))
      return send(res, 401, { error: "unauthorized" });
    if (adminDown) return send(res, 503, { error: "unavailable" });
    if (req.method === "GET") return send(res, 200, view());
    if (req.method === "DELETE") {
      const id = url.searchParams.get("actionId");
      const l = live();
      if (l && id !== l.actionId)
        return send(res, 409, { error: "other_action_active", ...view() });
      limit = null;
      return send(res, 200, { removed: Boolean(l), active: false });
    }
    if (req.method === "PUT") {
      let raw = "";
      req.on("data", (c) => {
        raw += c;
        if (raw.length > 1024) req.destroy();
      });
      req.on("end", () => {
        try {
          const b = JSON.parse(raw);
          if (
            typeof b.actionId !== "string" ||
            !/^[0-9a-f-]{36}$/.test(b.actionId) ||
            !Number.isInteger(b.ttlSeconds) ||
            b.ttlSeconds < 1 ||
            b.ttlSeconds > 600
          )
            return send(res, 400, { error: "invalid_body" });
          const l = live();
          if (l && l.actionId !== b.actionId)
            return send(res, 409, { error: "other_action_active", ...view() });
          // Idempotent: same action never extends its own TTL.
          if (!l)
            limit = {
              actionId: b.actionId,
              expiresAtMs: Date.now() + b.ttlSeconds * 1000,
            };
          return send(res, 200, view());
        } catch {
          return send(res, 400, { error: "invalid_body" });
        }
      });
      return;
    }
    return send(res, 405, { error: "method_not_allowed" });
  });
  await new Promise<void>((ok, bad) => {
    server.once("error", bad);
    server.listen(opts.port ?? 0, "127.0.0.1", ok);
  });
  const port = (server.address() as { port: number }).port;
  return {
    origin: `http://127.0.0.1:${port}`,
    port,
    state: view,
    clear: () => {
      limit = null;
    },
    setBenignStatus: (c) => {
      benign = c;
    },
    setAdminFailure: (on) => {
      adminDown = on;
    },
    stop: () => new Promise((ok) => server.close(() => ok())),
  };
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const token = process.env.SENTINEL_RESPONSE_TOKEN ?? "";
  const port = Number(process.env.SENTINEL_FIXTURE_PORT ?? 0);
  startFixture({ token, port }).then((f) => {
    console.log(
      `S05 response fixture listening on ${f.origin} (loopback only; Ctrl+C to stop)`,
    );
    process.on("SIGINT", () => f.stop().then(() => process.exit(0)));
  });
}
