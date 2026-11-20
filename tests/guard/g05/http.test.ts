import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  authorizeGuardProject: vi.fn(),
  requireOrigin: vi.fn(),
  requestToken: vi.fn(),
  openG05: vi.fn(),
  service: {
    overview: vi.fn(),
    saveTarget: vi.fn(),
    enqueueRun: vi.fn(),
  },
  store: {
    listTargets: vi.fn(),
    listGrants: vi.fn(),
    listTestAccounts: vi.fn(),
    listTrustPlans: vi.fn(),
    listWorkflowImports: vi.fn(),
    listTestPlans: vi.fn(),
    listRuns: vi.fn(),
    listFindings: vi.fn(),
    listReports: vi.fn(),
  },
}));

vi.mock("../../../src/features/guard/live/project", () => ({
  authorizeGuardProject: (...args: unknown[]) => mocks.authorizeGuardProject(...args),
}));
vi.mock("../../../src/lib/auth/http", () => ({
  requireOrigin: (...args: unknown[]) => mocks.requireOrigin(...args),
}));
vi.mock("../../../src/lib/auth/session", () => ({
  requestToken: (...args: unknown[]) => mocks.requestToken(...args),
}));
vi.mock("../../../src/features/guard/g05/runtime", async () => {
  const actual = await vi.importActual<typeof import("../../../src/features/guard/g05/runtime")>(
    "../../../src/features/guard/g05/runtime",
  );
  return {
    ...actual,
    g05Host: async () => {
      if (!actual.isG05Enabled()) throw new actual.G05DisabledError();
      return {
        service: mocks.service,
        store: mocks.store,
        db: { close: vi.fn() },
        vaultKey: Buffer.alloc(32, 7),
        localPin: null,
      };
    },
  };
});

import { AuthError } from "../../../src/lib/auth/config";
import { g05Route } from "../../../src/features/guard/g05/http";
import { renderG05ReportHtml } from "../../../src/features/guard/g05/service";
import type { G05Report } from "../../../src/features/guard/g05/contracts";

function req(method: string, url: string, body?: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body } : {}),
  });
}

describe("G05 API route security, CSRF, fail-closed gating & XSS report escaping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.requestToken.mockReturnValue("tok");
    mocks.authorizeGuardProject.mockResolvedValue({
      grant: {
        workspaceId: "github-user-1:ws",
        projectId: "github-101",
        actorId: "github-user-1",
        mode: "live",
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 404 on malformed projectId or unknown resource", async () => {
    const r1 = await g05Route(req("GET", "http://127.0.0.1/api/guard/projects/bad/g05/overview"), "bad", "overview");
    expect(r1.status).toBe(404);
    const r2 = await g05Route(
      req("GET", "http://127.0.0.1/api/guard/projects/github-101/g05/unknown"),
      "github-101",
      "unknown",
    );
    expect(r2.status).toBe(404);
  });

  it("enforces authentication and CSRF requireOrigin on mutating requests", async () => {
    mocks.authorizeGuardProject.mockRejectedValueOnce(new AuthError("unauthenticated", 401));
    const unauth = await g05Route(
      req("GET", "http://127.0.0.1/api/guard/projects/github-101/g05/overview"),
      "github-101",
      "overview",
    );
    expect(unauth.status).toBe(401);

    mocks.requireOrigin.mockImplementationOnce(() => {
      throw new AuthError("forbidden_origin", 403);
    });
    const csrfFail = await g05Route(
      req("POST", "http://127.0.0.1/api/guard/projects/github-101/g05/targets", "{}"),
      "github-101",
      "targets",
    );
    expect(csrfFail.status).toBe(403);
    expect(mocks.service.saveTarget).not.toHaveBeenCalled();
  });

  it("fails closed when GUARD_G05_ENABLED is unset (200 not_configured on GET overview, 503 on mutations)", async () => {
    vi.stubEnv("GUARD_G05_ENABLED", undefined);
    const ov = await g05Route(
      req("GET", "http://127.0.0.1/api/guard/projects/github-101/g05/overview"),
      "github-101",
      "overview",
    );
    expect(ov.status).toBe(200);
    const ovBody = await ov.json();
    expect(ovBody.enabled).toBe(false);
    expect(ovBody.status).toBe("not_configured");

    const post = await g05Route(
      req("POST", "http://127.0.0.1/api/guard/projects/github-101/g05/targets", "{}"),
      "github-101",
      "targets",
    );
    expect(post.status).toBe(503);
    expect((await post.json()).error).toBe("g05_disabled");
  });

  it("queues run via POST runs (202) and rejects oversized JSON bodies (413)", async () => {
    vi.stubEnv("GUARD_G05_ENABLED", "1");
    mocks.service.enqueueRun.mockResolvedValueOnce({
      run: { id: "a".repeat(64), status: "queued" },
      duplicate: false,
    });
    const ok = await g05Route(
      req(
        "POST",
        "http://127.0.0.1/api/guard/projects/github-101/g05/runs",
        JSON.stringify({ idempotencyKey: "run-key-1234", testPlanId: "p1", grantId: "g1" }),
      ),
      "github-101",
      "runs",
    );
    expect(ok.status).toBe(202);

    const huge = await g05Route(
      req(
        "POST",
        "http://127.0.0.1/api/guard/projects/github-101/g05/workflows",
        JSON.stringify({ pad: "x".repeat(140_000) }),
      ),
      "github-101",
      "workflows",
    );
    expect(huge.status).toBe(413);
  });

  it("HTML report serializer escapes script injection payloads safely", () => {
    const fakeReport: G05Report = {
      workspaceId: "ws",
      projectId: "github-101",
      id: "r".repeat(64),
      runId: "u".repeat(64),
      runRevision: 1,
      targetId: "t1",
      targetRevision: 1,
      reportDigest: "d".repeat(64),
      createdBy: "actor",
      createdAt: new Date().toISOString(),
      body: {
        schemaVersion: 1,
        module: "guard-g05",
        scope: { workspaceId: "ws", projectId: "github-101" },
        target: {
          id: "t1",
          revision: 1,
          environment: "local_synthetic",
          origin: "http://127.0.0.1:4115",
          targetDigest: "t".repeat(64),
        },
        run: {
          summary: {
            totalCases: 1,
            passed: 0,
            failed: 1,
            inconclusive: 0,
            notExecuted: 0,
            cancelled: 0,
            cleanupFailed: 0,
            findingsCreated: 1,
            decision: "FAIL",
          },
          status: "completed",
          cleanupStatus: "verified",
        } as G05Report["body"]["run"],
        cases: [],
        findings: [
          {
            workspaceId: "ws",
            projectId: "github-101",
            id: "f".repeat(64),
            runId: "u".repeat(64),
            caseId: "c1",
            engine: "integrity",
            title: "<script>alert(1)</script>",
            severity: "high",
            confidence: "high",
            status: "verified",
            endpoint: "GET /api/orders/<img onerror=alert(2)>",
            invariantFamily: "ownership",
            summary: "xss",
            evidence: [],
            retestOfFindingId: null,
            triageReason: null,
            triagedBy: null,
            triagedAt: null,
            revision: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        limitations: [],
      },
    };
    const html = renderG05ReportHtml(fakeReport);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img onerror");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
