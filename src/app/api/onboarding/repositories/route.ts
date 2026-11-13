import { NextRequest } from "next/server";
import { AuthError } from "@/lib/auth/config";
import { accessibleRepositories } from "@/lib/auth/github";
import { authRoute, json } from "@/lib/auth/http";
import {
  getSession,
  profileFor,
  requestToken,
  saveSession,
} from "@/lib/auth/session";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  return authRoute(request, async () => {
    const token = requestToken(request);
    const session = await getSession(token);
    const profile = await profileFor(session);
    if (!session || !profile) throw new AuthError("unauthenticated", 401);
    if (!profile.installationId)
      throw new AuthError("installation_required", 409);
    const repositories = await accessibleRepositories(
      session,
      profile.installationId,
    );
    await saveSession(token!, session);
    return json({ repositories });
  });
}
