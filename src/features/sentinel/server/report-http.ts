import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requestToken } from "../../../lib/auth/session";
import {
  canvasIdentity,
  workspaceScope,
} from "../../canvas/server/github-reader";
import { authorizeSentinelProject } from "./project-context";
import { telemetryStore } from "./telemetry-runtime";
import { failure, reply } from "./telemetry-http";
import { TelemetryError } from "../telemetry/validation";
import { collectLiveReport } from "../reports/collect";
import {
  REPORT_WINDOWS,
  reportFilename,
  reportToCsv,
  type ReportWindow,
} from "../reports/live-report";

/**
 * Evidence-aware live report + authorized export. GET only; scope comes from the authenticated session and route
 * project, never from the query. `download=1` returns an attachment (JSON or CSV, nosniff, no-store).
 */
export async function reportRoute(request: NextRequest, projectId: string) {
  try {
    if (!/^github-[1-9]\d{0,15}$/.test(projectId))
      throw new TelemetryError("not_found", 404);
    if (request.method !== "GET")
      return reply({ error: "method_not_allowed" }, 405);
    const query = request.nextUrl.searchParams;
    const keys = [...query.keys()];
    if (
      keys.some((k) => !["days", "format", "download"].includes(k)) ||
      keys.length !== new Set(keys).size
    )
      throw new TelemetryError("invalid_query");
    const days = Number(query.get("days") ?? 7);
    if (!REPORT_WINDOWS.includes(days as ReportWindow))
      throw new TelemetryError("invalid_query");
    const format = query.get("format") ?? "json";
    if (
      !["json", "csv"].includes(format) ||
      ![null, "1"].includes(query.get("download"))
    )
      throw new TelemetryError("invalid_query");
    const token = requestToken(request),
      { profile } = await canvasIdentity(token);
    const context = await authorizeSentinelProject(token, {
      mode: "live",
      workspaceId: workspaceScope(profile),
      projectId,
    });
    const report = await collectLiveReport(
      (await telemetryStore()).db,
      context,
      days as ReportWindow,
    );
    if (query.get("download") !== "1" && format === "json")
      return reply(report);
    const file = reportFilename(
      projectId,
      report.generatedAt,
      format as "json" | "csv",
    );
    return new NextResponse(
      format === "csv" ? reportToCsv(report) : JSON.stringify(report, null, 2),
      {
        status: 200,
        headers: {
          "Content-Type":
            format === "csv"
              ? "text/csv; charset=utf-8"
              : "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${file}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          Vary: "Cookie",
        },
      },
    );
  } catch (error) {
    return failure(error);
  }
}
