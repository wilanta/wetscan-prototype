import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../src/features/sentinel/server/telemetry-runtime", () => ({
  telemetryStore: vi.fn(),
}));
vi.mock("../../src/features/canvas/server/github-reader", () => ({
  canvasIdentity: vi.fn(),
  workspaceScope: () => "github-user-7:fixture",
}));
vi.mock("../../src/features/sentinel/server/project-context", () => ({
  authorizeSentinelProject: vi.fn(),
}));
vi.mock("../../src/lib/auth/http", async () => {
  const { AuthError } = await import("../../src/lib/auth/config");
  return {
    requireOrigin: (request: Request) => {
      if (request.headers.get("origin") !== "http://localhost:3000")
        throw new AuthError("invalid_origin", 403);
    },
  };
});
import { NextRequest } from "next/server";
import {
  readJson,
  ingestRoute,
  controlRoute,
  failure,
} from "../../src/features/sentinel/server/telemetry-http";
import { telemetryStore } from "../../src/features/sentinel/server/telemetry-runtime";
import { authorizeSentinelProject } from "../../src/features/sentinel/server/project-context";
import { canvasIdentity } from "../../src/features/canvas/server/github-reader";
import { AuthError } from "../../src/lib/auth/config";
import { PlatformError } from "../../src/platform/config";
import { issueCredential } from "../../src/features/sentinel/telemetry/validation";
import { randomUUID } from "node:crypto";
import { scope } from "../platform/helpers";
const context = {
  scope,
  actorId: "github-user-7",
  repositoryId: "123",
  canvasProjectRef: "github-user-7/github-123",
};
const credential = issueCredential(scope, randomUUID()).token;
function req(body: string, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/sentinel/ingest", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}
beforeEach(() => {
  vi.mocked(telemetryStore).mockReset();
  vi.mocked(canvasIdentity)
    .mockReset()
    .mockResolvedValue({ profile: { githubId: 7 } } as Awaited<
      ReturnType<typeof canvasIdentity>
    >);
  vi.mocked(authorizeSentinelProject).mockReset().mockResolvedValue(context);
});
afterEach(() => vi.useRealTimers());
describe("S02 HTTP trust boundaries (authorization/storage doubles)", () => {
  it("does not construct storage for missing/malformed credential", async () => {
    expect((await ingestRoute(req("{}"))).status).toBe(401);
    expect(
      (await ingestRoute(req("{}", { authorization: "Bearer invalid" })))
        .status,
    ).toBe(401);
    expect(telemetryStore).not.toHaveBeenCalled();
  });
  it("rejects query-string credential and malformed JSON before storage", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/sentinel/ingest?credential=private",
      { method: "POST" },
    );
    expect((await ingestRoute(request)).status).toBe(400);
    expect(
      (await ingestRoute(req("{", { authorization: `Bearer ${credential}` })))
        .status,
    ).toBe(400);
    expect(telemetryStore).not.toHaveBeenCalled();
  });
  it("streams and bounds body even if declared length lies", async () => {
    await expect(
      readJson(req('"' + "x".repeat(65536) + '"', { "content-length": "1" })),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readJson(req("{}", { "content-length": "9999999" })),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("rejects compressed, malformed UTF-8, and unsupported media", async () => {
    await expect(
      readJson(req("{}", { "content-encoding": "gzip" })),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readJson(req("{}", { "content-type": "text/plain" })),
    ).rejects.toMatchObject({ status: 415 });
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Uint8Array([0xff]),
    });
    await expect(readJson(request)).rejects.toThrow("invalid_json");
  });
  it("times out an incomplete stream even with a valid JSON prefix", async () => {
    vi.useFakeTimers();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{}"));
      },
    });
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit);
    const result = expect(readJson(request)).rejects.toMatchObject({
      status: 408,
    });
    await vi.advanceTimersByTimeAsync(5000);
    await result;
  });
  it("returns accepted receipt with no-store headers and no credential", async () => {
    const ingest = vi.fn(async () => ({
      batchId: randomUUID(),
      duplicate: false,
      events: [],
    }));
    vi.mocked(telemetryStore).mockResolvedValue({
      ingest,
    } as unknown as Awaited<ReturnType<typeof telemetryStore>>);
    const response = await ingestRoute(
      req("{}", { authorization: `Bearer ${credential}` }),
    );
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).not.toContain(credential);
    expect(ingest).toHaveBeenCalledWith(credential, {});
  });
  it("checks write origin before repository authorization or storage", async () => {
    const response = await controlRoute(req("{}"), scope.projectId, "sources");
    expect(response.status).toBe(403);
    expect(canvasIdentity).not.toHaveBeenCalled();
    expect(telemetryStore).not.toHaveBeenCalled();
  });
  it("requires fresh existing project authority on every read", async () => {
    vi.mocked(authorizeSentinelProject).mockRejectedValueOnce(
      new AuthError("forbidden", 403),
    );
    const response = await controlRoute(
      new NextRequest(
        "http://localhost/api/sentinel/projects/github-123/events",
      ),
      scope.projectId,
      "events",
    );
    expect(response.status).toBe(404);
    expect(telemetryStore).not.toHaveBeenCalled();
    expect(authorizeSentinelProject).toHaveBeenCalledWith(undefined, scope);
  });
  it("requires explicit owned-app confirmation and strict source fields", async () => {
    for (const input of [
      { action: "create", source: {} },
      {
        action: "create",
        ownedApplicationConfirmed: true,
        source: { name: "Local", origin: "demo", environment: "local" },
      },
      {
        action: "create",
        ownedApplicationConfirmed: true,
        source: {},
        workspaceId: "forged",
      },
    ]) {
      const response = await controlRoute(
        req(JSON.stringify(input), { origin: "http://localhost:3000" }),
        scope.projectId,
        "sources",
      );
      expect(response.status).toBe(400);
    }
    expect(telemetryStore).not.toHaveBeenCalled();
  });
  it("does not reflect driver messages or disclose unauthorized identifiers", async () => {
    expect(
      await failure(new Error("postgres://user:secret@db")).text(),
    ).not.toContain("secret");
    expect(failure(new PlatformError("approval_required")).status).toBe(503);
    expect(await failure(new AuthError("private-project", 404)).json()).toEqual(
      { error: "not_found" },
    );
  });
});
