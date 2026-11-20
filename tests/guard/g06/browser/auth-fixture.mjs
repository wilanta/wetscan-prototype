// Test-only GitHub OAuth & source fixture for isolated G06 browser E2E on 127.0.0.1:3120.
import { generateKeyPairSync } from "node:crypto";
import { basename } from "node:path";
import { canvasSourceFixture } from "../../../auth/canvas-source-fixture.mjs";

if (
  process.env.WETSCAN_G06_BROWSER_E2E !== "1" ||
  process.env.APP_URL !== "http://127.0.0.1:3120" ||
  !basename(process.env.AUTH_DATA_DIR ?? "").startsWith("wetscan-g06-e2e-")
) {
  throw new Error("G06 auth fixture requires the isolated G06 E2E server on 127.0.0.1:3120");
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
const installation = (id) => ({
  id,
  app_id: 123,
  suspended_at: null,
  permissions,
  account: { login: `team-${id}` },
});

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
    return nativeFetch(input, init);
  }
  if (url.origin === "https://github.com" && url.pathname === "/login/oauth/access_token") {
    const body = JSON.parse(init?.body ?? "{}");
    const match = /^fixture-(single|multiple|none|oautherror)-(\d+)$/.exec(body.code ?? "");
    if (!match || !body.code_verifier || body.redirect_uri !== `${process.env.APP_URL}/api/auth/github/callback`) {
      return json({ error: "bad_verification_code" });
    }
    return json({
      access_token: `fixture-user-${match[1]}-${match[2]}`,
      expires_in: 28800,
    });
  }
  if (url.origin !== "https://api.github.com") {
    throw new Error(`External network disabled in G06 E2E: ${url.origin}`);
  }
  const authorization = new Headers(init?.headers).get("authorization") ?? "";
  const user = /^Bearer fixture-user-(single|multiple|none)-(\d+)$/.exec(authorization);
  if (url.pathname === "/app") {
    return json({ id: 123, slug: "wetscan-test-app", client_id: "fixture-client", permissions });
  }
  const appInst = /^\/app\/installations\/(\d+)$/.exec(url.pathname);
  if (appInst) return json(installation(Number(appInst[1])));
  if (url.pathname === "/user") {
    return user ? json({ id: 70000 + Number(user[2]), login: "fixture-user" }) : json({}, 401);
  }
  if (url.pathname === "/user/installations") {
    return user ? json({ installations: [installation(77)] }) : json({}, 401);
  }
  if (/^\/app\/installations\/(77)\/access_tokens$/.test(url.pathname)) {
    return json({
      token: "fixture-installation",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });
  }
  if (url.pathname === "/installation/repositories" || /^\/user\/installations\/77\/repositories$/.test(url.pathname)) {
    return json({
      repositories: [
        { id: 101, full_name: "fixture/wetscan-web", private: true, default_branch: "main" },
      ],
    });
  }
  if (url.pathname === "/installation/token" && init?.method === "DELETE") {
    return new Response(null, { status: 204 });
  }
  const source = canvasSourceFixture(url);
  if (source) return source;
  return json({}, 404);
};
