import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  outputDir: "../../test-results/canvas",
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/canvas", open: "never" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3214",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "node node_modules/next/dist/bin/next dev tests/canvas/fixture --hostname 127.0.0.1 --port 3214",
    url: "http://127.0.0.1:3214",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
