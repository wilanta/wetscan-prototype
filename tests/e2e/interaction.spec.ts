import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
const project = "/app/projects/orderly-demo";
test("scan loading, graph controls, edge inspection, mobile navigation and representative accessibility", async ({
  page,
}) => {
  fs.mkdirSync("evidence", { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${project}/guard`);
  await page
    .getByRole("button", { name: "Simulate scan", exact: true })
    .click();
  await page.getByRole("button", { name: "Start simulated scan" }).click();
  await expect(
    page.getByRole("button", { name: "Running demo simulation…" }),
  ).toBeDisabled();
  await page.screenshot({
    path: "evidence/scan-loading-1440.png",
    fullPage: true,
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Demo scan #2" }),
  ).toBeVisible();
  await page.goto(`${project}/canvas`);
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  const before = await page
    .locator(".react-flow__viewport")
    .getAttribute("style");
  await page.getByRole("button", { name: "Zoom In", exact: true }).click();
  await expect(page.locator(".react-flow__viewport")).not.toHaveAttribute(
    "style",
    before!,
  );
  await page.getByRole("button", { name: "Fit map", exact: true }).click();
  await page.waitForTimeout(350); // Allow the explicit 300 ms fit animation to finish.
  const readEdge = page.locator(
    '.react-flow__edge[data-id="read"] .react-flow__edge-interaction',
  );
  const edgeBox = await readEdge.boundingBox();
  expect(edgeBox).not.toBeNull();
  // A horizontal SVG path has a zero-height DOM box; click its painted stroke.
  await page.mouse.click(edgeBox!.x + edgeBox!.width * 0.85, edgeBox!.y + edgeBox!.height / 2);
  await expect(
    page
      .locator(".inspector")
      .getByRole("heading", { name: "Read / write", exact: true }),
  ).toBeVisible();
  await page.locator('.react-flow__node[data-id="orders-api"]').focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("link", { name: "View evidence", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "evidence/canvas-inspector-1440.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A clearer picture, ready to share." }),
  ).toBeVisible();
  await expect(page.locator(".sidebar")).not.toHaveClass(/mobile-open/);
  const routes = [
    "/",
    `${project}/guard/findings/FIND-102`,
    `${project}/sentinel`,
    "/app/notifications",
    "/app/integrations",
    "/onboarding",
  ];
  const checks = [];
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const route of routes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    checks.push({ route, violations: result.violations });
    expect(result.violations, route).toEqual([]);
    if (route === "/" || route.endsWith("FIND-102"))
      await page.screenshot({
        path: `evidence/${route === "/" ? "landing" : "finding"}-1440.png`,
        fullPage: true,
      });
  }
  expect(errors).toEqual([]);
  fs.writeFileSync(
    "evidence/interaction-checks.json",
    JSON.stringify({ checks, browserErrors: errors }, null, 2),
  );
});
