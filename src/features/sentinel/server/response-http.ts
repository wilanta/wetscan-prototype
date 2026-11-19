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
import { TelemetryError, uuid } from "../telemetry/validation";
import { ResponsePolicyDenied, ResponseStore } from "../response/store";

/**
 * Project-scoped Responses API. Scope comes only from the authenticated session + route project; the body can
 * carry neither scope nor target URLs. There is deliberately NO apply endpoint: enforcement happens only in the
 * worker, after a durable approval.
 */
export async function responseRoute(request: NextRequest, projectId: string) {
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
    const store = new ResponseStore((await telemetryStore()).db);

    if (request.method === "POST") {
      if ([...query].length) throw new TelemetryError("invalid_query");
      return reply(
        await store.command(context, await readJson(request, 8192)),
        200,
      );
    }
    const keys = [...query.keys()];
    if (
      keys.some((k) => !["actionId", "incidentId", "view"].includes(k)) ||
      keys.length !== new Set(keys).size
    )
      throw new TelemetryError("invalid_query");
    if (query.get("view") === "targets") {
      if (keys.length !== 1) throw new TelemetryError("invalid_query");
      return reply({ targets: await store.targets(context) });
    }
    if (query.has("view")) throw new TelemetryError("invalid_query");
    if (query.has("actionId")) {
      if (keys.length !== 1) throw new TelemetryError("invalid_query");
      return reply(await store.details(context, uuid(query.get("actionId"))));
    }
    const incidentId = query.has("incidentId")
      ? uuid(query.get("incidentId"))
      : undefined;
    return reply({ actions: await store.list(context, incidentId) });
  } catch (error) {
    if (error instanceof ResponsePolicyDenied)
      return reply({ error: error.code, reasons: error.reasons }, error.status);
    // 42P01 = response tables not migrated: report NOT_CONFIGURED, never a fake empty/ok state.
    if ((error as { code?: string })?.code === "42P01")
      return reply({ error: "response_not_configured" }, 503);
    return failure(error);
  }
}
