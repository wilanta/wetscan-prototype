import { NextRequest, NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/config";
import { authRoute } from "@/lib/auth/http";
import {
  clearSessionCookie,
  requestToken,
  sessionKey,
} from "@/lib/auth/session";
import { deleteRecord } from "@/lib/auth/store";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  return authRoute(request, async () => {
    const token = requestToken(request);
    if (token && /^[a-f0-9]{64}$/.test(token))
      await deleteRecord(sessionKey(token));
    const response = NextResponse.redirect(
      new URL("/", authConfig().origin),
      303,
    );
    response.headers.set("Cache-Control", "no-store");
    clearSessionCookie(response);
    return response;
  });
}
