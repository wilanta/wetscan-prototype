import { defineConfig } from "@playwright/test";
import legacyConfig from "../canvas/legacy.config";

// Reuse the existing isolated UI fixture and unchanged demo walkthroughs.
// This does not bypass production auth or exercise real provider credentials.
export default defineConfig(legacyConfig, {
  use: { channel: process.env.AUTH_TEST_BROWSER_CHANNEL || "msedge" },
  outputDir: "../../test-results/sentinel-s00",
  reporter: "list",
});
