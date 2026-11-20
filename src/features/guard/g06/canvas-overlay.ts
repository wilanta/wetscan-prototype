import type { ArchitectureGraph } from "@/features/canvas/types";
import type {
  CanvasOverlay,
  CanvasPort,
  Finding,
  Grant,
  IntegrationResult,
  InvariantPlan,
  ScanJob,
  Scope,
} from "../contracts";
import type { G05Finding, G05Run } from "../g05/contracts";
import type {
  G06CanvasCoverage,
  G06CanvasOverlayPayload,
  G06MappedFinding,
  G06Severity,
  G06UnmatchedFinding,
  G06UnmatchedReason,
} from "./contracts";
import { redactG06Text } from "./redaction";
import type { G06PostgresStore } from "./store";

const SEVERITY_ORDER: Record<G06Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

const MANIFEST_FILES = new Set([
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "requirements.txt",
  "poetry.lock",
  "go.mod",
  "cargo.toml",
]);

const REDACTION_SAFE = new Set([
  "api",
  "v1",
  "v2",
  "auth",
  "login",
  "logout",
  "signin",
  "users",
  "orders",
  "health",
]);

export function normalizeRepoPath(raw: string | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  let cleaned = raw.trim().replaceAll("\\", "/");
  // Reject path traversal
  if (cleaned.split("/").includes("..")) return null;
  cleaned = cleaned.replace(/^(\.\/)+/, "").replace(/^\/+/, "");
  // Strip optional trailing :line or :line:col if someone appended line info
  cleaned = cleaned.replace(/:\d+(?::\d+)?$/, "");
  return cleaned.length > 0 ? cleaned : null;
}

const isDynamicSeg = (s: string) =>
  /^\[.*\]$/.test(s) || /^\{.*\}$/.test(s) || s.startsWith(":");

function routeSegments(route: string): string[] {
  const withoutOrigin = route.replace(/^https?:\/\/[^/]+/i, "");
  return withoutOrigin.split(/[?#]/, 1)[0].split("/").filter(Boolean);
}

export function matchEndpointToGraphRoute(
  endpoint: string,
  graphRoute: string,
): boolean {
  const e = routeSegments(endpoint);
  const g = routeSegments(graphRoute);
  if (g.some((s) => /^\[\[?\.\.\./.test(s))) return false;
  if (e.length !== g.length) return false;
  for (let i = 0; i < e.length; i++) {
    if (e[i] === ":redacted") {
      if (!isDynamicSeg(g[i]) && REDACTION_SAFE.has(g[i])) return false;
    } else if (isDynamicSeg(e[i])) {
      if (!isDynamicSeg(g[i])) return false;
    } else if (isDynamicSeg(g[i]) || e[i] !== g[i]) {
      return false;
    }
  }
  return true;
}

function toSeverity(raw: string): G06Severity {
  if (
    raw === "critical" ||
    raw === "high" ||
    raw === "medium" ||
    raw === "low" ||
    raw === "info"
  ) {
    return raw;
  }
  return "medium";
}

function g02Priority(status: Finding["status"]): "review" | "resolved" {
  return status === "verified_fixed" ||
    status === "false_positive" ||
    status === "risk_accepted"
    ? "resolved"
    : "review";
}

function g05Priority(status: G05Finding["status"]): "review" | "resolved" {
  return status === "verified_fixed" ||
    status === "false_positive" ||
    status === "risk_accepted"
    ? "resolved"
    : "review";
}

function emptyBySeverity(): Record<G06Severity, number> {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

const APP_OWNER_KINDS = new Set([
  "api",
  "frontend",
  "backend",
  "auth",
]);

function resolveG02Node(
  graph: ArchitectureGraph,
  finding: Finding,
):
  | { nodeId: string; basis: "evidence_source_path" | "manifest_package_root"; path: string }
  | { reason: G06UnmatchedReason; detail: string; path?: string } {
  const path = normalizeRepoPath(finding.location?.path);
  if (!path) {
    return {
      reason: "no_location",
      detail: finding.location?.artifactKind === "image"
        ? "Container image finding has no repository source file path."
        : "Finding carries no repository file path.",
    };
  }

  const candidateNodes = new Set<string>();
  const evidenceById = new Map(graph.evidence.map((e) => [e.id, e]));

  for (const node of graph.nodes) {
    for (const evId of node.evidenceIds) {
      const ev = evidenceById.get(evId);
      const evPath = normalizeRepoPath(ev?.sourcePath);
      if (evPath && evPath === path) {
        candidateNodes.add(node.id);
      }
    }
    const mPath = normalizeRepoPath(
      typeof node.metadata?.sourcePath === "string"
        ? node.metadata.sourcePath
        : undefined,
    );
    const ePath = normalizeRepoPath(
      typeof node.metadata?.entryPath === "string"
        ? node.metadata.entryPath
        : undefined,
    );
    if (mPath === path || ePath === path) {
      candidateNodes.add(node.id);
    }
  }

  if (candidateNodes.size === 1) {
    const [nodeId] = [...candidateNodes];
    return { nodeId, basis: "evidence_source_path", path };
  }
  if (candidateNodes.size > 1) {
    // Downstream infrastructure nodes (database/cache/queue/external_service) also cite importing route files;
    // prefer unique application-source component owners (api/frontend/backend/auth) when unambiguous.
    const appOwners = graph.nodes.filter(
      (n) => candidateNodes.has(n.id) && APP_OWNER_KINDS.has(n.kind),
    );
    if (appOwners.length === 1) {
      return { nodeId: appOwners[0].id, basis: "evidence_source_path", path };
    }
    return {
      reason: "ambiguous_nodes",
      detail: `Multiple Canvas nodes reference ${path} (${candidateNodes.size} candidates); left unmapped.`,
      path,
    };
  }

  // Deterministic manifest / root fallback ONLY for known lockfiles/manifests with an explicit single owner node
  const baseName = path.split("/").pop()?.toLowerCase() ?? "";
  if (MANIFEST_FILES.has(baseName)) {
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const manifestOwners = graph.nodes.filter((n) => {
      const explicitManifest = normalizeRepoPath(
        typeof n.metadata?.manifestPath === "string"
          ? n.metadata.manifestPath
          : undefined,
      );
      if (explicitManifest && explicitManifest === path) return true;
      const explicitDir = normalizeRepoPath(
        typeof n.metadata?.packageDir === "string"
          ? n.metadata.packageDir
          : undefined,
      );
      if (explicitDir && explicitDir === dir) return true;
      return dir === "" && n.kind === "repository" && n.status === "observed_in_source";
    });
    if (manifestOwners.length === 1) {
      return {
        nodeId: manifestOwners[0].id,
        basis: "manifest_package_root",
        path,
      };
    }
    if (manifestOwners.length > 1) {
      return {
        reason: "ambiguous_nodes",
        detail: `Multiple package/repository nodes match manifest ${path}; left unmapped.`,
        path,
      };
    }
  }

  return {
    reason: "no_matching_node",
    detail: `No observed Canvas component owns source path ${path} in revision ${graph.revision}.`,
    path,
  };
}

function resolveG05Node(
  graph: ArchitectureGraph,
  finding: G05Finding,
):
  | { nodeId: string; endpoint: string }
  | { reason: G06UnmatchedReason; detail: string; endpoint?: string } {
  const endpoint = finding.endpoint?.trim();
  if (!endpoint) {
    return {
      reason: "no_location",
      detail: "Dynamic/Integrity finding has no endpoint route template.",
    };
  }

  const apiNodes = graph.nodes.filter(
    (n) =>
      (n.kind === "api" || n.kind === "auth") &&
      n.status === "observed_in_source" &&
      typeof n.metadata?.route === "string",
  );
  const hits = apiNodes.filter((n) =>
    matchEndpointToGraphRoute(endpoint, String(n.metadata!.route)),
  );
  if (hits.length === 1) {
    return { nodeId: hits[0].id, endpoint };
  }
  if (hits.length > 1) {
    return {
      reason: "ambiguous_nodes",
      detail: `Endpoint ${endpoint} matched ${hits.length} API nodes; left unmapped to avoid false attribution.`,
      endpoint,
    };
  }
  return {
    reason: "no_matching_node",
    detail: `Endpoint ${endpoint} has no observed source API node in Canvas revision ${graph.revision}.`,
    endpoint,
  };
}

export function buildGuardCanvasOverlay(input: {
  projectId: string;
  graph: ArchitectureGraph | null;
  g02Scan?: { id: string; status: string; updatedAt: string; job: ScanJob } | null;
  g05Runs?: G05Run[];
  g05Findings?: G05Finding[];
  now?: string;
}): G06CanvasOverlayPayload {
  const generatedAt = input.now ?? new Date().toISOString();
  const scan = input.g02Scan ?? null;
  const g02Commit = scan?.job.repository.commit ?? null;
  const latestG05Run = input.g05Runs?.[0] ?? null;
  const g05Findings = input.g05Findings ?? [];
  const staleReasons: string[] = [];

  if (!input.graph) {
    return {
      version: "guard.canvas.v1",
      projectId: input.projectId,
      commitSha: g02Commit,
      graphRevision: "unavailable",
      graphSourceRevision: null,
      scanId: scan?.id ?? null,
      g05RunId: latestG05Run?.id ?? null,
      coverageStatus: "unavailable",
      staleReasons: ["Canvas architecture graph is not cached yet for this repository."],
      mappedFindings: [],
      unmatchedFindings: [],
      summary: {
        totalEvaluated: 0,
        mappedCount: 0,
        unmatchedCount: 0,
        reviewCount: 0,
        bySeverity: emptyBySeverity(),
        byEngine: {},
      },
      generatedAt,
    };
  }

  const graph = input.graph;
  const graphCommit =
    graph.evidence
      .map((e) => e.sourceRevision?.trim())
      .find((rev) => rev && /^[a-f0-9]{40}$/.test(rev)) ??
    (/^[a-f0-9]{40}$/.test(graph.revision) ? graph.revision : null);

  if (!scan && !latestG05Run) {
    return {
      version: "guard.canvas.v1",
      projectId: input.projectId,
      commitSha: graphCommit,
      graphRevision: graph.revision,
      graphSourceRevision: graphCommit,
      scanId: null,
      g05RunId: null,
      coverageStatus: "not_scanned",
      staleReasons: [],
      mappedFindings: [],
      unmatchedFindings: [],
      summary: {
        totalEvaluated: 0,
        mappedCount: 0,
        unmatchedCount: 0,
        reviewCount: 0,
        bySeverity: emptyBySeverity(),
        byEngine: {},
      },
      generatedAt,
    };
  }

  const g02StaleMismatch =
    Boolean(scan && g02Commit && graphCommit && g02Commit !== graphCommit);
  if (g02StaleMismatch) {
    staleReasons.push(
      `Latest Guard scan commit (${g02Commit!.slice(0, 12)}) does not match cached Canvas graph commit (${graphCommit!.slice(0, 12)}). Re-analyze Canvas or scan current commit before attributing findings.`,
    );
  }
  const missingGraphCommit = Boolean(scan && !graphCommit);
  if (missingGraphCommit) {
    staleReasons.push(
      `Canvas graph revision ${graph.revision} has no pinned sourceRevision commit; Guard findings cannot be guaranteed aligned with graph nodes.`,
    );
  }

  const mapped: G06MappedFinding[] = [];
  const unmatched: G06UnmatchedFinding[] = [];
  const dedupeKeys = new Set<string>();

  for (const f of scan?.job.findings ?? []) {
    const href = `/app/projects/${encodeURIComponent(input.projectId)}/guard/findings`;
    const sev = toSeverity(f.severity);
    const engine = f.source.engine;
    const rawPath = normalizeRepoPath(f.location?.path) ?? undefined;

    if (g02StaleMismatch || missingGraphCommit) {
      unmatched.push({
        id: f.id,
        title: redactG06Text(f.title),
        severity: sev,
        engine,
        sourceLayer: "g02",
        status: f.status,
        path: rawPath,
        reason: g02StaleMismatch ? "stale_commit" : "no_graph_revision",
        detail: g02StaleMismatch
          ? `Commit mismatch: scan is at ${g02Commit?.slice(0, 12)}, graph is at ${graphCommit?.slice(0, 12)}.`
          : "Canvas graph lacks sourceRevision commit metadata.",
        scanId: scan!.id,
        commitSha: g02Commit ?? "unknown",
        href,
      });
      continue;
    }

    const res = resolveG02Node(graph, f);
    if ("reason" in res) {
      unmatched.push({
        id: f.id,
        title: redactG06Text(f.title),
        severity: sev,
        engine,
        sourceLayer: "g02",
        status: f.status,
        path: res.path,
        reason: res.reason,
        detail: res.detail,
        scanId: scan!.id,
        commitSha: g02Commit ?? "unknown",
        href,
      });
      continue;
    }

    const key = `g02:${engine}:${f.source.ruleId}:${res.path}:${f.location?.line ?? 0}:${res.nodeId}`;
    if (dedupeKeys.has(key)) continue;
    dedupeKeys.add(key);

    mapped.push({
      id: f.id,
      findingKey: key,
      nodeId: res.nodeId,
      title: redactG06Text(f.title),
      severity: sev,
      confidence: f.confidence,
      engine,
      sourceLayer: "g02",
      status: f.status,
      priority: g02Priority(f.status),
      basis: res.basis,
      path: res.path,
      line: f.location?.line,
      scanId: scan!.id,
      commitSha: g02Commit ?? graphCommit ?? "unknown",
      evidenceSummary: redactG06Text(
        f.evidence[0]?.summary ?? `${f.source.scanner} (${f.source.ruleId})`,
      ).slice(0, 200),
      href,
    });
  }

  for (const f of g05Findings) {
    const href = `/app/projects/${encodeURIComponent(input.projectId)}/guard/dast`;
    const sev = toSeverity(f.severity);
    const engine = f.engine;
    const commitSha = g02Commit ?? graphCommit ?? `target-r${latestG05Run?.targetRevision ?? 0}`;

    const res = resolveG05Node(graph, f);
    if ("reason" in res) {
      unmatched.push({
        id: f.id,
        title: redactG06Text(f.title),
        severity: sev,
        engine,
        sourceLayer: "g05",
        status: f.status,
        endpoint: res.endpoint,
        reason: res.reason,
        detail: res.detail,
        scanId: f.runId,
        commitSha,
        href,
      });
      continue;
    }

    const key = `g05:${engine}:${f.caseId}:${res.endpoint}:${res.nodeId}`;
    if (dedupeKeys.has(key)) continue;
    dedupeKeys.add(key);

    mapped.push({
      id: f.id,
      findingKey: key,
      nodeId: res.nodeId,
      title: redactG06Text(f.title),
      severity: sev,
      confidence: f.confidence,
      engine,
      sourceLayer: "g05",
      status: f.status,
      priority: g05Priority(f.status),
      basis: "api_route_exact",
      endpoint: res.endpoint,
      scanId: f.runId,
      commitSha,
      evidenceSummary: redactG06Text(f.summary).slice(0, 200),
      href,
    });
  }

  mapped.sort(
    (a, b) =>
      SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
      a.id.localeCompare(b.id),
  );

  const bySeverity = emptyBySeverity();
  const byEngine: Record<string, number> = {};
  let reviewCount = 0;
  for (const m of mapped) {
    bySeverity[m.severity] += 1;
    byEngine[m.engine] = (byEngine[m.engine] ?? 0) + 1;
    if (m.priority === "review") reviewCount += 1;
  }

  let coverageStatus: G06CanvasCoverage = "available";
  if (staleReasons.length > 0) {
    coverageStatus = "stale";
  } else if (
    unmatched.length > 0 ||
    scan?.status === "completed_partial" ||
    scan?.status === "failed" ||
    scan?.job.sourceCoverage?.status === "partial" ||
    scan?.job.sourceCoverage?.treeTruncated ||
    latestG05Run?.status === "completed_partial"
  ) {
    coverageStatus = "partial";
  }

  return {
    version: "guard.canvas.v1",
    projectId: input.projectId,
    commitSha: g02Commit ?? graphCommit,
    graphRevision: graph.revision,
    graphSourceRevision: graphCommit,
    scanId: scan?.id ?? null,
    g05RunId: latestG05Run?.id ?? null,
    coverageStatus,
    staleReasons,
    mappedFindings: mapped,
    unmatchedFindings: unmatched,
    summary: {
      totalEvaluated: mapped.length + unmatched.length,
      mappedCount: mapped.length,
      unmatchedCount: unmatched.length,
      reviewCount,
      bySeverity,
      byEngine,
    },
    generatedAt,
  };
}

export class G06CanvasAdapter implements CanvasPort {
  constructor(
    private readonly store: G06PostgresStore,
    private readonly actor = "guard-g06",
  ) {}

  async publish(
    grant: Grant,
    overlays: CanvasOverlay[],
  ): Promise<IntegrationResult<{ deliveryId: string }>> {
    if (!overlays.length) {
      return {
        status: "available",
        value: { deliveryId: "ovl_empty" },
      };
    }
    const first = overlays[0];
    if (
      first.scope.workspaceId !== grant.workspaceId ||
      first.scope.projectId !== grant.projectId
    ) {
      throw new Error("cross_tenant_canvas_publish_denied");
    }

    const bySeverity = emptyBySeverity();
    const mapped: G06MappedFinding[] = [];
    for (const ov of overlays) {
      for (const fid of ov.findingIds) {
        bySeverity.medium += 1;
        mapped.push({
          id: fid,
          findingKey: `port:${ov.nodeId}:${fid}`,
          nodeId: ov.nodeId,
          title: fid,
          severity: "medium",
          confidence: "high",
          engine: "guard",
          sourceLayer: "g02",
          status: "open",
          priority: "review",
          basis: "evidence_source_path",
          scanId: ov.commit.slice(0, 12),
          commitSha: ov.commit,
          evidenceSummary: `Published via CanvasPort for node ${ov.nodeId}`,
          href: `/app/projects/${encodeURIComponent(grant.projectId)}/guard/findings`,
        });
      }
    }

    const saved = await this.store.saveCanvasOverlay(
      { workspaceId: grant.workspaceId, projectId: grant.projectId },
      {
        actor: this.actor,
        overlay: {
          version: "guard.canvas.v1",
          projectId: grant.projectId,
          commitSha: first.commit,
          graphRevision: first.commit.slice(0, 12),
          graphSourceRevision: first.commit,
          scanId: first.commit.slice(0, 12),
          g05RunId: null,
          coverageStatus: "available",
          staleReasons: [],
          mappedFindings: mapped,
          unmatchedFindings: [],
          summary: {
            totalEvaluated: mapped.length,
            mappedCount: mapped.length,
            unmatchedCount: 0,
            reviewCount: mapped.length,
            bySeverity,
            byEngine: { guard: mapped.length },
          },
          generatedAt: new Date().toISOString(),
        },
      },
    );

    return {
      status: "available",
      value: { deliveryId: saved.id },
    };
  }

  async plans(
    grant: Grant,
    scope: Scope,
  ): Promise<IntegrationResult<InvariantPlan[]>> {
    if (
      scope.workspaceId !== grant.workspaceId ||
      scope.projectId !== grant.projectId
    ) {
      throw new Error("cross_tenant_canvas_plan_read_denied");
    }
    const g05 = await this.store.readG05Snapshot(scope);
    const items: InvariantPlan[] = g05.runs.map((run) => ({
      mode: "live",
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      id: run.testPlanId,
      kind: "workflow_bypass",
      description: `Persisted G05 DAST/Integrity plan (${run.status}) for target revision ${run.targetRevision}`,
      confirmedBy: run.createdBy,
      expectedStatus: 403,
      synthetic: false,
    }));
    return g05.available
      ? {
          status: "available",
          value: items,
        }
      : {
          status: "not_configured",
          backlogId: "GRD-014",
          reason: "G05 DAST/Integrity schema not active.",
        };
  }
}
