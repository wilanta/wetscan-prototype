import type {
  DurableJob,
  DurableJobPort,
  JobLease,
  PlatformModule,
  TransactionContext,
} from "../features/sentinel/platform-contracts";
import type { SentinelScope } from "../features/sentinel/types";
import type { QueryResultRow } from "pg";
import { PlatformDatabase } from "./database";
import { PlatformError } from "./config";
import { fingerprint, identifier, validateJob } from "./identity";
import {
  assertAdmission,
  sealedAdmission,
  type JobAdmission,
} from "./job-admission";

interface JobRow extends QueryResultRow {
  module: PlatformModule;
  mode: "live";
  workspace_id: string;
  project_id: string;
  job_id: string;
  kind: string;
  subject_ref: string;
  idempotency_key: string;
  revision: number;
  attempts: number;
  max_attempts: number;
  available_at: Date;
  cancel_requested: boolean;
  lease_owner: string;
  lease_token: string;
  lease_until: Date;
  fingerprint: string;
}
export function rowLease(row: JobRow): JobLease {
  return {
    workerId: row.lease_owner,
    leaseToken: row.lease_token,
    expiresAt: new Date(row.lease_until).toISOString(),
    job: {
      schemaVersion: 1,
      module: row.module,
      workspaceId: row.workspace_id,
      projectId: row.project_id,
      mode: row.mode,
      jobId: row.job_id,
      kind: row.kind,
      subjectRef: row.subject_ref,
      idempotencyKey: row.idempotency_key,
      revision: row.revision,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      availableAt: new Date(row.available_at).toISOString(),
      cancelRequested: row.cancel_requested,
    },
  };
}
const scopeWhere =
  "module=$1 AND mode=$2 AND workspace_id=$3 AND project_id=$4";
export class PostgresQueue implements DurableJobPort {
  constructor(
    readonly db: PlatformDatabase,
    private readonly scope?: SentinelScope,
    private readonly kinds: readonly string[] = [],
    private readonly createdAtOrAfter?: string,
    private readonly admission?: JobAdmission,
  ) {
    if (
      createdAtOrAfter !== undefined &&
      (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(createdAtOrAfter) ||
        !Number.isFinite(Date.parse(createdAtOrAfter)))
    )
      throw new PlatformError("invalid_input");
    if (admission) {
      if (
        !scope ||
        !createdAtOrAfter ||
        db.module !== "sentinel" ||
        kinds.length !== 1 ||
        kinds[0] !== "sentinel.telemetry.accepted"
      )
        throw new PlatformError("scope_denied");
      this.admission = sealedAdmission(admission);
      assertAdmission(this.admission, scope);
    }
  }
  private admissionSql(parameter: number, alias = "") {
    return this.admission
      ? ` AND ${alias}job_id=ANY($${parameter}::text[]) AND clock_timestamp()<$${parameter + 1}::timestamptz`
      : "";
  }
  private admitted(values: unknown[]) {
    return this.admission
      ? [...values, [...this.admission.jobIds], this.admission.expiresAt]
      : values;
  }
  async enqueue(tx: TransactionContext, job: DurableJob) {
    if (this.admission) throw new PlatformError("scope_denied");
    validateJob(job);
    this.db.requireScope(tx, job);
    if (job.module !== this.db.module) throw new PlatformError("scope_denied");
    const digest = fingerprint({
      module: job.module,
      mode: job.mode,
      workspaceId: job.workspaceId,
      projectId: job.projectId,
      kind: job.kind,
      subjectRef: job.subjectRef,
      availableAt: new Date(job.availableAt).toISOString(),
      maxAttempts: job.maxAttempts,
    });
    const bound = await this.db.query(
      tx,
      `SELECT project_id FROM sentinel.project_bindings WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND enabled FOR UPDATE`,
      [job.mode, job.workspaceId, job.projectId],
    );
    if (!bound.rowCount) throw new PlatformError("scope_denied");
    const existing = await this.db.query(
      tx,
      `SELECT job_id,fingerprint FROM platform.jobs WHERE ${scopeWhere} AND idempotency_key=$5 FOR UPDATE`,
      [
        job.module,
        job.mode,
        job.workspaceId,
        job.projectId,
        job.idempotencyKey,
      ],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].fingerprint !== digest)
        throw new PlatformError("idempotency_conflict");
      return { jobId: existing.rows[0].job_id as string, duplicate: true };
    }
    const count = await this.db.query(
      tx,
      `SELECT count(*)::int AS queued_count FROM platform.jobs WHERE ${scopeWhere} AND state IN ('queued','leased')`,
      [job.module, job.mode, job.workspaceId, job.projectId],
    );
    if (Number(count.rows[0]?.queued_count ?? 0) >= 1000)
      throw new PlatformError("invalid_input");
    const values = [
      job.module,
      job.mode,
      job.workspaceId,
      job.projectId,
      job.jobId,
      job.kind,
      job.subjectRef,
      job.idempotencyKey,
      job.maxAttempts,
      job.availableAt,
      digest,
    ];
    const inserted = await this.db.query(
      tx,
      `INSERT INTO platform.jobs(module,mode,workspace_id,project_id,job_id,kind,subject_ref,idempotency_key,max_attempts,available_at,fingerprint)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING RETURNING job_id`,
      values,
    );
    if (inserted.rowCount) return { jobId: job.jobId, duplicate: false };
    const found = await this.db.query(
      tx,
      `SELECT job_id,fingerprint FROM platform.jobs WHERE ${scopeWhere} AND idempotency_key=$5 FOR UPDATE`,
      [...values.slice(0, 4), job.idempotencyKey],
    );
    if (!found.rows[0] || found.rows[0].fingerprint !== digest)
      throw new PlatformError("idempotency_conflict");
    return { jobId: found.rows[0].job_id as string, duplicate: true };
  }
  async claim(input: {
    module: PlatformModule;
    workerId: string;
    limit: number;
    leaseMs: number;
  }): Promise<JobLease[]> {
    if (this.admission && this.scope)
      assertAdmission(this.admission, this.scope);
    if (
      !this.scope ||
      input.module !== this.db.module ||
      !this.kinds.length ||
      input.module !== "sentinel"
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
    return this.db.scoped(this.scope, async (tx) => {
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
        this.scope!.mode,
        this.scope!.workspaceId,
        this.scope!.projectId,
      ];
      const binding = await this.db.query(
        tx,
        `SELECT project_id FROM sentinel.project_bindings WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND enabled FOR SHARE`,
        s.slice(1),
      );
      if (!binding.rowCount) return [];
      const cutoff = this.createdAtOrAfter;
      const eligible =
        (cutoff ? " AND created_at>=$5 AND kind=ANY($6::text[])" : "") +
        this.admissionSql(7);
      const eligibleJoin =
        (cutoff ? " AND j.created_at>=$5 AND j.kind=ANY($6::text[])" : "") +
        this.admissionSql(7, "j.");
      const eligibleValues = this.admitted(
        cutoff ? [...s, cutoff, [...this.kinds]] : s,
      );
      await this.db.query(
        tx,
        `UPDATE platform.jobs SET state='failed',finished_at=clock_timestamp(),lease_owner=NULL,lease_token=NULL,lease_until=NULL,revision=revision+1,last_error='attempts_exhausted'
        WHERE ${scopeWhere} AND state='leased' AND lease_until<=clock_timestamp() AND attempts>=max_attempts${eligible}`,
        eligibleValues,
      );
      await this.db.query(
        tx,
        `UPDATE platform.job_attempts a SET finished_at=clock_timestamp(),outcome='lease_expired'
        FROM platform.jobs j WHERE a.module=j.module AND a.mode=j.mode AND a.workspace_id=j.workspace_id AND a.project_id=j.project_id AND a.job_id=j.job_id
        AND j.module=$1 AND j.mode=$2 AND j.workspace_id=$3 AND j.project_id=$4 AND a.finished_at IS NULL AND (j.state='failed' OR j.lease_until<=clock_timestamp())${eligibleJoin}`,
        eligibleValues,
      );
      await this.db.query(
        tx,
        `UPDATE platform.notification_outbox o SET state='failed',finished_at=clock_timestamp() FROM platform.jobs j
        WHERE o.module=j.module AND o.mode=j.mode AND o.workspace_id=j.workspace_id AND o.project_id=j.project_id AND o.job_id=j.job_id
        AND j.module=$1 AND j.mode=$2 AND j.workspace_id=$3 AND j.project_id=$4 AND j.state IN ('failed','cancelled') AND o.state='pending'${eligibleJoin}`,
        eligibleValues,
      );
      const active = await this.db.query(
        tx,
        "SELECT count(*)::int AS n FROM platform.jobs WHERE module=$1 AND state='leased' AND lease_until>clock_timestamp()",
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
      const rows = await this.db.query<JobRow>(
        tx,
        `WITH candidates AS (
        SELECT module,mode,workspace_id,project_id,job_id FROM platform.jobs WHERE ${scopeWhere}
        AND kind=ANY($5::text[]) AND NOT cancel_requested AND attempts<max_attempts AND ($9::timestamptz IS NULL OR created_at>=$9)${this.admissionSql(10)}
        AND ((state='queued' AND available_at<=clock_timestamp()) OR (state='leased' AND lease_until<=clock_timestamp()))
        ORDER BY available_at,created_at,job_id FOR UPDATE SKIP LOCKED LIMIT $6
      ) UPDATE platform.jobs j SET state='leased',attempts=j.attempts+1,fence=j.fence+1,revision=j.revision+1,
        lease_owner=$7,lease_token=(j.fence+1)::text||':'||gen_random_uuid()::text,lease_ms=$8,lease_until=clock_timestamp()+($8::int*interval '1 millisecond')
        FROM candidates c WHERE j.module=c.module AND j.mode=c.mode AND j.workspace_id=c.workspace_id AND j.project_id=c.project_id AND j.job_id=c.job_id RETURNING j.*`,
        this.admitted([
          ...s,
          [...this.kinds],
          capacity,
          input.workerId,
          input.leaseMs,
          this.createdAtOrAfter ?? null,
        ]),
      );
      for (const row of rows.rows) {
        if (this.admission)
          assertAdmission(this.admission, this.scope!, row.job_id);
        const inserted = await this.db.query(
          tx,
          `INSERT INTO platform.job_attempts(module,mode,workspace_id,project_id,job_id,attempt,lease_token,worker_id)
        ${this.admission ? "SELECT $1,$2,$3,$4,$5,$6,$7,$8 WHERE $5=ANY($9::text[]) AND clock_timestamp()<$10::timestamptz" : "VALUES($1,$2,$3,$4,$5,$6,$7,$8)"}`,
          this.admitted([
            ...s,
            row.job_id,
            row.attempts,
            row.lease_token,
            input.workerId,
          ]),
        );
        if (this.admission && !inserted.rowCount)
          throw new PlatformError("lease_lost");
      }
      if (this.admission) assertAdmission(this.admission, this.scope!);
      return rows.rows.map(rowLease);
    });
  }
  private leaseValues(lease: JobLease) {
    if (lease.job.module !== this.db.module)
      throw new PlatformError("scope_denied");
    if (this.admission) {
      assertAdmission(this.admission, lease.job, lease.job.jobId);
      if (lease.job.kind !== "sentinel.telemetry.accepted")
        throw new PlatformError("scope_denied");
    }
    return [
      lease.job.module,
      lease.job.mode,
      lease.job.workspaceId,
      lease.job.projectId,
      lease.job.jobId,
      lease.workerId,
      lease.leaseToken,
      lease.job.revision,
    ];
  }
  async heartbeat(lease: JobLease): Promise<JobLease> {
    return this.db.scoped(lease.job, async (tx) => {
      this.db.requireWorker(tx);
      const result = await this.db.query<JobRow>(
        tx,
        `UPDATE platform.jobs SET lease_until=clock_timestamp()+(lease_ms*interval '1 millisecond'),revision=revision+1
        WHERE ${scopeWhere} AND job_id=$5 AND lease_owner=$6 AND lease_token=$7 AND revision=$8
        AND state='leased' AND NOT cancel_requested AND lease_until>clock_timestamp()${this.admissionSql(9)} RETURNING *`,
        this.admitted(this.leaseValues(lease)),
      );
      if (!result.rows[0]) throw new PlatformError("lease_lost");
      return rowLease(result.rows[0]);
    });
  }
  async completeInTransaction(tx: TransactionContext, lease: JobLease) {
    this.db.requireWorker(tx);
    this.db.requireScope(tx, lease.job);
    const result = await this.db.query(
      tx,
      `UPDATE platform.jobs j SET state='completed',finished_at=clock_timestamp(),lease_owner=NULL,lease_token=NULL,lease_until=NULL,revision=revision+1
      WHERE ${scopeWhere} AND job_id=$5 AND lease_owner=$6 AND lease_token=$7 AND revision=$8 AND state='leased' AND NOT cancel_requested AND lease_until>clock_timestamp()
      AND NOT EXISTS(SELECT 1 FROM platform.notification_outbox o WHERE o.module=j.module AND o.mode=j.mode AND o.workspace_id=j.workspace_id AND o.project_id=j.project_id AND o.job_id=j.job_id AND o.state<>'accepted')${this.admissionSql(9, "j.")} RETURNING job_id`,
      this.admitted(this.leaseValues(lease)),
    );
    if (!result.rowCount) throw new PlatformError("lease_lost");
    await this.finishAttempt(tx, lease, "completed");
  }
  complete(lease: JobLease): Promise<void> {
    return this.db.scoped(lease.job, (tx) =>
      this.completeInTransaction(tx, lease),
    );
  }
  private async finishAttempt(
    tx: TransactionContext,
    lease: JobLease,
    outcome: string,
  ) {
    await this.db.query(
      tx,
      `UPDATE platform.job_attempts SET outcome=$8,finished_at=clock_timestamp()
      WHERE ${scopeWhere} AND job_id=$5 AND attempt=$6 AND lease_token=$7 AND finished_at IS NULL${this.admissionSql(9)}`,
      this.admitted([
        ...this.leaseValues(lease).slice(0, 5),
        lease.job.attempts,
        lease.leaseToken,
        outcome,
      ]),
    );
  }
  retry(
    lease: JobLease,
    input: { availableAt: string; redactedError: string },
  ): Promise<void> {
    if (!Number.isFinite(Date.parse(input.availableAt)))
      throw new PlatformError("invalid_input");
    // Only fixed codes survive; never persist a driver/provider exception message.
    const error = [
      "handler_failed",
      "handler_timeout",
      "worker_stopping",
      "not_configured",
    ].includes(input.redactedError)
      ? input.redactedError
      : "handler_failed";
    return this.db.scoped(lease.job, async (tx) => {
      this.db.requireWorker(tx);
      const result = await this.db.query(
        tx,
        `UPDATE platform.jobs SET state=CASE WHEN attempts>=max_attempts THEN 'failed' ELSE 'queued' END,
        finished_at=CASE WHEN attempts>=max_attempts THEN clock_timestamp() ELSE NULL END,available_at=$9,last_error=$10,
        lease_owner=NULL,lease_token=NULL,lease_until=NULL,revision=revision+1
        WHERE ${scopeWhere} AND job_id=$5 AND lease_owner=$6 AND lease_token=$7 AND revision=$8 AND state='leased' AND NOT cancel_requested AND lease_until>clock_timestamp()${this.admissionSql(11)} RETURNING job_id`,
        this.admitted([...this.leaseValues(lease), input.availableAt, error]),
      );
      if (!result.rowCount) throw new PlatformError("lease_lost");
      await this.finishAttempt(tx, lease, error);
      await this.db.query(
        tx,
        `UPDATE platform.notification_outbox SET state='failed',finished_at=clock_timestamp()
        WHERE ${scopeWhere} AND job_id=$5 AND state='pending' AND EXISTS(SELECT 1 FROM platform.jobs j WHERE j.module=$1 AND j.mode=$2 AND j.workspace_id=$3 AND j.project_id=$4 AND j.job_id=$5 AND j.state='failed')${this.admissionSql(6)}`,
        this.admitted(this.leaseValues(lease).slice(0, 5)),
      );
    });
  }
  cancel(
    scope: SentinelScope,
    module: PlatformModule,
    jobId: string,
  ): Promise<void> {
    if (module !== this.db.module) throw new PlatformError("scope_denied");
    identifier(jobId);
    if (this.admission) assertAdmission(this.admission, scope, jobId);
    return this.db.scoped(scope, async (tx) => {
      await this.db.query(
        tx,
        `UPDATE platform.jobs SET cancel_requested=true,state='cancelled',finished_at=clock_timestamp(),
        lease_owner=NULL,lease_token=NULL,lease_until=NULL,revision=revision+1 WHERE ${scopeWhere} AND job_id=$5 AND state IN ('queued','leased')${this.admissionSql(6)}`,
        this.admitted([
          module,
          scope.mode,
          scope.workspaceId,
          scope.projectId,
          jobId,
        ]),
      );
      await this.db.query(
        tx,
        `UPDATE platform.job_attempts SET outcome='cancelled',finished_at=clock_timestamp()
        WHERE ${scopeWhere} AND job_id=$5 AND finished_at IS NULL${this.admissionSql(6)}`,
        this.admitted([
          module,
          scope.mode,
          scope.workspaceId,
          scope.projectId,
          jobId,
        ]),
      );
      await this.db.query(
        tx,
        `UPDATE platform.notification_outbox SET state='failed',finished_at=clock_timestamp() WHERE ${scopeWhere} AND job_id=$5 AND state='pending'${this.admissionSql(6)}`,
        this.admitted([
          module,
          scope.mode,
          scope.workspaceId,
          scope.projectId,
          jobId,
        ]),
      );
    });
  }
}
