import { it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import { githubRequest } from "../../../src/lib/auth/github";
import { sourceRequest } from "../../../src/features/canvas/server/github-api";
import {
  safeGithubDiagnostic,
  transportDiagnostic,
} from "../../../src/lib/auth/provider-diagnostics";
afterEach(() => vi.unstubAllGlobals());
it.each([
  ["ENOTFOUND", "DNS"],
  ["CERT_HAS_EXPIRED", "TLS"],
  ["ECONNREFUSED", "CONNECTION"],
  ["CUSTOM_SECRET_MESSAGE", "UNKNOWN"],
])("safe diagnostic classifies %s without raw detail", (code, reason) => {
  const d = transportDiagnostic(
    { cause: { code }, message: "SECRET_VALUE", stack: "private stack" },
    "github_api",
  );
  expect(d).toEqual({ boundary: "github_api", reason });
  expect(JSON.stringify(d)).not.toContain("SECRET_VALUE");
});
it("API transport retains fail-closed HTTP502 and a safe network category", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue({
      cause: { code: "ENOTFOUND" },
      message: "cookie=DO_NOT_EXPOSE",
    }),
  );
  const e = await githubRequest("/user", "SYNTHETIC_ONLY").catch((e) => e);
  expect(e).toMatchObject({ code: "github_unavailable", status: 502 });
  expect(safeGithubDiagnostic(e)).toEqual({
    boundary: "github_api",
    reason: "DNS",
  });
});
it("source transport distinguishes upstream failure without returning response bodies", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response("token=DO_NOT_EXPOSE", { status: 503 })),
  );
  const e = await sourceRequest(
    "/repositories/123",
    "SYNTHETIC_ONLY",
    new AbortController().signal,
  ).catch((e) => e);
  expect(e).toMatchObject({ code: "github_unavailable", status: 502 });
  expect(safeGithubDiagnostic(e)).toEqual({
    boundary: "github_source",
    reason: "UPSTREAM_HTTP",
    upstreamStatus: 503,
  });
  expect(JSON.stringify(e)).not.toContain("DO_NOT_EXPOSE");
});
