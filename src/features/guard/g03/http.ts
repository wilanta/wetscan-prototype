import "server-only";
import { after, NextRequest, NextResponse } from "next/server";
import { requestToken } from "../../../lib/auth/session";
import { requireOrigin } from "../../../lib/auth/http";
import { AuthError } from "../../../lib/auth/config";
import { GuardError } from "../security";
import { LiveGuardError } from "../live/model";
import { authorizeGuardProject } from "../live/project";
import { boundedJson } from "../live/http";
import { G03Error } from "./contracts";
import { isSha } from "./safety";
import { g03Runtime } from "./runtime";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers });
export async function g03Route(
  request: NextRequest,
  p: { projectId: string; jobId: string; action: string },
) {
  try {
    if (!/^github-[1-9]\d{0,15}$/.test(p.projectId) || !isSha(p.jobId, 64))
      throw new G03Error("not_found", 404);
    if (
      [...request.nextUrl.searchParams].length ||
      ![
        "state",
        "context",
        "generate",
        "review",
        "publish",
        "pr-status",
        "retest",
        "compare",
        "report",
        "export",
      ].includes(p.action)
    )
      throw new G03Error("invalid_input", 400);
    if (request.method !== (p.action === "state" ? "GET" : "POST"))
      throw new G03Error("method_not_allowed", 405);
    if (request.method !== "GET") requireOrigin(request);
    const token = requestToken(request),
      a = await authorizeGuardProject(token, p.projectId);
    const service = await g03Runtime(token, a, (task) => after(task));
    if (p.action === "state") return json(await service.state(a, p.jobId));
    const body = await boundedJson(request),
      signal = AbortSignal.any([request.signal, AbortSignal.timeout(55000)]);
    switch (p.action) {
      case "context":
        return json(await service.context(a, p.jobId, body, signal));
      case "generate":
        return json(await service.generate(a, p.jobId, body, signal));
      case "review":
        return json(await service.review(a, p.jobId, body, signal));
      case "publish":
        return json(await service.publish(a, p.jobId, body, signal));
      case "pr-status":
        return json(await service.prStatus(a, p.jobId, body, signal));
      case "retest":
        return json(await service.startRetest(a, p.jobId, body, signal), 202);
      case "compare":
        return json(await service.compareRetest(a, p.jobId, body, signal));
      case "report":
        return json(await service.createReport(a, p.jobId, body));
      case "export": {
        const r = await service.exportReport(a, p.jobId, body);
        return new NextResponse(r.body, {
          headers: {
            ...headers,
            "Content-Type":
              r.format === "html"
                ? "text/html; charset=utf-8"
                : "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="guard-g03-${r.reportId}.${r.format}"`,
            "Content-Security-Policy":
              "sandbox; default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
          },
        });
      }
    }
    throw new G03Error("not_found", 404);
  } catch (error) {
    if (error instanceof G03Error || error instanceof LiveGuardError)
      return json({ error: error.code }, error.status);
    if (error instanceof GuardError) return json({ error: "not_found" }, 404);
    if (error instanceof AuthError)
      return json(
        {
          error:
            error.code === "invalid_origin"
              ? "invalid_origin"
              : error.status === 401
                ? "unauthenticated"
                : "not_found",
        },
        error.code === "invalid_origin"
          ? 403
          : error.status === 401
            ? 401
            : 404,
      );
    return json({ error: "g03_unavailable" }, 503);
  }
}
