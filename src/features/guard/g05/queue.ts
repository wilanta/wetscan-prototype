import { PlatformDatabase } from "../../../platform/database";
import { PlatformError } from "../../../platform/config";
import { PostgresQueue, rowLease } from "../../../platform/queue";
import {
  fingerprint,
  identifier,
  validateJob,
} from "../../../platform/identity";
import type {
  DurableJob,
  JobLease,
  PlatformModule,
  TransactionContext,
} from "../../sentinel/platform-contracts";
import { G05_JOB_KIND, type G05Scope } from "./contracts";

const scopeWhere =
  "module=$1 AND mode=$2 AND workspace_id=$3 AND project_id=$4";

/**
 * G05 durable job queue backed by platform.jobs (module='guard', kind='guard.g05.verify').
 * Shares platform.module_limits concurrency accounting with Guard without altering G01/G02 GuardPostgresQueue.
 */
export class G05PostgresQueue extends PostgresQueue {
  private readonly g05Scope: G05Scope & { mode: "live" };

  constructor(
    db: PlatformDatabase,
    scope: G05Scope,
    private readonly onlyRunId?: string,
  ) {
    const liveScope = { ...scope, mode: "live" as const };
    super(db, liveScope, [G05_JOB_KIND]);
    this.g05Scope = liveScope;
    if (db.module !== "guard") throw new PlatformError("scope_denied");
    if (onlyRunId !== undefined && !/^[a-f0-9]{64}$/.test(onlyRunId))
      throw new PlatformError("invalid_input");
  }

  override async enqueue(tx: TransactionContext, job: DurableJob) {
    validateJob(job);
    this.db.requireScope(tx, job);
    if (
      job.module !== "guard" ||
      job.mode !== "live" ||
      job.kind !== G05_JOB_KIND ||
      job.subjectRef !== job.jobId
    )
      throw new PlatformError("scope_denied");
    const run = await this.db.query(
      tx,
      "SELECT id FROM guard.g05_runs WHERE workspace_id=$1 AND project_id=$2 AND id=$3 AND status='queued' FOR UPDATE",
      [job.workspaceId, job.projectId, job.jobId],
    );
    if (!run.rowCount) throw new PlatformError("scope_denied");

    const s = [job.module, job.mode, job.workspaceId, job.projectId];
    const digest = fingerprint({
      module: job.module,
      kind: job.kind,
      subjectRef: job.subjectRef,
      maxAttempts: job.maxAttempts,
    });
    const count = await this.db.query(
      tx,
      `SELECT count(*)::int AS n FROM platform.jobs WHERE ${scopeWhere} AND state IN ('queued','leased')`,
      s,
    );
    if (Number(count.rows[0]?.n ?? 0) >= 100)
      throw new PlatformError("invalid_input");

    const rows = await this.db.query(
      tx,
      `INSERT INTO platform.jobs(module,mode,workspace_id,project_id,job_id,kind,subject_ref,idempotency_key,max_attempts,available_at,fingerprint)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING RETURNING job_id`,
      [
        ...s,
        job.jobId,
        job.kind,
        job.subjectRef,
        job.idempotencyKey,
        job.maxAttempts,
        job.availableAt,
        digest,
      ],
    );
    if (rows.rowCount) return { jobId: job.jobId, duplicate: false };
    const existing = await this.db.query(
      tx,
      `SELECT job_id,fingerprint FROM platform.jobs WHERE ${scopeWhere} AND idempotency_key=$5 FOR UPDATE`,
      [...s, job.idempotencyKey],
    );
    if (
      existing.rows[0]?.fingerprint !== digest ||
      existing.rows[0]?.job_id !== job.jobId
    )
      throw new PlatformError("idempotency_conflict");
    return { jobId: job.jobId, duplicate: true };
  }

  override async claim(input: {
    module: PlatformModule;
    workerId: string;
    limit: number;
    leaseMs: number;
  }): Promise<JobLease[]> {
    if (input.module !== "guard" || input.module !== this.db.module)
      throw new PlatformError("scope_denied");
    identifier(input.workerId);
    if (
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 25 ||
      !Number.isInteger(input.leaseMs) ||
      input.leaseMs < 5000 ||
      input.leaseMs > 120000
    )
      throw new PlatformError("invalid_input");

    return this.db.scoped(this.g05Scope, async (tx) => {
      this.db.requireWorker(tx);
      const limit = await this.db.query(
        tx,
        "SELECT max_running FROM platform.module_limits WHERE module=$1 FOR UPDATE",
        [input.module],
      );
      if (!limit.rows[0]) throw new PlatformError("scope_denied");
      const s = [
        input.module,
        this.g05Scope.mode,
        this.g05Scope.workspaceId,
        this.g05Scope.projectId,
      ];

      // Fail closed on expired leases whose attempts are exhausted, and mark stranded g05_runs failed without erasing results.
      await this.db.query(
        tx,
        `UPDATE platform.jobs SET state='failed',finished_at=clock_timestamp(),lease_owner=NULL,lease_token=NULL,lease_until=NULL,revision=revision+1,last_error='attempts_exhausted'
         WHERE ${scopeWhere} AND kind=$5 AND ($6::text IS NULL OR job_id=$6) AND state='leased' AND lease_until<=clock_timestamp() AND attempts>=max_attempts`,
        [...s, G05_JOB_KIND, this.onlyRunId ?? null],
      );
      await this.db.query(
        tx,
        `UPDATE platform.job_attempts a SET finished_at=clock_timestamp(),outcome='lease_expired'
         FROM platform.jobs j WHERE a.module=j.module AND a.mode=j.mode AND a.workspace_id=j.workspace_id AND a.project_id=j.project_id AND a.job_id=j.job_id
         AND j.module=$1 AND j.mode=$2 AND j.workspace_id=$3 AND j.project_id=$4 AND j.kind=$5 AND ($6::text IS NULL OR j.job_id=$6)
         AND a.finished_at IS NULL AND (j.state='failed' OR j.lease_until<=clock_timestamp())`,
        [...s, G05_JOB_KIND, this.onlyRunId ?? null],
      );
      await this.db.query(
        tx,
        `UPDATE guard.g05_runs r SET status='failed',finished_at=clock_timestamp(),revision=r.revision+1,updated_at=clock_timestamp(),
         summary=r.summary||jsonb_build_object('decision','INCOMPLETE','recoveryNote','worker_lease_expired_no_auto_retry')
         FROM platform.jobs j
         WHERE j.module=$1 AND j.mode=$2 AND j.workspace_id=$3 AND j.project_id=$4 AND j.kind=$5 AND j.state='failed'
         AND r.workspace_id=j.workspace_id AND r.project_id=j.project_id AND r.id=j.subject_ref
         AND r.status IN ('queued','running') AND ($6::text IS NULL OR r.id=$6)`,
        [...s, G05_JOB_KIND, this.onlyRunId ?? null],
      );

      const active = await this.db.query(
        tx,
        "SELECT guard.active_lease_count($1) AS n",
        [input.module],
      );
      const capacity = Math.max(
        0,
        Math.min(
          input.limit,
          Number(limit.rows[0].max_running) - Number(active.rows[0].n),
        ),
      );
      if (!capacity) return [];

      const rows = await this.db.query<Parameters<typeof rowLease>[0]>(
        tx,
        `WITH candidates AS (
          SELECT module,mode,workspace_id,project_id,job_id FROM platform.jobs
          WHERE ${scopeWhere} AND kind=$5 AND ($9::text IS NULL OR job_id=$9)
          AND NOT cancel_requested AND attempts<max_attempts
          AND EXISTS (
            SELECT 1 FROM guard.g05_runs r
            WHERE r.workspace_id=platform.jobs.workspace_id AND r.project_id=platform.jobs.project_id
            AND r.id=platform.jobs.subject_ref AND r.status IN ('queued','running')
          )
          AND ((state='queued' AND available_at<=clock_timestamp()) OR (state='leased' AND lease_until<=clock_timestamp()))
          ORDER BY available_at,created_at,job_id FOR UPDATE SKIP LOCKED LIMIT $6
        )
        UPDATE platform.jobs j SET state='leased',attempts=j.attempts+1,fence=j.fence+1,revision=j.revision+1,
          lease_owner=$7,lease_token=(j.fence+1)::text||':'||gen_random_uuid()::text,lease_ms=$8,lease_until=clock_timestamp()+($8::int*interval '1 millisecond')
        FROM candidates c
        WHERE j.module=c.module AND j.mode=c.mode AND j.workspace_id=c.workspace_id AND j.project_id=c.project_id AND j.job_id=c.job_id
        RETURNING j.*`,
        [
          ...s,
          G05_JOB_KIND,
          capacity,
          input.workerId,
          input.leaseMs,
          this.onlyRunId ?? null,
        ],
      );
      for (const row of rows.rows) {
        await this.db.query(
          tx,
          `INSERT INTO platform.job_attempts(module,mode,workspace_id,project_id,job_id,attempt,lease_token,worker_id)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [...s, row.job_id, row.attempts, row.lease_token, input.workerId],
        );
      }
      return rows.rows.map(rowLease);
    });
  }
}
