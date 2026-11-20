import { describe, expect, it } from "vitest";
import type { ArchitectureGraph } from "@/features/canvas/types";
import type { Finding, Grant, InventoryItem, ScanJob } from "@/features/guard/contracts";
import type { G05Finding, G05Run } from "@/features/guard/g05/contracts";
import {
  buildGuardCanvasOverlay,
  matchEndpointToGraphRoute,
  normalizeRepoPath,
} from "@/features/guard/g06/canvas-overlay";
import {
  extractInventoryFromScan,
  normalizeInventoryForG06,
} from "@/features/guard/g06/intelligence-bridge";
import {
  containsUnredactedSecret,
  redactG06Text,
  redactG06Value,
} from "@/features/guard/g06/redaction";
import {
  buildValidatedPipelineEvent,
  validateConsumerUrl,
} from "@/features/guard/g06/sentinel-bridge";
import {
  buildUnifiedGuardReport,
  renderUnifiedReportHtml,
} from "@/features/guard/g06/unified-report";

const COMMIT_A = "a".repeat(40);
const COMMIT_B = "b".repeat(40);
const SCAN_ID = "c".repeat(64);

const baseGrant: Grant = {
  mode: "live",
  workspaceId: "github-user-42",
  projectId: "github-101",
  actorId: "github-user-42",
  operations: ["read", "scan", "triage", "report"],
  issuedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
};

function makeGraph(sourceRevision = COMMIT_A): ArchitectureGraph {
  return {
    schemaVersion: 1,
    analyzerVersion: "1.0.0",
    projectRef: "github-user-42/github-101",
    mode: "live",
    revision: sourceRevision.slice(0, 12),
    branch: "main",
    environment: "unknown",
    generatedAt: "2026-11-20T00:00:00.000Z",
    evidence: [
      {
        id: "ev-auth",
        kind: "source_file",
        sourcePath: "src/app/api/auth/route.ts",
        summary: "Auth handler",
        origin: "verified",
        sourceRevision,
      },
      {
        id: "ev-orders",
        kind: "source_file",
        sourcePath: "src/app/api/orders/[id]/route.ts",
        summary: "Orders API",
        origin: "verified",
        sourceRevision,
      },
      {
        id: "ev-dup-a",
        kind: "source_file",
        sourcePath: "src/shared/util.ts",
        summary: "Shared util in two nodes",
        origin: "verified",
        sourceRevision,
      },
      {
        id: "ev-root",
        kind: "manifest",
        sourcePath: "package.json",
        summary: "Root package",
        origin: "verified",
        sourceRevision,
      },
    ],
    nodes: [
      {
        id: "node-repo",
        kind: "repository",
        label: "acme/app",
        evidenceIds: ["ev-root"],
        origin: "verified",
        status: "observed_in_source",
      },
      {
        id: "node-auth",
        kind: "auth",
        label: "Auth Service",
        evidenceIds: ["ev-auth", "ev-dup-a"],
        origin: "verified",
        status: "observed_in_source",
        metadata: { route: "/api/auth" },
      },
      {
        id: "node-orders",
        kind: "api",
        label: "Orders API",
        evidenceIds: ["ev-orders", "ev-dup-a"],
        origin: "verified",
        status: "observed_in_source",
        metadata: { route: "/api/orders/[id]" },
      },
    ],
    edges: [],
    diagnostics: [],
    coverage: [],
  };
}

function makeFinding(over: Partial<Finding> = {}): Finding {
  return {
    mode: "live",
    workspaceId: "github-user-42",
    projectId: "github-101",
    id: over.id ?? "f-sast-1",
    title: over.title ?? "SQL injection hazard",
    severity: over.severity ?? "high",
    confidence: over.confidence ?? "high",
    status: over.status ?? "verified",
    source: over.source ?? {
      engine: "sast",
      scanner: "opengrep",
      version: "1.99.0",
      ruleId: "js.sql.injection",
      rulePack: "p/default",
    },
    location: over.location ?? { path: "./src/app/api/auth/route.ts", line: 42 },
    evidence: over.evidence ?? [
      {
        id: "e1",
        commit: COMMIT_A,
        recordedAt: "2026-11-20T00:00:00.000Z",
        summary: "Unsanitized query param",
        artifactDigest: "d".repeat(64),
        synthetic: false,
      },
    ],
  };
}

function makeScanJob(findings: Finding[], inventory: InventoryItem[] = []): ScanJob {
  return {
    mode: "live",
    workspaceId: "github-user-42",
    projectId: "github-101",
    id: SCAN_ID,
    idempotencyKey: `g02-live-${SCAN_ID.slice(0, 12)}`,
    requestedEngines: ["sast", "sca", "secrets"],
    repository: {
      provider: "github",
      repositoryId: "101",
      branch: "main",
      commit: COMMIT_A,
    },
    profile: "standard",
    status: "completed",
    createdAt: "2026-11-20T00:00:00.000Z",
    finishedAt: "2026-11-20T00:02:00.000Z",
    runs: [
      {
        engine: "sast",
        status: "completed",
        reason: "Scanned cleanly",
        scanner: "opengrep",
        version: "1.99.0",
        rulePack: "p/default",
        artifactDigest: "e".repeat(64),
        coverage: { status: "complete", scannedFiles: 12, eligibleFiles: 12, scope: "src" },
      },
    ],
    findings,
    inventory,
    sourceCoverage: {
      status: "complete",
      retrievedFiles: 12,
      excludedFiles: 0,
      treeTruncated: false,
    },
    audit: [
      {
        actorId: "github-user-42",
        at: "2026-11-20T00:00:00.000Z",
        action: "repository_scan_requested",
        subjectId: SCAN_ID,
        reason: "manual",
      },
    ],
  };
}

describe("Guard G06 unit suite (GitHub-only scope, bridges, redaction, reports)", () => {
  it("normalizes repo paths safely and rejects path traversal", () => {
    expect(normalizeRepoPath("./src\\api/orders/route.ts:24:5")).toBe(
      "src/api/orders/route.ts",
    );
    expect(normalizeRepoPath("../etc/passwd")).toBeNull();
    expect(normalizeRepoPath("")).toBeNull();
  });

  it("matches exact/parameterized API routes strictly without catch-all guessing", () => {
    expect(matchEndpointToGraphRoute("/api/orders/123", "/api/orders/[id]")).toBe(
      false,
    );
    expect(matchEndpointToGraphRoute("/api/orders/:id", "/api/orders/[id]")).toBe(
      true,
    );
    expect(matchEndpointToGraphRoute("/api/orders/1", "/api/[...slug]")).toBe(
      false,
    );
  });

  it("GRD-013 maps source paths, root manifest, G05 API routes, deduplicates, and separates unmatched reasons", () => {
    const graph = makeGraph(COMMIT_A);
    const findings: Finding[] = [
      makeFinding({ id: "f-auth", location: { path: "src/app/api/auth/route.ts", line: 10 } }),
      // Duplicate logical finding on same node/rule/line -> deduplicated
      makeFinding({ id: "f-auth-dup", location: { path: "./src/app/api/auth/route.ts", line: 10 } }),
      // Ambiguous file shared by two nodes -> MUST NOT pick randomly
      makeFinding({ id: "f-ambig", location: { path: "src/shared/util.ts", line: 5 } }),
      // Root lockfile maps to single repository root
      makeFinding({
        id: "f-sca",
        source: { engine: "sca", scanner: "osv", version: "1.9", ruleId: "GHSA-1", rulePack: "osv" },
        location: { path: "package-lock.json" },
      }),
      // Image finding has no source path -> unmatched no_location
      makeFinding({ id: "f-img", location: { artifactKind: "image", imageDigest: "sha256:" + "a".repeat(64) } }),
      // Unseen file -> no_matching_node
      makeFinding({ id: "f-miss", location: { path: "scripts/untracked.sh", line: 1 } }),
    ];

    const g05Run: G05Run = {
      workspaceId: "github-user-42",
      projectId: "github-101",
      id: "run-g05-1",
      idempotencyKey: "k1",
      fingerprint: "f".repeat(64),
      testPlanId: "tp-1",
      targetId: "tgt-1",
      targetRevision: 1,
      grantId: "g-1",
      trustPlanId: null,
      workflowImportId: null,
      retestOfRunId: null,
      retestCaseIds: null,
      status: "completed",
      scannerVersion: "g05-1",
      scopeDigest: "a".repeat(64),
      executedRequests: 4,
      maxRequests: 20,
      cleanupStatus: "verified",
      evidenceDigest: "b".repeat(64),
      summary: {
        totalCases: 4,
        passed: 3,
        failed: 1,
        inconclusive: 0,
        notExecuted: 0,
        cancelled: 0,
        cleanupFailed: 0,
        findingsCreated: 1,
        decision: "BLOCKED",
      },
      coverage: {
        executedCategories: ["integrity_ownership"],
        skippedCategories: [],
        invariantsVerified: [],
        invariantsFailed: ["ownership"],
        targetEnvironment: "local_synthetic",
        tlsApplicable: false,
        localSyntheticPinned: true,
      },
      revision: 1,
      createdBy: "github-user-42",
      createdAt: "2026-11-20T00:00:00.000Z",
      startedAt: "2026-11-20T00:01:00.000Z",
      finishedAt: "2026-11-20T00:02:00.000Z",
      updatedAt: "2026-11-20T00:02:00.000Z",
    };

    const g05Findings: G05Finding[] = [
      {
        id: "g05-f1",
        workspaceId: "github-user-42",
        projectId: "github-101",
        runId: "run-g05-1",
        caseId: "case-idor",
        engine: "integrity",
        title: "Cross-user order read",
        severity: "critical",
        confidence: "high",
        status: "verified",
        endpoint: "/api/orders/:id",
        invariantFamily: "ownership",
        summary: "User B read User A order",
        evidence: [],
        triageReason: null,
        triagedBy: null,
        triagedAt: null,
        retestOfFindingId: null,
        revision: 1,
        createdAt: "2026-11-20T00:00:00.000Z",
        updatedAt: "2026-11-20T00:00:00.000Z",
      },
    ];

    const overlay = buildGuardCanvasOverlay({
      projectId: "github-101",
      graph,
      g02Scan: {
        id: SCAN_ID,
        status: "completed",
        updatedAt: "2026-11-20T00:02:00.000Z",
        job: makeScanJob(findings),
      },
      g05Runs: [g05Run],
      g05Findings,
    });

    expect(overlay.coverageStatus).toBe("partial");
    expect(overlay.mappedFindings.map((m) => [m.id, m.nodeId, m.basis])).toEqual([
      ["g05-f1", "node-orders", "api_route_exact"],
      ["f-auth", "node-auth", "evidence_source_path"],
      ["f-sca", "node-repo", "manifest_package_root"],
    ]);
    expect(
      overlay.unmatchedFindings.map((u) => [u.id, u.reason]),
    ).toEqual([
      ["f-ambig", "ambiguous_nodes"],
      ["f-img", "no_location"],
      ["f-miss", "no_matching_node"],
    ]);
  });

  it("GRD-013 refuses false attribution when scan commit differs from Canvas graph sourceRevision", () => {
    const staleOverlay = buildGuardCanvasOverlay({
      projectId: "github-101",
      graph: makeGraph(COMMIT_B),
      g02Scan: {
        id: SCAN_ID,
        status: "completed",
        updatedAt: "2026-11-20T00:02:00.000Z",
        job: makeScanJob([makeFinding()]),
      },
    });
    expect(staleOverlay.coverageStatus).toBe("stale");
    expect(staleOverlay.staleReasons.length).toBeGreaterThan(0);
    expect(staleOverlay.mappedFindings).toHaveLength(0);
    expect(staleOverlay.unmatchedFindings[0]?.reason).toBe("stale_commit");
  });

  it("GRD-020 normalizes inventory preserving unknown licenses as null and accounting non-npm items", () => {
    const job = makeScanJob([], [
      { ecosystem: "npm", name: "lodash", version: "4.17.20", license: "", sourcePath: "package-lock.json" },
      { ecosystem: "npm", name: "lodash", version: "4.17.20", license: "   ", sourcePath: "./package-lock.json" },
      { ecosystem: "pypi", name: "requests", version: "2.31.0", license: "Apache-2.0", sourcePath: "requirements.txt" },
    ]);
    const extracted = extractInventoryFromScan(job);
    const norm = normalizeInventoryForG06(COMMIT_A, extracted);
    expect(norm.items).toHaveLength(2);
    expect(norm.items.find((i) => i.name === "lodash")?.license).toBeNull();
    expect(norm.unknownLicenseCount).toBe(1);
    expect(norm.unsupportedCount).toBe(1);
    expect(norm.sentinelItems).toHaveLength(1);
  });

  it("GRD-021 strips secrets, enforces verified retest evidence, and restricts consumer URLs", () => {
    const dirty =
      "token=ghp_1234567890abcdefghijklmnop Bearer supersecretjwtvalue https://admin:s3cr3tPass@example.com/hook";
    const cleaned = redactG06Text(dirty);
    expect(containsUnredactedSecret(cleaned)).toBe(false);
    expect(cleaned).not.toContain("ghp_1234567890");
    expect(cleaned).not.toContain("s3cr3tPass");

    const obj = redactG06Value({
      headers: { Authorization: "Bearer secret" },
      note: "PAT github_pat_1234567890abcdef1234567890abcdef",
    });
    expect(obj.headers).toBe("[REDACTED]");
    expect(obj.note).not.toContain("github_pat_");

    expect(() =>
      buildValidatedPipelineEvent({
        grant: baseGrant,
        scope: baseGrant,
        event: {
          type: "remediation_retested",
          scanId: SCAN_ID,
          decision: "verified_fixed",
          repository: {
            provider: "github",
            repositoryId: "101",
            branch: "main",
            commit: COMMIT_A,
          },
          evidenceIds: [`scan:${SCAN_ID}`],
          retestVerified: false,
        },
      }),
    ).toThrow(/remediation_retested_requires_verified_retest_evidence/);

    const { handoff, idempotencyKey } = buildValidatedPipelineEvent({
      grant: baseGrant,
      scope: baseGrant,
      event: {
        type: "release_evaluated",
        scanId: SCAN_ID,
        decision: "block",
        repository: {
          provider: "github",
          repositoryId: "101",
          branch: "main",
          commit: COMMIT_A,
        },
        evidenceIds: [`scan:${SCAN_ID}`],
      },
      now: "2026-11-20T00:05:00.000Z",
    });
    expect(handoff.category).toBe("security_pipeline");
    expect(idempotencyKey).toContain("sentinel:github-101:release_evaluated");

    expect(() => validateConsumerUrl("http://consumer.example.com/ingest")).toThrow();
    expect(validateConsumerUrl("http://127.0.0.1:4999/ingest").hostname).toBe("127.0.0.1");
    expect(validateConsumerUrl("https://sentinel.internal.example/ingest").protocol).toBe("https:");
  });

  it("Unified report stays honest across states and escapes HTML against XSS", () => {
    const body = buildUnifiedGuardReport({
      projectId: "github-101",
      repositoryName: "acme/<script>alert(1)</script>",
      branch: "main",
      scan: {
        id: SCAN_ID,
        status: "completed",
        updatedAt: "2026-11-20T00:02:00.000Z",
        job: makeScanJob([makeFinding()], [
          { ecosystem: "npm", name: "lodash", version: "4.17.20", license: null, sourcePath: "package-lock.json" },
        ]),
      },
      g04: {
        available: true,
        policy: null,
        evaluations: [
          {
            id: "eval-1",
            triggerId: "trg-1",
            scanId: SCAN_ID,
            commit: COMMIT_A,
            branch: "main",
            policyRevision: 1,
            decision: "BLOCK",
            evaluation: {},
            enforcement: { enforced: false },
            supersededBy: null,
            createdAt: "2026-11-20T00:03:00.000Z",
          },
        ],
        checks: [],
        deployments: [],
      },
      g05: { available: false, runs: [], findings: [], reports: [] },
      latestOverlay: null,
      intelligenceSync: null,
      intelligenceOutbox: [],
      sentinelOutbox: [],
      sentinelAttempts: [],
      sentinelConsumerConfigured: false,
    });

    expect(body.source.acquisitionMethod).toBe("github_only");
    expect(body.source.excludedMethods).toEqual(["gitlab", "zip_upload"]);
    expect(body.overallStatus).toBe("BLOCKED");
    expect(body.cicdPolicy.enforced).toBe(false);
    expect(body.remediationAndRetest.status).toBe("NOT_CONNECTED");
    expect(body.remediationAndRetest.g03Merged).toBe(false);
    expect(body.integrations.sentinel.securityIncidentGenerated).toBe(false);

    const html = renderUnifiedReportHtml({
      reportId: body.reportId,
      workspaceId: "github-user-42",
      projectId: "github-101",
      commitSha: COMMIT_A,
      scanId: SCAN_ID,
      g05RunId: null,
      g04EvaluationId: "eval-1",
      overallStatus: body.overallStatus,
      reportDigest: "d".repeat(64),
      body,
      createdBy: "github-user-42",
      createdAt: body.generatedAt,
      retentionUntil: "2027-01-01T00:00:00.000Z",
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("OUT_OF_SCOPE_BY_OWNER_DECISION");
  });
});
