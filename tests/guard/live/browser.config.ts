import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: ["live-ui.spec.ts", "g03-ui.spec.ts"],
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3109",
    channel: process.env.PW_BROWSER_CHANNEL || "msedge",
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  outputDir: "../../../test-results/guard-live/browser",
  reporter: [["list"]],
});
