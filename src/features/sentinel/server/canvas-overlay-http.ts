import "server-only";
import { NextRequest } from "next/server";
import { requestToken } from "../../../lib/auth/session";
import {
  canvasIdentity,
  workspaceScope,
} from "../../canvas/server/github-reader";
import { projectCanvasService } from "../../canvas/server/project-service";
import { authorizeSentinelProject } from "./project-context";
import { telemetryStore } from "./telemetry-runtime";
import { failure, reply } from "./telemetry-http";
import { TelemetryError } from "../telemetry/validation";
import { CanvasOverlayStore } from "../canvas/overlay-store";
import { buildSentinelOverlay } from "../canvas/mapping";

/**
 * CAN-008: Sentinel-backed Canvas security overlay.
 * Scope comes only from the authenticated session + route project. The caller pins the graph revision it is
 * displaying; the overlay is mapped against that exact, separately authorized cached graph and carries the
 * revision back so the client can discard it if the displayed graph has changed.
 */
export async function canvasOverlayRoute(
  request: NextRequest,
  projectId: string,
) {
  try {
    if (!/^github-[1-9]\d{0,15}$/.test(projectId))
      throw new TelemetryError("not_found", 404);
    if (request.method !== "GET")
      return reply({ error: "method_not_allowed" }, 405);
    const query = request.nextUrl.searchParams;
    const revision = query.get("revision");
    if (
      [...query.keys()].some((k) => k !== "revision") ||
      query.getAll("revision").length !== 1 ||
      !revision ||
      !/^[a-f0-9]{40}$/.test(revision)
    )
      throw new TelemetryError("invalid_query");
    const token = requestToken(request),
      { profile } = await canvasIdentity(token);
    const context = await authorizeSentinelProject(token, {
      mode: "live",
      workspaceId: workspaceScope(profile),
      projectId,
    });
    // The graph comes from the authorized Canvas cache, never from the browser.
    const entry = await projectCanvasService(token, projectId).cached(revision);
    if (
      !entry ||
      entry.graph.revision !== revision ||
      entry.graph.mode !== "live" ||
      entry.graph.projectRef !== context.canvasProjectRef
    )
      return reply({ error: "graph_unavailable" }, 409);
    const store = await telemetryStore();
    const [sources, { incidents, truncated }] = await Promise.all([
      store.sources(context),
      new CanvasOverlayStore(store.db).openIncidents(context),
    ]);
    return reply(
      buildSentinelOverlay({
        graph: entry.graph,
        projectRef: context.canvasProjectRef,
        projectId,
        now: new Date().toISOString(),
        incidents,
        truncated,
        sources: sources.map((s) => ({
          status: s.status,
          origin: s.origin,
          enabled: s.enabled,
        })),
      }),
    );
  } catch (error) {
    return failure(error);
  }
}
