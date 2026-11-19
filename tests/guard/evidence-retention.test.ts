import { it, expect } from "vitest";
import { readFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
it("preserves all 33 accepted artifacts after obsolete recipient handoff relocation, including identical raw bytes", async () => {
  const root = "docs/acceptance/guard-g01/",
    manifest = JSON.parse(
      await readFile(
        root + "worker-auth-evidence-manifest.job-2c18db66.json",
        "utf8",
      ),
    ),
    relocations = JSON.parse(
      await readFile(
        root + "history-ownership-20261116/relocations.json",
        "utf8",
      ),
    );
  expect(relocations.historicalInstructionsActive).toBe(false);
  expect(manifest.files).toHaveLength(33);
  // Three artifacts are gitignored local test output (test-results/**) that exists only on the machine that produced
  // them; a clean checkout cannot contain them. Everything tracked must match byte for byte, and local-only files are
  // verified too whenever present. The tolerated absences are capped so real evidence loss cannot hide here.
  const localOnly = /^test-results[\\/]/;
  let absentLocalOnly = 0;
  for (const entry of manifest.files) {
    const moved = relocations.relocations.find(
        (r: { originalPath: string }) => r.originalPath === entry.file,
      ),
      path: string = moved?.archivedPath ?? entry.file;
    let bytes: Buffer;
    try {
      bytes = await readFile(path);
    } catch (error) {
      if (
        localOnly.test(path) &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        absentLocalOnly++;
        continue;
      }
      throw error;
    }
    expect(createHash("sha256").update(bytes).digest("hex"), entry.file).toBe(
      entry.rawSha256,
    );
  }
  expect(absentLocalOnly).toBeLessThanOrEqual(3);
  for (const moved of relocations.relocations) {
    await expect(access(moved.originalPath)).rejects.toThrow();
    expect(
      createHash("sha256")
        .update(await readFile(moved.archivedPath))
        .digest("hex"),
    ).toBe(moved.rawSha256);
  }
  const active = await readFile(relocations.activeDocument, "utf8");
  expect(active).toContain("owner/Codex");
  expect(active).toContain("BLOCKED_BY_PRESERVATION_CONSTRAINT");
  expect(active).toContain("TARGET_NOT_IDENTIFIED");
  expect(active).toContain("3600000ms");
});
