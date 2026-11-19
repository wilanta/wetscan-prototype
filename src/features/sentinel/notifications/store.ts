import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { PlatformDatabase } from "../../../platform/database";
import type { TransactionContext } from "../platform-contracts";
import { PostgresOutbox } from "../../../platform/outbox";
import { PostgresQueue } from "../../../platform/queue";
import type { SentinelProjectContext, SentinelScope } from "../types";
import { TelemetryError } from "../telemetry/validation";
import { deterministicUuid } from "../incidents/validation";
import {
  channels,
  destinationHash,
  maskDestination,
  meetsSeverity,
  notificationLimits,
  quietUntil,
  type ChannelConfig,
  type DeliveryPayload,
  type DeliveryState,
  type DeliveryTrigger,
  type NotificationChannel,
  type NotificationSeverity,
} from "./model";
import { notificationCommand, type ChannelPatch } from "./validation";

const where = "mode=$1 AND workspace_id=$2 AND project_id=$3";
const sv = (s: SentinelScope) => [s.mode, s.workspaceId, s.projectId];
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

export interface ChannelView extends Omit<ChannelConfig, "destination" | "destinationHash"> {
  destinationMasked: string | null;
  /** True only when a test message to the CURRENT destination was accepted by the provider. Not a delivery claim. */
  destinationVerified: boolean;
  available: boolean;
  unavailableReason?: string;
}
export interface DeliveryView {
  deliveryId: string;
  channel: NotificationChannel;
  trigger: DeliveryTrigger;
  subjectRef: string;
  origin: "runtime" | "controlled_test";
  state: DeliveryState;
  reason: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  providerAcceptedAt: string | null;
  deliveredAt: string | null;
  /** Provider message id is an acceptance reference only. */
  providerMessageId: string | null;
  deadLetter: boolean;
  retryOf: string | null;
  createdAt: string;
  finishedAt: string | null;
}
function channelOf(r: QueryResultRow): ChannelConfig {
  return {
    channel: r.channel,
    enabled: r.enabled,
    destination: r.destination ?? null,
    destinationHash: r.destination_hash ?? null,
    consentAt: iso(r.consent_at),
    consentBy: r.consent_by ?? null,
    minSeverity: r.min_severity,
    triggers: r.triggers,
    includeControlledTest: r.include_controlled_test,
    quiet: {
      enabled: r.quiet_enabled,
      timezone: r.quiet_timezone ?? null,
      startMinute: r.quiet_start_minute ?? null,
      endMinute: r.quiet_end_minute ?? null,
    },
    throttlePerHour: Number(r.throttle_per_hour),
    revision: Number(r.revision),
  };
}
export function deliveryOf(r: QueryResultRow): DeliveryView {
  return {
    deliveryId: r.delivery_id,
    channel: r.channel,
    trigger: r.trigger,
    subjectRef: r.subject_ref,
    origin: r.origin,
    state: r.state,
    reason: r.reason ?? null,
    attemptCount: Number(r.attempt_count),
    lastAttemptAt: iso(r.last_attempt_at),
    nextAttemptAt: iso(r.next_attempt_at),
    providerAcceptedAt: iso(r.provider_accepted_at),
    deliveredAt: iso(r.delivered_at),
    providerMessageId: r.provider_message_id ?? null,
    deadLetter: r.dead_letter,
    retryOf: r.retry_of ?? null,
    createdAt: iso(r.created_at)!,
    finishedAt: iso(r.finished_at),
  };
}
const q = (db: PlatformDatabase, tx: TransactionContext, sql: string, v: unknown[] = []) => db.query(tx, sql, v);
export const incidentDedupKey = (incidentId: string) => `incident:${incidentId}:opened`;
export const deliveryIdFor = (scope: SentinelScope, channel: NotificationChannel, dedupKey: string) =>
  deterministicUuid({ kind: "sentinel.notification.v1", scope, channel, dedupKey });

/** Inserts a ledger row and, for `pending` intents, appends to the S01 transactional outbox in the SAME transaction. */
async function intend(
  db: PlatformDatabase,
  tx: TransactionContext,
  scope: SentinelScope,
  row: {
    channel: NotificationChannel;
    trigger: DeliveryTrigger;
    subjectRef: string;
    origin: "runtime" | "controlled_test";
    dedupKey: string;
    state: "pending" | "suppressed";
    reason?: string;
    destinationHash: string | null;
    payload: DeliveryPayload;
    createdBy: string;
    retryOf?: string;
    availableAt: Date;
  },
) {
  const deliveryId = deliveryIdFor(scope, row.channel, row.dedupKey);
  const inserted = await q(
    db,
    tx,
    `INSERT INTO sentinel.notification_deliveries(mode,workspace_id,project_id,delivery_id,channel,trigger,subject_ref,origin,dedup_key,state,reason,destination_hash,payload,retry_of,created_by,next_attempt_at,finished_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text,$11,$12,$13,$14,$15,$16,CASE WHEN $10::text='suppressed' THEN clock_timestamp() END) ON CONFLICT(mode,workspace_id,project_id,channel,dedup_key) DO NOTHING RETURNING delivery_id`,
    [
      ...sv(scope),
      deliveryId,
      row.channel,
      row.trigger,
      row.subjectRef,
      row.origin,
      row.dedupKey,
      row.state,
      row.reason ?? null,
      row.destinationHash,
      JSON.stringify(row.payload),
      row.retryOf ?? null,
      row.createdBy,
      row.state === "pending" ? row.availableAt.toISOString() : null,
    ],
  );
  if (!inserted.rowCount) return { deliveryId, duplicate: true };
  if (row.state === "suppressed") return { deliveryId, duplicate: false };
  const outbox = new PostgresOutbox(new PostgresQueue(db));
  // Outbox is itself idempotent (scope+key); a duplicate here would mean the ledger row was lost, never a second send.
  await outbox.append(tx, {
    schemaVersion: 1,
    module: "sentinel",
    ...scope,
    deliveryId,
    topic: `notification.${row.channel}`,
    subjectRef: row.subjectRef,
    idempotencyKey: `notif:${row.channel}:${row.dedupKey}`.slice(0, 240),
    availableAt: row.availableAt.toISOString(),
  });
  return { deliveryId, duplicate: false };
}

export interface IncidentNotice {
  incidentId: string;
  title: string;
  severity: NotificationSeverity;
  origin: "runtime" | "controlled_test";
}
/**
 * Producer: called INSIDE the incident-creating transaction (worker role). One ledger+outbox intent per
 * (project, channel, incident) — replays and duplicate alerts hit the unique dedup key and create nothing.
 * Failures are isolated by a savepoint: notification trouble can never block detection or incident creation.
 */
export async function produceIncidentOpened(
  db: PlatformDatabase,
  tx: TransactionContext,
  scope: SentinelScope,
  incident: IncidentNotice,
  now = new Date(),
) {
  db.requireScope(tx, scope);
  const dedupKey = incidentDedupKey(incident.incidentId);
  const payload: DeliveryPayload = {
    severity: incident.severity,
    title: incident.title.slice(0, notificationLimits.titleChars),
    incidentId: incident.incidentId,
    origin: incident.origin,
  };
  await q(db, tx, "SAVEPOINT notification_producer");
  try {
    const rows = (await q(db, tx, `SELECT * FROM sentinel.notification_channels WHERE ${where}`, sv(scope))).rows.map(channelOf);
    for (const cfg of rows) {
      let state: "pending" | "suppressed" = "suppressed";
      let reason: string | undefined;
      let availableAt = now;
      if (!cfg.enabled) reason = cfg.consentAt ? "channel_disabled" : "consent_missing";
      else if (!cfg.consentAt || !cfg.destination || !cfg.destinationHash) reason = "consent_missing";
      else if (cfg.channel === "whatsapp") reason = "channel_unavailable";
      else if (!cfg.triggers.includes("incident_opened")) reason = "trigger_filtered";
      else if (incident.origin === "controlled_test" && !cfg.includeControlledTest) reason = "controlled_test_excluded";
      else if (!meetsSeverity(incident.severity, cfg.minSeverity)) reason = "severity_below_minimum";
      else {
        const recent = Number(
          (
            await q(
              db,
              tx,
              `SELECT count(*)::int AS n FROM sentinel.notification_deliveries WHERE ${where} AND channel=$4 AND state<>'suppressed' AND created_at>clock_timestamp()-interval '1 hour'`,
              [...sv(scope), cfg.channel],
            )
          ).rows[0].n,
        );
        if (recent >= cfg.throttlePerHour) reason = "throttled";
        else {
          state = "pending";
          const until = quietUntil(now, cfg.quiet);
          if (until) {
            availableAt = new Date(Math.min(until.getTime(), now.getTime() + notificationLimits.quietMaxDeferMs));
            reason = "deferred_quiet_hours";
          }
        }
      }
      await intend(db, tx, scope, {
        channel: cfg.channel,
        trigger: "incident_opened",
        subjectRef: incident.incidentId,
        origin: incident.origin,
        dedupKey,
        state,
        reason,
        destinationHash: cfg.destinationHash,
        payload,
        createdBy: "system:sentinel-worker",
        availableAt,
      });
    }
    await q(db, tx, "RELEASE SAVEPOINT notification_producer");
  } catch {
    await q(db, tx, "ROLLBACK TO SAVEPOINT notification_producer");
    await q(db, tx, "RELEASE SAVEPOINT notification_producer");
    // Best-effort honest ledger: record that enqueue failed instead of silently dropping the notification.
    await q(db, tx, "SAVEPOINT notification_producer_fallback");
    try {
      for (const ch of channels) {
        await q(
          db,
          tx,
          `INSERT INTO sentinel.notification_deliveries(mode,workspace_id,project_id,delivery_id,channel,trigger,subject_ref,origin,dedup_key,state,reason,payload,created_by,finished_at)
           SELECT $1,$2,$3,$5,c.channel,'incident_opened',$6,$7,$8,'suppressed','enqueue_failed',$9,'system:sentinel-worker',clock_timestamp()
           FROM sentinel.notification_channels c WHERE c.mode=$1 AND c.workspace_id=$2 AND c.project_id=$3 AND c.channel=$4 AND c.enabled
           ON CONFLICT DO NOTHING`,
          [...sv(scope), ch, deliveryIdFor(scope, ch, dedupKey), incident.incidentId, incident.origin, dedupKey, JSON.stringify(payload)],
        );
      }
      await q(db, tx, "RELEASE SAVEPOINT notification_producer_fallback");
    } catch {
      await q(db, tx, "ROLLBACK TO SAVEPOINT notification_producer_fallback");
    }
  }
}

export class NotificationStore {
  constructor(readonly db: PlatformDatabase) {}
  private async lockScope(tx: TransactionContext, s: SentinelScope) {
    const b = await q(this.db, tx, `SELECT project_id FROM sentinel.project_bindings WHERE ${where} AND enabled FOR UPDATE`, sv(s));
    if (!b.rowCount) throw new TelemetryError("project_not_registered", 409);
  }
  private async verified(tx: TransactionContext, s: SentinelScope, channel: NotificationChannel, hash: string | null) {
    if (!hash) return false;
    return Boolean(
      (
        await q(
          this.db,
          tx,
          `SELECT 1 FROM sentinel.notification_deliveries WHERE ${where} AND channel=$4 AND trigger='test' AND destination_hash=$5 AND state IN ('provider_accepted','delivered') LIMIT 1`,
          [...sv(s), channel, hash],
        )
      ).rowCount,
    );
  }
  private async audit(tx: TransactionContext, c: SentinelProjectContext, channel: NotificationChannel, event: string, summary: string, metadata: object = {}) {
    await q(
      this.db,
      tx,
      `INSERT INTO sentinel.notification_audit(mode,workspace_id,project_id,audit_id,channel,event_type,actor_id,summary,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [...sv(c.scope), randomUUID(), channel, event, c.actorId, summary, JSON.stringify(metadata)],
    );
  }

  async channels(context: SentinelProjectContext): Promise<ChannelView[]> {
    return this.db.scoped(context.scope, async (tx) => {
      const rows = new Map(
        (await q(this.db, tx, `SELECT * FROM sentinel.notification_channels WHERE ${where}`, sv(context.scope))).rows.map((r) => [r.channel as string, channelOf(r)]),
      );
      const out: ChannelView[] = [];
      for (const channel of channels) {
        const cfg: ChannelConfig = rows.get(channel) ?? {
          channel, enabled: false, destination: null, destinationHash: null, consentAt: null, consentBy: null,
          minSeverity: "high", triggers: ["incident_opened"], includeControlledTest: false,
          quiet: { enabled: false, timezone: null, startMinute: null, endMinute: null }, throttlePerHour: 10, revision: 0,
        };
        const { destination, destinationHash: hash, ...rest } = cfg;
        out.push({
          ...rest,
          destinationMasked: maskDestination(channel, destination),
          destinationVerified: await this.verified(tx, context.scope, channel, hash),
          available: channel !== "whatsapp",
          ...(channel === "whatsapp" ? { unavailableReason: "Requires official WhatsApp Business setup, templates and recipient opt-in (H06). Not configured." } : {}),
        });
      }
      return out;
    });
  }

  async deliveries(context: SentinelProjectContext, limit = 50): Promise<DeliveryView[]> {
    const n = Math.max(1, Math.min(100, Math.trunc(limit)));
    return this.db.scoped(context.scope, async (tx) =>
      (
        await q(this.db, tx, `SELECT * FROM sentinel.notification_deliveries WHERE ${where} ORDER BY created_at DESC,delivery_id DESC LIMIT $4`, [...sv(context.scope), n])
      ).rows.map(deliveryOf),
    );
  }

  async command(context: SentinelProjectContext, input: unknown) {
    const cmd = notificationCommand(input);
    if (cmd.action === "save_channel") return this.saveChannel(context, cmd);
    if (cmd.action === "test") return this.requestTest(context, cmd.channel, cmd.idempotencyKey);
    return this.requestRetry(context, cmd.deliveryId, cmd.idempotencyKey);
  }

  private async saveChannel(context: SentinelProjectContext, p: ChannelPatch & { action: "save_channel" }) {
    if (p.channel === "whatsapp" && (p.enabled || p.destination)) throw new TelemetryError("channel_unavailable", 422);
    return this.db.scoped(context.scope, async (tx) => {
      await this.lockScope(tx, context.scope);
      const s = context.scope;
      const row = (await q(this.db, tx, `SELECT * FROM sentinel.notification_channels WHERE ${where} AND channel=$4 FOR UPDATE`, [...sv(s), p.channel])).rows[0];
      const cur = row ? channelOf(row) : undefined;
      if (cur ? p.expectedRevision !== cur.revision : p.expectedRevision !== undefined) throw new TelemetryError("revision_conflict", 409);
      const destination = p.destination !== undefined ? p.destination : (cur?.destination ?? null);
      const hash = destination ? destinationHash(p.channel, destination) : null;
      const destinationChanged = hash !== (cur?.destinationHash ?? null);
      let consentAt = cur?.consentAt ?? null,
        consentBy = cur?.consentBy ?? null;
      if (p.consent === true) {
        consentAt = new Date().toISOString();
        consentBy = context.actorId;
      } else if (p.consent === false || destinationChanged) {
        // A new/removed destination never inherits consent given for the previous one (fail closed).
        consentAt = null;
        consentBy = null;
      }
      if (p.consent === true && !destination) throw new TelemetryError("destination_required", 422);
      let enabled = p.enabled ?? cur?.enabled ?? false;
      if (p.enabled === true) {
        if (!consentAt || !destination) throw new TelemetryError("consent_required", 422);
        if (!(await this.verified(tx, s, p.channel, hash))) throw new TelemetryError("destination_not_verified", 422);
      } else if (destinationChanged || !consentAt || !destination) enabled = false;
      const quiet = p.quiet
        ? p.quiet.enabled
          ? { enabled: true, timezone: p.quiet.timezone!, startMinute: p.quiet.startMinute!, endMinute: p.quiet.endMinute! }
          : { enabled: false, timezone: null, startMinute: null, endMinute: null }
        : (cur?.quiet ?? { enabled: false, timezone: null, startMinute: null, endMinute: null });
      const values = [
        ...sv(s), p.channel, enabled, destination, hash, consentAt, consentBy,
        p.minSeverity ?? cur?.minSeverity ?? "high",
        p.triggers ?? cur?.triggers ?? ["incident_opened"],
        p.includeControlledTest ?? cur?.includeControlledTest ?? false,
        quiet.enabled, quiet.timezone, quiet.startMinute, quiet.endMinute,
        p.throttlePerHour ?? cur?.throttlePerHour ?? 10,
      ];
      if (!cur)
        await q(this.db, tx, `INSERT INTO sentinel.notification_channels(mode,workspace_id,project_id,channel,enabled,destination,destination_hash,consent_at,consent_by,min_severity,triggers,include_controlled_test,quiet_enabled,quiet_timezone,quiet_start_minute,quiet_end_minute,throttle_per_hour) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`, values);
      else
        await q(this.db, tx, `UPDATE sentinel.notification_channels SET enabled=$5,destination=$6,destination_hash=$7,consent_at=$8,consent_by=$9,min_severity=$10,triggers=$11,include_controlled_test=$12,quiet_enabled=$13,quiet_timezone=$14,quiet_start_minute=$15,quiet_end_minute=$16,throttle_per_hour=$17,revision=revision+1,updated_at=clock_timestamp() WHERE ${where} AND channel=$4`, values);
      const events: [string, string][] = [];
      if (!cur) events.push(["channel_configured", "Channel configured."]);
      if (destinationChanged && cur) events.push(["destination_changed", "Destination changed; consent and enablement reset."]);
      if (p.consent === true) events.push(["consent_granted", "Recipient consent recorded."]);
      if (consentAt === null && cur?.consentAt) events.push(["consent_revoked", "Consent revoked."]);
      if (enabled !== (cur?.enabled ?? false)) events.push([enabled ? "channel_enabled" : "channel_disabled", enabled ? "Channel enabled." : "Channel disabled."]);
      for (const [e, summary] of events) await this.audit(tx, context, p.channel, e, summary);
      return { saved: true, channel: p.channel, revision: (cur?.revision ?? 0) + 1, enabled };
    });
  }

  private async requestTest(context: SentinelProjectContext, channel: NotificationChannel, key: string) {
    if (channel === "whatsapp") throw new TelemetryError("channel_unavailable", 422);
    return this.db.scoped(context.scope, async (tx) => {
      await this.lockScope(tx, context.scope);
      const s = context.scope;
      const row = (await q(this.db, tx, `SELECT * FROM sentinel.notification_channels WHERE ${where} AND channel=$4 FOR UPDATE`, [...sv(s), channel])).rows[0];
      const cfg = row ? channelOf(row) : undefined;
      if (!cfg?.destination || !cfg.destinationHash) throw new TelemetryError("destination_required", 422);
      if (!cfg.consentAt) throw new TelemetryError("consent_required", 422);
      const dedupKey = `test:${key.slice(0, 32)}`;
      const existing = (await q(this.db, tx, `SELECT delivery_id FROM sentinel.notification_deliveries WHERE ${where} AND channel=$4 AND dedup_key=$5`, [...sv(s), channel, dedupKey])).rows[0];
      if (existing) return { deliveryId: existing.delivery_id as string, duplicate: true };
      const recent = Number((await q(this.db, tx, `SELECT count(*)::int AS n FROM sentinel.notification_deliveries WHERE ${where} AND channel=$4 AND trigger='test' AND created_at>clock_timestamp()-interval '1 hour'`, [...sv(s), channel])).rows[0].n);
      if (recent >= 5) throw new TelemetryError("throttled", 429);
      const r = await intend(this.db, tx, s, {
        channel, trigger: "test", subjectRef: "test", origin: "controlled_test", dedupKey, state: "pending",
        destinationHash: cfg.destinationHash, payload: {}, createdBy: context.actorId, availableAt: new Date(),
      });
      await this.audit(tx, context, channel, "test_requested", "Controlled test message requested.", { deliveryId: r.deliveryId });
      return { deliveryId: r.deliveryId, duplicate: r.duplicate };
    });
  }

  private async requestRetry(context: SentinelProjectContext, deliveryId: string, key: string) {
    return this.db.scoped(context.scope, async (tx) => {
      await this.lockScope(tx, context.scope);
      const s = context.scope;
      const src = (await q(this.db, tx, `SELECT * FROM sentinel.notification_deliveries WHERE ${where} AND delivery_id=$4`, [...sv(s), deliveryId])).rows[0]; // no row lock: the app role has no UPDATE on the ledger; the project-binding lock serializes commands
      if (!src) throw new TelemetryError("not_found", 404);
      const dedupKey = `retry:${deliveryId.slice(0, 8)}:${key.slice(0, 24)}`;
      const dup = (await q(this.db, tx, `SELECT delivery_id FROM sentinel.notification_deliveries WHERE ${where} AND channel=$4 AND dedup_key=$5`, [...sv(s), src.channel, dedupKey])).rows[0];
      if (dup) return { deliveryId: dup.delivery_id as string, duplicate: true };
      if (src.trigger === "test" || !["failed", "unknown"].includes(src.state)) throw new TelemetryError("invalid_state", 409);
      const active = await q(this.db, tx, `SELECT 1 FROM sentinel.notification_deliveries WHERE ${where} AND retry_of=$4 AND state IN ('pending','attempted')`, [...sv(s), deliveryId]);
      if (active.rowCount) throw new TelemetryError("retry_in_progress", 409);
      const row = (await q(this.db, tx, `SELECT * FROM sentinel.notification_channels WHERE ${where} AND channel=$4 FOR UPDATE`, [...sv(s), src.channel])).rows[0];
      const cfg = row ? channelOf(row) : undefined;
      if (!cfg?.enabled || !cfg.consentAt || !cfg.destinationHash || src.channel === "whatsapp") throw new TelemetryError("channel_not_ready", 409);
      const r = await intend(this.db, tx, s, {
        channel: src.channel, trigger: "manual_retry", subjectRef: src.subject_ref, origin: src.origin, dedupKey, state: "pending",
        destinationHash: cfg.destinationHash, payload: src.payload, createdBy: context.actorId, retryOf: deliveryId, availableAt: new Date(),
      });
      await this.audit(tx, context, src.channel, "manual_retry_requested", "Manual retry requested.", { retryOf: deliveryId });
      return { deliveryId: r.deliveryId, duplicate: r.duplicate };
    });
  }
}

/** Retention (worker role): terminal ledger rows only; pending/attempted rows are never deleted. */
export async function retainNotifications(db: PlatformDatabase, scope: SentinelScope, days: number = notificationLimits.retentionDays) {
  return db.scoped(scope, async (tx) => {
    db.requireWorker(tx);
    const r = await q(
      db,
      tx,
      `DELETE FROM sentinel.notification_deliveries WHERE (mode,workspace_id,project_id,delivery_id) IN (
        SELECT mode,workspace_id,project_id,delivery_id FROM sentinel.notification_deliveries WHERE ${where}
        AND state NOT IN ('pending','attempted') AND finished_at<clock_timestamp()-($4::int*interval '1 day') ORDER BY finished_at LIMIT 200 FOR UPDATE SKIP LOCKED)`,
      [...sv(scope), days],
    );
    return r.rowCount ?? 0;
  });
}
