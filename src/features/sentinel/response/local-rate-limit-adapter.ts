import type { ResponsePort } from "../contracts";
import type { ResponseProposal, SentinelProjectContext } from "../types";
import type { ResponseTarget } from "./model";

/** Loopback literal only: no DNS names (rebinding), no userinfo/path/query, fixed port range. */
const originPattern = /^http:\/\/(127\.0\.0\.1|\[::1\]):([1-9]\d{3,4})$/;
export function validLoopbackOrigin(value: unknown): value is string {
  if (typeof value !== "string" || !originPattern.test(value)) return false;
  try {
    const u = new URL(value);
    return (
      u.protocol === "http:" &&
      !u.username &&
      !u.password &&
      u.pathname === "/" &&
      !u.search &&
      !u.hash &&
      Number(u.port) <= 65535 &&
      ["127.0.0.1", "[::1]"].includes(u.hostname)
    );
  } catch {
    return false;
  }
}
/** Fixed machine codes only; target text, URLs and the token never enter errors. */
export class ResponseTargetError extends Error {
  constructor(
    readonly code:
      | "target_unavailable"
      | "target_timeout"
      | "target_bad_response"
      | "target_conflict"
      | "target_mismatch"
      | "not_configured",
  ) {
    super(code);
  }
}
export interface TargetRequestOptions {
  origin: string;
  timeoutMs?: number;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
}
/** One bounded request: no redirects, hard timeout, capped body, JSON only. Shared by adapter and verifier. */
export async function targetRequest(
  o: TargetRequestOptions,
  method: "GET" | "PUT" | "DELETE",
  path: string,
  headers: Record<string, string>,
  body?: unknown,
  signal?: AbortSignal,
): Promise<{ status: number; json: Record<string, unknown> }> {
  if (!validLoopbackOrigin(o.origin))
    throw new ResponseTargetError("not_configured");
  const timeout = AbortSignal.timeout(o.timeoutMs ?? 3000);
  try {
    const res = await (o.fetchImpl ?? fetch)(new URL(path, o.origin), {
      method,
      redirect: "error",
      cache: "no-store",
      headers: {
        ...headers,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
    const text = await res.text();
    if (text.length > (o.maxBytes ?? 4096))
      throw new ResponseTargetError("target_bad_response");
    let json: Record<string, unknown> = {};
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
          json = parsed;
      } catch {
        if (res.status < 300)
          throw new ResponseTargetError("target_bad_response");
      }
    }
    return { status: res.status, json };
  } catch (e) {
    if (e instanceof ResponseTargetError) throw e;
    if ((e as Error)?.name === "TimeoutError")
      throw new ResponseTargetError("target_timeout");
    throw new ResponseTargetError("target_unavailable");
  }
}

export interface AdapterOptions {
  origin: string;
  token: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}
/** Reversible `temporary_rate_limit` on an owner-controlled loopback fixture. The only enforcement adapter in S05. */
export class LocalRateLimitAdapter implements ResponsePort {
  readonly configured: boolean;
  constructor(private readonly o: AdapterOptions) {
    this.configured =
      validLoopbackOrigin(o.origin) &&
      typeof o.token === "string" &&
      o.token.length >= 16;
  }
  private auth() {
    return { authorization: `Bearer ${this.o.token}` };
  }
  private notConfigured() {
    return {
      status: "not_configured" as const,
      backlogId: "S05",
      reason: "NO-OP / NOT_CONFIGURED: response target not approved (H03).",
    };
  }
  async apply(_context: SentinelProjectContext, proposal: ResponseProposal) {
    if (!this.configured) return this.notConfigured();
    // Exact allowlist: the proposal must name this adapter's single approved origin.
    if (
      proposal.targetRef !== this.o.origin ||
      proposal.operation !== "temporary_rate_limit"
    )
      throw new ResponseTargetError("target_mismatch");
    const r = await targetRequest(this.o, "PUT", "/admin/limit", this.auth(), {
      actionId: proposal.actionId,
      ttlSeconds: proposal.ttlSeconds,
    });
    if (r.status === 409) throw new ResponseTargetError("target_conflict");
    if (
      r.status !== 200 ||
      r.json.active !== true ||
      r.json.actionId !== proposal.actionId
    )
      throw new ResponseTargetError("target_bad_response");
    return {
      status: "available" as const,
      value: {
        actionId: proposal.actionId,
        status: "action_applied" as const,
        evidenceIds: [`receipt:${proposal.actionId}`],
      },
    };
  }
  async rollback(_context: SentinelProjectContext, actionId: string) {
    if (!this.configured) return this.notConfigured();
    const r = await targetRequest(
      this.o,
      "DELETE",
      `/admin/limit?actionId=${encodeURIComponent(actionId)}`,
      this.auth(),
    );
    // 409 = a different action's limit is active: never remove someone else's enforcement.
    if (r.status === 409) throw new ResponseTargetError("target_conflict");
    if (r.status !== 200 || r.json.removed === undefined)
      throw new ResponseTargetError("target_bad_response");
    return {
      status: "available" as const,
      value: {
        status: "rolled_back" as const,
        evidenceIds: [`rollback:${actionId}`],
      },
    };
  }
  async inspect() {
    if (!this.configured) return this.notConfigured();
    const r = await targetRequest(this.o, "GET", "/admin/limit", this.auth());
    if (r.status !== 200 || typeof r.json.active !== "boolean")
      throw new ResponseTargetError("target_bad_response");
    return {
      status: "available" as const,
      value: {
        active: r.json.active,
        actionId: typeof r.json.actionId === "string" ? r.json.actionId : null,
        expiresAt:
          typeof r.json.expiresAt === "string" ? r.json.expiresAt : null,
      },
    };
  }
}
/** Env supplies the credential and must match the DB-approved target origin exactly; otherwise NO-OP. */
export function adapterForTarget(
  env: Readonly<Record<string, string | undefined>>,
  target: Pick<ResponseTarget, "origin" | "enabled">,
  fetchImpl?: typeof fetch,
) {
  const token = env.SENTINEL_RESPONSE_TOKEN ?? "";
  const base = env.SENTINEL_RESPONSE_BASE_URL ?? "";
  const ok =
    target.enabled && validLoopbackOrigin(base) && base === target.origin;
  return new LocalRateLimitAdapter({
    origin: ok ? target.origin : "",
    token: ok ? token : "",
    fetchImpl,
  });
}
