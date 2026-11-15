import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/sentinel/retention.postgres.integration.ts"],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
