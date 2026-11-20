import { defineConfig } from "vitest/config";
/** Real PostgreSQL (the isolated G04 environment). Run: npm run test:guard:g04:postgres */
export default defineConfig({
  test: { include: ["tests/guard/g04/*.postgres.integration.ts"], fileParallelism: false, maxWorkers: 1, testTimeout: 60000, hookTimeout: 120000 },
});
