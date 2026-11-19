import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "local-guard.spec.ts",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3109",
    headless: true,
    channel: process.env.PW_BROWSER_CHANNEL || "msedge",
    viewport: { width: 1440, height: 900 },
  },
  outputDir: "../../test-results/mvp-integrated",
  reporter: [["list"]],
});
