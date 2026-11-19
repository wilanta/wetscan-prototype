import { defineConfig } from "@playwright/test";
import canvasConfig from "../canvas/playwright.config";

export default defineConfig(canvasConfig, {
  testDir: ".",
  testMatch: "intelligence.spec.ts",
  outputDir: "../../test-results/sentinel-s08",
  reporter: "list",
  use: { channel: process.env.AUTH_TEST_BROWSER_CHANNEL || "msedge" },
});
