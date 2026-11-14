// Run against the original master view in the isolated UI host, before porting.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const currentView = execFileSync(
  "git",
  ["hash-object", "src/components/views/canvas.tsx"],
  { encoding: "utf8" },
).trim();
const originalView = execFileSync(
  "git",
  ["rev-parse", "1ed8457:src/components/views/canvas.tsx"],
  { encoding: "utf8" },
).trim();
if (currentView !== originalView)
  throw new Error(
    "Baseline capture requires the original master Canvas; existing baseline evidence must not be overwritten by the integration.",
  );
const directory = "evidence/canvas-master-integration";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
try {
  const page = await browser.newPage();
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
  const metrics = [];
  for (const width of [1440, 1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto("http://127.0.0.1:3220/app/projects/orderly-demo/canvas");
    await page
      .getByRole("heading", { name: "Everything is connected." })
      .waitFor();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: `${directory}/master-canvas-${width}.png`,
      fullPage: true,
    });
    metrics.push({
      width,
      canvas: await page.locator(".canvas-workspace").boundingBox(),
      toolbar: await page.locator(".canvas-toolbar").boundingBox(),
    });
    for (const lens of ["Trust", "Workflows"]) {
      await page.getByRole("button", { name: lens, exact: true }).click();
      await page.screenshot({
        path: `${directory}/master-${lens.toLowerCase()}-${width}.png`,
        fullPage: true,
      });
    }
    for (const [name, path] of [
      ["dashboard", "/app"],
      ["projects", "/app/projects"],
    ]) {
      await page.goto(`http://127.0.0.1:3220${path}`);
      await page.locator("h1").waitFor();
      await page.screenshot({
        path: `${directory}/master-${name}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await writeFile(
    `${directory}/master-geometry.json`,
    JSON.stringify(metrics, null, 2),
  );
} finally {
  await browser.close();
}
