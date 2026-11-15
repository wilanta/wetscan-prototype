import { defineConfig } from "@playwright/test";
import canvas from "../../canvas/playwright.config";
export default defineConfig(canvas, {
  testDir: "../../canvas",
  testMatch: ["canvas.spec.ts", "layout-visual.spec.ts"],
  outputDir: "../../../test-results/guard-g01-canvas",
  reporter: "list",
  use: { channel: process.env.AUTH_TEST_BROWSER_CHANNEL || "msedge" },
});
