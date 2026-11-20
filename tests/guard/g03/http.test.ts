import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  authorize: vi.fn(),
  runtime: vi.fn(),
  state: vi.fn(),
  generate: vi.fn(),
  exportReport: vi.fn(),
}));
vi.mock("../../../src/features/guard/live/project", () => ({
  authorizeGuardProject: m.authorize,
}));
vi.mock("../../../src/features/guard/g03/runtime", () => ({
  g03Runtime: m.runtime,
}));
import { NextRequest } from "next/server";
import { AuthError } from "../../../src/lib/auth/config";
import { g03Route } from "../../../src/features/guard/g03/http";
const p = { projectId: "github-123", jobId: "a".repeat(64), action: "state" };
beforeEach(() => {
  vi.stubEnv("APP_URL", "http://127.0.0.1:3109");
  vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("hex"));
  vi.stubEnv("AUTH_DATA_DIR", join(tmpdir(), "wetscan-g03-http-no-records"));
  m.authorize.mockReset().mockResolvedValue({ grant: {}, repositoryId: "123" });
  m.runtime.mockReset().mockResolvedValue({
    state: m.state,
    generate: m.generate,
    exportReport: m.exportReport,
  });
  m.state.mockReset().mockResolvedValue({ proposals: [], retests: [] });
  m.generate.mockReset().mockResolvedValue({ state: "completed" });
  m.exportReport.mockReset().mockResolvedValue({
    body: "<html>escaped test report</html>",
    reportId: "b".repeat(64),
    format: "html",
  });
});
afterEach(() => vi.unstubAllEnvs());
it("requires existing authentication and hides cross-project authorization failures", async () => {
  m.authorize.mockRejectedValueOnce(new AuthError("unauthenticated", 401));
  expect(
    (await g03Route(new NextRequest("http://127.0.0.1:3109/api"), p)).status,
  ).toBe(401);
  m.authorize.mockRejectedValueOnce(new AuthError("repository_denied", 403));
  expect(
    (await g03Route(new NextRequest("http://127.0.0.1:3109/api"), p)).status,
  ).toBe(404);
  expect(m.runtime).not.toHaveBeenCalled();
});
it.each([undefined, "https://attacker.invalid"])(
  "rejects mutation with origin %s before context/provider access",
  async (origin) => {
    const req = new NextRequest("http://127.0.0.1:3109/api", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(origin ? { origin } : {}),
      },
      body: "{}",
    });
    expect((await g03Route(req, { ...p, action: "generate" })).status).toBe(
      403,
    );
    expect(m.runtime).not.toHaveBeenCalled();
  },
);
it("GET state is private/no-store and cannot launch a provider or scanner", async () => {
  const r = await g03Route(new NextRequest("http://127.0.0.1:3109/api"), p);
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(r.headers.get("vary")).toBe("Cookie");
  expect(m.generate).not.toHaveBeenCalled();
});
it("enforces method, path, query and body bounds", async () => {
  expect(
    (
      await g03Route(new NextRequest("http://127.0.0.1:3109/api"), {
        ...p,
        action: "generate",
      })
    ).status,
  ).toBe(405);
  expect(
    (await g03Route(new NextRequest("http://127.0.0.1:3109/api?target=x"), p))
      .status,
  ).toBe(400);
  expect(
    (
      await g03Route(new NextRequest("http://127.0.0.1:3109/api"), {
        ...p,
        jobId: "bad",
      })
    ).status,
  ).toBe(404);
  const req = new NextRequest("http://127.0.0.1:3109/api", {
    method: "POST",
    headers: {
      origin: "http://127.0.0.1:3109",
      "content-type": "application/json",
    },
    body: JSON.stringify({ value: "x".repeat(5000) }),
  });
  expect((await g03Route(req, { ...p, action: "generate" })).status).toBe(413);
  expect(m.generate).not.toHaveBeenCalled();
});
it("audited server export uses attachment, HTML sandbox, no-store and safe filename", async () => {
  const req = new NextRequest("http://127.0.0.1:3109/api", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3109",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    r = await g03Route(req, { ...p, action: "export" });
  expect(r.status).toBe(200);
  expect(r.headers.get("content-disposition")).toContain("attachment;");
  expect(r.headers.get("content-security-policy")).toContain(
    "sandbox; default-src 'none'",
  );
  expect(r.headers.get("x-content-type-options")).toBe("nosniff");
});
it("unexpected provider/SQL failures never expose error bodies", async () => {
  m.runtime.mockRejectedValueOnce(Error("SECRET_SQL_OR_PROVIDER_BODY"));
  const r = await g03Route(new NextRequest("http://127.0.0.1:3109/api"), p);
  expect(r.status).toBe(503);
  expect(await r.text()).toBe('{"error":"g03_unavailable"}');
});
