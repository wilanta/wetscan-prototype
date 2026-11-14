import { defineConfig } from "@playwright/test";
import canvasConfig from "./playwright.config";
export default defineConfig(canvasConfig, {
  testDir: "../e2e",
  testMatch: ["walkthrough.spec.ts", "interaction.spec.ts"],
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: "list",
  outputDir: "../../test-results/canvas-legacy",
});
