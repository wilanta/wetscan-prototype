import type { QueryResultRow } from "pg";
import type { PlatformDatabase } from "../../../platform/database";
import type { JobLease } from "../platform-contracts";
import { PostgresOutbox } from "../../../platform/outbox";
import { PostgresQueue } from "../../../platform/queue";
import type { SentinelScope } from "../types";
import {
  emailSubject,
  messageText,
  notificationLimits,
  quietUntil,
  retryAt,
  type DeliveryPayload,
  type DeliveryTrigger,
  type NotificationChannel,
  type SendOutcome,
} from "./model";

const key = (
  j: { mode: string; workspaceId: string; projectId: string },
  id: string,
) => [j.mode, j.workspaceId, j.projectId, id];
const W = "mode=$1 AND workspace_id=$2 AND project_id=$3 AND delivery_id=$4";
export type Prepared =
  | {
      kind: "send";
      deliveryId: string;
      channel: NotificationChannel;
      destination: string;
      text: string;
      subject: string;
      recovered: boolean;
    }
  | { kind: "resume_accepted"; deliveryId: string; evidenceRef: string }
  | { kind: "done" }; // suppressed / already terminal / deferred: job already settled here

/**
 * Notifier-role persistence. Every send is bracketed by durable ledger states:
 * pending → attempted (committed BEFORE the provider call) → provider_accepted | retry | failed | unknown.
 * `delivered` is never written here: Telegram/Resend acceptance carries no recipient receipt.
 */
export class SenderStore {
  private readonly outbox: PostgresOutbox;
  constructor(
    readonly db: PlatformDatabase,
    readonly queue: PostgresQueue,
  ) {
    this.outbox = new PostgresOutbox(queue);
  }

  async prepare(lease: JobLease, now = new Date()): Promise<Prepared> {
    const job = lease.job,
      id = job.subjectRef;
    const step = await this.db.scoped(job, async (tx) => {
      const d = (
        await this.db.query(
          tx,
          `SELECT * FROM sentinel.notification_deliveries WHERE ${W} FOR UPDATE`,
          key(job, id),
        )
      ).rows[0] as QueryResultRow | undefined;
      if (!d) return { kind: "cancel" as const };
      if (["provider_accepted", "delivered"].includes(d.state))
        return {
          kind: "resume" as const,
          evidenceRef: `${d.channel}:${d.provider_message_id}`,
        };
      if (
        ["failed", "suppressed"].includes(d.state) ||
        (d.state === "unknown" && d.dead_letter)
      )
        return { kind: "cancel" as const };
      const c = (
        await this.db.query(
          tx,
          `SELECT * FROM sentinel.notification_channels WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND channel=$4`,
          [...key(job, d.channel).slice(0, 3), d.channel],
        )
      ).rows[0] as QueryResultRow | undefined;
      // Re-check authority at send time: revocation, disablement or a changed destination fail closed.
      let reason: string | undefined;
      if (!c || !c.consent_at || !c.destination) reason = "consent_missing";
      else if (d.channel === "whatsapp") reason = "channel_unavailable";
      else if (c.destination_hash !== d.destination_hash)
        reason = "destination_changed";
      else if (!c.enabled && d.trigger !== "test") reason = "channel_disabled";
      if (reason) {
        await this.db.query(
          tx,
          `UPDATE sentinel.notification_deliveries SET state='suppressed',reason=$5,finished_at=clock_timestamp(),next_attempt_at=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE ${W}`,
          [...key(job, id), reason],
        );
        return { kind: "cancel" as const };
      }
      if (d.trigger !== "test") {
        const until = quietUntil(now, {
          enabled: c!.quiet_enabled,
          timezone: c!.quiet_timezone,
          startMinute: c!.quiet_start_minute,
          endMinute: c!.quiet_end_minute,
        });
        if (
          until &&
          until.getTime() - now.getTime() <= notificationLimits.quietMaxDeferMs
        ) {
          await this.db.query(
            tx,
            `UPDATE sentinel.notification_deliveries SET reason='deferred_quiet_hours',next_attempt_at=$5,revision=revision+1,updated_at=clock_timestamp() WHERE ${W}`,
            [...key(job, id), until.toISOString()],
          );
          return { kind: "defer" as const, until: until.toISOString() };
        }
      }
      const recovered = d.state === "attempted" || d.state === "unknown";
      await this.db.query(
        tx,
        `UPDATE sentinel.notification_deliveries SET state='attempted',reason=$5,attempt_count=$6,last_attempt_at=clock_timestamp(),next_attempt_at=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE ${W}`,
        [
          ...key(job, id),
          recovered ? "previous_attempt_outcome_unknown" : null,
          Math.min(10, job.attempts),
        ],
      );
      const payload = (d.payload ?? {}) as DeliveryPayload;
      const trigger = d.trigger as DeliveryTrigger;
      return {
        kind: "send" as const,
        channel: d.channel as NotificationChannel,
        destination: c!.destination as string,
        text: messageText(
          trigger === "manual_retry" ? "incident_opened" : trigger,
          payload,
        ),
        subject: emailSubject(
          trigger === "manual_retry" ? "incident_opened" : trigger,
          payload,
        ),
        recovered,
      };
    });
    if (step.kind === "cancel") {
      await this.queue.cancel(job, "sentinel", job.jobId);
      return { kind: "done" };
    }
    if (step.kind === "defer") {
      await this.queue.retry(lease, {
        availableAt: step.until,
        redactedError: "handler_failed",
      });
      return { kind: "done" };
    }
    if (step.kind === "resume")
      return {
        kind: "resume_accepted",
        deliveryId: id,
        evidenceRef: step.evidenceRef,
      };
    return { ...step, deliveryId: id };
  }

  /** Commits the outcome of one provider attempt. Never claims delivery. */
  async settle(
    lease: JobLease,
    p: Extract<Prepared, { kind: "send" | "resume_accepted" }>,
    outcome: SendOutcome | undefined,
  ) {
    const job = lease.job,
      id = p.deliveryId;
    const record = (
      o: "not_configured" | "failed" | "accepted",
      evidence?: string,
    ) =>
      this.db
        .scoped(job, (tx) =>
          this.outbox.recordAttempt(tx, lease, id, o, evidence),
        )
        .catch(() => undefined); // lease lost: the durable ledger already carries the truth; reclaim reconciles.
    if (p.kind === "resume_accepted") {
      await record("accepted", p.evidenceRef);
      return "provider_accepted" as const;
    }
    const o = outcome ?? ({ kind: "not_configured" } as const);
    const exhausted = job.attempts >= job.maxAttempts;
    if (o.kind === "accepted") {
      await this.finish(
        job,
        id,
        `state='provider_accepted',reason=NULL,provider_message_id=$5,provider_accepted_at=$6,finished_at=clock_timestamp(),next_attempt_at=NULL`,
        [o.providerMessageId, o.acceptedAt],
      );
      await record("accepted", `${p.channel}:${o.providerMessageId}`);
      return "provider_accepted" as const;
    }
    if (o.kind === "retryable" && !exhausted) {
      const next = retryAt(job.attempts, o.retryAfterMs);
      await this.finish(
        job,
        id,
        `state=${o.ambiguous ? "'unknown'" : "'attempted'"},reason=$5,next_attempt_at=$6`,
        [o.code, next],
      );
      await record("failed");
      await this.queue
        .retry(lease, { availableAt: next, redactedError: "handler_failed" })
        .catch(() => undefined);
      return "retry_scheduled" as const;
    }
    // Permanent failure, missing provider configuration, or retries exhausted ⇒ dead letter. Ambiguous ends are `unknown`, never "failed".
    const code =
      o.kind === "not_configured" ? "provider_not_configured" : o.code;
    const ambiguous = o.kind === "retryable" && o.ambiguous;
    await this.finish(
      job,
      id,
      `state=${ambiguous ? "'unknown'" : "'failed'"},reason=$5,dead_letter=true,finished_at=clock_timestamp(),next_attempt_at=NULL`,
      [
        exhausted && o.kind === "retryable"
          ? `retries_exhausted_${code}`.slice(0, 64)
          : code,
      ],
    );
    await record(o.kind === "not_configured" ? "not_configured" : "failed");
    if (o.kind === "retryable")
      await this.queue
        .retry(lease, {
          availableAt: new Date().toISOString(),
          redactedError: "handler_failed",
        })
        .catch(() => undefined);
    else
      await this.queue
        .cancel(job, "sentinel", job.jobId)
        .catch(() => undefined);
    return "dead_letter" as const;
  }

  private finish(
    job: JobLease["job"],
    id: string,
    set: string,
    extra: unknown[],
  ) {
    return this.db.scoped(job, async (tx) => {
      await this.db.query(
        tx,
        `UPDATE sentinel.notification_deliveries SET ${set},revision=revision+1,updated_at=clock_timestamp() WHERE ${W} AND state IN ('attempted','unknown','pending')`,
        [...key(job, id), ...extra],
      );
    });
  }

  /** Crash/poison reconciliation: rows whose queue job was failed by lease-expiry exhaustion never reach a handler. */
  async sweep(scope: SentinelScope) {
    return this.db.scoped(scope, async (tx) => {
      const r = await this.db.query(
        tx,
        `UPDATE sentinel.notification_deliveries l SET state=CASE WHEN l.state='pending' THEN 'failed' ELSE 'unknown' END,
           reason=CASE WHEN l.state='pending' THEN 'attempts_exhausted' ELSE 'attempts_exhausted_outcome_unknown' END,
           dead_letter=true,finished_at=clock_timestamp(),next_attempt_at=NULL,revision=l.revision+1,updated_at=clock_timestamp()
         FROM platform.notification_outbox o
         WHERE l.mode=$1 AND l.workspace_id=$2 AND l.project_id=$3 AND l.state IN ('pending','attempted','unknown') AND NOT l.dead_letter
         AND o.module='sentinel' AND o.mode=l.mode AND o.workspace_id=l.workspace_id AND o.project_id=l.project_id AND o.delivery_id=l.delivery_id AND o.state='failed'`,
        [scope.mode, scope.workspaceId, scope.projectId],
      );
      return r.rowCount ?? 0;
    });
  }
}
