import { it, expect } from "vitest";
import { createJob } from "../../../src/features/guard/pipeline";
import { normalizeOpengrep } from "../../../src/features/guard/evidence";
import { PostgresGuardArtifacts } from "../../../src/features/guard/live/product-artifacts";
import { PlatformDatabase } from "../../../src/platform/database";
import { RecordingClient, fakePool } from "../../platform/helpers";
import type { ScanJob } from "../../../src/features/guard/contracts";
const grant = {
  mode: "live" as const,
  workspaceId: "github-user-7:fixture",
  projectId: "github-123",
  actorId: "github-user-7",
  operations: ["read", "scan", "triage", "report"] as const,
  expiresAt: Date.now() + 60000,
};
async function setup(kind = "guard.scan.repository", state = "completed") {
  const job = await createJob(grant, {
    ...grant,
    repository: {
      provider: "github",
      repositoryId: "123",
      branch: "main",
      commit: "a".repeat(40),
    },
    profile: "quick",
    engines: ["sast"],
    idempotencyKey: "g02-live-report-fixture",
  });
  job.audit.push({
    actorId: grant.actorId,
    at: new Date().toISOString(),
    action: "repository_scan_requested",
    subjectId: job.id,
    reason: "Offline test",
  });
  job.status = "completed";
  job.findings = await normalizeOpengrep(
    {
      results: [
        {
          check_id: "unit-rule",
          path: "route.ts",
          start: { line: 1 },
          extra: { message: "Offline finding", severity: "ERROR" },
        },
      ],
      errors: [],
    },
    {
      ...grant,
      commit: job.repository.commit,
      recordedAt: new Date().toISOString(),
      artifactDigest: "b".repeat(64),
      synthetic: false,
      scannerVersion: "test-version",
      rulePack: "test-rules",
    },
  );
  let current: ScanJob & { guardReports?: unknown[] } = structuredClone(job),
    revision = 1;
  const c = new RecordingClient();
  c.respond = async (sql, values) => {
    if (sql.startsWith("SELECT kind"))
      return {
        rows: [{ kind, state, lease_owner: null, lease_token: null }],
        rowCount: 1,
      };
    if (sql.startsWith("SELECT job,revision"))
      return {
        rows: [{ job: structuredClone(current), revision }],
        rowCount: 1,
      };
    if (sql.startsWith("UPDATE guard.scans")) {
      current = JSON.parse(values[5] as string);
      revision++;
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
  const store = new PostgresGuardArtifacts(
    new PlatformDatabase(fakePool(c), false, "guard"),
  );
  return { store, c, job, get: () => ({ current, revision }) };
}
it("triage persists only allowed status/reason with revision and preserves evidence", async () => {
  const f = await setup(),
    before = JSON.stringify(f.job.findings[0].evidence);
  const result = await f.store.triage(grant, grant, f.job.id, {
    revision: 1,
    findingId: f.job.findings[0].id,
    status: "under_review",
    reason: "Authorized offline review reason",
  });
  expect(result.revision).toBe(2);
  expect(f.get().current.findings[0].status).toBe("under_review");
  expect(JSON.stringify(f.get().current.findings[0].evidence)).toBe(before);
  expect(f.c.calls.at(-1)?.sql).toBe("COMMIT");
});
it.each(["verified", "verified_fixed", "potential"])(
  "manual triage cannot manufacture %s",
  async (status) => {
    const f = await setup();
    await expect(
      f.store.triage(grant, grant, f.job.id, {
        revision: 1,
        findingId: f.job.findings[0].id,
        status,
        reason: "invalid state transition",
      }),
    ).rejects.toThrow();
    expect(f.c.calls.some((c) => c.sql.startsWith("UPDATE"))).toBe(false);
  },
);
it.each(["historical", "leased", "stale", "synthetic"])(
  "mutation fails closed for %s",
  async (mode) => {
    const f = await setup(
      mode === "historical" ? "guard.scan.prepare" : undefined,
      mode === "leased" ? "leased" : undefined,
    );
    if (mode === "synthetic")
      f.get().current.findings[0].evidence[0].synthetic = true;
    await expect(
      f.store.createReport(grant, grant, f.job.id, {
        revision: mode === "stale" ? 99 : 1,
      }),
    ).rejects.toThrow();
    expect(f.c.calls.some((c) => c.sql.startsWith("UPDATE"))).toBe(false);
  },
);
it("report is a durable exact-revision snapshot, not a client-generated live claim", async () => {
  const f = await setup(),
    result = await f.store.createReport(grant, grant, f.job.id, {
      revision: 1,
    });
  expect(result.reportId).toMatch(/^[a-f0-9]{64}$/);
  expect(f.get().revision).toBe(2);
  const reports = await f.store.reports(grant, grant, f.job.id);
  expect(reports).toHaveLength(1);
  expect(reports[0].sourceRevision).toBe(1);
  expect(reports[0].body.scope.mode).toBe("live");
  expect(reports[0].body.repository.commit).toBe(f.job.repository.commit);
  expect(reports[0].body.release.enforced).toBe(false);
  expect(
    f.c.calls
      .filter((c) => c.sql.startsWith("UPDATE"))
      .every((c) => c.sql.startsWith("UPDATE guard.scans")),
  ).toBe(true);
});
it("report query rejects a forged cross-workspace report body", async () => {
  const f = await setup();
  await f.store.createReport(grant, grant, f.job.id, { revision: 1 });
  (
    f.get().current.guardReports![0] as {
      body: { scope: { workspaceId: string } };
    }
  ).body.scope.workspaceId = "other";
  await expect(f.store.reports(grant, grant, f.job.id)).rejects.toThrow(
    "source_integrity",
  );
});
