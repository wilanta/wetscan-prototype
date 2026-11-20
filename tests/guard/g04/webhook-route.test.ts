import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const ingest = vi.fn(async () => ({ status: 202, outcome: "enqueued" }));
let disabled = false;
vi.mock("../../../src/features/guard/g04/runtime", () => ({
  G04Disabled: class G04Disabled extends Error {},
  g04Host: async () => {
    if (disabled) throw new (await import("../../../src/features/guard/g04/runtime")).G04Disabled();
    return { api: { ingest } };
  },
}));
import { webhookHandler } from "../../../src/features/guard/g04/http";
import { signatureFor, MAX_WEBHOOK_BYTES } from "../../../src/features/guard/g04/webhook";

const SECRET = "w".repeat(40);
const body = JSON.stringify({ zen: "x" });
const req = (over: { body?: string | Uint8Array; headers?: Record<string, string>; sign?: boolean } = {}) => {
  const b = over.body ?? body;
  const bytes = typeof b === "string" ? Buffer.from(b) : b;
  return new Request("http://localhost/api/guard/webhooks/github", {
    method: "POST",
    body: bytes,
    headers: { "content-type": "application/json", "x-github-event": "ping", "x-github-delivery": "11111111-2222-3333-4444-555555555555", ...(over.sign === false ? {} : { "x-hub-signature-256": signatureFor(SECRET, bytes) }), ...over.headers },
  });
};
beforeEach(() => {
  process.env.GITHUB_APP_WEBHOOK_SECRET = SECRET;
  disabled = false;
  ingest.mockClear();
});
const json = async (r: Response) => (await r.json()) as Record<string, string>;

describe("POST /api/guard/webhooks/github", () => {
  it("valid signature reaches ingest and returns only the outcome", async () => {
    const r = await webhookHandler(req());
    expect(r.status).toBe(202);
    expect(await json(r)).toEqual({ outcome: "enqueued" });
    expect(ingest).toHaveBeenCalledOnce();
  });
  it("missing/invalid signature is 401 and never reaches ingest", async () => {
    for (const r of [await webhookHandler(req({ sign: false })), await webhookHandler(req({ headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) } }))]) {
      expect(r.status).toBe(401);
      expect(await json(r)).toEqual({ error: "signature_invalid" });
    }
    expect(ingest).not.toHaveBeenCalled();
  });
  it("oversize body is 413 before any parsing; wrong media type is 415; disallowed event is 400", async () => {
    expect((await webhookHandler(req({ body: new Uint8Array(MAX_WEBHOOK_BYTES + 1) }))).status).toBe(413);
    expect((await webhookHandler(req({ headers: { "content-type": "text/plain" } }))).status).toBe(415);
    expect((await webhookHandler(req({ headers: { "x-github-event": "workflow_run" } }))).status).toBe(400);
    expect(ingest).not.toHaveBeenCalled();
  });
  it("unconfigured secret or disabled G04 fails closed with 503 (no unauthenticated fallback)", async () => {
    delete process.env.GITHUB_APP_WEBHOOK_SECRET;
    expect((await webhookHandler(req())).status).toBe(503);
    process.env.GITHUB_APP_WEBHOOK_SECRET = SECRET;
    disabled = true;
    const r = await webhookHandler(req());
    expect(r.status).toBe(503);
    expect(await json(r)).toEqual({ error: "g04_disabled" });
    expect(ingest).not.toHaveBeenCalled();
  });
  it("rate limiting is surfaced as 429 with Retry-After so GitHub shows the failed delivery", async () => {
    ingest.mockResolvedValueOnce({ status: 429, outcome: "rate_limited" });
    const r = await webhookHandler(req());
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("300");
  });
});
