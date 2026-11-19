import "server-only";
import { NextRequest } from "next/server";
import { requestToken } from "../../../lib/auth/session";
import { requireOrigin } from "../../../lib/auth/http";
import { canvasIdentity, workspaceScope } from "../../canvas/server/github-reader";
import { authorizeSentinelProject } from "./project-context";
import { telemetryStore } from "./telemetry-runtime";
import { failure, readJson, reply } from "./telemetry-http";
import { TelemetryError } from "../telemetry/validation";
import { NotificationStore } from "../notifications/store";

/**
 * Project-scoped Notifications API. Scope comes only from the authenticated session + route project; the body can carry
 * neither scope nor provider credentials. There is deliberately NO send endpoint with free-form text or recipients:
 * `test` and `retry` only enqueue a durable intent for the isolated notifier, which holds the provider secrets.
 */
export async function notificationRoute(request: NextRequest, projectId: string) {
  try {
    if (!/^github-[1-9]\d{0,15}$/.test(projectId)) throw new TelemetryError("not_found", 404);
    if (!["GET", "POST"].includes(request.method)) return reply({ error: "method_not_allowed" }, 405);
    if (request.method !== "GET") requireOrigin(request);
    const token = requestToken(request),
      { profile } = await canvasIdentity(token);
    const context = await authorizeSentinelProject(token, { mode: "live", workspaceId: workspaceScope(profile), projectId });
    const query = request.nextUrl.searchParams;
    const store = new NotificationStore((await telemetryStore()).db);
    if (request.method === "POST") {
      if ([...query].length) throw new TelemetryError("invalid_query");
      return reply(await store.command(context, await readJson(request, 4096)), 200);
    }
    const keys = [...query.keys()];
    if (keys.some((k) => k !== "view") || keys.length > 1) throw new TelemetryError("invalid_query");
    const view = query.get("view") ?? "channels";
    if (view === "channels") return reply({ channels: await store.channels(context) });
    if (view === "deliveries") return reply({ deliveries: await store.deliveries(context) });
    throw new TelemetryError("invalid_query");
  } catch (error) {
    // 42P01 = notification tables not migrated: report NOT_CONFIGURED, never a fake empty/ok state.
    if ((error as { code?: string })?.code === "42P01") return reply({ error: "notifications_not_configured" }, 503);
    return failure(error);
  }
}
