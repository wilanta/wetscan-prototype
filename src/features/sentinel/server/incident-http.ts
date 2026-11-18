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
import { IncidentStore } from "../incidents/store";
import { TelemetryError, uuid } from "../telemetry/validation";
import { incidentCommand } from "../incidents/validation";

export async function incidentRoute(request: NextRequest, projectId: string) {
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
    const store = new IncidentStore((await telemetryStore()).db);

    if (request.method === "POST") {
      if ([...query].length) throw new TelemetryError("invalid_query");
      const command = incidentCommand(await readJson(request, 8192));
      return reply(await store.command(context, command), 200);
    }

    if (query.has("incidentId")) {
      if (
        [...query.keys()].some(
          (k) =>
            (k !== "incidentId" && k !== "view") ||
            query.getAll(k).length !== 1,
        )
      )
        throw new TelemetryError("invalid_query");
      const incidentId = uuid(query.get("incidentId"));
      const view = query.get("view");
      if (
        view !== null &&
        !["full", "timeline", "alerts", "evidence"].includes(view)
      )
        throw new TelemetryError("invalid_query");
      const details = await store.incidentDetails(context, incidentId);
      if (view === "timeline")
        return reply({ incidentId, timeline: details.timeline });
      if (view === "alerts")
        return reply({ incidentId, alerts: details.alerts });
      if (view === "evidence")
        return reply({ incidentId, evidence: details.evidence });
      return reply(details);
    }

    return reply(await store.incidents(context, query));
  } catch (error) {
    return failure(error);
  }
}
