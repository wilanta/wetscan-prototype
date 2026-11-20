import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("../../../src", import.meta.url)) },
  },
  test: {
    include: ["tests/guard/g05/**/*.postgres.integration.ts"],
    fileParallelism: false,
    testTimeout: 45000,
    hookTimeout: 45000,
  },
});
