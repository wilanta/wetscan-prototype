import { NextRequest } from "next/server";
import { AuthError } from "@/lib/auth/config";
import { authRoute, body, json } from "@/lib/auth/http";
import {
  discoverInstallations,
  linkInstallation,
  startFlow,
  verifyAppConfiguration,
  verifyIdentity,
} from "@/lib/auth/github";
import {
  getSession,
  newSession,
  profileFor,
  requestToken,
  saveSession,
  setSessionCookie,
} from "@/lib/auth/session";

import { writeRecord } from "@/lib/auth/store";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  return authRoute(request, async () => {
    const input = await body(request);
    const kind =
      input.intent === "login"
        ? "login"
        : input.intent === "install" || input.intent === "select"
          ? "install"
          : undefined;
    if (!kind) throw new AuthError("invalid_input");
    let token = requestToken(request);
    let session = await getSession(token);
    if (!session) ({ token, session } = await newSession());
    const profile = await profileFor(session);
    if (profile?.completedAt) return json({ url: "/app" });
    if (kind === "install" && !(profile?.workspace || session.workspace))
      throw new AuthError("workspace_required");
    if (kind === "install") await verifyAppConfiguration();
    let url: string;
    if (kind === "login") {
      url = startFlow(session, "login");
    } else {
      if (
        input.intent === "select" &&
        (!profile ||
          !Number.isSafeInteger(input.installationId) ||
          Number(input.installationId) < 1)
      )
        throw new AuthError("installation_denied", 403);
      let authorized = false;
      if (profile && session.userToken) {
        try {
          await verifyIdentity(session);
          authorized = true;
        } catch (error) {
          if (!(error instanceof AuthError) || error.code !== "github_expired")
            throw error;
        }
      }
      if (!authorized) {
        // Never carry a client-selected ID across an unauthenticated request.
        if (input.intent === "select")
          throw new AuthError("github_expired", 401);
        url = startFlow(session, "connect", profile?.installationId);
      } else if (profile) {
        const selectedId =
          input.intent === "select"
            ? Number(input.installationId)
            : profile.installationId;
        const installations = selectedId
          ? undefined
          : await discoverInstallations(session);
        const id =
          selectedId ??
          (installations?.length === 1 ? installations[0].id : undefined);
        if (id) {
          await linkInstallation(session, profile, id);
          await writeRecord("user-" + profile.githubId, profile);
          url = "/onboarding";
        } else if (installations!.length > 1) {
          delete session.flow;
          session.installationChoices = installations;
          await saveSession(token!, session);
          const response = json({ installations });
          setSessionCookie(response, token!);
          return response;
        } else {
          delete session.installationChoices;
          url = startFlow(session, "install");
        }
      } else {
        throw new AuthError("unauthenticated", 401);
      }
    }
    await saveSession(token!, session);
    const response = json({ url });
    setSessionCookie(response, token!);
    return response;
  });
}
