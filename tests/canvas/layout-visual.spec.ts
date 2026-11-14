import { mapAction } from "./ui-actions";
import { test, expect } from "@playwright/test";
import { visualScenarios } from "./visual-graphs";

for (const scenario of visualScenarios)
  test(`layout ${scenario}: actual nodes, titles, connections and responsive geometry`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/app/projects/layout-fixture/canvas?scenario=${scenario}`);
    await expect(
      page.locator(".component-list > button").first(),
    ).toBeVisible();
    for (const [width, height] of [
      [1440, 900],
      [1280, 900],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      if (width > 900) {
        if (width === 1440) await mapAction(page, "Expand map");
        await page
          .getByRole("button", { name: "Fit map", exact: true })
          .click();
        await page.waitForTimeout(350); // Wait for the declared 300ms fit animation before measuring geometry.
        const geometry = await page
          .locator(".react-flow__node:has(.graph-node)")
          .evaluateAll((nodes) =>
            nodes.map((node) => {
              const rect = node.getBoundingClientRect(),
                title = node
                  .querySelector(".graph-node > strong")!
                  .getBoundingClientRect();
              return {
                id: node.getAttribute("data-id"),
                x: rect.x,
                y: rect.y,
                w: rect.width,
                h: rect.height,
                titleInside:
                  title.x >= rect.x - 1 &&
                  title.right <= rect.right + 1 &&
                  title.top >= rect.top - 1 &&
                  title.bottom <= rect.bottom + 1,
              };
            }),
          );
        for (const a of geometry) {
          expect(a.titleInside, `${scenario} title escaped ${a.id}`).toBe(true);
          for (const b of geometry.filter((n) => n.id! > a.id!))
            expect(
              a.x < b.x + b.w - 1 &&
                a.x + a.w - 1 > b.x &&
                a.y < b.y + b.h - 1 &&
                a.y + a.h - 1 > b.y,
              `${scenario}: ${a.id} overlaps ${b.id}`,
            ).toBe(false);
        }
        const labels = page.locator(".canvas-edge-label");
        expect(await labels.count()).toBeLessThanOrEqual(1);
      } else {
        await mapAction(page, "Restore panels");
        await expect(
          page.getByLabel("Accessible component list"),
        ).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);
      }
      await page.screenshot({
        path: test.info().outputPath(`${scenario}-${width}.png`),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator(".component-list > button").first().click();
    await expect(page.locator(".inspector h2")).toBeVisible();
    await page.getByText("Map tools", { exact: true }).click();
    await page
      .getByLabel("Highlight relationships", { exact: true })
      .selectOption("upstream");
    await page.getByText("Map tools", { exact: true }).click();
    if (scenario === "large" || scenario === "monorepo") {
      await page
        .getByRole("button", {
          name: "Expand group packages/service-1",
          exact: true,
        })
        .click();
      await page
        .locator(".component-list > button")
        .filter({ hasText: "packages/service-1" })
        .click();
      await mapAction(page, "Fit selected group");
      await page.waitForTimeout(350);
      const frame = await page
        .locator('.react-flow__node[data-id="package-0"]')
        .boundingBox();
      const child = await page
        .locator('.react-flow__node[data-id="node-000"]')
        .boundingBox();
      expect(
        frame &&
          child &&
          child.x >= frame.x &&
          child.y >= frame.y &&
          child.x + child.width <= frame.x + frame.width + 1 &&
          child.y + child.height <= frame.y + frame.height + 1,
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath(`${scenario}-expanded-1440.png`),
        fullPage: true,
      });
    }
    expect(errors).toEqual([]);
  });
