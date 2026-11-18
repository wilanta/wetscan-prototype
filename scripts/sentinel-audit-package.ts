// Filesystem-only package bindings. Never imports a database or auth-store API.
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditCheck,
  auditMaximumMs,
  auditTarget,
} from "./sentinel-readonly-audit-contract";
import {
  bytesAt,
  noLinks,
  parseObject,
  within,
} from "./sentinel-provision-package";
import { canonical, sha256 } from "./sentinel-owner-session-exception";

const repo = fileURLToPath(new URL("..", import.meta.url));
const root = "C:/Users/sheil/.wetscan-sentinel";
const auth = "C:/Users/sheil/.wetscan-auth";
const absentName =
  "session-f3c7b6eddeff1ea869f12c075adb438e92023dedd4e817adb2fded17fb63b17e.bin";
export const auditPackageTarget = Object.freeze({
  ...auditTarget,
  containerId:
    "178eef261a5e1a7163bd4943dafd4b8bc8bdc77dfcc80be9270517c60b21a4f4",
  containerName: "wetscan-sentinel-s04-postgres-792151c53653",
  imageId:
    "sha256:99d1a998c76487d3abb48b141505bda5dcf8089c0c4cd7be40f75de314fa32f0",
  volume: "wetscan_sentinel_s04_dev_clone_20261117_792151c53653",
});
export const auditPackageLimits = Object.freeze({
  connectionAttempts: 1,
  maximumDurationMs: auditMaximumMs,
  databaseWrites: 0,
  providerRequests: 0,
  workerStarts: 0,
});
export type AuditPackageBindings = {
  schemaVersion: number;
  kind: string;
  phase: string;
  target: typeof auditPackageTarget;
  limits: typeof auditPackageLimits;
  credentialFile: string;
  dotenvBindings: Record<string, { exists: boolean; sha256: string | null }>;
  requiredAbsentPaths: string[];
  dependencyFiles: string[];
  runtimeBinaries: Record<string, string>;
  authInventoryFile: string;
  historicalInventoryFile: string;
  parentManifestFile: string;
  parentManifestSha256: string;
  reconciliationFile: string;
  ownerProcedureFile: string;
  infrastructureReceiptFile: string;
};
export function validateAuditPackageBindings(
  value: unknown,
  pins: Record<string, string>,
  repoRoot: string,
  privateRoot: string,
) {
  const b = value as AuditPackageBindings;
  auditCheck(
    b &&
      typeof b === "object" &&
      b.schemaVersion === 1 &&
      b.kind === "S04_DEV_READ_ONLY_AUDIT_PACKAGE" &&
      b.phase === "preservation-audit",
    "audit_package_scope",
  );
  auditCheck(
    canonical(b.target) === canonical(auditPackageTarget) &&
      canonical(b.limits) === canonical(auditPackageLimits),
    "audit_package_target_limits",
  );
  auditCheck(
    resolve(b.credentialFile) ===
      resolve(privateRoot, "s01-20261114/secrets/migration.password"),
    "audit_package_credential",
  );
  const envNames = [
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
  ]
    .map((n) => resolve(repoRoot, n))
    .sort();
  auditCheck(
    b.dotenvBindings &&
      canonical(Object.keys(b.dotenvBindings).sort()) === canonical(envNames),
    "audit_package_dotenv_set",
  );
  for (const [file, pin] of Object.entries(b.dotenvBindings))
    auditCheck(
      pin &&
        typeof pin.exists === "boolean" &&
        (pin.exists
          ? typeof pin.sha256 === "string" &&
            /^[a-f0-9]{64}$/.test(pin.sha256) &&
            pins[file] === pin.sha256
          : pin.sha256 === null),
      "audit_package_dotenv_binding",
    );
  auditCheck(
    Array.isArray(b.dependencyFiles) &&
      b.dependencyFiles.length > 0 &&
      new Set(b.dependencyFiles).size === b.dependencyFiles.length,
    "audit_package_dependencies",
  );
  for (const f of [
    b.credentialFile,
    b.authInventoryFile,
    b.historicalInventoryFile,
    b.parentManifestFile,
    b.reconciliationFile,
    b.ownerProcedureFile,
    b.infrastructureReceiptFile,
    ...b.dependencyFiles,
  ])
    auditCheck(
      typeof f === "string" && /^[a-f0-9]{64}$/.test(pins[resolve(f)] ?? ""),
      "audit_package_required_pin",
    );
  for (const file of [
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
  ])
    auditCheck(
      b.dependencyFiles.includes(resolve(repoRoot, file)),
      "audit_package_dependency_coverage",
    );
  return b;
}

/** Filesystem-only checks; the live entrypoint supplies the fixed owner scope. */
export async function verifyAuditAuthFiles(
  authRoot: string,
  expected: Record<string, unknown>,
  requiredAbsent: string[],
) {
  for (const f of requiredAbsent) {
    auditCheck(within(authRoot, f), "audit_package_absence_scope");
    auditCheck(
      await lstat(f).then(
        () => false,
        (e) => {
          if (e.code === "ENOENT") return true;
          throw e;
        },
      ),
      "audit_package_absent_reappeared",
    );
  }
  const actual: Record<string, string> = {};
  async function scan(dir: string) {
    await noLinks(dir);
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const f = join(dir, e.name);
      if (dir === authRoot && e.isDirectory() && e.name === "canvas-graphs-v1")
        await scan(f);
      else {
        auditCheck(e.isFile(), "audit_package_auth_entry");
        actual[f] = sha256(await bytesAt(f));
      }
    }
  }
  auditCheck(
    Object.entries(expected).every(
      ([f, h]) =>
        within(authRoot, f) &&
        typeof h === "string" &&
        /^[a-f0-9]{64}$/.test(h),
    ),
    "audit_package_auth_scope",
  );
  await scan(authRoot);
  auditCheck(
    canonical(actual) === canonical(expected),
    "audit_package_auth_drift",
  );
}
export async function verifyAuditPackageBindings(
  manifestFile: string,
  pins: Record<string, string>,
  credentialFile: string,
) {
  const directory = dirname(resolve(manifestFile)),
    file = join(directory, "audit-package-bindings.private.json");
  auditCheck(
    within(root, directory) &&
      pins[file] &&
      sha256(await bytesAt(file)) === pins[file],
    "audit_package_binding_pin",
  );
  const b = validateAuditPackageBindings(
    parseObject(await bytesAt(file)),
    pins,
    repo,
    root,
  );
  auditCheck(
    resolve(credentialFile) === resolve(b.credentialFile),
    "audit_package_credential",
  );
  auditCheck(
    resolve(b.ownerProcedureFile) ===
      join(directory, "reviewed-owner-procedure.ps1") &&
      resolve(b.authInventoryFile) ===
        join(directory, "auth-before.private.json") &&
      resolve(b.historicalInventoryFile) ===
        join(directory, "historical-before.private.json"),
    "audit_package_paths",
  );
  auditCheck(
    canonical(b.requiredAbsentPaths) === canonical([resolve(auth, absentName)]),
    "audit_package_absence_scope",
  );
  for (const [f, pin] of Object.entries(b.dotenvBindings)) {
    const bytes = await bytesAt(f).catch((e) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    auditCheck(
      Boolean(bytes) === pin.exists && (!bytes || sha256(bytes) === pin.sha256),
      "audit_package_dotenv_drift",
    );
  }
  const binaries = [
    process.execPath,
    "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
    "C:/Users/sheil/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe",
  ]
    .map((resolvePath) => resolve(resolvePath))
    .sort();
  auditCheck(
    canonical(Object.keys(b.runtimeBinaries).sort()) === canonical(binaries),
    "audit_package_runtime_set",
  );
  for (const [f, h] of Object.entries(b.runtimeBinaries)) {
    // Windows system binaries can have servicing-managed hardlinks. Only these
    // three fixed executable paths use this check; evidence still requires nlink=1.
    await noLinks(f);
    const info = await lstat(f);
    auditCheck(
      info.isFile() &&
        !info.isSymbolicLink() &&
        (await realpath(f)) === f &&
        sha256(await readFile(f)) === h,
      "audit_package_runtime_drift",
    );
  }
  const history = parseObject(await bytesAt(b.historicalInventoryFile));
  for (const [f, h] of Object.entries(history))
    auditCheck(pins[f] === h, "audit_package_history_dropped");
  auditCheck(
    b.parentManifestSha256 ===
      "b862f73f78378a94e0aa81c66a17be7738308a5f10eda944560a0d791f5ca1f0" &&
      sha256(await bytesAt(b.parentManifestFile)) === b.parentManifestSha256,
    "audit_package_parent",
  );
  const parent = parseObject(await bytesAt(b.parentManifestFile)),
    reconciliation = parseObject(await bytesAt(b.reconciliationFile));
  const replacements = reconciliation.replacements as Record<
    string,
    { before: string; after: string }
  >;
  const allowed = [
    "sentinel-provision-common.ps1",
    "Invoke-H04CB2ProvisionAndIngest.ps1",
    "sentinel-provision-owner.ts",
    "sentinel-session-get.ps1",
    "sentinel-approval-history.ts",
    "sentinel-provision-watchdog.ps1",
    "sentinel-readonly-audit.ts",
    "Invoke-S04ReadOnlyAudit.ps1",
  ].map((n) => resolve(repo, "scripts", n));
  // Only the reviewed infrastructure tuple changes in this shared dependency.
  allowed.push(resolve(repo, "tests/sentinel/dev-acceptance-safety.ts"));
  for (const [f, h] of Object.entries(parent))
    auditCheck(
      pins[f] === h ||
        (allowed.includes(resolve(f)) &&
          replacements?.[f]?.before === h &&
          replacements[f].after === pins[f]),
      "audit_package_parent_reconciliation",
    );
  const authPins = parseObject(await bytesAt(b.authInventoryFile));
  auditCheck(
    Object.keys(authPins).length === 6 &&
      Object.keys(authPins).every((f) => within(auth, f)),
    "audit_package_auth_scope",
  );
  await verifyAuditAuthFiles(resolve(auth), authPins, b.requiredAbsentPaths);
  return b;
}
