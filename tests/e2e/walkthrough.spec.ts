import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
const base = "/app/projects/orderly-demo";
test("primary walkthrough, incident outcomes, decoy, rule approval and reset", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: "Explore the interactive demo" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "A little clarity for your next big thing.",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View app", exact: true }).click();
  await page.getByRole("link", { name: "Open project", exact: true }).click();
  await page.getByRole("link", { name: "Open Canvas", exact: true }).click();
  await page
    .getByRole("button", { name: "Orders API api", exact: false })
    .click();
  await page.getByRole("link", { name: "View evidence", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Customers may see someone else’s order",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show example remediation" }).click();
  await page
    .getByRole("button", { name: "Use example in demo scenario" })
    .click();
  await page.getByRole("button", { name: "Run simulated retest" }).click();
  await expect(page.getByText("verified fixed", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Explore Sentinel" }).click();
  await page
    .getByRole("button", { name: "Simulate suspicious request" })
    .first()
    .click();
  await page
    .getByRole("link", { name: /Repeated unauthorized order access/ })
    .click();
  await expect(page.getByText("Threat detected", { exact: true })).toHaveCount(
    2,
  );
  await expect(
    page.getByText("Neutralization verified — scope-limited", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Evaluate policy & apply demo action" })
    .click();
  await page
    .getByRole("button", { name: "Request outcome verification" })
    .click();
  await expect(
    page.getByText("Neutralization verified — scope-limited", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Run synthetic verification" })
    .click();
  await expect(
    page.getByText("Neutralization verified — scope-limited", { exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Archive & propose draft rule" })
    .click();
  await page
    .getByRole("link", { name: "Open Intelligence", exact: true })
    .click();
  await expect(
    page.getByText("Draft · needs review", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review draft rule" }).click();
  await expect(
    page.getByRole("button", { name: "Approve for demo only" }),
  ).toBeDisabled();
  await page
    .getByLabel("I reviewed the source evidence and demo scope.")
    .check();
  await page.getByRole("button", { name: "Approve for demo only" }).click();
  await page.getByRole("link", { name: "Ghost", exact: true }).first().click();
  await page.getByRole("button", { name: "Set up demo decoy" }).click();
  await page.getByRole("switch", { name: "Enable local demo decoy" }).check();
  await page.getByRole("button", { name: "Save demo configuration" }).click();
  await page.getByRole("button", { name: "Test decoy (simulated)" }).click();
  await expect(
    page.getByRole("heading", { name: "A demo decoy was accessed" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Notifications,/ }).click();
  await expect(
    page.getByRole("heading", { name: "whatsapp", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Simulated preview", { exact: true }),
  ).toHaveCount(6);
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Reset demo", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your previews will appear here" }),
  ).toBeVisible();
});
test("failure and pending paths do not claim neutralization", async ({
  page,
}) => {
  await page.goto(`${base}/sentinel`);
  await page
    .getByRole("button", { name: "Simulate suspicious request" })
    .first()
    .click();
  await page
    .getByRole("link", { name: /Repeated unauthorized order access/ })
    .click();
  await page
    .getByRole("button", { name: "Evaluate policy & apply demo action" })
    .click();
  await page
    .getByRole("button", { name: "Request outcome verification" })
    .click();
  await page
    .getByLabel("Synthetic verification scenario")
    .selectOption("pending");
  await page
    .getByRole("button", { name: "Run synthetic verification" })
    .click();
  await expect(
    page.getByText("Neutralization verified — scope-limited", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Synthetic verification scenario").selectOption("fail");
  await page
    .getByRole("button", { name: "Run synthetic verification" })
    .click();
  await expect(
    page.getByText("Protection verification failed", { exact: true }),
  ).toHaveCount(2);
  await expect(
    page.getByText("Neutralization verified — scope-limited", { exact: true }),
  ).toHaveCount(0);
});
test("onboarding exposes only honest GitHub and GitLab demo connections", async ({
  page,
}) => {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: /GitLab/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel(
      "I understand this is a demo connection, with no OAuth success implied.",
    )
    .check();
  await page
    .getByRole("button", { name: "Explore demo repositories", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Create demo project" }).click();
  await page
    .getByRole("link", { name: "Explore your application map" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Everything is connected." }),
  ).toBeVisible();
});
test("desktop and mobile rendered accessibility, dark theme, and screenshots", async ({
  page,
}) => {
  fs.mkdirSync("evidence", { recursive: true });
  const checks = [];
  for (const [width, height] of [
    [1440, 900],
    [1280, 900],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const route of ["/app", `${base}/canvas`]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForTimeout(600);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow, `${route} overflow at ${width}`).toBe(false);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      checks.push({ route, width, violations: result.violations });
      expect(result.violations).toEqual([]);
      await page.screenshot({
        path: `evidence/${route.endsWith("canvas") ? "canvas" : "overview"}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "evidence/overview-dark-1440.png",
    fullPage: true,
  });
  const darkResult = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(darkResult.violations).toEqual([]);
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  fs.writeFileSync(
    "evidence/accessibility.json",
    JSON.stringify({ checks, darkViolations: darkResult.violations }, null, 2),
  );
});
test("all declared screens respond; staging validation, list mode, lens controls, modal keyboard behavior", async ({
  page,
}) => {
  const routes = [
    "/app/projects",
    base,
    `${base}/guard`,
    `${base}/guard/scans`,
    `${base}/guard/findings`,
    `${base}/guard/findings/FIND-103`,
    `${base}/guard/findings/FIND-104`,
    `${base}/guard/integrity`,
    `${base}/guard/remediation`,
    `${base}/guard/releases`,
    `${base}/sentinel/activity`,
    `${base}/sentinel/incidents`,
    `${base}/sentinel/responses`,
    `${base}/sentinel/ghost`,
    `${base}/sentinel/intelligence`,
    "/app/notifications",
    "/app/integrations",
    "/app/reports",
    "/app/settings",
    "/app/activity",
  ];
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await page.goto("/app/integrations");
  await page
    .getByLabel("Staging URL", { exact: true })
    .fill("https://production.example.com");
  await page.getByRole("button", { name: "Save demo staging scope" }).click();
  await expect(page.locator("#staging-error")).toContainText(
    "Use an HTTPS staging hostname",
  );
  await page
    .getByLabel("Staging URL", { exact: true })
    .fill("https://staging.orderly.test");
  await page
    .getByLabel(
      "I own this staging target or have explicit permission to test it.",
    )
    .check();
  await page.getByRole("button", { name: "Save demo staging scope" }).click();
  await expect(
    page.getByText("Demo staging scope saved. No DAST runner is connected."),
  ).toBeVisible();
  await page.goto(`${base}/canvas`);
  await page.getByRole("button", { name: "Trust", exact: true }).click();
  await page.getByLabel("Role", { exact: true }).selectOption("Staff");
  await expect(page.getByText(/Expected: assigned orders only/)).toBeVisible();
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await expect(
    page.getByText("Locked → Edited", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Security", exact: true }).click();
  await page.getByRole("button", { name: "Show component list" }).click();
  await page
    .locator(".graph-list-fallback")
    .getByRole("button", { name: /Orders API/ })
    .click();
  await expect(
    page.getByRole("link", { name: "View evidence", exact: true }),
  ).toBeVisible();
  await page.goto("/app");
  await page.getByRole("button", { name: "Help & quick tour" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Help & quick tour" }),
  ).toBeFocused();
});
