import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
const route = "/app/projects/orderly-demo/canvas";
async function open(page: Page, source = "demo") {
  await page.goto(route);
  await expect(
    page.getByRole("heading", { name: "Everything is connected." }),
  ).toBeVisible();
  if (source !== "demo")
    await page
      .getByLabel("Canvas data source", { exact: true })
      .selectOption(source);
  await expect(page.locator(".component-explorer")).toBeVisible();
}
async function exportJSON(page: Page, label: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: label, exact: true }).click();
  const downloaded = await pending;
  const file = await downloaded.path();
  return JSON.parse(await readFile(file!, "utf8"));
}
test("demo graph keyboard, directional edge inspector, search, filters, layout and reset", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await expect(page.locator(".react-flow__node")).toHaveCount(8);
  const api = page.locator('.react-flow__node[data-id="orders-api"]');
  await api.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".inspector h2")).toHaveText("Orders API");
  await expect(
    page.getByRole("link", { name: "View evidence", exact: true }),
  ).toHaveAttribute("href", /FIND-102$/);
  await page
    .getByRole("button", { name: "Show component list", exact: true })
    .click();
  await page
    .locator(".graph-edge-list")
    .getByRole("button", { name: /Orders API → Orders database/ })
    .click();
  await expect(page.locator(".inspector h2")).toHaveText("Read / write");
  await page.getByLabel("Mark relationship unconfirmed").check();
  await page.getByRole("button", { name: "Undo Canvas edit" }).click();
  await page.getByRole("button", { name: "Show graph", exact: true }).click();
  await page.getByLabel("Find a component", { exact: true }).fill("database");
  await expect(page.locator(".component-list > button")).toHaveCount(1);
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.getByRole("button", { name: "Auto layout", exact: true }).click();
  await page.getByRole("button", { name: "Fit map", exact: true }).click();
  await page
    .getByLabel("Environment", { exact: true })
    .selectOption("production");
  await expect(
    page.getByRole("heading", { name: "No production map yet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return to demo staging" }).click();
  await page
    .getByRole("button", { name: "Reset Canvas edits", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Undo Canvas edit" }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
test("snapshot route has actual file evidence and no demo security results", async ({
  page,
}) => {
  await open(page, "a");
  await page
    .locator(".component-list")
    .getByRole("button", { name: "/api/orders/[id] api", exact: true })
    .click();
  await expect(page.locator(".inspector h2")).toHaveText("/api/orders/[id]");
  await expect(
    page
      .locator(".inspector")
      .getByText("src/app/(store)/api/orders/[id]/route.ts:1", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".inspector")).toContainText(
    "exported methods GET, PATCH",
  );
  await expect(page.locator(".inspector")).toContainText("example-a-v1");
  await page.getByRole("button", { name: "Security", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Security coverage" }),
  ).toContainText("Not yet scanned");
  await expect(
    page.getByRole("region", { name: "Security coverage" }),
  ).toContainText("Monitoring not connected");
  await expect(page.locator(".canvas-page")).not.toContainText("FIND-102");
  await page.getByLabel("Only affected components").check();
  await expect(page.locator(".component-list > button")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page.locator(".component-list > button")).not.toHaveCount(0);
  const exported = await exportJSON(page, "Export architecture JSON");
  expect(exported.mode).toBe("snapshot");
  expect(exported.nodes.some((n: { kind: string }) => n.kind === "api")).toBe(
    true,
  );
  expect(JSON.stringify(exported)).not.toContain("DO_NOT_RETAIN_EXAMPLE_VALUE");
});
test("manual nodes, relationships and notes undo/redo and persist only in demo browser scope", async ({
  page,
}) => {
  await open(page);
  await page.getByText("Annotate and correct the map", { exact: true }).click();
  await page
    .getByLabel("Manual component name", { exact: true })
    .fill("Fulfilment partner");
  await page
    .getByRole("button", { name: "Add component", exact: true })
    .click();
  await expect(page.locator(".component-list")).toContainText(
    "Fulfilment partner",
  );
  await page.getByRole("button", { name: "Undo Canvas edit" }).click();
  await expect(page.locator(".component-list")).not.toContainText(
    "Fulfilment partner",
  );
  await page.getByRole("button", { name: "Redo Canvas edit" }).click();
  const manualId = await page
    .getByLabel("Relationship target", { exact: true })
    .locator("option")
    .filter({ hasText: "Fulfilment partner" })
    .getAttribute("value");
  await page
    .getByLabel("Relationship source", { exact: true })
    .selectOption("orders-api");
  await page
    .getByLabel("Relationship target", { exact: true })
    .selectOption(manualId!);
  await page
    .getByLabel("Relationship label", { exact: true })
    .fill("User-confirmed contract pending");
  await page
    .getByRole("button", { name: "Add relationship", exact: true })
    .click();
  await page
    .locator(".component-list")
    .getByRole("button", { name: /Fulfilment partner/ })
    .click();
  await page
    .getByLabel("Canvas note", { exact: true })
    .fill("Confirm owner before integration");
  await page.getByRole("button", { name: "Trust", exact: true }).click();
  await page.getByRole("button", { name: "Architecture", exact: true }).click();
  await expect(page.getByLabel("Canvas note", { exact: true })).toHaveValue(
    "Confirm owner before integration",
  );
  await page.reload();
  await page
    .locator(".component-list")
    .getByRole("button", { name: /Fulfilment partner/ })
    .click();
  await expect(page.getByLabel("Canvas note", { exact: true })).toHaveValue(
    "Confirm owner before integration",
  );
  await page.getByLabel("Trust boundary", { exact: true }).check();
  await page
    .getByRole("button", { name: "Hide component", exact: true })
    .click();
  await expect(page.locator(".inspector h2")).toHaveCount(0);
  await page.getByRole("button", { name: /Unhide 1 components/ }).click();
  const exported = await exportJSON(page, "Export architecture JSON");
  expect(exported.userOverlay.manualEdges).toHaveLength(1);
  expect(exported.userOverlay.trustModel.boundaryNodeIds).toContain(manualId);
  await page
    .getByRole("button", { name: "Reset Canvas edits", exact: true })
    .click();
  await expect(page.locator(".component-list")).not.toContainText(
    "Fulfilment partner",
  );
  await page
    .getByLabel("Canvas data source", { exact: true })
    .selectOption("a");
  await expect(page.locator(".component-list")).not.toContainText(
    "Fulfilment partner",
  );
});
test("Trust roles, resources, expected matrix and confirmation export as untested", async ({
  page,
}) => {
  await open(page, "a");
  await page.getByRole("button", { name: "Trust", exact: true }).click();
  await page.getByLabel("New role", { exact: true }).fill("Reviewer");
  await page.getByRole("button", { name: "Add role", exact: true }).click();
  await page.getByLabel("New resource", { exact: true }).fill("Report");
  await page.getByRole("button", { name: "Add resource", exact: true }).click();
  await page.getByLabel("Policy action", { exact: true }).fill("publish");
  await page.getByRole("button", { name: "Add policy", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Not tested", exact: true }),
  ).toBeVisible();
  await page.getByLabel(/Confirm expected policy/).check();
  await expect(
    page.getByRole("button", { name: "Run verification · not connected" }),
  ).toBeDisabled();
  const plan = await exportJSON(page, "Export Trust test plan");
  expect(plan.status).toBe("not_executed");
  expect(plan.cases[0]).toMatchObject({
    action: "publish",
    confirmed: true,
    observed: "not_tested",
    expectedHttp: 200,
  });
});
test("workflow editor, forbidden transition, actor details and Integrity export send no requests", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      !request.url().startsWith("http://127.0.0.1:3214")
    )
      external.push(request.url());
  });
  await open(page, "a");
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await page.getByLabel("Example template", { exact: true }).selectOption("1");
  await page
    .getByRole("button", { name: "Use example template", exact: true })
    .click();
  await page
    .getByLabel("Workflow name", { exact: true })
    .fill("Reviewed grade policy");
  await page.getByLabel("New state", { exact: true }).fill("Archived");
  await page.getByRole("button", { name: "Add state", exact: true }).click();
  await expect(
    page.getByLabel("State name archived", { exact: true }),
  ).toHaveValue("Archived");
  await page.getByLabel("Forbidden transition edit", { exact: true }).uncheck();
  await page.getByLabel("Forbidden transition edit", { exact: true }).check();
  await page
    .getByRole("button", { name: "Inspect transition edit", exact: true })
    .click();
  await page
    .getByLabel("Risk / hypothesis", { exact: true })
    .fill("Student may bypass the grade lock");
  await page
    .getByLabel("Workflow invariants", { exact: true })
    .fill("Locked grades must not change");
  const plan = await exportJSON(page, "Export Integrity test plan");
  const linked = await page
    .getByLabel("Involved components", { exact: true })
    .locator("option")
    .evaluateAll((options) =>
      options.slice(0, 2).map((option) => (option as HTMLOptionElement).value),
    );
  await page
    .getByLabel("Involved components", { exact: true })
    .selectOption(linked);
  const linkedPlan = await exportJSON(page, "Export Integrity test plan");
  expect(linkedPlan.nodeIds).toEqual(linked.slice().sort());
  expect(plan.status).toBe("not_executed");
  expect(plan.name).toBe("Reviewed grade policy");
  const transition = plan.cases.find((c: { id: string }) => c.id === "edit");
  expect(transition).toMatchObject({
    forbidden: true,
    expectedHttp: 403,
    expectedState: "locked",
    hypothesis: "Student may bypass the grade lock",
  });
  await expect(
    page.getByRole("button", { name: "Run workflow test · not connected" }),
  ).toBeDisabled();
  expect(external).toEqual([]);
});
test("empty, partial, filters and monorepo groups recover without a fake safe status", async ({
  page,
}) => {
  await open(page, "empty");
  await expect(page.locator(".component-list > button")).toHaveCount(0);
  await page
    .getByLabel("Canvas data source", { exact: true })
    .selectOption("d");
  await page.getByText(/Discovery coverage and limitations/).click();
  await expect(page.locator(".canvas-page")).toContainText(
    "malformed_manifest",
  );
  await page
    .getByLabel("Canvas data source", { exact: true })
    .selectOption("e");
  await page
    .getByRole("button", { name: "Collapse group apps/shop", exact: true })
    .click();
  await expect(page.locator(".component-list")).not.toContainText("/api/cache");
  await page
    .getByRole("button", { name: "Expand group apps/shop", exact: true })
    .click();
  await expect(page.locator(".component-list")).toContainText("/api/cache");
  await page
    .getByLabel("Find a component", { exact: true })
    .fill("missing app");
  await expect(page.locator(".component-list > button")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page.locator(".component-list > button")).not.toHaveCount(0);
});
test("light/dark, 1440/1280/390 responsive Canvas and scoped accessibility", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await open(page, "a");
  for (const width of [1440, 1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      if (theme === "dark")
        await page
          .getByRole("button", { name: "Switch to dark theme", exact: true })
          .click();
      await page
        .locator(".component-list")
        .getByRole("button", { name: "/api/orders/[id] api", exact: true })
        .click();
      await expect(page.locator(".inspector h2")).toHaveText(
        "/api/orders/[id]",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      const result = await new AxeBuilder({ page })
        .include(".canvas-page")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`canvas-${width}-${theme}.png`),
        fullPage: true,
      });
      if (theme === "dark")
        await page
          .getByRole("button", { name: "Switch to light theme", exact: true })
          .click();
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const lens of ["Trust", "Workflows"]) {
    await page.getByRole("button", { name: lens, exact: true }).click();
    if (lens === "Workflows")
      await page
        .getByRole("button", { name: "Use example template", exact: true })
        .click();
    const result = await new AxeBuilder({ page })
      .include(".canvas-page")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(result.violations).toEqual([]);
  }
});
