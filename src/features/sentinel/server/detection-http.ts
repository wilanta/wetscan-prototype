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
import { DetectionStore } from "../detection/store";
import { TelemetryError, uuid } from "../telemetry/validation";
import { ruleCommand } from "../detection/validation";

export async function detectionRoute(
  request: NextRequest,
  projectId: string,
  resource: "rules" | "alerts",
) {
  try {
    if (!/^github-[1-9]\d{0,15}$/.test(projectId))
      throw new TelemetryError("not_found", 404);
    if (
      !["GET", "POST"].includes(request.method) ||
      (resource === "alerts" && request.method !== "GET")
    )
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
    if (resource === "rules") {
      if (
        [...query.keys()].some(
          (k) => k !== "ruleId" || query.getAll(k).length !== 1,
        ) ||
        (request.method === "POST" && [...query].length)
      )
        throw new TelemetryError("invalid_query");
      const ruleId = query.has("ruleId")
        ? uuid(query.get("ruleId"))
        : undefined;
      const command =
        request.method === "POST"
          ? ruleCommand(await readJson(request, 8192))
          : undefined;
      const store = new DetectionStore((await telemetryStore()).db);
      if (command)
        return reply(
          await store.command(context, command),
          command.action === "create" ? 201 : 200,
        );
      return reply(
        ruleId
          ? await store.ruleDetails(context, ruleId)
          : { rules: await store.rules(context) },
      );
    }
    const alertId = query.has("alertId")
      ? uuid(query.get("alertId"))
      : undefined;
    if (
      alertId &&
      ([...query].length !== 1 || query.getAll("alertId").length !== 1)
    )
      throw new TelemetryError("invalid_query");
    const store = new DetectionStore((await telemetryStore()).db);
    return reply(
      alertId
        ? await store.alertDetails(context, alertId)
        : await store.alerts(context, query),
    );
  } catch (error) {
    return failure(error);
  }
}
