import { NextRequest } from "next/server";
import { AuthError } from "@/lib/auth/config";
import { authRoute, body, json } from "@/lib/auth/http";
import { startFlow, verifyAppConfiguration } from "@/lib/auth/github";
import {
  getSession,
  newSession,
  profileFor,
  requestToken,
  saveSession,
  setSessionCookie,
} from "@/lib/auth/session";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  return authRoute(request, async () => {
    const input = await body(request);
    const kind =
      input.intent === "login"
        ? "login"
        : input.intent === "install"
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
    const url = startFlow(session, kind);
    await saveSession(token!, session);
    const response = json({ url });
    setSessionCookie(response, token!);
    return response;
  });
}
