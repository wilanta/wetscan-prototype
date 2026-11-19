import { describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ResendSender, safeBase, secretReader, TelegramSender, type Fetch } from "../../src/features/sentinel/notifications/providers";

const TOKEN = "123456789:AAEhBP0av28zD1pV0T2tKq9xYz7mNn3Qw4kLs";
const RESEND = "re_ABCDEFGHIJKLMNOP1234";
const never = new AbortController().signal;
const res = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
const tg = (f: Fetch) => new TelegramSender({ token: async () => TOKEN, fetchImpl: f });
const send = (s: TelegramSender) => s.send({ destination: "123456789", text: "hi" }, never);

describe("S06-A4 Telegram response → state mapping (mocked HTTP) and secret hygiene", () => {
  it("200 ok ⇒ accepted with the provider message id (acceptance only; no delivery claim)", async () => {
    const out = await send(tg(async () => res(200, { ok: true, result: { message_id: 77 } })));
    expect(out).toMatchObject({ kind: "accepted", providerMessageId: "77" });
    expect(Object.keys(out)).not.toContain("delivered");
  });
  it.each([
    [429, { ok: false, parameters: { retry_after: 7 } }, { kind: "retryable", code: "rate_limited", retryAfterMs: 7000 }],
    [500, { ok: false }, { kind: "retryable", code: "provider_5xx" }],
    [502, "<html>bad gateway</html>", { kind: "retryable", code: "provider_5xx" }],
    [401, { ok: false, description: "Unauthorized" }, { kind: "permanent", code: "provider_auth_failed" }],
    [403, { ok: false, description: "bot was blocked by the user" }, { kind: "permanent", code: "recipient_forbidden" }],
    [400, { ok: false, description: "chat not found" }, { kind: "permanent", code: "destination_rejected" }],
    [404, { ok: false }, { kind: "permanent", code: "destination_rejected" }],
    [418, {}, { kind: "permanent", code: "provider_rejected" }],
  ])("status %i maps to %j", async (status, body, expected) => {
    expect(await send(tg(async () => res(status, body)))).toEqual(expected);
  });
  it("200 without a usable message id is malformed / rejected, never accepted", async () => {
    expect(await send(tg(async () => res(200, { ok: true, result: {} })))).toEqual({ kind: "permanent", code: "malformed_provider_response" });
    expect(await send(tg(async () => res(200, { ok: false })))).toEqual({ kind: "permanent", code: "provider_rejected" });
  });
  it("network failure / timeout is AMBIGUOUS (the request may have been delivered) and never leaks the error text", async () => {
    const out = await send(tg(async () => { throw new Error(`connect ECONNRESET https://api.telegram.org/bot${TOKEN}/sendMessage`); }));
    expect(out).toEqual({ kind: "retryable", code: "network_or_timeout", ambiguous: true });
    expect(JSON.stringify(out)).not.toContain(TOKEN);
  });
  it("oversized provider responses are cut off (bounded read) and treated as ambiguous", async () => {
    expect(await send(tg(async () => res(200, "x".repeat(100000))))).toMatchObject({ kind: "retryable", ambiguous: true });
  });
  it("the token is only ever sent to the Telegram endpoint, JSON-encoded body has no secret, and redirects are refused", async () => {
    const fetchImpl = vi.fn<Fetch>(async () => res(200, { ok: true, result: { message_id: 1 } }));
    await send(tg(fetchImpl));
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(init.redirect).toBe("error");
    expect(String(init.body)).not.toContain(TOKEN);
    expect(JSON.parse(String(init.body))).toEqual({ chat_id: "123456789", text: "hi", disable_web_page_preview: true });
  });
  it("missing / malformed token ⇒ not_configured and ZERO requests", async () => {
    const f = vi.fn(async () => res(200, {}));
    for (const token of [undefined, "", "not-a-token", "123:short"])
      expect(await new TelegramSender({ token: async () => token, fetchImpl: f as unknown as Fetch }).send({ destination: "1", text: "x" }, never)).toEqual({ kind: "not_configured" });
    expect(f).not.toHaveBeenCalled();
  });
  it("base-URL override is honoured only for a loopback mock; anything else falls back to the real host", () => {
    expect(safeBase("https://api.telegram.org", "http://127.0.0.1:45678")).toBe("http://127.0.0.1:45678");
    for (const evil of ["https://evil.test", "http://169.254.169.254:80", "http://127.0.0.1.evil.test:4444", "http://localhost:4444"])
      expect(safeBase("https://api.telegram.org", evil)).toBe("https://api.telegram.org");
  });
  it("real HTTP round trip against a loopback mock server (429 then 200) — no external network", async () => {
    const seen: string[] = [];
    let n = 0;
    const server = createServer((req, r) => {
      seen.push(`${req.method} ${req.url?.replace(TOKEN, "<token>")}`);
      req.resume();
      n++;
      r.writeHead(n === 1 ? 429 : 200, { "content-type": "application/json" });
      r.end(JSON.stringify(n === 1 ? { ok: false, parameters: { retry_after: 1 } } : { ok: true, result: { message_id: 9 } }));
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    const port = (server.address() as { port: number }).port;
    const s = new TelegramSender({ token: async () => TOKEN, baseUrl: `http://127.0.0.1:${port}` });
    expect(await send(s)).toMatchObject({ kind: "retryable", code: "rate_limited" });
    expect(await send(s)).toMatchObject({ kind: "accepted", providerMessageId: "9" });
    expect(seen).toEqual(["POST /bot<token>/sendMessage", "POST /bot<token>/sendMessage"]);
    await new Promise((ok) => server.close(ok));
  });
});

describe("S06 Resend adapter (provider-agnostic email port; acceptance ≠ mailbox delivery)", () => {
  const mk = (f: Fetch, over: Partial<{ apiKey: string | undefined; from: string | undefined }> = {}) =>
    new ResendSender({ apiKey: async () => ("apiKey" in over ? over.apiKey : RESEND), from: "from" in over ? over.from : "WetScan <alerts@example.com>", fetchImpl: f });
  const go = (s: ResendSender) => s.send({ destination: "owner@example.com", text: "t", subject: "s", deliveryId: "d-1" }, never);
  it("200 with id ⇒ accepted; idempotency key and bearer are sent only to the Resend endpoint", async () => {
    const f = vi.fn<Fetch>(async () => res(200, { id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }));
    expect(await go(mk(f))).toMatchObject({ kind: "accepted", providerMessageId: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("d-1");
    expect(JSON.parse(String(init.body))).toMatchObject({ to: ["owner@example.com"] });
    expect(String(init.body)).not.toContain(RESEND);
  });
  it.each([
    [429, { retryable: "rate_limited" }],
    [503, { retryable: "provider_5xx" }],
    [401, { permanent: "provider_auth_failed" }],
    [422, { permanent: "provider_rejected" }],
  ])("status %i", async (status, expected) => {
    const out = await go(mk(async () => res(status, {}, status === 429 ? { "retry-after": "3" } : {})));
    expect(out).toMatchObject({ kind: "retryable" in expected ? "retryable" : "permanent", code: Object.values(expected)[0] });
  });
  it("missing key / sender address ⇒ not_configured with no request; CRLF in from is refused", async () => {
    const f = vi.fn(async () => res(200, { id: "x" }));
    for (const o of [{ apiKey: undefined }, { from: undefined }, { from: "a@b.co\r\nBcc: x@y.zz" }, { apiKey: "short" }])
      expect(await go(mk(f as unknown as Fetch, o))).toEqual({ kind: "not_configured" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("S06-A7 credential rotation and revocation", () => {
  it("secretReader picks up a rotated or revoked file without a restart (ttl) and rejects malformed values", async () => {
    const dir = await mkdtemp(join(tmpdir(), "s06-secret-"));
    try {
      const file = join(dir, "tg");
      await writeFile(file, TOKEN + "\n");
      const read = secretReader({ TELEGRAM_BOT_TOKEN_FILE: file }, "TELEGRAM_BOT_TOKEN", 0);
      expect(await read()).toBe(TOKEN);
      const rotated = "987654321:BBEhBP0av28zD1pV0T2tKq9xYz7mNn3Qw4kLs";
      await writeFile(file, rotated);
      expect(await read()).toBe(rotated);
      await writeFile(file, "line1\nline2");
      expect(await read()).toBeUndefined();
      await rm(file);
      expect(await read()).toBeUndefined(); // revoked/removed ⇒ not_configured, fail closed
      expect(await secretReader({ TELEGRAM_BOT_TOKEN_FILE: "relative/path" }, "TELEGRAM_BOT_TOKEN", 0)()).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("a revoked token (provider 401) is a permanent failure that never reveals the token", async () => {
    const out = await send(tg(async () => res(401, { ok: false, error_code: 401, description: `Unauthorized ${TOKEN}` })));
    expect(out).toEqual({ kind: "permanent", code: "provider_auth_failed" });
    expect(JSON.stringify(out)).not.toContain(TOKEN);
  });
  it("secret cache honours its ttl (one read inside the window)", async () => {
    const env = { TELEGRAM_BOT_TOKEN: TOKEN };
    const read = secretReader(env, "TELEGRAM_BOT_TOKEN", 60000);
    expect(await read()).toBe(TOKEN);
    env.TELEGRAM_BOT_TOKEN = "";
    expect(await read()).toBe(TOKEN);
  });
});
