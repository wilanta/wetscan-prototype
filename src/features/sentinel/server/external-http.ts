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
import { ExternalService } from "../external/service";
import { externalCommand, externalQuery } from "../external/validation";
import { LockfileError, parsePackageLock } from "../external/lockfile";
import { readRootLockfile } from "./lockfile-reader";

/**
 * Project-scoped External Intelligence API (live mode only). Scope and actor come strictly from the authenticated
 * session + route project. This module imports no feed client: it can only read stored data and queue worker jobs,
 * so page loads and API reads can never cause outbound advisory traffic.
 */
export async function externalRoute(request: NextRequest, projectId: string) {
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
    const command =
      request.method === "POST"
        ? externalCommand(await readJson(request, 1024))
        : undefined;
    if (command && [...request.nextUrl.searchParams].length)
      throw new TelemetryError("invalid_query");
    const query = command
      ? undefined
      : externalQuery(request.nextUrl.searchParams);
    const service = new ExternalService((await telemetryStore()).db);
    if (command?.action === "sync")
      return reply(await service.requestSync(context, command.providers), 202);
    if (command) {
      const file = await readRootLockfile(token, projectId);
      if (!file.found)
        return reply(
          { error: "lockfile_not_found", commitSha: file.commitSha },
          404,
        );
      let parsed;
      try {
        parsed = parsePackageLock(file.text);
      } catch (e) {
        if (e instanceof LockfileError) throw new TelemetryError(e.code, 422);
        throw e;
      }
      const snapshot = await service.inventory.save(context, {
        commitSha: file.commitSha,
        lockfilePath: file.path,
        lockfileSha256: file.sha256,
        lockfileVersion: parsed.lockfileVersion,
        items: parsed.items,
      });
      return reply({ snapshot, skippedEntries: parsed.skipped });
    }
    if (query!.advisoryId) {
      const found = await service.detail(query!.advisoryId);
      if (!found) throw new TelemetryError("not_found", 404);
      return reply(found);
    }
    if (query!.view === "advisories") return reply(await service.list(query!));
    if (query!.view === "exposures")
      return reply(await service.exposures(context));
    return reply(await service.overview(context));
  } catch (error) {
    // 42P01 = External Intelligence tables not migrated: report NOT_CONFIGURED, never a fake empty/ok state.
    if ((error as { code?: string })?.code === "42P01")
      return reply({ error: "external_not_configured" }, 503);
    return failure(error);
  }
}
