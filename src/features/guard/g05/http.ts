import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "../../../lib/auth/config";
import { requireOrigin } from "../../../lib/auth/http";
import { requestToken } from "../../../lib/auth/session";
import {
  G05_SCANNER_VERSION,
  type G05Category,
  type G05FindingStatus,
  type G05Profile,
  type G05Scope,
  type G05TestAccountView,
} from "./contracts";
import { authorizeGuardProject } from "../live/project";
import { G05DisabledError, g05Host, isG05Enabled } from "./runtime";
import { G05ServiceError, renderG05ReportHtml } from "./service";

const securityHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

const MAX_G05_JSON_BYTES = 131_072;

const jsonReply = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: securityHeaders });

export async function boundedG05Json(request: Request): Promise<Record<string, unknown>> {
  const ct = request.headers.get("content-type")?.split(";")[0]?.trim();
  const ce = request.headers.get("content-encoding");
  if (ct !== "application/json" || ![null, "identity"].includes(ce)) {
    throw new G05ServiceError("invalid_input", 415, "Expected application/json identity body.");
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_G05_JSON_BYTES)) {
    throw new G05ServiceError("invalid_input", 413, "Request payload too large.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new G05ServiceError("invalid_input", 400, "JSON request body is required.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, 5000);
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_G05_JSON_BYTES) {
        await reader.cancel();
        throw new G05ServiceError("invalid_input", 413, "Request payload exceeded maximum allowed size.");
      }
      chunks.push(part.value);
    }
    if (timedOut) throw new G05ServiceError("invalid_input", 408, "Request body read timed out.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    } catch {
      throw new G05ServiceError("invalid_input", 400, "Malformed JSON payload.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new G05ServiceError("invalid_input", 400, "JSON body must be an object.");
    }
    return parsed as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

export type G05Resource =
  | "overview"
  | "targets"
  | "grants"
  | "accounts"
  | "trust-plans"
  | "workflows"
  | "test-plans"
  | "runs"
  | "retest"
  | "findings"
  | "reports";

export const G05_RESOURCES: readonly G05Resource[] = [
  "overview",
  "targets",
  "grants",
  "accounts",
  "trust-plans",
  "workflows",
  "test-plans",
  "runs",
  "retest",
  "findings",
  "reports",
];

export async function g05Route(
  request: NextRequest,
  projectId: string,
  resource: string,
) {
  try {
    if (!/^github-[1-9]\d{0,15}$/.test(projectId) || !G05_RESOURCES.includes(resource as G05Resource)) {
      return jsonReply({ error: "not_found" }, 404);
    }
    if (request.method !== "GET" && request.method !== "POST") {
      return jsonReply({ error: "method_not_allowed" }, 405);
    }
    if (request.method !== "GET") {
      requireOrigin(request);
    }

    const token = requestToken(request);
    const authority = await authorizeGuardProject(token, projectId);
    const scope: G05Scope = {
      workspaceId: authority.grant.workspaceId,
      projectId: authority.grant.projectId,
    };
    const actor = authority.grant.actorId;
    const resName = resource as G05Resource;

    if (!isG05Enabled()) {
      if (request.method === "GET" && resName === "overview") {
        return jsonReply({
          enabled: false,
          status: "not_configured",
          scannerVersion: G05_SCANNER_VERSION,
          vaultReady: false,
          localSyntheticPin: null,
          targets: [],
          grants: [],
          accounts: [],
          trustPlans: [],
          workflows: [],
          testPlans: [],
          runs: [],
          findings: [],
          reports: [],
          audit: [],
        });
      }
      throw new G05DisabledError();
    }

    const host = await g05Host();
    const { service, store } = host;

    if (request.method === "GET") {
      if (resName === "overview") {
        return jsonReply({ enabled: true, status: "ready", ...(await service.overview(scope)) });
      }
      if (resName === "targets") return jsonReply({ targets: await store.listTargets(scope) });
      if (resName === "grants") return jsonReply({ grants: await store.listGrants(scope) });
      if (resName === "accounts") return jsonReply({ accounts: await store.listTestAccounts(scope) });
      if (resName === "trust-plans") return jsonReply({ trustPlans: await store.listTrustPlans(scope) });
      if (resName === "workflows") return jsonReply({ workflows: await store.listWorkflowImports(scope) });
      if (resName === "test-plans") return jsonReply({ testPlans: await store.listTestPlans(scope) });
      if (resName === "runs") {
        const runId = request.nextUrl.searchParams.get("runId");
        if (runId) {
          const run = await store.getRun(scope, runId);
          if (!run) return jsonReply({ error: "not_found" }, 404);
          const [cases, findings] = await Promise.all([
            store.listCaseResults(scope, run.id),
            store.listFindings(scope, run.id),
          ]);
          return jsonReply({ run, cases, findings });
        }
        return jsonReply({ runs: await store.listRuns(scope, 25) });
      }
      if (resName === "findings") {
        const runId = request.nextUrl.searchParams.get("runId") ?? undefined;
        return jsonReply({ findings: await store.listFindings(scope, runId) });
      }
      if (resName === "reports") {
        const reportId = request.nextUrl.searchParams.get("reportId");
        const format = request.nextUrl.searchParams.get("format");
        const reports = await store.listReports(scope);
        if (reportId) {
          const match = reports.find((r) => r.id === reportId);
          if (!match) return jsonReply({ error: "not_found" }, 404);
          if (format === "html") {
            const download = request.nextUrl.searchParams.get("download") === "1";
            return new NextResponse(renderG05ReportHtml(match), {
              status: 200,
              headers: {
                ...securityHeaders,
                "content-type": "text/html; charset=utf-8",
                "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
                ...(download
                  ? { "content-disposition": `attachment; filename="wetscan-g05-report-${match.id.slice(0, 12)}.html"` }
                  : {}),
              },
            });
          }
          return jsonReply({ report: match });
        }
        return jsonReply({ reports });
      }
      return jsonReply({ error: "not_found" }, 404);
    }

    // Mutating POST handlers (CSRF checked above, active HTTP scanning strictly delegated to worker)
    const body = await boundedG05Json(request);

    if (resName === "targets") {
      const target = await service.saveTarget(scope, actor, body);
      return jsonReply({ target }, 201);
    }
    if (resName === "grants") {
      if (body.action === "revoke") {
        const grant = await service.revokeGrant(
          scope,
          String(body.grantId ?? ""),
          actor,
          String(body.reason ?? "Operator revoked grant"),
        );
        return jsonReply({ grant });
      }
      const grant = await service.issueGrant(scope, actor, {
        targetId: String(body.targetId ?? ""),
        proofId: String(body.proofId ?? ""),
        authorizationRef: String(body.authorizationRef ?? ""),
        approvedCategories: Array.isArray(body.approvedCategories)
          ? (body.approvedCategories as G05Category[])
          : [],
        expiresAt: String(body.expiresAt ?? ""),
      });
      return jsonReply({ grant }, 201);
    }
    if (resName === "accounts") {
      if (body.action === "revoke") {
        const account = await service.revokeTestAccount(scope, String(body.accountId ?? ""), actor);
        return jsonReply({ account });
      }
      const account = await service.saveTestAccount(scope, actor, {
        id: typeof body.id === "string" ? body.id : undefined,
        targetId: String(body.targetId ?? ""),
        role: String(body.role ?? "") as G05TestAccountView["role"],
        customRoleName: typeof body.customRoleName === "string" ? body.customRoleName : null,
        label: String(body.label ?? ""),
        usernameRef: String(body.usernameRef ?? ""),
        authStrategy: String(body.authStrategy ?? "") as G05TestAccountView["authStrategy"],
        loginPath: typeof body.loginPath === "string" ? body.loginPath : null,
        secret: typeof body.secret === "string" ? body.secret : null,
        headerName: typeof body.headerName === "string" ? body.headerName : undefined,
        expiresAt: String(body.expiresAt ?? ""),
      });
      return jsonReply({ account }, 201);
    }
    if (resName === "trust-plans") {
      const expectedGraphRevision =
        typeof body.expectedGraphRevision === "string" ? body.expectedGraphRevision : undefined;
      const rawPlan = body.plan && typeof body.plan === "object" ? body.plan : body;
      const trustPlan = await service.importTrustPlan(scope, actor, rawPlan, expectedGraphRevision);
      return jsonReply({ trustPlan }, 201);
    }
    if (resName === "workflows") {
      const rawWorkflow = body.workflow && typeof body.workflow === "object" ? body.workflow : body;
      const targetId = typeof body.targetId === "string" ? body.targetId : undefined;
      const trustPlanId = typeof body.trustPlanId === "string" ? body.trustPlanId : null;
      const workflow = await service.importWorkflow(scope, actor, rawWorkflow, { targetId, trustPlanId });
      return jsonReply({ workflow }, 201);
    }
    if (resName === "test-plans") {
      const testPlan = await service.createTestPlanPreview(scope, actor, {
        targetId: String(body.targetId ?? ""),
        profile: String(body.profile ?? "full_g05") as G05Profile,
        trustPlanId: typeof body.trustPlanId === "string" ? body.trustPlanId : null,
        workflowImportId: typeof body.workflowImportId === "string" ? body.workflowImportId : null,
      });
      return jsonReply({ testPlan }, 201);
    }
    if (resName === "runs") {
      if (body.action === "cancel") {
        const run = await service.cancelRun(scope, String(body.runId ?? ""), actor);
        return jsonReply({ run });
      }
      const res = await service.enqueueRun(scope, actor, {
        idempotencyKey: String(body.idempotencyKey ?? ""),
        testPlanId: String(body.testPlanId ?? ""),
        grantId: String(body.grantId ?? ""),
      });
      return jsonReply(res, res.duplicate ? 200 : 202);
    }
    if (resName === "retest") {
      const res = await service.enqueueRetest(scope, actor, {
        idempotencyKey: String(body.idempotencyKey ?? ""),
        sourceRunId: String(body.sourceRunId ?? ""),
        grantId: String(body.grantId ?? ""),
        findingId: typeof body.findingId === "string" ? body.findingId : undefined,
        caseIds: Array.isArray(body.caseIds) ? (body.caseIds as string[]) : undefined,
      });
      return jsonReply(res, res.duplicate ? 200 : 202);
    }
    if (resName === "findings") {
      const finding = await service.triageFinding(scope, String(body.findingId ?? ""), actor, {
        expectedRevision: Number(body.expectedRevision ?? 0),
        status: String(body.status ?? "") as G05FindingStatus,
        reason: String(body.reason ?? ""),
      });
      return jsonReply({ finding });
    }
    if (resName === "reports") {
      const report = await service.generateReport(scope, actor, String(body.runId ?? ""));
      return jsonReply({ report }, 201);
    }
    return jsonReply({ error: "not_found" }, 404);
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonReply({ error: error.code }, error.status);
    }
    if (error instanceof G05DisabledError) {
      return jsonReply({ error: error.code, enabled: false }, error.status);
    }
    if (error instanceof G05ServiceError) {
      return jsonReply(
        { error: error.code, message: error.message, details: error.details },
        error.status,
      );
    }
    return jsonReply({ error: "g05_unavailable" }, 503);
  }
}
