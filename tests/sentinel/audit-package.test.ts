import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { mkdtemp, writeFile, mkdir, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  auditPackageTarget,
  auditPackageLimits,
  validateAuditPackageBindings,
  verifyAuditAuthFiles,
  type AuditPackageBindings,
} from "../../scripts/sentinel-audit-package";
import { parseObject } from "../../scripts/sentinel-provision-package";
import { sha256 } from "../../scripts/sentinel-owner-session-exception";

function fixture() {
  const repo = resolve("C:/synthetic/audit-repo"),
    root = resolve("C:/synthetic/private");
  const required = [
    "scripts/sentinel-audit-package.ts",
    "scripts/sentinel-readonly-audit.ts",
    "scripts/sentinel-readonly-audit-contract.ts",
    "scripts/Invoke-S04ReadOnlyAudit.ps1",
    "scripts/sentinel-readonly-audit-common.ps1",
    "scripts/sentinel-readonly-audit-watchdog.ps1",
    "scripts/sentinel-provision-enforcement.ts",
    "scripts/Invoke-S04AuditProcedure.ps1",
    "scripts/sentinel-audit-procedure.mjs",
    "scripts/sentinel-audit-diagnostics.mjs",
    "scripts/sentinel-audit-infrastructure.mjs",
    "scripts/sentinel-audit-owner-template.ps1",
    "scripts/sentinel-audit-command-template.ps1",
    "package.json",
    "package-lock.json",
  ].map((n) => resolve(repo, n));
  const value: AuditPackageBindings = {
    schemaVersion: 1,
    kind: "S04_DEV_READ_ONLY_AUDIT_PACKAGE",
    phase: "preservation-audit",
    target: { ...auditPackageTarget },
    limits: { ...auditPackageLimits },
    credentialFile: resolve(root, "s01-20261114/secrets/migration.password"),
    dotenvBindings: Object.fromEntries(
      [".env", ".env.local", ".env.production", ".env.production.local"].map(
        (n) => [resolve(repo, n), { exists: false, sha256: null }],
      ),
    ),
    requiredAbsentPaths: [],
    dependencyFiles: required,
    runtimeBinaries: {},
    authInventoryFile: resolve(root, "auth-before.private.json"),
    historicalInventoryFile: resolve(root, "historical-before.private.json"),
    parentManifestFile: resolve(root, "parent.json"),
    parentManifestSha256: "a".repeat(64),
    reconciliationFile: resolve(root, "reconciliation.json"),
    ownerProcedureFile: resolve(root, "reviewed-owner-procedure.ps1"),
    infrastructureReceiptFile: resolve(root, "infrastructure.json"),
  };
  const pins = Object.fromEntries(
    [
      ...required,
      value.credentialFile,
      value.authInventoryFile,
      value.historicalInventoryFile,
      value.parentManifestFile,
      value.reconciliationFile,
      value.ownerProcedureFile,
      value.infrastructureReceiptFile,
    ].map((f) => [f, "a".repeat(64)]),
  );
  return { repo, root, value, pins };
}
describe("audit package scope (synthetic metadata only)", () => {
  it("accepts exactly the separately gated read-only DEV scope", () => {
    const f = fixture();
    expect(
      validateAuditPackageBindings(f.value, f.pins, f.repo, f.root).limits
        .connectionAttempts,
    ).toBe(1);
  });
  it.each([
    "phase",
    "database",
    "marker",
    "containerId",
    "volume",
    "connectionAttempts",
    "maximumDurationMs",
    "databaseWrites",
    "providerRequests",
    "workerStarts",
  ])(
    "rejects changed %s before any possible database construction",
    (field) => {
      const f = fixture();
      if (field === "phase") f.value.phase = "provision-ingest";
      else if (field in f.value.target)
        Object.assign(f.value.target, { [field]: "SYNTHETIC_WRONG" });
      else
        Object.assign(f.value.limits, {
          [field]: field === "maximumDurationMs" ? 120001 : 2,
        });
      expect(() =>
        validateAuditPackageBindings(f.value, f.pins, f.repo, f.root),
      ).toThrow();
    },
  );
  it.each([
    "credentialFile",
    "authInventoryFile",
    "historicalInventoryFile",
    "parentManifestFile",
    "reconciliationFile",
    "ownerProcedureFile",
    "infrastructureReceiptFile",
  ] as const)("rejects missing binding pin %s", (field) => {
    const f = fixture();
    delete f.pins[f.value[field]];
    expect(() =>
      validateAuditPackageBindings(f.value, f.pins, f.repo, f.root),
    ).toThrow();
  });
  it("rejects substituted credentials, missing dotenv entries and ambiguous config pins", () => {
    const f = fixture();
    f.value.credentialFile = resolve(f.root, "another.password");
    expect(() =>
      validateAuditPackageBindings(f.value, f.pins, f.repo, f.root),
    ).toThrow();
    const g = fixture();
    delete g.value.dotenvBindings[resolve(g.repo, ".env")];
    expect(() =>
      validateAuditPackageBindings(g.value, g.pins, g.repo, g.root),
    ).toThrow();
    const h = fixture();
    h.value.dotenvBindings[resolve(h.repo, ".env")].sha256 = "b".repeat(64);
    expect(() =>
      validateAuditPackageBindings(h.value, h.pins, h.repo, h.root),
    ).toThrow();
  });
  it("rejects omitted and duplicate dependencies", () => {
    const f = fixture();
    f.value.dependencyFiles.pop();
    expect(() =>
      validateAuditPackageBindings(f.value, f.pins, f.repo, f.root),
    ).toThrow();
    const g = fixture();
    g.value.dependencyFiles.push(g.value.dependencyFiles[0]);
    expect(() =>
      validateAuditPackageBindings(g.value, g.pins, g.repo, g.root),
    ).toThrow();
  });
  it("rejects duplicate JSON authority keys", () =>
    expect(() =>
      parseObject(
        Buffer.from(
          '{"phase":"preservation-audit","phase":"provision-ingest"}',
        ),
      ),
    ).toThrow());
});

describe(
  "audit authentication bindings (synthetic files only)",
  { timeout: 30000 },
  () => {
    it.each([
      "unchanged",
      "modified",
      "missing",
      "unexpected",
      "reappeared",
      "outside",
    ])(
      "fails closed for %s except the exact unchanged inventory",
      async (scenario) => {
        const root = await mkdtemp(resolve(tmpdir(), "wetscan-audit-package-"));
        try {
          const record = resolve(root, "session-synthetic.bin"),
            absent = resolve(root, "session-archived.bin");
          await writeFile(record, "synthetic-encrypted-fixture");
          await mkdir(resolve(root, "canvas-graphs-v1"));
          const pins = {
            [record]: sha256(Buffer.from("synthetic-encrypted-fixture")),
          };
          if (scenario === "modified") await writeFile(record, "modified");
          if (scenario === "missing") await unlink(record);
          if (scenario === "unexpected")
            await writeFile(resolve(root, "unexpected.bin"), "new");
          if (scenario === "reappeared") await writeFile(absent, "archived");
          const result = verifyAuditAuthFiles(root, pins, [
            scenario === "outside"
              ? resolve(root, "..", "outside.bin")
              : absent,
          ]);
          if (scenario === "unchanged")
            await expect(result).resolves.toBeUndefined();
          else await expect(result).rejects.toThrow();
        } finally {
          // Only the canonical directory just created by mkdtemp is removed.
          if (!root.startsWith(resolve(tmpdir(), "wetscan-audit-package-")))
            throw Error("synthetic_cleanup_boundary");
          await rm(root, { recursive: true, force: true });
        }
      },
    );
  },
);
