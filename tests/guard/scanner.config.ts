import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tests/guard/scanner.integration.ts"], testTimeout: 90000 },
});
