import * as http from "node:http";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export interface StagingFaultFlags {
  ownershipBypass: boolean;
  workflowBypass: boolean;
  stateTransitionBypass: boolean;
  replayBypass: boolean;
  unauthorizedModBypass: boolean;
  falseErrorWithMutation: boolean;
  weakHeaders: boolean;
  permissiveCors: boolean;
  brokenAdminAuth: boolean;
  ignoreSessionExpiry: boolean;
  ignoreSessionRevocation: boolean;
  openRedirectTarget: "none" | "metadata" | "external";
}

export const defaultFaultFlags = (): StagingFaultFlags => ({
  ownershipBypass: false,
  workflowBypass: false,
  stateTransitionBypass: false,
  replayBypass: false,
  unauthorizedModBypass: false,
  falseErrorWithMutation: false,
  weakHeaders: false,
  permissiveCors: false,
  brokenAdminAuth: false,
  ignoreSessionExpiry: false,
  ignoreSessionRevocation: false,
  openRedirectTarget: "none",
});

export interface StagingAccountCredential {
  id: string;
  username: string;
  password: string;
  role: "user_a" | "user_b" | "privileged";
}

export interface StagingOrder {
  id: string;
  ownerId: string;
  state: "draft" | "approved" | "locked" | "edited";
  amount: number;
  note: string;
  submittedCount: number;
  revision: number;
  seeded: boolean;
}

export interface StagingServerOptions {
  port?: number;
  host?: string;
  serviceIdentity?: string;
  signingSecret?: string;
  controlSecret?: string;
  accounts?: StagingAccountCredential[];
  initialFaults?: Partial<StagingFaultFlags>;
}

interface TokenClaims {
  sid: string;
  sub: string;
  role: "user_a" | "user_b" | "privileged";
  exp: number;
}

function defaultAccounts(): StagingAccountCredential[] {
  const gen = () => "syn_" + randomBytes(12).toString("hex");
  return [
    {
      id: "syn-actor-a",
      username: "syn-user-a@synthetic.wetscan.invalid",
      password: process.env.G05_STAGING_USER_A_PASS || gen(),
      role: "user_a",
    },
    {
      id: "syn-actor-b",
      username: "syn-user-b@synthetic.wetscan.invalid",
      password: process.env.G05_STAGING_USER_B_PASS || gen(),
      role: "user_b",
    },
    {
      id: "syn-actor-admin",
      username: "syn-admin@synthetic.wetscan.invalid",
      password: process.env.G05_STAGING_ADMIN_PASS || gen(),
      role: "privileged",
    },
  ];
}

export class SyntheticStagingServer {
  readonly serviceIdentity: string;
  readonly accounts: StagingAccountCredential[];
  readonly controlSecret: string;
  private readonly signingSecret: Buffer;
  private faults: StagingFaultFlags;
  private readonly orders = new Map<string, StagingOrder>();
  private readonly revokedSids = new Set<string>();
  private readonly replayKeys = new Set<string>();
  private readonly options: StagingServerOptions;
  private server: http.Server | null = null;
  private boundPort = 0;

  constructor(options: StagingServerOptions = {}) {
    this.options = options;
    this.serviceIdentity =
      options.serviceIdentity ||
      process.env.G05_STAGING_IDENTITY ||
      "wetscan-g05-synthetic-staging-v1";
    this.accounts = options.accounts ?? defaultAccounts();
    this.signingSecret = Buffer.from(
      options.signingSecret || randomBytes(32).toString("hex"),
      "utf8",
    );
    this.controlSecret =
      options.controlSecret ||
      process.env.G05_STAGING_CONTROL_SECRET ||
      randomBytes(24).toString("hex");
    this.faults = { ...defaultFaultFlags(), ...options.initialFaults };
    this.resetData(false);
  }

  get port() {
    return this.boundPort;
  }

  get origin() {
    return `http://${this.options.host ?? "127.0.0.1"}:${this.boundPort}`;
  }

  getFaultFlags(): StagingFaultFlags {
    return { ...this.faults };
  }

  setFaultFlags(next: Partial<StagingFaultFlags>) {
    this.faults = { ...this.faults, ...next };
  }

  resetData(resetFaults = true) {
    this.orders.clear();
    this.revokedSids.clear();
    this.replayKeys.clear();
    if (resetFaults) this.faults = { ...defaultFaultFlags(), ...this.options.initialFaults };
    this.orders.set("ord-seed-a", {
      id: "ord-seed-a",
      ownerId: "syn-actor-a",
      state: "draft",
      amount: 100,
      note: "Synthetic seeded order for User A",
      submittedCount: 0,
      revision: 1,
      seeded: true,
    });
    this.orders.set("ord-seed-b", {
      id: "ord-seed-b",
      ownerId: "syn-actor-b",
      state: "draft",
      amount: 200,
      note: "Synthetic seeded order for User B",
      submittedCount: 0,
      revision: 1,
      seeded: true,
    });
  }

  getOrderSnapshot(id: string): StagingOrder | null {
    const o = this.orders.get(id);
    return o ? { ...o } : null;
  }

  private signToken(claims: TokenClaims): string {
    const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
    const sig = createHmac("sha256", this.signingSecret)
      .update(payload)
      .digest("base64url");
    return `${payload}.${sig}`;
  }

  private verifyToken(token: string): TokenClaims | null {
    const dot = token.indexOf(".");
    if (dot <= 0) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = createHmac("sha256", this.signingSecret)
      .update(payload)
      .digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const claims = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      ) as TokenClaims;
      if (!claims.sid || !claims.sub || !claims.role) return null;
      if (!this.faults.ignoreSessionExpiry && claims.exp <= Date.now()) return null;
      if (!this.faults.ignoreSessionRevocation && this.revokedSids.has(claims.sid))
        return null;
      return claims;
    } catch {
      return null;
    }
  }

  private extractActor(req: http.IncomingMessage): TokenClaims | null {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      return this.verifyToken(auth.slice(7).trim());
    }
    const cookie = req.headers.cookie;
    if (cookie) {
      for (const part of cookie.split(";")) {
        const [k, v] = part.trim().split("=");
        if (k === "syn_session" && v) return this.verifyToken(v);
      }
    }
    return null;
  }

  private commonHeaders(req: http.IncomingMessage): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json; charset=utf-8",
      "x-wetscan-synthetic-target": this.serviceIdentity,
    };
    if (!this.faults.weakHeaders) {
      headers["x-content-type-options"] = "nosniff";
      headers["x-frame-options"] = "DENY";
      headers["cache-control"] = "no-store";
      headers["referrer-policy"] = "no-referrer";
      headers["content-security-policy"] = "default-src 'none'; frame-ancestors 'none'";
    }
    const reqOrigin = req.headers.origin;
    if (this.faults.permissiveCors && reqOrigin) {
      headers["access-control-allow-origin"] = reqOrigin;
      headers["access-control-allow-credentials"] = "true";
    } else if (reqOrigin && reqOrigin === this.origin) {
      headers["access-control-allow-origin"] = this.origin;
      headers["vary"] = "Origin";
    }
    return headers;
  }

  private reply(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    status: number,
    body: unknown,
    extraHeaders: Record<string, string> = {},
  ) {
    res.writeHead(status, { ...this.commonHeaders(req), ...extraHeaders });
    res.end(JSON.stringify(body));
  }

  private async readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.byteLength;
      if (size > 65536) throw new Error("body_too_large");
      chunks.push(buf);
    }
    const text = Buffer.concat(chunks).toString("utf8").trim();
    if (!text) return {};
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("invalid_json");
    return parsed as Record<string, unknown>;
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const parsedUrl = new URL(req.url || "/", "http://127.0.0.1");
    const path = parsedUrl.pathname;
    const method = req.method || "GET";

    if (method === "OPTIONS") {
      res.writeHead(204, this.commonHeaders(req));
      res.end();
      return;
    }

    if (method === "GET" && path === "/healthz") {
      return this.reply(req, res, 200, {
        ok: true,
        service: "wetscan-g05-synthetic-staging",
        identity: this.serviceIdentity,
        synthetic: true,
        faults: this.faults,
        orderCount: this.orders.size,
      });
    }

    if (method === "GET" && path === "/api/public/catalog") {
      return this.reply(req, res, 200, {
        public: true,
        items: [{ sku: "syn-widget-1", name: "Synthetic Sample Item" }],
      });
    }

    if (method === "GET" && path === "/api/redirect-probe") {
      if (this.faults.openRedirectTarget === "metadata") {
        res.writeHead(302, {
          ...this.commonHeaders(req),
          location: "http://169.254.169.254/latest/meta-data/",
        });
        res.end();
        return;
      }
      if (this.faults.openRedirectTarget === "external") {
        res.writeHead(302, {
          ...this.commonHeaders(req),
          location: "https://evil.example.invalid/redirected",
        });
        res.end();
        return;
      }
      return this.reply(req, res, 200, { redirect: "disabled" });
    }

    if (method === "GET" && path === "/api/large-probe") {
      if (parsedUrl.searchParams.get("oversize") === "1") {
        res.writeHead(200, this.commonHeaders(req));
        res.end("X".repeat(2 * 1024 * 1024));
        return;
      }
      return this.reply(req, res, 200, { size: "bounded" });
    }

    if (method === "POST" && path === "/api/auth/login") {
      let body: Record<string, unknown>;
      try {
        body = await this.readBody(req);
      } catch {
        return this.reply(req, res, 400, { error: "invalid_body" });
      }
      const acct = this.accounts.find(
        (a) =>
          a.username === body.username &&
          typeof body.password === "string" &&
          a.password === body.password,
      );
      if (!acct) return this.reply(req, res, 401, { error: "invalid_credentials" });
      const ttlSec =
        typeof body.ttlSec === "number" && Number.isFinite(body.ttlSec)
          ? body.ttlSec
          : 300;
      const exp = Date.now() + ttlSec * 1000;
      const sid = randomUUID();
      const token = this.signToken({ sid, sub: acct.id, role: acct.role, exp });
      return this.reply(
        req,
        res,
        200,
        {
          accessToken: token,
          sessionId: sid,
          actorId: acct.id,
          role: acct.role,
          expiresAt: new Date(exp).toISOString(),
        },
        {
          "set-cookie": `syn_session=${token}; HttpOnly; SameSite=Strict; Path=/`,
        },
      );
    }

    if (method === "POST" && path === "/api/auth/logout") {
      const actor = this.extractActor(req);
      if (!actor) return this.reply(req, res, 401, { error: "unauthenticated" });
      this.revokedSids.add(actor.sid);
      return this.reply(
        req,
        res,
        200,
        { revoked: true, sessionId: actor.sid },
        { "set-cookie": "syn_session=; HttpOnly; Max-Age=0; Path=/" },
      );
    }

    if (method === "GET" && path === "/api/auth/whoami") {
      const actor = this.extractActor(req);
      if (!actor) return this.reply(req, res, 401, { error: "unauthenticated" });
      return this.reply(req, res, 200, {
        actorId: actor.sub,
        role: actor.role,
        sessionId: actor.sid,
        expiresAt: new Date(actor.exp).toISOString(),
      });
    }

    if (method === "GET" && path === "/api/admin/audit-summary") {
      const actor = this.extractActor(req);
      if (!actor) return this.reply(req, res, 401, { error: "unauthenticated" });
      if (actor.role !== "privileged" && !this.faults.brokenAdminAuth)
        return this.reply(req, res, 403, { error: "forbidden_admin_required" });
      return this.reply(req, res, 200, {
        adminSummary: true,
        orderCount: this.orders.size,
      });
    }

    // Synthetic control endpoints (authenticated as privileged OR matching control secret header)
    if (method === "POST" && (path === "/api/synthetic/reset" || path === "/api/synthetic/faults")) {
      const hdr = req.headers["x-wetscan-control-secret"];
      const ctrlOk =
        typeof hdr === "string" &&
        hdr.length === this.controlSecret.length &&
        timingSafeEqual(Buffer.from(hdr), Buffer.from(this.controlSecret));
      const actor = this.extractActor(req);
      if (!ctrlOk && actor?.role !== "privileged") {
        return this.reply(req, res, 403, { error: "forbidden_control" });
      }
      if (path === "/api/synthetic/reset") {
        this.resetData(true);
        return this.reply(req, res, 200, { reset: true, faults: this.faults });
      }
      let body: Record<string, unknown>;
      try {
        body = await this.readBody(req);
      } catch {
        return this.reply(req, res, 400, { error: "invalid_body" });
      }
      this.setFaultFlags(body as Partial<StagingFaultFlags>);
      return this.reply(req, res, 200, { faults: this.faults });
    }

    if (path === "/api/orders" && method === "GET") {
      const actor = this.extractActor(req);
      if (!actor) return this.reply(req, res, 401, { error: "unauthenticated" });
      const list = Array.from(this.orders.values()).filter(
        (o) => actor.role === "privileged" || o.ownerId === actor.sub,
      );
      return this.reply(req, res, 200, { orders: list });
    }

    if (path === "/api/orders" && method === "POST") {
      const actor = this.extractActor(req);
      if (!actor) return this.reply(req, res, 401, { error: "unauthenticated" });
      let body: Record<string, unknown>;
      try {
        body = await this.readBody(req);
      } catch {
        return this.reply(req, res, 400, { error: "invalid_body" });
      }
      const id = `syn-ord-${randomUUID().slice(0, 12)}`;
      const order: StagingOrder = {
        id,
        ownerId: actor.sub,
        state: "draft",
        amount: typeof body.amount === "number" ? body.amount : 100,
        note: typeof body.note === "string" ? body.note.slice(0, 200) : "synthetic order",
        submittedCount: 0,
        revision: 1,
        seeded: false,
      };
      this.orders.set(id, order);
      return this.reply(req, res, 201, { order });
    }

    const orderMatch = /^\/api\/orders\/([a-z0-9-]+)(?:\/(approve|lock|edit|submit))?$/.exec(
      path,
    );
    if (orderMatch) {
      const actor = this.extractActor(req);
      if (!actor) return this.reply(req, res, 401, { error: "unauthenticated" });
      const [, orderId, action] = orderMatch;
      const order = this.orders.get(orderId);
      if (!order) return this.reply(req, res, 404, { error: "order_not_found" });

      if (!action && method === "GET") {
        const allowed =
          this.faults.ownershipBypass ||
          actor.role === "privileged" ||
          order.ownerId === actor.sub;
        if (!allowed)
          return this.reply(req, res, 403, { error: "forbidden_ownership" });
        return this.reply(req, res, 200, { order });
      }

      if (!action && method === "PATCH") {
        let body: Record<string, unknown>;
        try {
          body = await this.readBody(req);
        } catch {
          return this.reply(req, res, 400, { error: "invalid_body" });
        }
        const isOwnerOrAdmin =
          actor.role === "privileged" || order.ownerId === actor.sub;
        if (!isOwnerOrAdmin) {
          if (this.faults.falseErrorWithMutation) {
            if (typeof body.amount === "number") order.amount = body.amount;
            if (typeof body.note === "string") order.note = body.note.slice(0, 200);
            order.revision++;
            return this.reply(req, res, 403, { error: "forbidden_but_mutated" });
          }
          if (!this.faults.unauthorizedModBypass) {
            return this.reply(req, res, 403, { error: "forbidden_modification" });
          }
        }
        if (typeof body.amount === "number") order.amount = body.amount;
        if (typeof body.note === "string") order.note = body.note.slice(0, 200);
        order.revision++;
        return this.reply(req, res, 200, { order });
      }

      if (!action && method === "DELETE") {
        if (order.seeded)
          return this.reply(req, res, 403, { error: "seeded_order_protected" });
        if (actor.role !== "privileged" && order.ownerId !== actor.sub)
          return this.reply(req, res, 403, { error: "forbidden_delete" });
        this.orders.delete(orderId);
        return this.reply(req, res, 200, { deleted: true, id: orderId });
      }

      if (action === "approve" && method === "POST") {
        if (actor.role !== "privileged" && !this.faults.brokenAdminAuth)
          return this.reply(req, res, 403, { error: "forbidden_role" });
        if (order.state !== "draft")
          return this.reply(req, res, 409, { error: "invalid_state_for_approve", state: order.state });
        order.state = "approved";
        order.revision++;
        return this.reply(req, res, 200, { order });
      }

      if (action === "lock" && method === "POST") {
        if (actor.role !== "privileged" && !this.faults.brokenAdminAuth)
          return this.reply(req, res, 403, { error: "forbidden_role" });
        if (order.state !== "approved" && !this.faults.workflowBypass) {
          return this.reply(req, res, 409, {
            error: "workflow_prerequisite_missing",
            state: order.state,
          });
        }
        order.state = "locked";
        order.revision++;
        return this.reply(req, res, 200, { order });
      }

      if (action === "edit" && method === "POST") {
        if (actor.role !== "privileged" && order.ownerId !== actor.sub)
          return this.reply(req, res, 403, { error: "forbidden_ownership" });
        let body: Record<string, unknown>;
        try {
          body = await this.readBody(req);
        } catch {
          return this.reply(req, res, 400, { error: "invalid_body" });
        }
        if (order.state === "locked" && !this.faults.stateTransitionBypass) {
          return this.reply(req, res, 409, { error: "locked_order_immutable", state: order.state });
        }
        if (typeof body.amount === "number") order.amount = body.amount;
        if (typeof body.note === "string") order.note = body.note.slice(0, 200);
        if (order.state === "locked" && this.faults.stateTransitionBypass) {
          order.state = "edited";
        }
        order.revision++;
        return this.reply(req, res, 200, { order });
      }

      if (action === "submit" && method === "POST") {
        if (actor.role !== "privileged" && order.ownerId !== actor.sub)
          return this.reply(req, res, 403, { error: "forbidden_ownership" });
        const idem = String(req.headers["idempotency-key"] || "");
        if (!idem && !this.faults.replayBypass)
          return this.reply(req, res, 400, { error: "idempotency_key_required" });
        const compositeKey = `${orderId}:${idem}`;
        if ((this.replayKeys.has(compositeKey) || order.submittedCount >= 1) && !this.faults.replayBypass) {
          return this.reply(req, res, 409, {
            error: "replay_rejected",
            submittedCount: order.submittedCount,
          });
        }
        this.replayKeys.add(compositeKey);
        order.submittedCount++;
        order.revision++;
        return this.reply(req, res, 200, { order });
      }
    }

    return this.reply(req, res, 404, { error: "not_found" });
  }

  async start(): Promise<{ port: number; origin: string; serviceIdentity: string }> {
    if (this.server) return { port: this.boundPort, origin: this.origin, serviceIdentity: this.serviceIdentity };
    this.server = http.createServer((req, res) => {
      void this.handle(req, res).catch(() => {
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "internal_staging_error" }));
        }
      });
    });
    const host = this.options.host ?? "127.0.0.1";
    const desiredPort = this.options.port ?? 0;
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(desiredPort, host, () => {
        const addr = this.server!.address();
        if (!addr || typeof addr === "string") {
          reject(new Error("Invalid bound address"));
          return;
        }
        this.boundPort = addr.port;
        resolve();
      });
    });
    return {
      port: this.boundPort,
      origin: this.origin,
      serviceIdentity: this.serviceIdentity,
    };
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
  }
}

const entry = process.argv[1]?.replaceAll("\\", "/") ?? "";
if (
  entry.endsWith("/worker/guard/g05-staging/server.ts") ||
  entry === "/app/server.ts" ||
  entry === "server.ts"
) {
  const srv = new SyntheticStagingServer({
    host: process.env.G05_STAGING_HOST || "127.0.0.1",
    port: Number(process.env.G05_STAGING_PORT || "4115"),
  });
  const shutdown = () => {
    void srv.stop().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  srv.start().then((info) => {
    console.log(
      JSON.stringify({
        ready: true,
        origin: info.origin,
        serviceIdentity: info.serviceIdentity,
        usernames: srv.accounts.map((a) => ({ role: a.role, username: a.username })),
      }),
    );
  });
}
