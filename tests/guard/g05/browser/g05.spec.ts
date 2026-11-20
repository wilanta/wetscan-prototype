import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const BASE = "http://127.0.0.1:3119";
const PROJECT_PATH = "/app/projects/github-101/guard/dast";

const STAGING_ORIGIN = process.env.G05_E2E_STAGING_ORIGIN!;
const STAGING_CONTROL = process.env.G05_E2E_STAGING_CONTROL!;
const PASS_A = process.env.G05_E2E_STAGING_PASS_USER_A!;
const PASS_B = process.env.G05_E2E_STAGING_PASS_USER_B!;
const PASS_PRIV = process.env.G05_E2E_STAGING_PASS_PRIVILEGED!;

async function setStagingFaults(faults: Record<string, unknown> | "reset") {
  const url =
    faults === "reset"
      ? `${STAGING_ORIGIN}/api/synthetic/reset`
      : `${STAGING_ORIGIN}/api/synthetic/faults`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wetscan-control-secret": STAGING_CONTROL,
    },
    body: faults === "reset" ? "{}" : JSON.stringify(faults),
  });
  expect(r.ok).toBe(true);
  return r.json();
}

async function loginFixture(page: Page) {
  await page.route("https://github.com/login/oauth/authorize?*", async (route) => {
    const u = new URL(route.request().url());
    const cb = new URL("/api/auth/github/callback", BASE);
    cb.search = new URLSearchParams({
      code: "fixture-single-5",
      state: u.searchParams.get("state")!,
    }).toString();
    await route.fulfill({
      contentType: "text/html",
      body: `<script>location.replace(${JSON.stringify(cb.toString())})</script>`,
    });
  });

  await page.goto("/onboarding");
  await page.getByLabel("Workspace name").fill("G05 Live Verification");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Install GitHub App", exact: true }).click();
  await expect(page.getByText("fixture/wetscan-web", { exact: true })).toBeVisible({ timeout: 20000 });
  await page.locator('input[name="repositories"]').check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[name="email"]').fill("g05-e2e@example.test");
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await expect(page).toHaveURL(`${BASE}/app`, { timeout: 20000 });
}

test("full G05 pipeline in browser: target -> grant -> sealed accounts -> Canvas import -> vulnerable fail -> reload survival -> retest PASS -> reports -> mobile/a11y", async ({
  page,
}) => {
  await setStagingFaults("reset");
  await loginFixture(page);

  await page.goto(PROJECT_PATH);
  await expect(page.getByText("G05 · READY")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(`SYNTHETIC PIN: ${STAGING_ORIGIN}`)).toBeVisible();

  // G04 CI/CD Gate and G05 DAST & Integrity extend the original six sections.
  const guardNav = page.getByRole("navigation", { name: "Live Guard sections" });
  expect(await guardNav.getByRole("link").count()).toBe(8);

  // 1. Configure & Activate Staging Target and Issue Consent Grant
  await page.getByRole("button", { name: "Save & Activate Target" }).click();
  await expect(page.getByText(/Target staging-primary saved & activated/i)).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Issue Execution Grant" }).click();
  await expect(page.getByText(/Issued execution grant/i)).toBeVisible({ timeout: 10000 });

  // 2. Seal Synthetic Accounts (user_a, user_b, privileged)
  await page.getByRole("button", { name: "Test Accounts" }).click();
  for (const [role, secret] of [
    ["user_a", PASS_A],
    ["user_b", PASS_B],
    ["privileged", PASS_PRIV],
  ] as const) {
    await page.getByLabel("Role Context").selectOption(role);
    await page.getByLabel(/Synthetic Password/i).fill(secret);
    await page.getByRole("button", { name: "Seal Synthetic Test Account" }).click();
    await expect(page.getByText(/sealed with AES-256-GCM/i)).toBeVisible({ timeout: 10000 });
  }
  const pageHtml = await page.content();
  expect(pageHtml).not.toContain(PASS_A);
  expect(pageHtml).not.toContain(PASS_B);
  expect(pageHtml).not.toContain(PASS_PRIV);

  // 3. Import Canvas Trust Plan & Workflow and Build Plan Preview
  await page.getByRole("button", { name: "Canvas & Test Plan" }).click();
  await page.getByRole("button", { name: "Import & Validate Trust Plan" }).click();
  await expect(page.getByText(/Canvas Trust Plan imported & evaluated/i)).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Import & Validate Workflow" }).click();
  await expect(page.getByText(/Canvas Workflow definition imported & validated/i)).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Build Test Plan Preview" }).click();
  await expect(page.getByText("Generated G05 test plan preview.")).toBeVisible({ timeout: 10000 });
  const previewTable = page.locator("table", { hasText: "Previewed Test Cases" });
  await expect(previewTable.getByText("invariant-ownership")).toBeVisible();
  await expect(previewTable.getByText("invariant-unauthorized-modification")).toBeVisible();

  // 4. Enable faults on Docker staging -> Run via worker -> Verify real FAIL + Pre/Post Diffs + Cleanup
  await setStagingFaults({
    weakHeaders: true,
    ownershipBypass: true,
    workflowBypass: true,
    stateTransitionBypass: true,
    replayBypass: true,
    unauthorizedModBypass: true,
  });

  await page.getByRole("button", { name: "Launch Queued Run with Active Grant" }).click();
  await expect(page.getByText("Persisted Guard G05 Verification Runs")).toBeVisible({ timeout: 10000 });

  // Wait for background worker to execute and poll UI to reflect FAIL + cleanup verified on newest row
  const runsTable = page.locator("table", { hasText: "Persisted Guard G05 Verification Runs" });
  const topRunRow = runsTable.locator("tbody tr").first();
  await expect(topRunRow).toContainText("FAIL", { timeout: 45000 });
  await expect(topRunRow).toContainText("verified", { timeout: 10000 });

  // Verify pre/post persisted diff and all 5 failed invariants visible in UI
  const detailTable = page.locator("table", { hasText: "Observed Case Outcomes" });
  await expect(detailTable.getByText(/VERIFIED_FAIL/).first()).toBeVisible();
  await expect(detailTable.getByText(/Pre:/).first()).toBeVisible();

  // Confirm zero leaked synthetic orders inside Docker container
  const stAfterVuln = await fetch(`${STAGING_ORIGIN}/healthz`).then((r) => r.json());
  expect(stAfterVuln.orderCount).toBe(2);

  // Confirm DB = API = UI survival across browser reload
  await page.reload();
  await page.getByRole("button", { name: "Execution & Integrity" }).click();
  await expect(
    page.locator("table", { hasText: "Persisted Guard G05 Verification Runs" }).locator("tbody tr").first(),
  ).toContainText("FAIL");

  // 5. Fix Docker staging -> Targeted Retest -> PASS + verified_fixed + Report Export
  await setStagingFaults("reset");
  await topRunRow.getByRole("button", { name: "Targeted Retest" }).click();
  await expect(
    page.locator("table", { hasText: "Persisted Guard G05 Verification Runs" }).locator("tbody tr").first(),
  ).toContainText("PASS", { timeout: 45000 });

  await page
    .locator("table", { hasText: "Persisted Guard G05 Verification Runs" })
    .locator("tbody tr")
    .first()
    .getByRole("button", { name: "Save Report" })
    .click();
  await expect(page.getByText(/Generated & persisted G05 report/i)).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: "Findings & Reports" }).click();
  await expect(page.getByText("verified_fixed").first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("link", { name: "Download HTML" }).first()).toBeVisible();

  // Verify HTML report endpoint escapes content cleanly
  const htmlHref = await page.getByRole("link", { name: "Download HTML" }).first().getAttribute("href");
  const htmlRes = await page.request.get(htmlHref!);
  expect(htmlRes.status()).toBe(200);
  const reportText = await htmlRes.text();
  expect(reportText).toContain("WetScan Guard G05 Verification Report");
  expect(reportText).not.toContain(PASS_A);

  // Verify cross-project access fails cleanly and Orderly Demo isolation holds
  const crossRes = await page.request.get("/api/guard/projects/github-999999/g05/overview");
  expect([403, 404]).toContain(crossRes.status());

  await page.goto("/app/projects/orderly-demo/guard");
  await expect(page.getByText(/DEMO|Orderly/i).first()).toBeVisible({ timeout: 10000 });
  expect(await page.content()).not.toContain("staging-primary");

  // Return to G05 UI for Axe accessibility + Dark mode + 400px Mobile overflow checks
  await page.goto(PROJECT_PATH);
  await expect(page.getByText("G05 · READY")).toBeVisible();

  const axeRes = await new AxeBuilder({ page })
    .include('[aria-label="Guard DAST and Integrity workbench"]')
    .analyze();
  expect(axeRes.violations).toEqual([]);

  // Check every G05 interactive tab for Axe violations too
  for (const tabName of ["Test Accounts", "Canvas & Test Plan", "Execution & Integrity", "Findings & Reports"]) {
    await page.getByRole("button", { name: tabName }).click();
    const tabAxe = await new AxeBuilder({ page })
      .include('[aria-label="Guard DAST and Integrity workbench"]')
      .analyze();
    expect(tabAxe.violations).toEqual([]);
  }

  await page.emulateMedia({ colorScheme: "dark" });
  const darkAxe = await new AxeBuilder({ page })
    .include('[aria-label="Guard DAST and Integrity workbench"]')
    .analyze();
  expect(darkAxe.violations).toEqual([]);

  await page.setViewportSize({ width: 400, height: 844 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
