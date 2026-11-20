import { fingerprint } from "../../../platform/identity";
import type {
  G05AccountRole,
  G05CanvasTrustPlan,
  G05Category,
  G05HttpMethod,
  G05PlannedCase,
  G05Profile,
  G05Scope,
  G05TargetConfig,
  G05TargetEnvironment,
  G05TargetRecord,
  G05TestAccountView,
  G05TestPlan,
  G05TrustActor,
  G05TrustIntegrationStatus,
  G05TrustResource,
  G05TrustRule,
  G05WorkflowImport,
  G05WorkflowTransitionDef,
} from "./contracts";
import { validatePathAllowed } from "./egress";

export class G05ValidationError extends Error {
  constructor(
    public readonly code:
      | "invalid_target"
      | "invalid_plan"
      | "stale_plan"
      | "unconfirmed_plan"
      | "cross_project_plan_denied"
      | "invalid_workflow",
    message: string,
  ) {
    super(message);
  }
}

const VALID_METHODS: readonly G05HttpMethod[] = [
  "GET",
  "HEAD",
  "OPTIONS",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
];

const VALID_CATEGORIES: readonly G05Category[] = [
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

export function validateTargetInput(raw: unknown): {
  id: string;
  name: string;
  environment: G05TargetEnvironment;
  origin: string;
  serviceIdentity: string | null;
  owner: string;
  status: "draft" | "active" | "revoked";
  config: G05TargetConfig;
  expectedRevision: number;
  reason: string;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new G05ValidationError("invalid_target", "Target payload must be an object.");
  const v = raw as Record<string, unknown>;
  const id = typeof v.id === "string" ? v.id.trim() : "";
  if (!/^[a-z0-9-]{4,64}$/.test(id))
    throw new G05ValidationError("invalid_target", "Invalid target id.");
  const name = typeof v.name === "string" ? v.name.trim() : "";
  if (!name || name.length > 128)
    throw new G05ValidationError("invalid_target", "Target name is required.");
  if (v.environment !== "staging" && v.environment !== "local_synthetic")
    throw new G05ValidationError("invalid_target", "Unsupported target environment.");
  const origin = typeof v.origin === "string" ? v.origin.trim() : "";
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(origin);
  } catch {
    throw new G05ValidationError("invalid_target", "Invalid target origin URL.");
  }
  if (parsedUrl.origin !== origin || parsedUrl.username || parsedUrl.password)
    throw new G05ValidationError("invalid_target", "Origin must be exact scheme/host/port.");
  const serviceIdentity =
    v.serviceIdentity === null || v.serviceIdentity === undefined
      ? null
      : typeof v.serviceIdentity === "string" &&
          /^[A-Za-z0-9._:-]{4,128}$/.test(v.serviceIdentity.trim())
        ? v.serviceIdentity.trim()
        : (() => {
            throw new G05ValidationError("invalid_target", "Invalid serviceIdentity.");
          })();
  if (v.environment === "local_synthetic" && !serviceIdentity)
    throw new G05ValidationError(
      "invalid_target",
      "local_synthetic targets require a pinned serviceIdentity.",
    );
  const owner = typeof v.owner === "string" ? v.owner.trim() : "";
  if (!owner || owner.length > 128)
    throw new G05ValidationError("invalid_target", "Target owner is required.");
  const status = v.status ?? "active";
  if (status !== "draft" && status !== "active" && status !== "revoked")
    throw new G05ValidationError("invalid_target", "Invalid target status.");
  const expectedRevision =
    typeof v.expectedRevision === "number" &&
    Number.isInteger(v.expectedRevision) &&
    v.expectedRevision >= 0
      ? v.expectedRevision
      : 0;
  const reason =
    typeof v.reason === "string" && v.reason.trim().length > 0 && v.reason.length <= 500
      ? v.reason.trim()
      : "Target configuration update";

  const cfgRaw = v.config as Record<string, unknown> | undefined;
  if (!cfgRaw || typeof cfgRaw !== "object" || Array.isArray(cfgRaw))
    throw new G05ValidationError("invalid_target", "Target config is required.");

  const allowedRoutes = Array.isArray(cfgRaw.allowedRoutes)
    ? cfgRaw.allowedRoutes.filter((r): r is string => typeof r === "string")
    : [];
  if (
    !allowedRoutes.length ||
    allowedRoutes.length > 50 ||
    allowedRoutes.some(
      (r) => !r.startsWith("/") || r.startsWith("//") || /\.\.|\s|#|\?/.test(r),
    )
  )
    throw new G05ValidationError("invalid_target", "Valid allowedRoutes are required.");

  const allowedMethods = Array.isArray(cfgRaw.allowedMethods)
    ? (cfgRaw.allowedMethods.filter((m): m is G05HttpMethod =>
        VALID_METHODS.includes(m as G05HttpMethod),
      ) as G05HttpMethod[])
    : [];
  if (!allowedMethods.length)
    throw new G05ValidationError("invalid_target", "At least one HTTP method is required.");

  const maxRequests = Number(cfgRaw.maxRequests);
  const maxConcurrency = Number(cfgRaw.maxConcurrency);
  const rateLimitRps = Number(cfgRaw.rateLimitRps);
  const maxResponseBytes = Number(cfgRaw.maxResponseBytes);
  const timeoutMs = Number(cfgRaw.timeoutMs);
  if (
    !Number.isInteger(maxRequests) ||
    maxRequests < 1 ||
    maxRequests > 500 ||
    !Number.isInteger(maxConcurrency) ||
    maxConcurrency < 1 ||
    maxConcurrency > 3 ||
    !Number.isFinite(rateLimitRps) ||
    rateLimitRps <= 0 ||
    rateLimitRps > 20 ||
    !Number.isInteger(maxResponseBytes) ||
    maxResponseBytes < 1024 ||
    maxResponseBytes > 2_097_152 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 200 ||
    timeoutMs > 60000
  )
    throw new G05ValidationError("invalid_target", "Target bounds out of permitted limits.");

  const approvedCategories = Array.isArray(cfgRaw.approvedCategories)
    ? (cfgRaw.approvedCategories.filter((c): c is G05Category =>
        VALID_CATEGORIES.includes(c as G05Category),
      ) as G05Category[])
    : [];
  if (!approvedCategories.length)
    throw new G05ValidationError("invalid_target", "At least one approved category is required.");

  const allowedSyntheticResources = Array.isArray(cfgRaw.allowedSyntheticResources)
    ? cfgRaw.allowedSyntheticResources
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .slice(0, 25)
    : ["syn-ord-*"];

  const cleanupPolicy =
    cfgRaw.cleanupPolicy === "reset_endpoint_and_revoke_sessions"
      ? "reset_endpoint_and_revoke_sessions"
      : "delete_created_and_revoke_sessions";

  const cleanupEndpoint =
    typeof cfgRaw.cleanupEndpoint === "string" && cfgRaw.cleanupEndpoint.startsWith("/")
      ? cfgRaw.cleanupEndpoint
      : undefined;

  return {
    id,
    name,
    environment: v.environment,
    origin,
    serviceIdentity,
    owner,
    status,
    expectedRevision,
    reason,
    config: {
      allowedRoutes,
      allowedMethods: [...new Set(allowedMethods)],
      maxRequests,
      maxConcurrency,
      rateLimitRps,
      maxResponseBytes,
      timeoutMs,
      approvedCategories: [...new Set(approvedCategories)],
      allowedSyntheticResources,
      cleanupPolicy,
      ...(cleanupEndpoint ? { cleanupEndpoint } : {}),
    },
  };
}

function mapActorLabelToRole(label: string): G05AccountRole {
  const lower = label.toLowerCase();
  if (lower.includes("anon")) return "anonymous";
  if (lower.includes("admin") || lower.includes("priv") || lower.includes("staff") || lower.includes("reviewer"))
    return "privileged";
  if (lower.includes("b") || lower.includes("other") || lower.includes("user_b"))
    return "user_b";
  if (lower.includes("user") || lower.includes("customer") || lower.includes("student") || lower.includes("a"))
    return "user_a";
  return "custom";
}

function projectRefMatches(projectRef: string, scope: G05Scope): boolean {
  if (!projectRef) return false;
  if (projectRef === scope.projectId) return true;
  if (projectRef === `${scope.workspaceId}/${scope.projectId}`) return true;
  // Canvas live format: github-user-<id>/github-<repoId>
  if (projectRef.endsWith(`/${scope.projectId}`) && scope.workspaceId.startsWith(projectRef.split("/")[0] + ":"))
    return true;
  return false;
}

/**
 * GRD-014: Consumes confirmed Canvas Trust plans (from Canvas trustTestPlan / TrustModel exports or API snapshots).
 * Rejects cross-project reuse, unconfirmed plans, stale graph revisions, missing mappings, or expired grants.
 */
export function evaluateCanvasTrustPlan(
  raw: unknown,
  scope: G05Scope,
  options: {
    expectedGraphRevision?: string;
    actorId: string;
    now?: number;
  },
): Omit<G05CanvasTrustPlan, "workspaceId" | "projectId" | "createdAt"> {
  const now = options.now ?? Date.now();
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new G05ValidationError("invalid_plan", "Trust plan payload must be an object.");
  const v = raw as Record<string, unknown>;
  const errors: string[] = [];
  let status: G05TrustIntegrationStatus = "CONNECTED";

  const projectRef = typeof v.projectRef === "string" ? v.projectRef : "";
  if (v.workspaceId !== undefined && v.workspaceId !== scope.workspaceId) {
    status = "NOT_AUTHORIZED";
    errors.push("Workspace mismatch: cross-workspace Trust plan reuse denied.");
  }
  if (!projectRefMatches(projectRef, scope)) {
    status = "NOT_AUTHORIZED";
    errors.push("Project mismatch: Trust plan does not belong to this project.");
  }

  const canvasGraphRevision =
    typeof v.canvasGraphRevision === "string" && v.canvasGraphRevision.trim()
      ? v.canvasGraphRevision.trim()
      : typeof v.graphRevision === "string" && v.graphRevision.trim()
        ? v.graphRevision.trim()
        : "";
  if (!canvasGraphRevision) {
    status = "INVALID_PLAN";
    errors.push("canvasGraphRevision is required.");
  } else if (
    options.expectedGraphRevision &&
    canvasGraphRevision !== options.expectedGraphRevision
  ) {
    if (status === "CONNECTED") status = "STALE";
    errors.push(
      `Stale Canvas graph revision: plan built for ${canvasGraphRevision}, active revision is ${options.expectedGraphRevision}.`,
    );
  }

  const planVersion =
    typeof v.planVersion === "number" && Number.isInteger(v.planVersion) && v.planVersion > 0
      ? v.planVersion
      : typeof v.schemaVersion === "number" && Number.isInteger(v.schemaVersion)
        ? v.schemaVersion
        : 1;
  const targetCommit =
    typeof v.targetCommit === "string" && /^[a-f0-9]{40}$/.test(v.targetCommit)
      ? v.targetCommit
      : null;

  const expiresAt =
    typeof v.expiresAt === "string" && Number.isFinite(Date.parse(v.expiresAt))
      ? new Date(Date.parse(v.expiresAt)).toISOString()
      : null;
  if (expiresAt && Date.parse(expiresAt) <= now) {
    if (status === "CONNECTED") status = "STALE";
    errors.push("Trust plan authorization has expired.");
  }

  // Extract rules from either Canvas trustTestPlan (`cases`) or raw `policies`
  const rawCases = Array.isArray(v.cases)
    ? v.cases
    : Array.isArray(v.policies)
      ? v.policies
      : [];
  const rawActors = Array.isArray(v.roles) ? v.roles : [];
  const rawResources = Array.isArray(v.resources) ? v.resources : [];
  const boundaryNodeIds = Array.isArray(v.boundaries)
    ? v.boundaries.filter((b): b is string => typeof b === "string")
    : Array.isArray(v.boundaryNodeIds)
      ? v.boundaryNodeIds.filter((b): b is string => typeof b === "string")
      : [];

  const actors: G05TrustActor[] = rawActors
    .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
    .map((r) => ({
      id: String(r.id ?? ""),
      label: String(r.label ?? r.id ?? ""),
      mappedRole: mapActorLabelToRole(String(r.label ?? r.id ?? "")),
    }))
    .filter((a) => a.id.length > 0);

  const resources: G05TrustResource[] = rawResources
    .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
    .map((r) => ({
      id: String(r.id ?? ""),
      label: String(r.label ?? r.id ?? ""),
      ...(typeof r.nodeId === "string" ? { nodeId: r.nodeId } : {}),
      ...(typeof r.routePrefix === "string" ? { routePrefix: r.routePrefix } : {}),
    }))
    .filter((r) => r.id.length > 0);

  const rules: G05TrustRule[] = [];
  for (const item of rawCases) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const roleId = String(c.roleId ?? c.actor ?? "");
    const resourceId = String(c.resourceId ?? c.resource ?? "");
    const act = String(c.action ?? "");
    if (!roleId || !resourceId || !act) {
      status = "INVALID_PLAN";
      errors.push("Policy rule missing required role, resource, or action.");
      continue;
    }
    if (!actors.some((a) => a.id === roleId)) {
      actors.push({
        id: roleId,
        label: String(c.actor ?? roleId),
        mappedRole: mapActorLabelToRole(String(c.actor ?? roleId)),
      });
    }
    if (!resources.some((r) => r.id === resourceId)) {
      resources.push({
        id: resourceId,
        label: String(c.resource ?? resourceId),
      });
    }
    const endpoint =
      typeof c.endpoint === "string" && c.endpoint.startsWith("/") ? c.endpoint : null;
    const method = VALID_METHODS.includes(c.method as G05HttpMethod)
      ? (c.method as G05HttpMethod)
      : null;
    rules.push({
      id: String(c.id ?? fingerprint([roleId, resourceId, act]).slice(0, 16)),
      roleId,
      resourceId,
      action: act,
      ownership: String(c.ownership ?? "explicit"),
      allowed: Boolean(c.allowed),
      confirmed: Boolean(c.confirmed ?? c.ready),
      ...(endpoint ? { endpoint } : {}),
      ...(method ? { method } : {}),
    });
  }

  if (!rules.length) {
    if (status === "CONNECTED") status = "INVALID_PLAN";
    errors.push("Trust plan contains no authorization rules; visual connections are never inferred.");
  }

  const confirmedBy =
    typeof v.confirmedBy === "string" && v.confirmedBy.trim()
      ? v.confirmedBy.trim()
      : "";
  const confirmedAt =
    typeof v.confirmedAt === "string" && Number.isFinite(Date.parse(v.confirmedAt))
      ? new Date(Date.parse(v.confirmedAt)).toISOString()
      : null;
  const planConfirmed =
    v.confirmed === true &&
    Boolean(confirmedBy) &&
    rules.length > 0 &&
    rules.every((r) => r.confirmed);

  if (!planConfirmed) {
    if (status === "CONNECTED") status = "NOT_AUTHORIZED";
    errors.push("Trust plan must be explicitly confirmed by an authorized actor across all rules.");
  }

  const sourcePlanDigest = fingerprint({
    projectRef,
    canvasGraphRevision,
    planVersion,
    targetCommit,
    actors,
    resources,
    rules,
    confirmedBy,
  });

  return {
    id: fingerprint({ scope, sourcePlanDigest, planVersion, canvasGraphRevision }),
    canvasGraphRevision,
    planVersion,
    targetCommit,
    sourcePlanDigest,
    integrationStatus: errors.length ? status : "CONNECTED",
    confirmed: planConfirmed,
    confirmedBy,
    confirmedAt,
    expiresAt,
    plan: {
      actors,
      resources,
      rules,
      boundaryNodeIds,
    },
    validationErrors: errors,
    createdBy: options.actorId,
  };
}

function resolveWorkflowEndpointPlaceholder(
  rawEndpoint: string,
  actionId: string,
): { endpoint: string; method: G05HttpMethod } {
  if (rawEndpoint.startsWith("/")) {
    return {
      endpoint: rawEndpoint,
      method: actionId === "read" ? "GET" : "POST",
    };
  }
  const lower = `${rawEndpoint} ${actionId}`.toLowerCase();
  if (lower.includes("approve"))
    return { endpoint: "/api/orders/ord-seed-a/approve", method: "POST" };
  if (lower.includes("lock"))
    return { endpoint: "/api/orders/ord-seed-a/lock", method: "POST" };
  if (lower.includes("submit") || lower.includes("replay"))
    return { endpoint: "/api/orders/ord-seed-a/submit", method: "POST" };
  if (lower.includes("update") || lower.includes("edit"))
    return { endpoint: "/api/orders/ord-seed-a/edit", method: "POST" };
  return { endpoint: "/api/orders/ord-seed-a", method: "PATCH" };
}

/**
 * GRD-015: Imports and validates Canvas Workflow definitions, checking state graph integrity,
 * illegal cycles among non-idempotent transitions, endpoint mappings, and distinguishing business behavior from HTTP codes.
 */
export function importCanvasWorkflow(
  raw: unknown,
  scope: G05Scope,
  options: {
    target?: G05TargetRecord;
    trustPlanId?: string | null;
    actorId: string;
  },
): Omit<G05WorkflowImport, "workspaceId" | "projectId" | "createdAt"> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new G05ValidationError("invalid_workflow", "Workflow payload must be an object.");
  const v = raw as Record<string, unknown>;
  const errors: string[] = [];

  const projectRef = typeof v.projectRef === "string" ? v.projectRef : "";
  if (v.workspaceId !== undefined && v.workspaceId !== scope.workspaceId)
    errors.push("Workspace mismatch on imported workflow.");
  if (projectRef && !projectRefMatches(projectRef, scope))
    errors.push("Project mismatch on imported workflow.");

  const workflowId =
    typeof v.workflowId === "string" && v.workflowId.trim()
      ? v.workflowId.trim()
      : typeof v.id === "string" && v.id.trim()
        ? v.id.trim()
        : "";
  const workflowName =
    typeof v.name === "string" && v.name.trim()
      ? v.name.trim()
      : typeof v.workflowName === "string" && v.workflowName.trim()
        ? v.workflowName.trim()
        : "Imported Canvas Workflow";
  const workflowVersion =
    typeof v.workflowVersion === "number" && Number.isInteger(v.workflowVersion) && v.workflowVersion > 0
      ? v.workflowVersion
      : typeof v.schemaVersion === "number" && Number.isInteger(v.schemaVersion) && v.schemaVersion > 0
        ? v.schemaVersion
        : 1;
  const canvasGraphRevision =
    typeof v.canvasGraphRevision === "string" && v.canvasGraphRevision.trim()
      ? v.canvasGraphRevision.trim()
      : "canvas-rev-1";

  if (!workflowId) errors.push("workflowId is required.");

  const rawStates = Array.isArray(v.states) ? v.states : [];
  const states: { id: string; label: string }[] = [];
  const stateIds = new Set<string>();
  for (const s of rawStates) {
    if (!s || typeof s !== "object") {
      errors.push("Malformed workflow state entry.");
      continue;
    }
    const so = s as Record<string, unknown>;
    const sid = typeof so.id === "string" ? so.id.trim() : "";
    const label = typeof so.label === "string" ? so.label.trim() : sid;
    if (!sid || stateIds.has(sid)) {
      errors.push(`Invalid or duplicate state id: ${sid || "empty"}`);
      continue;
    }
    stateIds.add(sid);
    states.push({ id: sid, label });
  }
  if (states.length < 2) errors.push("Workflow must define at least 2 distinct states.");

  const rawTransitions = Array.isArray(v.cases)
    ? v.cases
    : Array.isArray(v.transitions)
      ? v.transitions
      : [];
  const transitions: G05WorkflowTransitionDef[] = [];
  const transitionIds = new Set<string>();
  const adj = new Map<string, string[]>();

  for (const t of rawTransitions) {
    if (!t || typeof t !== "object") {
      errors.push("Malformed workflow transition entry.");
      continue;
    }
    const to = t as Record<string, unknown>;
    const tid = typeof to.id === "string" ? to.id.trim() : "";
    const from = typeof to.from === "string" ? to.from.trim() : "";
    const targetState = typeof to.to === "string" ? to.to.trim() : "";
    const actor = typeof to.actor === "string" ? to.actor.trim() : "";
    const forbidden = Boolean(to.forbidden);
    const expectedHttp = Number(to.expectedHttp);
    if (!tid || transitionIds.has(tid)) {
      errors.push(`Invalid or duplicate transition id: ${tid || "empty"}`);
      continue;
    }
    transitionIds.add(tid);
    if (!stateIds.has(from) || !stateIds.has(targetState)) {
      errors.push(`Transition ${tid} references missing state (${from} -> ${targetState}).`);
      continue;
    }
    if (!actor) {
      errors.push(`Transition ${tid} is missing an actor.`);
      continue;
    }
    if (!Number.isInteger(expectedHttp) || expectedHttp < 100 || expectedHttp > 599) {
      errors.push(`Transition ${tid} has invalid expectedHttp.`);
      continue;
    }
    if (from === targetState && !to.idempotent && !to.replaySensitive) {
      errors.push(`Transition ${tid} defines an ambiguous self-loop on state ${from}.`);
      continue;
    }
    const resolved = resolveWorkflowEndpointPlaceholder(
      typeof to.endpoint === "string" ? to.endpoint : "",
      tid,
    );
    const method = VALID_METHODS.includes(to.method as G05HttpMethod)
      ? (to.method as G05HttpMethod)
      : resolved.method;

    transitions.push({
      id: tid,
      from,
      to: targetState,
      actor,
      actorRole: mapActorLabelToRole(actor),
      forbidden,
      precondition: String(to.precondition ?? ""),
      endpoint: resolved.endpoint,
      method,
      expectedHttp,
      assertion: String(to.assertion ?? ""),
      hypothesis: String(to.hypothesis ?? ""),
      replaySensitive: Boolean(to.replaySensitive),
      idempotent: Boolean(to.idempotent),
    });

    if (!forbidden) {
      const list = adj.get(from) ?? [];
      list.push(targetState);
      adj.set(from, list);
    }
  }

  if (!transitions.length) errors.push("Workflow must define at least one valid transition.");

  // Detect cycles among allowed forward progression transitions
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasCycle = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of adj.get(node) ?? []) {
      if (hasCycle(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  for (const s of stateIds) {
    if (hasCycle(s)) {
      errors.push("Allowed workflow progression contains a cycle; forward state transitions must be acyclic.");
      break;
    }
  }

  // Detect conflicting transition rules for the same (from, to, actorRole)
  const seenKeys = new Map<string, boolean>();
  for (const t of transitions) {
    const key = `${t.from}->${t.to}:${t.actorRole}`;
    const prev = seenKeys.get(key);
    if (prev !== undefined && prev !== t.forbidden) {
      errors.push(`Ambiguous conflicting transitions for ${key}.`);
    }
    seenKeys.set(key, t.forbidden);
  }

  const endpointMappings = transitions.map((t) => {
    let mapped = true;
    if (options.target) {
      try {
        validatePathAllowed(t.endpoint, options.target.config.allowedRoutes);
        if (!options.target.config.allowedMethods.includes(t.method)) mapped = false;
      } catch {
        mapped = false;
      }
    }
    return {
      transitionId: t.id,
      endpoint: t.endpoint,
      method: t.method,
      mapped,
    };
  });

  const invariants = Array.isArray(v.invariants)
    ? v.invariants.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  const protectedFields = Array.isArray(v.protectedFields)
    ? v.protectedFields.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : ["status", "amount"];
  const replayExpectation =
    typeof v.replayExpectation === "string" && v.replayExpectation.trim()
      ? v.replayExpectation.trim()
      : "One-time / idempotent execution enforced (409 on replay)";
  const cleanupStrategy =
    typeof v.cleanupStrategy === "string" && v.cleanupStrategy.trim()
      ? v.cleanupStrategy.trim()
      : "Delete created synthetic resources and verify absence";

  const sourceDigest = fingerprint({
    workflowId,
    workflowVersion,
    canvasGraphRevision,
    states,
    transitions,
    invariants,
    protectedFields,
  });

  return {
    id: fingerprint({ scope, sourceDigest, workflowId, workflowVersion }),
    workflowId: workflowId || "invalid",
    workflowName,
    workflowVersion,
    canvasGraphRevision,
    sourceDigest,
    validationStatus: errors.length ? "rejected" : "valid",
    validationErrors: errors,
    definition: {
      states,
      transitions,
      invariants,
      protectedFields,
      replayExpectation,
      cleanupStrategy,
    },
    endpointMappings,
    trustPlanId: options.trustPlanId ?? null,
    createdBy: options.actorId,
  };
}

export function buildG05TestPlan(input: {
  scope: G05Scope;
  target: G05TargetRecord;
  profile: G05Profile;
  accounts: G05TestAccountView[];
  trustPlan: G05CanvasTrustPlan | null;
  workflowImport: G05WorkflowImport | null;
  actorId: string;
}): Omit<G05TestPlan, "workspaceId" | "projectId" | "createdAt"> {
  const { target, profile, accounts, trustPlan, workflowImport } = input;
  const approved = new Set(target.config.approvedCategories);
  const cases: G05PlannedCase[] = [];

  const wantDast = profile === "dast_baseline" || profile === "full_g05";
  const wantAuth = profile === "auth_matrix" || profile === "full_g05";
  const wantIntegrity = profile === "integrity_suite" || profile === "full_g05";

  const hasRole = (role: G05AccountRole) =>
    accounts.some(
      (a) =>
        a.targetId === target.id &&
        a.role === role &&
        ["configured", "active"].includes(a.status) &&
        Date.parse(a.expiresAt) > Date.now(),
    );

  if (wantDast) {
    if (approved.has("dast_header")) {
      cases.push({
        caseId: "dast-headers-baseline",
        category: "dast_header",
        invariantFamily: null,
        title: "Security response headers evaluation (nosniff, X-Frame-Options, CSP, Cache-Control)",
        actorRole: "anonymous",
        method: "GET",
        path: target.config.allowedRoutes[0] ?? "/healthz",
        expectedStatus: [200],
        expectedBehavior: "Target emits strict hardening headers and omits server secrets.",
        stateChanging: false,
        idempotencyRequired: false,
        cleanupAction: "none",
        sourceRef: "target:" + target.id,
      });
    }
    if (approved.has("dast_tls")) {
      cases.push({
        caseId: "dast-tls-check",
        category: "dast_tls",
        invariantFamily: null,
        title: "TLS transport verification",
        actorRole: "anonymous",
        method: "HEAD",
        path: target.config.allowedRoutes[0] ?? "/healthz",
        expectedStatus: [200, 204, 405],
        expectedBehavior:
          target.environment === "staging"
            ? "Valid TLS 1.2+ handshake with trusted certificate."
            : "Local synthetic HTTP target marks TLS check not_applicable without faking PASS.",
        stateChanging: false,
        idempotencyRequired: false,
        cleanupAction: "none",
        sourceRef: "target:" + target.id,
      });
    }
    if (approved.has("dast_cors")) {
      cases.push({
        caseId: "dast-cors-untrusted-origin",
        category: "dast_cors",
        invariantFamily: null,
        title: "CORS origin reflection and credentialed wildcard denial",
        actorRole: "anonymous",
        method: "OPTIONS",
        path: "/api/orders",
        expectedStatus: [200, 204, 401, 403, 404],
        expectedBehavior:
          "Untrusted Origin is not echoed with Access-Control-Allow-Credentials: true.",
        stateChanging: false,
        idempotencyRequired: false,
        cleanupAction: "none",
        sourceRef: "target:" + target.id,
      });
    }
    if (approved.has("dast_auth")) {
      cases.push({
        caseId: "dast-unauth-protected-route",
        category: "dast_auth",
        invariantFamily: null,
        title: "Protected endpoint rejects missing authentication",
        actorRole: "anonymous",
        method: "GET",
        path: "/api/orders",
        expectedStatus: [401, 403],
        expectedBehavior: "Unauthenticated GET /api/orders returns 401/403.",
        stateChanging: false,
        idempotencyRequired: false,
        cleanupAction: "none",
        sourceRef: "target:" + target.id,
      });
      cases.push({
        caseId: "dast-public-endpoint-semantics",
        category: "dast_auth",
        invariantFamily: null,
        title: "Declared public endpoint returns expected 200 without false vulnerability",
        actorRole: "anonymous",
        method: "GET",
        path: "/api/public/catalog",
        expectedStatus: [200],
        expectedBehavior: "Public catalog returns 200 per target policy.",
        stateChanging: false,
        idempotencyRequired: false,
        cleanupAction: "none",
        sourceRef: "target:" + target.id,
      });
    }
    if (approved.has("dast_response")) {
      cases.push({
        caseId: "dast-redirect-scope-boundary",
        category: "dast_response",
        invariantFamily: null,
        title: "Out-of-scope and metadata redirect handling probe",
        actorRole: "anonymous",
        method: "GET",
        path: "/api/redirect-probe",
        expectedStatus: [200],
        expectedBehavior: "No unvalidated redirect to private/metadata or external origin.",
        stateChanging: false,
        idempotencyRequired: false,
        cleanupAction: "none",
        sourceRef: "target:" + target.id,
      });
    }
  }

  if (wantAuth && (approved.has("auth_matrix") || approved.has("dast_session") || approved.has("dast_authz"))) {
    if (hasRole("user_a")) {
      if (approved.has("dast_session")) {
        cases.push({
          caseId: "auth-session-expiry-and-revocation",
          category: "dast_session",
          invariantFamily: null,
          title: "Synthetic session creation, revocation (logout), and expired session denial",
          actorRole: "user_a",
          method: "POST",
          path: "/api/auth/logout",
          expectedStatus: [401],
          expectedBehavior: "Revoked and expired synthetic tokens are rejected with 401.",
          stateChanging: false,
          idempotencyRequired: false,
          cleanupAction: "revoke_session",
          sourceRef: "account:user_a",
        });
      }
      if (approved.has("auth_matrix") || approved.has("dast_authz")) {
        cases.push({
          caseId: "auth-matrix-user-denied-admin",
          category: "auth_matrix",
          invariantFamily: null,
          title: "Ordinary synthetic user_a denied privileged admin endpoint",
          actorRole: "user_a",
          method: "GET",
          path: "/api/admin/audit-summary",
          expectedStatus: [403],
          expectedBehavior: "Ordinary role receives 403 on admin endpoint.",
          stateChanging: false,
          idempotencyRequired: false,
          cleanupAction: "revoke_session",
          sourceRef: "account:user_a",
        });
      }
    }
    if (hasRole("privileged") && (approved.has("auth_matrix") || approved.has("dast_authz"))) {
      cases.push({
        caseId: "auth-matrix-privileged-allowed-admin",
        category: "auth_matrix",
        invariantFamily: null,
        title: "Privileged synthetic role allowed admin audit summary (positive control)",
        actorRole: "privileged",
        method: "GET",
        path: "/api/admin/audit-summary",
        expectedStatus: [200],
        expectedBehavior: "Privileged role receives 200 on admin endpoint.",
        stateChanging: false,
        idempotencyRequired: false,
        cleanupAction: "revoke_session",
        sourceRef: "account:privileged",
      });
    }

    // Add rules from confirmed Canvas Trust Plan
    if (trustPlan && trustPlan.confirmed && trustPlan.integrationStatus === "CONNECTED") {
      for (const rule of trustPlan.plan.rules.slice(0, 12)) {
        const actorObj = trustPlan.plan.actors.find((a) => a.id === rule.roleId);
        const resObj = trustPlan.plan.resources.find((r) => r.id === rule.resourceId);
        const role = actorObj?.mappedRole ?? "user_a";
        const semantic = `${rule.action} ${resObj?.label ?? ""}`.toLowerCase();
        const endpoint =
          rule.endpoint ??
          resObj?.routePrefix ??
          (/admin|audit/.test(semantic)
            ? "/api/admin/audit-summary"
            : /catalog|public/.test(semantic)
              ? "/api/public/catalog"
              : "/api/orders/ord-seed-a");
        const method = rule.method ?? "GET";
        cases.push({
          caseId: `trust-rule-${rule.id.slice(0, 24)}`,
          category: "auth_matrix",
          invariantFamily: null,
          title: `Canvas Trust rule (${actorObj?.label ?? rule.roleId} ${rule.action}: ${rule.allowed ? "allow" : "deny"})`,
          actorRole: role,
          method,
          path: endpoint,
          expectedStatus: rule.allowed ? [200] : [401, 403],
          expectedBehavior: `${rule.allowed ? "Allow" : "Deny"} (${rule.ownership})`,
          stateChanging: false,
          idempotencyRequired: false,
          cleanupAction: "revoke_session",
          sourceRef: `trust_plan:${trustPlan.id.slice(0, 12)}`,
        });
      }
    }
  }

  if (wantIntegrity) {
    const workflowRef = workflowImport?.validationStatus === "valid"
      ? `workflow:${workflowImport.workflowId}@v${workflowImport.workflowVersion}`
      : "integrity-suite:v1";

    if (approved.has("integrity_ownership")) {
      cases.push({
        caseId: "invariant-ownership",
        category: "integrity_ownership",
        invariantFamily: "ownership",
        title: "Ownership invariant: synthetic User B cannot read synthetic User A resource",
        actorRole: "user_b",
        method: "GET",
        path: "/api/orders",
        expectedStatus: [403],
        expectedBehavior: "Owner User A reads 200; independent User B denied 403.",
        stateChanging: true,
        idempotencyRequired: false,
        cleanupAction: "delete_order",
        sourceRef: workflowRef,
      });
    }
    if (approved.has("integrity_workflow_bypass")) {
      cases.push({
        caseId: "invariant-workflow-bypass",
        category: "integrity_workflow_bypass",
        invariantFamily: "workflow_bypass",
        title: "Workflow bypass invariant: cannot lock draft order before approval prerequisite",
        actorRole: "privileged",
        method: "POST",
        path: "/api/orders",
        expectedStatus: [409],
        expectedBehavior: "Direct draft->lock rejected 409 and state stays draft; approve->lock succeeds.",
        stateChanging: true,
        idempotencyRequired: false,
        cleanupAction: "delete_order",
        sourceRef: workflowRef,
      });
    }
    if (approved.has("integrity_state_transition")) {
      cases.push({
        caseId: "invariant-state-transition",
        category: "integrity_state_transition",
        invariantFamily: "state_transition",
        title: "State transition invariant: locked synthetic order refuses modification",
        actorRole: "user_a",
        method: "POST",
        path: "/api/orders",
        expectedStatus: [409, 403],
        expectedBehavior: "Edit after lock rejected and protected fields remain unchanged in persisted state.",
        stateChanging: true,
        idempotencyRequired: false,
        cleanupAction: "delete_order",
        sourceRef: workflowRef,
      });
    }
    if (approved.has("integrity_replay")) {
      cases.push({
        caseId: "invariant-replay",
        category: "integrity_replay",
        invariantFamily: "replay",
        title: "Replay invariant: duplicate submission of one-time synthetic order rejected",
        actorRole: "user_a",
        method: "POST",
        path: "/api/orders",
        expectedStatus: [409],
        expectedBehavior: "First submit succeeds (submittedCount=1); replay returns 409 and submittedCount remains 1.",
        stateChanging: true,
        idempotencyRequired: true,
        cleanupAction: "delete_order",
        sourceRef: workflowRef,
      });
    }
    if (approved.has("integrity_unauthorized_modification")) {
      cases.push({
        caseId: "invariant-unauthorized-modification",
        category: "integrity_unauthorized_modification",
        invariantFamily: "unauthorized_modification",
        title: "Unauthorized modification invariant: User B cannot alter User A order (verifies persisted pre/post state)",
        actorRole: "user_b",
        method: "PATCH",
        path: "/api/orders",
        expectedStatus: [403],
        expectedBehavior: "HTTP 403 AND persisted amount/note/revision unchanged between pre-state and post-state.",
        stateChanging: true,
        idempotencyRequired: false,
        cleanupAction: "delete_order",
        sourceRef: workflowRef,
      });
    }
  }

  const categories = [...new Set(cases.map((c) => c.category))];
  const planDigest = fingerprint({
    targetId: target.id,
    targetRevision: target.revision,
    profile,
    trustPlanId: trustPlan?.id ?? null,
    workflowImportId: workflowImport?.id ?? null,
    cases,
  });

  return {
    id: fingerprint({ scope: input.scope, planDigest }),
    version: 1,
    targetId: target.id,
    targetRevision: target.revision,
    trustPlanId: trustPlan?.id ?? null,
    workflowImportId: workflowImport?.id ?? null,
    profile,
    categories,
    cases,
    planDigest,
    createdBy: input.actorId,
  };
}
