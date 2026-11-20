import { fingerprint } from "../../../platform/identity";
import {
  G05_SCANNER_VERSION,
  type G05CanvasTrustPlan,
  type G05CaseResult,
  type G05Category,
  type G05ExecutionGrant,
  type G05Finding,
  type G05FindingStatus,
  type G05Profile,
  type G05Report,
  type G05Run,
  type G05Scope,
  type G05TargetRecord,
  type G05TestAccountView,
  type G05TestPlan,
  type G05WorkflowImport,
} from "./contracts";
import {
  buildG05TestPlan,
  evaluateCanvasTrustPlan,
  G05ValidationError,
  importCanvasWorkflow,
  validateTargetInput,
} from "./canvas-bridge";
import type { LocalSyntheticTargetPin } from "./egress";
import { G05PostgresStore, G05StoreError } from "./store";
import { redactG05JsonValue, sealCredential } from "./vault";

export class G05ServiceError extends Error {
  constructor(
    public readonly code:
      | "invalid_input"
      | "not_found"
      | "forbidden"
      | "conflict"
      | "grant_invalid"
      | "local_synthetic_not_authorized"
      | "vault_not_configured"
      | "stale_plan"
      | "unconfirmed_plan"
      | "cross_project_plan_denied"
      | "invalid_workflow",
    public readonly status: number,
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message);
  }
}

export function verifyTargetAuthorization(input: {
  target: G05TargetRecord;
  grant: G05ExecutionGrant;
  localPin: LocalSyntheticTargetPin | null;
  requiredCategories?: readonly G05Category[];
  now?: number;
}): { ok: true } | { ok: false; code: "grant_invalid" | "local_synthetic_not_authorized"; message: string } {
  const now = input.now ?? Date.now();
  const { target, grant, localPin } = input;

  if (target.status !== "active") {
    return { ok: false, code: "grant_invalid", message: "Target is not active." };
  }
  if (grant.status !== "active" || grant.revokedAt !== null) {
    return { ok: false, code: "grant_invalid", message: "Execution grant has been revoked or is inactive." };
  }
  if (!Number.isFinite(Date.parse(grant.expiresAt)) || Date.parse(grant.expiresAt) <= now) {
    return { ok: false, code: "grant_invalid", message: "Execution grant has expired." };
  }
  if (
    grant.targetId !== target.id ||
    grant.targetRevision !== target.revision ||
    grant.targetDigest !== target.targetDigest
  ) {
    return {
      ok: false,
      code: "grant_invalid",
      message: "Execution grant does not match the current target revision/digest; re-issue grant.",
    };
  }
  if (target.environment === "local_synthetic") {
    if (
      !localPin ||
      target.origin !== localPin.allowedOrigin ||
      target.serviceIdentity !== localPin.serviceIdentity
    ) {
      return {
        ok: false,
        code: "local_synthetic_not_authorized",
        message: "Local synthetic target is not explicitly pinned and authorized.",
      };
    }
  } else if (!target.origin.startsWith("https://")) {
    return {
      ok: false,
      code: "grant_invalid",
      message: "External staging targets must use HTTPS.",
    };
  }

  for (const cat of input.requiredCategories ?? []) {
    if (!target.config.approvedCategories.includes(cat)) {
      return {
        ok: false,
        code: "grant_invalid",
        message: `Target configuration does not approve category ${cat}.`,
      };
    }
    if (!grant.approvedCategories.includes(cat)) {
      return {
        ok: false,
        code: "grant_invalid",
        message: `Execution grant does not approve category ${cat}.`,
      };
    }
  }
  return { ok: true };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderG05ReportHtml(report: G05Report): string {
  const body = report.body as {
    scannerVersion?: string;
    target?: { name?: string; origin?: string; environment?: string; revision?: number };
    run?: G05Run;
    cases?: G05CaseResult[];
    findings?: G05Finding[];
  };
  const run = body.run;
  const cases = Array.isArray(body.cases) ? body.cases : [];
  const findings = Array.isArray(body.findings) ? body.findings : [];

  const caseRows = cases
    .map(
      (c) =>
        `<tr><td><code>${escapeHtml(c.caseId)}</code></td><td>${escapeHtml(c.category)}</td><td>${escapeHtml(c.actorRole)}</td><td><code>${escapeHtml(c.httpMethod)} ${escapeHtml(c.requestPath)}</code></td><td>${escapeHtml(c.status)}</td><td>${escapeHtml(c.cleanupStatus)}</td></tr>`,
    )
    .join("");
  const findingRows = findings
    .map(
      (f) =>
        `<tr><td><code>${escapeHtml(f.id.slice(0, 12))}</code></td><td>${escapeHtml(f.severity)}</td><td>${escapeHtml(f.status)}</td><td>${escapeHtml(f.title)}</td><td><code>${escapeHtml(f.endpoint)}</code></td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>WetScan Guard G05 Report — ${escapeHtml(report.id.slice(0, 12))}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; color: #171717; max-width: 1080px; margin: 24px auto; padding: 0 16px; line-height: 1.5; }
  h1, h2 { font-size: 1.15rem; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 0.9rem; }
  th, td { border: 1px solid #d4d4d8; padding: 6px 8px; text-align: left; }
  th { background: #f4f4f5; }
  .meta { background: #fafafa; border: 1px solid #e4e4e7; padding: 12px; border-radius: 6px; }
</style>
</head>
<body>
  <h1>WetScan Guard G05 Verification Report</h1>
  <div class="meta">
    <div><strong>Report ID:</strong> <code>${escapeHtml(report.id)}</code></div>
    <div><strong>Report Digest:</strong> <code>${escapeHtml(report.reportDigest)}</code></div>
    <div><strong>Project:</strong> <code>${escapeHtml(report.projectId)}</code> | <strong>Scanner:</strong> <code>${escapeHtml(body.scannerVersion ?? G05_SCANNER_VERSION)}</code></div>
    <div><strong>Target:</strong> ${escapeHtml(body.target?.name ?? report.targetId)} (<code>${escapeHtml(body.target?.origin ?? "")}</code>, rev ${String(report.targetRevision)})</div>
    <div><strong>Run Status:</strong> ${escapeHtml(run?.status ?? "unknown")} | <strong>Cleanup:</strong> ${escapeHtml(run?.cleanupStatus ?? "unknown")} | <strong>Decision:</strong> ${escapeHtml(run?.summary?.decision ?? "INCOMPLETE")}</div>
  </div>
  <h2>Case Results (${String(cases.length)})</h2>
  <table><thead><tr><th>Case</th><th>Category</th><th>Role</th><th>Request</th><th>Outcome</th><th>Cleanup</th></tr></thead><tbody>${caseRows}</tbody></table>
  <h2>Findings (${String(findings.length)})</h2>
  <table><thead><tr><th>ID</th><th>Severity</th><th>Status</th><th>Title</th><th>Endpoint</th></tr></thead><tbody>${findingRows}</tbody></table>
</body>
</html>`;
}

export class G05Service {
  constructor(
    readonly store: G05PostgresStore,
    private readonly opts: {
      vaultKey: Buffer | null;
      localPin: LocalSyntheticTargetPin | null;
    },
  ) {}

  async overview(scope: G05Scope) {
    const [targets, grants, accounts, trustPlans, workflows, testPlans, runs, findings, reports, audit] =
      await Promise.all([
        this.store.listTargets(scope),
        this.store.listGrants(scope),
        this.store.listTestAccounts(scope),
        this.store.listTrustPlans(scope),
        this.store.listWorkflowImports(scope),
        this.store.listTestPlans(scope),
        this.store.listRuns(scope, 25),
        this.store.listFindings(scope),
        this.store.listReports(scope),
        this.store.listAudit(scope, 30),
      ]);
    return {
      scannerVersion: G05_SCANNER_VERSION,
      vaultReady: this.opts.vaultKey !== null,
      localSyntheticPin: this.opts.localPin
        ? {
            allowedOrigin: this.opts.localPin.allowedOrigin,
            serviceIdentity: this.opts.localPin.serviceIdentity,
          }
        : null,
      targets,
      grants,
      accounts,
      trustPlans,
      workflows,
      testPlans,
      runs,
      findings,
      reports,
      audit,
    };
  }

  async saveTarget(scope: G05Scope, actor: string, rawInput: unknown): Promise<G05TargetRecord> {
    let parsed: ReturnType<typeof validateTargetInput>;
    try {
      parsed = validateTargetInput(rawInput);
    } catch (error) {
      throw new G05ServiceError(
        "invalid_input",
        400,
        error instanceof Error ? error.message : "Invalid target definition.",
      );
    }
    if (parsed.environment === "local_synthetic") {
      if (
        !this.opts.localPin ||
        parsed.origin !== this.opts.localPin.allowedOrigin ||
        parsed.serviceIdentity !== this.opts.localPin.serviceIdentity
      ) {
        throw new G05ServiceError(
          "local_synthetic_not_authorized",
          403,
          "Local target does not match the authorized synthetic target pin.",
        );
      }
    }
    try {
      return await this.store.saveTarget(scope, { ...parsed, actor });
    } catch (error) {
      if (error instanceof G05StoreError) {
        throw new G05ServiceError(
          error.code === "revision_conflict" ? "conflict" : "invalid_input",
          error.status,
          error.message,
        );
      }
      throw error;
    }
  }

  async issueGrant(
    scope: G05Scope,
    actor: string,
    raw: {
      targetId: string;
      proofId: string;
      authorizationRef: string;
      approvedCategories: G05Category[];
      expiresAt: string;
    },
  ): Promise<G05ExecutionGrant> {
    const target = await this.store.getTarget(scope, raw.targetId);
    if (!target) throw new G05ServiceError("not_found", 404, "Staging target not found.");
    const expMs = Date.parse(raw.expiresAt);
    const now = Date.now();
    if (!Number.isFinite(expMs) || expMs <= now || expMs - now > 31 * 86400_000) {
      throw new G05ServiceError(
        "invalid_input",
        400,
        "Grant expiresAt must be in the future and at most 30 days ahead.",
      );
    }
    if (!raw.proofId.trim() || raw.proofId.length > 128 || !raw.authorizationRef.trim() || raw.authorizationRef.length > 128) {
      throw new G05ServiceError("invalid_input", 400, "Valid proofId and authorizationRef are required.");
    }
    if (!Array.isArray(raw.approvedCategories) || raw.approvedCategories.length === 0) {
      throw new G05ServiceError("invalid_input", 400, "At least one approved category is required.");
    }
    if (target.status !== "active") {
      throw new G05ServiceError("grant_invalid", 409, "Target must be active before issuing a grant.");
    }
    if (target.environment === "local_synthetic") {
      if (
        !this.opts.localPin ||
        target.origin !== this.opts.localPin.allowedOrigin ||
        target.serviceIdentity !== this.opts.localPin.serviceIdentity
      ) {
        throw new G05ServiceError(
          "local_synthetic_not_authorized",
          403,
          "Local synthetic target pin does not authorize this target.",
        );
      }
    }
    try {
      return await this.store.issueGrant(scope, {
        targetId: raw.targetId,
        consentActor: actor,
        proofId: raw.proofId.trim(),
        authorizationRef: raw.authorizationRef.trim(),
        approvedCategories: raw.approvedCategories,
        expiresAt: new Date(expMs).toISOString(),
      });
    } catch (error) {
      if (error instanceof G05StoreError) {
        throw new G05ServiceError(
          error.code === "grant_invalid" ? "grant_invalid" : "invalid_input",
          error.status,
          error.message,
        );
      }
      throw error;
    }
  }

  async revokeGrant(scope: G05Scope, grantId: string, actor: string, reason: string) {
    if (!reason.trim() || reason.length > 400) {
      throw new G05ServiceError("invalid_input", 400, "Revocation reason is required.");
    }
    try {
      return await this.store.revokeGrant(scope, grantId, actor, reason.trim());
    } catch (error) {
      if (error instanceof G05StoreError) {
        throw new G05ServiceError("not_found", error.status, error.message);
      }
      throw error;
    }
  }

  async saveTestAccount(
    scope: G05Scope,
    actor: string,
    raw: {
      id?: string;
      targetId: string;
      role: G05TestAccountView["role"];
      customRoleName?: string | null;
      label: string;
      usernameRef: string;
      authStrategy: G05TestAccountView["authStrategy"];
      loginPath?: string | null;
      secret?: string | null;
      headerName?: string;
      expiresAt: string;
    },
  ): Promise<G05TestAccountView> {
    if (!["anonymous", "user_a", "user_b", "privileged", "custom"].includes(raw.role)) {
      throw new G05ServiceError("invalid_input", 400, "Unsupported test account role.");
    }
    if (!["none", "bearer_login", "cookie_login", "header_token"].includes(raw.authStrategy)) {
      throw new G05ServiceError("invalid_input", 400, "Unsupported authentication strategy.");
    }
    const expMs = Date.parse(raw.expiresAt);
    if (!Number.isFinite(expMs) || expMs <= Date.now()) {
      throw new G05ServiceError("invalid_input", 400, "Account expiration must be in the future.");
    }
    const label = raw.label?.trim() ?? "";
    const usernameRef = raw.usernameRef?.trim() ?? "";
    if (!label || label.length > 120 || !usernameRef || usernameRef.length > 160) {
      throw new G05ServiceError("invalid_input", 400, "Valid label and synthetic usernameRef are required.");
    }
    if (
      /production|prod\.|live-customer/i.test(usernameRef) ||
      /production|prod-account/i.test(label)
    ) {
      throw new G05ServiceError("invalid_input", 400, "Only synthetic non-production accounts are allowed.");
    }

    const target = await this.store.getTarget(scope, raw.targetId);
    if (!target) throw new G05ServiceError("not_found", 404, "Target not found.");

    const accountId =
      raw.id && /^[a-z0-9-]{4,64}$/.test(raw.id)
        ? raw.id
        : "acct-" + fingerprint({ scope, targetId: raw.targetId, role: raw.role, usernameRef }).slice(0, 20);

    let credentialCiphertext: string | null = null;
    let credentialFingerprint: string | null = null;
    if (raw.authStrategy !== "none") {
      if (!raw.secret || !raw.secret.trim()) {
        throw new G05ServiceError("invalid_input", 400, "Synthetic credential secret is required.");
      }
      if (!this.opts.vaultKey) {
        throw new G05ServiceError(
          "vault_not_configured",
          503,
          "G05 credential vault is not configured.",
        );
      }
      const sealed = sealCredential(
        {
          version: 1,
          secret: raw.secret,
          ...(raw.headerName ? { headerName: raw.headerName } : {}),
        },
        {
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          targetId: raw.targetId,
          accountId,
        },
        this.opts.vaultKey,
      );
      credentialCiphertext = sealed.ciphertext;
      credentialFingerprint = sealed.fingerprint;
    }

    const loginPath =
      raw.authStrategy === "bearer_login" || raw.authStrategy === "cookie_login"
        ? (raw.loginPath?.trim() || "/api/auth/login")
        : null;

    return this.store.saveTestAccount(scope, {
      id: accountId,
      targetId: raw.targetId,
      role: raw.role,
      customRoleName: raw.role === "custom" ? (raw.customRoleName?.trim() || "custom") : null,
      label,
      usernameRef,
      authStrategy: raw.authStrategy,
      loginPath,
      credentialCiphertext,
      credentialFingerprint,
      expiresAt: new Date(expMs).toISOString(),
      actor,
    });
  }

  async revokeTestAccount(scope: G05Scope, accountId: string, actor: string) {
    try {
      return await this.store.revokeTestAccount(scope, accountId, actor);
    } catch (error) {
      if (error instanceof G05StoreError) {
        throw new G05ServiceError("not_found", error.status, error.message);
      }
      throw error;
    }
  }

  async importTrustPlan(
    scope: G05Scope,
    actor: string,
    rawPayload: unknown,
    expectedGraphRevision?: string,
  ): Promise<G05CanvasTrustPlan> {
    let evaluated: Omit<G05CanvasTrustPlan, "workspaceId" | "projectId" | "createdAt">;
    try {
      evaluated = evaluateCanvasTrustPlan(rawPayload, scope, {
        expectedGraphRevision,
        actorId: actor,
      });
    } catch (error) {
      if (error instanceof G05ValidationError) {
        throw new G05ServiceError("invalid_input", 422, error.message);
      }
      throw error;
    }
    if (evaluated.integrationStatus === "NOT_AUTHORIZED") {
      await this.store.audit(scope, actor, "trust_plan_cross_project_denied", null, {
        errors: evaluated.validationErrors,
      });
      throw new G05ServiceError(
        "cross_project_plan_denied",
        403,
        evaluated.validationErrors[0] ?? "Cross-project Canvas Trust plan denied.",
        evaluated.validationErrors,
      );
    }
    if (evaluated.integrationStatus === "INVALID_PLAN") {
      throw new G05ServiceError(
        "invalid_input",
        422,
        evaluated.validationErrors[0] ?? "Invalid Canvas Trust plan.",
        evaluated.validationErrors,
      );
    }
    return this.store.saveTrustPlan(scope, evaluated);
  }

  async importWorkflow(
    scope: G05Scope,
    actor: string,
    rawPayload: unknown,
    options?: { targetId?: string; trustPlanId?: string | null },
  ): Promise<G05WorkflowImport> {
    const target = options?.targetId
      ? (await this.store.getTarget(scope, options.targetId)) ?? undefined
      : undefined;
    let imported: Omit<G05WorkflowImport, "workspaceId" | "projectId" | "createdAt">;
    try {
      imported = importCanvasWorkflow(rawPayload, scope, {
        target,
        trustPlanId: options?.trustPlanId ?? null,
        actorId: actor,
      });
    } catch (error) {
      if (error instanceof G05ValidationError) {
        throw new G05ServiceError("invalid_workflow", 422, error.message);
      }
      throw error;
    }
    const crossProject = imported.validationErrors.some((e) =>
      /Workspace mismatch|Project mismatch/i.test(e),
    );
    if (crossProject) {
      await this.store.audit(scope, actor, "workflow_cross_project_denied", null, {
        errors: imported.validationErrors,
      });
      throw new G05ServiceError(
        "cross_project_plan_denied",
        403,
        imported.validationErrors[0] ?? "Cross-project Canvas workflow denied.",
        imported.validationErrors,
      );
    }
    if (imported.validationStatus === "rejected") {
      throw new G05ServiceError(
        "invalid_workflow",
        422,
        imported.validationErrors[0] ?? "Workflow definition failed validation.",
        imported.validationErrors,
      );
    }
    return this.store.saveWorkflowImport(scope, imported);
  }

  async createTestPlanPreview(
    scope: G05Scope,
    actor: string,
    input: {
      targetId: string;
      profile: G05Profile;
      trustPlanId?: string | null;
      workflowImportId?: string | null;
    },
  ): Promise<G05TestPlan> {
    if (!["dast_baseline", "auth_matrix", "integrity_suite", "full_g05"].includes(input.profile)) {
      throw new G05ServiceError("invalid_input", 400, "Unsupported test plan profile.");
    }
    const target = await this.store.getTarget(scope, input.targetId);
    if (!target) throw new G05ServiceError("not_found", 404, "Target not found.");

    const trustPlan = input.trustPlanId
      ? await this.store.getTrustPlan(scope, input.trustPlanId)
      : null;
    if (input.trustPlanId && !trustPlan) {
      throw new G05ServiceError("not_found", 404, "Canvas Trust plan not found in project.");
    }
    if (trustPlan) {
      if (trustPlan.integrationStatus === "STALE" || (trustPlan.expiresAt && Date.parse(trustPlan.expiresAt) <= Date.now())) {
        throw new G05ServiceError("stale_plan", 409, "Canvas Trust plan is stale or expired.");
      }
      if (trustPlan.integrationStatus !== "CONNECTED" || !trustPlan.confirmed) {
        throw new G05ServiceError(
          "unconfirmed_plan",
          422,
          "Canvas Trust plan is unconfirmed or not authorized for execution.",
          trustPlan.validationErrors,
        );
      }
    }

    const workflowImport = input.workflowImportId
      ? await this.store.getWorkflowImport(scope, input.workflowImportId)
      : null;
    if (input.workflowImportId && !workflowImport) {
      throw new G05ServiceError("not_found", 404, "Canvas workflow import not found in project.");
    }
    if (workflowImport && workflowImport.validationStatus !== "valid") {
      throw new G05ServiceError(
        "invalid_workflow",
        422,
        "Workflow import is not ready for execution.",
        workflowImport.validationErrors,
      );
    }

    const accounts = await this.store.listTestAccounts(scope, target.id);
    const plan = buildG05TestPlan({
      scope,
      target,
      profile: input.profile,
      accounts,
      trustPlan,
      workflowImport,
      actorId: actor,
    });
    return this.store.saveTestPlan(scope, plan);
  }

  async enqueueRun(
    scope: G05Scope,
    actor: string,
    input: {
      idempotencyKey: string;
      testPlanId: string;
      grantId: string;
    },
  ): Promise<{ run: G05Run; duplicate: boolean }> {
    if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 128) {
      throw new G05ServiceError("invalid_input", 400, "Valid idempotencyKey (8-128 chars) required.");
    }
    const [testPlan, grant] = await Promise.all([
      this.store.getTestPlan(scope, input.testPlanId),
      this.store.getGrant(scope, input.grantId),
    ]);
    if (!testPlan) throw new G05ServiceError("not_found", 404, "Test plan not found.");
    if (!grant) throw new G05ServiceError("not_found", 404, "Execution grant not found.");

    const target = await this.store.getTarget(scope, testPlan.targetId);
    if (!target) throw new G05ServiceError("not_found", 404, "Target not found.");
    if (target.revision !== testPlan.targetRevision) {
      throw new G05ServiceError(
        "conflict",
        409,
        "Test plan was generated for a previous target revision; generate a fresh test plan.",
      );
    }

    const auth = verifyTargetAuthorization({
      target,
      grant,
      localPin: this.opts.localPin,
      requiredCategories: testPlan.categories,
    });
    if (!auth.ok) {
      throw new G05ServiceError(auth.code, auth.code === "local_synthetic_not_authorized" ? 403 : 409, auth.message);
    }

    if (testPlan.trustPlanId) {
      const trust = await this.store.getTrustPlan(scope, testPlan.trustPlanId);
      if (!trust || !trust.confirmed || trust.integrationStatus !== "CONNECTED") {
        throw new G05ServiceError("unconfirmed_plan", 422, "Referenced Canvas Trust plan is not confirmed.");
      }
      if (trust.expiresAt && Date.parse(trust.expiresAt) <= Date.now()) {
        throw new G05ServiceError("stale_plan", 409, "Referenced Canvas Trust plan has expired.");
      }
    }
    if (testPlan.workflowImportId) {
      const wf = await this.store.getWorkflowImport(scope, testPlan.workflowImportId);
      if (!wf || wf.validationStatus !== "valid") {
        throw new G05ServiceError("invalid_workflow", 422, "Referenced Canvas workflow is invalid.");
      }
    }

    const hasStateChanging = testPlan.cases.some((c) => c.stateChanging);
    const scopeDigest = fingerprint({
      targetId: target.id,
      targetRevision: target.revision,
      targetDigest: target.targetDigest,
      grantId: grant.id,
      planDigest: testPlan.planDigest,
    });
    try {
      return await this.store.enqueueRun(scope, {
        idempotencyKey: input.idempotencyKey,
        testPlanId: testPlan.id,
        targetId: target.id,
        targetRevision: target.revision,
        grantId: grant.id,
        trustPlanId: testPlan.trustPlanId,
        workflowImportId: testPlan.workflowImportId,
        retestOfRunId: null,
        retestCaseIds: null,
        scopeDigest,
        maxRequests: target.config.maxRequests,
        maxAttempts: hasStateChanging ? 1 : 2,
        actor,
        totalCases: testPlan.cases.length,
        targetEnvironment: target.environment,
        tlsApplicable: target.environment === "staging",
        localSyntheticPinned: target.environment === "local_synthetic",
      });
    } catch (error) {
      if (error instanceof G05StoreError) {
        throw new G05ServiceError(
          error.code === "revision_conflict" ? "conflict" : "invalid_input",
          error.status,
          error.message,
        );
      }
      throw error;
    }
  }

  async enqueueRetest(
    scope: G05Scope,
    actor: string,
    input: {
      idempotencyKey: string;
      sourceRunId: string;
      grantId: string;
      findingId?: string;
      caseIds?: string[];
    },
  ): Promise<{ run: G05Run; duplicate: boolean }> {
    if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 128) {
      throw new G05ServiceError("invalid_input", 400, "Valid idempotencyKey required.");
    }
    const sourceRun = await this.store.getRun(scope, input.sourceRunId);
    if (!sourceRun) throw new G05ServiceError("not_found", 404, "Source run not found.");
    const sourcePlan = await this.store.getTestPlan(scope, sourceRun.testPlanId);
    if (!sourcePlan) throw new G05ServiceError("not_found", 404, "Source test plan not found.");

    const grant = await this.store.getGrant(scope, input.grantId);
    if (!grant) throw new G05ServiceError("not_found", 404, "Execution grant not found.");
    const target = await this.store.getTarget(scope, sourceRun.targetId);
    if (!target) throw new G05ServiceError("not_found", 404, "Target not found.");

    const selectedIds = new Set<string>();
    if (input.findingId) {
      const findings = await this.store.listFindings(scope, sourceRun.id);
      const match = findings.find((f) => f.id === input.findingId);
      if (!match) {
        const allFindings = await this.store.listFindings(scope);
        const fallback = allFindings.find((f) => f.id === input.findingId);
        if (!fallback) throw new G05ServiceError("not_found", 404, "Finding not found for retest.");
        selectedIds.add(fallback.caseId);
      } else {
        selectedIds.add(match.caseId);
      }
    }
    if (Array.isArray(input.caseIds)) {
      for (const cid of input.caseIds) {
        if (typeof cid === "string" && cid.trim()) selectedIds.add(cid.trim());
      }
    }
    if (selectedIds.size === 0) {
      const results = await this.store.listCaseResults(scope, sourceRun.id);
      for (const res of results) {
        if (res.status === "VERIFIED_FAIL" || res.status === "CLEANUP_FAILED") {
          selectedIds.add(res.caseId);
        }
      }
    }
    if (selectedIds.size === 0) {
      throw new G05ServiceError("invalid_input", 400, "No failing cases or caseIds selected for retest.");
    }

    const planCases = sourcePlan.cases.filter((c) => selectedIds.has(c.caseId));
    if (planCases.length === 0) {
      throw new G05ServiceError("invalid_input", 400, "Requested caseIds do not belong to the source test plan.");
    }

    const activeCategories = [...new Set(planCases.map((c) => c.category))];
    const auth = verifyTargetAuthorization({
      target,
      grant,
      localPin: this.opts.localPin,
      requiredCategories: activeCategories,
    });
    if (!auth.ok) {
      throw new G05ServiceError(auth.code, auth.code === "local_synthetic_not_authorized" ? 403 : 409, auth.message);
    }

    let planForRun = sourcePlan;
    if (target.revision !== sourcePlan.targetRevision) {
      const [accounts, trustPlan, workflowImport] = await Promise.all([
        this.store.listTestAccounts(scope, target.id),
        sourcePlan.trustPlanId ? this.store.getTrustPlan(scope, sourcePlan.trustPlanId) : Promise.resolve(null),
        sourcePlan.workflowImportId ? this.store.getWorkflowImport(scope, sourcePlan.workflowImportId) : Promise.resolve(null),
      ]);
      const rebuilt = buildG05TestPlan({
        scope,
        target,
        profile: sourcePlan.profile,
        accounts,
        trustPlan,
        workflowImport,
        actorId: actor,
      });
      planForRun = await this.store.saveTestPlan(scope, rebuilt);
    }

    const hasStateChanging = planCases.some((c) => c.stateChanging);
    const scopeDigest = fingerprint({
      targetId: target.id,
      targetRevision: target.revision,
      targetDigest: target.targetDigest,
      grantId: grant.id,
      planDigest: planForRun.planDigest,
      retestCaseIds: [...selectedIds].sort(),
    });

    return this.store.enqueueRun(scope, {
      idempotencyKey: input.idempotencyKey,
      testPlanId: planForRun.id,
      targetId: target.id,
      targetRevision: target.revision,
      grantId: grant.id,
      trustPlanId: planForRun.trustPlanId,
      workflowImportId: planForRun.workflowImportId,
      retestOfRunId: sourceRun.id,
      retestCaseIds: [...selectedIds].sort(),
      scopeDigest,
      maxRequests: target.config.maxRequests,
      maxAttempts: hasStateChanging ? 1 : 2,
      actor,
      totalCases: planCases.length,
      targetEnvironment: target.environment,
      tlsApplicable: target.environment === "staging",
      localSyntheticPinned: target.environment === "local_synthetic",
    });
  }

  async cancelRun(scope: G05Scope, runId: string, actor: string): Promise<G05Run> {
    try {
      return await this.store.cancelRun(scope, runId, actor);
    } catch (error) {
      if (error instanceof G05StoreError) {
        throw new G05ServiceError("not_found", error.status, error.message);
      }
      throw error;
    }
  }

  async triageFinding(
    scope: G05Scope,
    findingId: string,
    actor: string,
    input: { expectedRevision: number; status: G05FindingStatus; reason: string },
  ): Promise<G05Finding> {
    const allowedStatuses: G05FindingStatus[] = [
      "under_review",
      "verified",
      "fix_pending_retest",
      "verified_fixed",
      "false_positive",
      "risk_accepted",
    ];
    if (!allowedStatuses.includes(input.status)) {
      throw new G05ServiceError("invalid_input", 400, "Unsupported finding triage status.");
    }
    try {
      return await this.store.triageFinding(scope, findingId, {
        expectedRevision: input.expectedRevision,
        status: input.status,
        reason: input.reason,
        actor,
      });
    } catch (error) {
      if (error instanceof G05StoreError) {
        throw new G05ServiceError(
          error.code === "revision_conflict" ? "conflict" : error.code === "not_found" ? "not_found" : "invalid_input",
          error.status,
          error.message,
        );
      }
      throw error;
    }
  }

  async generateReport(scope: G05Scope, actor: string, runId: string): Promise<G05Report> {
    const run = await this.store.getRun(scope, runId);
    if (!run) throw new G05ServiceError("not_found", 404, "Run not found.");
    const [target, cases, findings] = await Promise.all([
      this.store.getTarget(scope, run.targetId),
      this.store.listCaseResults(scope, run.id),
      this.store.listFindings(scope, run.id),
    ]);
    const limitations: string[] = [];
    if (run.coverage.targetEnvironment === "local_synthetic") {
      limitations.push(
        "Executed against dedicated local synthetic staging container; external TLS handshake is not_applicable on HTTP loopback.",
      );
    }
    if (run.summary.notExecuted > 0 || run.summary.inconclusive > 0) {
      limitations.push(
        `${run.summary.notExecuted} case(s) not executed and ${run.summary.inconclusive} inconclusive; incomplete checks are not classified as PASS.`,
      );
    }
    const rawBody: G05Report["body"] = {
      schemaVersion: 1,
      module: "guard-g05",
      scope: { workspaceId: scope.workspaceId, projectId: scope.projectId },
      target: target
        ? {
            id: target.id,
            revision: target.revision,
            environment: target.environment,
            origin: target.origin,
            targetDigest: target.targetDigest,
          }
        : {
            id: run.targetId,
            revision: run.targetRevision,
            environment: run.coverage.targetEnvironment,
            origin: "unavailable",
            targetDigest: run.scopeDigest,
          },
      run,
      cases,
      findings,
      limitations,
    };
    const body = redactG05JsonValue(rawBody);

    const reportDigest = fingerprint({
      runId: run.id,
      runRevision: run.revision,
      targetRevision: run.targetRevision,
      evidenceDigest: run.evidenceDigest,
      cases: cases.map((c) => ({ caseId: c.caseId, status: c.status, evidenceDigest: c.evidenceDigest })),
      findings: findings.map((f) => ({ id: f.id, status: f.status, revision: f.revision })),
    });
    const reportId = fingerprint({
      scope,
      runId: run.id,
      runRevision: run.revision,
      reportDigest,
    });

    return this.store.saveReport(scope, {
      id: reportId,
      runId: run.id,
      runRevision: run.revision,
      targetId: run.targetId,
      targetRevision: run.targetRevision,
      reportDigest,
      body,
      createdBy: actor,
    });
  }
}
