import { fingerprint } from "../../../platform/identity";
import type {
  G05AccountRole,
  G05CaseOutcome,
  G05CaseResult,
  G05Finding,
  G05PlannedCase,
  G05Scope,
  G05Severity,
  G05TargetRecord,
  G05TestAccountView,
} from "./contracts";
import { EgressBlockedError, EnforcedHttpClient } from "./egress";
import { redactG05Text, redactHeaders } from "./vault";

export interface RuntimeSyntheticAccount {
  view: G05TestAccountView;
  secret: string | null;
}

export interface ActiveSyntheticSession {
  accountId: string;
  role: G05AccountRole;
  token: string;
  cookieHeader: string | null;
  sessionId: string | null;
  expiresAtMs: number;
  revoked: boolean;
}

export class G05SessionManager {
  private readonly sessions = new Map<G05AccountRole, ActiveSyntheticSession>();
  readonly issuedSecrets: string[] = [];

  constructor(
    private readonly client: EnforcedHttpClient,
    private readonly accounts: RuntimeSyntheticAccount[],
    private readonly onAccountVerified?: (accountId: string, status: G05TestAccountView["status"]) => Promise<void>,
  ) {
    for (const a of accounts) {
      if (a.secret) this.issuedSecrets.push(a.secret);
    }
  }

  hasAccount(role: G05AccountRole): boolean {
    return this.accounts.some(
      (a) =>
        a.view.role === role &&
        ["configured", "active"].includes(a.view.status) &&
        Date.parse(a.view.expiresAt) > Date.now(),
    );
  }

  async acquire(role: G05AccountRole, ttlSec?: number): Promise<ActiveSyntheticSession | null> {
    if (role === "anonymous") return null;
    if (!ttlSec) {
      const cached = this.sessions.get(role);
      if (cached && !cached.revoked && cached.expiresAtMs > Date.now() + 2000) {
        return cached;
      }
    }
    const acct = this.accounts.find(
      (a) =>
        a.view.role === role &&
        ["configured", "active"].includes(a.view.status) &&
        Date.parse(a.view.expiresAt) > Date.now(),
    );
    if (!acct || !acct.secret) return null;

    if (acct.view.authStrategy === "header_token") {
      const session: ActiveSyntheticSession = {
        accountId: acct.view.id,
        role,
        token: acct.secret,
        cookieHeader: null,
        sessionId: null,
        expiresAtMs: Date.parse(acct.view.expiresAt),
        revoked: false,
      };
      this.sessions.set(role, session);
      await this.onAccountVerified?.(acct.view.id, "active");
      return session;
    }

    const loginPath = acct.view.loginPath || "/api/auth/login";
    const resp = await this.client.request({
      method: "POST",
      path: loginPath,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: acct.view.usernameRef,
        password: acct.secret,
        ...(ttlSec !== undefined ? { ttlSec } : {}),
      }),
    });
    if (resp.status !== 200 || !resp.bodyJson || typeof resp.bodyJson !== "object") {
      return null;
    }
    const data = resp.bodyJson as Record<string, unknown>;
    const token = typeof data.accessToken === "string" ? data.accessToken : "";
    if (!token) return null;
    this.issuedSecrets.push(token);
    const cookieRaw = resp.headers["set-cookie"];
    const cookieFirst = Array.isArray(cookieRaw) ? cookieRaw[0] : cookieRaw;
    const cookieHeader = cookieFirst ? cookieFirst.split(";")[0] : null;
    if (cookieHeader) this.issuedSecrets.push(cookieHeader);

    const expMs =
      typeof data.expiresAt === "string" && Number.isFinite(Date.parse(data.expiresAt))
        ? Date.parse(data.expiresAt)
        : Date.now() + 300_000;

    const session: ActiveSyntheticSession = {
      accountId: acct.view.id,
      role,
      token,
      cookieHeader,
      sessionId: typeof data.sessionId === "string" ? data.sessionId : null,
      expiresAtMs: expMs,
      revoked: false,
    };
    if (!ttlSec) this.sessions.set(role, session);
    await this.onAccountVerified?.(acct.view.id, "active");
    return session;
  }

  authHeaders(session: ActiveSyntheticSession | null): Record<string, string> {
    if (!session) return {};
    return {
      authorization: `Bearer ${session.token}`,
      ...(session.cookieHeader ? { cookie: session.cookieHeader } : {}),
    };
  }

  async cleanupAll(): Promise<{ revoked: number; failed: number }> {
    let revoked = 0;
    let failed = 0;
    for (const [role, session] of this.sessions.entries()) {
      if (session.revoked) continue;
      const acct = this.accounts.find((a) => a.view.id === session.accountId);
      if (acct?.view.authStrategy === "header_token") {
        session.revoked = true;
        revoked++;
        continue;
      }
      try {
        const resp = await this.client.request({
          method: "POST",
          path: "/api/auth/logout",
          headers: this.authHeaders(session),
        });
        if (resp.status === 200 || resp.status === 401) {
          session.revoked = true;
          revoked++;
          await this.onAccountVerified?.(session.accountId, "configured");
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
      this.sessions.delete(role);
    }
    return { revoked, failed };
  }
}

export function buildG05FindingId(input: {
  scope: G05Scope;
  targetId: string;
  caseId: string;
  endpoint: string;
}): string {
  return fingerprint({
    module: "guard-g05",
    workspaceId: input.scope.workspaceId,
    projectId: input.scope.projectId,
    targetId: input.targetId,
    caseId: input.caseId,
    endpoint: input.endpoint,
  });
}

export async function executeDastAndAuthCases(input: {
  scope: G05Scope;
  target: G05TargetRecord;
  runId: string;
  client: EnforcedHttpClient;
  sessions: G05SessionManager;
  cases: G05PlannedCase[];
  retestSourceFindingId?: Map<string, string>;
  onCase: (result: G05CaseResult) => Promise<void>;
  onFinding: (finding: Omit<G05Finding, "revision" | "createdAt" | "updatedAt">) => Promise<void>;
}): Promise<{ executedCases: G05CaseResult[]; abortedReason?: string }> {
  const results: G05CaseResult[] = [];
  const { scope, target, runId, client, sessions } = input;

  for (const planned of input.cases) {
    if (planned.invariantFamily !== null) continue;
    const startedAt = new Date().toISOString();
    const startRequests = client.executedRequests;

    const record = async (params: {
      status: G05CaseOutcome;
      severity: G05Severity;
      httpStatus: number | null;
      observedSummary: string;
      redactedHeaders?: Record<string, string>;
      redactedBodyExcerpt?: string;
      errorCode?: string;
      cleanupStatus?: "not_needed" | "verified" | "failed";
      cleanupReceipt?: Record<string, unknown> | null;
      createFinding?: boolean;
      findingTitle?: string;
    }) => {
      const finishedAt = new Date().toISOString();
      const observedBehavior = {
        httpStatus: params.httpStatus,
        summary: redactG05Text(params.observedSummary, sessions.issuedSecrets),
        ...(params.redactedHeaders ? { redactedHeaders: params.redactedHeaders } : {}),
        ...(params.redactedBodyExcerpt
          ? {
              redactedBodyExcerpt: redactG05Text(
                params.redactedBodyExcerpt,
                sessions.issuedSecrets,
              ).slice(0, 600),
            }
          : {}),
        ...(params.errorCode ? { errorCode: params.errorCode } : {}),
      };
      const expectedBehavior = {
        statusCodes: planned.expectedStatus,
        summary: planned.expectedBehavior,
      };
      const evidenceDigest = fingerprint({
        runId,
        caseId: planned.caseId,
        expectedBehavior,
        observedBehavior,
        finishedAt,
      });
      const res: G05CaseResult = {
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        runId,
        caseId: planned.caseId,
        category: planned.category,
        invariantFamily: null,
        actorRole: planned.actorRole,
        httpMethod: planned.method,
        requestPath: planned.path,
        status: params.status,
        severity: params.severity,
        expectedBehavior,
        observedBehavior,
        preState: null,
        postState: null,
        cleanupStatus: params.cleanupStatus ?? "not_needed",
        cleanupReceipt: params.cleanupReceipt ?? null,
        evidenceDigest,
        executedRequests: Math.max(0, client.executedRequests - startRequests),
        startedAt,
        finishedAt,
      };
      results.push(res);
      await input.onCase(res);

      if (params.createFinding && params.status === "VERIFIED_FAIL") {
        const findingId = buildG05FindingId({
          scope,
          targetId: target.id,
          caseId: planned.caseId,
          endpoint: `${planned.method} ${planned.path}`,
        });
        await input.onFinding({
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          id: findingId,
          runId,
          caseId: planned.caseId,
          engine: planned.category === "auth_matrix" ? "api" : "dast",
          title: params.findingTitle || planned.title,
          severity: params.severity,
          confidence: "high",
          status: "verified",
          endpoint: `${planned.method} ${planned.path}`,
          invariantFamily: null,
          summary: observedBehavior.summary,
          evidence: [
            {
              runId,
              caseId: planned.caseId,
              recordedAt: finishedAt,
              expected: planned.expectedBehavior,
              observed: observedBehavior.summary,
              evidenceDigest,
              syntheticTarget: target.environment === "local_synthetic",
            },
          ],
          retestOfFindingId: input.retestSourceFindingId?.get(planned.caseId) ?? null,
          triageReason: null,
          triagedBy: null,
          triagedAt: null,
        });
      }
    };

    try {
      if (planned.category === "dast_tls") {
        if (target.environment === "local_synthetic") {
          await record({
            status: "NOT_EXECUTED",
            severity: "info",
            httpStatus: null,
            observedSummary:
              "NOT_APPLICABLE: TLS verification skipped for http local_synthetic target without claiming TLS pass.",
          });
          continue;
        }
        const resp = await client.request({ method: "HEAD", path: planned.path });
        const tlsOk =
          Boolean(resp.tlsProtocol) &&
          ["TLSv1.2", "TLSv1.3"].includes(resp.tlsProtocol ?? "") &&
          resp.tlsAuthorized === true;
        await record({
          status: tlsOk ? "VERIFIED_PASS" : "VERIFIED_FAIL",
          severity: tlsOk ? "info" : "high",
          httpStatus: resp.status,
          observedSummary: tlsOk
            ? `Verified ${resp.tlsProtocol} authorized handshake.`
            : `TLS check failed (protocol=${resp.tlsProtocol ?? "none"}, authorized=${String(resp.tlsAuthorized)}).`,
          createFinding: !tlsOk,
          findingTitle: "Weak or unauthorized staging TLS configuration",
        });
        continue;
      }

      if (planned.category === "dast_header") {
        const resp = await client.request({ method: planned.method, path: planned.path });
        const headers = redactHeaders(resp.headers, sessions.issuedSecrets);
        const missing: string[] = [];
        if (headers["x-content-type-options"]?.toLowerCase() !== "nosniff")
          missing.push("X-Content-Type-Options: nosniff");
        if (!headers["x-frame-options"] && !headers["content-security-policy"]?.includes("frame-ancestors"))
          missing.push("X-Frame-Options / CSP frame-ancestors");
        if (!headers["cache-control"])
          missing.push("Cache-Control");
        const passed = resp.status === 200 && missing.length === 0;
        await record({
          status: resp.status >= 500 ? "INCONCLUSIVE" : passed ? "VERIFIED_PASS" : "VERIFIED_FAIL",
          severity: passed ? "info" : "medium",
          httpStatus: resp.status,
          redactedHeaders: headers,
          observedSummary: passed
            ? "Security response headers verified (nosniff, frame protection, cache-control present)."
            : `Missing or weak security headers: ${missing.join(", ")}.`,
          createFinding: !passed && resp.status < 500,
          findingTitle: "Missing security response hardening headers",
        });
        continue;
      }

      if (planned.category === "dast_cors") {
        const untrustedOrigin = "https://untrusted.example.invalid";
        const resp = await client.request({
          method: "OPTIONS",
          path: planned.path,
          headers: {
            origin: untrustedOrigin,
            "access-control-request-method": "GET",
          },
        });
        const headers = redactHeaders(resp.headers, sessions.issuedSecrets);
        const acao = headers["access-control-allow-origin"] ?? "";
        const acac = headers["access-control-allow-credentials"] ?? "";
        const vulnerable =
          (acao === untrustedOrigin || acao === "*") && acac.toLowerCase() === "true";
        await record({
          status: vulnerable ? "VERIFIED_FAIL" : "VERIFIED_PASS",
          severity: vulnerable ? "high" : "info",
          httpStatus: resp.status,
          redactedHeaders: headers,
          observedSummary: vulnerable
            ? `Unsafe CORS policy reflected untrusted Origin (${acao}) with Allow-Credentials: ${acac}.`
            : `CORS rejected or withheld untrusted origin reflection (acao=${acao || "none"}).`,
          createFinding: vulnerable,
          findingTitle: "Permissive CORS reflects untrusted origin with credentials",
        });
        continue;
      }

      if (planned.category === "dast_response") {
        const resp = await client.request({ method: planned.method, path: planned.path });
        const headers = redactHeaders(resp.headers, sessions.issuedSecrets);
        const unsafe = resp.redirectOutOfScope || (resp.status >= 300 && resp.status < 400);
        await record({
          status: unsafe ? "VERIFIED_FAIL" : "VERIFIED_PASS",
          severity: unsafe ? "high" : "info",
          httpStatus: resp.status,
          redactedHeaders: headers,
          observedSummary: unsafe
            ? `Out-of-scope redirect detected (${headers.location ?? "unknown"}) and blocked at egress boundary.`
            : "No unvalidated out-of-scope redirect observed.",
          createFinding: unsafe,
          findingTitle: "Unvalidated out-of-scope or metadata redirect",
        });
        continue;
      }

      if (planned.category === "dast_session") {
        if (!sessions.hasAccount(planned.actorRole)) {
          await record({
            status: "NOT_EXECUTED",
            severity: "info",
            httpStatus: null,
            observedSummary: `Synthetic account for role ${planned.actorRole} is missing, expired, or revoked.`,
          });
          continue;
        }
        // Test 1: Short-lived TTL expiration (-2 sec => already expired token)
        const expiredSession = await sessions.acquire(planned.actorRole, -2);
        const activeSession = await sessions.acquire(planned.actorRole, 120);
        if (!expiredSession || !activeSession) {
          await record({
            status: "INCONCLUSIVE",
            severity: "info",
            httpStatus: null,
            observedSummary: "Could not acquire synthetic sessions for expiry/revocation verification.",
          });
          continue;
        }
        const expiredProbe = await client.request({
          method: "GET",
          path: "/api/auth/whoami",
          headers: sessions.authHeaders(expiredSession),
        });
        const logoutResp = await client.request({
          method: "POST",
          path: "/api/auth/logout",
          headers: sessions.authHeaders(activeSession),
        });
        const postLogoutProbe = await client.request({
          method: "GET",
          path: "/api/auth/whoami",
          headers: sessions.authHeaders(activeSession),
        });

        const expiredRejected = expiredProbe.status === 401;
        const revokedRejected = logoutResp.status === 200 && postLogoutProbe.status === 401;
        const passed = expiredRejected && revokedRejected;
        await record({
          status: passed ? "VERIFIED_PASS" : "VERIFIED_FAIL",
          severity: passed ? "info" : "high",
          httpStatus: postLogoutProbe.status,
          observedSummary: passed
            ? "Expired session (401) and post-logout revoked session (401) both properly rejected."
            : `Session control failure: expiredProbe=${expiredProbe.status}, logout=${logoutResp.status}, postLogoutProbe=${postLogoutProbe.status}.`,
          cleanupStatus: "verified",
          cleanupReceipt: { sessionRevoked: true },
          createFinding: !passed,
          findingTitle: "Session expiration or revocation not enforced",
        });
        continue;
      }

      // dast_auth or auth_matrix
      let headers: Record<string, string> = {};
      if (planned.actorRole !== "anonymous") {
        if (!sessions.hasAccount(planned.actorRole)) {
          await record({
            status: "NOT_EXECUTED",
            severity: "info",
            httpStatus: null,
            observedSummary: `No active synthetic account configured for role ${planned.actorRole}.`,
          });
          continue;
        }
        const session = await sessions.acquire(planned.actorRole);
        if (!session) {
          await record({
            status: "INCONCLUSIVE",
            severity: "info",
            httpStatus: null,
            observedSummary: `Failed to authenticate synthetic account for role ${planned.actorRole}.`,
          });
          continue;
        }
        headers = sessions.authHeaders(session);
      }

      const resp = await client.request({
        method: planned.method,
        path: planned.path,
        headers,
      });
      const expectedMatch = planned.expectedStatus.includes(resp.status);
      const isServerError = resp.status >= 500;
      const status: G05CaseOutcome = isServerError
        ? "INCONCLUSIVE"
        : expectedMatch
          ? "VERIFIED_PASS"
          : "VERIFIED_FAIL";

      await record({
        status,
        severity: status === "VERIFIED_FAIL" ? "high" : "info",
        httpStatus: resp.status,
        redactedHeaders: redactHeaders(resp.headers, sessions.issuedSecrets),
        redactedBodyExcerpt: resp.bodyText,
        observedSummary: expectedMatch
          ? `Observed HTTP ${resp.status} matching expected [${planned.expectedStatus.join(", ")}].`
          : `Expected HTTP [${planned.expectedStatus.join(", ")}], observed HTTP ${resp.status}.`,
        createFinding: status === "VERIFIED_FAIL",
        findingTitle: `Authorization boundary violation on ${planned.method} ${planned.path}`,
      });
    } catch (error) {
      if (error instanceof EgressBlockedError) {
        const isCancel = error.reason === "cancelled";
        const isCap =
          error.reason === "request_limit_exceeded" || error.reason === "timeout";
        await record({
          status: isCancel ? "CANCELLED" : "NOT_EXECUTED",
          severity: "info",
          httpStatus: null,
          errorCode: error.reason,
          observedSummary: `Execution halted by egress/runtime control: ${error.reason} (${error.message}).`,
        });
        if (isCancel || isCap || error.reason === "grant_invalid") {
          return { executedCases: results, abortedReason: error.reason };
        }
        continue;
      }
      await record({
        status: "INCONCLUSIVE",
        severity: "info",
        httpStatus: null,
        errorCode: "unexpected_error",
        observedSummary: "Unexpected HTTP execution failure; marked inconclusive.",
      });
    }
  }

  return { executedCases: results };
}
