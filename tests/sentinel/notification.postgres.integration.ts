import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import pg from "pg";
import { PlatformDatabase } from "../../src/platform/database";
import { PostgresOutbox } from "../../src/platform/outbox";
import { PostgresQueue } from "../../src/platform/queue";
import {
  produceIncidentOpened,
  retainNotifications,
} from "../../src/features/sentinel/notifications/store";
import { SenderStore } from "../../src/features/sentinel/notifications/sender-store";
import { runNotifier } from "../../worker/notifier/runtime";
import { migrationPlan } from "../../src/platform/migrations";
import { notificationJobKind } from "../../src/features/sentinel/notifications/model";
import { workerConfig } from "../../src/platform/config";
import {
  newKey,
  sender,
  setupNotificationHarness,
  type NotificationHarness,
} from "./notification-pg-harness";

/** Throwaway PostgreSQL + real S03→S04 pipeline + real notifier lease handler. Provider = in-process mock sender (no network). */
let h: NotificationHarness;
beforeAll(async () => {
  h = await setupNotificationHarness();
});
afterAll(async () => {
  await h?.close();
});
beforeEach(async () => {
  await h?.quiesce();
});
const rows = async (sql: string, v: unknown[] = []) =>
  (await h.admin.query(sql, v)).rows;
const ledger = (ctx = h.context) =>
  rows(
    "SELECT * FROM sentinel.notification_deliveries WHERE project_id=$1 ORDER BY created_at,delivery_id",
    [ctx.scope.projectId],
  );
const allChannels = async (id: string) =>
  rows(
    "SELECT * FROM sentinel.notification_deliveries WHERE subject_ref=$1 ORDER BY channel",
    [id],
  );
const incidentLedger = async (id: string) =>
  (await allChannels(id)).filter((r) => r.channel === "telegram");
const counts = async () => ({
  ledger: Number(
    (await rows("SELECT count(*) n FROM sentinel.notification_deliveries"))[0]
      .n,
  ),
  outbox: Number(
    (await rows("SELECT count(*) n FROM platform.notification_outbox"))[0].n,
  ),
  jobs: Number(
    (
      await rows(
        "SELECT count(*) n FROM platform.jobs WHERE kind='sentinel.outbox'",
      )
    )[0].n,
  ),
});
const ok = (id = "42") =>
  sender("telegram", () => ({
    kind: "accepted",
    providerMessageId: id,
    acceptedAt: new Date().toISOString(),
  }));
const ch = async (ctx = h.context, channel = "telegram") =>
  (await h.store.channels(ctx)).find((c) => c.channel === channel)!;
const patch = async (
  p: Record<string, unknown>,
  ctx = h.context,
  channel = "telegram",
) =>
  h.store.command(ctx, {
    action: "save_channel",
    channel,
    expectedRevision: (await ch(ctx, channel)).revision,
    ...p,
  });
const job = async (deliveryId: string) =>
  (
    await rows(
      "SELECT j.state,j.attempts,j.last_error FROM platform.jobs j JOIN platform.notification_outbox o USING(module,mode,workspace_id,project_id,job_id) WHERE o.delivery_id=$1",
      [deliveryId],
    )
  )[0];
const attempts = (deliveryId: string) =>
  rows(
    "SELECT outcome FROM platform.notification_attempts WHERE delivery_id=$1 ORDER BY attempt",
    [deliveryId],
  );
const MIN = 60000;

describe("S06 channel configuration (API store, app role)", () => {
  it("a new project has no config: nothing is enabled, WhatsApp is unavailable", async () => {
    const list = await h.store.channels(h.context);
    expect(
      list.map((c) => [c.channel, c.enabled, c.destinationVerified]),
    ).toEqual([
      ["telegram", false, false],
      ["email", false, false],
      ["whatsapp", false, false],
    ]);
    expect(list[2].available).toBe(false);
    await expect(
      h.store.command(h.context, {
        action: "save_channel",
        channel: "whatsapp",
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: "channel_unavailable" });
  });
  it("enabling needs consent AND a provider-accepted test to the current destination; destination change resets both", async () => {
    await h.store.command(h.context, {
      action: "save_channel",
      channel: "telegram",
      destination: "123456789",
    });
    let c = await ch();
    expect(c.destinationMasked).toBe("…6789");
    expect(JSON.stringify(c)).not.toContain("123456789");
    await expect(patch({ enabled: true })).rejects.toMatchObject({
      code: "consent_required",
    });
    await expect(
      h.store.command(h.context, {
        action: "test",
        channel: "telegram",
        idempotencyKey: newKey(),
      }),
    ).rejects.toMatchObject({ code: "consent_required" });
    await patch({ consent: true });
    await expect(patch({ enabled: true })).rejects.toMatchObject({
      code: "destination_not_verified",
    });
    await expect(
      h.store.command(h.context, {
        action: "save_channel",
        channel: "telegram",
        expectedRevision: 1,
        minSeverity: "low",
      }),
    ).rejects.toMatchObject({ code: "revision_conflict" });
    const key = newKey();
    const t = (await h.store.command(h.context, {
      action: "test",
      channel: "telegram",
      idempotencyKey: key,
    })) as { deliveryId: string };
    expect(
      await h.store.command(h.context, {
        action: "test",
        channel: "telegram",
        idempotencyKey: key,
      }),
    ).toMatchObject({ deliveryId: t.deliveryId, duplicate: true });
    expect((await counts()).jobs).toBe(1);
    const s = ok("tg-test-1");
    await h.drain(h.context, { telegram: s });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0].text).toContain("[WetScan TEST]");
    expect((await ledger())[0]).toMatchObject({
      state: "provider_accepted",
      provider_message_id: "tg-test-1",
      delivered_at: null,
      trigger: "test",
    });
    expect(await job(t.deliveryId)).toMatchObject({ state: "completed" });
    expect((await ch()).destinationVerified).toBe(true);
    await patch({ enabled: true });
    expect((await ch()).enabled).toBe(true);
    // Changing the destination fails closed: consent, enablement and verification are all gone.
    await patch({ destination: "987654321" });
    c = await ch();
    expect([c.enabled, c.consentAt, c.destinationVerified]).toEqual([
      false,
      null,
      false,
    ]);
    await h.enableChannel(h.context, "telegram", "123456789", {
      expectedRevision: c.revision,
    });
    expect(await ch()).toMatchObject({
      enabled: true,
      destinationVerified: true,
    });
    const audit = await rows(
      "SELECT event_type FROM sentinel.notification_audit",
    );
    expect(audit.map((a) => a.event_type)).toEqual(
      expect.arrayContaining([
        "channel_configured",
        "consent_granted",
        "test_requested",
        "channel_enabled",
        "destination_changed",
      ]),
    );
    await patch({ includeControlledTest: true, throttlePerHour: 60 });
  });
  it("rejects invalid or injected destinations and unknown fields", async () => {
    for (const destination of ["abc", "@somechannel", "12", "1234 5678"])
      await expect(
        h.store.command(h.context, {
          action: "save_channel",
          channel: "telegram",
          destination,
        }),
      ).rejects.toMatchObject({ code: "invalid_destination" });
    for (const destination of ["a@b.com\r\nBcc: x@y.zz", "no-at-sign", "a@b"])
      await expect(
        h.store.command(h.context, {
          action: "save_channel",
          channel: "email",
          destination,
        }),
      ).rejects.toMatchObject({ code: "invalid_destination" });
    await expect(
      h.store.command(h.context, {
        action: "save_channel",
        channel: "telegram",
        workspaceId: "x",
      }),
    ).rejects.toMatchObject({ code: "invalid_payload" });
    await expect(
      h.store.command(h.context, {
        action: "save_channel",
        channel: "telegram",
        quiet: {
          enabled: true,
          timezone: "Not/AZone",
          start: "22:00",
          end: "06:00",
        },
      }),
    ).rejects.toMatchObject({ code: "invalid_timezone" });
  });
});

describe("S06-A1 duplicate alert / incident / outbox replay", () => {
  it("one incident ⇒ one ledger row, one outbox row, one job; replays and concurrent produces add nothing; one provider call", async () => {
    const before = await counts();
    const incidentId = await h.trigger(h.context, { severity: "high" });
    const after = await counts();
    expect([
      after.ledger - before.ledger,
      after.outbox - before.outbox,
      after.jobs - before.jobs,
    ]).toEqual([1, 1, 1]);
    const [d] = await incidentLedger(incidentId);
    expect(d).toMatchObject({
      channel: "telegram",
      state: "pending",
      trigger: "incident_opened",
      origin: "controlled_test",
      reason: null,
    });
    // Replay 1: the same producer, twice and concurrently, inside worker transactions.
    const notice = {
      incidentId,
      title: "x",
      severity: "high" as const,
      origin: "controlled_test" as const,
    };
    await Promise.all(
      [1, 2, 3].map(() =>
        h.worker.scoped(h.context.scope, (tx) =>
          produceIncidentOpened(h.worker, tx, h.context.scope, notice),
        ),
      ),
    );
    // Replay 2: S01 outbox replay with the same idempotency key is a duplicate, never a second row.
    const outbox = new PostgresOutbox(new PostgresQueue(h.app));
    const dup = await h.app.scoped(h.context.scope, (tx) =>
      outbox.append(tx, {
        schemaVersion: 1,
        module: "sentinel",
        ...h.context.scope,
        deliveryId: d.delivery_id,
        topic: "notification.telegram",
        subjectRef: incidentId,
        idempotencyKey: `notif:telegram:incident:${incidentId}:opened`,
        availableAt: new Date(d.next_attempt_at).toISOString(),
      }),
    );
    expect(dup.duplicate).toBe(true);
    expect(await counts()).toEqual(after);
    // Delivery: exactly one provider call, then nothing left to claim.
    const s = ok("m-1");
    await h.drain(h.context, { telegram: s });
    await h.drain(h.context, { telegram: s });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]).toMatchObject({ destination: "123456789" });
    expect(s.calls[0].text).toContain("HIGH incident opened");
    expect((await incidentLedger(incidentId))[0]).toMatchObject({
      state: "provider_accepted",
      provider_message_id: "m-1",
      delivered_at: null,
      attempt_count: 1,
    });
    expect(await attempts(d.delivery_id)).toEqual([{ outcome: "accepted" }]);
  });
});

describe("S06-A2 provider errors, retries, crash/restart", () => {
  it("429 → 5xx → timeout → accepted: bounded jittered backoff, one attempt row per try, no phantom delivery", async () => {
    const id = await h.trigger(h.context);
    const [d] = await incidentLedger(id);
    const s = sender("telegram", (n) =>
      n === 1
        ? { kind: "retryable", code: "rate_limited", retryAfterMs: 5000 }
        : n === 2
          ? { kind: "retryable", code: "provider_5xx" }
          : n === 3
            ? { kind: "retryable", code: "network_or_timeout", ambiguous: true }
            : {
                kind: "accepted",
                providerMessageId: "m-2",
                acceptedAt: new Date().toISOString(),
              },
    );
    await h.drain(h.context, { telegram: s });
    let cur = (await incidentLedger(id))[0];
    expect(cur).toMatchObject({
      state: "attempted",
      reason: "rate_limited",
      provider_accepted_at: null,
      attempt_count: 1,
    });
    expect(new Date(cur.next_attempt_at).getTime()).toBeGreaterThan(
      Date.now() + 4000,
    ); // honours retry-after
    await h.drain(h.context, { telegram: s });
    expect(s.calls).toHaveLength(1); // backoff holds the job: no immediate hammering
    await h.expire();
    await h.drain(h.context, { telegram: s });
    expect((await incidentLedger(id))[0]).toMatchObject({
      state: "attempted",
      reason: "provider_5xx",
    });
    await h.expire();
    await h.drain(h.context, { telegram: s });
    expect((await incidentLedger(id))[0]).toMatchObject({
      state: "unknown",
      reason: "network_or_timeout",
      provider_accepted_at: null,
    });
    await h.expire();
    await h.drain(h.context, { telegram: s });
    cur = (await incidentLedger(id))[0];
    expect(cur).toMatchObject({
      state: "provider_accepted",
      provider_message_id: "m-2",
      attempt_count: 4,
      reason: null,
      dead_letter: false,
    });
    expect((await attempts(d.delivery_id)).map((a) => a.outcome)).toEqual([
      "failed",
      "failed",
      "failed",
      "accepted",
    ]);
    expect(await job(d.delivery_id)).toMatchObject({
      state: "completed",
      attempts: 4,
    });
  });
  it("exhausted retries dead-letter after exactly 5 attempts; ambiguous ends are `unknown`, never `failed`", async () => {
    const a = await h.trigger(h.context);
    const s = sender("telegram", () => ({
      kind: "retryable",
      code: "provider_5xx",
    }));
    for (let i = 0; i < 7; i++) {
      await h.drain(h.context, { telegram: s });
      await h.expire();
    }
    expect(s.calls).toHaveLength(5);
    const [da] = await incidentLedger(a);
    expect(da).toMatchObject({
      state: "failed",
      dead_letter: true,
      reason: "retries_exhausted_provider_5xx",
      attempt_count: 5,
    });
    expect(await job(da.delivery_id)).toMatchObject({
      state: "failed",
      attempts: 5,
    });
    expect(
      (
        await rows(
          "SELECT state FROM platform.notification_outbox WHERE delivery_id=$1",
          [da.delivery_id],
        )
      )[0].state,
    ).toBe("failed");
    expect(await attempts(da.delivery_id)).toHaveLength(5);

    const b = await h.trigger(h.context);
    const amb = sender("telegram", () => ({
      kind: "retryable",
      code: "network_or_timeout",
      ambiguous: true,
    }));
    for (let i = 0; i < 7; i++) {
      await h.drain(h.context, { telegram: amb });
      await h.expire();
    }
    expect((await incidentLedger(b))[0]).toMatchObject({
      state: "unknown",
      dead_letter: true,
      provider_accepted_at: null,
    });
  });
  it("permanent provider rejection and missing provider configuration fail closed immediately (no retry)", async () => {
    const a = await h.trigger(h.context);
    const s = sender("telegram", () => ({
      kind: "permanent",
      code: "destination_rejected",
    }));
    await h.drain(h.context, { telegram: s });
    await h.expire();
    await h.drain(h.context, { telegram: s });
    expect(s.calls).toHaveLength(1);
    const [da] = await incidentLedger(a);
    expect(da).toMatchObject({
      state: "failed",
      reason: "destination_rejected",
      dead_letter: true,
    });
    expect((await job(da.delivery_id)).state).toBe("cancelled");
    const b = await h.trigger(h.context);
    await h.drain(h.context, {}); // no sender loaded for telegram
    const [db] = await incidentLedger(b);
    expect(db).toMatchObject({
      state: "failed",
      reason: "provider_not_configured",
      dead_letter: true,
    });
    expect(await attempts(db.delivery_id)).toEqual([
      { outcome: "not_configured" },
    ]);
  });
  it("a manual retry of a failed delivery creates ONE new intent linked by retry_of; replays/concurrent retries are idempotent", async () => {
    const [failed] = await rows(
      "SELECT * FROM sentinel.notification_deliveries WHERE state='failed' AND reason='destination_rejected'",
    );
    const key = newKey();
    const r1 = (await h.store.command(h.context, {
      action: "retry",
      deliveryId: failed.delivery_id,
      idempotencyKey: key,
    })) as { deliveryId: string };
    expect(
      await h.store.command(h.context, {
        action: "retry",
        deliveryId: failed.delivery_id,
        idempotencyKey: key,
      }),
    ).toMatchObject({ deliveryId: r1.deliveryId, duplicate: true });
    await expect(
      h.store.command(h.context, {
        action: "retry",
        deliveryId: failed.delivery_id,
        idempotencyKey: newKey(),
      }),
    ).rejects.toMatchObject({ code: "retry_in_progress" });
    const s = ok("m-retry");
    await h.drain(h.context, { telegram: s });
    expect(
      (
        await rows(
          "SELECT * FROM sentinel.notification_deliveries WHERE delivery_id=$1",
          [r1.deliveryId],
        )
      )[0],
    ).toMatchObject({
      state: "provider_accepted",
      trigger: "manual_retry",
      retry_of: failed.delivery_id,
    });
    // original stays failed (history preserved); an accepted delivery cannot be retried
    expect(
      (
        await rows(
          "SELECT state FROM sentinel.notification_deliveries WHERE delivery_id=$1",
          [failed.delivery_id],
        )
      )[0].state,
    ).toBe("failed");
    await expect(
      h.store.command(h.context, {
        action: "retry",
        deliveryId: r1.deliveryId,
        idempotencyKey: newKey(),
      }),
    ).rejects.toMatchObject({ code: "invalid_state" });
  });
  it("worker crash after the durable `attempted` mark: reclaim records the unknown outcome and re-sends once; never a phantom accept", async () => {
    const id = await h.trigger(h.context);
    const queue = new PostgresQueue(h.notifier, h.context.scope, [
      notificationJobKind,
    ]);
    const store = new SenderStore(h.notifier, queue);
    const [lease] = await queue.claim({
      module: "sentinel",
      workerId: "crashing-notifier",
      limit: 1,
      leaseMs: 30000,
    });
    const prepared = await store.prepare(lease);
    expect(prepared.kind).toBe("send"); // …provider call would be here; the process dies before settle()
    expect((await incidentLedger(id))[0]).toMatchObject({
      state: "attempted",
      provider_accepted_at: null,
    });
    await h.expire();
    const s = ok("m-after-crash");
    await h.drain(h.context, { telegram: s });
    const [d] = await incidentLedger(id);
    expect(s.calls).toHaveLength(1);
    expect(d).toMatchObject({
      state: "provider_accepted",
      provider_message_id: "m-after-crash",
      attempt_count: 2,
    });
  });
  it("lease expiry exhaustion (poison) is swept to `unknown` dead letter, never to a delivered/accepted state", async () => {
    const id = await h.trigger(h.context);
    const queue = new PostgresQueue(h.notifier, h.context.scope, [
      notificationJobKind,
    ]);
    const store = new SenderStore(h.notifier, queue);
    for (let i = 0; i < 5; i++) {
      const [lease] = await queue.claim({
        module: "sentinel",
        workerId: "crash-loop",
        limit: 1,
        leaseMs: 30000,
      });
      await store.prepare(lease);
      await h.expire();
    }
    await queue.claim({
      module: "sentinel",
      workerId: "crash-loop",
      limit: 1,
      leaseMs: 30000,
    }); // lease-expiry sweep marks the job failed
    expect(await store.sweep(h.context.scope)).toBe(1);
    expect((await incidentLedger(id))[0]).toMatchObject({
      state: "unknown",
      reason: "attempts_exhausted_outcome_unknown",
      dead_letter: true,
      provider_accepted_at: null,
    });
  });
});

describe("S06-A3 disabled channel, quiet hours, consent, filters, wrong project", () => {
  it("quiet hours (explicit timezone) defer the intent; send-time re-check keeps deferring until the window is removed", async () => {
    const now = new Date();
    const m = now.getUTCHours() * 60 + now.getUTCMinutes();
    const hhmm = (x: number) =>
      `${String(Math.floor(((x + 1440) % 1440) / 60)).padStart(2, "0")}:${String(((x + 1440) % 1440) % 60).padStart(2, "0")}`;
    await patch({
      throttlePerHour: 60,
      quiet: {
        enabled: true,
        timezone: "UTC",
        start: hhmm(m - 10),
        end: hhmm(m + 50),
      },
    });
    const id = await h.trigger(h.context);
    const [d] = await incidentLedger(id);
    expect(d).toMatchObject({
      state: "pending",
      reason: "deferred_quiet_hours",
    });
    expect(new Date(d.next_attempt_at).getTime()).toBeGreaterThan(
      Date.now() + 30 * MIN,
    );
    const s = ok("m-quiet");
    await h.drain(h.context, { telegram: s });
    expect(s.calls).toHaveLength(0);
    await h.expire(); // simulated clock jump past available_at while the window is still active
    await h.drain(h.context, { telegram: s });
    expect(s.calls).toHaveLength(0);
    expect((await incidentLedger(id))[0].reason).toBe("deferred_quiet_hours");
    await patch({ quiet: { enabled: false } });
    await h.expire();
    await h.drain(h.context, { telegram: s });
    expect(s.calls).toHaveLength(1);
    expect((await incidentLedger(id))[0].state).toBe("provider_accepted");
  });
  it("disabled channel, missing consent, severity floor, controlled-test exclusion and throttle each suppress with an accurate reason and create NO outbox/job", async () => {
    const before = await counts();
    // email: configured but never consented
    await h.store.command(h.context, {
      action: "save_channel",
      channel: "email",
      destination: "owner@example.com",
    });
    // telegram: disabled
    await patch({ enabled: false });
    const a = await h.trigger(h.context);
    const la = await allChannels(a);
    expect(la.map((r) => [r.channel, r.state, r.reason])).toEqual([
      ["email", "suppressed", "consent_missing"],
      ["telegram", "suppressed", "channel_disabled"],
    ]);
    expect(la.every((r) => r.finished_at && !r.next_attempt_at)).toBe(true);
    // re-enable (verified destination persists) and test the remaining filters
    await patch({ enabled: true, minSeverity: "high" });
    const low = await h.trigger(h.context, { severity: "low" });
    expect((await incidentLedger(low))[0]).toMatchObject({
      state: "suppressed",
      reason: "severity_below_minimum",
    });
    await patch({ includeControlledTest: false });
    const ct = await h.trigger(h.context, { severity: "high" });
    expect((await incidentLedger(ct))[0]).toMatchObject({
      reason: "controlled_test_excluded",
    });
    await patch({ includeControlledTest: true, throttlePerHour: 1 });
    const recent = Number(
      (
        await rows(
          "SELECT count(*) n FROM sentinel.notification_deliveries WHERE channel='telegram' AND state<>'suppressed' AND created_at>now()-interval '1 hour'",
        )
      )[0].n,
    );
    expect(recent).toBeGreaterThan(1);
    const th = await h.trigger(h.context);
    expect((await incidentLedger(th))[0]).toMatchObject({
      state: "suppressed",
      reason: "throttled",
    });
    await patch({ throttlePerHour: 60 });
    // None of the suppressed intents ever reached the queue
    const after = await counts();
    expect(after.ledger - before.ledger).toBeGreaterThan(5);
    expect(after.jobs).toBe(after.outbox);
    const suppressedWithJob = await rows(
      "SELECT 1 FROM sentinel.notification_deliveries d JOIN platform.notification_outbox o ON o.delivery_id=d.delivery_id WHERE d.state='suppressed'",
    );
    expect(suppressedWithJob).toHaveLength(0);
  });
  it("runtime-origin incidents are sent without the controlled-test opt-in", async () => {
    await patch({ includeControlledTest: false });
    const id = await h.trigger(h.context, { origin: "runtime" });
    expect((await incidentLedger(id))[0]).toMatchObject({
      state: "pending",
      origin: "runtime",
    });
    const s = ok("m-rt");
    await h.drain(h.context, { telegram: s });
    expect(s.calls).toHaveLength(1);
    await patch({ includeControlledTest: true });
  });
  it("wrong project: configuration and deliveries never cross projects", async () => {
    const before = (await ledger()).length;
    const id = await h.trigger(h.other); // project B has no channels
    expect(await allChannels(id)).toHaveLength(0);
    expect((await h.store.deliveries(h.other)).length).toBe(0);
    expect((await ledger()).length).toBe(before);
    expect(
      (await h.store.channels(h.other)).every(
        (c) => !c.enabled && c.revision === 0,
      ),
    ).toBe(true);
    // B enables its own channel to its own destination: A's intents never get B's destination and vice versa
    await h.enableChannel(h.other, "telegram", "555000111", {
      includeControlledTest: true,
    });
    const a = await h.trigger(h.context);
    const b = await h.trigger(h.other);
    const sa = ok("a"),
      sb = ok("b");
    await h.drain(h.context, { telegram: sa });
    await h.drain(h.other, { telegram: sb });
    expect(sa.calls.map((c) => c.destination)).toEqual(["123456789"]);
    expect(sb.calls.map((c) => c.destination)).toEqual(["555000111"]);
    expect((await incidentLedger(a))[0].project_id).toBe(
      h.context.scope.projectId,
    );
    expect((await incidentLedger(b))[0].project_id).toBe(
      h.other.scope.projectId,
    );
    expect(
      (await h.store.deliveries(h.context)).every((d) => d.subjectRef !== b),
    ).toBe(true);
  });
});

describe("S06-A7 revocation, destination change and tenant/role isolation", () => {
  it("consent revoked / destination changed AFTER enqueue ⇒ suppressed at send time, provider never called", async () => {
    const a = await h.trigger(h.context);
    await patch({ consent: false });
    const s = ok("never");
    await h.drain(h.context, { telegram: s });
    expect(s.calls).toHaveLength(0);
    const [da] = await incidentLedger(a);
    expect(da).toMatchObject({
      state: "suppressed",
      reason: "consent_missing",
    });
    expect((await job(da.delivery_id)).state).toBe("cancelled");
    await h.enableChannel(h.context, "telegram", "123456789", {
      expectedRevision: (await ch()).revision,
      includeControlledTest: true,
    });
    const b = await h.trigger(h.context);
    await patch({ destination: "222333444", consent: true });
    await h.drain(h.context, { telegram: s });
    expect(s.calls).toHaveLength(0);
    expect((await incidentLedger(b))[0]).toMatchObject({
      state: "suppressed",
      reason: "destination_changed",
    });
    await h.enableChannel(h.context, "telegram", "123456789", {
      expectedRevision: (await ch()).revision,
      includeControlledTest: true,
    });
  });
  it("role boundaries: app cannot forge states, notifier cannot write config/consent, worker cannot advance state, CHECKs hold", async () => {
    const sc = h.context.scope;
    const ins = (
      db: PlatformDatabase,
      state: string,
      trigger: string,
      key: string,
      scope = sc,
    ) =>
      db.scoped(scope, (tx) =>
        db.query(
          tx,
          `INSERT INTO sentinel.notification_deliveries(mode,workspace_id,project_id,delivery_id,channel,trigger,subject_ref,origin,dedup_key,state,provider_message_id,provider_accepted_at,created_by) VALUES($1,$2,$3,$4,'telegram',$5,'x','runtime',$6,$7,'m',clock_timestamp(),'t')`,
          [
            scope.mode,
            scope.workspaceId,
            scope.projectId,
            key,
            trigger,
            key,
            state,
          ],
        ),
      );
    await expect(
      ins(h.app, "provider_accepted", "test", "forge-1"),
    ).rejects.toThrow(); // app may only create `pending` test/retry requests
    await expect(
      ins(h.app, "pending", "incident_opened", "forge-2"),
    ).rejects.toThrow(); // …and never an incident intent
    await expect(
      ins(h.worker, "provider_accepted", "incident_opened", "forge-3"),
    ).rejects.toThrow(); // producer: pending/suppressed only
    await expect(
      ins(h.notifier, "pending", "test", "forge-4"),
    ).rejects.toThrow(); // sender has no INSERT
    await expect(
      h.notifier.scoped(sc, (tx) =>
        h.notifier.query(
          tx,
          "UPDATE sentinel.notification_channels SET enabled=true,consent_at=now(),consent_by='x'",
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      h.worker.scoped(sc, (tx) =>
        h.worker.query(
          tx,
          "UPDATE sentinel.notification_deliveries SET state='delivered'",
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      h.app.scoped(sc, (tx) =>
        h.app.query(
          tx,
          "UPDATE sentinel.notification_deliveries SET state='delivered'",
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      h.app.scoped(sc, (tx) =>
        h.app.query(tx, "DELETE FROM sentinel.notification_audit"),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      h.app.scoped(sc, (tx) =>
        h.app.query(tx, "UPDATE sentinel.notification_audit SET summary='x'"),
      ),
    ).rejects.toThrow(/permission denied/);
    // delivered requires evidence; WhatsApp can never be enabled; enabled requires consent+destination (DB-level, even for the owner role)
    await expect(
      h.admin.query(
        `UPDATE sentinel.notification_deliveries SET state='delivered',delivered_at=now() WHERE delivery_id=(SELECT delivery_id FROM sentinel.notification_deliveries WHERE state='provider_accepted' LIMIT 1)`,
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      h.admin.query(
        `INSERT INTO sentinel.notification_channels(mode,workspace_id,project_id,channel,enabled,destination,destination_hash,consent_at,consent_by) VALUES('live',$1,$2,'whatsapp',true,'+62811111','${"a".repeat(64)}',now(),'x')`,
        [sc.workspaceId, sc.projectId],
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      h.admin.query(
        `UPDATE sentinel.notification_channels SET consent_at=NULL WHERE channel='telegram'`,
      ),
    ).rejects.toThrow(/check constraint/);
  });
  it("RLS: wrong/unset scope sees and writes nothing; notifier sees only outbox jobs of its scope; cross-scope updates affect 0 rows", async () => {
    const own = (await ledger()).length;
    expect(own).toBeGreaterThan(5);
    const read = (db: PlatformDatabase, scope = h.other.scope) =>
      db.scoped(
        scope,
        async (tx) =>
          (
            await db.query(
              tx,
              "SELECT count(*)::int n FROM sentinel.notification_deliveries WHERE project_id=$1",
              [h.context.scope.projectId],
            )
          ).rows[0].n,
      );
    expect(await read(h.app)).toBe(0);
    expect(await read(h.notifier)).toBe(0);
    // no scope at all (plain transaction): policies require wetscan.* settings
    expect(
      await h.app.transaction(
        async (tx) =>
          (
            await h.app.query(
              tx,
              "SELECT count(*)::int n FROM sentinel.notification_deliveries",
            )
          ).rows[0].n,
      ),
    ).toBe(0);
    expect(
      await h.notifier.transaction(
        async (tx) =>
          (
            await h.notifier.query(
              tx,
              "SELECT count(*)::int n FROM platform.jobs",
            )
          ).rows[0].n,
      ),
    ).toBe(0);
    const upd = await h.notifier.scoped(
      h.other.scope,
      async (tx) =>
        (
          await h.notifier.query(
            tx,
            "UPDATE sentinel.notification_deliveries SET reason='x' WHERE project_id=$1",
            [h.context.scope.projectId],
          )
        ).rowCount,
    );
    expect(upd).toBe(0);
    const telemetryJobs = Number(
      (
        await rows(
          "SELECT count(*) n FROM platform.jobs WHERE kind<>'sentinel.outbox' AND project_id=$1",
          [h.context.scope.projectId],
        )
      )[0].n,
    );
    expect(telemetryJobs).toBeGreaterThan(0);
    const visible = await h.notifier.scoped(h.context.scope, async (tx) =>
      (
        await h.notifier.query(tx, "SELECT DISTINCT kind FROM platform.jobs")
      ).rows.map((r) => r.kind),
    );
    expect(visible).toEqual(["sentinel.outbox"]);
    await expect(
      h.notifier.scoped(h.context.scope, (tx) =>
        h.notifier.query(tx, "UPDATE platform.module_limits SET max_running=2"),
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("down migration refuses while any notification row exists; the 0006 plan hash is distinct from the reviewed S04/S05 prefixes", async () => {
    const full = await migrationPlan();
    const s05 = await migrationPlan("0005_response");
    expect(full.sha256).not.toBe(s05.sha256);
    const { applyMigrations } = await import("../../src/platform/migrations");
    const url = new URL(process.env.SENTINEL_S05_PG_ADMIN_URL!);
    const migrator = new pg.Pool({
      host: url.hostname,
      port: Number(url.port),
      database: h.dbName,
      user: "wetscan_migrator",
      password: "s05_local_only_pw",
      max: 1,
    });
    await expect(
      applyMigrations(migrator, full.migrations, "down"),
    ).rejects.toThrow();
    expect(
      (
        await rows(
          "SELECT version FROM platform.schema_migrations ORDER BY version",
        )
      ).map((r) => r.version),
    ).toContain("0006_notifications");
    await migrator.end();
  });
});

describe("S06 retention (worker role)", () => {
  it("deletes only terminal ledger rows older than the window; pending/attempted rows and fresh history are never touched", async () => {
    const mk = (id: string, state: string, age: string, fin: boolean) =>
      h.admin.query(
        `INSERT INTO sentinel.notification_deliveries(mode,workspace_id,project_id,delivery_id,channel,trigger,subject_ref,origin,dedup_key,state,reason,created_by,created_at,finished_at)
         VALUES('live',$1,$2,$3,'telegram','incident_opened','x','runtime',$3,$4,'old','t',now()-$5::interval,${fin ? "now()-$5::interval" : "NULL"})`,
        [
          h.context.scope.workspaceId,
          h.context.scope.projectId,
          id,
          state,
          age,
        ],
      );
    await mk("ret-old-failed", "failed", "40 days", true);
    await mk("ret-old-suppressed", "suppressed", "40 days", true);
    await mk("ret-fresh-failed", "failed", "1 day", true);
    await mk("ret-old-pending", "pending", "40 days", false);
    expect(await retainNotifications(h.worker, h.context.scope, 30)).toBe(2);
    const left = (
      await rows(
        "SELECT delivery_id FROM sentinel.notification_deliveries WHERE delivery_id LIKE 'ret-%' ORDER BY delivery_id",
      )
    ).map((r) => r.delivery_id);
    expect(left).toEqual(["ret-fresh-failed", "ret-old-pending"]);
    // wrong-scope worker pass cannot delete this project's rows
    expect(await retainNotifications(h.worker, h.other.scope, 1)).toBe(0);
    await h.admin.query(
      "DELETE FROM sentinel.notification_deliveries WHERE delivery_id LIKE 'ret-%'",
    );
  });
});

describe("S06 worker lane: real runNotifier loop, clean startup/shutdown", () => {
  it("claims outbox jobs, sends through the injected sender, and stops cleanly; the producer never calls a provider", async () => {
    const id = await h.trigger(h.context);
    const s = ok("m-lane");
    const url = new URL(process.env.SENTINEL_S05_PG_ADMIN_URL!);
    const pool = new pg.Pool({
      host: url.hostname,
      port: Number(url.port),
      database: h.dbName,
      user: "wetscan_sentinel_notifier",
      password: "s05_local_only_pw",
      max: 2,
    });
    const events: string[] = [];
    await runNotifier({
      db: new PlatformDatabase(pool, true),
      pool,
      migrations: (await migrationPlan()).migrations,
      options: workerConfig({
        SENTINEL_WORKER_POLL_MS: "100",
        SENTINEL_WORKER_HEARTBEAT_MS: "1000",
        SENTINEL_JOB_LEASE_MS: "10000",
        SENTINEL_JOB_TIMEOUT_MS: "5000",
      }),
      activation: {
        scope: h.context.scope,
        notBefore: "2020-01-01T00:00:00.000Z",
        channels: ["telegram"],
      },
      senders: new Map([["telegram", s]]),
      workerId: "lane-test",
      control: new EventEmitter(),
      healthPort: 0,
      once: true,
      report: (e) => events.push(e.phase),
    });
    expect(events).toEqual(["started", "shutdown_requested", "stopped"]);
    expect(s.calls).toHaveLength(1);
    expect((await incidentLedger(id))[0]).toMatchObject({
      state: "provider_accepted",
      provider_message_id: "m-lane",
    });
  });
});
