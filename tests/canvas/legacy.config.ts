import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "../e2e",
  testMatch: "walkthrough.spec.ts",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3214",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  reporter: "list",
  outputDir: "../../test-results/canvas-legacy",
});
