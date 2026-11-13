import { NextRequest, NextResponse } from "next/server";
import { AuthError, authConfig } from "@/lib/auth/config";
import {
  callbackErrorCode,
  logCallbackFailure,
  type CallbackStage,
} from "@/lib/auth/diagnostics";
import {
  accessibleRepositories,
  exchangeCode,
  githubRequest,
  startFlow,
  validState,
  verifyAppInstallation,
} from "@/lib/auth/github";
import {
  getSession,
  profileFor,
  requestToken,
  rotateSession,
  saveSession,
  setSessionCookie,
} from "@/lib/auth/session";
import { exclusive, writeRecord } from "@/lib/auth/store";
import type { Profile, Session } from "@/lib/auth/types";

export const runtime = "nodejs";
function redirect(path: string) {
  return NextResponse.redirect(new URL(path, authConfig().origin), {
    status: 303,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
export async function GET(request: NextRequest) {
  return exclusive(async () => {
    const query = request.nextUrl.searchParams;
    const token = requestToken(request);
    let session: Session | undefined;
    let flowKind: NonNullable<Session["flow"]>["kind"] | undefined;
    let stage: CallbackStage = "session";
    try {
      session = await getSession(token);
      const flow = session?.flow;
      flowKind = flow?.kind;
      if (!session || !token || !flow) throw new AuthError("invalid_state");
      stage = "state";
      if (
        ["state", "code", "installation_id", "setup_action", "error"].some(
          (key) => query.getAll(key).length > 1,
        )
      )
        throw new AuthError("invalid_callback");
      if (
        flow.expiresAt < Date.now() ||
        !validState(query.get("state"), flow.state)
      )
        throw new AuthError("invalid_state");
      delete session.flow;
      await saveSession(token, session); // A valid callback consumes state once.
      if (query.has("error") || query.get("setup_action") === "request")
        throw new AuthError("github_cancelled");

      if (flow.kind === "install") {
        stage = "installation";
        // Explicit setup -> OAuth is required. Automatic OAuth-on-install is a
        // different GitHub App configuration; never discard its code and loop.
        if (query.has("code"))
          throw new AuthError("github_setup_misconfigured");
        const action = query.get("setup_action");
        if (action !== null && action !== "install" && action !== "update")
          throw new AuthError("invalid_callback");
        const rawId = query.get("installation_id") ?? "";
        const installationId = Number(rawId);
        if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(installationId))
          throw new AuthError("installation_denied");
        // Confirm this installation belongs to this app before authorizing a user.
        // User membership is separately checked after the OAuth identity is known.
        await verifyAppInstallation(installationId);
        const url = startFlow(session, "verify", installationId);
        await saveSession(token, session);
        const response = redirect(url);
        setSessionCookie(response, token);
        return response;
      }

      stage = "authorization";
      if (
        flow.kind === "verify" &&
        (!Number.isSafeInteger(flow.installationId) ||
          !flow.installationId ||
          flow.installationId < 1)
      )
        throw new AuthError("invalid_callback");
      const code = query.get("code");
      if (!code || code.length > 512 || !flow.verifier)
        throw new AuthError("github_cancelled");
      await exchangeCode(code, flow.verifier, session);
      stage = "identity";
      const identity = await githubRequest<{ id: number; login: string }>(
        "/user",
        session.userToken!,
      );
      if (
        !Number.isSafeInteger(identity.id) ||
        identity.id < 1 ||
        !identity.login
      )
        throw new AuthError("github_denied");
      if (session.githubId && session.githubId !== identity.id)
        throw new AuthError("account_mismatch", 403);
      session.githubId = identity.id;
      const existing = await profileFor(session);
      const profile: Profile = existing ?? {
        githubId: identity.id,
        login: identity.login,
        workspace: session.workspace,
        repositories: [],
        email: "",
        securityNotifications: true,
        productUpdates: false,
      };
      profile.login = identity.login;
      if (flow.kind === "verify" && flow.installationId) {
        stage = "repositories";
        const repositories = await accessibleRepositories(
          session,
          flow.installationId,
        );
        if (!profile.completedAt) {
          profile.installationId = flow.installationId;
          profile.repositories = profile.repositories.filter((repo) =>
            repositories.some((available) => available.id === repo.id),
          );
        }
      }
      stage = "session_rotation";
      await writeRecord("user-" + identity.id, profile);
      const rotated = await rotateSession(token, session);
      const response = redirect(profile.completedAt ? "/app" : "/onboarding");
      setSessionCookie(response, rotated);
      return response;
    } catch (error) {
      const code = callbackErrorCode(error);
      logCallbackFailure(error, {
        stage,
        cookiePresent: !!token,
        sessionPresent: !!session,
        flowKind,
        statePresent: query.has("state"),
        installationPresent: query.has("installation_id"),
        codePresent: query.has("code"),
      });
      let origin = request.nextUrl.origin;
      try {
        origin = authConfig().origin;
      } catch {
        /* Fixed local error path only. */
      }
      return NextResponse.redirect(
        new URL("/onboarding?error=" + encodeURIComponent(code), origin),
        {
          status: 303,
          headers: {
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          },
        },
      );
    }
  });
}
