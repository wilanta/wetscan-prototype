import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { AuthError, authConfig } from "./config";
import { exclusive } from "./store";

export function requireOrigin(request: NextRequest) {
  if (
    request.headers.get("origin") !== authConfig().origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new AuthError("invalid_origin", 403);
}
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
export function authRoute(
  request: NextRequest,
  work: () => Promise<NextResponse>,
) {
  return exclusive(async () => {
    try {
      if (request.method !== "GET") requireOrigin(request);
      return await work();
    } catch (error) {
      return json(
        { error: error instanceof AuthError ? error.code : "server_error" },
        error instanceof AuthError ? error.status : 500,
      );
    }
  });
}
export async function body(request: NextRequest) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AuthError("invalid_input", 415);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 16000) throw new AuthError("invalid_input", 413);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new AuthError("invalid_input");
    return parsed as Record<string, unknown>;
  } catch {
    throw new AuthError("invalid_input");
  }
}
