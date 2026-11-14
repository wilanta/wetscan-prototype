import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
const port = Number(process.env.CANVAS_TEST_PORT ?? 3214);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid Canvas test port");
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
    [
      "html",
      {
        outputFolder: fileURLToPath(
          new URL("../../playwright-report/canvas", import.meta.url),
        ),
        open: "never",
      },
    ],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    command: `node node_modules/next/dist/bin/next dev tests/canvas/fixture --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
