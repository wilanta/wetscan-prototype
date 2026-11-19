import { defineConfig } from "@playwright/test";
import canvasConfig from "../canvas/playwright.config";
export default defineConfig(canvasConfig, {
  testDir: ".",
  testMatch: "notification.spec.ts",
  outputDir: "../../test-results/sentinel-s06",
  reporter: "list",
  use: { channel: process.env.AUTH_TEST_BROWSER_CHANNEL || "msedge" },
});
