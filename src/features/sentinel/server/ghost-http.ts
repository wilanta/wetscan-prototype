import "server-only";
import { NextRequest } from "next/server";
import { requestToken } from "../../../lib/auth/session";
import { requireOrigin } from "../../../lib/auth/http";
import {
  canvasIdentity,
  workspaceScope,
} from "../../canvas/server/github-reader";
import { authorizeSentinelProject } from "./project-context";
import { telemetryStore } from "./telemetry-runtime";
import { failure, readJson, reply } from "./telemetry-http";
import { TelemetryError } from "../telemetry/validation";
import { GhostStore } from "../ghost/store";

/**
 * Project-scoped Ghost Lite API. Scope comes strictly from the authenticated session + route project;
 * provenance (origin, environment) is derived from the authoritative bound telemetry source.
 */
export async function ghostRoute(request: NextRequest, projectId: string) {
  try {
    if (!/^github-[1-9]\d{0,15}$/.test(projectId))
      throw new TelemetryError("not_found", 404);
    if (!["GET", "POST"].includes(request.method))
      return reply({ error: "method_not_allowed" }, 405);
    if (request.method !== "GET") requireOrigin(request);
    const token = requestToken(request),
      { profile } = await canvasIdentity(token);
    const context = await authorizeSentinelProject(token, {
      mode: "live",
      workspaceId: workspaceScope(profile),
      projectId,
    });
    const query = request.nextUrl.searchParams;
    if ([...query].length) throw new TelemetryError("invalid_query");
    const store = new GhostStore((await telemetryStore()).db);
    if (request.method === "POST") {
      const result = await store.command(
        context,
        await readJson(request, 8192),
      );
      return reply(result, 200);
    }
    return reply(await store.overview(context));
  } catch (error) {
    const code = (error as { code?: string })?.code;
    // 42P01 = Ghost tables not migrated: report NOT_CONFIGURED, never a fake empty/ok state.
    if (code === "42P01") return reply({ error: "ghost_not_configured" }, 503);
    if (code === "23505") return reply({ error: "decoy_conflict" }, 409);
    return failure(error);
  }
}
