import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requestToken } from "../../../lib/auth/session";
import { requireOrigin } from "../../../lib/auth/http";
import { AuthError } from "../../../lib/auth/config";
import { authorizeGuardProject } from "./project";
import { guardLiveService } from "./runtime";
import { LiveGuardError } from "./model";
import { GuardError } from "../security";
import { githubSourceAccess } from "./github-source";
import { sourceAcceptance } from "./source-acceptance";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
const reply = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers });
export async function boundedJson(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json" ||
    ![null, "identity"].includes(request.headers.get("content-encoding"))
  )
    throw new LiveGuardError("invalid_input", 415);
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 4096))
    throw new LiveGuardError("invalid_input", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new LiveGuardError("invalid_input", 400);
  const chunks: Uint8Array[] = [];
  let bytes = 0,
    timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, 5000);
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 4096) {
        await reader.cancel();
        throw new LiveGuardError("invalid_input", 413);
      }
      chunks.push(part.value);
    }
    if (timedOut) throw new LiveGuardError("invalid_input", 408);
    try {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
      ) as unknown;
    } catch {
      throw new LiveGuardError("invalid_input", 400);
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
export async function guardRoute(
  request: NextRequest,
  projectId: string,
  resource:
    | "readiness"
    | "scans"
    | "status"
    | "findings"
    | "evidence"
    | "coverage"
    | "cancel"
    | "source-acceptance"
    | "repository"
    | "preparation",
  id?: string,
) {
  try {
    if (!/^github-[1-9]\d{0,15}$/.test(projectId))
      throw new LiveGuardError("not_found", 404);
    if (request.method !== "GET") requireOrigin(request);
    const token = requestToken(request),
      authority = await authorizeGuardProject(token, projectId);
    if (resource === "repository" || resource === "preparation") {
      if (request.method !== "POST" || [...request.nextUrl.searchParams].length)
        throw new LiveGuardError("invalid_input", 400);
      const value = await boundedJson(request);
      if (resource === "repository") {
        const { verifyGuardRevision } = await import("./repository");
        return reply(
          await verifyGuardRevision(token, projectId, value, request.signal),
        );
      }
      const { preparationRequest } = await import("./preparation-request");
      return reply(
        await preparationRequest({
          authority,
          token,
          value,
          environment: process.env,
          signal: request.signal,
        }),
      );
    }
    if (resource === "source-acceptance") {
      if ([...request.nextUrl.searchParams].length)
        throw new LiveGuardError("invalid_input", 400);
      const value = await boundedJson(request);
      const { guardRevision } = await import("./revision");
      const revision =
        value && typeof value === "object" && "branch" in value
          ? guardRevision(value)
          : undefined;
      const source = githubSourceAccess(token, projectId, revision);
      return reply(
        await sourceAcceptance(
          revision ? await source.authorize() : authority,
          value,
          request.headers.get("origin") ?? "",
          source,
          process.env.GUARD_SOURCE_ACCEPTANCE_APPROVAL_FILE,
          request.signal,
        ),
      );
    }
    const service = await guardLiveService();
    if (resource !== "scans" && [...request.nextUrl.searchParams].length)
      throw new LiveGuardError("invalid_input", 400);
    if (resource === "readiness")
      return reply({
        status: "BLOCKED",
        ...service.readiness,
        scanAccepted: false,
      });
    if (resource === "scans") {
      if (request.method === "POST") {
        if ([...request.nextUrl.searchParams].length)
          throw new LiveGuardError("invalid_input", 400);
        return reply(
          await service.create(authority, await boundedJson(request)),
          202,
        );
      }
      return reply({
        scans: await service.list(authority, request.nextUrl.searchParams),
      });
    }
    if (resource === "cancel")
      return reply(await service.cancel(authority, id ?? ""));
    const { job, revision, coverage } = await service.get(authority, id ?? "");
    if (resource === "findings") return reply({ findings: job.findings });
    if (resource === "evidence")
      return reply({
        evidence: job.findings.flatMap((f) =>
          f.evidence.map((e) => ({ findingId: f.id, ...e })),
        ),
      });
    if (resource === "coverage") return reply({ coverage, engines: job.runs });
    return reply({
      scanId: job.id,
      revision,
      status: job.status,
      repository: job.repository,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt ?? null,
    });
  } catch (error) {
    if (error instanceof AuthError && error.code === "invalid_origin")
      return reply({ error: "invalid_origin" }, 403);
    if (error instanceof AuthError)
      return reply(
        {
          error:
            error.status === 403 || error.status === 404
              ? "not_found"
              : error.code,
        },
        error.status === 403 || error.status === 404 ? 404 : error.status,
      );
    if (error instanceof LiveGuardError)
      return reply({ error: error.code }, error.status);
    if (error instanceof GuardError) return reply({ error: "not_found" }, 404);
    // Fixed safe code only: no messages, stack, SQL, source, URLs, cookies or provider tokens.
    console.warn(
      "[WetScan Guard]",
      JSON.stringify({ reason: "guard_unavailable" }),
    );
    return reply({ error: "guard_unavailable" }, 503);
  }
}
