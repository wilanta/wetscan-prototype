// Filesystem-only policy. No auth-store API, HTTP, database, or service imports.
import { createDecipheriv } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  canonical,
  sha256,
  verifyArchivedOwnerSession,
  type ArchiveSessionPolicy,
} from "./sentinel-owner-session-exception";
import {
  inventoryOwnerAuth,
  type SnapshotGuards,
} from "./sentinel-owner-auth-snapshot";

export class PackageError extends Error {
  constructor(public readonly classification: string) {
    super("provision_package_failed");
  }
}
export function demand(value: unknown, code: string): asserts value {
  if (!value) throw new PackageError(code);
}
export const within = (root: string, path: string) => {
  const rel = relative(resolve(root), resolve(path));
  return rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel);
};
export type PackagePolicy = Readonly<{
  repo: string;
  root: string;
  archive: ArchiveSessionPolicy;
  descriptor: string;
  parentManifest: string;
  parentSha256: string;
  historicalInventory: string;
  historicalSha256: string;
  ownerDecision: string;
  ownerDecisionSha256: string;
}>;
export type PackageManifest = {
  schemaVersion: 2;
  kind: string;
  phase: string;
  files: Record<string, string>;
  absentPaths: string[];
  dotenvFiles: Record<string, { exists: boolean; sha256: string | null }>;
  candidateFile: string;
  candidateRecord: string;
  historicalInventorySha256: string;
  parentManifestSha256: string;
};
export const packageRequiredFiles = [
  "scripts/Invoke-S04ProvisionPackage.ps1",
  "scripts/sentinel-provision-package.ts",
  "scripts/sentinel-provision-package-policy.ts",
  "scripts/sentinel-provision-package-check.ts",
  "scripts/sentinel-provision-package-owner.ts",
  "scripts/sentinel-provision-enforcement.ts",
  "scripts/sentinel-provision-owner.ts",
  "scripts/sentinel-provision-safety.ts",
  "scripts/sentinel-provision-common.ps1",
  "scripts/sentinel-provision-auth.ps1",
  "scripts/sentinel-session-get.ps1",
  "scripts/sentinel-provision-watchdog.ps1",
  "scripts/sentinel-provision-private.ps1",
  "scripts/sentinel-owner-session-exception.ts",
  "scripts/sentinel-approval-history.ts",
  "scripts/sentinel-owner-auth-snapshot.ts",
  "tests/sentinel/provision-package.test.ts",
  "tests/sentinel/provision-package-fixture.ts",
  "tests/sentinel/provision-package-runner.test.ts",
  "docs/SENTINEL_S04_PROVISION_PACKAGE.md",
  "docs/SENTINEL_S04_AUTH_ARCHIVE_EXCEPTION.md",
  "docs/SENTINEL_S04_VALIDATION.md",
  "docs/agent-handoffs/HANDOFF_S04.md",
  "docs/SENTINEL_INTEGRATION_BACKLOG.md",
  "docs/SENTINEL_S04_OFFLINE_ACCEPTANCE.md",
  "src/features/canvas/server/github-reader.ts",
  "src/lib/auth/github.ts",
  "src/lib/auth/session.ts",
  "src/lib/auth/store.ts",
  ".next/BUILD_ID",
  ".local/sentinel/s04-h04c-a-private-directory.txt",
];
export function parseObject(bytes: Buffer): Record<string, unknown> {
  try {
    const value = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
    // JSON.parse otherwise silently accepts duplicate authority/hash fields.
    const stack: ({ keys: Set<string>; keyExpected: boolean } | null)[] = [];
    for (const match of bytes
      .toString("utf8")
      .matchAll(
        /"(?:[^"\\]|\\.)*"|[{}\[\],:]|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
      )) {
      const token = match[0],
        top = stack.at(-1);
      if (token === "{") stack.push({ keys: new Set(), keyExpected: true });
      else if (token === "[") stack.push(null);
      else if (token === "}" || token === "]") stack.pop();
      else if (token === "," && top) top.keyExpected = true;
      else if (token.startsWith('"') && top?.keyExpected) {
        const key = JSON.parse(token);
        demand(!top.keys.has(key), "json_duplicate_key");
        top.keys.add(key);
        top.keyExpected = false;
      }
    }
    demand(
      value && typeof value === "object" && !Array.isArray(value),
      "json_object",
    );
    return value;
  } catch {
    throw new PackageError("json_object");
  }
}
export async function noLinks(path: string) {
  let p = resolve(path);
  while (true) {
    const stat = await lstat(p).catch((e) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    demand(!stat?.isSymbolicLink(), "path_link");
    const parent = dirname(p);
    if (parent === p) return;
    p = parent;
  }
}
export async function bytesAt(path: string) {
  await noLinks(path);
  const stat = await lstat(path);
  demand(stat.isFile() && stat.nlink === 1, "file_identity");
  return readFile(path);
}
export function selectCandidate(file: string, p: PackagePolicy) {
  demand(
    file &&
      resolve(file) === resolve(p.archive.candidateFile) &&
      resolve(file) !== resolve(p.archive.oldCookieFile),
    "explicit_candidate_required",
  );
}
export async function loadPackageManifest(
  file: string,
  digest: string,
  p: PackagePolicy,
  guards: SnapshotGuards,
) {
  demand(/^[a-f0-9]{64}$/.test(digest), "manifest_digest");
  await guards.privatePath(file);
  guards.assertPrivateAcl(file, true);
  const bytes = await bytesAt(file);
  demand(sha256(bytes) === digest, "manifest_digest");
  const m = parseObject(bytes) as unknown as PackageManifest;
  demand(
    m.schemaVersion === 2 &&
      m.kind === "S04_PROVISION_EXECUTION_PACKAGE" &&
      m.phase === "provision-ingest" &&
      m.files &&
      typeof m.files === "object" &&
      !Array.isArray(m.files),
    "manifest_scope",
  );
  selectCandidate(m.candidateFile, p);
  demand(
    canonical(m.absentPaths) ===
      canonical([resolve(p.archive.absentSessionFile)]) &&
      m.parentManifestSha256 === p.parentSha256 &&
      m.historicalInventorySha256 === p.historicalSha256,
    "manifest_bindings",
  );
  const parentBytes = await bytesAt(p.parentManifest),
    historyBytes = await bytesAt(p.historicalInventory);
  demand(
    sha256(parentBytes) === p.parentSha256 &&
      sha256(historyBytes) === p.historicalSha256,
    "historical_anchor",
  );
  const parent = parseObject(parentBytes).files as Record<string, string>;
  const history = parseObject(historyBytes) as Record<string, string>;
  // Parent pins legitimately superseded by later reviewed repairs (login-flow,
  // audit-deadline, provisioning hooks) or by the owner re-login (profile reseal).
  const replacements = [
    "docs/SENTINEL_S04_AUTH_ARCHIVE_EXCEPTION.md",
    "scripts/sentinel-provision-owner.ts",
    "scripts/sentinel-provision-safety.ts",
    "tests/sentinel/provision-hardening.test.ts",
    "scripts/sentinel-owner-session-exception.ts",
    "scripts/sentinel-approval-history.ts",
    "scripts/sentinel-readonly-audit.ts",
    "scripts/Invoke-S04ReadOnlyAudit.ps1",
    "scripts/Invoke-H04CB2ProvisionAndIngest.ps1",
    "src/components/auth/api.ts",
    "tests/sentinel/dev-acceptance-safety.ts",
  ]
    .map((n) => resolve(p.repo, n))
    .concat(resolve(p.archive.authDir, "user-187839747.bin"));
  for (const [path, hash] of Object.entries(parent))
    demand(
      Object.hasOwn(m.files, path) &&
        (replacements.includes(resolve(path)) || m.files[path] === hash),
      "parent_pin_dropped_or_changed",
    );
  for (const [path, hash] of Object.entries(history))
    demand(m.files[path] === hash, "historical_pin_dropped");
  for (const path of [
    ...packageRequiredFiles.map((n) => resolve(p.repo, n)),
    p.descriptor,
    p.ownerDecision,
    p.parentManifest,
    p.historicalInventory,
    join(dirname(p.historicalInventory), "reviewed-owner-procedure.ps1"),
    join(dirname(p.historicalInventory), "future-owner-grant.template.txt"),
    p.archive.candidateFile,
    p.archive.candidateFile + ".meta.json",
    p.archive.archiveFile,
    p.archive.baselineFile,
    ...(p.archive.recovery ? [p.archive.recovery.baselineFile] : []),
    p.archive.designFile,
    p.archive.proposalFile,
  ])
    demand(Object.hasOwn(m.files, resolve(path)), "required_pin_missing");
  demand(
    m.files[resolve(p.ownerDecision)] === p.ownerDecisionSha256,
    "owner_decision_pin",
  );
  demand(
    within(p.archive.authDir, m.candidateRecord) &&
      /^session-[a-f0-9]{64}\.bin$/.test(basename(m.candidateRecord)),
    "candidate_record_binding",
  );
  demand(
    Object.hasOwn(m.files, resolve(m.candidateRecord)),
    "candidate_record_pin",
  );
  const envNames = [
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
  ].map((n) => resolve(p.repo, n));
  demand(
    m.dotenvFiles &&
      canonical(Object.keys(m.dotenvFiles).sort()) ===
        canonical(envNames.sort()),
    "dotenv_set",
  );
  return m;
}
function decrypt(bytes: Buffer, name: string, secret: string) {
  try {
    const d = createDecipheriv(
      "aes-256-gcm",
      shaKey(secret),
      bytes.subarray(0, 12),
    );
    d.setAAD(Buffer.from(name));
    d.setAuthTag(bytes.subarray(12, 28));
    return parseObject(
      Buffer.concat([d.update(bytes.subarray(28)), d.final()]),
    );
  } catch {
    throw new PackageError("candidate_encryption");
  }
}
const shaKey = (secret: string) =>
  Buffer.from(sha256(Buffer.from(secret)), "hex");
export function candidateSemantics(
  before: Buffer,
  after: Buffer,
  name: string,
  secret: string,
  now: number,
  minimumMs = 30 * 60000,
) {
  const first = decrypt(before, name, secret),
    current = decrypt(after, name, secret);
  demand(canonical(first) === canonical(current), "candidate_semantic_change");
  demand(
    current.githubId === 187839747 &&
      !current.flow &&
      Number.isFinite(current.expiresAt) &&
      Number(current.expiresAt) > now,
    "candidate_identity",
  );
  demand(
    typeof current.userToken === "string" &&
      current.userToken.length > 0 &&
      typeof current.refreshToken === "string" &&
      current.refreshToken.length > 0 &&
      Number.isFinite(current.tokenExpiresAt) &&
      Number(current.tokenExpiresAt) >= now + minimumMs,
    "candidate_lifetime",
  );
  return {
    semanticContentsUnchanged: true,
    tokenMinutesRemaining: Math.floor(
      (Number(current.tokenExpiresAt) - now) / 60000,
    ),
  };
}
export async function verifyPackageFiles(
  m: PackageManifest,
  p: PackagePolicy,
  candidateBefore?: Buffer,
) {
  for (const [path, hash] of Object.entries(m.files)) {
    demand(
      isAbsolute(path) &&
        (within(p.repo, path) ||
          within(p.root, path) ||
          within(p.archive.authDir, path)) &&
        /^[a-f0-9]{64}$/.test(hash),
      "manifest_boundary",
    );
    const bytes = await bytesAt(path);
    if (candidateBefore && resolve(path) === resolve(m.candidateRecord))
      demand(sha256(candidateBefore) === hash, "candidate_before_pin");
    else demand(sha256(bytes) === hash, "input_drift");
  }
  for (const [path, pin] of Object.entries(m.dotenvFiles)) {
    await noLinks(path);
    const bytes = await bytesAt(path).catch((e) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    demand(
      Boolean(bytes) === pin.exists && (!bytes || sha256(bytes) === pin.sha256),
      "dotenv_drift",
    );
  }
  await noLinks(p.archive.absentSessionFile);
  const absent = await lstat(p.archive.absentSessionFile).then(
    () => false,
    (e) => {
      if (e.code === "ENOENT") return true;
      throw e;
    },
  );
  demand(absent, "archived_session_reappeared");
}
export type PackageGrant = {
  kind: string;
  phase: string;
  status: string;
  approvedBy: string;
  notBefore: string;
  expiresAt: string;
  manifestSha256: string;
  runnerSha256: string;
  candidateFile: string;
  outputDirectory: string;
  target: { host: string; port: number; database: string; marker: string };
  workspace: string;
  project: string;
  attempts: number;
  allowCandidatePersistence: boolean;
  allowProviderReads: boolean;
  allowActiveHandoff: boolean;
  allowEmergencyContainment: boolean;
  allowRefresh: boolean;
  normalNewRows: number;
  emergencyNewRows: number;
  historicalRowsModified: number;
};
export function validatePackageGrant(
  g: PackageGrant,
  manifestSha: string,
  runnerSha: string,
  cookie: string,
  output: string,
  now: number,
  finishing = false,
) {
  demand(
    g &&
      g.kind === "S04_SINGLE_PROVISION_OWNER_GRANT" &&
      g.phase === "provision-ingest" &&
      g.status === "OWNER_AUTHORIZED_ONE_ATTEMPT" &&
      typeof g.approvedBy === "string" &&
      /^[A-Za-z0-9 _:.\/-]{3,160}$/.test(g.approvedBy),
    "live_owner_grant",
  );
  demand(
    canonical(Object.keys(g).sort()) ===
      canonical(
        [
          "kind",
          "phase",
          "status",
          "approvedBy",
          "notBefore",
          "expiresAt",
          "manifestSha256",
          "runnerSha256",
          "candidateFile",
          "outputDirectory",
          "target",
          "workspace",
          "project",
          "attempts",
          "allowCandidatePersistence",
          "allowProviderReads",
          "allowActiveHandoff",
          "allowEmergencyContainment",
          "allowRefresh",
          "normalNewRows",
          "emergencyNewRows",
          "historicalRowsModified",
        ].sort(),
      ),
    "grant_fields",
  );
  const utc = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
  demand(utc.test(g.notBefore) && utc.test(g.expiresAt), "grant_deadline");
  const start = Date.parse(g.notBefore),
    end = Date.parse(g.expiresAt);
  demand(
    Number.isFinite(start) &&
      Number.isFinite(end) &&
      start <= now &&
      end > start &&
      end - start <= 600000 &&
      (finishing || now < end),
    "grant_deadline",
  );
  demand(
    g.manifestSha256 === manifestSha &&
      g.runnerSha256 === runnerSha &&
      resolve(g.candidateFile) === resolve(cookie) &&
      resolve(g.outputDirectory) === resolve(output),
    "grant_binding",
  );
  demand(
    g.target?.host === "127.0.0.1" &&
      canonical(Object.keys(g.target).sort()) ===
        canonical(["host", "port", "database", "marker"].sort()) &&
      g.target.port === 55432 &&
      g.target.database === "wetscan_dev" &&
      g.target.marker === "wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f" &&
      g.workspace === "github-user-187839747:test" &&
      g.project === "github-998736528",
    "grant_target",
  );
  demand(
    g.attempts === 1 &&
      g.allowCandidatePersistence === true &&
      g.allowProviderReads === true &&
      g.allowActiveHandoff === true &&
      g.allowEmergencyContainment === true &&
      g.allowRefresh === false &&
      g.normalNewRows === 10 &&
      g.emergencyNewRows === 12 &&
      g.historicalRowsModified === 0,
    "grant_scope",
  );
  return end;
}
export async function verifyAuthBoundary(
  m: PackageManifest,
  p: PackagePolicy,
  guards: SnapshotGuards,
  secret: string,
  before: Buffer,
  now: number,
) {
  const raw = (await bytesAt(p.archive.candidateFile)).toString("utf8").trim();
  demand(/^wetscan_session=[a-f0-9]{64}$/.test(raw), "candidate_cookie");
  const name = "session-" + sha256(Buffer.from(raw.slice(16)));
  demand(
    resolve(m.candidateRecord) === resolve(p.archive.authDir, name + ".bin"),
    "candidate_record_binding",
  );
  const inventory = await inventoryOwnerAuth(p.archive.authDir, guards);
  const expected = Object.keys(m.files)
    .filter((f) => within(p.archive.authDir, f))
    .map((f) => relative(p.archive.authDir, f))
    .sort();
  demand(
    canonical(Object.keys(inventory.records).sort()) === canonical(expected),
    "unexpected_auth_write",
  );
  const design = parseObject(await bytesAt(p.archive.designFile));
  const baseline = parseObject(await bytesAt(p.archive.baselineFile));
  demand(
    canonical(inventory.directories) === canonical(baseline.directories),
    "auth_directory_drift",
  );
  demand(
    Object.keys(design.expectedExistingAuthFilePins as object).length === 6 &&
      expected.length ===
        (p.archive.recovery
          ? 7 + Object.keys(p.archive.recovery.knownRecords ?? {}).length
          : 6),
    "auth_set",
  );
  const result = candidateSemantics(
    before,
    await bytesAt(m.candidateRecord),
    name,
    secret,
    now,
  );
  // No extra names, temporary records, or concurrent historical changes may
  // disappear into the single candidate-ciphertext allowance.
  const after = await inventoryOwnerAuth(p.archive.authDir, guards);
  demand(canonical(after) === canonical(inventory), "concurrent_auth_change");
  for (const [file, hash] of Object.entries(after.records))
    if (resolve(p.archive.authDir, file) !== resolve(m.candidateRecord))
      demand(
        m.files[resolve(p.archive.authDir, file)] === hash,
        "historical_auth_change",
      );
  demand(
    await lstat(p.archive.absentSessionFile).then(
      () => false,
      (e) => {
        if (e.code === "ENOENT") return true;
        throw e;
      },
    ),
    "archived_session_reappeared",
  );
  return {
    ...result,
    candidateCiphertextChanged:
      sha256(before) !==
      inventory.records[relative(p.archive.authDir, m.candidateRecord)],
    historicalAuthPreserved: true,
    archiveOnlyRecords: 1,
    completeHistoricalActiveFilePreservation: false,
  };
}
export async function initialArchiveCheck(
  p: PackagePolicy,
  guards: SnapshotGuards,
  secret: string,
  authDir: string,
  origin: string,
  configPins: Record<string, string>,
) {
  return verifyArchivedOwnerSession({
    policy: p.archive,
    descriptorBytes: await bytesAt(p.descriptor),
    guards,
    secret,
    configuredAuthDir: authDir,
    configuredOrigin: origin,
    configPins,
  });
}
export const packageBudget = Object.freeze({
  normalNewRows: 10,
  emergencyNewRows: 12,
  historicalRowsModified: 0,
  normalInsertStatements: 11,
  emergencyInsertStatements: 13,
  projectBindingUpsertStatements: 1,
  projectBindingRowsModified: 0,
});
