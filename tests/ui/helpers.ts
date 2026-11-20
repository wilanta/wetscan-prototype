import { expect, type Page } from "@playwright/test";
export const base = process.env.UI_TEST_BASE ?? "http://127.0.0.1:3109";
export const PROJECT = "/app/projects/orderly-demo";
let counter = Date.now() % 100000;
// Signs in through the stubbed GitHub flow (isolated server only) and lands on /app.
export async function enter(page: Page) {
  const id = counter++;
  await page.route("https://github.com/login/oauth/authorize?*", async (route) => {
    const u = new URL(route.request().url());
    const cb = new URL("/api/auth/github/callback", base);
    cb.search = new URLSearchParams({ code: "fixture-single-" + id, state: u.searchParams.get("state")! }).toString();
    await route.fulfill({ contentType: "text/html", body: "<script>location.replace(" + JSON.stringify(cb.toString()) + ")</script>" });
  });
  await page.goto("/onboarding");
  await page.getByLabel("Workspace name").fill("UI fixture " + id);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Install GitHub App", exact: true }).click();
  await expect(page.getByText("fixture/wetscan-web", { exact: true })).toBeVisible({ timeout: 20000 });
  await page.locator('input[name="repositories"]').check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[name="email"]').fill("ui-" + id + "@example.test");
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await expect(page).toHaveURL(base + "/app");
}
