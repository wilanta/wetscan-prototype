import { mapAction, inspectorEdits } from "../canvas/ui-actions";
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
  await expect(repos).toHaveCount(0); // Projects owns the repository directory.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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
  await page.getByText("Map tools", { exact: true }).click();
  await expect(
    page.getByText("Revision: " + "a".repeat(40), { exact: true }),
  ).toBeVisible();
  await page.getByText("Map tools", { exact: true }).click();
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
  await mapAction(page, "Export architecture JSON");
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
  await page.getByRole("link", { name: "Guard", exact: false }).first().click();
  await page
    .locator('.sidebar a[href="/app/projects/orderly-demo/canvas"]')
    .click();
  await expect(
    page.getByLabel("Canvas data source", { exact: true }),
  ).toHaveCount(0); // Production has no fixture picker.
  await expect(page.locator(".react-flow__node")).toHaveCount(8);
  await expect(page.locator(".topbar-actions")).toContainText("Demo mode");
  expect(errors).toEqual([]);
});

test("real project route requires authentication", async ({ page }) => {
  await page.goto("/app/projects/github-101/canvas");
  await expect(page).toHaveURL(/\/login$/);
});
test("Canvas cache endpoints reject missing sessions and cross-origin refreshes", async ({
  request,
}) => {
  const missing = await request.get(
    baseURL + "/api/canvas/github-101?operation=load",
  );
  expect(missing.status()).toBe(401);
  expect(missing.headers()["cache-control"]).toContain("no-store");
  expect(await missing.json()).toMatchObject({ clearGraph: true });
  const crossOrigin = await request.post(baseURL + "/api/canvas/github-101", {
    headers: { Origin: "https://untrusted.test" },
    data: { action: "refresh" },
  });
  expect(crossOrigin.status()).toBe(403);
});

test("cached map stays visible during checks and refresh failures, preserves notes on revision swaps and clears on denial", async ({
  page,
}) => {
  await page.route(
    "https://github.com/login/oauth/authorize?*",
    async (route) => {
      const authorization = new URL(route.request().url()),
        callback = new URL("/api/auth/github/callback", baseURL);
      callback.search = new URLSearchParams({
        code: "fixture-single-910",
        state: authorization.searchParams.get("state")!,
      }).toString();
      await route.fulfill({
        contentType: "text/html",
        body: `<script>location.replace(${JSON.stringify(callback.toString())})</script>`,
      });
    },
  );
  await page.goto("/onboarding");
  await page.getByLabel("Workspace name").fill("Canvas cache workspace");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Install GitHub App", exact: true })
    .click();
  await page.locator('input[name="repositories"]').check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[name="email"]').fill("canvas-cache@example.test");
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await page.goto("/app/projects/github-101/canvas");
  await expect(page.locator(".component-list > button").first()).toBeVisible();
  const cached = await page.request.get(
    "/api/canvas/github-101?operation=load",
  );
  expect(cached.headers()["x-canvas-cache"]).toBe("HIT");
  expect(cached.headers()["x-canvas-analysis-runs"]).toBe("0");
  const entry = (await cached.json()).entry;
  await page.reload();
  await expect(page.locator(".component-explorer:visible")).toHaveCount(1);
  await expect(page.getByLabel("Preparing architecture map")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("button", { name: "Check for updates", exact: true }),
  ).toBeEnabled();
  await page.locator(".component-list > button").first().click();
  await inspectorEdits(page);
  await page
    .getByLabel("Canvas note", { exact: true })
    .fill("Keep my compatible source annotation");
  const beforeNodes = await page.locator(".react-flow__node").count();
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/api/canvas/github-101?operation=check",
    async (route) => {
      await wait;
      await route.fulfill({
        json: { state: "new_revision", revision: "b".repeat(40) },
      });
    },
  );
  await page
    .getByRole("button", { name: "Check for updates", exact: true })
    .click();
  await expect(page.getByLabel("Repository revision status")).toContainText(
    "Checking updates",
  );
  await expect(page.locator(".react-flow__node")).toHaveCount(beforeNodes);
  release();
  const update = page.getByRole("button", {
    name: "Update map to bbbbbbb",
    exact: true,
  });
  await expect(update).toBeVisible();
  let attempt = 0;
  await page.route(/\/api\/canvas\/github-101(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    attempt++;
    if (attempt === 1)
      return route.fulfill({
        json: {
          state: "refresh_failed",
          message: "Fixture source refresh failed; previous graph retained.",
        },
      });
    const graph = structuredClone(entry.graph);
    graph.revision = "b".repeat(40);
    graph.generatedAt = new Date().toISOString();
    graph.evidence = graph.evidence.map((e: Record<string, unknown>) => ({
      ...e,
      sourceRevision: graph.revision,
    }));
    return route.fulfill({
      json: { state: "ready", cached: false, entry: { ...entry, graph } },
    });
  });
  await update.click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "previous graph retained",
  );
  await inspectorEdits(page);
  await expect(page.getByLabel("Canvas note", { exact: true })).toHaveValue(
    "Keep my compatible source annotation",
  );
  await update.click();
  await expect(page.locator(".inspector-meta")).toContainText("b".repeat(40));
  await inspectorEdits(page);
  await expect(page.getByLabel("Canvas note", { exact: true })).toHaveValue(
    "Keep my compatible source annotation",
  );
  await page.unroute("**/api/canvas/github-101?operation=check");
  await page.route("**/api/canvas/github-101?operation=check", (route) =>
    route.fulfill({
      status: 403,
      json: { clearGraph: true, error: "repository_denied" },
    }),
  );
  await page
    .getByRole("button", { name: "Check for updates", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Repository map unavailable",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".component-explorer")).toHaveCount(0);
});
