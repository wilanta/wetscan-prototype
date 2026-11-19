import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    setupFiles: ["tests/sentinel/pg-idle-error-setup.ts"],
    include: ["tests/sentinel/response*.postgres.integration.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});
