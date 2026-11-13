import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({
  channel: process.env.AUTH_TEST_BROWSER_CHANNEL,
  baseURL: process.env.AUTH_TEST_BASE_URL ?? "http://127.0.0.1:3107",
});

test("landing entry, protected deep links, workspace persistence, and accessible onboarding", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Start for Free", exact: true }).first(),
  ).toBeVisible();
  await page.goto("/app/projects/orderly-demo/canvas");
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("link", { name: "Start for Free", exact: true }).click();
  await page.getByLabel("Workspace name").fill("Browser Test Workspace");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Connect GitHub", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Connect GitHub", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Workspace name")).toHaveValue(
    "Browser Test Workspace",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("No accessible repositories were returned.", {
      exact: false,
    }),
  ).toHaveCount(0);
  for (const width of [1440, 390]) {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "A clear view starts with your code.",
    );
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("onboarding-" + width + ".png"),
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Install GitHub App", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Authentication is not configured" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Connect GitHub", exact: true }),
  ).toBeVisible();
});

test("callback errors are safe and never imply successful installation", async ({
  page,
  request,
}) => {
  const response = await request.get(
    "/api/auth/github/callback?installation_id=77&state=invalid",
    { maxRedirects: 0 },
  );
  expect(response.status()).toBe(303);
  expect(response.headers().location).toContain("error=invalid_state");
  await page.goto("/onboarding?error=invalid_state");
  await expect(
    page.getByRole("alert").filter({ hasText: "This GitHub connection" }),
  ).toContainText("expired");
  await expect(
    page.getByRole("heading", { name: "Create workspace", exact: true }),
  ).toBeVisible();
  const mutation = await request.post("/api/onboarding", {
    headers: { origin: "https://evil.invalid" },
    data: { action: "workspace", workspace: "Forged" },
  });
  expect(mutation.status()).toBe(403);
});
