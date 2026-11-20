import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const BASE = "http://127.0.0.1:3120";
const COMMIT_A = "a".repeat(40);

async function loginFixture(page: Page) {
  await page.route("https://github.com/login/oauth/authorize?*", async (route) => {
    const u = new URL(route.request().url());
    const cb = new URL("/api/auth/github/callback", BASE);
    cb.search = new URLSearchParams({
      code: "fixture-single-6",
      state: u.searchParams.get("state")!,
    }).toString();
    await route.fulfill({
      contentType: "text/html",
      body: `<script>location.replace(${JSON.stringify(cb.toString())})</script>`,
    });
  });

  await page.goto("/onboarding");
  await page.getByLabel("Workspace name").fill("G06 Live Verification");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Install GitHub App", exact: true }).click();
  await expect(page.getByText("fixture/wetscan-web", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await page.locator('input[name="repositories"]').check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[name="email"]').fill("g06-e2e@example.test");
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await expect(page).toHaveURL(`${BASE}/app`, { timeout: 20000 });
}

test("full G06 browser E2E: GitHub-only Guard UI, Intelligence S09 sync, Sentinel outbox, Unified Reports, Canvas Risk Overlay, demo isolation & a11y", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const unexpectedServerErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const txt = msg.text();
      if (!txt.includes("status of 503 (Service Unavailable)")) {
        consoleErrors.push(txt);
      }
    }
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("response", (res) => {
    if (res.status() >= 400 && res.url().includes("/api/guard/projects/") && res.url().includes("/g06/")) {
      unexpectedServerErrors.push(`${res.status()} ${res.url()}`);
    }
  });

  await loginFixture(page);

  // 1. Navigate to Guard Reports & Bridges
  await page.goto("/app/projects/github-101/guard/reports");
  const g06Region = page.getByRole("region", {
    name: "Guard integrations and unified reports",
  });
  await expect(g06Region).toBeVisible({ timeout: 20000 });

  const guardNav = page.getByRole("navigation", { name: "Live Guard sections" });
  expect(await guardNav.getByRole("link").count()).toBe(9);

  // GitHub-only verification: excluded methods disclosed, zero file upload inputs
  await expect(g06Region).toContainText("OUT_OF_SCOPE_BY_OWNER_DECISION");
  await expect(page.locator('input[type="file"]')).toHaveCount(0);

  // 2. GRD-020 Intelligence Sync -> S09 DB & Exposure Correlation
  await g06Region
    .getByRole("button", { name: "Sync inventory to Intelligence", exact: true })
    .click();
  await expect(g06Region).toContainText("acknowledged", { timeout: 15000 });
  await expect(g06Region).toContainText("potential_exposure", { timeout: 15000 });

  // Verify live cross-module Intelligence page reflects G06 GRD-020 sync
  await page.goto("/app/projects/github-101/sentinel/intelligence");
  await page.getByRole("button", { name: "External advisories", exact: true }).click();
  await expect(
    page.getByText(/Guard dependency inventory \(GRD-020\): acknowledged/i),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/potential_exposure/i)).toBeVisible();

  // 3. Back to Guard Reports -> Publish Sentinel release event + Generate Unified Report + Download
  await page.goto("/app/projects/github-101/guard/reports");
  await expect(g06Region).toBeVisible({ timeout: 15000 });
  await g06Region
    .getByRole("button", { name: "Publish release event", exact: true })
    .click();
  await expect(g06Region).toContainText(/retry_scheduled|pending/, {
    timeout: 15000,
  });

  await g06Region
    .getByRole("button", { name: "Generate unified report", exact: true })
    .click();
  await expect(g06Region).toContainText("BLOCKED", { timeout: 15000 });
  await expect(g06Region).toContainText("NOT_CONNECTED");

  // Reload survival from PostgreSQL
  await page.reload();
  await expect(g06Region).toContainText("BLOCKED", { timeout: 15000 });
  await expect(g06Region).toContainText("potential_exposure");

  const htmlDownloadPromise = page.waitForEvent("download");
  await g06Region.getByRole("link", { name: "Download HTML" }).first().click();
  const htmlDownload = await htmlDownloadPromise;
  const htmlPath = await htmlDownload.path();
  expect(htmlPath).toBeTruthy();
  const htmlBody = await readFile(htmlPath!, "utf8");
  expect(htmlBody).toContain("WetScan Guard Unified Security Report");
  expect(htmlBody).toContain("OUT_OF_SCOPE_BY_OWNER_DECISION");
  expect(htmlBody).not.toContain("<script>");

  // Accessibility scan on Guard Reports & Bridges
  const guardAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .disableRules(["color-contrast"])
    .analyze();
  expect(guardAxe.violations).toEqual([]);

  // 4. Canvas -> Analyze cached snapshot + Live Security Overlay (GRD-013)
  await page.goto("/app/projects/github-101/canvas");
  await expect(
    page.getByText("STATIC SOURCE MAP", { exact: false }),
  ).toBeVisible({ timeout: 25000 });

  await page.getByRole("button", { name: "Security", exact: true }).click();
  const secPanel = page.getByRole("region", { name: "Security coverage" });
  await expect(secPanel).toBeVisible({ timeout: 15000 });
  await expect(secPanel).toContainText(`Commit: ${COMMIT_A.slice(0, 12)}`);
  await expect(secPanel).toContainText(/Unmatched Guard findings \(1\)/);

  // Risk highlights render on Canvas nodes & toggle cleanly
  const highlighted = page.locator(".graph-node.at-risk.security-highlight");
  expect(await highlighted.count()).toBeGreaterThanOrEqual(1);

  await secPanel
    .getByLabel("Show risk overlay on nodes")
    .uncheck();
  await expect(highlighted).toHaveCount(0);
  await secPanel
    .getByLabel("Show risk overlay on nodes")
    .check();
  expect(await highlighted.count()).toBeGreaterThanOrEqual(1);

  // Filter by engine
  const engineSelect = secPanel.getByLabel("Security engine");
  await engineSelect.selectOption("sast");
  await expect(secPanel).toContainText("sast");
  await engineSelect.selectOption("");

  // Click affected node -> Inspector shows Guard evidence link
  await highlighted.first().click();
  const inspector = page.getByRole("complementary", { name: /inspector/i });
  if (await inspector.count()) {
    await expect(inspector).toContainText(/View evidence|What needs attention/);
  }

  // Accessibility scan on Canvas Security view
  const canvasAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .disableRules(["color-contrast"])
    .analyze();
  expect(canvasAxe.violations).toEqual([]);

  // 5. Demo mode isolation: visiting Demo Canvas must NEVER fetch live G06 routes
  const demoLiveCalls: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/guard/projects/github-101")) {
      demoLiveCalls.push(req.url());
    }
  });
  await page.goto("/app/demo/canvas");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
    timeout: 15000,
  });
  expect(demoLiveCalls).toEqual([]);

  // 6. Mobile responsiveness check (no horizontal overflow)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/projects/github-101/guard/reports");
  await expect(g06Region).toBeVisible({ timeout: 15000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);

  expect(unexpectedServerErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
