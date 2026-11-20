import { describe, expect, it } from "vitest";
import { MAX_WEBHOOK_BYTES, WebhookError, normalize, openEnvelope, readRaw, signatureFor, verifySignature, webhookSecrets } from "../../../src/features/guard/g04/webhook";

const SECRET = "s".repeat(40);
const APP = 777;
const DELIVERY = "11111111-2222-3333-4444-555555555555";
const SHA = "a".repeat(40);
const repo = { id: 42, full_name: "o/r" };
const send = (event: string, payload: unknown, over: Record<string, string> = {}, secret = SECRET) => {
  const raw = Buffer.from(JSON.stringify(payload));
  const headers = new Headers({ "content-type": "application/json", "x-github-event": event, "x-github-delivery": DELIVERY, "x-hub-signature-256": signatureFor(secret, raw), ...over });
  return { raw, headers };
};
const open = (event: string, payload: unknown, over: Record<string, string> = {}) => {
  const { raw, headers } = send(event, payload, over);
  return openEnvelope(headers, raw, [SECRET]);
};
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof WebhookError ? e.code : "OTHER";
  }
  return "NO_ERROR";
};

describe("webhook signature and envelope", () => {
  it("accepts a valid signature over the raw bytes and rejects a one-byte change", () => {
    const { raw, headers } = send("push", { a: 1 });
    expect(() => verifySignature([SECRET], headers.get("x-hub-signature-256"), raw)).not.toThrow();
    const tampered = Buffer.from(raw);
    tampered[2] ^= 1;
    expect(code(() => verifySignature([SECRET], headers.get("x-hub-signature-256"), tampered))).toBe("signature_invalid");
  });
  it("rejects missing, malformed, legacy-sha1 and wrong-secret signatures", () => {
    const { raw } = send("push", {});
    for (const h of [null, "", "sha1=" + "a".repeat(40), "sha256=short", "SHA256=" + "a".repeat(64)]) expect(code(() => verifySignature([SECRET], h, raw))).toBe("signature_invalid");
    expect(code(() => verifySignature([SECRET], signatureFor("x".repeat(40), raw), raw))).toBe("signature_invalid");
  });
  it("supports secret rotation via the previous secret", () => {
    const { raw } = send("push", {}, {}, "p".repeat(40));
    expect(() => verifySignature([SECRET, "p".repeat(40)], signatureFor("p".repeat(40), raw), raw)).not.toThrow();
  });
  it("requires configuration: missing or short secrets never fall back to unauthenticated", () => {
    expect(code(() => webhookSecrets({}))).toBe("not_configured");
    expect(code(() => webhookSecrets({ GITHUB_APP_WEBHOOK_SECRET: "short" }))).toBe("not_configured");
    expect(webhookSecrets({ GITHUB_APP_WEBHOOK_SECRET: SECRET })).toEqual([SECRET]);
  });
  it("event allowlist, delivery id format and content type are enforced before signature work", () => {
    expect(code(() => open("workflow_run", {}))).toBe("bad_request");
    expect(code(() => open("push", {}, { "x-github-delivery": "not-a-uuid" }))).toBe("bad_request");
    expect(code(() => open("push", {}, { "content-type": "application/x-www-form-urlencoded" }))).toBe("unsupported_media");
  });
  it("malformed JSON that is correctly signed is rejected, not crashed on", () => {
    const raw = Buffer.from("{nope");
    const headers = new Headers({ "content-type": "application/json", "x-github-event": "push", "x-github-delivery": DELIVERY, "x-hub-signature-256": signatureFor(SECRET, raw) });
    expect(code(() => openEnvelope(headers, raw, [SECRET]))).toBe("malformed_payload");
    const arr = Buffer.from("[]");
    headers.set("x-hub-signature-256", signatureFor(SECRET, arr));
    expect(code(() => openEnvelope(headers, arr, [SECRET]))).toBe("malformed_payload");
  });
  it("enforces the byte limit on declared and on actual size", async () => {
    const big = new Request("http://x/", { method: "POST", body: new Uint8Array(MAX_WEBHOOK_BYTES + 1) });
    await expect(readRaw(big)).rejects.toMatchObject({ code: "payload_too_large" });
    const lying = new Request("http://x/", { method: "POST", body: new Uint8Array(200), headers: { "content-length": "5" } });
    await expect(readRaw(lying, 100)).rejects.toMatchObject({ code: "payload_too_large" });
    const declared = new Request("http://x/", { method: "POST", body: "{}", headers: { "content-length": String(MAX_WEBHOOK_BYTES + 1) } });
    await expect(readRaw(declared)).rejects.toMatchObject({ code: "payload_too_large" });
    expect((await readRaw(new Request("http://x/", { method: "POST", body: "{}" }))).byteLength).toBe(2);
  });
});

describe("webhook normalization", () => {
  const n = (event: string, payload: unknown) => normalize(open(event, payload), APP);
  const pr = (action: string, over: Record<string, unknown> = {}, head: Record<string, unknown> = {}) => ({
    action,
    installation: { id: 9 },
    repository: repo,
    pull_request: { number: 5, draft: false, head: { sha: SHA, ref: "feat/x", repo }, base: { ref: "main" }, ...over, ...(Object.keys(head).length ? { head: { sha: SHA, ref: "feat/x", repo, ...head } } : {}) },
  });
  it("push: exact commit and branch; deleted branches, tags and non-branch refs are ignored", () => {
    expect(n("push", { ref: "refs/heads/main", after: SHA, forced: true, installation: { id: 9 }, repository: repo })).toMatchObject({ kind: "scan", source: "push", branch: "main", commit: SHA, forced: true, installationId: 9, repositoryId: "42" });
    expect(n("push", { ref: "refs/heads/main", after: "0".repeat(40), installation: { id: 9 }, repository: repo })).toMatchObject({ kind: "ignored", reason: "branch_deleted" });
    expect(n("push", { ref: "refs/tags/v1", after: SHA, installation: { id: 9 }, repository: repo })).toMatchObject({ kind: "ignored" });
    expect(code(() => n("push", { ref: "refs/heads/main", after: "ABC", installation: { id: 9 }, repository: repo }))).toBe("malformed_payload");
  });
  it("pull_request: scans head commit, matches protection on the base branch", () => {
    expect(n("pull_request", pr("synchronize"))).toMatchObject({ kind: "scan", source: "pull_request", branch: "feat/x", protectBranch: "main", commit: SHA, prNumber: 5 });
    expect(n("pull_request", pr("closed"))).toMatchObject({ kind: "pr_closed", prNumber: 5 });
    expect(n("pull_request", pr("labeled"))).toMatchObject({ kind: "ignored" });
    expect(n("pull_request", pr("opened", { draft: true }))).toMatchObject({ kind: "ignored", reason: "draft_pull_request" });
    expect(n("pull_request", pr("ready_for_review", { draft: true }))).toMatchObject({ kind: "scan" });
  });
  it("fork pull requests are flagged unsupported instead of being fetched", () => {
    expect(n("pull_request", pr("opened", {}, { repo: { id: 99, full_name: "f/r" } }))).toMatchObject({ kind: "scan", unsupported: "fork_pull_request" });
    const p = pr("opened") as { pull_request: { head: { repo: unknown } } };
    p.pull_request.head.repo = null;
    expect(n("pull_request", p)).toMatchObject({ unsupported: "fork_pull_request" });
  });
  it("check_run: only a rerun of Guard's own check starts work; Guard's own updates never loop", () => {
    const run = (action: string, appId: number) => ({ action, installation: { id: 9 }, repository: repo, check_run: { head_sha: SHA, app: { id: appId }, check_suite: { head_branch: "main" }, pull_requests: [] } });
    expect(n("check_run", run("rerequested", APP))).toMatchObject({ kind: "scan", source: "check_rerun", branch: "main", commit: SHA });
    for (const a of ["created", "completed", "requested_action"]) expect(n("check_run", run(a, APP))).toMatchObject({ kind: "ignored" });
    expect(n("check_run", run("rerequested", 1))).toMatchObject({ kind: "ignored", reason: "foreign_check_run" });
    expect(n("check_run", { ...run("rerequested", APP), check_run: { head_sha: SHA, app: { id: APP }, check_suite: { head_branch: null }, pull_requests: [] } })).toMatchObject({ kind: "ignored", reason: "ambiguous_check_ref" });
  });
  it("installation events map to explicit actions; unknown ones are ignored", () => {
    expect(n("installation", { action: "suspend", installation: { id: 9 } })).toEqual({ kind: "installation", installationId: 9, action: "suspend" });
    expect(n("installation", { action: "weird", installation: { id: 9 } })).toMatchObject({ kind: "ignored" });
    expect(n("installation_repositories", { action: "removed", installation: { id: 9 }, repositories_removed: [{ id: 42 }], repositories_added: [] })).toEqual({ kind: "installation_repositories", installationId: 9, added: [], removed: ["42"] });
    expect(code(() => n("installation", { action: "created" }))).toBe("malformed_payload");
  });
  it("events without an installation are ignored (they cannot be authorized)", () => {
    expect(n("push", { ref: "refs/heads/main", after: SHA, repository: repo })).toMatchObject({ kind: "ignored", reason: "no_installation" });
  });
});
