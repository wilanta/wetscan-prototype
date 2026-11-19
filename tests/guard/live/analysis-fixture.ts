import { createJob } from "../../../src/features/guard/pipeline";
import { normalizeOpengrep } from "../../../src/features/guard/evidence";
import { PostgresGuardArtifacts } from "../../../src/features/guard/live/product-artifacts";
import { RecordingClient, fakePool } from "../../platform/helpers";
import { PlatformDatabase } from "../../../src/platform/database";
import type { ScanJob } from "../../../src/features/guard/contracts";
export async function analysisFixture() {
  // SQL/provider doubles only. These are not live acceptance observations.
  const grant = {
    mode: "live" as const,
    workspaceId: "github-user-7:fixture",
    projectId: "github-123",
    actorId: "github-user-7",
    operations: ["read", "scan", "triage", "report"] as const,
    expiresAt: Date.now() + 60000,
  };
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
    idempotencyKey: "g02-live-analysis-unit",
  });
  job.audit.push({
    actorId: grant.actorId,
    at: new Date().toISOString(),
    action: "repository_scan_requested",
    subjectId: job.id,
    reason: "SQL double",
  });
  job.status = "completed";
  job.finishedAt = new Date().toISOString();
  job.sourceCoverage = {
    status: "complete",
    retrievedFiles: 1,
    excludedFiles: 0,
    treeTruncated: false,
  };
  job.runs = job.runs.map((r) =>
    r.engine === "sast"
      ? {
          ...r,
          status: "completed",
          version: "unit-v1",
          rulePack: "unit-rules",
          artifactDigest: "e".repeat(64),
          executionEvidence: {
            version: 1,
            runId: "unit-run",
            imageId: "sha256:" + "1".repeat(64),
            specDigest: "2".repeat(64),
            installationArtifactSha256: "3".repeat(64),
            cleanup: "VERIFIED",
          },
        }
      : r,
  );
  job.findings = await normalizeOpengrep(
    {
      results: [
        {
          check_id: "unit-rule",
          path: "route.ts",
          start: { line: 1 },
          extra: { message: "SQL double finding", severity: "ERROR" },
        },
      ],
      errors: [],
    },
    {
      ...grant,
      commit: job.repository.commit,
      recordedAt: new Date().toISOString(),
      artifactDigest: "e".repeat(64),
      synthetic: false,
      scannerVersion: "unit-v1",
      rulePack: "unit-rules",
    },
  );
  type Extended = ScanJob & {
    guardRemediation?: import("../../../src/features/guard/live/product-remediation").RemediationRecord[];
    guardRetests?: unknown[];
    guardIntegrationBundles?: unknown[];
    guardReports?: { body: Record<string, unknown> }[];
  };
  let current: Extended = structuredClone(job),
    revision = 1;
  const c = new RecordingClient();
  const queue = {
    kind: "guard.scan.repository",
    state: "completed",
    lease_owner: null as string | null,
    lease_token: null as string | null,
  };
  c.respond = async (sql, values) => {
    if (sql.startsWith("SELECT kind")) return { rowCount: 1, rows: [queue] };
    if (sql.startsWith("SELECT job,revision"))
      return {
        rowCount: 1,
        rows: [{ job: structuredClone(current), revision }],
      };
    if (sql.startsWith("UPDATE guard.scans")) {
      current = JSON.parse(values[5] as string);
      revision++;
      return { rowCount: 1, rows: [] };
    }
    return { rowCount: 0, rows: [] };
  };
  return {
    grant,
    job,
    c,
    queue,
    store: new PostgresGuardArtifacts(
      new PlatformDatabase(fakePool(c), false, "guard"),
    ),
    get: () => ({ current, revision }),
  };
}
export function afterScan(before: ScanJob) {
  const after = structuredClone(before);
  after.id = "b".repeat(64);
  after.repository.commit = "c".repeat(40);
  after.findings = [];
  after.audit = after.audit.map((a) =>
    a.action === "repository_scan_requested"
      ? { ...a, subjectId: after.id }
      : a,
  );
  return after;
}
