import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireOrigin } from "../../../lib/auth/http";
import { requestToken } from "../../../lib/auth/session";
import { AuthError } from "../../../lib/auth/config";
import { authorizeGuardProject } from "./project";
import { boundedJson } from "./http";
import { LiveGuardError } from "./model";
import { approvedCase } from "../../../../worker/guard/acceptance/package";
import {
  OwnerCaseActions,
  type CaseAction,
} from "../../../../worker/guard/acceptance/actions";
import type { CaseId } from "../../../../worker/guard/acceptance/catalog";
/** Operator-only inactive-by-default bridge in the existing Auth process. No second Auth writer. */
export async function acceptanceRoute(request: NextRequest, projectId: string) {
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    Vary: "Cookie",
  };
  const reply = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers });
  try {
    if (
      request.method !== "POST" ||
      [...request.nextUrl.searchParams].length ||
      !/^github-[1-9]\d{0,15}$/.test(projectId)
    )
      throw new LiveGuardError("invalid_input", 400);
    requireOrigin(request);
    const token = requestToken(request),
      authority = await authorizeGuardProject(token, projectId),
      body = (await boundedJson(request)) as {
        caseId: CaseId;
        packetSha256: string;
        action: CaseAction;
      };
    if (
      !body ||
      Object.keys(body).sort().join() !== "action,caseId,packetSha256" ||
      ![
        "enqueue",
        "launch_0",
        "launch_1",
        "launch_2",
        "cancel",
        "rescue",
        "observe",
        "result",
        "complete",
      ].includes(body.action)
    )
      throw new LiveGuardError("invalid_input", 400);
    const { packet, approval, root } = await approvedCase(
      body.caseId,
      body.packetSha256,
    );
    if (
      !packet.binding ||
      packet.binding.projectId !== projectId ||
      packet.binding.actorId !== authority.grant.actorId ||
      packet.binding.workspaceId !== authority.grant.workspaceId
    )
      throw new LiveGuardError("not_found", 404);
    return reply(
      await new OwnerCaseActions(
        packet,
        approval,
        root,
        token,
        process.env,
      ).dispatch(body.action),
      body.action.startsWith("launch_") ? 202 : 200,
    );
  } catch (error) {
    if (error instanceof AuthError && error.code === "invalid_origin")
      return reply({ error: "invalid_origin" }, 403);
    if (error instanceof AuthError)
      return reply(
        {
          error:
            error.status === 403 || error.status === 404
              ? "not_found"
              : error.code,
        },
        error.status === 403 || error.status === 404 ? 404 : error.status,
      );
    if (error instanceof LiveGuardError)
      return reply({ error: error.code }, error.status);
    return reply({ error: "acceptance_unavailable" }, 503);
  }
}
