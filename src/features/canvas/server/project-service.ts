import "server-only";
import { userToken } from "@/lib/auth/github";
import { AuthError } from "@/lib/auth/config";
import {
  authorizeCanvasProject,
  canvasIdentity,
  GitHubRepositorySnapshotReader,
  workspaceScope,
} from "./github-reader";
import { FileCanvasGraphStore } from "./graph-cache";
import { CanvasGraphService } from "./graph-service";
import { sourceRequest } from "./github-api";
import { SnapshotCanvasSource } from "../adapters/snapshot-source";
import type { CanvasCacheIdentity } from "../cache-contracts";
import { getSession, profileFor } from "@/lib/auth/session";

export function projectCanvasService(
  token: string | undefined,
  projectId: string,
) {
  const store = new FileCanvasGraphStore();
  let context: Awaited<ReturnType<typeof authorizeCanvasProject>> | undefined;
  const authorize = async (): Promise<CanvasCacheIdentity> => {
    try {
      context = await authorizeCanvasProject(token, projectId);
      const { profile, repo } = context;
      return {
        workspace: workspaceScope(profile),
        userId: profile.githubId,
        provider: "github",
        installationId: profile.installationId!,
        repositoryId: repo.id,
        repositoryName: repo.full_name,
      };
    } catch (error) {
      // Purge this user's repository namespace on selection/provider denial or uncertainty.
      const session = await getSession(token);
      const profile = await profileFor(session);
      const id = /^github-([1-9]\d{0,15})$/.exec(projectId)?.[1];
      if (profile && id)
        await store.purge({
          userId: profile.githubId,
          workspace: workspaceScope(profile),
          repositoryId: Number(id),
        });
      throw error;
    }
  };
  return new CanvasGraphService(store, {
    authorize,
    async validateSession() {
      const current = await canvasIdentity(token);
      if (
        !context ||
        current.profile.installationId !== context.profile.installationId ||
        workspaceScope(current.profile) !== workspaceScope(context.profile) ||
        !current.profile.repositories.some((r) => r.id === context!.repo.id)
      )
        throw new AuthError("repository_denied", 403);
    },
    async head(identity) {
      if (!context) throw new AuthError("unauthenticated", 401);
      const commit = await sourceRequest<{ sha: string }>(
        `/repos/${identity.repositoryName}/commits/${encodeURIComponent(context.repo.default_branch)}`,
        await userToken(context.session),
        AbortSignal.timeout(15000),
      );
      if (!/^[a-f0-9]{40}$/.test(commit?.sha))
        throw new AuthError("github_response", 502);
      return commit.sha;
    },
    async analyze(identity, revision) {
      const snapshot = await new GitHubRepositorySnapshotReader(
        token,
      ).getSnapshot({
        authenticatedWorkspaceId: identity.workspace,
        projectId,
        revision,
      });
      return SnapshotCanvasSource(snapshot).loadGraph({
        projectRef: snapshot.repositoryRef,
        revision,
      });
    },
  });
}
