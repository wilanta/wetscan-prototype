import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/sentinel/external*.postgres.integration.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});
