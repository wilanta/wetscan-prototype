import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type G05CaseResult,
  type G05Category,
  type G05Finding,
  type G05Scope,
  type G05TargetRecord,
  type G05TestAccountView,
} from "../../../src/features/guard/g05/contracts";
import {
  buildG05TestPlan,
  evaluateCanvasTrustPlan,
  importCanvasWorkflow,
} from "../../../src/features/guard/g05/canvas-bridge";
import {
  executeDastAndAuthCases,
  G05SessionManager,
  type RuntimeSyntheticAccount,
} from "../../../src/features/guard/g05/dast-engine";
import { EnforcedHttpClient } from "../../../src/features/guard/g05/egress";
import { executeIntegrityCases } from "../../../src/features/guard/g05/integrity-engine";
import { fingerprint } from "../../../src/platform/identity";
import { trustTestPlan } from "../../../src/features/canvas/trust/model";
import { workflowTemplate, workflowTestPlan } from "../../../src/features/canvas/workflows/model";
import type { TrustModel } from "../../../src/features/canvas/types";
import { SyntheticStagingServer } from "../../../worker/guard/g05-staging/server";

const SCOPE: G05Scope = {
  workspaceId: "github-user-1:ws-g05",
  projectId: "github-7001",
};
const ALL_CATEGORIES: G05Category[] = [
  "dast_header",
  "dast_tls",
  "dast_auth",
  "dast_cors",
  "dast_session",
  "dast_authz",
  "dast_response",
  "auth_matrix",
  "integrity_ownership",
  "integrity_workflow_bypass",
  "integrity_state_transition",
  "integrity_replay",
  "integrity_unauthorized_modification",
];

function sampleTrustModel(confirmed = true): TrustModel {
  return {
    roles: [
      { id: "r-anon", label: "Anonymous" },
      { id: "r-user", label: "User" },
      { id: "r-admin", label: "Admin" },
    ],
    resources: [
      { id: "res-orders", label: "Orders API", nodeId: "api" },
      { id: "res-admin", label: "Admin Audit", nodeId: "admin" },
    ],
    boundaryNodeIds: ["api", "admin"],
    policies: [
      { id: "p-1", roleId: "r-user", resourceId: "res-orders", action: "read own orders", ownership: "own", allowed: true, confirmed },
      { id: "p-2", roleId: "r-user", resourceId: "res-admin", action: "read admin audit", ownership: "any", allowed: false, confirmed },
      { id: "p-3", roleId: "r-admin", resourceId: "res-admin", action: "read admin audit", ownership: "any", allowed: true, confirmed },
    ],
  };
}

describe("G05 Canvas integration, DAST engine & 5-invariant Live Integrity Runner", () => {
  let server: SyntheticStagingServer;
  let origin: string;
  let target: G05TargetRecord;
  let runtimeAccounts: RuntimeSyntheticAccount[];

  beforeAll(async () => {
    server = new SyntheticStagingServer({ host: "127.0.0.1", port: 0 });
    const info = await server.start();
    origin = info.origin;

    target = {
      workspaceId: SCOPE.workspaceId,
      projectId: SCOPE.projectId,
      id: "local-staging",
      revision: 1,
      name: "In-Process Synthetic Staging",
      environment: "local_synthetic",
      origin,
      serviceIdentity: info.serviceIdentity,
      owner: "sec-team",
      status: "active",
      targetDigest: fingerprint({ origin }),
      createdBy: "tester",
      updatedBy: "tester",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      config: {
        allowedRoutes: [
          "/healthz",
          "/api/public/catalog",
          "/api/redirect-probe",
          "/api/orders",
          "/api/orders/*",
          "/api/auth/*",
          "/api/admin/*",
        ],
        allowedMethods: ["GET", "HEAD", "OPTIONS", "POST", "PATCH", "DELETE"],
        maxRequests: 250,
        maxConcurrency: 3,
        rateLimitRps: 200,
        maxResponseBytes: 65536,
        timeoutMs: 3000,
        approvedCategories: ALL_CATEGORIES,
        allowedSyntheticResources: ["order", "session"],
        cleanupPolicy: "delete_created_and_revoke_sessions",
      },
    };

    const exp = new Date(Date.now() + 3600_000).toISOString();
    runtimeAccounts = server.accounts.map((a): RuntimeSyntheticAccount => {
      const view: G05TestAccountView = {
        workspaceId: SCOPE.workspaceId,
        projectId: SCOPE.projectId,
        id: `acct-${a.role}`,
        targetId: target.id,
        role: a.role,
        customRoleName: null,
        label: `Synthetic ${a.role}`,
        synthetic: true,
        usernameRef: a.username,
        authStrategy: "bearer_login",
        loginPath: "/api/auth/login",
        credentialConfigured: true,
        credentialFingerprint: fingerprint({ role: a.role }),
        status: "configured",
        expiresAt: exp,
        lastVerifiedAt: null,
        revokedAt: null,
        createdBy: "tester",
        updatedBy: "tester",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return { view, secret: a.password };
    });
  });

  afterAll(async () => {
    await server.stop();
  });

  it("evaluates Canvas Trust & Workflow contracts fail-closed against cross-project, unconfirmed, stale, or cyclic inputs", () => {
    const rawTrust = {
      ...trustTestPlan(`github-7001`, sampleTrustModel(true)),
      canvasGraphRevision: "rev-001",
      confirmed: true,
      confirmedBy: "sec-lead",
      confirmedAt: new Date().toISOString(),
    };
    const okTrust = evaluateCanvasTrustPlan(rawTrust, SCOPE, {
      expectedGraphRevision: "rev-001",
      actorId: "tester",
    });
    expect(okTrust.integrationStatus).toBe("CONNECTED");
    expect(okTrust.confirmed).toBe(true);

    const crossProject = evaluateCanvasTrustPlan(
      { ...rawTrust, projectRef: "github-9999" },
      SCOPE,
      { actorId: "tester" },
    );
    expect(crossProject.integrationStatus).toBe("NOT_AUTHORIZED");

    const stale = evaluateCanvasTrustPlan(rawTrust, SCOPE, {
      expectedGraphRevision: "rev-002",
      actorId: "tester",
    });
    expect(stale.integrationStatus).toBe("STALE");

    const unconfirmed = evaluateCanvasTrustPlan(
      { ...trustTestPlan(`github-7001`, sampleTrustModel(false)), canvasGraphRevision: "rev-001" },
      SCOPE,
      { actorId: "tester" },
    );
    expect(unconfirmed.confirmed).toBe(false);
    expect(unconfirmed.integrationStatus).toBe("NOT_AUTHORIZED");

    const tpl = workflowTemplate(0, "wf-orders");
    const rawWf = {
      ...workflowTestPlan("github-7001", tpl),
      states: tpl.states,
      canvasGraphRevision: "rev-001",
    };
    const okWf = importCanvasWorkflow(rawWf, SCOPE, { target, actorId: "tester" });
    expect(okWf.validationStatus).toBe("valid");

    const brokenWf = importCanvasWorkflow(
      {
        workflowId: "wf-broken",
        name: "Broken",
        states: [{ id: "draft", label: "Draft" }, { id: "approved", label: "Approved" }],
        transitions: [{ id: "t1", from: "draft", to: "nonexistent", actor: "User", forbidden: false }],
      },
      SCOPE,
      { target, actorId: "tester" },
    );
    expect(brokenWf.validationStatus).toBe("rejected");
  });

  it("executes full DAST + Auth Matrix + all 5 Integrity families on hardened target with zero findings and verified cleanup", async () => {
    server.resetData(true);
    const trust = evaluateCanvasTrustPlan(
      {
        ...trustTestPlan("github-7001", sampleTrustModel(true)),
        canvasGraphRevision: "rev-001",
        confirmed: true,
        confirmedBy: "sec-lead",
        confirmedAt: new Date().toISOString(),
      },
      SCOPE,
      { actorId: "tester" },
    );
    const tpl = workflowTemplate(0, "wf-orders");
    const wf = importCanvasWorkflow(
      {
        ...workflowTestPlan("github-7001", tpl),
        states: tpl.states,
        canvasGraphRevision: "rev-001",
      },
      SCOPE,
      { target, actorId: "tester" },
    );
    const plan = buildG05TestPlan({
      scope: SCOPE,
      target,
      profile: "full_g05",
      accounts: runtimeAccounts.map((a) => a.view),
      trustPlan: { ...trust, workspaceId: SCOPE.workspaceId, projectId: SCOPE.projectId, createdAt: new Date().toISOString() },
      workflowImport: { ...wf, workspaceId: SCOPE.workspaceId, projectId: SCOPE.projectId, createdAt: new Date().toISOString() },
      actorId: "tester",
    });

    const client = new EnforcedHttpClient({
      target,
      localPin: { allowedOrigin: origin, serviceIdentity: server.serviceIdentity },
    });
    const sessions = new G05SessionManager(client, runtimeAccounts);
    const cases: G05CaseResult[] = [];
    const findings: Omit<G05Finding, "revision" | "createdAt" | "updatedAt">[] = [];
    const runId = "0".repeat(64);

    await executeDastAndAuthCases({
      scope: SCOPE,
      target,
      runId,
      client,
      sessions,
      cases: plan.cases,
      onCase: async (c) => { cases.push(c); },
      onFinding: async (f) => { findings.push(f); },
    });
    await executeIntegrityCases({
      scope: SCOPE,
      target,
      runId,
      client,
      sessions,
      cases: plan.cases,
      onCase: async (c) => { cases.push(c); },
      onFinding: async (f) => { findings.push(f); },
    });
    const sessionCleanup = await sessions.cleanupAll();

    expect(sessionCleanup.failed).toBe(0);
    expect(findings.length).toBe(0);

    // Local synthetic HTTP target reports TLS as NOT_EXECUTED (not_applicable), never fake PASS
    const tlsCase = cases.find((c) => c.category === "dast_tls");
    expect(tlsCase?.status).toBe("NOT_EXECUTED");

    const integrityCases = cases.filter((c) => c.invariantFamily !== null);
    expect(integrityCases.map((c) => c.invariantFamily).sort()).toEqual([
      "ownership",
      "replay",
      "state_transition",
      "unauthorized_modification",
      "workflow_bypass",
    ]);
    for (const ic of integrityCases) {
      expect(ic.status).toBe("VERIFIED_PASS");
      expect(ic.cleanupStatus).toBe("verified");
      expect(ic.preState).not.toBeNull();
      expect(ic.postState).not.toBeNull();
    }

    // Seeded-order count equals baseline (zero leaked synthetic orders)
    const health = await fetch(`${origin}/healthz`).then((r) => r.json());
    expect(health.orderCount).toBe(2);
  });

  it("detects every single DAST, Auth Matrix, and 5 Integrity failure including falseErrorWithMutation", async () => {
    server.resetData(true);
    server.setFaultFlags({
      weakHeaders: true,
      permissiveCors: true,
      brokenAdminAuth: true,
      ignoreSessionExpiry: true,
      ignoreSessionRevocation: true,
      openRedirectTarget: "external",
      ownershipBypass: true,
      workflowBypass: true,
      stateTransitionBypass: true,
      replayBypass: true,
      unauthorizedModBypass: true,
    });

    const plan = buildG05TestPlan({
      scope: SCOPE,
      target,
      profile: "full_g05",
      accounts: runtimeAccounts.map((a) => a.view),
      trustPlan: null,
      workflowImport: null,
      actorId: "tester",
    });

    const client = new EnforcedHttpClient({
      target,
      localPin: { allowedOrigin: origin, serviceIdentity: server.serviceIdentity },
    });
    const sessions = new G05SessionManager(client, runtimeAccounts);
    const cases: G05CaseResult[] = [];
    const findings: Omit<G05Finding, "revision" | "createdAt" | "updatedAt">[] = [];
    const runId = "1".repeat(64);

    await executeDastAndAuthCases({
      scope: SCOPE,
      target,
      runId,
      client,
      sessions,
      cases: plan.cases,
      onCase: async (c) => { cases.push(c); },
      onFinding: async (f) => { findings.push(f); },
    });
    await executeIntegrityCases({
      scope: SCOPE,
      target,
      runId,
      client,
      sessions,
      cases: plan.cases,
      onCase: async (c) => { cases.push(c); },
      onFinding: async (f) => { findings.push(f); },
    });
    await sessions.cleanupAll();

    for (const fam of [
      "ownership",
      "workflow_bypass",
      "state_transition",
      "replay",
      "unauthorized_modification",
    ] as const) {
      const c = cases.find((x) => x.invariantFamily === fam);
      expect(c?.status).toBe("VERIFIED_FAIL");
      expect(c?.cleanupStatus).toBe("verified");
      expect(findings.some((f) => f.invariantFamily === fam)).toBe(true);
    }

    expect(cases.find((c) => c.category === "dast_header")?.status).toBe("VERIFIED_FAIL");
    expect(cases.find((c) => c.category === "dast_cors")?.status).toBe("VERIFIED_FAIL");
    expect(cases.find((c) => c.category === "dast_session")?.status).toBe("VERIFIED_FAIL");
    expect(cases.find((c) => c.category === "auth_matrix")?.status).toBe("VERIFIED_FAIL");
    expect(cases.find((c) => c.category === "dast_response")?.status).toBe("VERIFIED_FAIL");

    // Verify falseErrorWithMutation alone (HTTP 403 returned while mutating backend DB state!)
    server.resetData(true);
    server.setFaultFlags({ falseErrorWithMutation: true });
    const stealthCases: G05CaseResult[] = [];
    const stealthFindings: Omit<G05Finding, "revision" | "createdAt" | "updatedAt">[] = [];
    const client2 = new EnforcedHttpClient({
      target,
      localPin: { allowedOrigin: origin, serviceIdentity: server.serviceIdentity },
    });
    const sessions2 = new G05SessionManager(client2, runtimeAccounts);
    await executeIntegrityCases({
      scope: SCOPE,
      target,
      runId: "2".repeat(64),
      client: client2,
      sessions: sessions2,
      cases: plan.cases.filter((c) => c.invariantFamily === "unauthorized_modification"),
      onCase: async (c) => { stealthCases.push(c); },
      onFinding: async (f) => { stealthFindings.push(f); },
    });
    await sessions2.cleanupAll();
    expect(stealthCases[0]?.status).toBe("VERIFIED_FAIL");
    expect(stealthFindings[0]?.invariantFamily).toBe("unauthorized_modification");
  });
});
