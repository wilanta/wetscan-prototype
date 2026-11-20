import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "g04.spec.ts",
  workers: 1,
  timeout: 90000,
  use: { baseURL: "http://127.0.0.1:3109", channel: process.env.PW_BROWSER_CHANNEL || "msedge", headless: true, viewport: { width: 1440, height: 900 }, screenshot: "off" },
  outputDir: "../../../../test-results/guard-g04/browser",
  reporter: [["list"]],
});
