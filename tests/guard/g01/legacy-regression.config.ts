import { defineConfig } from "@playwright/test";
import legacy from "../../canvas/legacy.config";
export default defineConfig(legacy, {
  testDir: "../../e2e",
  outputDir: "../../../test-results/guard-g01-legacy",
  use: { channel: process.env.AUTH_TEST_BROWSER_CHANNEL || "msedge" },
});
