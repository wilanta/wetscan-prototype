import { it, expect } from "vitest";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { join, resolve, relative, basename } from "node:path";
import { tmpdir } from "node:os";
import {
  probeReferences,
  referenceNames,
} from "../../../scripts/guard-live-references";
it("reference absence and G01 path reuse remain blocked without reading contents", async () => {
  const r = await probeReferences({
    GUARD_DB_APP_PASSWORD_FILE: join(tmpdir(), "guard-g01", "not-opened.txt"),
  });
  expect(r.processReadiness).toBe("REFERENCE_MISSING_OR_METADATA_INVALID");
  expect(r).toMatchObject({
    credentialContentsRead: false,
    databaseConnected: false,
    roleAuthenticationVerified: false,
    runtimeOperations: 0,
  });
});
it("five existing distinct metadata references are process-ready only, not DB authority", async () => {
  const root = await mkdtemp(join(tmpdir(), "wetscan-reference-unit-"));
  try {
    const env: Record<string, string | undefined> = {};
    for (const [i, name] of referenceNames.entries()) {
      const file = join(root, "metadata-" + i + ".txt");
      await writeFile(file, "SYNTHETIC_REFERENCE_ONLY");
      env[name] = file;
    }
    const r = await probeReferences(env);
    expect(r.processReadiness).toBe(
      "REFERENCE_METADATA_READY_DB_NOT_CONNECTED",
    );
    env.GUARD_DB_WORKER_PASSWORD_FILE = env.GUARD_DB_APP_PASSWORD_FILE;
    expect((await probeReferences(env)).processReadiness).toBe(
      "REFERENCE_MISSING_OR_METADATA_INVALID",
    );
  } finally {
    const actual = resolve(root),
      parent = resolve(tmpdir());
    if (
      relative(parent, actual).startsWith("..") ||
      !basename(actual).startsWith("wetscan-reference-unit-")
    )
      throw Error("fixture_boundary");
    await rm(actual, { recursive: true, force: true });
  }
});
it("catalog observer reports all baseline prerequisites without target connection or DDL/DML", async () => {
  const s = await readFile("migrations/guard/g02-target.READONLY.sql", "utf8");
  expect(s).toContain("'sharedBaselineRoles'");
  expect(s).toContain("'wetscan_app','wetscan_sentinel_worker'");
  expect(s).toContain("BEGIN READ ONLY");
  expect(s.trimEnd()).toMatch(/ROLLBACK;$/);
  expect(s).not.toMatch(
    /(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\s+(?:TABLE|ROLE|DATABASE|INTO)/i,
  );
});
