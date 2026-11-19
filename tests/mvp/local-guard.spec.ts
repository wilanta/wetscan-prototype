import { expect, test, type Page } from "@playwright/test";
const base = "http://127.0.0.1:3109",
  guard = "/app/projects/orderly-demo/guard";
async function enter(page: Page, id: number) {
  await page.route(
    "https://github.com/login/oauth/authorize?*",
    async (route) => {
      const u = new URL(route.request().url()),
        callback = new URL("/api/auth/github/callback", base);
      callback.search = new URLSearchParams({
        code: "fixture-single-" + id,
        state: u.searchParams.get("state")!,
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
  await page
    .getByLabel("Workspace name")
    .fill("Integrated Guard fixture " + id);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Install GitHub App", exact: true })
    .click();
  await expect(
    page.getByText("fixture/wetscan-web", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.locator('input[name="repositories"]').check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[name="email"]').fill("mvp-" + id + "@example.test");
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await expect(page).toHaveURL(base + "/app");
  await page.goto(guard);
}
test("legacy URL redirects into authenticated prototype without exposing another demo", async ({
  page,
}) => {
  await page.goto("/local-demo/guard/inventory");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: "WetScan Guard — LOCAL_DEMO" }),
  ).toHaveCount(0);
});
test("one prototype workflow: scan/review/policy/inventory/remediation/history/reset", async ({
  page,
}) => {
  const mutations: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/guard/"))
      mutations.push(new URL(r.url()).pathname);
  });
  await enter(page, 881);
  const panel = page.getByRole("region", {
    name: "Guard workbench",
    exact: true,
  });
  await panel
    .getByRole("button", { name: "Run fixture workflow", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start workbench simulation", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("completed");
  await panel
    .getByRole("button", { name: "Synthetic dynamic evaluation", exact: true })
    .click();
  await page
    .getByLabel("Review reason")
    .fill("Review reviewed synthetic fixture in existing prototype");
  await page
    .getByRole("button", { name: "Save demo review", exact: true })
    .click();
  await expect(panel.getByText(/under_review/)).toBeVisible();
  const nav = page.getByRole("navigation", {
    name: "Guard sections",
    exact: true,
  });
  await nav.getByRole("link", { name: "Inventory", exact: true }).click();
  await page.getByLabel("Lockfile JSON").fill(
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "node_modules/actual-local-inventory": { version: "4.5.6" },
      },
    }),
  );
  await page
    .getByRole("button", { name: "Inspect inventory", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "actual-local-inventory", exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole("status").last()).toContainText("NOT_QUERIED");
  await nav.getByRole("link", { name: "Remediation", exact: true }).click();
  await page
    .getByRole("button", { name: "Validate text proposal", exact: true })
    .click();
  await expect(panel.getByRole("status").last()).toContainText("NOT_EXECUTED");
  await nav
    .getByRole("link", { name: "Policy & reports", exact: true })
    .click();
  await panel
    .getByLabel(
      "Strict demo policy: include potential high/critical findings as blockers",
    )
    .check();
  await expect(panel.getByRole("status")).toContainText("BLOCK");
  const downloading = page.waitForEvent("download");
  await panel
    .getByRole("button", { name: "Download JSON evidence", exact: true })
    .click();
  const stream = await (await downloading).createReadStream();
  let text = "";
  for await (const chunk of stream!) text += chunk.toString();
  const report = JSON.parse(text);
  expect(report.scope.mode).toBe("demo");
  expect(report.release.enforced).toBe(false);
  expect(
    report.findings.every((f: { evidence: { synthetic: boolean }[] }) =>
      f.evidence.every((e) => e.synthetic),
    ),
  ).toBe(true);
  await nav.getByRole("link", { name: "Scan history", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("completed");
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Start fresh?", exact: true })
    .getByRole("button", { name: "Reset demo", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "No workbench scan has run",
  );
  expect(mutations).toEqual([]);
  await page.screenshot({
    path: "test-results/mvp-integrated-prototype.png",
    fullPage: true,
  });
});
test("missing coverage fails closed and invalid document clears previous inventory", async ({
  page,
}) => {
  await enter(page, 882);
  const panel = page.getByRole("region", {
    name: "Guard workbench",
    exact: true,
  });
  await panel
    .getByRole("button", { name: "Run fixture workflow", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Scan profile", exact: true })
    .selectOption("full");
  await page.getByLabel("Inject synthetic SAST failure").check();
  await page
    .getByRole("button", { name: "Start workbench simulation", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("completed_partial");
  await expect(panel.getByRole("status")).toContainText("INCOMPLETE");
  await page
    .getByRole("navigation", { name: "Guard sections" })
    .getByRole("link", { name: "Inventory", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Inspect inventory", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "fixture-dependency", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Lockfile JSON").fill("{");
  await page
    .getByRole("button", { name: "Inspect inventory", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "fixture-dependency", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("alert").filter({ hasText: "No inventory was promoted" }),
  ).toBeVisible();
});
test("live project navigation uses live Guard and never inherits demo findings", async ({
  page,
}) => {
  await enter(page, 883);
  await page.goto("/app/projects/github-101/guard");
  await expect(
    page.getByRole("region", { name: "Guard workbench", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Run fixture workflow", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Source observations · Runtime unverified · No live protection",
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Guard LIVE/ })).toHaveAttribute(
    "href",
    "/app/projects/github-101/guard",
  );
});

test("original walkthrough delegates to shared history and remains usable on mobile", async ({
  page,
}) => {
  await enter(page, 884);
  await page
    .getByText("Original Orderly example walkthrough", { exact: true })
    .click();
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
  await expect(
    page
      .getByRole("region", { name: "Guard workbench", exact: true })
      .getByRole("status"),
  ).toContainText("completed");
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
  await page.goto(guard + "/inventory");
  await page
    .getByRole("button", { name: "Inspect inventory", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mvp-integrated-mobile.png",
    fullPage: true,
  });
});
