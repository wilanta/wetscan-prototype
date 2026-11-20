import { it, expect } from "vitest";
import { readdir } from "node:fs/promises";
import { scanFiles } from "../../../scripts/sentinel-secret-scan";
it("G03 additions contain no credential-shaped values and inspect no owner env/private files", async () => {
  const roots = ["src/features/guard/g03", "tests/guard/g03"];
  const files = [
    "next.config.ts",
    "scripts/guard-g03-check.mjs",
    "scripts/guard-g03-setup.ts",
    "docs/config/guard-g03.provider.example.json",
    "src/features/guard/live/live-workspace.tsx",
    "src/app/app/projects/[projectId]/guard/[[...section]]/page.tsx",
    "tests/guard/live/g03-ui.spec.ts",
    "src/app/api/guard/projects/[projectId]/scans/[jobId]/g03/[action]/route.ts",
  ];
  for (const root of roots)
    for (const name of await readdir(root))
      if (/\.(?:ts|tsx|mjs)$/.test(name)) files.push(root + "/" + name);
  const report = scanFiles(files);
  expect(report.incomplete).toEqual([]);
  expect(report.findings).toEqual([]);
  expect(report.ok).toBe(true);
});
