import { NextRequest, NextResponse } from "next/server";
import { getSession, profileFor, SESSION_COOKIE } from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  try {
    const session = await getSession(
      request.cookies.get(SESSION_COOKIE)?.value,
    );
    const profile = await profileFor(session);
    const path = request.nextUrl.pathname;
    let destination: string | undefined;
    if (!profile) destination = "/login";
    else if (path.startsWith("/app") && !profile.completedAt)
      destination = "/onboarding";
    if (destination) {
      const response = NextResponse.redirect(new URL(destination, request.url));
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    const response = NextResponse.redirect(
      new URL("/login?error=configuration", request.url),
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
export const config = { matcher: ["/app/:path*", "/account/:path*"] };
