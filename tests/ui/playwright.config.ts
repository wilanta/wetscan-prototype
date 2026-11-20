import { defineConfig, devices } from "@playwright/test";
// Run: node tests/ui/server.mjs (separate terminal)  then  npx playwright test -c tests/ui/playwright.config.ts
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  outputDir: "../../test-results/ui",
  reporter: [["list"]],
  use: { ...devices["Desktop Chrome"], baseURL: process.env.UI_TEST_BASE ?? "http://127.0.0.1:3109", viewport: { width: 1440, height: 900 } },
  webServer: { command: "node tests/ui/server.mjs", url: (process.env.UI_TEST_BASE ?? "http://127.0.0.1:3109") + "/login", reuseExistingServer: true, timeout: 120000, cwd: "../../" },
});
