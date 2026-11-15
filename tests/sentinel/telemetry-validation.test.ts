import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  credentialRoute,
  hash,
  issueCredential,
  kinds,
  limits,
  parseBatch,
  redactRoute,
  sameHash,
  sourceInput,
  timestamp,
} from "../../src/features/sentinel/telemetry/validation";
import { referenceEmitter } from "../../src/features/sentinel/telemetry/emitter";
import { scope } from "../platform/helpers";
const now = Date.parse("2026-11-14T08:00:00.000Z");
export function batch(at = now) {
  return {
    schemaVersion: 1,
    batchId: randomUUID(),
    sentAt: new Date(at).toISOString(),
    events: [
      {
        schemaVersion: 1,
        eventId: randomUUID(),
        projectId: scope.projectId,
        kind: "http.request",
        occurredAt: new Date(at).toISOString(),
      },
    ],
  };
}
describe("S02 strict telemetry validation (offline)", () => {
  it.each(kinds)("accepts frozen v1 family %s", (kind) => {
    const input = batch();
    input.events[0].kind = kind;
    expect(parseBatch(input, scope.projectId, now).events[0].kind).toBe(kind);
  });
  it.each([-limits.pastMs, limits.futureMs])(
    "accepts exact clock boundary %i",
    (offset) =>
      expect(
        parseBatch(batch(now + offset), scope.projectId, now).events,
      ).toHaveLength(1),
  );
  it.each([-limits.pastMs - 1, limits.futureMs + 1])(
    "rejects outside clock boundary %i",
    (offset) =>
      expect(() =>
        parseBatch(batch(now + offset), scope.projectId, now),
      ).toThrow("outside_clock_window"),
  );
  it.each(["unknown", "incident.created", "guard.scan_completed"])(
    "rejects unapproved family %s",
    (kind) => {
      const b = batch();
      b.events[0].kind = kind;
      expect(() => parseBatch(b, scope.projectId, now)).toThrow(
        "invalid_event",
      );
    },
  );
  it("rejects producer scope spoofing and demo inputs", () => {
    expect(() => parseBatch(batch(), "github-999", now)).toThrow(
      "invalid_event",
    );
    expect(() =>
      parseBatch({ ...batch(), workspaceId: "other" }, scope.projectId, now),
    ).toThrow("invalid_payload");
    expect(() =>
      parseBatch({ ...batch(), schemaVersion: 2 }, scope.projectId, now),
    ).toThrow("invalid_batch");
  });
  it("rejects empty, oversized and duplicate-ID batches", () => {
    const b = batch();
    for (const events of [
      [],
      Array(26).fill(b.events[0]),
      [b.events[0], b.events[0]],
    ])
      expect(() =>
        parseBatch({ ...b, events }, scope.projectId, now),
      ).toThrow();
  });
  it.each(["headers", "body", "authorization", "ip", "email", "sourceId"])(
    "rejects sensitive or untrusted event field %s",
    (key) => {
      const b = batch();
      expect(() =>
        parseBatch(
          { ...b, events: [{ ...b.events[0], [key]: "secret" }] },
          scope.projectId,
          now,
        ),
      ).toThrow("invalid_payload");
    },
  );
  it("redacts secrets before canonicalization and removes actor/provenance claims", () => {
    const b = batch();
    const safe = parseBatch(
      {
        ...b,
        events: [
          {
            ...b.events[0],
            actorHash: "a".repeat(64),
            request: {
              method: "GET",
              routeTemplate: "/api/users/alice@example.com?token=secret",
              statusCode: 200,
            },
            attributes: {
              reasonCode: "secret-value",
              controlled: true,
              durationMs: 4,
            },
          },
        ],
      },
      scope.projectId,
      now,
    );
    expect(safe.events[0].request?.routeTemplate).toBe("/api/users/:redacted");
    expect(safe.events[0].attributes).toEqual({
      reasonCode: "redacted",
      durationMs: 4,
    });
    expect(JSON.stringify(safe)).not.toMatch(
      /alice|secret|actorHash|controlled/,
    );
  });
  it.each([
    "/api/orders/123?secret=x",
    "/api/users/%61lice#password",
    "/api/token_abcd",
  ])("normalizes private route %s", (route) =>
    expect(redactRoute(route)).not.toMatch(
      /123|secret|alice|token_abcd|password/,
    ),
  );
  it("rejects malformed method/status/attributes and timestamp dates", () => {
    const b = batch();
    for (const extra of [
      { request: { method: "TRACE" } },
      { request: { statusCode: 600 } },
      { attributes: { durationMs: Infinity } },
      { attributes: { password: "secret" } },
      { occurredAt: "2026-02-30T00:00:00Z" },
    ])
      expect(() =>
        parseBatch(
          { ...b, events: [{ ...b.events[0], ...extra }] },
          scope.projectId,
          now,
        ),
      ).toThrow();
    expect(() => timestamp("yesterday")).toThrow();
  });
  it("issues independent high entropy tokens; hint mutation cannot preserve hash", () => {
    const id = randomUUID(),
      a = issueCredential(scope, id),
      b = issueCredential(scope, id);
    expect(a.token).not.toBe(b.token);
    expect(a.digest).toBe(hash(a.token));
    expect(credentialRoute(a.token)).toEqual(a.route);
    expect(sameHash(a.digest, b.digest)).toBe(false);
    expect(sameHash("", a.digest)).toBe(false);
    const parts = a.token.split(".");
    parts[1] = Buffer.from(
      JSON.stringify({ ...a.route, projectId: "github-999" }),
    ).toString("base64url");
    expect(sameHash(hash(parts.join(".")), a.digest)).toBe(false);
  });
  it.each(["", "ws2.invalid." + "0".repeat(64), "x".repeat(1201)])(
    "rejects malformed credential",
    (token) =>
      expect(() => credentialRoute(token)).toThrow("invalid_credential"),
  );
  it("refuses demo credential and unknown routing fields", () => {
    for (const route of [
      { ...scope, mode: "demo" },
      { ...scope, extra: true },
    ]) {
      const token = issueCredential(scope, randomUUID()).token.split(".");
      token[1] = Buffer.from(
        JSON.stringify({
          ...route,
          sourceId: randomUUID(),
          credentialId: randomUUID(),
        }),
      ).toString("base64url");
      expect(() => credentialRoute(token.join("."))).toThrow(
        "invalid_credential",
      );
    }
  });
  it("validates immutable provenance and bounded source configuration", () => {
    expect(
      sourceInput({
        name: "Local owned app",
        environment: "local",
        origin: "controlled_test",
      }),
    ).toMatchObject({ retentionDays: 7, rateLimit: 1000 });
    for (const extra of [
      { origin: "demo" },
      { retentionDays: 31 },
      { rateLimit: 6001 },
      { name: "a".repeat(40) },
      { unexpected: true },
    ])
      expect(() =>
        sourceInput({
          name: "Local",
          environment: "local",
          origin: "runtime",
          ...extra,
        }),
      ).toThrow();
  });
});
describe("opt-in local reference emitter", () => {
  const options = () => ({
    enabled: true,
    ownedApplicationConfirmed: true,
    credential: issueCredential(scope, randomUUID()).token,
    endpoint: "http://127.0.0.1:3000/api/sentinel/ingest",
  });
  it("requires both independent opt-ins before transport", () => {
    const transport = vi.fn();
    expect(() =>
      referenceEmitter({ ...options(), enabled: false }, transport),
    ).toThrow("emitter_opt_in_required");
    expect(() =>
      referenceEmitter(
        { ...options(), ownedApplicationConfirmed: false },
        transport,
      ),
    ).toThrow("emitter_opt_in_required");
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    "https://example.com/api/sentinel/ingest",
    "http://127.0.0.1:3000/wrong",
    "http://user:password@localhost/api/sentinel/ingest",
    "http://localhost/api/sentinel/ingest?key=bad",
  ])("refuses nonlocal/unsafe endpoint", (endpoint) =>
    expect(() => referenceEmitter({ ...options(), endpoint })).toThrow(
      "local_endpoint_required",
    ),
  );
  it("sends redacted events without following redirects; reuses prepared nonce on retry", async () => {
    const transport = vi.fn<typeof fetch>(
        async () => new Response("", { status: 202 }),
      ),
      emitter = referenceEmitter(options(), transport),
      b = emitter.prepare([
        {
          kind: "auth.failed",
          request: { routeTemplate: "/api/users/private?password=secret" },
        },
      ]);
    await emitter.send(b);
    await emitter.send(b);
    const init = transport.mock.calls[0][1] as RequestInit;
    expect(init.redirect).toBe("error");
    expect(init.body).not.toMatch(/private|password|secret/);
    expect(transport.mock.calls[1][1]?.body).toBe(init.body);
  });
});
