import { NextRequest } from "next/server";
import { AuthError } from "@/lib/auth/config";
import { accessibleRepositories } from "@/lib/auth/github";
import { authRoute, body, json } from "@/lib/auth/http";
import {
  getSession,
  newSession,
  profileFor,
  requestToken,
  saveSession,
  setSessionCookie,
} from "@/lib/auth/session";
import { writeRecord } from "@/lib/auth/store";
import type { OnboardingState, Profile, Session } from "@/lib/auth/types";

export const runtime = "nodejs";
function state(session?: Session, profile?: Profile): OnboardingState {
  return {
    authenticated: !!profile,
    step: profile?.completedAt
      ? "complete"
      : !(profile?.workspace || session?.workspace)
        ? "workspace"
        : !profile?.installationId
          ? "github"
          : !profile.repositories.length
            ? "repositories"
            : "account",
    connected: !!profile?.installationId,
    installations:
      profile && !profile.installationId
        ? session?.installationChoices
        : undefined,
    profile: {
      login: profile?.login ?? "",
      workspace: profile?.workspace || session?.workspace || "",
      repositories: profile?.repositories ?? [],
      email: profile?.email ?? "",
      securityNotifications: profile?.securityNotifications ?? true,
      productUpdates: profile?.productUpdates ?? false,
    },
  };
}
export async function GET(request: NextRequest) {
  return authRoute(request, async () => {
    const session = await getSession(requestToken(request));
    return json(state(session, await profileFor(session)));
  });
}
export async function POST(request: NextRequest) {
  return authRoute(request, async () => {
    const input = await body(request);
    let token = requestToken(request);
    let session = await getSession(token);
    if (!session && input.action !== "workspace")
      throw new AuthError("unauthenticated", 401);
    if (!session) ({ token, session } = await newSession());
    const profile = await profileFor(session);
    if (profile?.completedAt) return json(state(session, profile));
    if (input.action === "workspace") {
      if (
        typeof input.workspace !== "string" ||
        !input.workspace.trim() ||
        input.workspace.trim().length > 60 ||
        /[\u0000-\u001f]/.test(input.workspace)
      )
        throw new AuthError("invalid_workspace");
      session.workspace = input.workspace.trim();
      if (profile) profile.workspace = session.workspace;
    } else {
      if (!profile) throw new AuthError("unauthenticated", 401);
      if (input.action === "repositories") {
        if (
          !profile.installationId ||
          !Array.isArray(input.repositoryIds) ||
          !input.repositoryIds.length ||
          input.repositoryIds.length > 100 ||
          !input.repositoryIds.every((id) => Number.isSafeInteger(id) && id > 0)
        )
          throw new AuthError("invalid_repositories");
        const available = await accessibleRepositories(
          session,
          profile.installationId,
        );
        const ids = new Set(input.repositoryIds as number[]);
        const selected = available.filter((repo) => ids.has(repo.id));
        if (selected.length !== ids.size)
          throw new AuthError("repository_denied", 403);
        profile.repositories = selected;
      } else if (input.action === "account" || input.action === "complete") {
        if (
          typeof input.email !== "string" ||
          input.email.length > 254 ||
          (input.action === "complete" &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) ||
          typeof input.securityNotifications !== "boolean" ||
          typeof input.productUpdates !== "boolean"
        )
          throw new AuthError("invalid_account");
        profile.email = input.email.trim();
        profile.securityNotifications = input.securityNotifications;
        profile.productUpdates = input.productUpdates;
        if (input.action === "complete") {
          if (
            !profile.workspace ||
            !profile.installationId ||
            !profile.repositories.length
          )
            throw new AuthError("onboarding_incomplete");
          // Recheck grants at completion; permissions may have changed since selection.
          const available = await accessibleRepositories(
            session,
            profile.installationId,
          );
          if (
            profile.repositories.some(
              (repo) => !available.some((item) => item.id === repo.id),
            )
          )
            throw new AuthError("repository_denied", 403);
          profile.completedAt = new Date().toISOString();
        }
      } else throw new AuthError("invalid_input");
    }
    if (profile) await writeRecord("user-" + profile.githubId, profile);
    await saveSession(token!, session);
    const response = json(state(session, profile));
    setSessionCookie(response, token!);
    return response;
  });
}
