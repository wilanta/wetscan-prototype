import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/config";
import { requireOrigin } from "@/lib/auth/http";
import { requestToken } from "@/lib/auth/session";
import { projectCanvasService } from "@/features/canvas/server/project-service";
import { authorizeGuardProject } from "../live/project";
import { G06Error } from "./contracts";
import { G06DisabledError, g06Host, isG06Enabled } from "./runtime";
import { renderUnifiedReportHtml } from "./unified-report";

const G06_RESOURCES = [
  "overview",
  "canvas",
  "intelligence",
  "sentinel",
  "reports",
  "audit",
] as const;

type G06Resource = (typeof G06_RESOURCES)[number];

const securityHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

const MAX_G06_JSON_BYTES = 65_536;

const jsonReply = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: securityHeaders });

async function boundedJson(request: Request): Promise<Record<string, unknown>> {
  const ct = request.headers.get("content-type")?.split(";")[0]?.trim();
  const ce = request.headers.get("content-encoding");
  if (ct !== "application/json" || ![null, "identity"].includes(ce)) {
    throw new G06Error("invalid_input", 415, "Expected application/json identity body.");
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_G06_JSON_BYTES)) {
    throw new G06Error("invalid_input", 413, "Request payload too large.");
  }
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > MAX_G06_JSON_BYTES) {
      await reader.cancel();
      throw new G06Error("invalid_input", 413, "Request payload exceeds limit.");
    }
    chunks.push(part.value);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new G06Error("invalid_input", 400, "Malformed JSON payload.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new G06Error("invalid_input", 400, "Expected JSON object body.");
  }
  return parsed as Record<string, unknown>;
}

export async function handleG06Request(
  request: NextRequest,
  projectId: string,
  resource: string,
): Promise<NextResponse> {
  try {
    if (
      !/^github-[1-9]\d{0,15}$/.test(projectId) ||
      !G06_RESOURCES.includes(resource as G06Resource)
    ) {
      return jsonReply({ error: "not_found" }, 404);
    }
    if (request.method !== "GET" && request.method !== "POST") {
      return jsonReply({ error: "method_not_allowed" }, 405);
    }
    if (request.method !== "GET") {
      requireOrigin(request);
    }

    const token = requestToken(request);
    const authority = await authorizeGuardProject(token, projectId);
    const scope = {
      workspaceId: authority.grant.workspaceId,
      projectId: authority.grant.projectId,
    };
    const resName = resource as G06Resource;

    if (!isG06Enabled()) {
      if (request.method === "GET" && resName === "overview") {
        return jsonReply({
          projectId,
          configured: false,
          scopeNote:
            "Guard G06 integrations are not enabled (GUARD_G06_ENABLED !== '1').",
          canvas: { latestOverlay: null },
          intelligence: { latestSync: null, outbox: [] },
          sentinel: { outbox: [], recentAttempts: [], consumerConfigured: false },
          reports: [],
        });
      }
      throw new G06DisabledError();
    }

    const host = await g06Host();
    const { service, store } = host;
    const url = new URL(request.url);

    if (request.method === "GET") {
      if (resName === "overview") {
        return jsonReply(await service.overview(authority));
      }

      if (resName === "canvas") {
        const revision = url.searchParams.get("revision")?.trim() || undefined;
        const scanId = url.searchParams.get("scanId")?.trim() || undefined;
        let graph = null;
        try {
          const entry = await projectCanvasService(token, projectId).cached(revision);
          graph = entry?.graph ?? null;
        } catch {
          graph = null;
        }
        const resolved = await service.resolveCanvasOverlay(authority, {
          graph,
          scanId,
          persist: Boolean(graph),
        });
        return jsonReply(resolved);
      }

      if (resName === "intelligence") {
        const [latestSync, history, outbox] = await Promise.all([
          store.latestIntelligenceSync(scope),
          store.listIntelligenceSync(scope, 20),
          store.listOutbox(scope, "intelligence_inventory", 20),
        ]);
        return jsonReply({
          projectId,
          consumerConfigured: host.intelligenceConsumerConfigured,
          latestSync,
          history,
          outbox,
        });
      }

      if (resName === "sentinel") {
        const [outbox, attempts] = await Promise.all([
          store.listOutbox(scope, "sentinel_pipeline", 20),
          store.listDeliveryAttempts(scope, undefined, 30),
        ]);
        return jsonReply({
          projectId,
          consumerConfigured: host.sentinelConsumerConfigured,
          outbox,
          attempts,
        });
      }

      if (resName === "reports") {
        const reportId = url.searchParams.get("reportId")?.trim();
        const format = url.searchParams.get("format")?.trim() || "json";
        const download = url.searchParams.get("download") === "1";

        if (reportId) {
          const report = await store.getReport(scope, reportId);
          if (!report) return jsonReply({ error: "not_found" }, 404);
          if (download) {
            await store.recordDownloadAudit(
              scope,
              report.reportId,
              format === "html" ? "html" : "json",
              authority.grant.actorId,
            );
          }
          if (format === "html") {
            const html = renderUnifiedReportHtml(report);
            return new NextResponse(html, {
              status: 200,
              headers: {
                ...securityHeaders,
                "Content-Type": "text/html; charset=utf-8",
                "Content-Security-Policy":
                  "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
                ...(download
                  ? {
                      "Content-Disposition": `attachment; filename="wetscan-guard-report-${report.reportId}.html"`,
                    }
                  : {}),
              },
            });
          }
          if (download) {
            return new NextResponse(JSON.stringify(report.body, null, 2), {
              status: 200,
              headers: {
                ...securityHeaders,
                "Content-Type": "application/json; charset=utf-8",
                "Content-Disposition": `attachment; filename="wetscan-guard-report-${report.reportId}.json"`,
              },
            });
          }
          return jsonReply({ report });
        }

        return jsonReply({ reports: await store.listReports(scope, 20) });
      }

      if (resName === "audit") {
        return jsonReply({ audit: await store.listAudit(scope, 50) });
      }
    }

    // ---- POST mutations ----------------------------------------------------------------------------------
    const body = await boundedJson(request);

    if (resName === "canvas") {
      const revision =
        typeof body.revision === "string" && body.revision.trim()
          ? body.revision.trim()
          : undefined;
      const scanId =
        typeof body.scanId === "string" && body.scanId.trim()
          ? body.scanId.trim()
          : undefined;
      const entry = await projectCanvasService(token, projectId).cached(revision);
      const resolved = await service.resolveCanvasOverlay(authority, {
        graph: entry?.graph ?? null,
        scanId,
        persist: Boolean(entry?.graph),
      });
      return jsonReply(resolved, resolved.record ? 201 : 200);
    }

    if (resName === "intelligence") {
      const scanId =
        typeof body.scanId === "string" && body.scanId.trim()
          ? body.scanId.trim()
          : undefined;
      const result = await service.syncIntelligence(authority, {
        scanId,
        dispatch: body.dispatch !== false,
      });
      return jsonReply(result, 201);
    }

    if (resName === "sentinel") {
      if (body.action === "retry" && typeof body.deliveryId === "string") {
        const result = await service.retryOutbox(
          authority,
          body.deliveryId,
          body.dispatch !== false,
        );
        return jsonReply(result);
      }
      const eventType =
        body.type === "remediation_retested"
          ? "remediation_retested"
          : "release_evaluated";
      const scanId =
        typeof body.scanId === "string" && body.scanId.trim()
          ? body.scanId.trim()
          : undefined;
      const result = await service.publishSentinelEvent(authority, {
        scanId,
        type: eventType,
        dispatch: body.dispatch !== false,
      });
      return jsonReply(result, 201);
    }

    if (resName === "reports") {
      const scanId =
        typeof body.scanId === "string" && body.scanId.trim()
          ? body.scanId.trim()
          : undefined;
      const report = await service.generateReport(authority, scanId);
      return jsonReply({ report }, 201);
    }

    return jsonReply({ error: "not_found" }, 404);
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonReply({ error: error.code }, error.status);
    }
    if (error instanceof G06DisabledError) {
      return jsonReply(
        { error: error.code, configured: false },
        error.status,
      );
    }
    if (error instanceof G06Error) {
      return jsonReply(
        { error: error.code, message: error.message },
        error.status,
      );
    }
    return jsonReply({ error: "g06_unavailable" }, 503);
  }
}
