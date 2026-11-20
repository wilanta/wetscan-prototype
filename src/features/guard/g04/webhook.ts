import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { validGuardBranch } from "../live/revision";

/** Hard cap on accepted raw bytes. GitHub allows up to 25 MB; Guard only needs a few small fields, so larger bodies are refused. */
export const MAX_WEBHOOK_BYTES = 1024 * 1024;
export const handledEvents = ["push", "pull_request", "installation", "installation_repositories", "check_run", "ping"] as const;
export type HandledEvent = (typeof handledEvents)[number];

export class WebhookError extends Error {
  constructor(
    readonly code: "not_configured" | "bad_request" | "payload_too_large" | "unsupported_media" | "signature_invalid" | "malformed_payload" | "delivery_conflict",
    readonly status: number,
  ) {
    super(code);
  }
}
const err = (code: WebhookError["code"], status: number): never => {
  throw new WebhookError(code, status);
};

/** Secrets are read from the environment only. The previous secret allows rotation without dropping deliveries. */
export function webhookSecrets(env: Record<string, string | undefined> = process.env): string[] {
  const out = [env.GITHUB_APP_WEBHOOK_SECRET, env.GITHUB_APP_WEBHOOK_SECRET_PREVIOUS].filter((s): s is string => !!s);
  if (!out.length || out.some((s) => Buffer.byteLength(s) < 20)) return err("not_configured", 503);
  return out;
}
export function signatureFor(secret: string, body: Uint8Array) {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}
/** Constant-time check over the RAW request bytes. Only the sha256 header is accepted (never the legacy sha1 one). */
export function verifySignature(secrets: string[], header: string | null, body: Uint8Array) {
  if (!header || !/^sha256=[a-f0-9]{64}$/.test(header)) return err("signature_invalid", 401);
  const given = Buffer.from(header);
  let ok = false;
  for (const s of secrets) {
    const expected = Buffer.from(signatureFor(s, body));
    // No early exit between secrets: the loop cost does not reveal which one matched.
    if (expected.length === given.length && timingSafeEqual(expected, given)) ok = true;
  }
  if (!ok) err("signature_invalid", 401);
}
/** Reads at most MAX_WEBHOOK_BYTES: a missing or lying Content-Length cannot make the handler buffer more. */
export async function readRaw(request: Request, limit = MAX_WEBHOOK_BYTES): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) return err("payload_too_large", 413);
  if (!request.body) return err("bad_request", 400);
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return err("payload_too_large", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export interface Envelope {
  event: HandledEvent;
  deliveryId: string;
  payloadSha256: string;
  payload: unknown;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Verifies headers + signature, THEN parses. Nothing in the body is trusted before the signature is valid. */
export function openEnvelope(headers: Headers, raw: Uint8Array, secrets: string[]): Envelope {
  if (!(headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return err("unsupported_media", 415);
  const event = headers.get("x-github-event"),
    deliveryId = headers.get("x-github-delivery");
  if (!event || !(handledEvents as readonly string[]).includes(event) || !deliveryId || !uuid.test(deliveryId)) return err("bad_request", 400);
  verifySignature(secrets, headers.get("x-hub-signature-256"), raw);
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(raw).toString("utf8"));
  } catch {
    return err("malformed_payload", 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return err("malformed_payload", 400);
  return { event: event as HandledEvent, deliveryId: deliveryId.toLowerCase(), payloadSha256: createHash("sha256").update(raw).digest("hex"), payload };
}

export type Normalized =
  | {
      kind: "scan";
      source: "pull_request" | "push" | "check_rerun";
      repositoryId: string;
      repositoryName: string;
      installationId: number;
      /** Branch that holds the commit (PR: the head ref). Policy protection is matched on `protectBranch`. */
      branch: string;
      protectBranch: string;
      commit: string;
      prNumber?: number;
      forced?: boolean;
      unsupported?: "fork_pull_request";
    }
  | { kind: "pr_closed"; repositoryId: string; installationId: number; prNumber: number }
  | { kind: "installation"; installationId: number; action: string }
  | { kind: "installation_repositories"; installationId: number; added: string[]; removed: string[] }
  | { kind: "ignored"; reason: string; repositoryId?: string; installationId?: number };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : err("malformed_payload", 400));
const posInt = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : err("malformed_payload", 400));
const repoId = (v: unknown) => String(posInt(v));
const sha = (v: unknown) => (typeof v === "string" && /^[a-f0-9]{40}$/.test(v) ? v : err("malformed_payload", 400));
const name = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(v) ? v : err("malformed_payload", 400));
const branchName = (v: unknown) => (validGuardBranch(v) ? v : err("malformed_payload", 400));
const zero = "0".repeat(40);

/** `appId` is Guard's own GitHub App id: events about Guard's own checks never start new work (no feedback loops). */
export function normalize(e: Envelope, appId: number): Normalized {
  const p = obj(e.payload);
  const action = typeof p.action === "string" ? p.action : "";
  const inst = p.installation === undefined ? undefined : posInt(obj(p.installation).id);
  if (e.event === "ping") return { kind: "ignored", reason: "ping" };
  if (e.event === "installation") {
    if (inst === undefined) return err("malformed_payload", 400);
    return ["created", "deleted", "suspend", "unsuspend", "new_permissions_accepted"].includes(action)
      ? { kind: "installation", installationId: inst, action }
      : { kind: "ignored", reason: "installation_action_" + action.slice(0, 40), installationId: inst };
  }
  if (e.event === "installation_repositories") {
    if (inst === undefined) return err("malformed_payload", 400);
    const ids = (v: unknown) => (Array.isArray(v) && v.length <= 500 ? v.map((r) => repoId(obj(r).id)) : err("malformed_payload", 400));
    return { kind: "installation_repositories", installationId: inst, added: ids(p.repositories_added ?? []), removed: ids(p.repositories_removed ?? []) };
  }
  const repo = obj(p.repository),
    repositoryId = repoId(repo.id),
    repositoryName = name(repo.full_name);
  if (inst === undefined) return { kind: "ignored", reason: "no_installation", repositoryId };
  if (e.event === "push") {
    const ref = p.ref;
    if (typeof ref !== "string" || !ref.startsWith("refs/heads/")) return { kind: "ignored", reason: "not_a_branch_push", repositoryId, installationId: inst };
    const after = sha(p.after);
    if (p.deleted === true || after === zero) return { kind: "ignored", reason: "branch_deleted", repositoryId, installationId: inst };
    const branch = branchName(ref.slice("refs/heads/".length));
    return { kind: "scan", source: "push", repositoryId, repositoryName, installationId: inst, branch, protectBranch: branch, commit: after, forced: p.forced === true };
  }
  if (e.event === "pull_request") {
    const pr = obj(p.pull_request),
      number = posInt(pr.number);
    if (action === "closed") return { kind: "pr_closed", repositoryId, installationId: inst, prNumber: number };
    if (!["opened", "reopened", "synchronize", "ready_for_review"].includes(action)) return { kind: "ignored", reason: "pull_request_action_" + action.slice(0, 40), repositoryId, installationId: inst };
    if (pr.draft === true && action !== "ready_for_review") return { kind: "ignored", reason: "draft_pull_request", repositoryId, installationId: inst };
    const head = obj(pr.head),
      base = obj(pr.base),
      headRepo = head.repo === null ? null : obj(head.repo);
    const common = { kind: "scan" as const, source: "pull_request" as const, repositoryId, repositoryName, installationId: inst, commit: sha(head.sha), prNumber: number };
    const protectBranch = branchName(base.ref);
    // A fork's head branch does not exist in the base repository, so the installation could not (and must not) read it.
    if (!headRepo || repoId(headRepo.id) !== repositoryId) return { ...common, branch: protectBranch, protectBranch, unsupported: "fork_pull_request" };
    return { ...common, branch: branchName(head.ref), protectBranch };
  }
  // check_run: only a re-run request on Guard's OWN check starts work.
  const run = obj(p.check_run),
    app = run.app === undefined || run.app === null ? undefined : obj(run.app);
  if (!app || posInt(app.id) !== appId) return { kind: "ignored", reason: "foreign_check_run", repositoryId, installationId: inst };
  if (action !== "rerequested") return { kind: "ignored", reason: "own_check_event_" + action.slice(0, 40), repositoryId, installationId: inst };
  const suite = run.check_suite === undefined ? {} : obj(run.check_suite),
    prs = Array.isArray(run.pull_requests) ? run.pull_requests : [];
  const pr0 = prs.length ? obj(prs[0]) : undefined,
    head = typeof suite.head_branch === "string" ? suite.head_branch : pr0 ? obj(pr0.head).ref : undefined;
  if (!validGuardBranch(head)) return { kind: "ignored", reason: "ambiguous_check_ref", repositoryId, installationId: inst };
  return {
    kind: "scan",
    source: "check_rerun",
    repositoryId,
    repositoryName,
    installationId: inst,
    branch: head,
    protectBranch: pr0 ? branchName(obj(pr0.base).ref) : head,
    commit: sha(run.head_sha),
    ...(pr0 ? { prNumber: posInt(pr0.number) } : {}),
  };
}
