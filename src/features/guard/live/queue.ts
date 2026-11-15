import { PlatformDatabase } from "../../../platform/database";
import { PlatformError } from "../../../platform/config";
import { PostgresQueue, rowLease } from "../../../platform/queue";
import {
  fingerprint,
  validateJob,
  identifier,
} from "../../../platform/identity";
import type {
  DurableJob,
  JobLease,
  PlatformModule,
  TransactionContext,
} from "../../sentinel/platform-contracts";
import type { Scope } from "../contracts";
const scopeWhere =
  "module=$1 AND mode=$2 AND workspace_id=$3 AND project_id=$4";
/** Existing S01 lease/heartbeat/complete/retry/cancel behavior; only Guard admission/claim differ. */
export class GuardPostgresQueue extends PostgresQueue {
  private readonly guardKinds = ["guard.scan.prepare"];
  constructor(
    db: PlatformDatabase,
    private readonly guardScope: Scope,
    private readonly onlyJobId?: string,
  ) {
    super(db, guardScope, ["guard.scan.prepare"]);
    if (onlyJobId !== undefined && !/^[a-f0-9]{64}$/.test(onlyJobId))
      throw new PlatformError("invalid_input");
    if (db.module !== "guard" || guardScope.mode !== "live")
      throw new PlatformError("scope_denied");
  }
  override async enqueue(tx: TransactionContext, job: DurableJob) {
    validateJob(job);
    this.db.requireScope(tx, job);
    if (
      job.module !== "guard" ||
      job.kind !== "guard.scan.prepare" ||
      job.subjectRef !== job.jobId
    )
      throw new PlatformError("scope_denied");
    const s = [job.module, job.mode, job.workspaceId, job.projectId];
    const scan = await this.db.query(
      tx,
      "SELECT scan_id FROM guard.scans WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND scan_id=$4 AND status='queued' FOR UPDATE",
      [job.mode, job.workspaceId, job.projectId, job.jobId],
    );
    if (!scan.rowCount) throw new PlatformError("scope_denied");
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
      `INSERT INTO platform.jobs(module,mode,workspace_id,project_id,job_id,kind,subject_ref,idempotency_key,max_attempts,available_at,fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING RETURNING job_id`,
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
    if (
      !this.guardScope ||
      input.module !== this.db.module ||
      !this.guardKinds.length ||
      input.module !== "guard"
    )
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
    return this.db.scoped(this.guardScope, async (tx) => {
      this.db.requireWorker(tx);
      // Serialize the short claim transaction against a module-owned row to bound cross-process concurrency.
      const limit = await this.db.query(
        tx,
        "SELECT max_running FROM platform.module_limits WHERE module=$1 FOR UPDATE",
        [input.module],
      );
      if (!limit.rows[0]) throw new PlatformError("scope_denied");
      const s = [
        input.module,
        this.guardScope!.mode,
        this.guardScope!.workspaceId,
        this.guardScope!.projectId,
      ];
      const binding = await this.db.query(
        tx,
        `SELECT project_id FROM guard.scans WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND status NOT IN ('completed','completed_partial','failed','cancelled') LIMIT 1`,
        s.slice(1),
      );
      if (!binding.rowCount) return [];
      await this.db.query(
        tx,
        `UPDATE platform.jobs SET state='failed',finished_at=clock_timestamp(),lease_owner=NULL,lease_token=NULL,lease_until=NULL,revision=revision+1,last_error='attempts_exhausted'
        WHERE ${scopeWhere} AND ($5::text IS NULL OR job_id=$5) AND state='leased' AND lease_until<=clock_timestamp() AND attempts>=max_attempts`,
        [...s, this.onlyJobId ?? null],
      );
      await this.db.query(
        tx,
        `UPDATE platform.job_attempts a SET finished_at=clock_timestamp(),outcome='lease_expired'
        FROM platform.jobs j WHERE a.module=j.module AND a.mode=j.mode AND a.workspace_id=j.workspace_id AND a.project_id=j.project_id AND a.job_id=j.job_id
        AND j.module=$1 AND j.mode=$2 AND j.workspace_id=$3 AND j.project_id=$4 AND a.finished_at IS NULL AND (j.state='failed' OR j.lease_until<=clock_timestamp()) AND ($5::text IS NULL OR j.job_id=$5)`,
        [...s, this.onlyJobId ?? null],
      );
      await this.db.query(
        tx,
        `UPDATE platform.notification_outbox o SET state='failed',finished_at=clock_timestamp() FROM platform.jobs j
        WHERE o.module=j.module AND o.mode=j.mode AND o.workspace_id=j.workspace_id AND o.project_id=j.project_id AND o.job_id=j.job_id
        AND j.module=$1 AND j.mode=$2 AND j.workspace_id=$3 AND j.project_id=$4 AND j.state IN ('failed','cancelled') AND o.state='pending' AND ($5::text IS NULL OR j.job_id=$5)`,
        [...s, this.onlyJobId ?? null],
      );
      await this.db.query(
        tx,
        `UPDATE guard.scans s SET status='failed',job=s.job||jsonb_build_object('status','failed','finishedAt',clock_timestamp(),'audit',COALESCE(s.job->'audit','[]'::jsonb)||jsonb_build_array(jsonb_build_object('actorId','guard-worker','at',clock_timestamp(),'action','queue_failed','subjectId',s.scan_id,'reason','Guard queue exhausted attempts; no completed scan is claimed.'))),revision=s.revision+1,updated_at=clock_timestamp() FROM platform.jobs j WHERE j.module=$1 AND j.module='guard' AND j.mode=$2 AND j.workspace_id=$3 AND j.project_id=$4 AND j.state='failed' AND s.mode=j.mode AND s.workspace_id=j.workspace_id AND s.project_id=j.project_id AND s.scan_id=j.subject_ref AND s.status NOT IN ('completed','completed_partial','failed','cancelled') AND ($5::text IS NULL OR j.job_id=$5)`,
        [...s, this.onlyJobId ?? null],
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
        SELECT module,mode,workspace_id,project_id,job_id FROM platform.jobs WHERE ${scopeWhere}
        AND kind=ANY($5::text[]) AND ($9::text IS NULL OR job_id=$9) AND NOT cancel_requested AND attempts<max_attempts AND EXISTS(SELECT 1 FROM guard.scans s WHERE s.mode=platform.jobs.mode AND s.workspace_id=platform.jobs.workspace_id AND s.project_id=platform.jobs.project_id AND s.scan_id=platform.jobs.subject_ref AND s.status NOT IN ('completed','completed_partial','failed','cancelled'))
        AND ((state='queued' AND available_at<=clock_timestamp()) OR (state='leased' AND lease_until<=clock_timestamp()))
        ORDER BY available_at,created_at,job_id FOR UPDATE SKIP LOCKED LIMIT $6
      ) UPDATE platform.jobs j SET state='leased',attempts=j.attempts+1,fence=j.fence+1,revision=j.revision+1,
        lease_owner=$7,lease_token=(j.fence+1)::text||':'||gen_random_uuid()::text,lease_ms=$8,lease_until=clock_timestamp()+($8::int*interval '1 millisecond')
        FROM candidates c WHERE j.module=c.module AND j.mode=c.mode AND j.workspace_id=c.workspace_id AND j.project_id=c.project_id AND j.job_id=c.job_id RETURNING j.*`,
        [
          ...s,
          [...this.guardKinds],
          capacity,
          input.workerId,
          input.leaseMs,
          this.onlyJobId ?? null,
        ],
      );
      for (const row of rows.rows)
        await this.db.query(
          tx,
          `INSERT INTO platform.job_attempts(module,mode,workspace_id,project_id,job_id,attempt,lease_token,worker_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [...s, row.job_id, row.attempts, row.lease_token, input.workerId],
        );
      return rows.rows.map(rowLease);
    });
  }
}
