"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Empty, Notice } from "@/components/ui";
import { trustTestPlan } from "@/features/canvas/trust/model";
import {
  workflowTemplate,
  workflowTestPlan,
} from "@/features/canvas/workflows/model";
import type {
  G05AuditEntry,
  G05CanvasTrustPlan,
  G05CaseOutcome,
  G05CaseResult,
  G05Category,
  G05ExecutionGrant,
  G05Finding,
  G05FindingStatus,
  G05Profile,
  G05Report,
  G05Run,
  G05TargetRecord,
  G05TestAccountView,
  G05TestPlan,
  G05WorkflowImport,
} from "./contracts";
import styles from "../workbench.module.css";

type G05Tab = "targets" | "accounts" | "canvas" | "runs" | "findings";

interface OverviewResponse {
  enabled: boolean;
  status: string;
  scannerVersion: string;
  vaultReady: boolean;
  localSyntheticPin: { allowedOrigin: string; serviceIdentity: string } | null;
  targets: G05TargetRecord[];
  grants: G05ExecutionGrant[];
  accounts: G05TestAccountView[];
  trustPlans: G05CanvasTrustPlan[];
  workflows: G05WorkflowImport[];
  testPlans: G05TestPlan[];
  runs: G05Run[];
  findings: G05Finding[];
  reports: G05Report[];
  audit: G05AuditEntry[];
}

const ALL_CATEGORIES: readonly G05Category[] = [
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

function toneForOutcome(
  status: G05CaseOutcome | G05Run["status"] | G05FindingStatus | string,
): "green" | "red" | "amber" | "blue" | "neutral" {
  if (
    status === "VERIFIED_PASS" ||
    status === "completed" ||
    status === "verified_fixed" ||
    status === "CONNECTED" ||
    status === "valid" ||
    status === "verified" ||
    status === "active" ||
    status === "PASS"
  ) {
    return "green";
  }
  if (
    status === "VERIFIED_FAIL" ||
    status === "CLEANUP_FAILED" ||
    status === "failed" ||
    status === "revoked" ||
    status === "rejected" ||
    status === "NOT_AUTHORIZED" ||
    status === "FAIL" ||
    status === "critical" ||
    status === "high"
  ) {
    return "red";
  }
  if (
    status === "completed_partial" ||
    status === "timed_out" ||
    status === "cancelled" ||
    status === "STALE" ||
    status === "INCOMPLETE" ||
    status === "NOT_EXECUTED" ||
    status === "INCONCLUSIVE" ||
    status === "fix_pending_retest" ||
    status === "medium"
  ) {
    return "amber";
  }
  if (status === "running" || status === "queued" || status === "configured") {
    return "blue";
  }
  return "neutral";
}

function decisionTone(
  decision?: "PASS" | "FAIL" | "INCOMPLETE" | "BLOCKED",
): "green" | "red" | "amber" {
  if (decision === "PASS") return "green";
  if (decision === "FAIL" || decision === "BLOCKED") return "red";
  return "amber";
}

function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

function defaultTrustJson(projectId: string) {
  return JSON.stringify(
    {
      ...trustTestPlan(projectId, {
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
          {
            id: "pol-user-orders",
            roleId: "r-user",
            resourceId: "res-orders",
            action: "read own orders",
            ownership: "own",
            allowed: true,
            confirmed: true,
          },
          {
            id: "pol-user-admin",
            roleId: "r-user",
            resourceId: "res-admin",
            action: "read admin audit",
            ownership: "any",
            allowed: false,
            confirmed: true,
          },
          {
            id: "pol-admin-audit",
            roleId: "r-admin",
            resourceId: "res-admin",
            action: "read admin audit",
            ownership: "any",
            allowed: true,
            confirmed: true,
          },
        ],
      }),
      canvasGraphRevision: "canvas-rev-1",
      confirmed: true,
      confirmedBy: "guard-operator",
      confirmedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

function defaultWorkflowJson(projectId: string) {
  const tpl = workflowTemplate(0, `wf-orders-${projectId}`);
  return JSON.stringify(
    {
      ...workflowTestPlan(projectId, tpl),
      states: tpl.states,
      canvasGraphRevision: "canvas-rev-1",
    },
    null,
    2,
  );
}

export function G05Workbench({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<G05Tab>("targets");
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Target form state
  const [targetId, setTargetId] = useState("staging-primary");
  const [targetName, setTargetName] = useState("Approved Staging Target");
  const [targetEnv, setTargetEnv] = useState<"local_synthetic" | "staging">("local_synthetic");
  const [targetOrigin, setTargetOrigin] = useState("http://127.0.0.1:4115");
  const [serviceIdentity, setServiceIdentity] = useState("wetscan-g05-synthetic-staging-v1");
  const [targetOwner, setTargetOwner] = useState("sec-team");
  const [allowedRoutesText, setAllowedRoutesText] = useState(
    "/healthz, /api/public/catalog, /api/redirect-probe, /api/orders, /api/orders/*, /api/auth/*, /api/admin/*",
  );
  const [allowedMethodsText, setAllowedMethodsText] = useState(
    "GET, HEAD, OPTIONS, POST, PATCH, DELETE",
  );
  const [maxRequests, setMaxRequests] = useState("250");
  const [rateLimitRps, setRateLimitRps] = useState("20");
  const [timeoutMs, setTimeoutMs] = useState("3000");

  // Grant form state
  const [proofId, setProofId] = useState("proof-staging-001");
  const [authorizationRef, setAuthorizationRef] = useState("AUTH-G05-001");
  const [grantHours, setGrantHours] = useState("4");
  const [revokeReason, setRevokeReason] = useState("Completed verification window");
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [selectedGrantId, setSelectedGrantId] = useState("");

  // Synthetic account form state
  const [accountRole, setAccountRole] = useState<G05TestAccountView["role"]>("user_a");
  const [accountLabel, setAccountLabel] = useState("Synthetic User A");
  const [accountUsername, setAccountUsername] = useState("syn-user-a@synthetic.wetscan.invalid");
  const [accountStrategy, setAccountStrategy] =
    useState<G05TestAccountView["authStrategy"]>("bearer_login");
  const [accountLoginPath, setAccountLoginPath] = useState("/api/auth/login");
  const [accountSecret, setAccountSecret] = useState("");
  const [accountHours, setAccountHours] = useState("4");

  // Canvas & Plan state
  const [trustJson, setTrustJson] = useState(() => defaultTrustJson(projectId));
  const [workflowJson, setWorkflowJson] = useState(() => defaultWorkflowJson(projectId));
  const [selectedTrustId, setSelectedTrustId] = useState("");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [planProfile, setPlanProfile] = useState<G05Profile>("full_g05");
  const [selectedPlanId, setSelectedPlanId] = useState("");

  // Run / cases / findings triage state
  const [selectedRunId, setSelectedRunId] = useState("");
  const [runDetail, setRunDetail] = useState<{
    run: G05Run;
    cases: G05CaseResult[];
    findings: G05Finding[];
  } | null>(null);
  const [triageFindingId, setTriageFindingId] = useState("");
  const [triageStatus, setTriageStatus] = useState<G05FindingStatus>("fix_pending_retest");
  const [triageReason, setTriageReason] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("");

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apiBase = `/api/guard/projects/${encodeURIComponent(projectId)}/g05`;

  const loadRunDetail = useCallback(
    async (runId: string) => {
      if (!runId) {
        setRunDetail(null);
        return;
      }
      const res = await fetch(`${apiBase}/runs?runId=${encodeURIComponent(runId)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as {
        run: G05Run;
        cases: G05CaseResult[];
        findings: G05Finding[];
      };
      setRunDetail(body);
    },
    [apiBase],
  );

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) {
        setBusy(true);
        setError(null);
      }
      try {
        const res = await fetch(`${apiBase}/overview`, { cache: "no-store" });
        const body = (await res.json()) as OverviewResponse & { error?: string; message?: string };
        if (!res.ok) {
          setError(body.message || body.error || "Unable to load G05 overview.");
          return;
        }
        setData(body);

        // Pre-populate selections cleanly without overriding user picks
        if (body.localSyntheticPin && body.targets.length === 0) {
          setTargetOrigin(body.localSyntheticPin.allowedOrigin);
          setServiceIdentity(body.localSyntheticPin.serviceIdentity);
        }
        const activeTarget = body.targets.find((t) => t.status === "active") ?? body.targets[0];
        if (activeTarget && !selectedTargetId) setSelectedTargetId(activeTarget.id);
        const activeGrant =
          body.grants.find(
            (g) => g.status === "active" && g.revokedAt === null && Date.parse(g.expiresAt) > Date.now(),
          ) ?? body.grants[0];
        if (activeGrant && !selectedGrantId) setSelectedGrantId(activeGrant.id);
        if (body.trustPlans[0] && !selectedTrustId) setSelectedTrustId(body.trustPlans[0].id);
        if (body.workflows[0] && !selectedWorkflowId) setSelectedWorkflowId(body.workflows[0].id);
        if (body.testPlans[0] && !selectedPlanId) setSelectedPlanId(body.testPlans[0].id);
        const topRun = body.runs[0];
        if (topRun) {
          const targetRun = selectedRunId
            ? body.runs.find((r) => r.id === selectedRunId) ?? topRun
            : topRun;
          setSelectedRunId(targetRun.id);
          await loadRunDetail(targetRun.id);
        }
        if (body.findings[0] && !triageFindingId) {
          setTriageFindingId(body.findings[0].id);
        }
        if (body.reports[0] && !selectedReportId) {
          setSelectedReportId(body.reports[0].id);
        }
      } catch {
        setError("Failed to communicate with Guard G05 API.");
      } finally {
        if (!silent) setBusy(false);
      }
    },
    [
      apiBase,
      loadRunDetail,
      selectedGrantId,
      selectedPlanId,
      selectedReportId,
      selectedRunId,
      selectedTargetId,
      selectedTrustId,
      selectedWorkflowId,
      triageFindingId,
    ],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      void refresh(true);
    }, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  // Automatic status polling while any run is queued or running
  const hasActiveRun = useMemo(
    () => Boolean(data?.runs.some((r) => r.status === "queued" || r.status === "running")),
    [data?.runs],
  );

  useEffect(() => {
    if (!hasActiveRun) return;
    pollTimerRef.current = setTimeout(() => {
      void refresh(true);
    }, 1200);
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [hasActiveRun, refresh, data]);

  async function postJson<T = Record<string, unknown>>(
    resource: string,
    payload: unknown,
    successMsg?: string,
  ): Promise<T | null> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${apiBase}/${resource}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as T & {
        error?: string;
        message?: string;
        details?: string[];
      };
      if (!res.ok) {
        const detail = body.details?.length ? ` (${body.details.join("; ")})` : "";
        setError(`${body.message || body.error || "Request rejected."}${detail}`);
        return null;
      }
      if (successMsg) setNotice(successMsg);
      await refresh(true);
      return body;
    } catch {
      setError("Network or server error processing Guard G05 operation.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const currentTarget = useMemo(
    () => data?.targets.find((t) => t.id === (selectedTargetId || targetId)) ?? data?.targets[0] ?? null,
    [data?.targets, selectedTargetId, targetId],
  );

  const selectedFindingObj = useMemo(
    () => data?.findings.find((f) => f.id === triageFindingId) ?? null,
    [data?.findings, triageFindingId],
  );

  async function handleSaveTarget() {
    const existing = data?.targets.find((t) => t.id === targetId.trim());
    const routes = allowedRoutesText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const methods = allowedMethodsText
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const res = await postJson<{ target: G05TargetRecord }>(
      "targets",
      {
        id: targetId.trim(),
        name: targetName.trim(),
        environment: targetEnv,
        origin: targetOrigin.trim(),
        serviceIdentity: targetEnv === "local_synthetic" ? serviceIdentity.trim() : null,
        owner: targetOwner.trim(),
        status: "active",
        expectedRevision: existing?.revision ?? 0,
        reason: existing ? "Updated staging configuration" : "Initial G05 target activation",
        config: {
          allowedRoutes: routes,
          allowedMethods: methods,
          maxRequests: Number(maxRequests),
          maxConcurrency: 3,
          rateLimitRps: Number(rateLimitRps),
          maxResponseBytes: 65536,
          timeoutMs: Number(timeoutMs),
          approvedCategories: ALL_CATEGORIES,
          allowedSyntheticResources: ["order", "session"],
          cleanupPolicy: "delete_created_and_revoke_sessions",
        },
      },
      `Target ${targetId.trim()} saved & activated.`,
    );
    if (res?.target) setSelectedTargetId(res.target.id);
  }

  async function handleIssueGrant() {
    const tgt = selectedTargetId || currentTarget?.id || targetId.trim();
    const tgtObj = data?.targets.find((t) => t.id === tgt);
    const categories = tgtObj?.config.approvedCategories ?? [...ALL_CATEGORIES];
    const hours = Math.max(1, Math.min(24 * 30, Number(grantHours) || 4));
    const res = await postJson<{ grant: G05ExecutionGrant }>(
      "grants",
      {
        targetId: tgt,
        proofId: proofId.trim(),
        authorizationRef: authorizationRef.trim(),
        approvedCategories: categories,
        expiresAt: new Date(Date.now() + hours * 3600_000).toISOString(),
      },
      `Issued execution grant for ${tgt}.`,
    );
    if (res?.grant) setSelectedGrantId(res.grant.id);
  }

  async function handleSaveAccount() {
    const tgt = selectedTargetId || currentTarget?.id || targetId.trim();
    const hours = Math.max(1, Math.min(24 * 30, Number(accountHours) || 4));
    const secretCopy = accountSecret;
    setAccountSecret("");
    await postJson(
      "accounts",
      {
        id: `acct-${accountRole.replaceAll("_", "-")}`,
        targetId: tgt,
        role: accountRole,
        label: accountLabel.trim(),
        usernameRef: accountUsername.trim(),
        authStrategy: accountStrategy,
        loginPath:
          accountStrategy === "bearer_login" || accountStrategy === "cookie_login"
            ? accountLoginPath.trim()
            : null,
        secret: accountStrategy === "none" ? null : secretCopy,
        expiresAt: new Date(Date.now() + hours * 3600_000).toISOString(),
      },
      `Synthetic account ${accountLabel.trim()} sealed with AES-256-GCM.`,
    );
  }

  async function handleImportTrustPlan() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trustJson);
    } catch {
      setError("Trust Plan JSON is malformed.");
      return;
    }
    const res = await postJson<{ trustPlan: G05CanvasTrustPlan }>(
      "trust-plans",
      { plan: parsed },
      "Canvas Trust Plan imported & evaluated.",
    );
    if (res?.trustPlan) setSelectedTrustId(res.trustPlan.id);
  }

  async function handleImportWorkflow() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(workflowJson);
    } catch {
      setError("Workflow JSON is malformed.");
      return;
    }
    const res = await postJson<{ workflow: G05WorkflowImport }>(
      "workflows",
      {
        workflow: parsed,
        targetId: selectedTargetId || currentTarget?.id || undefined,
        trustPlanId: selectedTrustId || null,
      },
      "Canvas Workflow definition imported & validated.",
    );
    if (res?.workflow) setSelectedWorkflowId(res.workflow.id);
  }

  async function handleBuildTestPlan() {
    const tgt = selectedTargetId || currentTarget?.id || "";
    const res = await postJson<{ testPlan: G05TestPlan }>(
      "test-plans",
      {
        targetId: tgt,
        profile: planProfile,
        trustPlanId: selectedTrustId || null,
        workflowImportId: selectedWorkflowId || null,
      },
      "Generated G05 test plan preview.",
    );
    if (res?.testPlan) setSelectedPlanId(res.testPlan.id);
  }

  async function handleStartRun() {
    if (!selectedPlanId || !selectedGrantId) {
      setError("Select an approved test plan and active execution grant first.");
      return;
    }
    const idem = newIdempotencyKey("g05-run");
    const res = await postJson<{ run: G05Run }>(
      "runs",
      {
        idempotencyKey: idem,
        testPlanId: selectedPlanId,
        grantId: selectedGrantId,
      },
      "Queued G05 verification run onto isolated worker queue.",
    );
    if (res?.run) {
      setSelectedRunId(res.run.id);
      setTab("runs");
      await loadRunDetail(res.run.id);
    }
  }

  async function handleTargetedRetest(sourceRunId: string, findingId?: string) {
    if (!selectedGrantId) {
      setError("Select an active execution grant for the targeted retest.");
      return;
    }
    const idem = newIdempotencyKey("g05-retest");
    const res = await postJson<{ run: G05Run }>(
      "retest",
      {
        idempotencyKey: idem,
        sourceRunId,
        grantId: selectedGrantId,
        ...(findingId ? { findingId } : {}),
      },
      "Queued targeted G05 retest.",
    );
    if (res?.run) {
      setSelectedRunId(res.run.id);
      setTab("runs");
      await loadRunDetail(res.run.id);
    }
  }

  if (data && !data.enabled) {
    return (
      <Card className={styles.panel} aria-label="Guard DAST and Integrity workbench">
        <div className={styles.toolbar}>
          <Badge tone="amber">G05 · NOT CONFIGURED</Badge>
          <Button variant="secondary" disabled={busy} onClick={() => void refresh()}>
            Refresh G05 status
          </Button>
        </div>
        <Notice>
          WetScan Guard G05 (Scoped Staging DAST, Authenticated Testing, Canvas Trust/Workflow
          Execution &amp; Live Integrity Runner) is disabled by default (`GUARD_G05_ENABLED=1` not
          set). No unconfigured scans or fake pass results are emitted.
        </Notice>
      </Card>
    );
  }

  return (
    <Card className={styles.panel} aria-label="Guard DAST and Integrity workbench">
      <div className={styles.toolbar}>
        <Badge tone={data?.vaultReady ? "green" : "amber"}>
          {data?.vaultReady ? "G05 · READY" : "G05 · VAULT UNSET"}
        </Badge>
        <Badge tone={data?.localSyntheticPin ? "blue" : "neutral"}>
          {data?.localSyntheticPin
            ? `SYNTHETIC PIN: ${data.localSyntheticPin.allowedOrigin}`
            : "EXTERNAL STAGING ONLY"}
        </Badge>
        <Button variant="secondary" disabled={busy} onClick={() => void refresh()}>
          Refresh G05 state
        </Button>
      </div>

      {error && (
        <div role="alert">
          <Notice tone="amber">{error}</Notice>
        </div>
      )}
      {notice && <Notice>{notice}</Notice>}

      <nav className="page-tabs" aria-label="G05 Workbench sections">
        {(
          [
            ["Targets & Grants", "targets"],
            ["Test Accounts", "accounts"],
            ["Canvas & Test Plan", "canvas"],
            ["Execution & Integrity", "runs"],
            ["Findings & Reports", "findings"],
          ] as const
        ).map(([label, key]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "active" : ""}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "targets" && (
        <div className={styles.stack}>
          <h2>1. Approved Staging Target &amp; Execution Consent Grant</h2>
          <Notice>
            Targets require exact origin/scope pinning and an explicit unexpired execution grant
            bound to the active target revision. Private/metadata IPs and arbitrary localhost ports
            are blocked at DNS and socket connect time.
          </Notice>

          <div className={styles.grid}>
            <fieldset className={styles.stack}>
              <legend>Configure / Update Target Scope</legend>
              <label>
                Target ID
                <input value={targetId} onChange={(e) => setTargetId(e.target.value)} />
              </label>
              <label>
                Target Name
                <input value={targetName} onChange={(e) => setTargetName(e.target.value)} />
              </label>
              <label>
                Environment
                <select
                  value={targetEnv}
                  onChange={(e) =>
                    setTargetEnv(e.target.value as "local_synthetic" | "staging")
                  }
                >
                  <option value="local_synthetic">local_synthetic (pinned container)</option>
                  <option value="staging">staging (public HTTPS)</option>
                </select>
              </label>
              <label>
                Target Origin
                <input value={targetOrigin} onChange={(e) => setTargetOrigin(e.target.value)} />
              </label>
              {targetEnv === "local_synthetic" && (
                <label>
                  Synthetic Service Identity
                  <input
                    value={serviceIdentity}
                    onChange={(e) => setServiceIdentity(e.target.value)}
                  />
                </label>
              )}
              <label>
                Target Owner
                <input value={targetOwner} onChange={(e) => setTargetOwner(e.target.value)} />
              </label>
              <label>
                Allowed Routes (comma-separated)
                <textarea
                  rows={2}
                  value={allowedRoutesText}
                  onChange={(e) => setAllowedRoutesText(e.target.value)}
                />
              </label>
              <label>
                Allowed Methods
                <input
                  value={allowedMethodsText}
                  onChange={(e) => setAllowedMethodsText(e.target.value)}
                />
              </label>
              <div className={styles.toolbar}>
                <label>
                  Max Requests
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={maxRequests}
                    onChange={(e) => setMaxRequests(e.target.value)}
                  />
                </label>
                <label>
                  Rate Limit RPS
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={rateLimitRps}
                    onChange={(e) => setRateLimitRps(e.target.value)}
                  />
                </label>
                <label>
                  Timeout (ms)
                  <input
                    type="number"
                    min={200}
                    max={60000}
                    value={timeoutMs}
                    onChange={(e) => setTimeoutMs(e.target.value)}
                  />
                </label>
              </div>
              <Button disabled={busy} onClick={() => void handleSaveTarget()}>
                Save &amp; Activate Target
              </Button>
            </fieldset>

            <fieldset className={styles.stack}>
              <legend>Issue Time-Bounded Consent Grant</legend>
              <label>
                Target
                <select
                  value={selectedTargetId || currentTarget?.id || ""}
                  onChange={(e) => setSelectedTargetId(e.target.value)}
                >
                  {(data?.targets ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.id} rev {t.revision})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Authorization Reference
                <input
                  value={authorizationRef}
                  onChange={(e) => setAuthorizationRef(e.target.value)}
                />
              </label>
              <label>
                Consent Proof ID
                <input value={proofId} onChange={(e) => setProofId(e.target.value)} />
              </label>
              <label>
                Valid Duration (hours)
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={grantHours}
                  onChange={(e) => setGrantHours(e.target.value)}
                />
              </label>
              <Button
                disabled={busy || !data?.targets.length}
                onClick={() => void handleIssueGrant()}
              >
                Issue Execution Grant
              </Button>
              <label>
                Revocation Reason (for revoking active grants)
                <input value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} />
              </label>
            </fieldset>
          </div>

          <h3>Configured Targets &amp; Active Grants</h3>
          {!data?.targets.length ? (
            <Empty title="No G05 targets configured" description="Save an authorized staging target above to begin." />
          ) : (
            <div className={styles.scroll}>
              <table>
                <caption>Registered Staging Targets</caption>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Env</th>
                    <th>Origin</th>
                    <th>Revision</th>
                    <th>Status</th>
                    <th>Select</th>
                  </tr>
                </thead>
                <tbody>
                  {data.targets.map((t) => (
                    <tr key={t.id}>
                      <td>{t.id}</td>
                      <td>{t.environment}</td>
                      <td className={styles.meta}>{t.origin}</td>
                      <td>{t.revision}</td>
                      <td>
                        <Badge tone={toneForOutcome(t.status)}>{t.status}</Badge>
                      </td>
                      <td>
                        <Button
                          variant="secondary"
                          onClick={() => setSelectedTargetId(t.id)}
                        >
                          {selectedTargetId === t.id ? "Selected" : "Use Target"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {Boolean(data?.grants.length) && (
            <div className={styles.scroll}>
              <table>
                <caption>Execution Consent Grants</caption>
                <thead>
                  <tr>
                    <th>Grant ID</th>
                    <th>Target Rev</th>
                    <th>Ref</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.grants.map((g) => (
                    <tr key={g.id}>
                      <td>{g.id.slice(0, 12)}</td>
                      <td>
                        {g.targetId} (r{g.targetRevision})
                      </td>
                      <td>{g.authorizationRef}</td>
                      <td>
                        <Badge tone={toneForOutcome(g.status)}>{g.status}</Badge>
                      </td>
                      <td>{new Date(g.expiresAt).toLocaleString()}</td>
                      <td className={styles.actions}>
                        <Button variant="secondary" onClick={() => setSelectedGrantId(g.id)}>
                          {selectedGrantId === g.id ? "Active Selection" : "Select"}
                        </Button>
                        {g.status === "active" && (
                          <Button
                            variant="danger"
                            disabled={busy}
                            onClick={() =>
                              void postJson(
                                "grants",
                                { action: "revoke", grantId: g.id, reason: revokeReason },
                                "Grant revoked.",
                              )
                            }
                          >
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "accounts" && (
        <div className={styles.stack}>
          <h2>2. Synthetic Authenticated Test Accounts (GRD-012)</h2>
          <Notice>
            Synthetic test credentials are sealed with AES-256-GCM bound to workspace/project/target
            and never rendered back to the browser after submission.
          </Notice>
          <fieldset className={styles.stack}>
            <legend>Seal Synthetic Staging Test Account</legend>
            <div className={styles.grid}>
              <label>
                Target
                <select
                  value={selectedTargetId || currentTarget?.id || ""}
                  onChange={(e) => setSelectedTargetId(e.target.value)}
                >
                  {(data?.targets ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Role Context
                <select
                  value={accountRole}
                  onChange={(e) => {
                    const role = e.target.value as G05TestAccountView["role"];
                    setAccountRole(role);
                    if (role === "user_a") {
                      setAccountLabel("Synthetic User A");
                      setAccountUsername("syn-user-a@synthetic.wetscan.invalid");
                    } else if (role === "user_b") {
                      setAccountLabel("Synthetic User B");
                      setAccountUsername("syn-user-b@synthetic.wetscan.invalid");
                    } else if (role === "privileged") {
                      setAccountLabel("Synthetic Admin");
                      setAccountUsername("syn-admin@synthetic.wetscan.invalid");
                    }
                  }}
                >
                  <option value="user_a">user_a (Ordinary Actor A)</option>
                  <option value="user_b">user_b (Independent Actor B)</option>
                  <option value="privileged">privileged (Reviewer / Admin)</option>
                  <option value="custom">custom</option>
                  <option value="anonymous">anonymous</option>
                </select>
              </label>
              <label>
                Label
                <input value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} />
              </label>
              <label>
                Synthetic Username Ref
                <input
                  value={accountUsername}
                  onChange={(e) => setAccountUsername(e.target.value)}
                />
              </label>
              <label>
                Auth Strategy
                <select
                  value={accountStrategy}
                  onChange={(e) =>
                    setAccountStrategy(e.target.value as G05TestAccountView["authStrategy"])
                  }
                >
                  <option value="bearer_login">bearer_login</option>
                  <option value="cookie_login">cookie_login</option>
                  <option value="header_token">header_token</option>
                  <option value="none">none</option>
                </select>
              </label>
              <label>
                Login Path
                <input
                  value={accountLoginPath}
                  onChange={(e) => setAccountLoginPath(e.target.value)}
                />
              </label>
              {accountStrategy !== "none" && (
                <label>
                  Synthetic Password / Token (ephemeral input, sealed immediately)
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={accountSecret}
                    onChange={(e) => setAccountSecret(e.target.value)}
                  />
                </label>
              )}
              <label>
                Expiration (hours)
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={accountHours}
                  onChange={(e) => setAccountHours(e.target.value)}
                />
              </label>
            </div>
            <Button
              disabled={busy || !data?.targets.length}
              onClick={() => void handleSaveAccount()}
            >
              Seal Synthetic Test Account
            </Button>
          </fieldset>

          {!data?.accounts.length ? (
            <Empty title="No synthetic test accounts" description="Seal user_a, user_b, and privileged test accounts above to unlock full Auth Matrix and 5-Invariant Integrity execution." />
          ) : (
            <div className={styles.scroll}>
              <table>
                <caption>Sealed Synthetic Test Accounts (Masked View)</caption>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Role</th>
                    <th>Username Ref</th>
                    <th>Strategy</th>
                    <th>Vault Sealed</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.accounts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.id}</td>
                      <td>{a.role}</td>
                      <td>{a.usernameRef}</td>
                      <td>{a.authStrategy}</td>
                      <td>
                        {a.credentialConfigured ? (
                          <Badge tone="green">
                            AES-GCM ({a.credentialFingerprint?.slice(0, 8)})
                          </Badge>
                        ) : (
                          "none"
                        )}
                      </td>
                      <td>
                        <Badge tone={toneForOutcome(a.status)}>{a.status}</Badge>
                      </td>
                      <td>
                        {a.status !== "revoked" && (
                          <Button
                            variant="danger"
                            disabled={busy}
                            onClick={() =>
                              void postJson(
                                "accounts",
                                { action: "revoke", accountId: a.id },
                                `Revoked synthetic account ${a.id}.`,
                              )
                            }
                          >
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "canvas" && (
        <div className={styles.stack}>
          <h2>3. Canvas Trust Plans (GRD-014), Workflow Import (GRD-015) &amp; Test Plan Preview</h2>
          <div className={styles.grid}>
            <fieldset className={styles.stack}>
              <legend>Import Confirmed Canvas Trust Plan</legend>
              <label>
                Trust Plan JSON (must match {projectId} and be confirmed)
                <textarea
                  rows={8}
                  value={trustJson}
                  onChange={(e) => setTrustJson(e.target.value)}
                />
              </label>
              <Button disabled={busy} onClick={() => void handleImportTrustPlan()}>
                Import &amp; Validate Trust Plan
              </Button>
            </fieldset>

            <fieldset className={styles.stack}>
              <legend>Import Approved Canvas Workflow</legend>
              <label>
                Workflow Definition JSON (states + acyclic transitions + protected fields)
                <textarea
                  rows={8}
                  value={workflowJson}
                  onChange={(e) => setWorkflowJson(e.target.value)}
                />
              </label>
              <Button disabled={busy} onClick={() => void handleImportWorkflow()}>
                Import &amp; Validate Workflow
              </Button>
            </fieldset>
          </div>

          <fieldset className={styles.stack}>
            <legend>Generate &amp; Preview Executable Test Plan</legend>
            <div className={styles.grid}>
              <label>
                Target
                <select
                  value={selectedTargetId || currentTarget?.id || ""}
                  onChange={(e) => setSelectedTargetId(e.target.value)}
                >
                  {(data?.targets ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id} (rev {t.revision})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Execution Profile
                <select
                  value={planProfile}
                  onChange={(e) => setPlanProfile(e.target.value as G05Profile)}
                >
                  <option value="full_g05">full_g05 (DAST + Auth Matrix + 5 Invariants)</option>
                  <option value="integrity_suite">integrity_suite (All 5 Invariants)</option>
                  <option value="auth_matrix">auth_matrix (Role &amp; Trust Plan Matrix)</option>
                  <option value="dast_baseline">dast_baseline (Baseline DAST Only)</option>
                </select>
              </label>
              <label>
                Canvas Trust Plan
                <select
                  value={selectedTrustId}
                  onChange={(e) => setSelectedTrustId(e.target.value)}
                >
                  <option value="">(None / Baseline Only)</option>
                  {(data?.trustPlans ?? []).map((tp) => (
                    <option key={tp.id} value={tp.id}>
                      {tp.integrationStatus} · rev {tp.canvasGraphRevision} ({tp.plan.rules.length}{" "}
                      rules)
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Canvas Workflow Import
                <select
                  value={selectedWorkflowId}
                  onChange={(e) => setSelectedWorkflowId(e.target.value)}
                >
                  <option value="">(None / Standard Suite)</option>
                  {(data?.workflows ?? []).map((wf) => (
                    <option key={wf.id} value={wf.id}>
                      {wf.workflowName} ({wf.validationStatus})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.actions}>
              <Button
                disabled={busy || !data?.targets.length}
                onClick={() => void handleBuildTestPlan()}
              >
                Build Test Plan Preview
              </Button>
              <Button
                disabled={busy || !selectedPlanId || !selectedGrantId}
                onClick={() => void handleStartRun()}
              >
                Launch Queued Run with Active Grant
              </Button>
            </div>
          </fieldset>

          {Boolean(data?.testPlans.length) && (
            <div className={styles.scroll}>
              <table>
                <caption>Generated Test Plans &amp; Cases</caption>
                <thead>
                  <tr>
                    <th>Plan ID</th>
                    <th>Profile</th>
                    <th>Target Rev</th>
                    <th>Cases</th>
                    <th>Categories</th>
                    <th>Select</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.testPlans.map((p) => (
                    <tr key={p.id}>
                      <td>{p.id.slice(0, 12)}</td>
                      <td>{p.profile}</td>
                      <td>
                        {p.targetId} (r{p.targetRevision})
                      </td>
                      <td>{p.cases.length}</td>
                      <td className={styles.meta}>{p.categories.join(", ")}</td>
                      <td>
                        <Button variant="secondary" onClick={() => setSelectedPlanId(p.id)}>
                          {selectedPlanId === p.id ? "Selected Plan" : "Select"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedPlanId && data?.testPlans.find((p) => p.id === selectedPlanId) && (
            <div className={styles.scroll}>
              <table>
                <caption>
                  Previewed Test Cases ({selectedPlanId.slice(0, 12)})
                </caption>
                <thead>
                  <tr>
                    <th>Case ID</th>
                    <th>Category</th>
                    <th>Invariant</th>
                    <th>Role</th>
                    <th>Endpoint</th>
                    <th>State-Changing</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {data.testPlans
                    .find((p) => p.id === selectedPlanId)!
                    .cases.map((c) => (
                      <tr key={c.caseId}>
                        <td>{c.caseId}</td>
                        <td>{c.category}</td>
                        <td>{c.invariantFamily ?? "—"}</td>
                        <td>{c.actorRole}</td>
                        <td>
                          {c.method} {c.path}
                        </td>
                        <td>{c.stateChanging ? "Yes (cleanup verified)" : "Read-only"}</td>
                        <td>{c.sourceRef}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "runs" && (
        <div className={styles.stack}>
          <h2>4. Live Execution &amp; 5-Invariant Integrity Results (GRD-011 / GRD-016)</h2>
          <div className={styles.toolbar}>
            <label>
              Active Grant
              <select
                value={selectedGrantId}
                onChange={(e) => setSelectedGrantId(e.target.value)}
              >
                <option value="">Select grant...</option>
                {(data?.grants ?? [])
                  .filter((g) => g.status === "active")
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.targetId} r{g.targetRevision} · {g.authorizationRef}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Test Plan
              <select value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)}>
                <option value="">Select test plan...</option>
                {(data?.testPlans ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.profile} ({p.cases.length} cases · {p.id.slice(0, 8)})
                  </option>
                ))}
              </select>
            </label>
            <Button
              disabled={busy || !selectedGrantId || !selectedPlanId}
              onClick={() => void handleStartRun()}
            >
              Enqueue DAST &amp; Integrity Run
            </Button>
          </div>

          {!data?.runs.length ? (
            <Empty
              title="No G05 verification runs yet"
              description="Build a Test Plan and enqueue a run with an active grant. The isolated G05 worker executes real staging HTTP traffic outside the web request handler."
            />
          ) : (
            <div className={styles.scroll}>
              <table>
                <caption>Persisted Guard G05 Verification Runs</caption>
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Status</th>
                    <th>Decision</th>
                    <th>Pass / Fail / Partial</th>
                    <th>Cleanup</th>
                    <th>Requests</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id.slice(0, 12)}</td>
                      <td>
                        <Badge tone={toneForOutcome(r.status)}>{r.status}</Badge>
                      </td>
                      <td>
                        <Badge tone={decisionTone(r.summary.decision)}>
                          {r.summary.decision}
                        </Badge>
                      </td>
                      <td>
                        {r.summary.passed}P / {r.summary.failed}F /{" "}
                        {r.summary.notExecuted + r.summary.inconclusive} Incomplete
                      </td>
                      <td>
                        <Badge tone={toneForOutcome(r.cleanupStatus)}>{r.cleanupStatus}</Badge>
                      </td>
                      <td>
                        {r.executedRequests} / {r.maxRequests}
                      </td>
                      <td className={styles.actions}>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setSelectedRunId(r.id);
                            void loadRunDetail(r.id);
                          }}
                        >
                          Inspect
                        </Button>
                        {(r.status === "queued" || r.status === "running") && (
                          <Button
                            variant="danger"
                            disabled={busy}
                            onClick={() =>
                              void postJson(
                                "runs",
                                { action: "cancel", runId: r.id },
                                `Requested cancellation for run ${r.id.slice(0, 10)}.`,
                              )
                            }
                          >
                            Cancel
                          </Button>
                        )}
                        {r.summary.failed > 0 && selectedGrantId && (
                          <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void handleTargetedRetest(r.id)}
                          >
                            Targeted Retest
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            void postJson(
                              "reports",
                              { runId: r.id },
                              "Generated & persisted G05 report.",
                            )
                          }
                        >
                          Save Report
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {runDetail && (
            <div className={styles.stack}>
              <h3>Run Detail: {runDetail.run.id.slice(0, 12)}</h3>
              <div className={styles.grid}>
                <div className={styles.item}>
                  <strong>Invariants Verified</strong>
                  <p>
                    {runDetail.run.coverage.invariantsVerified.length
                      ? runDetail.run.coverage.invariantsVerified.join(", ")
                      : "None"}
                  </p>
                </div>
                <div className={styles.item}>
                  <strong>Invariants Failed</strong>
                  <p>
                    {runDetail.run.coverage.invariantsFailed.length
                      ? runDetail.run.coverage.invariantsFailed.join(", ")
                      : "None"}
                  </p>
                </div>
                <div className={styles.item}>
                  <strong>TLS Applicability</strong>
                  <p>
                    {runDetail.run.coverage.tlsApplicable
                      ? "Enforced (HTTPS Staging)"
                      : "not_applicable (Local HTTP Synthetic)"}
                  </p>
                </div>
                <div className={styles.item}>
                  <strong>Evidence Digest</strong>
                  <p className={styles.meta}>{runDetail.run.evidenceDigest ?? "pending"}</p>
                </div>
              </div>

              <div className={styles.scroll}>
                <table>
                  <caption>Observed Case Outcomes, Pre/Post State &amp; Cleanup Receipts</caption>
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>Invariant</th>
                      <th>Request</th>
                      <th>Outcome</th>
                      <th>Expected vs Observed</th>
                      <th>Persisted State Diff</th>
                      <th>Cleanup</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runDetail.cases.map((c) => (
                      <tr key={c.caseId}>
                        <td>{c.caseId}</td>
                        <td>{c.invariantFamily ?? c.category}</td>
                        <td>
                          {c.httpMethod} {c.requestPath}
                        </td>
                        <td>
                          <Badge tone={toneForOutcome(c.status)}>{c.status}</Badge>
                        </td>
                        <td className={styles.meta}>
                          <div>
                            <strong>Expected:</strong> {c.expectedBehavior.summary}
                          </div>
                          <div>
                            <strong>Observed:</strong> {c.observedBehavior.summary} (HTTP{" "}
                            {c.observedBehavior.httpStatus ?? "—"})
                          </div>
                        </td>
                        <td className={styles.meta}>
                          {c.preState || c.postState
                            ? `Pre: ${JSON.stringify(c.preState)} | Post: ${JSON.stringify(c.postState)}`
                            : "Read-only"}
                        </td>
                        <td>
                          <Badge tone={toneForOutcome(c.cleanupStatus)}>{c.cleanupStatus}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "findings" && (
        <div className={styles.stack}>
          <h2>5. Security Findings, Triage &amp; Saved Reports</h2>

          {!data?.findings.length ? (
            <Empty
              title="No G05 vulnerabilities detected"
              description="Verified DAST, Auth Matrix, and Integrity failures appear here with redacted evidence and targeted retest controls."
            />
          ) : (
            <>
              <div className={styles.scroll}>
                <table>
                  <caption>Normalized Redacted Findings</caption>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Title</th>
                      <th>Severity</th>
                      <th>Engine / Family</th>
                      <th>Status</th>
                      <th>Endpoint</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.findings.map((f) => (
                      <tr key={f.id}>
                        <td>{f.id.slice(0, 12)}</td>
                        <td>{f.title}</td>
                        <td>
                          <Badge tone={toneForOutcome(f.severity)}>{f.severity}</Badge>
                        </td>
                        <td>{f.invariantFamily ?? f.engine}</td>
                        <td>
                          <Badge tone={toneForOutcome(f.status)}>{f.status}</Badge>
                        </td>
                        <td className={styles.meta}>{f.endpoint}</td>
                        <td className={styles.actions}>
                          <Button
                            variant="secondary"
                            onClick={() => setTriageFindingId(f.id)}
                          >
                            Triage
                          </Button>
                          {selectedGrantId && (
                            <Button
                              variant="secondary"
                              disabled={busy}
                              onClick={() => void handleTargetedRetest(f.runId, f.id)}
                            >
                              Retest Finding
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedFindingObj && (
                <fieldset className={styles.stack}>
                  <legend>
                    Triage Finding {selectedFindingObj.id.slice(0, 12)} (rev{" "}
                    {selectedFindingObj.revision})
                  </legend>
                  <p className={styles.meta}>{selectedFindingObj.summary}</p>
                  <div className={styles.toolbar}>
                    <label>
                      Decision Status
                      <select
                        value={triageStatus}
                        onChange={(e) => setTriageStatus(e.target.value as G05FindingStatus)}
                      >
                        <option value="under_review">under_review</option>
                        <option value="fix_pending_retest">fix_pending_retest</option>
                        <option value="verified_fixed">verified_fixed</option>
                        <option value="false_positive">false_positive</option>
                        <option value="risk_accepted">risk_accepted</option>
                      </select>
                    </label>
                    <label>
                      Justification (&ge; 8 characters)
                      <input
                        value={triageReason}
                        onChange={(e) => setTriageReason(e.target.value)}
                      />
                    </label>
                    <Button
                      disabled={busy || triageReason.trim().length < 8}
                      onClick={() =>
                        void postJson(
                          "findings",
                          {
                            findingId: selectedFindingObj.id,
                            expectedRevision: selectedFindingObj.revision,
                            status: triageStatus,
                            reason: triageReason,
                          },
                          "Saved finding triage decision.",
                        )
                      }
                    >
                      Save Triage
                    </Button>
                  </div>
                </fieldset>
              )}
            </>
          )}

          <h3>Persisted Verification Reports</h3>
          {!data?.reports.length ? (
            <Empty
              title="No persisted G05 reports"
              description="Use Save Report on any run in Execution & Integrity to freeze an exact-revision report."
            />
          ) : (
            <div className={styles.scroll}>
              <table>
                <caption>Persisted Exact-Revision Reports</caption>
                <thead>
                  <tr>
                    <th>Report ID</th>
                    <th>Run</th>
                    <th>Target Rev</th>
                    <th>Digest</th>
                    <th>Export</th>
                  </tr>
                </thead>
                <tbody>
                  {data.reports.map((rep) => (
                    <tr key={rep.id}>
                      <td>{rep.id.slice(0, 12)}</td>
                      <td>{rep.runId.slice(0, 12)}</td>
                      <td>r{rep.targetRevision}</td>
                      <td className={styles.meta}>{rep.reportDigest.slice(0, 16)}...</td>
                      <td className={styles.actions}>
                        <a
                          className="button secondary"
                          href={`${apiBase}/reports?reportId=${encodeURIComponent(rep.id)}`}
                          download={`wetscan-g05-report-${rep.id.slice(0, 12)}.json`}
                        >
                          Download JSON
                        </a>
                        <a
                          className="button secondary"
                          href={`${apiBase}/reports?reportId=${encodeURIComponent(rep.id)}&format=html&download=1`}
                        >
                          Download HTML
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
