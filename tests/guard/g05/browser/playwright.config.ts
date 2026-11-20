import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "g05.spec.ts",
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: "http://127.0.0.1:3119",
    ...(process.env.PW_BROWSER_CHANNEL
      ? { channel: process.env.PW_BROWSER_CHANNEL }
      : process.platform === "win32"
        ? { channel: "msedge" }
        : {}),
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  outputDir: "../../../../test-results/guard-g05/browser",
  reporter: [["list"]],
});
