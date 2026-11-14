import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    ...devices["Desktop Chrome"],
    channel: process.env.AUTH_TEST_BROWSER_CHANNEL || "msedge",
    baseURL: "http://127.0.0.1:3109",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  outputDir: "../../test-results/guard",
  reporter: [["list"]],
});
