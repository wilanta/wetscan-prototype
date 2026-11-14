import "server-only";
import {
  authorizeCanvasProject,
  workspaceScope,
} from "../../canvas/server/github-reader";
import { assertSameScope } from "../scope";
import type { SentinelProjectContext, SentinelScope } from "../types";

/** Additive reuse of existing authorization; not wired to any new API in S00. */
export async function authorizeSentinelProject(
  sessionToken: string | undefined,
  requested: SentinelScope,
): Promise<SentinelProjectContext> {
  if (
    requested.mode !== "live" ||
    !/^github-[1-9]\d{0,15}$/.test(requested.projectId)
  )
    throw new Error("Live GitHub project required");
  const { profile, repo } = await authorizeCanvasProject(
    sessionToken,
    requested.projectId,
  );
  const scope: SentinelScope = {
    workspaceId: workspaceScope(profile),
    projectId: `github-${repo.id}`,
    mode: "live",
  };
  assertSameScope(scope, requested);
  return {
    scope,
    actorId: `github-user-${profile.githubId}`,
    repositoryId: String(repo.id),
    canvasProjectRef: `github-user-${profile.githubId}/${scope.projectId}`,
  };
}
