// Test-only provider substitute. Production code never imports this module.
import { generateKeyPairSync } from "node:crypto";
import { basename } from "node:path";
if (
  process.env.WETSCAN_GITHUB_EXISTING_E2E !== "1" ||
  process.env.APP_URL !== "http://127.0.0.1:3109" ||
  !basename(process.env.AUTH_DATA_DIR ?? "").startsWith("wetscan-auth-browser-")
) {
  throw new Error(
    "Existing installation fixture requires the isolated E2E server",
  );
}
Object.assign(process.env, {
  GITHUB_APP_ID: "123",
  GITHUB_APP_SLUG: "wetscan-test-app",
  GITHUB_APP_CLIENT_ID: "fixture-client",
  GITHUB_APP_CLIENT_SECRET: "fixture-only",
  GITHUB_APP_PRIVATE_KEY: generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString(),
});
const nativeFetch = globalThis.fetch;
const permissions = { metadata: "read", contents: "read" };
const installation = (id, app_id = 123) => ({
  id,
  app_id,
  suspended_at: null,
  permissions,
  account: { login: "team-" + id },
});
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
    const match = /^fixture-(single|multiple|none|oautherror)-(\d+)$/.exec(
      body.code ?? "",
    );
    if (
      !match ||
      !body.code_verifier ||
      body.redirect_uri !== process.env.APP_URL + "/api/auth/github/callback"
    )
      return json({ error: "bad_verification_code" });
    if (match[1] === "oautherror")
      return json({ error: "incorrect_client_credentials" });
    return json({
      access_token: "fixture-user-" + match[1] + "-" + match[2],
      expires_in: 28800,
    });
  }
  if (url.origin !== "https://api.github.com")
    throw new Error("External network disabled in existing installation E2E");
  const authorization = new Headers(init?.headers).get("authorization") ?? "";
  const user = /^Bearer fixture-user-(single|multiple|none)-(\d+)$/.exec(
    authorization,
  );
  if (url.pathname === "/app")
    return json({
      id: 123,
      slug: "wetscan-test-app",
      client_id: "fixture-client",
      permissions,
    });
  const appInstallation = /^\/app\/installations\/(\d+)$/.exec(url.pathname);
  if (appInstallation)
    return json(
      installation(
        Number(appInstallation[1]),
        Number(appInstallation[1]) === 888 ? 999 : 123,
      ),
    );
  if (url.pathname === "/user")
    return user
      ? json({ id: 70000 + Number(user[2]), login: "fixture-user" })
      : json({}, 401);
  if (url.pathname === "/user/installations") {
    if (!user) return json({}, 401);
    return json({
      installations:
        user[1] === "none"
          ? []
          : user[1] === "multiple"
            ? [installation(77), installation(78)]
            : [installation(77)],
    });
  }
  if (/^\/app\/installations\/(77|78)\/access_tokens$/.test(url.pathname)) {
    const body = JSON.parse(init?.body ?? "{}");
    if (
      body.permissions?.metadata !== "read" ||
      body.permissions?.contents !== "read"
    )
      return json({}, 422);
    return json({ token: "fixture-installation" });
  }
  if (
    url.pathname === "/installation/repositories" ||
    /^\/user\/installations\/(77|78)\/repositories$/.test(url.pathname)
  ) {
    return json({
      repositories: [
        {
          id: 101,
          full_name: "fixture/wetscan-web",
          private: true,
          default_branch: "main",
        },
      ],
    });
  }
  if (url.pathname === "/installation/token" && init?.method === "DELETE")
    return new Response(null, { status: 204 });
  return json({}, 404);
};
