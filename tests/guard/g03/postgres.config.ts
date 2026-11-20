import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("../../../src", import.meta.url)) },
  },
  test: {
    include: ["tests/guard/g03/*.postgres.ts"],
    maxWorkers: 1,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
