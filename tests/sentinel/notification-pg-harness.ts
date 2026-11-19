import { randomUUID } from "node:crypto";
import pg from "pg";
import { PlatformDatabase } from "../../src/platform/database";
import { PostgresQueue } from "../../src/platform/queue";
import { DetectionStore } from "../../src/features/sentinel/detection/store";
import { TelemetryStore } from "../../src/features/sentinel/telemetry/store";
import { seedRules } from "../../src/features/sentinel/detection/seeds";
import { NotificationStore } from "../../src/features/sentinel/notifications/store";
import { SenderStore } from "../../src/features/sentinel/notifications/sender-store";
import { notificationJobKind, type NotificationChannel, type SenderPort, type SendOutcome } from "../../src/features/sentinel/notifications/model";
import { executeLease } from "../../worker/sentinel/executor";
import { processLease } from "../../worker/notifier/handler";
import { adminUrl, setupHarness, type Harness } from "./response-pg-harness";
import type { SentinelProjectContext } from "../../src/features/sentinel/types";

const pw = "s05_local_only_pw";
export interface NotificationHarness extends Harness {
  notifier: PlatformDatabase;
  store: NotificationStore;
  other: SentinelProjectContext;
  /** Real S03→S04 pipeline: ingest an event, process the detection job, return the incident created in that transaction. */
  trigger(ctx: SentinelProjectContext, o?: { severity?: "low" | "medium" | "high"; origin?: "runtime" | "controlled_test" }): Promise<string>;
  /** Claims outbox jobs with the notifier role and runs the real lease handler against the provided mock senders. */
  drain(ctx: SentinelProjectContext, senders: Partial<Record<NotificationChannel, SenderPort>>, limit?: number): Promise<string[]>;
  /** Pull `available_at` and any lease into the past: simulates elapsed backoff / a crashed worker, no sleeping. */
  expire(): Promise<void>;
  /** Test hygiene: park every unfinished outbox job/ledger row so claim order is deterministic (history is kept). */
  quiesce(): Promise<void>;
  /** Configure + consent + test-send + enable a channel through the real API store and notifier. */
  enableChannel(ctx: SentinelProjectContext, channel: NotificationChannel, destination: string, extra?: Record<string, unknown>): Promise<void>;
}
export const accepted = (id = "1001"): SenderPort["send"] => async () => ({ kind: "accepted", providerMessageId: id, acceptedAt: new Date().toISOString() });
export const sender = (channel: NotificationChannel, fn: (n: number) => SendOutcome | Promise<SendOutcome>) => {
  const calls: { destination: string; text: string; deliveryId: string }[] = [];
  const port: SenderPort & { calls: typeof calls } = {
    channel,
    calls,
    async send(input) {
      calls.push({ destination: input.destination, text: input.text, deliveryId: input.deliveryId });
      return fn(calls.length);
    },
  };
  return port;
};
const hex = () => randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");

export async function setupNotificationHarness(opts: { dbPrefix?: string } = {}): Promise<NotificationHarness> {
  const h = await setupHarness({ seedIncident: false, dbPrefix: opts.dbPrefix });
  const url = adminUrl();
  const notifierPool = new pg.Pool({ host: url.hostname, port: Number(url.port || 5432), database: h.dbName, user: "wetscan_sentinel_notifier", password: pw, max: 3 });
  const notifier = new PlatformDatabase(notifierPool, true);
  const telemetry = new TelemetryStore(h.app);
  const other: SentinelProjectContext = {
    scope: { mode: "live", workspaceId: h.context.scope.workspaceId, projectId: "github-998736529" },
    actorId: "github-user-7",
    repositoryId: "998736529",
    canvasProjectRef: "github-user-7/github-998736529",
  };
  const sources = new Map<string, { credential: string }>();
  async function source(ctx: SentinelProjectContext, origin: "runtime" | "controlled_test") {
    const k = `${ctx.scope.projectId}:${origin}`;
    if (!sources.has(k)) sources.set(k, await telemetry.create(ctx, { name: `S06 ${origin}`, environment: "local", origin, retentionDays: 7, rateLimit: 1000 }));
    return sources.get(k)!;
  }
  // Both projects must be registered (binding rows come from the first source creation).
  await source(h.context, "controlled_test");
  await source(other, "controlled_test");
  const detection = new DetectionStore(h.app);
  const activeRules = new Map<string, string[]>();
  const store = new NotificationStore(h.app);
  const nh: NotificationHarness = {
    ...h,
    notifier,
    store,
    other,
    async trigger(ctx, o = {}) {
      // One live rule at a time per project: earlier test rules would otherwise open extra incidents for the new event.
      for (const prior of activeRules.get(ctx.scope.projectId) ?? []) await detection.command(ctx, { action: "disable", ruleId: prior, expectedRevision: 2 });
      activeRules.set(ctx.scope.projectId, []);
      const key = await source(ctx, o.origin ?? "controlled_test");
      const created = await detection.command(ctx, {
        action: "create",
        definition: { ...seedRules[3].definition, name: `S06 rule ${randomUUID().slice(0, 8)}`, severity: o.severity ?? "high", threshold: 1, windowSeconds: 3600, cooldownSeconds: 0 },
      });
      const ruleId = (created as { ruleId: string }).ruleId;
      await detection.command(ctx, { action: "enable", ruleId, expectedRevision: 1 });
      activeRules.set(ctx.scope.projectId, [ruleId]);
      const now = new Date().toISOString();
      await telemetry.ingest(key.credential, {
        schemaVersion: 1,
        batchId: randomUUID(),
        sentAt: now,
        events: [{ schemaVersion: 1, eventId: randomUUID(), projectId: ctx.scope.projectId, occurredAt: now, kind: "http.request", request: { method: "GET", routeTemplate: "/api/test", statusCode: 500 } }],
      });
      const queue = new PostgresQueue(h.worker, ctx.scope, ["sentinel.telemetry.accepted"]);
      const [lease] = await queue.claim({ module: "sentinel", workerId: "s06-seed-worker", limit: 1, leaseMs: 30000 });
      const r = await executeLease(
        queue,
        lease,
        async (_j, sig, cur) => {
          await new DetectionStore(h.worker).process(cur(), sig, { correlateIncidents: true });
        },
        { heartbeatMs: 5000, timeoutMs: 15000, signal: new AbortController().signal },
      );
      if (r !== "completed") throw new Error("seed_failed");
      const row = await h.admin.query(
        "SELECT incident_id FROM sentinel.incidents WHERE project_id=$1 AND rule_id=$2 ORDER BY last_observed_at DESC LIMIT 1",
        [ctx.scope.projectId, ruleId],
      );
      return row.rows[0].incident_id as string;
    },
    async drain(ctx, senders, limit = 10) {
      const queue = new PostgresQueue(notifier, ctx.scope, [notificationJobKind]);
      const sstore = new SenderStore(notifier, queue);
      const map = new Map(Object.entries(senders) as [NotificationChannel, SenderPort][]);
      const results: string[] = [];
      const leases = await queue.claim({ module: "sentinel", workerId: "s06-notifier-test", limit: Math.min(limit, 2), leaseMs: 30000 });
      for (const lease of leases)
        results.push(
          await executeLease(queue, lease, (_j, sig, cur) => processLease(sstore, map, cur, sig), {
            heartbeatMs: 5000,
            timeoutMs: 15000,
            signal: new AbortController().signal,
          }),
        );
      await sstore.sweep(ctx.scope);
      return results;
    },
    async expire() {
      await h.admin.query("UPDATE platform.jobs SET available_at=clock_timestamp()-interval '1 second' WHERE state='queued'");
      await h.admin.query("UPDATE platform.jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE state='leased'");
    },
    async enableChannel(ctx, channel, destination, extra = {}) {
      await store.command(ctx, { action: "save_channel", channel, destination, consent: true, ...extra });
      const t = (await store.command(ctx, { action: "test", channel, idempotencyKey: hex().slice(0, 64) })) as { deliveryId: string };
      const out = await nh.drain(ctx, { [channel]: sender(channel, () => ({ kind: "accepted", providerMessageId: "test-1", acceptedAt: new Date().toISOString() })) });
      if (out.join() !== "completed" && !t.deliveryId) throw new Error("test_send_failed");
      const cur = (await store.channels(ctx)).find((c) => c.channel === channel)!;
      await store.command(ctx, { action: "save_channel", channel, expectedRevision: cur.revision, enabled: true });
    },
    async quiesce() {
      await h.admin.query("UPDATE platform.notification_outbox SET state='failed',finished_at=now() WHERE state='pending'");
      await h.admin.query("UPDATE platform.jobs SET state='cancelled',cancel_requested=true,finished_at=now(),lease_owner=NULL,lease_token=NULL,lease_until=NULL WHERE kind='sentinel.outbox' AND state IN ('queued','leased')");
      await h.admin.query("UPDATE sentinel.notification_deliveries SET state='suppressed',reason='test_quiesced',finished_at=now(),next_attempt_at=NULL WHERE state IN ('pending','attempted','unknown') AND finished_at IS NULL");
    },
    async close() {
      await notifierPool.end().catch(() => undefined);
      await h.close();
    },
  };
  return nh;
}
export const newKey = hex;
