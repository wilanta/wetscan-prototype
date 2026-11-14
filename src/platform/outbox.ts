import { randomUUID } from "node:crypto";
import type {
  JobLease,
  OutboxEntry,
  TransactionContext,
  TransactionalOutboxPort,
} from "../features/sentinel/platform-contracts";
import { PlatformError } from "./config";
import { fingerprint, identifier } from "./identity";
import { PostgresQueue } from "./queue";

/** Storage/attempt ledger only. No provider is configured or called in S01. */
export class PostgresOutbox implements TransactionalOutboxPort {
  constructor(private readonly queue: PostgresQueue) {}
  async append(tx: TransactionContext, entry: OutboxEntry) {
    const db = this.queue.db;
    db.requireScope(tx, entry);
    if (
      entry.module !== db.module ||
      entry.schemaVersion !== 1 ||
      entry.mode !== "live" ||
      entry.idempotencyKey.length > 240 ||
      !Number.isFinite(Date.parse(entry.availableAt))
    )
      throw new PlatformError("invalid_input");
    [
      entry.deliveryId,
      entry.topic,
      entry.subjectRef,
      entry.idempotencyKey,
    ].forEach(identifier);
    const digest = fingerprint({
      topic: entry.topic,
      subjectRef: entry.subjectRef,
      availableAt: new Date(entry.availableAt).toISOString(),
    });
    const receipt = await this.queue.enqueue(tx, {
      ...entry,
      jobId: randomUUID(),
      kind: `${entry.module}.outbox`,
      subjectRef: entry.deliveryId,
      idempotencyKey: `outbox:${entry.idempotencyKey}`,
      maxAttempts: 5,
      revision: 1,
      attempts: 0,
      cancelRequested: false,
    });
    const s = [entry.module, entry.mode, entry.workspaceId, entry.projectId];
    const inserted = await db.query(
      tx,
      `INSERT INTO platform.notification_outbox(module,mode,workspace_id,project_id,delivery_id,topic,subject_ref,idempotency_key,fingerprint,job_id,available_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING RETURNING delivery_id`,
      [
        ...s,
        entry.deliveryId,
        entry.topic,
        entry.subjectRef,
        entry.idempotencyKey,
        digest,
        receipt.jobId,
        entry.availableAt,
      ],
    );
    if (inserted.rowCount)
      return { deliveryId: entry.deliveryId, duplicate: false };
    const row = (
      await db.query(
        tx,
        `SELECT delivery_id,fingerprint FROM platform.notification_outbox WHERE module=$1 AND mode=$2 AND workspace_id=$3 AND project_id=$4 AND idempotency_key=$5 FOR UPDATE`,
        [...s, entry.idempotencyKey],
      )
    ).rows[0];
    if (!row || row.fingerprint !== digest)
      throw new PlatformError("idempotency_conflict");
    return { deliveryId: row.delivery_id as string, duplicate: true };
  }
  async recordAttempt(
    tx: TransactionContext,
    lease: JobLease,
    deliveryId: string,
    outcome: "not_configured" | "failed" | "accepted",
    evidenceRef?: string,
  ) {
    const db = this.queue.db;
    db.requireWorker(tx);
    db.requireScope(tx, lease.job);
    identifier(deliveryId);
    if (
      !["not_configured", "failed", "accepted"].includes(outcome) ||
      (outcome === "accepted" && !evidenceRef)
    )
      throw new PlatformError("invalid_input");
    if (evidenceRef) identifier(evidenceRef);
    const s = [
      lease.job.module,
      lease.job.mode,
      lease.job.workspaceId,
      lease.job.projectId,
    ];
    const active = await db.query(
      tx,
      `SELECT j.job_id FROM platform.jobs j JOIN platform.notification_outbox o USING(module,mode,workspace_id,project_id,job_id)
      WHERE j.module=$1 AND j.mode=$2 AND j.workspace_id=$3 AND j.project_id=$4 AND j.job_id=$5 AND o.delivery_id=$6
      AND j.lease_owner=$7 AND j.lease_token=$8 AND j.revision=$9 AND j.state='leased' AND NOT j.cancel_requested AND j.lease_until>clock_timestamp() FOR UPDATE OF j,o`,
      [
        ...s,
        lease.job.jobId,
        deliveryId,
        lease.workerId,
        lease.leaseToken,
        lease.job.revision,
      ],
    );
    if (!active.rowCount) throw new PlatformError("lease_lost");
    await db.query(
      tx,
      `INSERT INTO platform.notification_attempts(module,mode,workspace_id,project_id,delivery_id,attempt,outcome,evidence_ref)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [...s, deliveryId, lease.job.attempts, outcome, evidenceRef ?? null],
    );
    if (outcome === "accepted") {
      await db.query(
        tx,
        `UPDATE platform.notification_outbox SET state='accepted',finished_at=clock_timestamp() WHERE module=$1 AND mode=$2 AND workspace_id=$3 AND project_id=$4 AND delivery_id=$5`,
        [...s, deliveryId],
      );
      await this.queue.completeInTransaction(tx, lease);
    }
    // Non-acceptance leaves the queued receipt intact. Caller retries the leased job; S01 never sends.
  }
}
