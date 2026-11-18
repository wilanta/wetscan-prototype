// Temporary auth-only hosting of the EXISTING Next application; no production route changes.
// The wrapper is necessary to prevent /app auto-fetches and token refresh in this window.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

export class AuthWindowPolicy {
  starts = 0;
  callbacks = 0;
  tokenExchanges = 0;
  identities = 0;
  blockedOperations = 0;
  offlineVersionProbes = 0;
  reject() {
    this.blockedOperations++;
    throw new Error("auth_window_operation_denied");
  }
  route(method, pathname) {
    if (this.blockedOperations) this.reject();
    if (method === "POST" && pathname === "/api/auth/github/start") {
      if (this.starts++ !== 0) this.reject();
      return "start";
    }
    if (method === "GET" && pathname === "/api/auth/github/callback") {
      if (this.starts !== 1 || this.callbacks++ !== 0) this.reject();
      return "callback";
    }
    if (method === "GET" && pathname === "/app") return "complete";
    if (method === "GET" && pathname === "/api/onboarding") return "anonymous";
    if (
      method === "GET" &&
      (pathname === "/login" || pathname.startsWith("/_next/static/"))
    )
      return "next";
    if (pathname.startsWith("/api/") || method !== "GET") this.reject();
    return "not_found";
  }
  provider(url, init = {}) {
    if (this.blockedOperations) this.reject();
    if (this.callbacks !== 1) this.reject();
    if (
      url === "https://github.com/login/oauth/access_token" &&
      init.method === "POST"
    ) {
      let body;
      try {
        body = JSON.parse(init.body);
      } catch {
        this.reject();
      }
      if (
        body.refresh_token ||
        (body.grant_type && body.grant_type !== "authorization_code") ||
        !body.code ||
        !body.code_verifier ||
        this.tokenExchanges++ !== 0
      )
        this.reject();
      return "exchange";
    }
    if (
      url === "https://api.github.com/user" &&
      (init.method ?? "GET") === "GET" &&
      this.tokenExchanges === 1 &&
      this.identities++ === 0
    )
      return "identity";
    this.reject();
  }
  receipt(success) {
    return {
      status:
        success &&
        this.starts === 1 &&
        this.callbacks === 1 &&
        this.tokenExchanges === 1 &&
        this.identities === 1 &&
        this.blockedOperations === 0
          ? "CALLBACK_COMPLETE"
          : "NOT_VERIFIED",
      starts: this.starts,
      callbacks: this.callbacks,
      tokenExchanges: this.tokenExchanges,
      identities: this.identities,
      blockedOperations: this.blockedOperations,
      offlineVersionProbes: this.offlineVersionProbes,
      credentialRefreshPerformed: false,
    };
  }
}
export function createAuthWindowFetch(
  policy,
  originalFetch,
  onFailure,
  isPreparingNext = () => false,
) {
  return async (input, init = {}) => {
    // Before the server listens no OAuth request can exist, so every fetch in
    // that phase is optional framework traffic (npm advisories/dist-tags,
    // telemetry). Answer it locally with 503: no network, window not invalidated.
    if (isPreparingNext()) {
      policy.offlineVersionProbes++;
      return new Response(null, { status: 503 });
    }
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const operation =
      url === "https://github.com/login/oauth/access_token"
        ? "oauth_exchange"
        : url === "https://api.github.com/user"
          ? "github_identity"
          : url === "https://registry.npmjs.org/-/package/next/dist-tags"
            ? "next_version_probe"
            : "other";
    try {
      const kind = policy.provider(url, init);
      const response = await originalFetch(input, init);
      if (!response.ok) throw Error("provider_failure");
      const body = await response.clone().json();
      if (kind === "identity" && (body.id !== 187839747 || !body.login))
        throw Error("wrong_owner");
      if (
        kind === "exchange" &&
        (!body.access_token ||
          !body.refresh_token ||
          !Number.isFinite(body.expires_in) ||
          body.expires_in < 1800 ||
          body.error)
      )
        throw Error("invalid_token_response");
      return response;
    } catch {
      // Fixed categories only; never retain provider URLs, bodies or errors.
      onFailure("provider_fetch", operation);
      throw Error("auth_window_provider_failed");
    }
  };
}
async function main() {
  // Discard framework logs rather than retaining callback URLs, cookies or provider bodies.
  // Durable fixed-category receipts below preserve outcome without secret-bearing streams.
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  const repo = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const run = process.argv[2];
  if (
    process.env.WETSCAN_OWNER_AUTH_GRANT !==
      "OWNER APPROVED ONE S04 AUTH ONLY WINDOW NO REFRESH NO PROVISIONING" ||
    !run ||
    path.dirname(path.resolve(run)).toLowerCase() !==
      "c:\\users\\sheil\\.wetscan-sentinel" ||
    !/^s04-owner-reauth-[a-f0-9]{32}$/.test(path.basename(run))
  )
    throw Error("grant_or_run");
  if (
    Object.keys(process.env).some((k) =>
      /^(SENTINEL_|PG|DATABASE_|DB_|POSTGRES_)|^(DIRECT_URL|NODE_OPTIONS)$/.test(
        k,
      ),
    )
  )
    throw Error("database_environment");
  const before = JSON.parse(
    fs.readFileSync(path.join(run, "auth-before.private.json"), "utf8"),
  );
  if (before.schemaVersion !== 2) throw Error("snapshot_required");
  const policy = new AuthWindowPolicy();
  let wrote = false,
    windowFailed = false,
    server,
    nextApp;
  const record = (success, source = "window", operation = "unspecified") => {
    if (!success) windowFailed = true;
    if (
      !success &&
      !fs.existsSync(path.join(run, "window-failure.sanitized.json"))
    ) {
      const failed = fs.openSync(
        path.join(run, "window-failure.sanitized.json"),
        "wx",
        0o600,
      );
      try {
        fs.writeFileSync(
          failed,
          JSON.stringify({
            status: "NOT_VERIFIED",
            classification: "auth_window_failed",
            source,
            operation,
            recordedAtUtc: new Date().toISOString(),
          }),
        );
        fs.fsyncSync(failed);
      } finally {
        fs.closeSync(failed);
      }
    }
    if (wrote) return;
    wrote = true;
    const fd = fs.openSync(
      path.join(run, "oauth-window.sanitized.json"),
      "wx",
      0o600,
    );
    try {
      fs.writeFileSync(
        fd,
        JSON.stringify({
          ...policy.receipt(success),
          recordedAtUtc: new Date().toISOString(),
        }),
      );
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  };
  process.env.NEXT_TELEMETRY_DISABLED = "1";
  const originalFetch = globalThis.fetch;
  let preparingNext = true;
  globalThis.fetch = createAuthWindowFetch(
    policy,
    originalFetch,
    (source, operation) => record(false, source, operation),
    () => preparingNext,
  );
  let flowCookie;
  const began = Date.now();
  const timer = setTimeout(() => {
    record(false, "deadline", "timeout");
    process.exit(1);
  }, 15 * 60_000);
  try {
    const { default: next } = await import("next");
    // Source compilation occurs only in the future authorized window. Never serve the old build.
    process.env.NODE_ENV = "development";
    nextApp = next({
      dev: true,
      dir: repo,
      hostname: "localhost",
      port: 3000,
      webpack: true,
      quiet: true,
    });
    await nextApp.prepare();
    if (windowFailed) throw Error("startup_operation_denied");
    if (
      Object.keys(process.env).some((k) =>
        /^(SENTINEL_|PG|DATABASE_|DB_|POSTGRES_)|^DIRECT_URL$/.test(k),
      )
    )
      throw Error("dotenv_database_environment");
    const handler = nextApp.getRequestHandler();
    server = http.createServer(async (req, res) => {
      try {
        if (windowFailed) throw Error("auth_window_already_stopped");
        if (Date.now() - began >= 15 * 60_000) throw Error("deadline");
        const u = new URL(req.url, "http://localhost:3000");
        if (req.headers.host !== "localhost:3000") policy.reject();
        const kind = policy.route(req.method, u.pathname);
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Referrer-Policy", "no-referrer");
        if (kind === "anonymous") {
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              authenticated: false,
              step: "workspace",
              connected: false,
            }),
          );
          return;
        }
        if (kind === "complete") {
          res.setHeader("Content-Type", "text/html");
          res.end(
            "<!doctype html><title>WetScan owner login</title><p>Callback returned. Do not sign out or navigate. Return to PowerShell; offline validation is still required.</p>",
          );
          return;
        }
        if (kind === "not_found") {
          res.statusCode = 404;
          res.end();
          return;
        }
        if (kind === "start") {
          if (
            req.headers.cookie ||
            u.search ||
            Number(req.headers["content-length"] ?? 0) > 256 ||
            !req.headers["content-type"]?.startsWith("application/json")
          )
            policy.reject();
          res.on("finish", () => {
            const h = res.getHeader("set-cookie");
            const m = /wetscan_session=([a-f0-9]{64})/.exec(
              Array.isArray(h) ? h.join(";") : String(h ?? ""),
            );
            if (res.statusCode !== 200 || !m) {
              record(false, "oauth_start", "invalid_response");
              return;
            }
            flowCookie = m[1];
          });
          await handler(req, res);
          return;
        }
        if (kind === "callback") {
          const m = /(?:^|;\s*)wetscan_session=([a-f0-9]{64})(?:;|$)/.exec(
            req.headers.cookie ?? "",
          );
          if (
            !flowCookie ||
            m?.[1] !== flowCookie ||
            u.searchParams.getAll("code").length !== 1 ||
            u.searchParams.has("error")
          )
            policy.reject();
          res.on("finish", () => {
            const location = String(res.getHeader("location") ?? "");
            record(
              res.statusCode === 303 &&
                location === "http://localhost:3000/app",
              "oauth_callback",
              "response_validation",
            );
          });
        }
        await handler(req, res);
      } catch {
        record(false, "request_handler", "operation_denied_or_failed");
        if (res.headersSent) {
          res.destroy();
          return;
        }
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "auth_window_stopped" }));
      }
    });
    // The installed Next custom server attaches its own HMR upgrade listener on
    // the first request. Do not register a duplicate handleUpgrade invocation.
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(3000, "localhost", resolve);
    });
    preparingNext = false; // from here only reviewed OAuth providers are reachable
    const ready = fs.openSync(
      path.join(run, "app-ready.sanitized.json"),
      "wx",
      0o600,
    );
    try {
      fs.writeFileSync(
        ready,
        JSON.stringify({
          status: "READY",
          origin: "http://localhost:3000",
          pid: process.pid,
          sourceCompiled: true,
          databaseCredentialsSupplied: false,
        }),
      );
      fs.fsyncSync(ready);
    } finally {
      fs.closeSync(ready);
    }
    // Stay alive until the owner procedure/watchdog stops this owned process tree.
    process.once("SIGTERM", () => {
      record(false, "shutdown", "terminated");
      server.close();
      clearTimeout(timer);
      process.exit(1);
    });
  } catch {
    preparingNext = false;
    record(false, "startup", "failed");
    clearTimeout(timer);
    if (server) server.close();
    if (nextApp) await nextApp.close();
    process.exitCode = 1;
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch(() => {
    process.exitCode = 1;
  });
