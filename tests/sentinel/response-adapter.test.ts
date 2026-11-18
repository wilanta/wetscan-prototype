import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  startFixture,
  type Fixture,
} from "../../scripts/sentinel-response-fixture";
import {
  LocalRateLimitAdapter,
  ResponseTargetError,
  adapterForTarget,
  validLoopbackOrigin,
} from "../../src/features/sentinel/response/local-rate-limit-adapter";
import {
  FixtureVerifier,
  decide,
} from "../../src/features/sentinel/response/verifier";
import type {
  ResponseProposal,
  SentinelProjectContext,
} from "../../src/features/sentinel/types";

const token = "t".repeat(24);
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ctx: SentinelProjectContext = {
  scope: { mode: "live", workspaceId: "w", projectId: "github-1" },
  actorId: "github-user-7",
  repositoryId: "1",
  canvasProjectRef: "github-user-7/github-1",
};
const proposal = (
  origin: string,
  actionId = A,
  ttl = 60,
): ResponseProposal => ({
  ...ctx.scope,
  schemaVersion: 1,
  revision: 1,
  actionId,
  incidentId: B,
  targetRef: origin,
  operation: "temporary_rate_limit",
  ttlSeconds: ttl,
  idempotencyKey: "k",
  approval: null,
});
const code = async (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: ResponseTargetError) => e.code,
  );

describe("S05 loopback adapter + verifier (fixture-tested, no external traffic)", () => {
  let f: Fixture;
  let adapter: LocalRateLimitAdapter;
  let verifier: FixtureVerifier;
  beforeEach(async () => {
    f = await startFixture({ token });
    adapter = new LocalRateLimitAdapter({ origin: f.origin, token });
    verifier = new FixtureVerifier({ origin: f.origin });
  });
  afterEach(() => f.stop());

  it("rejects_non_loopback_and_userinfo_urls (SSRF set)", () => {
    for (const bad of [
      "http://169.254.169.254:8080",
      "http://localhost:4000",
      "http://localhost.evil:4000",
      "http://127.0.0.1@evil.com:4000",
      "http://127.0.0.1:4000/path",
      "http://127.0.0.1:4000/",
      "http://[::ffff:127.0.0.1]:4000",
      "http://0.0.0.0:4000",
      "http://10.0.0.1:4000",
      "https://127.0.0.1:4000",
      "http://127.0.0.1:80",
      "http://127.0.0.1:70000",
      "http://127.0.0.1",
      "",
    ])
      expect(validLoopbackOrigin(bad)).toBe(false);
    expect(validLoopbackOrigin("http://127.0.0.1:4999")).toBe(true);
    expect(validLoopbackOrigin("http://[::1]:4999")).toBe(true);
    expect(
      new LocalRateLimitAdapter({ origin: "http://10.0.0.1:4000", token })
        .configured,
    ).toBe(false);
  });
  it("unconfigured adapter is NO-OP and never issues a request", async () => {
    let calls = 0;
    const a = new LocalRateLimitAdapter({
      origin: "",
      token: "",
      fetchImpl: (async () => {
        calls++;
        return new Response();
      }) as typeof fetch,
    });
    expect(a.configured).toBe(false);
    expect(await a.apply(ctx, proposal(f.origin))).toMatchObject({
      status: "not_configured",
    });
    expect(await a.rollback(ctx, A)).toMatchObject({
      status: "not_configured",
    });
    expect(calls).toBe(0);
    // env must equal the DB-approved origin exactly, else NO-OP
    const env = {
      SENTINEL_RESPONSE_BASE_URL: f.origin,
      SENTINEL_RESPONSE_TOKEN: token,
    };
    expect(
      adapterForTarget(env, { origin: f.origin, enabled: true }).configured,
    ).toBe(true);
    expect(
      adapterForTarget(env, { origin: "http://127.0.0.1:1234", enabled: true })
        .configured,
    ).toBe(false);
    expect(
      adapterForTarget(env, { origin: f.origin, enabled: false }).configured,
    ).toBe(false);
    expect(
      adapterForTarget({}, { origin: f.origin, enabled: true }).configured,
    ).toBe(false);
  });
  it("origin_must_equal_the_approved_target and operation fixed", async () => {
    expect(
      await code(adapter.apply(ctx, proposal("http://127.0.0.1:4001"))),
    ).toBe("target_mismatch");
    expect(f.state().active).toBe(false);
  });
  it("apply_is_idempotent_by_actionId, rejects a second action, rollback idempotent and never removes another's limit", async () => {
    const r1 = await adapter.apply(ctx, proposal(f.origin));
    expect(r1).toMatchObject({
      status: "available",
      value: { status: "action_applied", actionId: A },
    });
    const exp = f.state().expiresAt;
    await adapter.apply(ctx, proposal(f.origin)); // same action: no TTL extension
    expect(f.state().expiresAt).toBe(exp);
    expect(await code(adapter.apply(ctx, proposal(f.origin, B)))).toBe(
      "target_conflict",
    );
    expect(await code(adapter.rollback(ctx, B))).toBe("target_conflict");
    expect(f.state().active).toBe(true);
    expect(await adapter.rollback(ctx, A)).toMatchObject({
      value: { status: "rolled_back" },
    });
    expect(await adapter.rollback(ctx, A)).toMatchObject({
      value: { status: "rolled_back" },
    });
    expect(f.state().active).toBe(false);
  });
  it("fixture_self_expires_without_worker", async () => {
    await adapter.apply(ctx, proposal(f.origin, A, 1));
    expect(f.state().active).toBe(true);
    await new Promise((r) => setTimeout(r, 1100));
    expect(f.state().active).toBe(false);
    expect(await adapter.inspect()).toMatchObject({
      value: { active: false, actionId: null },
    });
  });
  it("admin endpoints require the bearer token", async () => {
    const bad = new LocalRateLimitAdapter({
      origin: f.origin,
      token: "x".repeat(24),
    });
    expect(await code(bad.apply(ctx, proposal(f.origin)))).toBe(
      "target_bad_response",
    );
    expect(f.state().active).toBe(false);
  });
  it("outage, timeout, redirect and oversize map to fixed codes", async () => {
    f.setAdminFailure(true);
    expect(await code(adapter.apply(ctx, proposal(f.origin)))).toBe(
      "target_bad_response",
    );
    await f.stop();
    expect(await code(adapter.inspect())).toBe("target_unavailable");
    const slow = new LocalRateLimitAdapter({
      origin: "http://127.0.0.1:4010",
      token,
      timeoutMs: 50,
      fetchImpl: ((_u: unknown, i: RequestInit) =>
        new Promise((_, rej) =>
          i.signal!.addEventListener("abort", () => rej(i.signal!.reason)),
        )) as typeof fetch,
    });
    expect(await code(slow.inspect())).toBe("target_timeout");
    const redirect = new LocalRateLimitAdapter({
      origin: "http://127.0.0.1:4010",
      token,
      fetchImpl: (async (_u: unknown, i: RequestInit) => {
        expect(i.redirect).toBe("error");
        throw new TypeError("redirect");
      }) as typeof fetch,
    });
    expect(await code(redirect.inspect())).toBe("target_unavailable");
    const big = new LocalRateLimitAdapter({
      origin: "http://127.0.0.1:4010",
      token,
      fetchImpl: (async () => new Response("x".repeat(5000))) as typeof fetch,
    });
    expect(await code(big.inspect())).toBe("target_bad_response");
    f = await startFixture({ token }); // so afterEach stop works
  });
  it("token_never_in_errors_or_results", async () => {
    const r = JSON.stringify(await adapter.apply(ctx, proposal(f.origin)));
    expect(r).not.toContain(token);
    const e = await adapter
      .apply(ctx, proposal("http://127.0.0.1:4001"))
      .catch((x) => String(x) + JSON.stringify(x));
    expect(String(e)).not.toContain(token);
  });

  describe("independent verifier", () => {
    const clean = { attackStatus: 200, benignStatus: 200 };
    it("decision table", () => {
      expect(decide(clean, { attackStatus: 429, benignStatus: 200 })).toBe(
        "verified",
      );
      expect(decide(clean, { attackStatus: 200, benignStatus: 200 })).toBe(
        "failed",
      );
      expect(decide(clean, { attackStatus: 429, benignStatus: 500 })).toBe(
        "failed",
      );
      expect(decide(clean, { attackStatus: 429, benignStatus: 429 })).toBe(
        "failed",
      );
      expect(
        decide(clean, {
          attackStatus: null,
          benignStatus: null,
          error: "target_timeout",
        }),
      ).toBe("inconclusive");
      expect(
        decide(
          { attackStatus: 429, benignStatus: 200 },
          { attackStatus: 429, benignStatus: 200 },
        ),
      ).toBe("inconclusive");
      expect(
        decide(
          { attackStatus: 200, benignStatus: 500 },
          { attackStatus: 429, benignStatus: 200 },
        ),
      ).toBe("inconclusive");
      expect(decide(undefined, { attackStatus: 429, benignStatus: 200 })).toBe(
        "inconclusive",
      );
    });
    it("S05-A3: attack blocked + benign allowed ⇒ verified; before apply ⇒ not blocked", async () => {
      const baseline = await verifier.probe(A);
      expect(baseline).toEqual({ attackStatus: 200, benignStatus: 200 });
      await adapter.apply(ctx, proposal(f.origin));
      const v = await verifier.verify(ctx, A, baseline);
      expect(v.value).toMatchObject({
        verificationStatus: "verified",
        maliciousReplayBlocked: true,
        benignControlAllowed: true,
      });
    });
    it("S05-A4: collateral damage ⇒ failed; no limit ⇒ failed; fixture down ⇒ inconclusive", async () => {
      const baseline = await verifier.probe(A);
      expect(
        (await verifier.verify(ctx, A, baseline)).value.verificationStatus,
      ).toBe("failed"); // applied nothing
      await adapter.apply(ctx, proposal(f.origin));
      f.setBenignStatus(500);
      expect((await verifier.verify(ctx, A, baseline)).value).toMatchObject({
        verificationStatus: "failed",
        benignControlAllowed: false,
      });
      f.setBenignStatus(200);
      await f.stop();
      expect((await verifier.verify(ctx, A, baseline)).value).toMatchObject({
        verificationStatus: "inconclusive",
        maliciousReplayBlocked: null,
      });
      f = await startFixture({ token });
    });
    it("verifier_module_holds_no_admin_authority", async () => {
      const src = (await import("node:fs")).readFileSync(
        "src/features/sentinel/response/verifier.ts",
        "utf8",
      );
      expect(src).not.toMatch(
        /SENTINEL_RESPONSE_TOKEN|authorization|LocalRateLimitAdapter|\/admin\//i,
      );
    });
  });
});
