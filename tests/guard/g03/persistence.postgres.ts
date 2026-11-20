import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { writeFile, mkdir } from "node:fs/promises";
import { nativePostgres } from "./native-postgres";
import { fixture, plan } from "./fixture";
import { fingerprint } from "../../../src/platform/identity";
import { PostgresG03Store } from "../../../src/features/guard/g03/store";
import { G03Service } from "../../../src/features/guard/g03/service";
import type { G03Job } from "../../../src/features/guard/g03/contracts";
it("isolated PostgreSQL: persistence, restart, forced RLS, consent/rate budgets, optimistic conflicts and report retention", async () => {
  const pg = await nativePostgres(),
    f = await fixture(),
    job = f.job;
  try {
    await pg.admin.query(
      "INSERT INTO guard.scans(mode,workspace_id,project_id,scan_id,idempotency_key,fingerprint,repository_id,commit_sha,status,job,revision,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11)",
      [
        job.mode,
        job.workspaceId,
        job.projectId,
        job.id,
        job.idempotencyKey,
        fingerprint(job),
        job.repository.repositoryId,
        job.repository.commit,
        job.status,
        JSON.stringify(job),
        job.createdAt,
      ],
    );
    // Queue fixture has no worker attempt. This test never claims real scanner evidence.
    const columns = await pg.admin.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='platform' AND table_name='jobs'",
    );
    expect(columns.rows.length).toBeGreaterThan(0);
    await pg.admin.query(
      "INSERT INTO platform.jobs(module,mode,workspace_id,project_id,job_id,kind,subject_ref,idempotency_key,available_at,max_attempts,state,fingerprint,finished_at) VALUES('guard',$1,$2,$3,$4,'guard.scan.repository',$4,$5,clock_timestamp(),1,'completed',$6,clock_timestamp())",
      [
        job.mode,
        job.workspaceId,
        job.projectId,
        job.id,
        job.idempotencyKey,
        fingerprint(job),
      ],
    );
    const baseline = await pg.admin.query(
      "SELECT version,checksum FROM platform.schema_migrations ORDER BY version",
    );
    let store = new PostgresG03Store(pg.db());
    const compose = () =>
      new G03Service({
        store,
        source: f.source,
        provider: f.provider,
        github: f.github,
        scanner: f.scanner,
        revalidate: f.revalidate,
      });
    const service = compose();
    await service.generate(
      f.authority,
      job.id,
      f.generate(),
      new AbortController().signal,
    );
    const state = await service.state(f.authority, job.id);
    expect(state.proposals[0].state).toBe("completed");
    expect(state.revision).toBe(3);
    await expect(
      service.generate(
        f.authority,
        job.id,
        f.generate({ revision: 3, requestKey: "g03-second-request" }),
        new AbortController().signal,
      ),
    ).rejects.toThrow("provider_budget_exhausted");
    await expect(
      store.change(f.authority, job.id, 1, "triage", () => true),
    ).rejects.toThrow("revision_conflict");
    const other = {
      ...f.authority,
      grant: { ...f.grant, workspaceId: "another-workspace" },
    };
    await expect(store.get(other, job.id)).rejects.toThrow("not_found");
    const isolated = pg.db();
    const direct = await isolated.scoped(other.grant, (tx) =>
      isolated.query(tx, "SELECT scan_id FROM guard.scans WHERE scan_id=$1", [
        job.id,
      ]),
    );
    expect(direct.rows).toEqual([]);
    const report = await service.createReport(f.authority, job.id, {
      revision: state.revision,
    });
    const json = await service.exportReport(f.authority, job.id, {
      revision: report.revision,
      reportId: report.value.reportId,
      format: "json",
    });
    expect(json.body).toContain("guard-g03-report-v1");
    const beforeRestart = await store.get(f.authority, job.id);
    await pg.restart();
    store = new PostgresG03Store(pg.db());
    const persisted = await store.get(f.authority, job.id);
    expect(persisted).toEqual(beforeRestart);
    const active = compose();
    const p = persisted.job.guardG03!.proposals[0];
    const reviews = await Promise.allSettled([
      active.review(
        f.authority,
        job.id,
        {
          revision: persisted.revision,
          proposalId: p.id,
          patchDigest: p.patch!.digest,
          decision: "approved",
          reason: "Concurrent exact patch review",
        },
        new AbortController().signal,
      ),
      active.review(
        f.authority,
        job.id,
        {
          revision: persisted.revision,
          proposalId: p.id,
          patchDigest: p.patch!.digest,
          decision: "rejected",
          reason: "Concurrent exact patch review",
        },
        new AbortController().signal,
      ),
    ]);
    expect(reviews.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    // Expiration uses actual SQL clock predicates, not a test-only replacement.
    const observer = new (await import("pg")).default.Pool({
      host: pg.target.host,
      port: pg.target.port,
      user: "postgres",
      database: pg.target.database,
      max: 1,
    });
    const afterBaseline = await observer.query(
      "SELECT version,checksum FROM platform.schema_migrations ORDER BY version",
    );
    expect(afterBaseline.rows).toEqual(baseline.rows);
    const original = await observer.query(
      "SELECT job-'guardG03' AS job FROM guard.scans WHERE scan_id=$1",
      [job.id],
    );
    expect(original.rows[0].job).toEqual(job);
    await observer.query(
      "UPDATE guard.scans SET retention_until=clock_timestamp()-interval '1 second' WHERE scan_id=$1",
      [job.id],
    );
    await expect(store.get(f.authority, job.id)).rejects.toThrow("not_found");
    await observer.end();
    await mkdir("test-results/guard-g03", { recursive: true });
    await writeFile(
      "test-results/guard-g03/postgres-evidence.json",
      JSON.stringify(
        {
          classification:
            "ISOLATED_POSTGRESQL_SQL_PROVIDER_AND_SCANNER_DOUBLES_NOT_LIVE_ACCEPTANCE",
          postgresVersion: 18,
          randomLoopbackPort: pg.target.port,
          ownerDatabaseAccessed: false,
          persistence: true,
          restart: true,
          forcedRls: true,
          crossWorkspaceDenied: true,
          costRateBudget: true,
          optimisticConflict: true,
          concurrentReviewSingleWinner: true,
          retention: true,
          originalG02DataUnchanged: true,
          platformMigrationLedgerUnchanged: true,
          providerCallsAreTestDoubles: true,
          realScannerExecuted: false,
        },
        null,
        2,
      ),
    );
  } finally {
    await pg.stop();
  }
});
it("isolated PostgreSQL serializes cross-scan cost reservations and enforces the 24-hour request cap", async () => {
  const pg = await nativePostgres(),
    f = await fixture(),
    template = await f.proposed();
  const budget = { ...plan, reservedMicroUsd: 100000 };
  const reservation = (id: string, recent = false) => {
    const p = structuredClone(template);
    p.id = fingerprint(id);
    p.requestKey = "g03-" + id;
    p.state = "failed";
    p.failure = "offline-consumed-reservation";
    p.createdAt = new Date(Date.now() - (recent ? 0 : 120000)).toISOString();
    p.consent = {
      ai: true,
      source: false,
      path: null,
      at: p.createdAt,
      plan: budget,
    };
    p.binding = null;
    delete p.patch;
    delete p.advice;
    delete p.providerResult;
    return p;
  };
  try {
    const jobs = [0, 1].map((n) => {
      const job: G03Job = structuredClone(f.job);
      job.id = fingerprint(["cross-scan-budget", n]);
      job.idempotencyKey = "g02-live-" + job.id;
      job.audit = job.audit.map((event) =>
        event.action === "repository_scan_requested"
          ? { ...event, subjectId: job.id }
          : event,
      );
      job.guardG03 = {
        version: 1,
        proposals: [reservation(`seed-${n}-a`), reservation(`seed-${n}-b`)],
        retests: [],
        reports: [],
        audit: [],
      };
      return job;
    });
    for (const job of jobs) {
      await pg.admin.query(
        "INSERT INTO guard.scans(mode,workspace_id,project_id,scan_id,idempotency_key,fingerprint,repository_id,commit_sha,status,job,revision,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11)",
        [
          job.mode,
          job.workspaceId,
          job.projectId,
          job.id,
          job.idempotencyKey,
          fingerprint(job),
          job.repository.repositoryId,
          job.repository.commit,
          job.status,
          JSON.stringify(job),
          job.createdAt,
        ],
      );
      await pg.admin.query(
        "INSERT INTO platform.jobs(module,mode,workspace_id,project_id,job_id,kind,subject_ref,idempotency_key,available_at,max_attempts,state,fingerprint,finished_at) VALUES('guard',$1,$2,$3,$4,'guard.scan.repository',$4,$5,clock_timestamp(),1,'completed',$6,clock_timestamp())",
        [
          job.mode,
          job.workspaceId,
          job.projectId,
          job.id,
          job.idempotencyKey,
          fingerprint(job),
        ],
      );
    }
    const store = new PostgresG03Store(pg.db());
    const attempts = await Promise.allSettled(
      jobs.map((job, n) =>
        store.change(
          {
            ...f.authority,
            grant: { ...f.grant, actorId: `offline-actor-${n}` },
          },
          job.id,
          1,
          "triage",
          (_snapshot, state) => {
            state.proposals.push(reservation(`concurrent-${n}`, true));
            return true;
          },
          budget,
        ),
      ),
    );
    expect(
      attempts.filter((r) => r.status === "fulfilled"),
      JSON.stringify(
        attempts.map((r) =>
          r.status === "rejected" ? r.reason.message : "fulfilled",
        ),
      ),
    ).toHaveLength(1);
    const rejected = attempts.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason.message).toBe("provider_budget_exhausted");
    const sums = await pg.admin.query(
      "SELECT count(*)::int AS requests, sum((p->'consent'->'plan'->>'reservedMicroUsd')::int)::int AS cost FROM guard.scans s CROSS JOIN LATERAL jsonb_array_elements(s.job->'guardG03'->'proposals') p",
    );
    expect(sums.rows[0]).toEqual({ requests: 5, cost: 500000 });
    // Twenty low-cost, old (not minute-rate-limited) attempts across two scans.
    for (const [n, job] of jobs.entries()) {
      job.guardG03!.proposals = Array.from({ length: 10 }, (_, i) => {
        const p = reservation(`request-cap-${n}-${i}`);
        p.consent.plan = { ...plan, reservedMicroUsd: 1 };
        return p;
      });
      await pg.admin.query(
        "UPDATE guard.scans SET job=$2::jsonb WHERE scan_id=$1",
        [job.id, JSON.stringify(job)],
      );
    }
    const apply = vi.fn();
    await expect(
      store.change(f.authority, jobs[0].id, null, "triage", apply, {
        ...plan,
        reservedMicroUsd: 1,
      }),
    ).rejects.toThrow("provider_budget_exhausted");
    expect(apply).not.toHaveBeenCalled();
    expect(f.provider.generate).toHaveBeenCalledTimes(1); // SQL seeding/reservations invoked no additional provider.
    await writeFile(
      "test-results/guard-g03/postgres-budget-evidence.json",
      JSON.stringify(
        {
          classification: "ISOLATED_POSTGRESQL_SYNTHETIC_RESERVATIONS_NOT_LIVE",
          concurrentCrossScanAttempts: 2,
          successfulReservations: 1,
          rejectedReservations: 1,
          persistedProjectCostMicroUsd: sums.rows[0].cost,
          requestCap: 20,
          requestCapDeniedBeforeCallback: true,
          ownerDatabaseAccessed: false,
          paidAiCalled: false,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await pg.stop();
  }
});
