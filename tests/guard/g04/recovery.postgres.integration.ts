import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { G04Runtime } from "../../../src/features/guard/g04/db";
import { inspectScan, recoverStranded } from "../../../src/features/guard/g04/recovery";
import { createJob } from "../../../src/features/guard/pipeline";
import { GuardPostgresQueue } from "../../../src/features/guard/live/queue";
import { PostgresGuardStore } from "../../../src/features/guard/live/persistence";
import { repositoryScanKind } from "../../../src/features/guard/live/product-policy";
import { cancelLeftovers, freshScope, openTestRuntime } from "./pg-env";

/** Real G02 persistence + queue: a scan whose worker died must be recoverable WITHOUT losing what it had recorded. */
let rt: G04Runtime;
beforeAll(async () => {
  rt = await openTestRuntime();
  // The guard module allows ONE live lease. Never age someone else's lease: wait until none is live (a previous run's lease lasts <= 60 s).
  for (let i = 0; i < 80; i++) {
    const n = (await rt.worker.transaction((tx) => rt.worker.query(tx, "SELECT guard.active_lease_count('guard') AS n"))).rows[0].n as number;
    if (!n) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
});
afterAll(async () => {
  if (rt) await cancelLeftovers(rt);
  await rt?.close();
});

async function admitted() {
  const s = freshScope(),
    scope = { mode: "live" as const, workspaceId: s.workspaceId, projectId: s.projectId },
    issued = Date.now(),
    grant = { ...scope, actorId: "github-user-1", operations: ["read", "scan"] as const, issuedAt: issued, expiresAt: issued + 120_000 };
  const job = await createJob(grant, { ...scope, repository: { provider: "github", repositoryId: s.repositoryId, branch: "main", commit: "a".repeat(40) }, engines: ["sast", "sca"], profile: "quick", idempotencyKey: "g02-live-recovery-" + randomUUID().slice(0, 12) });
  job.audit.push({ actorId: grant.actorId, at: new Date().toISOString(), action: "repository_scan_requested", subjectId: job.id, reason: "recovery test" });
  const store = new PostgresGuardStore(rt.app, repositoryScanKind);
  const stored = await store.create(grant, job);
  return { scope, grant, id: stored.job.id, store };
}
const lease = async (scope: { mode: "live"; workspaceId: string; projectId: string }, id: string, leaseMs: number) => {
  await new Promise((r) => setTimeout(r, 400)); // available_at is the host clock at admission; the container clock may trail it
  return new GuardPostgresQueue(rt.worker, scope, id, { kind: repositoryScanKind }).claim({ module: "guard", workerId: "dead-worker-" + randomUUID().slice(0, 8), limit: 1, leaseMs });
};

/** The worker process died 10 minutes ago: its lease simply stopped being renewed (the queue minimum lease is 5 s, so age it in place). */
const die = (scope: { mode: "live"; workspaceId: string; projectId: string }, id: string) =>
  rt.worker.scoped(scope, (tx) => rt.worker.query(tx, "UPDATE platform.jobs SET lease_until=clock_timestamp()-interval '10 minutes' WHERE module='guard' AND job_id=$1 AND state='leased'", [id]));

describe("stranded G02 scan recovery (real PostgreSQL)", () => {
  it("a queued scan is NOT stranded: it has only not been picked up", async () => {
    const { scope, id } = await admitted();
    expect(await inspectScan(rt.app, scope, id, 0)).toEqual({ stranded: false, reason: "queued_waiting" });
  });
  it("a scan with a live lease is left alone, whatever the grace", async () => {
    const { scope, id, grant } = await admitted();
    expect((await lease(scope, id, 60_000)).length).toBe(1);
    expect(await inspectScan(rt.app, scope, id, 0)).toEqual({ stranded: false, reason: "worker_alive" });
    expect(await recoverStranded(rt.app, grant, scope, id, 0)).toEqual({ recovered: false, reason: "worker_alive" });
    expect((await rt.app.scoped(scope, (tx) => rt.app.query(tx, "SELECT status FROM guard.scans WHERE scan_id=$1", [id]))).rows[0].status).toBe("queued");
    await die(scope, id); // the module budget allows one live lease: release this one for the next test
  });
  it("a dead worker (lease expired) is recovered by G02's own cancel: evidence kept, audited, job closed, idempotent", async () => {
    const { scope, id, grant, store } = await admitted();
    expect((await lease(scope, id, 5000)).length).toBe(1);
    await die(scope, id);
    // inside the grace window the worker might merely be slow: not stranded yet
    expect((await inspectScan(rt.app, scope, id, 3_600_000)).stranded).toBe(false);
    const before = (await store.get(grant, scope, id))!;
    const r = await recoverStranded(rt.app, grant, scope, id, 1000);
    expect(r).toEqual({ recovered: true, reason: "lease_expired" });
    const after = (await store.get(grant, scope, id))!;
    expect(after.job.status).toBe("cancelled");
    expect(after.job.runs).toEqual(before.job.runs); // engine runs and everything recorded survive
    expect(after.job.findings).toEqual(before.job.findings);
    expect(after.job.audit.slice(0, before.job.audit.length)).toEqual(before.job.audit); // append-only history
    expect(after.job.audit.at(-1)).toMatchObject({ action: "cancelled", actorId: "github-user-1" });
    const jobRow = (await rt.app.scoped(scope, (tx) => rt.app.query(tx, "SELECT state FROM platform.jobs WHERE module='guard' AND job_id=$1", [id]))).rows[0];
    expect(jobRow.state).toBe("cancelled");
    expect(await recoverStranded(rt.app, grant, scope, id, 1000)).toEqual({ recovered: false, reason: "terminal" });
  });
  it("a job the queue already failed (attempts exhausted) while the scan row stayed open is recovered too", async () => {
    const { scope, id, grant } = await admitted();
    await lease(scope, id, 5000);
    // what was observed for real (scan 876b630f): the queue gave up on the job (failed) but the scan row never left "running"
    await rt.worker.scoped(scope, (tx) => rt.worker.query(tx, "UPDATE platform.jobs SET state='failed', finished_at=clock_timestamp(), lease_owner=NULL, lease_token=NULL, lease_until=NULL, last_error='attempts_exhausted' WHERE module='guard' AND job_id=$1", [id]));
    expect((await rt.app.scoped(scope, (tx) => rt.app.query(tx, "SELECT status FROM guard.scans WHERE scan_id=$1", [id]))).rows[0].status).toBe("queued");
    expect(await recoverStranded(rt.app, grant, scope, id, 0)).toEqual({ recovered: true, reason: "job_failed" });
  });
  it("another project's scope cannot see or recover this scan", async () => {
    const { id, grant } = await admitted();
    const other = freshScope();
    const scope = { mode: "live" as const, workspaceId: other.workspaceId, projectId: other.projectId };
    expect(await inspectScan(rt.app, scope, id, 0)).toEqual({ stranded: false, reason: "missing" });
    expect(await recoverStranded(rt.app, { ...grant, ...scope }, scope, id, 0)).toEqual({ recovered: false, reason: "missing" });
  });
});
