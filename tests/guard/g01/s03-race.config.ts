import { defineConfig } from "@playwright/test";
import detection from "../../sentinel/detection.playwright.config";
export default defineConfig(detection, {
  testDir: ".",
  testMatch: "s03-validation-race.spec.ts",
  outputDir: "../../../test-results/guard-g01-s03-race",
  reporter: "list",
});
