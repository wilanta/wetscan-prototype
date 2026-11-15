import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/sentinel/telemetry.postgres.integration.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
