import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const directory = "evidence/canvas-master-integration";
const project = "/app/projects/orderly-demo";

test("master shell, Canvas hierarchy and demo lens interactions survive at all reference sizes", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/onboarding", (route) =>
    route.fulfill({
      json: {
        authenticated: true,
        step: "complete",
        connected: true,
        profile: {
          login: "reviewer",
          workspace: "Northstar Studio",
          repositories: [],
          email: "reviewer@example.test",
          securityNotifications: true,
          productUpdates: false,
        },
      },
    }),
  );
  const baseline = JSON.parse(
    await readFile(`${directory}/master-geometry.json`, "utf8"),
  );
  await mkdir(directory, { recursive: true });
  const measured = [];
  for (const width of [1440, 1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(`${project}/canvas`);
    await expect(
      page.getByRole("heading", { name: "Everything is connected." }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Canvas data source", { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".component-list > button")).toHaveCount(8);
    const canvas = await page.locator(".canvas-workspace").boundingBox();
    const toolbar = await page.locator(".canvas-toolbar").boundingBox();
    await page.screenshot({
      path: `${directory}/integrated-canvas-${width}.png`,
      fullPage: true,
    });
    const original = baseline.find(
      (item: { width: number }) => item.width === width,
    );
    expect(
      Math.abs(canvas!.y - original.canvas.y),
      `workspace offset at ${width}`,
    ).toBeLessThanOrEqual(width === 390 ? 8 : 2);
    expect(Math.abs(canvas!.width - original.canvas.width)).toBeLessThanOrEqual(
      1,
    );
    expect(
      Math.abs(toolbar!.height - original.toolbar.height),
    ).toBeLessThanOrEqual(width === 390 ? 8 : 2);
    measured.push({ width, canvas, toolbar });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${directory}/integrated-canvas-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Trust", exact: true }).click();
    await page.getByLabel("Role", { exact: true }).selectOption("Staff");
    await expect(page.locator(".lens-note")).toContainText(
      "assigned orders only",
    );
    await expect(
      page.getByRole("region", { name: "Trust policy editor" }),
    ).toBeAttached();
    await page.screenshot({
      path: `${directory}/integrated-trust-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Workflows", exact: true }).click();
    await expect(page.locator(".workflow-canvas")).toContainText(
      "Locked → Edited",
    );
    await expect(
      page.getByRole("link", { name: "Inspect the workflow test" }),
    ).toHaveAttribute("href", `${project}/guard/integrity`);
    await page.screenshot({
      path: `${directory}/integrated-workflows-${width}.png`,
      fullPage: true,
    });
    for (const [name, route] of [
      ["dashboard", "/app"],
      ["projects", "/app/projects"],
    ]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      await page.screenshot({
        path: `${directory}/integrated-${name}-${width}.png`,
        fullPage: true,
      });
      await expect(
        page.locator(".sidebar a[href='/app/activity']"),
      ).toHaveCount(1);
      await expect(
        page.locator(".sidebar a[href='/app/settings']"),
      ).toHaveCount(2);
    }
  }
  expect(errors).toEqual([]);
  await writeFile(
    `${directory}/integrated-geometry.json`,
    JSON.stringify(measured, null, 2),
  );
});
