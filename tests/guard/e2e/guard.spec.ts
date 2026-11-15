import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const baseURL = "http://127.0.0.1:3109";
const guardPath = "/app/projects/orderly-demo/guard";
async function enter(page: Page, id: number) {
  await page.route(
    "https://github.com/login/oauth/authorize?*",
    async (route) => {
      const authorize = new URL(route.request().url()),
        callback = new URL("/api/auth/github/callback", baseURL);
      callback.search = new URLSearchParams({
        code: `fixture-single-${id}`,
        state: authorize.searchParams.get("state")!,
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
  await page.getByLabel("Workspace name").fill("Guard synthetic tests " + id);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Install GitHub App", exact: true })
    .click();
  await expect(
    page.getByText("fixture/wetscan-web", { exact: true }),
  ).toBeVisible();
  await page.locator('input[name="repositories"]').check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[name="email"]').fill(`guard-${id}@example.test`);
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await expect(page).toHaveURL(baseURL + "/app");
  await page.goto(guardPath);
}
async function scan(page: Page, failure = false) {
  const panel = page.getByRole("region", {
    name: "Guard workbench",
    exact: true,
  });
  await panel.getByRole("button", { name: "Scan My App", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Configure Guard demo scan",
    exact: true,
  });
  if (failure) await dialog.getByLabel("Inject synthetic SAST failure").check();
  await dialog
    .getByRole("button", { name: "Start workbench simulation", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("completed_partial");
  return panel;
}
test("coverage, audited review, report download and demo/live separation", async ({
  page,
}) => {
  await enter(page, 601);
  const panel = await scan(page);
  await expect(panel.getByRole("status")).toContainText("INCOMPLETE");
  await panel
    .getByRole("button", {
      name: "Synthetic input evaluation needs review",
      exact: true,
    })
    .click();
  const review = page.getByRole("dialog", {
    name: "Synthetic input evaluation needs review",
    exact: true,
  });
  await expect(
    review.getByRole("button", { name: "Save demo review", exact: true }),
  ).toBeDisabled();
  await review.getByLabel("Review outcome").selectOption("risk_accepted");
  await review
    .getByLabel("Review reason")
    .fill("Controlled synthetic example accepted for demo only");
  await review
    .getByRole("button", { name: "Save demo review", exact: true })
    .click();
  await expect(panel.getByText(/risk_accepted/)).toBeVisible();
  const downloading = page.waitForEvent("download");
  await panel
    .getByRole("button", { name: "Download JSON evidence", exact: true })
    .click();
  const artifact = await downloading;
  expect(artifact.suggestedFilename()).toBe("guard-demo-evidence.json");
  const stream = await artifact.createReadStream();
  let data = "";
  for await (const chunk of stream!) data += chunk.toString();
  const evidence = JSON.parse(data);
  expect(evidence.scope.mode).toBe("demo");
  expect(evidence.release.decision).toBe("INCOMPLETE");
  expect(evidence.release.enforced).toBe(false);
  expect(
    evidence.audit.some(
      (a: { action: string; reason: string }) =>
        a.action === "risk_accepted" && a.reason.includes("Controlled"),
    ),
  ).toBe(true);
  await panel
    .getByRole("button", { name: "Check Live readiness", exact: true })
    .click();
  const live = page.getByRole("dialog", {
    name: "Live Guard is not configured",
    exact: true,
  });
  await expect(live.getByText(/NOT_SCANNED/)).toBeVisible();
  await live.getByText("Review a staging scope draft", { exact: true }).click();
  await live
    .getByLabel("Staging HTTPS origin")
    .fill("https://staging.example.com");
  await live
    .getByLabel("This is a staging scope I am authorized to propose")
    .check();
  await live
    .getByRole("button", { name: "Check scope readiness", exact: true })
    .click();
  await expect(live.getByRole("status")).toContainText("NOT_EXECUTED");

  await expect(
    live.getByText("Synthetic input evaluation needs review", { exact: true }),
  ).toHaveCount(0);
  await live.getByRole("button", { name: "Close dialog", exact: true }).click();
  await panel
    .getByRole("button", { name: "Reset Guard demo", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "No workbench scan has run",
  );
});
test("cancellation, injected failure and reload never invent completed coverage", async ({
  page,
}) => {
  await enter(page, 602);
  const panel = page.getByRole("region", {
    name: "Guard workbench",
    exact: true,
  });
  await panel.getByRole("button", { name: "Scan My App", exact: true }).click();
  await page
    .getByRole("button", { name: "Start workbench simulation", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Cancel demo scan", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("cancelled");
  await scan(page, true);
  await expect(panel.getByRole("row", { name: /Code \(SAST\)/ })).toContainText(
    "failed",
  );
  await expect(panel.getByRole("status")).toContainText("INCOMPLETE");
  await page.reload();
  await expect(panel.getByRole("status")).toContainText(
    "No workbench scan has run",
  );
});
test("mobile/dark/keyboard accessibility and controlled invariant evidence", async ({
  page,
}) => {
  await enter(page, 603);
  const panel = page.getByRole("region", {
    name: "Guard workbench",
    exact: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .include('[aria-label="Guard workbench"]')
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("guard-desktop-light.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("guard-1280-light.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await panel.getByRole("button", { name: "Scan My App", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", {
      name: "Configure Guard demo scan",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: test.info().outputPath("guard-mobile-dark.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto(guardPath + "/integrity");
  const lab = page.getByRole("region", {
    name: "Guard workbench",
    exact: true,
  });
  await expect(
    lab.getByRole("button", { name: "Run controlled invariant", exact: true }),
  ).toBeDisabled();
  await lab.getByLabel("I confirm this synthetic invariant").check();
  await lab
    .getByRole("button", { name: "Run controlled invariant", exact: true })
    .click();
  await expect(
    lab.getByText(/FAILED: expected 403, observed 200/),
  ).toBeVisible();
  await lab.getByLabel("Use patched in-memory fixture").check();
  await lab
    .getByRole("button", { name: "Run controlled invariant", exact: true })
    .click();
  await expect(
    lab.getByText(/PASSED: expected 403, observed 403/),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("guard-integrity-mobile.png"),
    fullPage: true,
  });
});

test("existing Orderly scan and FIND-102 remediation walkthrough remains operational", async ({
  page,
}) => {
  await enter(page, 604);
  await expect(
    page.getByRole("heading", { name: "Demo scan #1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Simulate scan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start simulated scan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Demo scan #2", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Understand this finding", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Show example remediation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use example in demo scenario", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run simulated retest", exact: true })
    .click();
  await expect(page.locator(".detail-status")).toContainText("verified fixed");
});

test("G01 authenticated readiness is explicit and no scan is accepted before runtime approval", async ({
  page,
}) => {
  await enter(page, 701);
  const base = "/api/guard/projects/github-101";
  const readiness = await page.request.get(base + "/readiness");
  expect(readiness.status()).toBe(200);
  expect(await readiness.json()).toMatchObject({
    status: "BLOCKED",
    scanAccepted: false,
    database: "approval_required",
    execution: "G02_NOT_CONFIGURED",
  });
  const unauthorized = await page.request.get(
    "/api/guard/projects/github-999/readiness",
  );
  expect(unauthorized.status()).toBe(404);
  const create = await page.request.post(base + "/scans", {
    headers: { origin: baseURL },
    data: {
      profile: "quick",
      engines: ["sast"],
      idempotencyKey: "g01-browser-test",
    },
  });
  expect(create.status()).toBe(503);
  expect(await create.json()).toEqual({ error: "approval_required" });
  const malformed = await page.request.post(base + "/scans", {
    headers: { origin: baseURL },
    data: {
      profile: "quick",
      engines: ["sast"],
      idempotencyKey: "g01-browser-test",
      workspaceId: "forged",
    },
  });
  expect(malformed.status()).toBe(400);
  const source = await page.request.post(base + "/source-acceptance", {
    headers: { origin: baseURL },
    data: { commit: "a".repeat(40) },
  });
  expect(source.status()).toBe(503);
  expect(await source.json()).toEqual({ error: "approval_required" });
});
