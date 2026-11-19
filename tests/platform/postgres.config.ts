import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    setupFiles: ["tests/sentinel/pg-idle-error-setup.ts"],
    include: ["tests/platform/postgres.integration.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
