import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const baseURL = "http://127.0.0.1:3109";
test.use({ channel: process.env.AUTH_TEST_BROWSER_CHANNEL, baseURL });
async function dashboard(page: Page, id: number) {
  const workspace = "Dashboard workspace " + id;
  const email = `dashboard-${id}@example.test`;
  await page.route(
    "https://github.com/login/oauth/authorize?*",
    async (route) => {
      const authorization = new URL(route.request().url());
      const callback = new URL("/api/auth/github/callback", baseURL);
      callback.search = new URLSearchParams({
        code: `fixture-single-${id}`,
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
  await page.goto("/onboarding");
  await page.getByLabel("Workspace name").fill(workspace);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Install GitHub App", exact: true })
    .click();
  await expect(
    page.getByText("fixture/wetscan-web", { exact: true }),
  ).toBeVisible();
  await page.locator('input[name="repositories"]').check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[name="email"]').fill(email);
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await expect(page).toHaveURL(baseURL + "/app");
  await expect(page.locator(".account-workspace strong")).toHaveText(workspace);
  return { workspace, email };
}
async function accountMenu(page: Page) {
  await page
    .locator(".topbar-actions")
    .getByRole("button", { name: "Open account menu", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Your account", exact: true });
}
test("dashboard shows saved account data and logout invalidates protected routes and history", async ({
  page,
  context,
}) => {
  const { workspace, email } = await dashboard(page, 201);
  await page.screenshot({
    path: test.info().outputPath("dashboard-session-desktop.png"),
    fullPage: true,
  });
  await expect(page.locator(".account-workspace small")).toHaveText(
    "1 connected repository",
  );
  const summary = page.getByRole("region", {
    name: "Connected repositories summary",
  });
  await expect(summary.locator(".repository-count")).toHaveText("01");
  await expect(summary.locator(".repository-summary-name")).toHaveText(
    "fixture/wetscan-web",
  );
  await expect(
    page.getByRole("link", { name: "Connect repository", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "View repositories", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Your account",
    exact: true,
  });
  await expect(dialog.getByText("fixture-user", { exact: true })).toBeVisible();
  await expect(dialog.getByText(email, { exact: true })).toBeVisible();
  await expect(dialog.getByText(workspace, { exact: true })).toBeVisible();
  await expect(
    dialog.getByText("fixture/wetscan-web", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("img", { name: "Avatar placeholder", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Avatar placeholder: no avatar is saved in your profile."),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("link", { name: "Workspace activity", exact: true })
    .click();
  await expect(page).toHaveURL(baseURL + "/app/activity");
  const oldCookie = (await context.cookies()).find(
    (item) => item.name === "wetscan_session",
  )!;
  await accountMenu(page);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(baseURL + "/");
  await expect(
    page.getByRole("link", { name: "Start for Free", exact: true }).first(),
  ).toBeVisible();
  expect(
    (await context.cookies()).some((item) => item.name === "wetscan_session"),
  ).toBe(false);
  const replay = await page.request.get(
    baseURL + "/app/projects/orderly-demo/canvas",
    {
      maxRedirects: 0,
      headers: { cookie: "wetscan_session=" + oldCookie.value },
    },
  );
  expect(replay.status()).toBe(307);
  expect(new URL(replay.headers().location, baseURL).pathname).toBe("/login");
  await page.goBack();
  await expect(page).toHaveURL(baseURL + "/login");
  for (const path of ["/app", "/app/projects/orderly-demo/canvas"]) {
    await page.goto(path);
    await expect(page).toHaveURL(baseURL + "/login");
  }
});
test("missing profile fields use clear placeholders and preserve the mobile layout", async ({
  page,
}, testInfo) => {
  await dashboard(page, 202);
  await page.route("**/api/onboarding", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        step: "complete",
        connected: true,
        profile: {
          login: "",
          email: null,
          workspace: null,
          repositories: null,
        },
      }),
    }),
  );
  await page.reload();
  await expect(page.locator(".account-workspace strong")).toHaveText(
    "Workspace unavailable",
  );
  await expect(
    page.locator(".repository-summary:visible .repository-count"),
  ).toHaveText("--");
  await expect(
    page.getByRole("link", { name: "Connect repository", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Retry repositories", exact: true }),
  ).toBeVisible();
  let dialog = await accountMenu(page);
  for (const text of [
    "User unavailable",
    "Email not provided",
    "Workspace unavailable",
    "Repository information unavailable.",
  ])
    await expect(dialog.getByText(text, { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.setViewportSize({ width: 390, height: 900 });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Open account menu", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Your account", exact: true });
  await expect(
    dialog.getByRole("button", { name: "Log out", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("dashboard-account-mobile.png"),
    fullPage: true,
  });
});
test("account request failure leaves dashboard usable and retry recovers the actual profile", async ({
  page,
}) => {
  const { workspace } = await dashboard(page, 203);
  await page.route("**/api/onboarding", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "server_error" }),
    }),
  );
  await page.reload();
  await expect(page.locator(".account-workspace small")).toHaveText(
    "Account data unavailable",
  );
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const dialog = await accountMenu(page);
  await expect(
    dialog.getByText("Account details are unavailable.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.locator(".repository-summary:visible .repository-count"),
  ).toHaveText("--");
  await expect(
    page.getByRole("link", { name: "Connect repository", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Retry account details" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.unroute("**/api/onboarding");
  await page
    .getByRole("button", { name: "Retry repositories", exact: true })
    .click();
  await expect(page.locator(".account-workspace small")).toHaveText(
    "1 connected repository",
  );
  await expect(
    page.locator(".repository-summary:visible .repository-count"),
  ).toHaveText("01");
  await page
    .getByRole("button", { name: "View repositories", exact: true })
    .click();
  await expect(dialog.getByText(workspace, { exact: true })).toBeVisible();
});
test("failed logout keeps the session and offers retry instead of claiming success", async ({
  page,
  context,
}) => {
  await dashboard(page, 204);
  await page.route("**/api/auth/logout", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "server_error" }),
    }),
  );
  const dialog = await accountMenu(page);
  await dialog.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Could not log out. Please try again.",
  );
  await expect(page).toHaveURL(baseURL + "/app");
  expect(
    (await context.cookies()).some((item) => item.name === "wetscan_session"),
  ).toBe(true);
  await page.unroute("**/api/auth/logout");
  await dialog.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(baseURL + "/");
  await expect(
    page.getByRole("link", { name: "Start for Free", exact: true }).first(),
  ).toBeVisible();
});
test("a restored dashboard checks the existing session again after logout in another tab", async ({
  page,
}) => {
  await dashboard(page, 205);
  const response = await page.request.post(baseURL + "/api/auth/logout", {
    headers: { origin: baseURL },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await expect(page).toHaveURL(baseURL + "/login");
});

test("an available empty selection shows matching zero counts and Connect repository", async ({
  page,
}) => {
  await dashboard(page, 206);
  // View-only fixture: the real authenticated server profile is unchanged.
  await page.route("**/api/onboarding", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({
      response,
      json: { ...data, profile: { ...data.profile, repositories: [] } },
    });
  });
  await page.reload();
  await expect(page.locator(".account-workspace small")).toHaveText(
    "0 connected repositories",
  );
  const summary = page.getByRole("region", {
    name: "Connected repositories summary",
  });
  await expect(summary.locator(".repository-count")).toHaveText("00");
  await expect(
    summary.getByText("No repositories selected", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Connect repository", exact: true }),
  ).toHaveAttribute("href", "/onboarding");
  await expect(
    page.getByRole("button", { name: "View repositories", exact: true }),
  ).toHaveCount(0);
});

test("multiple saved view entries share the sidebar count and View repositories opens the complete list", async ({
  page,
}, testInfo) => {
  await dashboard(page, 207);
  // Isolated display fixtures, never application data or claimed live repositories.
  const repositories = [
    {
      id: 101,
      fullName: "fixture/" + "long-repository-name-".repeat(5),
      defaultBranch: "main",
      private: true,
    },
    {
      id: 102,
      fullName: "fixture/worker",
      defaultBranch: "release",
      private: false,
    },
  ];
  await page.route("**/api/onboarding", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({
      response,
      json: { ...data, profile: { ...data.profile, repositories } },
    });
  });
  await page.reload();
  await expect(page.locator(".account-workspace small")).toHaveText(
    "2 connected repositories",
  );
  const summary = page.getByRole("region", {
    name: "Connected repositories summary",
  });
  await expect(summary.locator(".repository-count")).toHaveText("02");
  await expect(summary.locator(".repository-summary-name")).toHaveText(
    repositories[0].fullName,
  );
  await expect(summary.locator(".repository-summary-name")).toHaveAttribute(
    "title",
    repositories[0].fullName,
  );
  await expect(summary.getByText("+1 more", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Connect repository", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("overview-shared-repositories-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "View repositories", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Your account",
    exact: true,
  });
  for (const repo of repositories)
    await expect(
      dialog.getByText(repo.fullName, { exact: true }),
    ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
});

test("loading the shared account does not briefly render an empty repository selection", async ({
  page,
}) => {
  await dashboard(page, 208);
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/api/onboarding", async (route) => {
    const response = await route.fetch();
    started();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.reload();
    await requested;
    await expect(page.locator(".account-workspace strong")).toHaveText(
      "Loading workspace...",
    );
    await expect(
      page.locator(".repository-summary:visible .repository-count"),
    ).toHaveText("--");
    await expect(
      page.getByRole("button", {
        name: "Loading repositories...",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("link", { name: "Connect repository", exact: true }),
    ).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.locator(".account-workspace small")).toHaveText(
    "1 connected repository",
  );
  await expect(
    page.locator(".repository-summary:visible .repository-count"),
  ).toHaveText("01");
  await expect(
    page.getByRole("button", { name: "View repositories", exact: true }),
  ).toBeVisible();
});
