import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requestToken } from "../../../lib/auth/session";
import { requireOrigin } from "../../../lib/auth/http";
import { AuthError } from "../../../lib/auth/config";
import { PlatformError } from "../../../platform/config";
import {
  canvasIdentity,
  workspaceScope,
} from "../../canvas/server/github-reader";
import { authorizeSentinelProject } from "./project-context";
import { telemetryStore } from "./telemetry-runtime";
import {
  credentialRoute,
  limits,
  object,
  TelemetryError,
  uuid,
  sourceInput,
} from "../telemetry/validation";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie, Authorization",
  "X-Content-Type-Options": "nosniff",
};
export function reply(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers });
}
export function failure(error: unknown) {
  if (error instanceof TelemetryError)
    return reply({ error: error.code }, error.status);
  if (error instanceof AuthError) {
    if (error.code === "invalid_origin")
      return reply({ error: "invalid_origin" }, 403);
    return reply(
      {
        error:
          error.status === 403 || error.status === 404
            ? "not_found"
            : error.code,
      },
      error.status === 403 || error.status === 404 ? 404 : error.status,
    );
  }
  if (error instanceof PlatformError)
    return reply({ error: "telemetry_not_configured" }, 503);
  return reply({ error: "telemetry_unavailable" }, 503);
}
export async function readJson(
  request: Request,
  maxBytes: number = limits.bodyBytes,
) {
  if (
    request.headers.get("content-type")?.split(";", 1)[0].trim() !==
      "application/json" ||
    ![null, "identity"].includes(request.headers.get("content-encoding"))
  )
    throw new TelemetryError("unsupported_media_type", 415);
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > maxBytes)
  )
    throw new TelemetryError("body_too_large", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new TelemetryError("invalid_json");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel();
  }, 5000);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new TelemetryError("body_too_large", 413);
      }
      chunks.push(value);
    }
    if (timedOut) throw new TelemetryError("body_timeout", 408);
    try {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
      );
    } catch {
      throw new TelemetryError("invalid_json");
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
/** Bounded process admission only; authenticated source limits are durable/transactional. */
let admission = { minute: 0, count: 0 };
export async function ingestRoute(request: NextRequest) {
  try {
    const minute = Math.floor(Date.now() / 60000);
    if (admission.minute !== minute) admission = { minute, count: 0 };
    if (++admission.count > 1500)
      throw new TelemetryError("admission_limited", 429);
    if ([...request.nextUrl.searchParams].length)
      throw new TelemetryError("invalid_query");
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer "))
      throw new TelemetryError("invalid_credential", 401);
    const credential = authorization.slice(7);
    credentialRoute(credential); // Validate length/shape before reading body or constructing a pool.
    const input = await readJson(request);
    const store = await telemetryStore();
    const receipt = await store.ingest(credential, input);
    return reply(receipt, receipt.duplicate ? 200 : 202);
  } catch (error) {
    return failure(error);
  }
}
export async function controlRoute(
  request: NextRequest,
  projectId: string,
  resource: "sources" | "events",
) {
  try {
    if (!/^github-[1-9]\d{0,15}$/.test(projectId))
      throw new TelemetryError("not_found", 404);
    if (request.method !== "GET") requireOrigin(request);
    // No outer auth-store lock: Canvas owns its own fresh-grant lock.
    const token = requestToken(request),
      { profile } = await canvasIdentity(token);
    const context = await authorizeSentinelProject(token, {
      mode: "live",
      workspaceId: workspaceScope(profile),
      projectId,
    });
    if (resource === "events") {
      const store = await telemetryStore();
      return reply(await store.events(context, request.nextUrl.searchParams));
    }
    if ([...request.nextUrl.searchParams].length)
      throw new TelemetryError("invalid_query");
    if (request.method === "GET") {
      const store = await telemetryStore();
      return reply({ sources: await store.sources(context) });
    }
    const input = object(await readJson(request, 4096), [
      "action",
      "sourceId",
      "source",
      "ownedApplicationConfirmed",
    ]);
    if (input.action === "create") {
      if (
        input.ownedApplicationConfirmed !== true ||
        input.sourceId !== undefined
      )
        throw new TelemetryError("owned_application_confirmation_required");
      const source = sourceInput(input.source);
      const store = await telemetryStore();
      return reply(await store.create(context, source), 201);
    }
    if (
      !["rotate", "revoke", "disable", "enable"].includes(
        String(input.action),
      ) ||
      input.source !== undefined ||
      input.ownedApplicationConfirmed !== undefined
    )
      throw new TelemetryError("invalid_action");
    const sourceId = uuid(input.sourceId),
      store = await telemetryStore();
    return reply(
      await store.change(
        context,
        sourceId,
        input.action as "rotate" | "revoke" | "disable" | "enable",
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
