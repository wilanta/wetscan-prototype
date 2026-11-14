import type { SentinelScope } from "./types";

/** S00 design only. No pool, SQL, worker loop, migrations or DB dependency. */
export type PlatformModule = "sentinel" | "guard";
export interface TransactionContext {
  readonly transactionId: string;
}
export interface TransactionPort {
  transaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
}
export interface DurableJob extends SentinelScope {
  schemaVersion: 1;
  module: PlatformModule;
  jobId: string;
  kind: string;
  subjectRef: string;
  idempotencyKey: string;
  revision: number;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  cancelRequested: boolean;
}
export interface JobLease {
  job: DurableJob;
  workerId: string;
  leaseToken: string;
  expiresAt: string;
}
/** Implementations MUST enforce scope + module, fencing token, expiry and revision. */
export interface DurableJobPort {
  enqueue(
    tx: TransactionContext,
    job: DurableJob,
  ): Promise<{ jobId: string; duplicate: boolean }>;
  claim(input: {
    module: PlatformModule;
    workerId: string;
    limit: number;
    leaseMs: number;
  }): Promise<JobLease[]>;
  heartbeat(lease: JobLease): Promise<JobLease>;
  complete(lease: JobLease): Promise<void>;
  retry(
    lease: JobLease,
    input: { availableAt: string; redactedError: string },
  ): Promise<void>;
  cancel(
    scope: SentinelScope,
    module: PlatformModule,
    jobId: string,
  ): Promise<void>;
}
export interface OutboxEntry extends SentinelScope {
  schemaVersion: 1;
  module: PlatformModule;
  deliveryId: string;
  topic: string;
  subjectRef: string;
  idempotencyKey: string;
  availableAt: string;
}
export interface TransactionalOutboxPort {
  append(
    tx: TransactionContext,
    entry: OutboxEntry,
  ): Promise<{ deliveryId: string; duplicate: boolean }>;
}
