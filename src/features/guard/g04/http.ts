import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { requestToken } from "../../../lib/auth/session";
import { requireOrigin } from "../../../lib/auth/http";
import { AuthError } from "../../../lib/auth/config";
import { authorizeGuardProject } from "../live/project";
import { boundedJson } from "../live/http";
import { LiveGuardError, type ProjectAuthority } from "../live/model";
import { GuardError } from "../security";
import { G04Disabled, g04Host } from "./runtime";
import { WebhookError, openEnvelope, readRaw, webhookSecrets } from "./webhook";
import { PolicyError, defaultPolicy, triggerAllowed, validatePolicy } from "./policy";
import { G04Error } from "./store";
import { GhError } from "./github";
import { ProviderError } from "./provider";
import { ScheduleError, nextRun, validateCadence } from "./schedule";
import { vercelProvider, vercelToken } from "./vercel";
import { CHECK_NAME } from "./checks";

const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });
const scopeOf = (a: ProjectAuthority) => ({ workspaceId: a.grant.workspaceId, projectId: a.grant.projectId });

/** POST /api/guard/webhooks/github — signature over the raw bytes first; only then anything else. Never scans. */
export async function webhookHandler(request: Request) {
  try {
    const host = await g04Host();
    const secrets = webhookSecrets(),
      raw = await readRaw(request),
      env = openEnvelope(request.headers, raw, secrets),
      result = await host.api.ingest(env);
    return NextResponse.json({ outcome: result.outcome }, { status: result.status, headers: { "Cache-Control": "no-store", ...(result.status === 429 ? { "Retry-After": "300" } : {}) } });
  } catch (e) {
    const status = e instanceof WebhookError ? e.status : e instanceof G04Disabled ? 503 : 503;
    // Fixed reason codes only: no payload, header, SQL or provider text.
    return NextResponse.json({ error: e instanceof WebhookError ? e.code : e instanceof G04Disabled ? "g04_disabled" : "unavailable" }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

export type G04Resource = "overview" | "policy" | "triggers" | "checks" | "deployments" | "mapping" | "schedules" | "access" | "gate";
const resources: readonly string[] = ["overview", "policy", "triggers", "checks", "deployments", "mapping", "schedules", "access", "gate"];
export const isG04Resource = (v: string): v is G04Resource => resources.includes(v);

export async function g04Route(request: NextRequest, projectId: string, resource: G04Resource) {
  try {
    if (!/^github-[1-9]\d{0,15}$/.test(projectId)) throw new LiveGuardError("not_found", 404);
    if (request.method !== "GET") requireOrigin(request);
    const token = requestToken(request),
      a = await authorizeGuardProject(token, projectId),
      scope = scopeOf(a),
      host = await g04Host(),
      st = host.rt.appStore,
      now = Date.now();
    if (request.method === "GET" && [...request.nextUrl.searchParams].length) throw new LiveGuardError("invalid_input", 400);
    const body = async () => {
      if (request.method === "GET") return undefined;
      return (await boundedJson(request)) as Record<string, unknown>;
    };
    switch (resource) {
      case "overview": {
        const [policy, triggers, checks, evaluations, deployments, schedules, deliveries, audit, mapping] = await Promise.all([st.getPolicy(scope), st.listTriggers(scope, 20), st.listChecks(scope, 20), st.listEvaluations(scope, 20), st.listDeployments(scope, 10), st.listSchedules(scope), st.recentDeliveries(scope, 15), st.recentAudit(scope, 25), st.getMapping(scope)]);
        let webhookSecret = false;
        try {
          webhookSecrets();
          webhookSecret = true;
        } catch {
          /* reported as not configured */
        }
        return reply({
          mode: "live",
          configured: !!policy,
          policy,
          defaults: defaultPolicy,
          triggers,
          checks,
          evaluations,
          deployments,
          schedules,
          deliveries,
          audit,
          providers: { vercel: mapping ? { mapped: true, projectId: mapping.config.projectId ?? null, teamId: mapping.config.teamId ?? null, enabled: mapping.enabled } : { mapped: false } },
          readiness: { g04: "ENABLED", webhookSecretConfigured: webhookSecret, vercelTokenConfigured: await vercelToken().then(() => true, () => false), checkName: CHECK_NAME },
          remediation: { g03: "NOT_CONNECTED", note: "AI remediation and verified retest evidence are provided by G03; none is generated or implied here." },
          limits: { enforcementNote: "decision is a policy outcome; enforced is true only with provider evidence." },
        });
      }
      case "policy": {
        if (request.method === "GET") return reply({ policy: await st.getPolicy(scope), history: await st.policyHistory(scope), defaults: defaultPolicy });
        const v = await body();
        if (!v || typeof v !== "object" || Object.keys(v).some((k) => !["policy", "expectedRevision", "reason"].includes(k)) || !Number.isInteger(v.expectedRevision) || (v.expectedRevision as number) < 0 || typeof v.reason !== "string" || v.reason.length > 500) throw new G04Error("invalid_input");
        const policy = validatePolicy(v.policy);
        const rec = { workspaceId: a.grant.workspaceId, projectId: a.grant.projectId, repositoryId: a.repositoryId, repositoryName: a.repositoryName, installationId: a.installationId, installationState: "active" as const, ownerActor: a.grant.actorId, ownerUserId: a.userId, policy, policyDigest: "", revision: 0, updatedAt: "", updatedBy: a.grant.actorId };
        // Enabling automation requires the App to hold the permissions it will use, verified now, not assumed.
        if (policy.enabled) {
          const access = await host.api.verifyAccess(rec);
          if (!access.ok) throw new G04Error(access.reason === "permissions_missing" ? "invalid_input" : "not_found", 409);
        }
        const revision = await st.savePolicy(scope, { repositoryId: a.repositoryId, repositoryName: a.repositoryName, installationId: a.installationId, ownerActor: a.grant.actorId, ownerUserId: a.userId }, policy, v.expectedRevision as number, a.grant.actorId, v.reason);
        if (!policy.enabled) await st.disableSchedules(scope);
        await st.audit(scope, a.grant.actorId, "policy_saved", String(revision), { enabled: policy.enabled });
        return reply({ revision });
      }
      case "triggers": {
        if (request.method === "GET") return reply({ triggers: await st.listTriggers(scope, 50) });
        const v = await body();
        if (!v || Object.keys(v).some((k) => !["branch", "commit", "idempotencyKey"].includes(k)) || typeof v.branch !== "string" || typeof v.idempotencyKey !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(v.idempotencyKey) || (v.commit !== undefined && (typeof v.commit !== "string" || !/^[a-f0-9]{40}$/.test(v.commit)))) throw new G04Error("invalid_input");
        const r = await host.api.requestScan(scope, { branch: v.branch, commit: v.commit as string | undefined, idempotencyKey: "manual-" + v.idempotencyKey, actor: a.grant.actorId });
        return reply({ triggerId: r.trigger.id, created: r.created, status: r.trigger.status, commit: r.trigger.commit }, 202);
      }
      case "checks": {
        if (request.method === "GET") return reply({ checks: await st.listChecks(scope, 50) });
        const v = await body();
        if (!v || Object.keys(v).some((k) => k !== "commit") || typeof v.commit !== "string" || !/^[a-f0-9]{40}$/.test(v.commit)) throw new G04Error("invalid_input");
        return reply({ published: await host.api.retryCheck(scope, v.commit, a.grant.actorId) }, 202);
      }
      case "access": {
        const view = await host.api.accessView(scope);
        return reply(view ? { configured: true, ...view } : { configured: false });
      }
      case "mapping": {
        if (request.method === "GET") return reply({ vercel: await st.getMapping(scope) });
        const v = await body();
        if (!v || Object.keys(v).some((k) => !["projectId", "teamId"].includes(k)) || typeof v.projectId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(v.projectId) || (v.teamId !== undefined && (typeof v.teamId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(v.teamId)))) throw new G04Error("invalid_input");
        // Identity is proven against the provider BEFORE anything is stored; a project linked to another repository is refused.
        const link = await vercelProvider({ projectId: v.projectId, teamId: v.teamId as string | undefined, repositoryId: a.repositoryId }, () => vercelToken()).verifyConnection();
        await st.saveMapping(scope, "vercel", { projectId: v.projectId, ...(v.teamId ? { teamId: v.teamId } : {}), linkedRepositoryId: link.linkedRepositoryId, projectName: link.projectName }, a.grant.actorId);
        await st.audit(scope, a.grant.actorId, "provider_mapped", "vercel", { projectId: v.projectId });
        return reply({ mapped: true, linkedRepositoryId: link.linkedRepositoryId, projectName: link.projectName });
      }
      case "deployments": {
        if (request.method === "GET") return reply({ deployments: await st.listDeployments(scope, 50) });
        const v = await body();
        if (!v || Object.keys(v).some((k) => k !== "deploymentId") || (v.deploymentId !== undefined && (typeof v.deploymentId !== "string" || !/^[A-Za-z0-9_.-]{1,255}$/.test(v.deploymentId)))) throw new G04Error("invalid_input");
        return reply(await host.api.verifyDeployment(scope, v.deploymentId as string | undefined), 200);
      }
      case "gate": {
        // The ONLY provider write. It changes the owner's Vercel project (what holds production), so it needs an explicit typed confirmation.
        if (request.method !== "POST") throw new G04Error("invalid_input", 405);
        const v = await body();
        if (!v || Object.keys(v).some((k) => !["confirm", "blocks", "targets"].includes(k)) || v.confirm !== "REGISTER_VERCEL_DEPLOYMENT_CHECK" || !["deployment-alias", "deployment-promotion"].includes(String(v.blocks)) || !Array.isArray(v.targets) || v.targets.length !== 1 || v.targets[0] !== "production") throw new G04Error("invalid_input");
        const m = await st.getMapping(scope);
        if (!m?.enabled || typeof m.config.projectId !== "string") throw new G04Error("not_found", 404);
        const provider = vercelProvider({ projectId: m.config.projectId, teamId: typeof m.config.teamId === "string" ? m.config.teamId : undefined, repositoryId: a.repositoryId }, () => vercelToken());
        const gate = await provider.registerGate({ checkName: CHECK_NAME, blocks: v.blocks as "deployment-alias" | "deployment-promotion", targets: ["production"] });
        await st.audit(scope, a.grant.actorId, "deployment_gate_registered", gate.providerCheckId, { blocks: gate.blocks, targets: gate.targets, approvedBy: a.grant.actorId });
        return reply({ gate });
      }
      case "schedules": {
        if (request.method === "GET") return reply({ schedules: await st.listSchedules(scope) });
        const v = await body();
        if (!v || Object.keys(v).some((k) => !["id", "enabled", "cadence", "branch", "profile"].includes(k)) || typeof v.id !== "string" || !/^[a-z0-9-]{4,40}$/.test(v.id) || typeof v.enabled !== "boolean" || typeof v.branch !== "string" || !["quick", "standard", "full"].includes(String(v.profile))) throw new G04Error("invalid_input");
        const pol = await st.getPolicy(scope);
        if (!pol || (v.enabled && !triggerAllowed({ ...pol.policy, enabled: pol.policy.enabled }, "schedule", v.branch))) throw new G04Error("invalid_input", 422);
        const cadence = validateCadence(v.cadence);
        await st.saveSchedule(scope, { id: v.id, enabled: v.enabled, cadence, branch: v.branch, profile: v.profile as "quick" | "standard" | "full", nextRunAt: new Date(nextRun(cadence, now)), actor: a.grant.actorId });
        await st.audit(scope, a.grant.actorId, "schedule_saved", v.id, { enabled: v.enabled, cadence });
        return reply({ saved: true });
      }
    }
  } catch (error) {
    return failure(error);
  }
}
function failure(error: unknown) {
  if (error instanceof G04Disabled) return reply({ error: "g04_disabled" }, 503);
  if (error instanceof AuthError && error.code === "invalid_origin") return reply({ error: "invalid_origin" }, 403);
  if (error instanceof AuthError) return reply({ error: error.status === 403 || error.status === 404 ? "not_found" : error.code }, error.status === 403 || error.status === 404 ? 404 : error.status);
  if (error instanceof LiveGuardError) return reply({ error: error.code }, error.status);
  if (error instanceof GuardError) return reply({ error: "not_found" }, 404);
  if (error instanceof G04Error) return reply({ error: error.code }, error.status);
  if (error instanceof PolicyError || error instanceof ScheduleError) return reply({ error: error.code }, 422);
  if (error instanceof ProviderError) return reply({ error: "provider_" + error.kind }, error.kind === "not_configured" ? 409 : error.kind === "rate_limited" ? 429 : error.kind === "not_found" ? 404 : 502);
  if (error instanceof GhError) return reply({ error: "github_" + error.kind }, 502);
  console.warn("[WetScan Guard G04]", JSON.stringify({ reason: "g04_unavailable" }));
  return reply({ error: "g04_unavailable" }, 503);
}
