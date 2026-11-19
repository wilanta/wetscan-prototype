import type {
  ArchitectureGraph,
  IncidentSummary,
  SecurityOverlay,
  UnmappedIncidentSummary,
} from "../../canvas/types";

/**
 * CAN-008 pure mapping. An incident is attached to a graph node ONLY when its persisted evidence events carry a
 * route template that matches exactly one source-observed `api` node of the pinned revision. Everything else stays
 * unmapped; nothing is inferred, synthesized or guessed.
 *
 * Telemetry redacts every route segment that is not on a small static allowlist to `:redacted` (see
 * `telemetry/validation.ts#redactRoute`), so a match through a redacted segment is weaker evidence than an exact one
 * and is reported as such.
 */
export const REDACTION_ALLOWLIST = new Set([
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
  "ghost",
  "decoy",
  "__wetscan",
  "ghost-decoy",
  ".well-known",
  "admin",
  ".env",
  "wp-admin",
  "robots.txt",
  "favicon.ico",
]);
export const MAX_OVERLAY_INCIDENTS = 100;
export const MAX_UNMAPPED_LISTED = 25;

export interface OverlayEvidence {
  eventId: string;
  sourceId: string;
  origin: "runtime" | "controlled_test";
  occurredAt: string;
  method?: string;
  routeTemplate?: string;
}
export interface OverlayIncident {
  incidentId: string;
  title: string;
  status: string;
  severity: string;
  origin: "runtime" | "controlled_test";
  sourceId: string;
  firstObservedAt: string;
  lastObservedAt: string;
  evidence: OverlayEvidence[];
}
export interface OverlaySourceHealth {
  status: "not_configured" | "connected" | "disconnected" | "stale" | "failed";
  origin: "runtime" | "controlled_test" | "fixture" | "demo";
  enabled: boolean;
}

const isDynamic = (s: string) =>
  /^\[.*\]$/.test(s) || /^\{.*\}$/.test(s) || s.startsWith(":");
const segments = (route: string) =>
  route.split(/[?#]/, 1)[0].split("/").filter(Boolean);

/** exact: same static text; redacted: an event `:redacted` segment hid a graph segment. null: cannot match. */
export function matchRoute(
  eventRoute: string,
  graphRoute: string,
): "route_exact" | "route_redacted_segments" | null {
  const e = segments(eventRoute),
    g = segments(graphRoute);
  // Catch-all graph segments ([...slug]) would make any prefix match; treat them as unmappable.
  if (g.some((s) => /^\[\[?\.\.\./.test(s))) return null;
  if (e.length !== g.length) return null;
  let redacted = false;
  for (let i = 0; i < e.length; i++) {
    if (e[i] === ":redacted") {
      // A segment on the allowlist would have survived redaction, so it cannot be what was hidden.
      if (!isDynamic(g[i]) && REDACTION_ALLOWLIST.has(g[i])) return null;
      redacted = true;
    } else if (isDynamic(e[i])) {
      if (!isDynamic(g[i])) return null;
      redacted = true;
    } else if (isDynamic(g[i]) || e[i] !== g[i]) return null;
  }
  return redacted ? "route_redacted_segments" : "route_exact";
}

function methodAllowed(methods: unknown, method: string | undefined) {
  if (typeof methods !== "string" || !method) return true;
  const known = methods
    .split(",")
    .map((m) => m.trim().toUpperCase())
    .filter((m) => m && m !== "UNKNOWN");
  return !known.length || known.includes(method.toUpperCase());
}

export function mapIncident(
  graph: Pick<ArchitectureGraph, "nodes">,
  incident: OverlayIncident,
):
  | {
      nodeId: string;
      basis: "route_exact" | "route_redacted_segments";
      routes: string[];
    }
  | { reason: UnmappedIncidentSummary["reason"] } {
  const routed = incident.evidence.filter((e) => e.routeTemplate);
  if (!routed.length) return { reason: "no_route_evidence" };
  const apiNodes = graph.nodes.filter(
    (n) =>
      n.kind === "api" &&
      n.status === "observed_in_source" &&
      typeof n.metadata?.route === "string",
  );
  const found = new Map<string, "route_exact" | "route_redacted_segments">();
  const routes = new Set<string>();
  for (const ev of routed) {
    const hits = apiNodes.filter(
      (n) =>
        matchRoute(ev.routeTemplate!, String(n.metadata!.route)) &&
        methodAllowed(n.metadata!.methods, ev.method),
    );
    if (!hits.length) continue;
    routes.add(ev.routeTemplate!);
    for (const n of hits) {
      const basis = matchRoute(ev.routeTemplate!, String(n.metadata!.route))!;
      // Keep the weakest basis seen for a node.
      if (found.get(n.id) !== "route_redacted_segments") found.set(n.id, basis);
    }
    // Every routed event must agree on one node: a second candidate for ANY event makes the incident ambiguous.
    if (hits.length > 1) return { reason: "ambiguous_nodes" };
  }
  if (!found.size) return { reason: "no_matching_node" };
  if (found.size > 1) return { reason: "ambiguous_nodes" };
  const [[nodeId, basis]] = [...found];
  return { nodeId, basis, routes: [...routes].sort() };
}

export function buildSentinelOverlay(input: {
  graph: Pick<ArchitectureGraph, "nodes" | "revision">;
  projectRef: string;
  projectId: string;
  now: string;
  incidents: OverlayIncident[];
  truncated: boolean;
  sources: OverlaySourceHealth[];
}): SecurityOverlay {
  const mapped: IncidentSummary[] = [];
  const unmapped: UnmappedIncidentSummary[] = [];
  for (const incident of input.incidents) {
    const href = `/app/projects/${input.projectId}/sentinel/incidents/${encodeURIComponent(incident.incidentId)}`;
    const result = mapIncident(input.graph, incident);
    if ("reason" in result) {
      unmapped.push({
        id: incident.incidentId,
        title: incident.title,
        status: incident.status,
        reason: result.reason,
        href,
      });
      continue;
    }
    mapped.push({
      id: incident.incidentId,
      nodeId: result.nodeId,
      title: incident.title,
      status: incident.status,
      href,
      simulated: false,
      provenance: {
        origin: incident.origin,
        sourceId: incident.sourceId,
        severity: incident.severity,
        firstObservedAt: incident.firstObservedAt,
        lastObservedAt: incident.lastObservedAt,
        evidenceIds: incident.evidence
          .map((e) => `telemetry:${e.sourceId}:${e.eventId}`)
          .slice(0, 20),
        mapping: { basis: result.basis, routes: result.routes },
      },
    });
  }
  const enabled = input.sources.filter((s) => s.enabled);
  const connected = enabled.filter((s) => s.status === "connected");
  const runtimeConnected = connected.filter((s) => s.origin === "runtime");
  const everSeen = enabled.filter(
    (s) => s.status !== "not_configured" && s.origin !== "demo",
  );
  let sentinel: SecurityOverlay["sentinel"];
  let message: string;
  if (!everSeen.length) {
    sentinel = "not_monitored";
    message =
      "Monitoring not connected: no telemetry source has made accepted contact. Absence of incidents here does not mean this application is safe.";
  } else if (!connected.length) {
    sentinel = "stale";
    message =
      "Telemetry is stale or disconnected. Incidents shown are last-known records, not current monitoring; absence of incidents does not mean this application is safe.";
  } else if (
    !runtimeConnected.length ||
    connected.length < enabled.length ||
    unmapped.length ||
    input.truncated
  ) {
    sentinel = "partial";
    message = !runtimeConnected.length
      ? "Only controlled-test telemetry is connected; runtime traffic is not monitored."
      : "Partial coverage: some sources are not connected" +
        (unmapped.length
          ? " and some incidents cannot be placed on this graph."
          : ".") +
        " Absence of incidents does not mean this application is safe.";
  } else {
    sentinel = "available";
    message =
      "Connected sources are reporting. Incidents appear only where persisted route evidence matches a source-observed API node; this is not proof of safety.";
  }
  return {
    projectRef: input.projectRef,
    mode: "live",
    guard: "not_scanned",
    sentinel,
    findings: [],
    incidents: mapped,
    message,
    sentinelDetail: {
      sourceRevision: input.graph.revision,
      generatedAt: input.now,
      sources: {
        total: enabled.length,
        connected: connected.length,
        runtimeConnected: runtimeConnected.length,
      },
      mappedCount: mapped.length,
      unmapped: unmapped.slice(0, MAX_UNMAPPED_LISTED),
      unmappedCount: unmapped.length,
      truncated: input.truncated,
    },
  };
}
