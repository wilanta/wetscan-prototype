import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import config from "../../../next.config";
it("normal Live startup and production use Webpack within the existing worktree", async () => {
  const p = JSON.parse(await readFile("package.json", "utf8"));
  const runner = await readFile("scripts/guard-live-check.mjs", "utf8");
  expect(p.scripts.build).toBe("next build --webpack");
  expect(p.scripts["guard:dev"]).toBe("next dev --webpack --hostname 127.0.0.1 --port 3000");
  expect(p.scripts["guard:dev"]).not.toMatch(/mvp|demo/);
  expect(runner).toContain('build: ["node_modules/next/dist/bin/next", "build", "--webpack"]');
  expect(config.outputFileTracingRoot).toBe(process.cwd());
});
it("route and server traces exclude the entire private runtime and credential environments", () => {
  for (const key of ["/*", "next-server"]) {
    for (const entry of ["./.env", "./.env.*", "./.local", "./.local/**/*"])
      expect(config.outputFileTracingExcludes![key]).toContain(entry);
  }
});
