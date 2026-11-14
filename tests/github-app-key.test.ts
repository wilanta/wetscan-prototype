import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
import { getSession, newSession, saveSession } from "../src/lib/auth/session";
import { startFlow, verifyAppConfiguration } from "../src/lib/auth/github";
import { POST as start } from "../src/app/api/auth/github/start/route";
import { GET as callback } from "../src/app/api/auth/github/callback/route";
const origin = "http://localhost:3111";
let directory: string;
let pem: string;
let fetcher: ReturnType<typeof vi.fn>;
function request(token: string, intent = "install") {
  return new NextRequest(origin + "/api/auth/github/start", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      cookie: "wetscan_session=" + token,
    },
    body: JSON.stringify({ intent }),
  });
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "wetscan-app-key-test-"));
  pem = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs1", format: "pem" })
    .toString();
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("AUTH_DATA_DIR", directory);
  vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("hex"));
  vi.stubEnv("GITHUB_APP_ID", "123");
  vi.stubEnv("GITHUB_APP_SLUG", "test-app");
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "fixture-client");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "fixture-only");
});
beforeEach(() => {
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", pem);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          id: 123,
          slug: "test-app",
          client_id: "fixture-client",
          permissions: { metadata: "read", contents: "read" },
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  const target = resolve(directory);
  if (
    !basename(target).startsWith("wetscan-app-key-test-") ||
    relative(resolve(tmpdir()), target).startsWith("..")
  )
    throw new Error("Unsafe test cleanup");
  await rm(target, { recursive: true, force: true });
});
describe("GitHub App signing-key regression", () => {
  it("returns a safe configuration error instead of HTTP 500 for an undecodable key", async () => {
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "fixture-invalid-key-do-not-log");
    const { token, session } = await newSession({
      workspace: "Key regression",
      expiresAt: Date.now() + 600000,
    });
    startFlow(session, "login");
    await saveSession(token, session);
    const response = await start(request(token));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "github_app_key_invalid" });
    expect(fetcher).not.toHaveBeenCalled();
    expect((await getSession(token))!.flow!.state).toBe(session.flow!.state);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      "fixture-invalid-key-do-not-log",
    );
  });
  it("rejects the runtime regression: a PEM header without its footer", async () => {
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "-----BEGIN RSA PRIVATE KEY-----");
    const { token } = await newSession({
      workspace: "Truncated PEM regression",
      expiresAt: Date.now() + 600000,
    });
    const response = await start(request(token));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "github_app_key_invalid" });
    expect(fetcher).not.toHaveBeenCalled();
    expect((await getSession(token))!.flow).toBeUndefined();
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).toContain(
      "missing_pem_footer",
    );
  });
  it.each([
    "PEM",
    "CRLF",
    "escaped LF",
    "escaped CRLF",
    "surrounding whitespace",
  ])("accepts a valid RSA key using %s", async (format) => {
    const value =
      format === "CRLF"
        ? pem.replace(/\n/g, "\r\n")
        : format === "escaped LF"
          ? pem.replace(/\n/g, "\\n")
          : format === "escaped CRLF"
            ? pem.replace(/\n/g, "\\r\\n")
            : format === "surrounding whitespace"
              ? "\uFEFF  \n" + pem + "\n  "
              : pem;
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", value);
    const { token } = await newSession({
      workspace: "Key regression",
      expiresAt: Date.now() + 600000,
    });
    const response = await start(request(token));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(new URL(result.url).pathname).toBe("/login/oauth/authorize");
    expect(JSON.stringify(result)).not.toContain("PRIVATE KEY");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await getSession(token))!.flow).toMatchObject({ kind: "connect" });
  });
  it.each([
    ["JSON-quoted PEM", () => JSON.stringify(pem)],
    [
      "double-escaped newlines",
      () => pem.replace(/\n/g, String.fromCharCode(92).repeat(2) + "n"),
    ],
    ["single-quoted PEM", () => "'" + pem + "'"],
  ])("accepts a valid RSA key transported as %s", async (_format, value) => {
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", value());
    await expect(verifyAppConfiguration()).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["-----BEGIN RSA PRIVATE KEY-----", "missing_pem_footer"],
    [
      "-----BEGIN RSA PRIVATE KEY-----\nfixture-truncated",
      "missing_pem_footer",
    ],
    [
      "-----BEGIN RSA PRIVATE KEY-----\nfixture-invalid-body\n-----END RSA PRIVATE KEY-----",
      "pem_decode_failed",
    ],
  ])(
    "logs only a safe format category for invalid PEM",
    async (value, category) => {
      vi.stubEnv("GITHUB_APP_PRIVATE_KEY", value);
      await expect(verifyAppConfiguration()).rejects.toMatchObject({
        code: "github_app_key_invalid",
        status: 503,
      });
      const logged = JSON.stringify(vi.mocked(console.warn).mock.calls);
      expect(logged).toContain(category);
      expect(logged).not.toContain("fixture-truncated");
      expect(logged).not.toContain("fixture-invalid-body");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("rejects a non-RSA key before requesting GitHub", async () => {
    vi.stubEnv(
      "GITHUB_APP_PRIVATE_KEY",
      generateKeyPairSync("ec", { namedCurve: "prime256v1" })
        .privateKey.export({ type: "pkcs8", format: "pem" })
        .toString(),
    );
    await expect(verifyAppConfiguration()).rejects.toMatchObject({
      code: "github_app_key_invalid",
      status: 503,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps upstream credential failures distinct from local key decoding", async () => {
    fetcher.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    await expect(verifyAppConfiguration()).rejects.toMatchObject({
      code: "github_app_credentials",
      status: 503,
    });
  });
  it("maps invalid keys in setup callbacks to the same safe configuration code", async () => {
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "fixture-invalid-key-do-not-log");
    const { token, session } = await newSession({
      workspace: "Key regression",
      expiresAt: Date.now() + 600000,
    });
    startFlow(session, "install");
    await saveSession(token, session);
    const response = await callback(
      new NextRequest(
        origin +
          "/api/auth/github/callback?" +
          new URLSearchParams({
            installation_id: "77",
            setup_action: "update",
            state: session.flow!.state,
          }),
        { headers: { cookie: "wetscan_session=" + token } },
      ),
    );
    expect(response.headers.get("location")).toBe(
      origin + "/onboarding?error=github_app_key_invalid",
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).toContain(
      "github_app_key_invalid",
    );
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      "fixture-invalid-key-do-not-log",
    );
  });
});
