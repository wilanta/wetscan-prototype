import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { issueCredential } from "../../src/features/sentinel/telemetry/validation";
import {
  classifyDecoySignal,
  startGhostFixture,
  type GhostFixture,
} from "../../src/features/sentinel/ghost/decoy";
import { scope } from "../platform/helpers";

const fixtures: GhostFixture[] = [];
afterEach(async () => {
  while (fixtures.length) {
    await fixtures.pop()!.stop();
  }
});

describe("S07 Ghost Lite loopback decoy endpoint (H07)", () => {
  it("defaults to disabled (404, zero emissions) until explicitly opted in", async () => {
    const transport = vi.fn<typeof fetch>(
      async () => new Response("", { status: 202 }),
    );
    const cred = issueCredential(scope, randomUUID()).token;
    const fx = await startGhostFixture(
      {
        ingestEndpoint: "http://127.0.0.1:3000/api/sentinel/ingest",
        credential: cred,
      },
      transport,
    );
    fixtures.push(fx);

    expect(fx.isEnabled()).toBe(false);
    const r1 = await fetch(fx.url);
    expect(r1.status).toBe(404);
    expect(transport).not.toHaveBeenCalled();

    // Missing ownedApplicationConfirmed still stays disabled
    fx.setEnabled(true, false);
    expect(fx.isEnabled()).toBe(false);
    expect((await fetch(fx.url)).status).toBe(404);
    expect(transport).not.toHaveBeenCalled();

    // Explicit opt-in activates deterministic harmless response + telemetry emission
    fx.setEnabled(true, true);
    expect(fx.isEnabled()).toBe(true);
    const r2 = await fetch(fx.url);
    expect(r2.status).toBe(200);
    expect(r2.headers.get("cache-control")).toBe("no-store");
    expect(r2.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r2.headers.get("set-cookie")).toBeNull();
    expect(await r2.json()).toMatchObject({
      status: "ok",
      decoy: "controlled_test_inert",
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(fx.stats()).toMatchObject({
      hitsAccepted: 1,
      emissionsSucceeded: 1,
      emissionsFailed: 0,
    });
  });

  it("ignores unknown paths and never emits forbidden metadata (passwords, tokens, cookies, auth headers, bodies, IPs)", async () => {
    const capturedBodies: string[] = [];
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      capturedBodies.push(String(init?.body ?? ""));
      return new Response("", { status: 202 });
    });
    const cred = issueCredential(scope, randomUUID()).token;
    const fx = await startGhostFixture(
      {
        enabled: true,
        ownedApplicationConfirmed: true,
        ingestEndpoint: "http://127.0.0.1:3000/api/sentinel/ingest",
        credential: cred,
      },
      transport,
    );
    fixtures.push(fx);

    // Unknown path returns 404 with 0 emissions
    const unknown = await fetch(`${fx.origin}/api/users/123`);
    expect(unknown.status).toBe(404);
    expect(transport).not.toHaveBeenCalled();

    const correlationId = randomUUID();
    const res = await fetch(
      `${fx.url}?password=SecretPass123!&token=supersecrettoken`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer raw-jwt-secret-value",
          cookie: "session=raw-cookie-secret",
          "x-forwarded-for": "203.0.113.42",
          "x-wetscan-correlation-id": correlationId,
          "x-wetscan-synthetic-test": "1",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          password: "body-password-secret",
          apiKey: "body-key-secret",
        }),
      },
    );
    expect(res.status).toBe(200);
    expect(transport).toHaveBeenCalledTimes(1);
    const body = capturedBodies[0];
    expect(body).not.toMatch(
      /SecretPass123|supersecrettoken|raw-jwt-secret-value|raw-cookie-secret|203\.0\.113\.42|body-password-secret|body-key-secret/,
    );
    const parsed = JSON.parse(body);
    expect(parsed.events[0]).toMatchObject({
      kind: "ghost.decoy_triggered",
      request: {
        method: "POST",
        routeTemplate: "/__wetscan/ghost-decoy",
        statusCode: 200,
      },
      attributes: {
        reasonCode: "decoy_hit",
        decoyPathCategory: "wetscan_decoy",
        signalClassification: "controlled_test_hit",
        correlationId,
      },
    });
    expect(parsed.events[0].actorHash).toBeUndefined();
  });

  it("deduplicates replayed correlation IDs, classifies crawlers without storing User-Agent, and enforces bounded rate limit", async () => {
    const capturedBodies: string[] = [];
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      capturedBodies.push(String(init?.body ?? ""));
      return new Response("", { status: 202 });
    });
    const cred = issueCredential(scope, randomUUID()).token;
    const fx = await startGhostFixture(
      {
        enabled: true,
        ownedApplicationConfirmed: true,
        ingestEndpoint: "http://127.0.0.1:3000/api/sentinel/ingest",
        credential: cred,
        rateLimitPerMinute: 3,
      },
      transport,
    );
    fixtures.push(fx);

    const corr = randomUUID();
    await fetch(fx.url, { headers: { "x-wetscan-correlation-id": corr } });
    // Replay with exact correlation ID: returns deterministic 200, does NOT re-emit
    const replay = await fetch(fx.url, {
      headers: { "x-wetscan-correlation-id": corr },
    });
    expect(replay.status).toBe(200);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(fx.stats().hitsDeduplicated).toBe(1);

    // Benign crawler hit: classified safely without storing User-Agent string
    const bot = await fetch(fx.url, {
      headers: {
        "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)",
      },
    });
    expect(bot.status).toBe(200);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(capturedBodies[1]).not.toContain("Googlebot");
    expect(JSON.parse(capturedBodies[1]).events[0].attributes).toMatchObject({
      signalClassification: "automated_crawler_or_scanner",
    });

    // 4th hit in same minute exceeds rateLimitPerMinute=3 -> 429, no emission
    const limited = await fetch(fx.url);
    expect(limited.status).toBe(429);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(fx.stats().hitsRateLimited).toBe(1);
  });

  it("fails closed without leaking credentials when ingest rejects or endpoint is non-loopback", async () => {
    const errors: string[] = [];
    const transport = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ error: "invalid_credential" }), {
          status: 401,
        }),
    );
    const cred = issueCredential(scope, randomUUID()).token;
    const fx = await startGhostFixture(
      {
        enabled: true,
        ownedApplicationConfirmed: true,
        ingestEndpoint: "http://127.0.0.1:3000/api/sentinel/ingest",
        credential: cred,
        onEmitError: (c) => errors.push(c),
      },
      transport,
    );
    fixtures.push(fx);

    const res = await fetch(fx.url);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(cred);
    expect(errors).toEqual(["emitter_rejected"]);
    expect(fx.stats().emissionsFailed).toBe(1);

    const badFx = await startGhostFixture({
      enabled: true,
      ownedApplicationConfirmed: true,
      ingestEndpoint: "https://evil.example/api/sentinel/ingest",
      credential: cred,
    });
    fixtures.push(badFx);
    await fetch(badFx.url);
    expect(badFx.stats().lastErrorCode).toBe("local_endpoint_required");
  });

  it("classifies signals safely", () => {
    expect(classifyDecoySignal({ "x-wetscan-synthetic-test": "1" })).toBe(
      "controlled_test_hit",
    );
    expect(classifyDecoySignal({ "user-agent": "curl/8.4.0" })).toBe(
      "automated_crawler_or_scanner",
    );
    expect(classifyDecoySignal({ "user-agent": "Mozilla/5.0" })).toBe(
      "decoy_access",
    );
  });
});
