// Explicitly opt-in test preload. Never imported by application/runtime source.
import { generateKeyPairSync } from "node:crypto";
import { basename } from "node:path";
if (
  process.env.WETSCAN_GITHUB_E2E !== "1" ||
  process.env.APP_URL !== "http://127.0.0.1:3108" ||
  !basename(process.env.AUTH_DATA_DIR ?? "").startsWith("wetscan-auth-browser-")
) {
  throw new Error(
    "GitHub fixture is restricted to the isolated local E2E server",
  );
}
Object.assign(process.env, {
  GITHUB_APP_ID: "123",
  GITHUB_APP_SLUG: "wetscan-test-app",
  GITHUB_APP_CLIENT_ID: "fixture-client",
  GITHUB_APP_CLIENT_SECRET: "fixture-secret",
  GITHUB_APP_PRIVATE_KEY: generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString(),
});
const nativeFetch = globalThis.fetch;
const repos = [
  {
    id: 101,
    full_name: "fixture/wetscan-web",
    private: true,
    default_branch: "main",
  },
];
const permissions = { metadata: "read", contents: "read" };
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost")
    return nativeFetch(input, init);
  if (
    url.origin === "https://github.com" &&
    url.pathname === "/login/oauth/access_token"
  ) {
    const body = JSON.parse(init?.body ?? "{}");
    const code = /^(e2e-fixture|e2e-before-install)-code(?:-(\d+))?$/.exec(
      body.code ?? "",
    );
    if (
      !code ||
      !body.code_verifier ||
      body.redirect_uri !== process.env.APP_URL + "/api/auth/github/callback"
    )
      return json({ error: "bad_verification_code" });
    return json({
      access_token:
        (code[1] === "e2e-before-install"
          ? "e2e-before-install-token-"
          : "e2e-user-token-") + (code[2] ?? "8111"),
      expires_in: 28800,
    });
  }
  if (url.origin !== "https://api.github.com")
    throw new Error("External network disabled in GitHub E2E fixture");
  if (url.pathname === "/app")
    return json({
      id: 123,
      slug: "wetscan-test-app",
      client_id: "fixture-client",
      permissions,
    });
  if (url.pathname === "/app/installations/77")
    return json({ id: 77, app_id: 123, suspended_at: null, permissions });
  if (url.pathname === "/user")
    return json({
      id: Number(
        /-(\d+)$/.exec(
          new Headers(init?.headers).get("authorization") ?? "",
        )?.[1] ?? 8111,
      ),
      login: "fixture-user",
    });
  if (url.pathname === "/user/installations")
    return json({
      installations: new Headers(init?.headers)
        .get("authorization")
        ?.startsWith("Bearer e2e-before-install-token-")
        ? []
        : [{ id: 77, app_id: 123, suspended_at: null }],
    });
  if (url.pathname === "/app/installations/77/access_tokens") {
    const body = JSON.parse(init?.body ?? "{}");
    if (
      body.permissions?.metadata !== "read" ||
      body.permissions?.contents !== "read"
    )
      return json({}, 422);
    return json({ token: "e2e-installation-token" });
  }
  if (
    url.pathname === "/installation/repositories" ||
    url.pathname === "/user/installations/77/repositories"
  )
    return json({ repositories: repos });
  if (url.pathname === "/installation/token" && init?.method === "DELETE")
    return new Response(null, { status: 204 });
  return json({}, 404);
};
