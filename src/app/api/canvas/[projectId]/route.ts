import { NextRequest, NextResponse } from "next/server";
import { requestToken } from "@/lib/auth/session";
import { body, requireOrigin } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/config";
import { projectCanvasService } from "@/features/canvas/server/project-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ projectId: string }> };
const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "Referrer-Policy": "no-referrer",
};
async function handle(request: NextRequest, context: Context) {
  const started = performance.now();
  try {
    const { projectId } = await context.params;
    let action: "load" | "check" | "refresh" | "reanalyze";
    if (request.method === "POST") {
      requireOrigin(request);
      const input = await body(request);
      if (!["refresh", "reanalyze"].includes(String(input.action)))
        throw new AuthError("invalid_input");
      action = input.action as "refresh" | "reanalyze";
    } else {
      const operation = request.nextUrl.searchParams.get("operation") ?? "load";
      if (operation !== "load" && operation !== "check")
        throw new AuthError("invalid_input");
      action = operation;
    }
    const revision = request.nextUrl.searchParams.get("revision") ?? undefined;
    if (revision && !/^[a-f0-9]{40}$/.test(revision))
      throw new AuthError("invalid_revision");
    const service = projectCanvasService(requestToken(request), projectId);
    const result = await service.load(action, revision);
    return NextResponse.json(result, {
      headers: {
        ...headers,
        "Server-Timing": `canvas;dur=${(performance.now() - started).toFixed(1)}, authorization;dur=${service.metrics.authorizationMs.toFixed(1)}, disk;dur=${service.metrics.cacheMs.toFixed(1)}, head;dur=${service.metrics.headMs.toFixed(1)}, analysis;dur=${service.metrics.analysisMs.toFixed(1)}`,
        "X-Canvas-Analysis-Runs": String(service.metrics.analysisRuns),
        "X-Canvas-Cache":
          result.state === "ready" && result.cached ? "HIT" : "MISS",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof AuthError ? error.code : "canvas_unavailable",
        clearGraph: true,
      },
      { status: error instanceof AuthError ? error.status : 503, headers },
    );
  }
}
export const GET = handle;
export const POST = handle;
