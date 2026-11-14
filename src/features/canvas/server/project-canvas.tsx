import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AuthError } from "@/lib/auth/config";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { CanvasPage } from "../components/canvas-page";
import { SourceError } from "../components/source-error";
import { SnapshotCanvasSource } from "../adapters/snapshot-source";
import { validateGraph } from "../validation";
import {
  canvasIdentity,
  GitHubRepositorySnapshotReader,
  workspaceScope,
} from "./github-reader";

export async function ProjectCanvas({
  projectId,
  revision,
}: {
  projectId: string;
  revision?: string;
}) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let graph;
  try {
    const { profile } = await canvasIdentity(token);
    const snapshot = await new GitHubRepositorySnapshotReader(
      token,
    ).getSnapshot({
      authenticatedWorkspaceId: workspaceScope(profile),
      projectId,
      revision,
    });
    graph = validateGraph(
      await SnapshotCanvasSource(snapshot).loadGraph({
        projectRef: snapshot.repositoryRef,
        revision: snapshot.revision,
      }),
    );
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.code === "unauthenticated") redirect("/login");
      if (error.code === "onboarding_incomplete") redirect("/onboarding");
      if (
        [
          "repository_denied",
          "installation_denied",
          "github_denied",
          "github_not_found",
        ].includes(error.code)
      )
        notFound();
    }
    const message =
      error instanceof AuthError &&
      ["invalid_revision", "stale_revision", "revision_unavailable"].includes(
        error.code,
      )
        ? "The requested revision is invalid or no longer the selected branch HEAD. Open this repository again from Projects to analyze its current commit."
        : error instanceof AuthError &&
            ["github_rate_limited", "source_busy"].includes(error.code)
          ? "Source reading is busy or GitHub's API limit was reached. Wait briefly and retry."
          : error instanceof AuthError && error.code === "source_response_limit"
            ? "This repository exceeds the safe source response limit. No complete map is available; retry with a smaller repository."
            : "Source reading could not finish. Check your GitHub App connection, Contents read permission and repository selection, then retry.";
    return <SourceError message={message} />;
  }
  // Serializable, validated output only. No source text, credentials or function ports.
  return (
    <CanvasPage
      key={`${graph.projectRef}:${graph.revision}`}
      initialGraph={graph}
    />
  );
}
