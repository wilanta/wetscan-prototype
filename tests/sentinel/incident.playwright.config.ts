import { defineConfig } from "@playwright/test";
import canvasConfig from "../canvas/playwright.config";
export default defineConfig(canvasConfig, {
  testDir: ".",
  testMatch: "incident.spec.ts",
  outputDir: "../../test-results/sentinel-s04",
  reporter: "list",
  use: { channel: process.env.AUTH_TEST_BROWSER_CHANNEL || "msedge" },
});
