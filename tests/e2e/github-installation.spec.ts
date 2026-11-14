import { expect, test } from "@playwright/test";

const baseURL =
  process.env.AUTH_GITHUB_TEST_BASE_URL ?? "http://127.0.0.1:3108";
test.use({ channel: process.env.AUTH_TEST_BROWSER_CHANNEL, baseURL });

async function beforeInstallation(
  page: import("@playwright/test").Page,
  identity = 8111,
) {
  await page.route(
    "https://github.com/login/oauth/authorize?*",
    async (route) => {
      const authorization = new URL(route.request().url());
      const callback = new URL("/api/auth/github/callback", baseURL);
      callback.search = new URLSearchParams({
        code: "e2e-before-install-code-" + identity,
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
  await page.route("**/api/auth/github/callback?*", async (route) => {
    const incoming = new URL(route.request().url());
    if (!incoming.searchParams.has("code")) {
      await route.fallback();
      return;
    }
    const response = await route.fetch({ maxRedirects: 0 });
    const location = response.headers().location;
    if (location?.startsWith("https://github.com/apps/")) {
      // OAuth discovery now precedes installation. Reset browser navigation so
      // the existing installation route fixture also handles this redirect.
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
}

test("installation setup and separate OAuth return to repository selection with the session intact", async ({
  page,
  context,
}) => {
  let installationState = "";
  let authorizationVisited = false;
  await page.route(
    "https://github.com/apps/wetscan-test-app/installations/new?*",
    async (route) => {
      const url = new URL(route.request().url());
      installationState = url.searchParams.get("state")!;
      expect(installationState).toMatch(/^[a-f0-9]{64}$/);
      const setup = new URL("/api/auth/github/callback", baseURL);
      setup.search = new URLSearchParams({
        installation_id: "77",
        setup_action: "install",
        state: installationState,
      }).toString();
      // A new navigation lets Playwright intercept the setup request; route()
      // only handles the first URL in an HTTP redirect chain.
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body:
          "<script>location.replace(" +
          JSON.stringify(setup.toString()) +
          ")</script>",
      });
    },
  );
  await page.route("**/api/auth/github/callback?*", async (route) => {
    const incoming = new URL(route.request().url());
    if (incoming.searchParams.has("code")) {
      await route.continue();
      return;
    }
    // Exercise the real setup handler and inspect its OAuth redirect without
    // following it to GitHub. Only GitHub's user-consent result is substituted.
    const response = await route.fetch({ maxRedirects: 0 });
    expect(response.status()).toBe(303);
    const authorization = new URL(response.headers().location);
    authorizationVisited = true;
    expect(authorization.origin + authorization.pathname).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(authorization.searchParams.get("redirect_uri")).toBe(
      baseURL + "/api/auth/github/callback",
    );
    expect(authorization.searchParams.get("state")).not.toBe(installationState);
    expect(authorization.searchParams.get("code_challenge_method")).toBe(
      "S256",
    );
    const callback = new URL("/api/auth/github/callback", baseURL);
    callback.search = new URLSearchParams({
      code: "e2e-fixture-code",
      state: authorization.searchParams.get("state")!,
    }).toString();
    await route.fulfill({
      response,
      headers: { ...response.headers(), location: callback.toString() },
    });
  });
  await beforeInstallation(page);
  await page.goto("/onboarding");
  await page
    .getByLabel("Workspace name")
    .fill("Installation Browser Regression");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Install GitHub App", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Select repositories", exact: true }),
  ).toBeVisible();
  expect(authorizationVisited).toBe(true);
  await expect(
    page.getByText("fixture/wetscan-web", { exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).origin).toBe(baseURL);
  const cookie = (await context.cookies()).find(
    (item) => item.name === "wetscan_session",
  )!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Lax");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Select repositories", exact: true }),
  ).toBeVisible();
  await page.locator('input[name="repositories"]').check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Set up account", exact: true }),
  ).toBeVisible();
});

test("a missing cross-site session fails safely instead of looping to the GitHub App", async ({
  page,
  context,
}) => {
  await page.route(
    "https://github.com/apps/wetscan-test-app/installations/new?*",
    async (route) => {
      const state = new URL(route.request().url()).searchParams.get("state")!;
      await context.clearCookies();
      const setup = new URL("/api/auth/github/callback", baseURL);
      setup.search = new URLSearchParams({
        installation_id: "77",
        setup_action: "install",
        state,
      }).toString();
      await route.fulfill({
        status: 302,
        headers: { location: setup.toString() },
      });
    },
  );
  await beforeInstallation(page, 8112);
  await page.goto("/onboarding");
  await page.getByLabel("Workspace name").fill("Missing Cookie Regression");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Install GitHub App", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "This GitHub connection" }),
  ).toContainText("expired");
  expect(new URL(page.url()).origin).toBe(baseURL);
});
