import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { trustTestPlan } from "../../../src/features/canvas/trust/model";
import { workflowTemplate, workflowTestPlan } from "../../../src/features/canvas/workflows/model";
import type { G05Category, G05Scope } from "../../../src/features/guard/g05/contracts";
import { renderG05ReportHtml, G05Service } from "../../../src/features/guard/g05/service";
import { G05PostgresStore } from "../../../src/features/guard/g05/store";
import { runG05WorkerOnce } from "../../../src/features/guard/g05/worker";
import {
  loadStagingRuntimeCredentials,
  openG05ForTests,
} from "./pg-env";

const SCOPE: G05Scope = {
  workspaceId: "github-user-42:ws-e2e",
  projectId: "github-92001",
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

async function setDockerStagingFaults(
  origin: string,
  controlSecret: string,
  faults: Record<string, unknown> | "reset",
) {
  const url =
    faults === "reset"
      ? `${origin}/api/synthetic/reset`
      : `${origin}/api/synthetic/faults`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wetscan-control-secret": controlSecret,
    },
    body: faults === "reset" ? "{}" : JSON.stringify(faults),
  });
  if (!r.ok) throw new Error(`Staging control request failed: ${r.status}`);
  return r.json();
}

describe("G05 full PostgreSQL + isolated Worker + Docker synthetic staging verification", () => {
  let ctx: Awaited<ReturnType<typeof openG05ForTests>>;
  let stagingCreds: Awaited<ReturnType<typeof loadStagingRuntimeCredentials>>;
  let service: G05Service;
  let workerStore: G05PostgresStore;

  beforeAll(async () => {
    ctx = await openG05ForTests();
    stagingCreds = await loadStagingRuntimeCredentials();
    service = new G05Service(new G05PostgresStore(ctx.db.app), {
      vaultKey: ctx.vaultKey,
      localPin: ctx.localPin,
    });
    workerStore = new G05PostgresStore(ctx.db.worker);

    // Ensure Docker synthetic staging is alive and reset
    await setDockerStagingFaults(stagingCreds.origin, stagingCreds.controlSecret, "reset");
  });

  afterAll(async () => {
    if (stagingCreds) {
      await setDockerStagingFaults(stagingCreds.origin, stagingCreds.controlSecret, "reset").catch(
        () => undefined,
      );
    }
    await ctx?.db.close();
  });

  it("executes real worker loop against vulnerable Docker staging -> persists failures -> retests after fix -> verified_fixed & PASS report", async () => {
    const existingTarget = await service.store.getTarget(SCOPE, "docker-staging");
    const target = await service.saveTarget(SCOPE, "qa-lead", {
      id: "docker-staging",
      name: "Docker Synthetic Staging",
      environment: "local_synthetic",
      origin: stagingCreds.origin,
      serviceIdentity: stagingCreds.serviceIdentity,
      owner: "sec-lead",
      status: "active",
      expectedRevision: existingTarget?.revision ?? 0,
      reason: "G05 E2E acceptance target",
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
        maxRequests: 300,
        maxConcurrency: 3,
        rateLimitRps: 20,
        maxResponseBytes: 65536,
        timeoutMs: 3000,
        approvedCategories: ALL_CATEGORIES,
        allowedSyntheticResources: ["order", "session"],
        cleanupPolicy: "delete_created_and_revoke_sessions",
      },
    });

    const grant = await service.issueGrant(SCOPE, "qa-lead", {
      targetId: target.id,
      proofId: "proof-docker-92001",
      authorizationRef: "AUTH-G05-92001",
      approvedCategories: ALL_CATEGORIES,
      expiresAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
    });

    for (const acc of stagingCreds.accounts) {
      await service.saveTestAccount(SCOPE, "qa-lead", {
        id: `docker-${acc.role.replaceAll("_", "-")}`,
        targetId: target.id,
        role: acc.role as "user_a" | "user_b" | "privileged",
        label: `Docker ${acc.role}`,
        usernameRef: acc.username,
        authStrategy: "bearer_login",
        loginPath: "/api/auth/login",
        secret: acc.password,
        expiresAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
      });
    }

    const trustPlan = await service.importTrustPlan(SCOPE, "qa-lead", {
      ...trustTestPlan("github-92001", {
        roles: [
          { id: "r1", label: "User" },
          { id: "r2", label: "Admin" },
        ],
        resources: [
          { id: "res1", label: "Orders", nodeId: "api" },
          { id: "res2", label: "Admin Audit", nodeId: "admin" },
        ],
        boundaryNodeIds: ["api", "admin"],
        policies: [
          { id: "pol-1", roleId: "r1", resourceId: "res1", action: "read own", ownership: "own", allowed: true, confirmed: true },
          { id: "pol-2", roleId: "r1", resourceId: "res2", action: "read admin", ownership: "any", allowed: false, confirmed: true },
          { id: "pol-3", roleId: "r2", resourceId: "res2", action: "read admin", ownership: "any", allowed: true, confirmed: true },
        ],
      }),
      canvasGraphRevision: `rev-docker-${target.revision}`,
      confirmed: true,
      confirmedBy: "qa-lead",
      confirmedAt: new Date().toISOString(),
    });

    const wfTpl = workflowTemplate(0, "wf-docker-orders");
    const workflowImport = await service.importWorkflow(
      SCOPE,
      "qa-lead",
      {
        ...workflowTestPlan("github-92001", wfTpl),
        states: wfTpl.states,
        canvasGraphRevision: `rev-docker-${target.revision}`,
      },
      { targetId: target.id, trustPlanId: trustPlan.id },
    );

    const testPlan = await service.createTestPlanPreview(SCOPE, "qa-lead", {
      targetId: target.id,
      profile: "full_g05",
      trustPlanId: trustPlan.id,
      workflowImportId: workflowImport.id,
    });

    // Enable vulnerabilities on Docker container
    await setDockerStagingFaults(stagingCreds.origin, stagingCreds.controlSecret, {
      weakHeaders: true,
      ownershipBypass: true,
      workflowBypass: true,
      stateTransitionBypass: true,
      replayBypass: true,
      unauthorizedModBypass: true,
    });

    const uniq = Date.now().toString(36);
    const { run: vulnRun, duplicate } = await service.enqueueRun(SCOPE, "qa-lead", {
      idempotencyKey: `vuln-run-${uniq}`,
      testPlanId: testPlan.id,
      grantId: grant.id,
    });
    expect(duplicate).toBe(false);

    // Duplicate idempotent request returns the same queued run
    const { run: dupRun, duplicate: isDup } = await service.enqueueRun(SCOPE, "qa-lead", {
      idempotencyKey: `vuln-run-${uniq}`,
      testPlanId: testPlan.id,
      grantId: grant.id,
    });
    expect(isDup).toBe(true);
    expect(dupRun.id).toBe(vulnRun.id);

    const w1 = await runG05WorkerOnce({
      store: workerStore,
      workerId: "test-worker-1",
      vaultKey: ctx.vaultKey,
      localPin: ctx.localPin,
      onlyScope: SCOPE,
      onlyRunId: vulnRun.id,
    });
    expect(w1.processed).toBe(1);

    const finishedVuln = await service.store.getRun(SCOPE, vulnRun.id);
    expect(finishedVuln?.status).toBe("completed_partial"); // because dast_tls is NOT_EXECUTED on HTTP local_synthetic
    expect(finishedVuln?.summary.decision).toBe("FAIL");
    expect(finishedVuln?.cleanupStatus).toBe("verified");
    expect(finishedVuln?.coverage.invariantsFailed.sort()).toEqual([
      "ownership",
      "replay",
      "state_transition",
      "unauthorized_modification",
      "workflow_bypass",
    ]);

    const vulnFindings = await service.store.listFindings(SCOPE, vulnRun.id);
    expect(vulnFindings.length).toBeGreaterThanOrEqual(6); // 5 integrity + weak headers
    for (const f of vulnFindings) {
      expect(JSON.stringify(f)).not.toContain(stagingCreds.accounts[0].password);
    }

    // Check Docker staging health: zero leaked synthetic orders (baseline=2)
    const healthAfterVuln = await fetch(`${stagingCreds.origin}/healthz`).then((r) => r.json());
    expect(healthAfterVuln.orderCount).toBe(2);

    // Reset Docker staging back to hardened mode and trigger targeted retest!
    await setDockerStagingFaults(stagingCreds.origin, stagingCreds.controlSecret, "reset");
    const { run: retestRun } = await service.enqueueRetest(SCOPE, "qa-lead", {
      idempotencyKey: `retest-run-${uniq}`,
      sourceRunId: vulnRun.id,
      grantId: grant.id,
    });
    expect(retestRun.retestOfRunId).toBe(vulnRun.id);
    expect(retestRun.retestCaseIds?.length).toBe(vulnFindings.length);

    const w2 = await runG05WorkerOnce({
      store: workerStore,
      workerId: "test-worker-2",
      vaultKey: ctx.vaultKey,
      localPin: ctx.localPin,
      onlyScope: SCOPE,
      onlyRunId: retestRun.id,
    });
    expect(w2.processed).toBe(1);

    const finishedRetest = await service.store.getRun(SCOPE, retestRun.id);
    expect(finishedRetest?.status).toBe("completed");
    expect(finishedRetest?.summary.decision).toBe("PASS");
    expect(finishedRetest?.cleanupStatus).toBe("verified");

    const updatedFindings = await service.store.listFindings(SCOPE);
    for (const vf of vulnFindings) {
      const updated = updatedFindings.find((x) => x.id === vf.id);
      expect(updated?.status).toBe("verified_fixed");
    }

    // Generate persisted JSON + escaped HTML report
    const report = await service.generateReport(SCOPE, "qa-lead", retestRun.id);
    expect(report.body.run.status).toBe("completed");
    const html = renderG05ReportHtml(report);
    expect(html).toContain(report.reportDigest);
    expect(html).toContain("PASS");
  });

  it("handles mid-run cancellation, narrow grant rejection, and revoked grant fail-closed without marking incomplete as PASS", async () => {
    const target = (await service.store.getTarget(SCOPE, "docker-staging"))!;
    const plan = await service.createTestPlanPreview(SCOPE, "qa-lead", {
      targetId: target.id,
      profile: "dast_baseline",
    });

    // Narrow grant missing dast_tls must fail closed before enqueueing
    const narrowGrant = await service.issueGrant(SCOPE, "qa-lead", {
      targetId: target.id,
      proofId: "proof-narrow-" + Date.now(),
      authorizationRef: "AUTH-NARROW",
      approvedCategories: ["dast_header"],
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await expect(
      service.enqueueRun(SCOPE, "qa-lead", {
        idempotencyKey: `narrow-run-${Date.now()}`,
        testPlanId: plan.id,
        grantId: narrowGrant.id,
      }),
    ).rejects.toMatchObject({ code: "grant_invalid" });

    const grant = await service.issueGrant(SCOPE, "qa-lead", {
      targetId: target.id,
      proofId: "proof-cancel-" + Date.now(),
      authorizationRef: "AUTH-CANCEL",
      approvedCategories: target.config.approvedCategories,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    const uniq = Date.now().toString(36);
    const { run: revokedRun } = await service.enqueueRun(SCOPE, "qa-lead", {
      idempotencyKey: `revoked-run-${uniq}`,
      testPlanId: plan.id,
      grantId: grant.id,
    });

    // Revoke grant BEFORE worker starts!
    await service.revokeGrant(SCOPE, grant.id, "qa-lead", "Emergency revocation before execution");
    await runG05WorkerOnce({
      store: workerStore,
      workerId: "test-worker-revoke",
      vaultKey: ctx.vaultKey,
      localPin: ctx.localPin,
      onlyScope: SCOPE,
      onlyRunId: revokedRun.id,
    });
    const afterRevoke = await service.store.getRun(SCOPE, revokedRun.id);
    expect(afterRevoke?.status).toBe("failed");
    expect(afterRevoke?.summary.decision).toBe("INCOMPLETE");

    // Cancel BEFORE worker starts
    const grant2 = await service.issueGrant(SCOPE, "qa-lead", {
      targetId: target.id,
      proofId: "proof-cancel2-" + Date.now(),
      authorizationRef: "AUTH-CANCEL2",
      approvedCategories: target.config.approvedCategories,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    const { run: cancelRun } = await service.enqueueRun(SCOPE, "qa-lead", {
      idempotencyKey: `cancel-run-${uniq}`,
      testPlanId: plan.id,
      grantId: grant2.id,
    });
    const cancelled = await service.cancelRun(SCOPE, cancelRun.id, "qa-lead");
    expect(cancelled.status).toBe("cancelled");

    const wCancel = await runG05WorkerOnce({
      store: workerStore,
      workerId: "test-worker-cancel",
      vaultKey: ctx.vaultKey,
      localPin: ctx.localPin,
      onlyScope: SCOPE,
      onlyRunId: cancelRun.id,
    });
    expect(wCancel.processed).toBe(0);
  });
});
