import { expect, it } from "vitest";
import manifest from "../../../docs/acceptance/guard-g03/20261120-stabilization/changed-files.json";
import { scanFiles } from "../../../scripts/sentinel-secret-scan";
it("audits all 75 checkpoint files for credential shapes and excludes private state, dotenv and database dumps", () => {
  const files = manifest.files.map((f) => f.file);
  expect(files).toHaveLength(75);
  expect(
    files.some((f) =>
      /(?:^|\/)(?:\.env(?:\.|$)|\.local\/|\.git\/)|\.(?:pem|key|password|dump|sql|bak|zip)$/i.test(
        f,
      ),
    ),
  ).toBe(false);
  const report = scanFiles(files);
  expect(report.incomplete).toEqual([]);
  expect(report.findings).toEqual([]);
  expect(report.skippedBinary).toBe(0);
  expect(report.ok).toBe(true);
});
