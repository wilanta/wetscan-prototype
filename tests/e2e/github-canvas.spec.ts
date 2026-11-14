import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
const baseURL = "http://127.0.0.1:3109";
test.use({ channel: process.env.AUTH_TEST_BROWSER_CHANNEL, baseURL });
test("existing onboarding selection opens source-backed Canvas with isolated lenses and demo navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(
    "https://github.com/login/oauth/authorize?*",
    async (route) => {
      const authorization = new URL(route.request().url());
      const callback = new URL("/api/auth/github/callback", baseURL);
      callback.search = new URLSearchParams({
        code: "fixture-single-901",
        state: authorization.searchParams.get("state")!,
      }).toString();
      await route.fulfill({
        contentType: "text/html",
        body: `<script>location.replace(${JSON.stringify(callback.toString())})</script>`,
      });
    },
  );
  await page.goto("/onboarding");
  await page.getByLabel("Workspace name").fill("Canvas source workspace");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Install GitHub App", exact: true })
    .click();
  await page.locator('input[name="repositories"]').check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[name="email"]').fill("canvas@example.test");
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await expect(page).toHaveURL(baseURL + "/app");
  const repos = page.getByRole("region", {
    name: "Connected GitHub repositories",
  });
  await expect(
    repos.getByText("fixture/wetscan-web", { exact: true }),
  ).toBeVisible();
  await page.goto("/app/projects");
  await page
    .getByRole("link", { name: "Open Canvas for fixture/wetscan-web" })
    .click();
  await expect(page).toHaveURL(baseURL + "/app/projects/github-101/canvas");
  await expect(page.locator(".component-explorer")).toBeVisible();
  await expect(
    page.getByLabel("Canvas data source", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".topbar-actions")).toContainText("GitHub source");
  await expect(
    page.getByText("Revision: " + "a".repeat(40), { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Find a component", { exact: true }).fill("inventory");
  const component = page.locator(".component-list > button").first();
  await component.click();
  await expect(page.locator(".inspector h2")).toContainText("inventory");
  await expect(page.locator(".inspector")).toContainText(
    "src/app/api/inventory/route.ts",
  );
  await page.getByRole("button", { name: "Security", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Security coverage" }),
  ).toContainText("Guard: Not yet scanned");
  await expect(
    page.getByRole("region", { name: "Security coverage" }),
  ).toContainText("Sentinel: Monitoring not connected");
  await expect(
    page.getByRole("link", { name: "View evidence", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Trust", exact: true }).click();
  await expect(
    page.getByText(/Observed access remains Not tested/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await page
    .getByRole("button", { name: "Use example template", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Run workflow test/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Architecture", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export architecture JSON", exact: true })
    .click();
  const artifact = await download;
  const graph = JSON.parse(await readFile((await artifact.path())!, "utf8"));
  expect(JSON.stringify(graph)).not.toMatch(
    /fixture-installation|fixture-user-single|FIND-102|INC-1042/,
  );
  await page.screenshot({
    path: test.info().outputPath("authorized-github-canvas.png"),
    fullPage: true,
  });
  await page.goto("/app/projects/github-999/canvas");
  await expect(
    page.getByRole("heading", { name: "That page isn’t on this map." }),
  ).toBeVisible();
  await page.goto("/app/projects/github-101/canvas?revision=" + "c".repeat(40));
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "no longer the selected branch HEAD",
  );
  await page.goto("/app/projects/github-101/canvas");
  await page
    .getByRole("link", { name: "Open Orderly Demo", exact: true })
    .click();
  await expect(
    page.getByLabel("Canvas data source", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(8);
  await expect(page.locator(".topbar-actions")).toContainText("Demo mode");
  expect(errors).toEqual([]);
});

test("real project route requires authentication", async ({ page }) => {
  await page.goto("/app/projects/github-101/canvas");
  await expect(page).toHaveURL(/\/login$/);
});
