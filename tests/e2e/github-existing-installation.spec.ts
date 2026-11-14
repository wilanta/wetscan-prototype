import { expect, test, type Page } from "@playwright/test";
const baseURL = "http://127.0.0.1:3109";
test.use({ channel: process.env.AUTH_TEST_BROWSER_CHANNEL, baseURL });
async function provider(
  page: Page,
  mode: string,
  identity: number,
  action = "install",
) {
  const visits = { oauth: 0, install: 0, setup: 0 };
  await page.route(
    "https://github.com/login/oauth/authorize?*",
    async (route) => {
      visits.oauth++;
      const authorization = new URL(route.request().url());
      expect(authorization.searchParams.get("code_challenge_method")).toBe(
        "S256",
      );
      expect(authorization.searchParams.get("code_challenge")).toMatch(
        /^[A-Za-z0-9_-]{43}$/,
      );
      expect(authorization.searchParams.get("redirect_uri")).toBe(
        baseURL + "/api/auth/github/callback",
      );
      const callback = new URL("/api/auth/github/callback", baseURL);
      const scenario = mode === "none" && visits.oauth > 1 ? "single" : mode;
      callback.search = new URLSearchParams({
        code: `fixture-${scenario}-${identity}`,
        state: authorization.searchParams.get("state")!,
      }).toString();
      await route.fulfill({
        contentType: "text/html",
        body:
          "<script>location.replace(" +
          JSON.stringify(callback.toString()) +
          ")</script>",
      });
    },
  );
  await page.route(
    "https://github.com/apps/wetscan-test-app/installations/new?*",
    async (route) => {
      visits.install++;
      expect(mode).toBe("none");
      const state = new URL(route.request().url()).searchParams.get("state")!;
      expect(state).toMatch(/^[a-f0-9]{64}$/);
      const callback = new URL("/api/auth/github/callback", baseURL);
      callback.search = new URLSearchParams({
        state,
        installation_id: "77",
        setup_action: action,
      }).toString();
      await route.fulfill({
        contentType: "text/html",
        body:
          "<script>location.replace(" +
          JSON.stringify(callback.toString()) +
          ")</script>",
      });
    },
  );
  await page.route("**/api/auth/github/callback?*", async (route) => {
    const incoming = new URL(route.request().url());
    if (incoming.searchParams.has("installation_id")) visits.setup++;
    const response = await route.fetch({ maxRedirects: 0 });
    expect(response.status()).toBe(303);
    const location = response.headers().location;
    if (location?.startsWith("https://github.com/")) {
      // Start a distinct browser navigation so provider route interception works
      // after the real server callback, preserving its Set-Cookie response.
      const headers: Record<string, string> = {
        ...response.headers(),
        "content-type": "text/html",
      };
      delete headers.location;
      delete headers["content-length"];
      await route.fulfill({
        response,
        status: 200,
        headers,
        body:
          "<script>location.replace(" + JSON.stringify(location) + ")</script>",
      });
    } else await route.fulfill({ response });
  });
  return visits;
}
async function begin(page: Page) {
  await page.goto("/onboarding");
  await page.getByLabel("Workspace name").fill("Existing installation E2E");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Install GitHub App", exact: true })
    .click();
}
async function connected(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Select repositories", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("fixture/wetscan-web", { exact: true }),
  ).toBeVisible();
  const state = await (
    await page.request.get(baseURL + "/api/onboarding")
  ).json();
  expect(state).toMatchObject({
    connected: true,
    authenticated: true,
    step: "repositories",
  });
}
test("one existing installation connects without installation/new or browser Back", async ({
  page,
  context,
}) => {
  const visits = await provider(page, "single", 1);
  await begin(page);
  await connected(page);
  expect(visits).toEqual({ oauth: 1, install: 0, setup: 0 });
  await page.reload();
  await connected(page);
  const cookie = (await context.cookies()).find(
    (item) => item.name === "wetscan_session",
  )!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Lax");
  // Use the existing onboarding Back control to exercise stored-ID reconnection.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page
    .getByRole("button", { name: "Install GitHub App", exact: true })
    .click();
  await connected(page);
  expect(visits).toEqual({ oauth: 1, install: 0, setup: 0 });
});
test("multiple installations survive reload; forged or inaccessible selections are denied", async ({
  page,
}) => {
  const visits = await provider(page, "multiple", 2);
  await begin(page);
  await expect(
    page.getByRole("button", { name: "Connect team-77", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Connect team-78", exact: true }),
  ).toBeVisible();
  for (const installationId of [999, 888, "77", 0]) {
    const response = await page.request.post(
      baseURL + "/api/auth/github/start",
      {
        headers: { origin: baseURL },
        data: { intent: "select", installationId },
      },
    );
    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({ error: "installation_denied" });
  }
  expect(
    (await (await page.request.get(baseURL + "/api/onboarding")).json())
      .connected,
  ).toBe(false);
  await page
    .getByRole("button", { name: "Connect team-78", exact: true })
    .click();
  await connected(page);
  expect(visits).toEqual({ oauth: 1, install: 0, setup: 0 });
});
for (const action of ["install", "update"]) {
  test(`zero installations proceeds through setup_action=${action} to verified repository selection`, async ({
    page,
  }) => {
    const visits = await provider(
      page,
      "none",
      action === "install" ? 3 : 4,
      action,
    );
    await begin(page);
    await connected(page);
    expect(visits).toEqual({ oauth: 2, install: 1, setup: 1 });
    await page.reload();
    await connected(page);
  });
}
test("OAuth credential errors remain specific and do not imply an installation succeeded", async ({
  page,
}) => {
  const visits = await provider(page, "oautherror", 5);
  await begin(page);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "GitHub App authentication failed" }),
  ).toBeVisible();
  expect(visits.install).toBe(0);
  expect(
    (await (await page.request.get(baseURL + "/api/onboarding")).json())
      .connected,
  ).toBe(false);
});
