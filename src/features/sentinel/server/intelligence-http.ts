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
import { IntelligenceStore } from "../intelligence/store";
import { intelCommand, intelQuery } from "../intelligence/validation";

/**
 * Project-scoped Internal Intelligence API (live mode only). Scope and actor come strictly from the
 * authenticated session + route project; the browser never supplies workspace, mode, actor or rule definitions.
 */
export async function intelligenceRoute(
  request: NextRequest,
  projectId: string,
) {
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
    // Parse before opening storage: malformed requests never reach the database.
    const command =
      request.method === "POST"
        ? intelCommand(await readJson(request, 4096))
        : undefined;
    if (command && [...request.nextUrl.searchParams].length)
      throw new TelemetryError("invalid_query");
    const query = command ? {} : intelQuery(request.nextUrl.searchParams);
    const store = new IntelligenceStore((await telemetryStore()).db);
    if (command) return reply(await store.command(context, command));
    return reply(
      query.caseId
        ? await store.detail(context, query.caseId)
        : await store.overview(context, query),
    );
  } catch (error) {
    // 42P01 = Intelligence tables not migrated: report NOT_CONFIGURED, never a fake empty/ok state.
    if ((error as { code?: string })?.code === "42P01")
      return reply({ error: "intelligence_not_configured" }, 503);
    return failure(error);
  }
}
