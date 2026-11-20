import { createHash, createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PlatformDatabase } from "../../../src/platform/database";
import type { ArchitectureGraph } from "../../../src/features/canvas/types";
import type { Finding, Grant, InventoryItem, ScanJob } from "../../../src/features/guard/contracts";
import type { ProjectAuthority } from "../../../src/features/guard/live/model";
import { PostgresGuardStore } from "../../../src/features/guard/live/persistence";
import { repositorySbom } from "../../../src/features/guard/sbom";
import { G04Store } from "../../../src/features/guard/g04/store";
import {
  defaultPolicy,
  policyDigest,
  type SecurityPolicy,
} from "../../../src/features/guard/g04/policy";
import { G05PostgresStore } from "../../../src/features/guard/g05/store";
import { G06PostgresStore } from "../../../src/features/guard/g06/store";
import {
  applyG06Schema,
  g06MigrationPlan,
  g06SchemaReady,
} from "../../../src/features/guard/g06/migrations";
import {
  HttpSentinelPipelineConsumer,
  UnconfiguredSentinelConsumer,
} from "../../../src/features/guard/g06/sentinel-bridge";
import {
  openSentinelConsumerFromEnv,
  SentinelS09IntelligenceConsumer,
} from "../../../src/features/guard/g06/intelligence-bridge";
import { G06OutboxWorker } from "../../../src/features/guard/g06/worker";
import { G06Service } from "../../../src/features/guard/g06/service";
import { renderUnifiedReportHtml } from "../../../src/features/guard/g06/unified-report";
import { CatalogStore } from "../../../src/features/sentinel/external/catalog-store";
import type { NormalizedAdvisory } from "../../../src/features/sentinel/external/model";
import { bindProject } from "../../../src/features/sentinel/storage/projects";
import type { SentinelProjectContext } from "../../../src/features/sentinel/types";
import { createG06PgTestEnv, type G06PgTestEnv } from "./pg-env";

const COMMIT_1 = "1".repeat(40);
const COMMIT_2 = "2".repeat(40);
const SCAN_1 = "a".repeat(64);
const SCAN_UNBOUND = "b".repeat(64);
const SCAN_OTHER = "c".repeat(64);

function makeAuthority(
  workspaceId: string,
  projectId: string,
  repoName = "acme/orders-app",
): ProjectAuthority {
  const repoId = projectId.replace("github-", "");
  const actorId = workspaceId.split(":")[0] || `${workspaceId}-actor`;
  const now = Date.now();
  return {
    grant: {
      mode: "live",
      workspaceId,
      projectId,
      actorId,
      operations: ["read", "scan", "triage", "report"],
      issuedAt: now,
      expiresAt: now + 300_000,
    },
    repositoryId: repoId,
    repositoryName: repoName,
    branch: "main",
    installationId: 7001,
    userId: 42,
  };
}

function makeOperationalScan(
  auth: ProjectAuthority,
  scanId: string,
  commit: string,
  findings: Finding[],
  inventory: InventoryItem[],
): ScanJob {
  const artifactDigest = "e".repeat(64);
  const repository = {
    provider: "github" as const,
    repositoryId: auth.repositoryId,
    branch: "main",
    commit,
  };
  return {
    mode: "live",
    workspaceId: auth.grant.workspaceId,
    projectId: auth.grant.projectId,
    id: scanId,
    idempotencyKey: `g02-live-${scanId.slice(0, 16)}`,
    requestedEngines: ["sast", "sca", "secrets", "sbom"],
    repository,
    profile: "standard",
    status: "completed",
    createdAt: "2026-11-20T01:00:00.000Z",
    finishedAt: "2026-11-20T01:02:00.000Z",
    runs: [
      {
        engine: "sast",
        status: "completed",
        reason: "Opengrep clean run",
        scanner: "opengrep",
        version: "1.99.0",
        rulePack: "p/default",
        artifactDigest,
        executionEvidence: {
          version: 1,
          runId: `run-${scanId.slice(0, 8)}`,
          imageId: "wetscan-g02-scanners:local",
          specDigest: "d".repeat(64),
          installationArtifactSha256: "f".repeat(64),
          cleanup: "VERIFIED",
        },
      },
      {
        engine: "sbom",
        status: "completed",
        reason: "CycloneDX generated",
        scanner: "cdxgen",
        version: "1.0.0",
        rulePack: "cyclonedx-1.6",
        artifactDigest,
        executionEvidence: {
          version: 1,
          runId: `sbom-${scanId.slice(0, 8)}`,
          imageId: "wetscan-g02-scanners:local",
          specDigest: "d".repeat(64),
          installationArtifactSha256: "f".repeat(64),
          cleanup: "VERIFIED",
        },
      },
    ],
    findings,
    inventory,
    sbom: repositorySbom(inventory, repository, artifactDigest),
    sourceCoverage: {
      status: "complete",
      retrievedFiles: 24,
      excludedFiles: 0,
      treeTruncated: false,
    },
    audit: [
      {
        actorId: auth.grant.actorId,
        at: "2026-11-20T01:00:00.000Z",
        action: "repository_scan_requested",
        subjectId: scanId,
        reason: "manual",
      },
    ],
  };
}

async function seedScan(
  db: PlatformDatabase,
  adminPool: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  grant: Grant,
  job: ScanJob,
) {
  const store = new PostgresGuardStore(db);
  await store.create(grant, {
    ...job,
    status: "queued",
    findings: [],
    runs: [],
    sbom: undefined,
    inventory: undefined,
  });
  await adminPool.query(
    "UPDATE guard.scans SET status=$4, job=$5::jsonb, updated_at=clock_timestamp() WHERE mode='live' AND workspace_id=$1 AND project_id=$2 AND scan_id=$3",
    [job.workspaceId, job.projectId, job.id, job.status, JSON.stringify(job)],
  );
}

describe("Guard G06 real PostgreSQL + Sentinel S09 integration suite", () => {
  let env: G06PgTestEnv;
  let guardAppDb: PlatformDatabase;
  let guardWorkerDb: PlatformDatabase;
  let sentAppDb: PlatformDatabase;
  let sentWorkerDb: PlatformDatabase;

  beforeAll(async () => {
    env = await createG06PgTestEnv();
    guardAppDb = new PlatformDatabase(env.guardAppPool, false, "guard");
    guardWorkerDb = new PlatformDatabase(env.guardWorkerPool, true, "guard");
    sentAppDb = new PlatformDatabase(env.sentinelAppPool, false, "sentinel");
    sentWorkerDb = new PlatformDatabase(env.sentinelWorkerPool, true, "sentinel");
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  it("enforces migration idempotency, least privilege, and down-migration refusal on retained rows", async () => {
    const plan = await g06MigrationPlan();
    expect(await g06SchemaReady(env.guardAppPool, plan)).toBe(true);

    // Re-applying up migration is a safe no-op
    const replay = await applyG06Schema(env.guardMigratorPool, plan, "up", {
      marker: env.guardMarker,
      database: env.guardDatabase,
    });
    expect(replay.applied).toBe(false);

    // Verify wetscan_guard_app cannot call worker-only pending deliveries or DELETE G06 rows
    await expect(
      env.guardAppPool.query("SELECT * FROM guard.g06_pending_deliveries(10)"),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      env.guardAppPool.query("DELETE FROM guard.g06_outbox"),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      env.guardAppPool.query("DELETE FROM guard.g06_reports"),
    ).rejects.toThrow(/permission denied/i);
  });

  it("executes end-to-end G02 + G04 + G05 -> Canvas overlay + Sentinel S09 exposure correlation + Unified Report + XSS escaping", async () => {
    const authA1 = makeAuthority("github-user-42:ws-alpha", "github-101", "acme/orders-app<script>alert(1)</script>");
    const authA2 = makeAuthority("github-user-42:ws-alpha", "github-102", "acme/unbound-repo");
    const authB1 = makeAuthority("github-user-99:ws-beta", "github-201", "beta/private-repo");

    // Seed Sentinel S09 Catalog advisory (lodash < 4.17.21) + bind ONLY github-101 & github-201
    const advisory: NormalizedAdvisory = {
      provider: "osv",
      sourceId: "GHSA-35jh-r3h4-6jhm",
      ident: ["CVE-2021-23337"],
      status: "active",
      title: "Command injection in lodash",
      summary: "Lodash template command injection",
      severity: "high",
      cvssVector: "CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H",
      cvssScore: 7.2,
      kev: null,
      publishedAt: "2021-02-15T00:00:00.000Z",
      modifiedAt: "2024-01-01T00:00:00.000Z",
      withdrawnAt: null,
      sourceUrl: "https://osv.dev/vulnerability/GHSA-35jh-r3h4-6jhm",
      feedVersion: "osv-v1",
      rawSha256: "9".repeat(64),
      affected: [
        {
          ecosystem: "npm",
          packageName: "lodash",
          ranges: [{ introduced: "0", fixed: "4.17.21", lastAffected: null }],
          versions: ["4.17.20"],
          fixed: ["4.17.21"],
          certainty: "verified",
        },
      ],
    };
    const cat = new CatalogStore(sentWorkerDb);
    const catRunId = await cat.startRun("osv", "manual", "g06-test-seeder");
    await cat.upsertChunk([advisory], "2026-11-20T01:00:00.000Z");
    await cat.finish("osv", catRunId, {
      status: "succeeded",
      errorCode: null,
      success: true,
      counters: {
        httpStatus: 200,
        requests: 1,
        bytes: 512,
        recordsSeen: 1,
        recordsChanged: 1,
        recordsRejected: 0,
      },
    });

    const s09CtxA1: SentinelProjectContext = {
      scope: { mode: "live", workspaceId: authA1.grant.workspaceId, projectId: "github-101" },
      actorId: authA1.grant.actorId,
      repositoryId: authA1.repositoryId,
      canvasProjectRef: "github-user-42/github-101",
    };
    await sentAppDb.scoped(s09CtxA1.scope, (tx) => bindProject(sentAppDb, tx, s09CtxA1));

    // Seed operational G02 scan with SAST (tok leaked to test redaction), SCA, and CycloneDX SBOM
    const findingsA1: Finding[] = [
      {
        mode: "live",
        workspaceId: authA1.grant.workspaceId,
        projectId: "github-101",
        id: "f-sast-auth",
        title: "Hardcoded bearer check with ghp_SecretTokenValue1234567890",
        severity: "high",
        confidence: "high",
        status: "verified",
        source: {
          engine: "sast",
          scanner: "opengrep",
          version: "1.99.0",
          ruleId: "auth.bearer",
          rulePack: "p/default",
        },
        location: { path: "src/app/api/auth/route.ts", line: 18 },
        evidence: [
          {
            id: "ev-sast-1",
            commit: COMMIT_1,
            recordedAt: "2026-11-20T01:01:00.000Z",
            summary: "Authorization: Bearer secretTokenABC123456",
            artifactDigest: "e".repeat(64),
            synthetic: false,
          },
        ],
      },
      {
        mode: "live",
        workspaceId: authA1.grant.workspaceId,
        projectId: "github-101",
        id: "f-unmatched-util",
        title: "Ambiguous helper finding",
        severity: "low",
        confidence: "medium",
        status: "potential",
        source: {
          engine: "sast",
          scanner: "opengrep",
          version: "1.99.0",
          ruleId: "util.warn",
          rulePack: "p/default",
        },
        location: { path: "src/shared/util.ts", line: 7 },
        evidence: [],
      },
    ];
    const invA1: InventoryItem[] = [
      { ecosystem: "npm", name: "lodash", version: "4.17.20", license: null, sourcePath: "package-lock.json" },
      { ecosystem: "npm", name: "express", version: "4.18.2", license: "MIT", sourcePath: "package-lock.json" },
    ];
    await seedScan(guardAppDb, env.guardPool, authA1.grant, makeOperationalScan(authA1, SCAN_1, COMMIT_1, findingsA1, invA1));

    // Unregistered Sentinel project github-102 in same workspace
    await seedScan(guardAppDb, env.guardPool, authA2.grant, makeOperationalScan(authA2, SCAN_UNBOUND, COMMIT_1, [], invA1));
    // Other workspace ws-beta
    await seedScan(guardAppDb, env.guardPool, authB1.grant, makeOperationalScan(authB1, SCAN_OTHER, COMMIT_1, [], invA1));

    // Seed G04 Policy + Evaluation (BLOCK, enforced: false) for github-101
    const g04 = new G04Store(guardAppDb);
    const policy: SecurityPolicy = {
      ...defaultPolicy,
      enabled: true,
      requiredEngines: ["sast", "sca"],
    };
    await g04.savePolicy(
      { workspaceId: authA1.grant.workspaceId, projectId: "github-101" },
      {
        repositoryId: authA1.repositoryId,
        repositoryName: "acme/orders-app",
        installationId: 7001,
        ownerActor: authA1.grant.actorId,
        ownerUserId: 42,
      },
      policy,
      0,
      authA1.grant.actorId,
      "Enable security gate",
    );
    const trig = await g04.insertTrigger(
      { workspaceId: authA1.grant.workspaceId, projectId: "github-101" },
      {
        source: "push",
        repositoryId: authA1.repositoryId,
        installationId: 7001,
        branch: "main",
        protectBranch: "main",
        commit: COMMIT_1,
        policyRevision: 1,
        idempotencyKey: `trig-${COMMIT_1}`,
        actor: authA1.grant.actorId,
      },
    );
    await g04.saveEvaluation(
      { workspaceId: authA1.grant.workspaceId, projectId: "github-101" },
      {
        triggerId: trig.trigger.id,
        scanId: SCAN_1,
        commit: COMMIT_1,
        branch: "main",
        policyRevision: 1,
        decision: "BLOCK",
        evaluation: { blockedBy: ["f-sast-auth"] },
        enforcement: { enforced: false, detail: "GitHub App lacks checks:write" },
        digest: policyDigest(policy),
      },
    );

    // Seed G05 target, run, and findings (1 open on /api/orders/:id + 1 verified_fixed on /api/auth)
    const g05 = new G05PostgresStore(guardAppDb);
    const tgt = await g05.saveTarget(
      { workspaceId: authA1.grant.workspaceId, projectId: "github-101" },
      {
        id: "tgt-1",
        name: "Local Synthetic Staging",
        environment: "local_synthetic",
        origin: "http://127.0.0.1:4115",
        serviceIdentity: "wetscan-synthetic-staging",
        owner: authA1.grant.actorId,
        status: "active",
        config: {
          allowedRoutes: ["/api/orders", "/api/auth"],
          allowedMethods: ["GET", "POST"],
          maxRequests: 25,
          maxConcurrency: 2,
          rateLimitRps: 5,
          maxResponseBytes: 65536,
          timeoutMs: 3000,
          approvedCategories: ["integrity_ownership"],
          allowedSyntheticResources: ["orders"],
          cleanupPolicy: "delete_created_and_revoke_sessions",
        },
        expectedRevision: 0,
        actor: authA1.grant.actorId,
        reason: "Authorized local synthetic staging target",
      },
    );
    const grantRec = await g05.issueGrant(
      { workspaceId: authA1.grant.workspaceId, projectId: "github-101" },
      {
        targetId: tgt.id,
        consentActor: authA1.grant.actorId,
        proofId: "proof-1",
        authorizationRef: "auth-ref-1",
        approvedCategories: ["integrity_ownership"],
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      },
    );
    await g05.saveTestPlan(
      { workspaceId: authA1.grant.workspaceId, projectId: "github-101" },
      {
        id: "5".repeat(64),
        version: 1,
        targetId: tgt.id,
        targetRevision: tgt.revision,
        trustPlanId: null,
        workflowImportId: null,
        profile: "integrity_suite",
        categories: ["integrity_ownership"],
        cases: [],
        planDigest: "a".repeat(64),
        createdBy: authA1.grant.actorId,
      },
    );
    const createdRun = await g05.enqueueRun(
      { workspaceId: authA1.grant.workspaceId, projectId: "github-101" },
      {
        idempotencyKey: "run-g06-e2e-k1",
        testPlanId: "5".repeat(64),
        targetId: tgt.id,
        targetRevision: tgt.revision,
        grantId: grantRec.id,
        trustPlanId: null,
        workflowImportId: null,
        retestOfRunId: null,
        retestCaseIds: null,
        totalCases: 1,
        maxRequests: 25,
        maxAttempts: 1,
        scopeDigest: tgt.targetDigest,
        targetEnvironment: "local_synthetic",
        tlsApplicable: false,
        localSyntheticPinned: true,
        actor: authA1.grant.actorId,
      },
    );
    // Finalize G05 run and seed findings via migrator SQL (testing consumer read side of G05 DB)
    await env.guardPool.query(
      `UPDATE guard.g05_runs SET status='completed', cleanup_status='verified' WHERE id=$1`,
      [createdRun.run.id],
    );
    await env.guardPool.query(
      `INSERT INTO guard.g05_findings(workspace_id,project_id,id,run_id,case_id,engine,title,severity,confidence,status,endpoint,invariant_family,summary,evidence)
       VALUES
       ($2,'github-101',$3,$1,'c-idor','integrity','Broken object ownership on order read','critical','high','verified','/api/orders/:id','ownership','Cross-user order read permitted','[]'::jsonb),
       ($2,'github-101',$4,$1,'c-auth','dast','Session fixation check','high','high','verified_fixed','/api/auth','ownership','Verified fixed on retest','[]'::jsonb)`,
      [createdRun.run.id, authA1.grant.workspaceId, "7".repeat(64), "8".repeat(64)],
    );

    const g06Store = new G06PostgresStore(guardAppDb, guardWorkerDb);
    const intelConsumer = new SentinelS09IntelligenceConsumer(sentAppDb);
    const unconfiguredSentinel = new UnconfiguredSentinelConsumer();
    const worker = new G06OutboxWorker(g06Store, {
      intelligenceConsumer: intelConsumer,
      sentinelConsumer: unconfiguredSentinel,
      workerId: "pg-test-worker-1",
    });
    const service = new G06Service(g06Store, {
      intelligenceConsumer: intelConsumer,
      sentinelConsumer: unconfiguredSentinel,
      sentinelConsumerConfigured: false,
      worker,
    });

    // 1. Canvas overlay attribution persisted cleanly in PG
    const graph: ArchitectureGraph = {
      schemaVersion: 1,
      analyzerVersion: "1.0",
      projectRef: "ws-alpha/github-101",
      mode: "live",
      revision: COMMIT_1.slice(0, 12),
      environment: "unknown",
      generatedAt: "2026-11-20T01:02:00.000Z",
      evidence: [
        { id: "e-auth", kind: "source_file", sourcePath: "src/app/api/auth/route.ts", summary: "auth", origin: "verified", sourceRevision: COMMIT_1 },
        { id: "e-orders", kind: "source_file", sourcePath: "src/app/api/orders/[id]/route.ts", summary: "orders", origin: "verified", sourceRevision: COMMIT_1 },
        { id: "e-shared", kind: "source_file", sourcePath: "src/shared/util.ts", summary: "util", origin: "verified", sourceRevision: COMMIT_1 },
      ],
      nodes: [
        { id: "node-auth", kind: "auth", label: "Auth", evidenceIds: ["e-auth", "e-shared"], origin: "verified", status: "observed_in_source", metadata: { route: "/api/auth" } },
        { id: "node-orders", kind: "api", label: "Orders API", evidenceIds: ["e-orders", "e-shared"], origin: "verified", status: "observed_in_source", metadata: { route: "/api/orders/[id]" } },
      ],
      edges: [],
      diagnostics: [],
      coverage: [],
    };

    const ov = await service.resolveCanvasOverlay(authA1, { graph });
    expect(ov.record?.mappedCount).toBe(3); // f-sast-auth, g05-idor, g05-fixed
    expect(ov.record?.unmatchedCount).toBe(1); // f-unmatched-util (ambiguous)
    expect(JSON.stringify(ov.overlay)).not.toContain("ghp_SecretToken");
    expect(JSON.stringify(ov.overlay)).not.toContain("secretTokenABC");

    // 2. GRD-020 Intelligence Sync -> real Sentinel S09 DB & real exposure correlation
    const syncRes = await service.syncIntelligence(authA1);
    expect(syncRes.delivery.state).toBe("acknowledged");
    expect(syncRes.sync?.syncStatus).toBe("acknowledged");
    expect(syncRes.sync?.sentinelSnapshotId).toBeTruthy();
    expect(syncRes.sync?.exposureAssessment).toBe("potential_exposure");
    expect(syncRes.sync?.exposureCount).toBe(1);
    expect(syncRes.sync?.unsupportedCount).toBe(0);

    // Confirm real ext_inventory_snapshots row persisted in Sentinel S09 DB
    const s09Rows = await env.sentinelAdminPool.query(
      "SELECT snapshot_id, source_kind, commit_sha, item_count FROM sentinel.ext_inventory_snapshots WHERE workspace_id=$1 AND project_id='github-101'",
      [authA1.grant.workspaceId],
    );
    expect(s09Rows.rowCount).toBe(1);
    expect(s09Rows.rows[0].commit_sha).toBe(COMMIT_1);
    expect(s09Rows.rows[0].item_count).toBe(2);

    // Unregistered project github-102 fails honestly with project_not_registered, never fabricates snapshot
    const syncUnbound = await service.syncIntelligence(authA2);
    expect(syncUnbound.delivery.state).toBe("retry_scheduled");
    expect(syncUnbound.sync?.syncStatus).toBe("project_not_registered");
    expect(syncUnbound.sync?.sentinelSnapshotId).toBeNull();

    // Verify openSentinelConsumerFromEnv connects to companion S09 DB cleanly
    const fromEnv = await openSentinelConsumerFromEnv(env.env);
    expect(fromEnv.configured).toBe(true);
    await fromEnv.close();

    // 3. GRD-021 unconfigured Sentinel consumer preserves durable pending/retry without false incidents
    const sEv = await service.publishSentinelEvent(authA1, { type: "remediation_retested" });
    expect(sEv.delivery.state).toBe("retry_scheduled");
    expect(sEv.delivery.eventType).toBe("remediation_retested");
    const sentInc = await env.sentinelAdminPool.query("SELECT count(*)::int c FROM sentinel.incidents");
    const sentTel = await env.sentinelAdminPool.query("SELECT count(*)::int c FROM sentinel.telemetry_events");
    expect(sentInc.rows[0].c).toBe(0);
    expect(sentTel.rows[0].c).toBe(0);

    // 4. Unified Report + HTML XSS Escaping + Download Audit + Retention + Down-Migration Refusal
    const report = await service.generateReport(authA1);
    expect(report.overallStatus).toBe("BLOCKED");
    expect(report.body.remediationAndRetest.status).toBe("NOT_CONNECTED");
    expect(report.body.integrations.intelligence.exposureAssessment).toBe("potential_exposure");
    expect(report.body.cicdPolicy.enforced).toBe(false);

    const html = renderUnifiedReportHtml(report);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");

    await g06Store.recordDownloadAudit(
      { workspaceId: authA1.grant.workspaceId, projectId: "github-101" },
      report.reportId,
      "html",
      authA1.grant.actorId,
    );
    const audits = await g06Store.listAudit({ workspaceId: authA1.grant.workspaceId, projectId: "github-101" });
    expect(audits.some((a) => a.action === "unified_report_downloaded" && a.subjectId === report.reportId)).toBe(true);

    // Cross-tenant & same-workspace project isolation
    expect(
      await g06Store.getReport({ workspaceId: authB1.grant.workspaceId, projectId: "github-201" }, report.reportId),
    ).toBeNull();
    expect(
      await g06Store.getReport({ workspaceId: authA1.grant.workspaceId, projectId: "github-102" }, report.reportId),
    ).toBeNull();

    // Direct app transaction with mismatched project cannot insert or read ws-alpha rows
    await expect(
      guardAppDb.scoped(
        { mode: "live", workspaceId: authB1.grant.workspaceId, projectId: "github-201" },
        (tx) =>
          guardAppDb.query(
            tx,
            "INSERT INTO guard.g06_audit(workspace_id,project_id,id,actor,action,subject_id) VALUES($1,'github-101','cross','a','x','y')",
            [authA1.grant.workspaceId],
          ),
      ),
    ).rejects.toThrow(/row-level security/i);

    // Down migration strictly refused while retained rows exist!
    const plan = await g06MigrationPlan();
    await expect(
      applyG06Schema(env.guardMigratorPool, plan, "down", {
        marker: env.guardMarker,
        database: env.guardDatabase,
      }),
    ).rejects.toThrow(/retained row/i);
  });

  it("tests GRD-021 HTTP consumer retries, worker crash lease recovery, 409 conflicts, secret redaction, and retention expiry", async () => {
    const authA1 = makeAuthority("ws-alpha", "github-101", "acme/orders-app");
    const secret = "test_hmac_secret_12345";
    let mode: "503" | "409" | "400" | "200" = "503";
    const receivedBodies: string[] = [];

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        receivedBodies.push(raw);
        const sig = req.headers["x-wetscan-signature-256"];
        const expectedSig =
          "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
        if (sig !== expectedSig) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "bad_signature" }));
          return;
        }
        if (mode === "503") {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "busy" }));
        } else if (mode === "409") {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "duplicate_conflict" }));
        } else if (mode === "400") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "schema_invalid" }));
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              accepted: true,
              status: "ingested_audit",
              acknowledgmentId: `ack_${createHash("sha256").update(raw).digest("hex").slice(0, 12)}`,
            }),
          );
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const consumerPort = (server.address() as AddressInfo).port;
    const consumerUrl = `http://127.0.0.1:${consumerPort}/ingest`;

    try {
      const g06Store = new G06PostgresStore(guardAppDb, guardWorkerDb);
      const worker = new G06OutboxWorker(g06Store, {
        intelligenceConsumer: new SentinelS09IntelligenceConsumer(sentAppDb),
        sentinelConsumer: new HttpSentinelPipelineConsumer(consumerUrl, secret),
        workerId: "http-worker-1",
      });

      // Enqueue release_evaluated with embedded token to test redaction
      const enq = await g06Store.enqueueOutbox(
        { workspaceId: "ws-alpha", projectId: "github-101" },
        {
          topic: "sentinel_pipeline",
          scanId: SCAN_1,
          commitSha: COMMIT_1,
          idempotencyKey: `sentinel-http-${COMMIT_1}`,
          eventType: "release_evaluated",
          schemaVersion: "guard.pipeline.v1",
          payload: {
            schemaVersion: 1,
            producer: "guard",
            mode: "live",
            workspaceId: "ws-alpha",
            projectId: "github-101",
            deliveryId: "gpe_fixed_001",
            idempotencyKey: `sentinel-http-${COMMIT_1}`,
            repository: {
              provider: "github",
              repositoryId: authA1.repositoryId,
              branch: "main",
              commit: COMMIT_1,
            },
            evidence: [
              {
                id: `scan:${SCAN_1}`,
                sourceId: `guard:${SCAN_1}`,
                origin: "observed_scan",
                occurredAt: "2026-11-20T01:05:00.000Z",
                recordedAt: "2026-11-20T01:05:00.000Z",
              },
            ],
            occurredAt: "2026-11-20T01:05:00.000Z",
            category: "security_pipeline",
            event: {
              type: "release_evaluated",
              scanId: SCAN_1,
              decision: "block ghp_ShouldNeverLeaveDB123456",
            },
          },
          actor: authA1.grant.actorId,
        },
      );
      expect(enq.duplicate).toBe(false);
      expect(JSON.stringify(enq.record.payload)).not.toContain("ghp_ShouldNeverLeaveDB");

      // Idempotent duplicate returns existing row; mismatched digest rejects with 409 conflict
      const dup = await g06Store.enqueueOutbox(
        { workspaceId: "ws-alpha", projectId: "github-101" },
        {
          topic: "sentinel_pipeline",
          scanId: SCAN_1,
          commitSha: COMMIT_1,
          idempotencyKey: `sentinel-http-${COMMIT_1}`,
          eventType: "release_evaluated",
          schemaVersion: "guard.pipeline.v1",
          payload: enq.record.payload,
          actor: authA1.grant.actorId,
        },
      );
      expect(dup.duplicate).toBe(true);

      await expect(
        g06Store.enqueueOutbox(
          { workspaceId: "ws-alpha", projectId: "github-101" },
          {
            topic: "sentinel_pipeline",
            scanId: SCAN_1,
            commitSha: COMMIT_1,
            idempotencyKey: `sentinel-http-${COMMIT_1}`,
            eventType: "release_evaluated",
            schemaVersion: "guard.pipeline.v1",
            payload: { ...enq.record.payload, modified: true },
            actor: authA1.grant.actorId,
          },
        ),
      ).rejects.toMatchObject({ code: "conflict", status: 409 });

      // 1st delivery: HTTP 503 -> retry_scheduled
      await worker.runOnce();
      let current = await g06Store.getOutboxDelivery(
        { workspaceId: "ws-alpha", projectId: "github-101" },
        enq.record.deliveryId,
      );
      expect(current?.state).toBe("retry_scheduled");
      expect(current?.attempts).toBe(1);

      // Simulate worker crash with expired lease; recovery worker steals & finishes with 200 ACK!
      await env.guardPool.query(
        `UPDATE guard.g06_outbox
         SET state='leased', lease_owner='crashed-worker', lease_token='stale',
             lease_until=clock_timestamp() - interval '1 minute'
         WHERE delivery_id=$1`,
        [enq.record.deliveryId],
      );
      mode = "200";
      await worker.runOnce();
      current = await g06Store.getOutboxDelivery(
        { workspaceId: "ws-alpha", projectId: "github-101" },
        enq.record.deliveryId,
      );
      expect(current?.state).toBe("acknowledged");
      expect(current?.consumerAckRef).toMatch(/^ack_/);

      const attempts = await g06Store.listDeliveryAttempts(
        { workspaceId: "ws-alpha", projectId: "github-101" },
        enq.record.deliveryId,
      );
      expect(attempts.map((a) => a.outcome)).toEqual([
        "acknowledged",
        "lease_expired",
        "retryable_error",
      ]);

      // Verify HTTP 409 Conflict transitions straight to conflict
      mode = "409";
      const enqConflict = await g06Store.enqueueOutbox(
        { workspaceId: "ws-alpha", projectId: "github-101" },
        {
          topic: "sentinel_pipeline",
          scanId: SCAN_1,
          commitSha: COMMIT_2,
          idempotencyKey: `sentinel-conflict-${COMMIT_2}`,
          eventType: "release_evaluated",
          schemaVersion: "guard.pipeline.v1",
          payload: { ...enq.record.payload, commit: COMMIT_2 },
          actor: authA1.grant.actorId,
        },
      );
      await worker.runOnce();
      const conflictRow = await g06Store.getOutboxDelivery(
        { workspaceId: "ws-alpha", projectId: "github-101" },
        enqConflict.record.deliveryId,
      );
      expect(conflictRow?.state).toBe("conflict");

      // Retention expiry hides expired deliveries cleanly without DELETE
      await env.guardPool.query(
        "UPDATE guard.g06_outbox SET retention_until=clock_timestamp() - interval '1 second' WHERE delivery_id=$1",
        [enqConflict.record.deliveryId],
      );
      expect(
        await g06Store.getOutboxDelivery(
          { workspaceId: "ws-alpha", projectId: "github-101" },
          enqConflict.record.deliveryId,
        ),
      ).toBeNull();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
