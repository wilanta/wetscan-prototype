import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { canvasIdentity } from "../../src/features/canvas/server/github-reader";
import { AuthError } from "../../src/lib/auth/config";
import { newSession, requestToken } from "../../src/lib/auth/session";
import { writeRecord } from "../../src/lib/auth/store";

const execFileAsync = promisify(execFile);
const helper = resolve("scripts/sentinel-session-get.ps1");
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";

describe.skipIf(process.platform !== "win32")(
  "Windows PowerShell session transport (synthetic loopback, no GitHub or PostgreSQL)",
  { timeout: 15_000 },
  () => {
    let directory: string;
    let cookie: string;
    let origin: string;
    const requests: string[] = [];
    const server = createServer(async (req, res) => {
      requests.push(req.url ?? "/");
      if (req.url === "/redirect") {
        res.writeHead(302, { Location: "/redirect-target" });
        res.end();
        return;
      }
      const errorBodies: Record<string, [number, string]> = {
        "/400-oauth": [
          400,
          JSON.stringify({
            error: "github_oauth_error",
            secret: "PRIVATE_FIXTURE_BODY",
          }),
        ],
        "/400-query": [400, JSON.stringify({ error: "invalid_query" })],
        "/400-unlisted": [
          400,
          JSON.stringify({ error: "PRIVATE_FIXTURE_BODY_CODE" }),
        ],
        "/400-html": [400, "<html>PRIVATE_FIXTURE_BODY Bad Request</html>"],
        "/400-empty": [400, ""],
        "/400-large": [
          400,
          JSON.stringify({
            error: "github_oauth_error",
            pad: "PRIVATE_FIXTURE_BODY".repeat(300),
          }),
        ],
        "/400-nonstring": [
          400,
          JSON.stringify({ error: { nested: "PRIVATE_FIXTURE_BODY" } }),
        ],
        "/401-code": [401, JSON.stringify({ error: "unauthenticated" })],
        "/403-code": [403, JSON.stringify({ error: "not_found" })],
      };
      const errorFixture = errorBodies[req.url ?? ""];
      if (errorFixture) {
        res.writeHead(errorFixture[0], { "Content-Type": "application/json" });
        res.end(errorFixture[1]);
        return;
      }
      if (["/401", "/403", "/malformed", "/slow"].includes(req.url ?? "")) {
        if (req.url === "/slow") {
          setTimeout(() => {
            res.end("{}");
          }, 1600);
        } else {
          res.writeHead(
            req.url === "/401" ? 401 : req.url === "/403" ? 403 : 200,
            { "Content-Type": "application/json" },
          );
          res.end(
            req.url === "/malformed"
              ? "PRIVATE_FIXTURE_BODY_NOT_JSON"
              : JSON.stringify({ secret: "PRIVATE_FIXTURE_BODY" }),
          );
        }
        return;
      }
      const request = new NextRequest(`${origin}${req.url}`, {
        headers: req.headers.cookie ? { cookie: req.headers.cookie } : {},
      });
      let status = 200;
      try {
        await canvasIdentity(requestToken(request));
      } catch (error) {
        status = error instanceof AuthError ? error.status : 503;
      }
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status,
          cookieMatches: req.headers.cookie === cookie,
        }),
      );
    });

    async function powershell(code: string) {
      const result = await execFileAsync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", code],
        { timeout: 10_000, windowsHide: true },
      );
      expect(result.stderr.trim()).toBe("");
      return JSON.parse(result.stdout.trim());
    }

    beforeAll(async () => {
      directory = await mkdtemp(join(tmpdir(), "wetscan-session-transport-"));
      vi.stubEnv("AUTH_DATA_DIR", directory);
      vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("hex"));
      vi.stubEnv("APP_URL", "http://localhost:3000");
      await writeRecord("user-7", {
        githubId: 7,
        workspace: "synthetic",
        completedAt: "2026-11-15T00:00:00Z",
        installationId: 77,
        repositories: [],
      });
      const { token } = await newSession({
        githubId: 7,
        workspace: "synthetic",
        expiresAt: Date.now() + 300_000,
      });
      cookie = `wetscan_session=${token}`;
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("fixture_port");
      origin = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
      await new Promise<void>((done, fail) =>
        server.close((error) => (error ? fail(error) : done())),
      );
      vi.unstubAllEnvs();
      const target = resolve(directory);
      if (
        !basename(target).startsWith("wetscan-session-transport-") ||
        relative(resolve(tmpdir()), target).startsWith("..")
      )
        throw new Error("Unsafe fixture cleanup");
      await rm(target, { recursive: true, force: true });
    });

    it("reproduces missing Cookie and HTTP 401 with the original PS 5.1 header construction", async () => {
      const result = await powershell(`
        $ErrorActionPreference = 'Stop'
        try {
          Invoke-RestMethod -Method Get -Uri ${quote(origin)} -Headers @{ Cookie = ${quote(cookie)} } -TimeoutSec 5 | Out-Null
          @{ status = 200 } | ConvertTo-Json -Compress
        } catch {
          @{ status = [int]$_.Exception.Response.StatusCode } | ConvertTo-Json -Compress
        }
      `);
      expect(result.status).toBe(401);
    });

    it.each(["127.0.0.1", "localhost"])(
      "authenticates the same persisted fixture session using CookieContainer on %s",
      async (host) => {
        const uri = origin.replace("127.0.0.1", host);
        const result = await powershell(
          `& ${quote(helper)} -Uri ${quote(uri)} -CookieHeader ${quote(cookie)} | ConvertTo-Json -Compress`,
        );
        expect(result).toEqual({ status: 200, cookieMatches: true });
      },
    );

    it.each([
      ["malformed cookie", () => origin, "wetscan_session=invalid"],
      ["remote URL", () => "http://example.invalid/", undefined],
      [
        "cookie injection",
        () => origin,
        `${"wetscan_session=" + "a".repeat(64)}; other=value`,
      ],
      ["uppercase token", () => origin, `wetscan_session=${"A".repeat(64)}`],
    ])(
      "rejects %s before sending a request",
      async (_name, uri, invalidCookie) => {
        const before = requests.length;
        const result = await powershell(`
        try {
          & ${quote(helper)} -Uri ${quote(uri())} -CookieHeader ${quote(invalidCookie ?? cookie)} | Out-Null
          @{ rejected = $false } | ConvertTo-Json -Compress
        } catch {
          @{ rejected = $true } | ConvertTo-Json -Compress
        }
      `);
        expect(result.rejected).toBe(true);
        expect(requests.length).toBe(before);
      },
    );

    it("refuses redirects without sending credentials to the redirect target", async () => {
      const before = requests.length;
      const result = await powershell(`
        try {
          & ${quote(helper)} -Uri ${quote(origin + "/redirect")} -CookieHeader ${quote(cookie)} | Out-Null
          @{ rejected = $false } | ConvertTo-Json -Compress
        } catch {
          @{ rejected = $true } | ConvertTo-Json -Compress
        }
      `);
      expect(result.rejected).toBe(true);
      expect(requests.slice(before)).toEqual(["/redirect"]);
    });
    it("returns sanitized success metadata without changing CookieContainer transport", async () => {
      const result = await powershell(
        `& ${quote(helper)} -Uri ${quote(origin)} -CookieHeader ${quote(cookie)} -WithDiagnostic | ConvertTo-Json -Depth 4 -Compress`,
      );
      expect(result.data).toEqual({ status: 200, cookieMatches: true });
      expect(result.diagnostic).toMatchObject({
        status: "PASS",
        httpStatus: 200,
        category: "success",
      });
    });
    it.each([
      ["/401", "unauthenticated", 401],
      ["/403", "forbidden", 403],
      ["/malformed", "response_parse_failed", 200],
      ["/slow", "timeout", null],
      ["/redirect", "redirect_refused", 302],
    ])(
      "retains sanitized %s diagnostics without retry or body leakage",
      async (path, category, status) => {
        const before = requests.length;
        const result = await powershell(
          `try { & ${quote(helper)} -Uri ${quote(origin + path)} -CookieHeader ${quote(cookie)} -TimeoutSec 1 -WithDiagnostic | Out-Null; throw 'unexpected_success' } catch { $_.Exception.Data['S04SessionDiagnostic'] | ConvertTo-Json -Compress }`,
        );
        expect(result).toMatchObject({
          status: "NOT_VERIFIED",
          httpStatus: status,
          category,
        });
        expect(requests.slice(before)).toEqual([path]);
        expect(JSON.stringify(result)).not.toContain(cookie);
        expect(JSON.stringify(result)).not.toContain("PRIVATE_FIXTURE_BODY");
      },
    );
    it.each([
      ["/400-oauth", "github_oauth_error"],
      ["/400-query", "invalid_query"],
      ["/401-code", "unauthenticated"],
      ["/403-code", "not_found"],
      ["/400-unlisted", "unlisted_error_code"],
      ["/400-html", "unavailable_error_code"],
      ["/400-empty", "unlisted_error_code"],
      ["/400-large", "unavailable_error_code"],
      ["/400-nonstring", "unlisted_error_code"],
    ])(
      "retains only an allowlisted error code for %s without body leakage or retry",
      async (path, errorCode) => {
        const before = requests.length;
        const result = await powershell(
          `try { & ${quote(helper)} -Uri ${quote(origin + path)} -CookieHeader ${quote(cookie)} -TimeoutSec 5 -WithDiagnostic | Out-Null; throw 'unexpected_success' } catch { $_.Exception.Data['S04SessionDiagnostic'] | ConvertTo-Json -Compress }`,
        );
        expect(result).toMatchObject({
          status: "NOT_VERIFIED",
          stage: "http",
          transportStatus: "ProtocolError",
          errorCode,
        });
        expect(Object.keys(result).sort()).toEqual([
          "category",
          "errorCode",
          "httpStatus",
          "stage",
          "status",
          "transportStatus",
        ]);
        expect(requests.slice(before)).toEqual([path]);
        expect(JSON.stringify(result)).not.toContain(cookie);
        expect(JSON.stringify(result)).not.toContain("PRIVATE_FIXTURE_BODY");
      },
    );
    it("never reports an error code for transport, redirect or parse failures", async () => {
      for (const path of ["/malformed", "/redirect"]) {
        const result = await powershell(
          `try { & ${quote(helper)} -Uri ${quote(origin + path)} -CookieHeader ${quote(cookie)} -TimeoutSec 5 -WithDiagnostic | Out-Null } catch { $_.Exception.Data['S04SessionDiagnostic'] | ConvertTo-Json -Compress }`,
        );
        expect(result.errorCode).toBeNull();
      }
    });
    it("distinguishes pre-response connection refusal without retrying", async () => {
      const unused = createServer();
      await new Promise<void>((done) => unused.listen(0, "127.0.0.1", done));
      const address = unused.address();
      if (!address || typeof address === "string") throw Error("fixture_port");
      await new Promise<void>((done) => unused.close(() => done()));
      const result = await powershell(
        `try { & ${quote(helper)} -Uri 'http://127.0.0.1:${address.port}' -CookieHeader ${quote(cookie)} -TimeoutSec 5 | Out-Null } catch { $_.Exception.Data['S04SessionDiagnostic'] | ConvertTo-Json -Compress }`,
      );
      expect(result).toMatchObject({
        category: "connection_refused",
        httpStatus: null,
        transportStatus: "ConnectFailure",
      });
    });
  },
);
