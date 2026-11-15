import "server-only";
import {
  authorizeCanvasProject,
  workspaceScope,
} from "../../canvas/server/github-reader";
import type { ProjectAuthority } from "./model";
/** Existing Canvas authorizer verifies session, selection, identity, current user and App access. */
export async function authorizeGuardProject(
  token: string | undefined,
  projectId: string,
): Promise<ProjectAuthority> {
  const context = await authorizeCanvasProject(token, projectId),
    { profile, repo, session } = context;
  return {
    grant: {
      mode: "live",
      workspaceId: workspaceScope(profile),
      projectId: `github-${repo.id}`,
      actorId: `github-user-${profile.githubId}`,
      operations: ["read", "scan", "triage", "report"],
      expiresAt: Math.min(session.expiresAt, Date.now() + 60000),
    },
    repositoryId: String(repo.id),
    repositoryName: repo.full_name,
    branch: repo.default_branch,
    installationId: profile.installationId!,
    userId: profile.githubId,
  };
}
