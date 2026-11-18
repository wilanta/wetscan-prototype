// Filesystem-only verification. No session-store API, network, or auth writes.
import { createDecipheriv, createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  inventoryOwnerAuth,
  type SnapshotGuards,
} from "./sentinel-owner-auth-snapshot";

export const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
export const canonical = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
          .join(",")}}`
      : JSON.stringify(value);
export class ArchiveSessionError extends Error {
  constructor(public readonly classification: string) {
    super("archive_session_validation_failed");
  }
}
export function archiveFailureReceipt(error: unknown) {
  return {
    status: "NOT_VERIFIED",
    classification:
      error instanceof ArchiveSessionError
        ? error.classification
        : "offline_validation_failed",
    authWrites: 0,
    databaseConnections: 0,
    githubRequests: 0,
    liveAcceptanceAuthorized: false,
  } as const;
}
function check(value: unknown, code: string): asserts value {
  if (!value) throw new ArchiveSessionError(code);
}
function object(value: unknown): Record<string, unknown> {
  check(
    value && typeof value === "object" && !Array.isArray(value),
    "malformed_evidence",
  );
  return value as Record<string, unknown>;
}
function pins(value: unknown): Record<string, string> {
  const result = object(value);
  check(
    Object.values(result).every(
      (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v),
    ),
    "malformed_evidence",
  );
  return result as Record<string, string>;
}
function parse(bytes: Buffer): Record<string, unknown> {
  try {
    return object(JSON.parse(bytes.toString("utf8")));
  } catch {
    throw new ArchiveSessionError("malformed_evidence");
  }
}
const same = (a: unknown, b: string) =>
  typeof a === "string" && resolve(a) === resolve(b);

/** Trusted code policy, never taken from CLI/environment/descriptor contents.
 * The executable has one frozen production instance. Tests use synthetic files.
 */
export type ArchiveSessionPolicy = Readonly<{
  descriptorSha256: string;
  proposalSha256: string;
  designSha256: string;
  baselineSha256: string;
  archiveSha256: string;
  proposalFile: string;
  designFile: string;
  baselineFile: string;
  archiveFile: string;
  absentSessionFile: string;
  authDir: string;
  run: string;
  candidateFile: string;
  oldCookieFile: string;
}>;
export async function readPrivateFile(
  path: string,
  guards: SnapshotGuards,
  acl = false,
) {
  await guards.privatePath(path);
  const info = await lstat(path);
  check(
    info.isFile() && !info.isSymbolicLink() && info.nlink === 1,
    "file_identity",
  );
  if (acl) guards.assertPrivateAcl(path, true);
  return readFile(path);
}
export async function requireAbsent(path: string, guards: SnapshotGuards) {
  await guards.privatePath(path);
  const exists = await lstat(path).then(
    () => true,
    (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );
  check(!exists, "archived_session_reappeared");
}
export function validateDescriptor(
  bytes: Buffer,
  policy: ArchiveSessionPolicy,
) {
  check(sha256(bytes) === policy.descriptorSha256, "descriptor_hash");
  const d = parse(bytes);
  check(
    d.schemaVersion === 1 &&
      d.exceptionCount === 1 &&
      d.scope === "S04_OFFLINE_AUTH_ARCHIVE_EXCEPTION_ONLY" &&
      d.disposition ===
        "PRESERVED_IN_VERIFIED_ARCHIVE_ONLY_DO_NOT_REACTIVATE" &&
      d.ownerGithubId === 187839747 &&
      d.workspace === "test" &&
      d.workspaceScope === "github-user-187839747:test" &&
      d.repositoryId === 998736528 &&
      d.project === "github-998736528" &&
      d.origin === "http://localhost:3000" &&
      d.environment === "DEV" &&
      d.liveAcceptanceAuthorized === false &&
      d.authorizationScope ===
        "OWNER_AUTHORIZED_OFFLINE_IMPLEMENTATION_TESTING_VERIFICATION_ONLY",
    "descriptor_scope",
  );
  for (const key of [
    "proposalFile",
    "designFile",
    "baselineFile",
    "archiveFile",
    "absentSessionFile",
    "authDir",
    "run",
    "candidateFile",
    "oldCookieFile",
  ] as const)
    check(same(d[key], policy[key]), "descriptor_identity");
  for (const key of [
    "proposalSha256",
    "designSha256",
    "baselineSha256",
    "archiveSha256",
  ] as const)
    check(d[key] === policy[key], "descriptor_evidence");
  check(
    /^[a-f0-9]{64}$/.test(String(d.candidateSha256)) &&
      /^[a-f0-9]{64}$/.test(String(d.candidateMetadataSha256)),
    "descriptor_candidate",
  );
  return d;
}

export async function verifyArchivedOwnerSession(input: {
  descriptorBytes: Buffer;
  policy: ArchiveSessionPolicy;
  guards: SnapshotGuards;
  secret: string;
  configuredAuthDir: string;
  configuredOrigin: string;
  configPins: Record<string, string>;
  now?: number;
}) {
  const { policy: p, guards } = input;
  const d = validateDescriptor(input.descriptorBytes, p);
  const now = input.now ?? Date.now();
  check(
    same(input.configuredAuthDir, p.authDir) &&
      input.configuredOrigin === "http://localhost:3000" &&
      Buffer.byteLength(input.secret) >= 32,
    "configuration_identity",
  );
  const read = (path: string, acl = false) =>
    readPrivateFile(path, guards, acl);
  const evidence = async (path: string, digest: string) => {
    const bytes = await read(path, true);
    check(sha256(bytes) === digest, "evidence_hash");
    return parse(bytes);
  };
  const proposal = await evidence(p.proposalFile, p.proposalSha256);
  const design = await evidence(p.designFile, p.designSha256);
  const before = await evidence(p.baselineFile, p.baselineSha256);
  check(
    proposal.files === 1 &&
      same(proposal.destination, p.absentSessionFile) &&
      same(proposal.verifiedArchive, p.archiveFile) &&
      proposal.sha256 === p.archiveSha256,
    "proposal_identity",
  );
  check(
    design.exceptionFileCount === 1 &&
      same(design.expectedAbsentAuthFile, p.absentSessionFile) &&
      same(design.verifiedArchive, p.archiveFile) &&
      same(design.baselineSnapshot, p.baselineFile) &&
      same(design.sourceProposal, p.proposalFile) &&
      design.sourceProposalSha256 === p.proposalSha256 &&
      design.baselineSha256 === p.baselineSha256 &&
      design.archiveSha256 === p.archiveSha256 &&
      design.disposition === d.disposition &&
      design.permittedAuthWrites === 0 &&
      design.permittedDatabaseWrites === 0,
    "design_identity",
  );
  check(
    before.schemaVersion === 2 &&
      same(before.authDir, p.authDir) &&
      Number.isFinite(before.startedAt) &&
      Number(before.startedAt) <= now,
    "baseline_identity",
  );
  check(
    canonical(before.configPins) === canonical(input.configPins),
    "configuration_changed",
  );
  const records = pins(before.records),
    oldPins = pins(before.oldPins);
  const oldName = basename(p.absentSessionFile),
    profileName = "user-187839747.bin";
  check(
    /^session-[a-f0-9]{64}\.bin$/.test(oldName) &&
      Object.hasOwn(records, oldName) &&
      records[oldName] === p.archiveSha256 &&
      same(p.absentSessionFile, join(p.authDir, oldName)) &&
      same(p.archiveFile, join(p.run, "archive", "auth-store", oldName)),
    "historical_identity",
  );
  check(
    Object.keys(records).length === 6 &&
      Object.keys(records).filter((n) => /^session-[a-f0-9]{64}\.bin$/.test(n))
        .length === 4 &&
      Object.hasOwn(records, profileName),
    "historical_set",
  );
  check(Object.keys(oldPins).length === 2, "old_cookie_set");
  const oldKey = Object.keys(oldPins).find((key) => same(key, p.oldCookieFile));
  const metaKey = Object.keys(oldPins).find((key) =>
    same(key, p.oldCookieFile + ".meta.json"),
  );
  check(oldKey && metaKey, "old_cookie_identity");
  await requireAbsent(p.absentSessionFile, guards);
  const decode = (bytes: Buffer, record: string) => {
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        createHash("sha256").update(input.secret).digest(),
        bytes.subarray(0, 12),
      );
      decipher.setAAD(Buffer.from(record));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return parse(
        Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]),
      );
    } catch {
      throw new ArchiveSessionError("encrypted_record_invalid");
    }
  };
  const oldCookie = await read(p.oldCookieFile, true);
  const oldRaw = oldCookie.toString("utf8").trim();
  check(
    /^wetscan_session=[a-f0-9]{64}$/.test(oldRaw) &&
      "session-" + sha256(Buffer.from(oldRaw.slice(16))) + ".bin" === oldName,
    "old_cookie_binding",
  );
  for (const [source, archive] of [
    [oldKey, "previous-owner.cookie"],
    [metaKey, "previous-owner.cookie.meta.json"],
  ]) {
    check(
      sha256(await read(source, true)) === oldPins[source] &&
        sha256(await read(join(p.run, "archive", archive), true)) ===
          oldPins[source],
      "old_cookie_changed",
    );
  }
  let archivedProfile: Record<string, unknown> | undefined;
  for (const [name, digest] of Object.entries(records)) {
    const bytes = await read(join(p.run, "archive", "auth-store", name), true);
    check(sha256(bytes) === digest, "backup_hash");
    if (name === oldName) {
      const old = decode(bytes, name.slice(0, -4));
      check(
        old.githubId === 187839747 &&
          Number.isFinite(old.expiresAt) &&
          !old.flow,
        "archived_owner_identity",
      );
    } else if (name === profileName)
      archivedProfile = decode(bytes, name.slice(0, -4));
    else
      check(
        sha256(await read(join(p.authDir, name))) === digest,
        "historical_record_changed",
      );
  }
  const candidate = await read(p.candidateFile, true),
    metadataBytes = await read(p.candidateFile + ".meta.json", true);
  check(
    sha256(candidate) === d.candidateSha256 &&
      sha256(metadataBytes) === d.candidateMetadataSha256,
    "candidate_hash",
  );
  const raw = candidate.toString("utf8").trim();
  check(/^wetscan_session=[a-f0-9]{64}$/.test(raw), "candidate_format");
  const name = "session-" + sha256(Buffer.from(raw.slice(16))) + ".bin";
  check(!Object.hasOwn(records, name) && name !== oldName, "candidate_not_new");
  const session = decode(await read(join(p.authDir, name)), name.slice(0, -4));
  check(
    session.githubId === 187839747 &&
      Number.isFinite(session.expiresAt) &&
      Number(session.expiresAt) > now &&
      !session.flow,
    "candidate_identity",
  );
  check(
    typeof session.userToken === "string" &&
      session.userToken.length > 0 &&
      typeof session.refreshToken === "string" &&
      session.refreshToken.length > 0 &&
      Number.isFinite(session.tokenExpiresAt) &&
      Number(session.tokenExpiresAt) >= now + 30 * 60000,
    "candidate_token_lifetime",
  );
  const time = await lstat(join(p.authDir, name));
  check(
    time.mtimeMs >= Number(before.startedAt) - 2000 &&
      time.mtimeMs <= now + 2000,
    "candidate_creation",
  );
  const profile = decode(
    await read(join(p.authDir, profileName)),
    profileName.slice(0, -4),
  );
  check(
    profile.githubId === 187839747 &&
      profile.workspace === "test" &&
      profile.completedAt &&
      profile.installationId &&
      Array.isArray(profile.repositories) &&
      profile.repositories.some((r) => object(r).id === 998736528),
    "candidate_profile_scope",
  );
  const withoutLogin = (value: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "login"),
    );
  check(
    archivedProfile &&
      canonical(withoutLogin(profile)) ===
        canonical(withoutLogin(archivedProfile)),
    "profile_fields_changed",
  );
  const meta = parse(metadataBytes),
    capturedAt = Date.parse(String(meta.recordedAt));
  check(
    meta.schemaVersion === 1 &&
      meta.origin === "http://localhost:3000" &&
      meta.callbackUrl === "http://localhost:3000/api/auth/github/callback" &&
      Number.isFinite(capturedAt) &&
      capturedAt >= Number(before.startedAt) - 2000 &&
      capturedAt <= now,
    "candidate_origin",
  );
  const inventory = await inventoryOwnerAuth(p.authDir, guards);
  check(
    canonical(inventory.directories) === canonical(before.directories),
    "auth_directories_changed",
  );
  const added = Object.keys(inventory.records).filter(
    (file) => !Object.hasOwn(records, file),
  );
  check(
    added.length === 1 &&
      added[0] === name &&
      Object.keys(inventory.records).length === 6,
    "unexpected_auth_records",
  );
  const currentPins = pins(design.expectedExistingAuthFilePins);
  check(Object.keys(currentPins).length === 6, "design_active_set");
  for (const [file, digest] of Object.entries(currentPins)) {
    check(
      Object.hasOwn(
        inventory.records,
        Object.keys(inventory.records).find((n) =>
          same(file, join(p.authDir, n)),
        ) ?? "",
      ),
      "design_active_set",
    );
    check(sha256(await read(file)) === digest, "active_record_changed");
  }
  // End-of-read checks reject reactivation or concurrent changes; no file is restored.
  await requireAbsent(p.absentSessionFile, guards);
  check(
    canonical(await inventoryOwnerAuth(p.authDir, guards)) ===
      canonical(inventory),
    "concurrent_auth_change",
  );
  check(
    sha256(await read(p.candidateFile, true)) === d.candidateSha256 &&
      sha256(await read(p.candidateFile + ".meta.json", true)) ===
        d.candidateMetadataSha256,
    "concurrent_candidate_change",
  );
  await evidence(p.proposalFile, p.proposalSha256);
  await evidence(p.designFile, p.designSha256);
  await evidence(p.baselineFile, p.baselineSha256);
  for (const [name, digest] of Object.entries(records))
    check(
      sha256(await read(join(p.run, "archive", "auth-store", name), true)) ===
        digest,
      "concurrent_backup_change",
    );
  for (const [source, archive] of [
    [oldKey, "previous-owner.cookie"],
    [metaKey, "previous-owner.cookie.meta.json"],
  ])
    check(
      sha256(await read(source, true)) === oldPins[source] &&
        sha256(await read(join(p.run, "archive", archive), true)) ===
          oldPins[source],
      "concurrent_old_cookie_change",
    );
  const decisionTime = input.now ?? Date.now();
  check(
    Number(session.expiresAt) > decisionTime &&
      Number(session.tokenExpiresAt) >= decisionTime + 30 * 60000,
    "candidate_token_lifetime",
  );
  return {
    status: "PASS_WITH_APPROVED_AUTH_ARCHIVE_EXCEPTION",
    authorizationScope: "OFFLINE_IMPLEMENTATION_TESTING_VERIFICATION_ONLY",
    exceptionDisposition:
      "PRESERVED_IN_VERIFIED_ARCHIVE_ONLY_DO_NOT_REACTIVATE",
    archiveOnlyHistoricalRecords: 1,
    inPlaceHistoricalSessionsPreserved: 3,
    completeHistoricalActiveFilePreservation: false,
    allEightBackupsVerified: true,
    archivedSessionActiveFileAbsent: true,
    freshCandidateLocallyValid: true,
    expectedOwnerWorkspaceRepositoryAndOrigin: true,
    tokenMinutesRemaining: Math.floor(
      (Number(session.tokenExpiresAt) - decisionTime) / 60000,
    ),
    descriptorSha256: p.descriptorSha256,
    baselineSha256: p.baselineSha256,
    archiveSha256: p.archiveSha256,
    historicalReceiptsRewritten: false,
    providerCurrentAccess: "NOT_TESTED",
    authWrites: 0,
    githubRequests: 0,
    databaseConnections: 0,
    liveAcceptanceAuthorized: false,
  } as const;
}
