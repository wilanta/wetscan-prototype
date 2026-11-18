import { createCipheriv, randomBytes } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { sha256 } from "../../scripts/sentinel-owner-session-exception";
import {
  packageRequiredFiles,
  type PackageManifest,
  type PackagePolicy,
  type PackageGrant,
} from "../../scripts/sentinel-provision-package";
import type { SnapshotGuards } from "../../scripts/sentinel-owner-auth-snapshot";

export const syntheticSecret = "SYNTHETIC_PACKAGE_SECRET_NEVER_REAL_123456789";
export const fixtureGuards: SnapshotGuards = {
  privatePath: async (p) => p,
  assertPrivateAcl() {},
  createPrivateDirectory() {
    throw Error("read_only");
  },
};
export function encrypt(value: unknown, name: string) {
  const iv = randomBytes(12),
    c = createCipheriv(
      "aes-256-gcm",
      Buffer.from(sha256(Buffer.from(syntheticSecret)), "hex"),
      iv,
    );
  c.setAAD(Buffer.from(name));
  const b = Buffer.concat([c.update(JSON.stringify(value)), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), b]);
}
export async function packageFixture() {
  const base = await mkdtemp(join(tmpdir(), "wetscan-provision-package-test-"));
  const repo = join(base, "repo"),
    root = join(base, "private"),
    authDir = join(base, "auth"),
    run = join(root, "login"),
    now = Date.now();
  const files: Record<string, string> = {};
  async function put(file: string, value: string | Buffer) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, value);
    files[file] = sha256(Buffer.from(value));
    return files[file];
  }
  const json = (file: string, value: unknown) =>
    put(file, JSON.stringify(value));
  for (const name of packageRequiredFiles)
    await put(join(repo, name), "SYNTHETIC_SOURCE_" + name);
  await put(join(root, "reviewed-owner-procedure.ps1"), "SYNTHETIC_PROCEDURE");
  await put(
    join(root, "future-owner-grant.template.txt"),
    "TEMPLATE_NOT_AUTHORIZED",
  );
  const sessionName = (v: string) =>
    "session-" + sha256(Buffer.from(v.repeat(64))) + ".bin";
  const profile = {
    githubId: 187839747,
    login: "synthetic",
    workspace: "test",
    completedAt: "2026-01-01",
    installationId: 1,
    repositories: [{ id: 998736528 }],
  };
  const profileName = "user-187839747.bin";
  await put(
    join(authDir, profileName),
    encrypt(profile, profileName.slice(0, -4)),
  );
  for (const v of ["a", "c", "d", "e"])
    await put(
      join(authDir, sessionName(v)),
      encrypt(
        { githubId: 187839747, expiresAt: now + 86400000 },
        sessionName(v).slice(0, -4),
      ),
    );
  const cacheName = join(
    "canvas-graphs-v1",
    "a".repeat(64) + "." + "b".repeat(64) + "." + "c".repeat(40) + ".bin",
  );
  await put(join(authDir, cacheName), "SYNTHETIC_CACHE");
  const records = Object.fromEntries(
    Object.entries(files)
      .filter(([f]) => f.startsWith(authDir))
      .map(([f, h]) => [f.slice(authDir.length + 1), h]),
  );
  for (const name of Object.keys(records)) {
    const dest = join(run, "archive/auth-store", name);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(join(authDir, name), dest);
    files[dest] = records[name];
  }
  const oldCookieFile = join(root, "old.cookie");
  await put(oldCookieFile, "wetscan_session=" + "a".repeat(64));
  await put(oldCookieFile + ".meta.json", "SYNTHETIC_OLD_META");
  const oldPins = {
    [oldCookieFile]: files[oldCookieFile],
    [oldCookieFile + ".meta.json"]: files[oldCookieFile + ".meta.json"],
  };
  await put(
    join(run, "archive/previous-owner.cookie"),
    await readFile(oldCookieFile),
  );
  await put(
    join(run, "archive/previous-owner.cookie.meta.json"),
    await readFile(oldCookieFile + ".meta.json"),
  );
  const absentSessionFile = join(authDir, sessionName("a")),
    archiveFile = join(run, "archive/auth-store", basename(absentSessionFile));
  await unlink(absentSessionFile);
  delete files[absentSessionFile];
  const candidateRecord = join(authDir, sessionName("b"));
  const session = {
    githubId: 187839747,
    expiresAt: now + 86400000,
    userToken: "SYNTHETIC_ACCESS",
    refreshToken: "SYNTHETIC_REFRESH",
    tokenExpiresAt: now + 3600000,
  };
  await put(
    candidateRecord,
    encrypt(session, basename(candidateRecord).slice(0, -4)),
  );
  const candidateFile = join(run, "candidate/owner-session.cookie");
  await put(candidateFile, "wetscan_session=" + "b".repeat(64));
  await json(candidateFile + ".meta.json", {
    schemaVersion: 1,
    origin: "http://localhost:3000",
    callbackUrl: "http://localhost:3000/api/auth/github/callback",
    recordedAt: new Date(now).toISOString(),
  });
  const baselineFile = join(run, "auth-before.private.json"),
    proposalFile = join(root, "proposal.json"),
    designFile = join(root, "design.json");
  const baselineSha256 = await json(baselineFile, {
    schemaVersion: 2,
    startedAt: now - 1000,
    authDir,
    records,
    directories: ["canvas-graphs-v1"],
    configPins: {},
    oldPins,
  });
  const archiveSha256 = files[archiveFile],
    proposalSha256 = await json(proposalFile, {
      files: 1,
      destination: absentSessionFile,
      verifiedArchive: archiveFile,
      sha256: archiveSha256,
    });
  const disposition = "PRESERVED_IN_VERIFIED_ARCHIVE_ONLY_DO_NOT_REACTIVATE";
  const designSha256 = await json(designFile, {
    exceptionFileCount: 1,
    expectedAbsentAuthFile: absentSessionFile,
    verifiedArchive: archiveFile,
    baselineSnapshot: baselineFile,
    sourceProposal: proposalFile,
    sourceProposalSha256: proposalSha256,
    baselineSha256,
    archiveSha256,
    disposition,
    permittedAuthWrites: 0,
    permittedDatabaseWrites: 0,
    expectedExistingAuthFilePins: Object.fromEntries(
      Object.entries(files).filter(([f]) => f.startsWith(authDir)),
    ),
  });
  const archive = {
    descriptorSha256: "",
    proposalSha256,
    designSha256,
    baselineSha256,
    archiveSha256,
    proposalFile,
    designFile,
    baselineFile,
    archiveFile,
    absentSessionFile,
    authDir,
    run,
    candidateFile,
    oldCookieFile,
  };
  const descriptor = join(root, "descriptor.json");
  archive.descriptorSha256 = await json(descriptor, {
    ...archive,
    schemaVersion: 1,
    exceptionCount: 1,
    scope: "S04_OFFLINE_AUTH_ARCHIVE_EXCEPTION_ONLY",
    disposition,
    ownerGithubId: 187839747,
    workspace: "test",
    workspaceScope: "github-user-187839747:test",
    repositoryId: 998736528,
    project: "github-998736528",
    origin: "http://localhost:3000",
    environment: "DEV",
    liveAcceptanceAuthorized: false,
    authorizationScope:
      "OWNER_AUTHORIZED_OFFLINE_IMPLEMENTATION_TESTING_VERIFICATION_ONLY",
    candidateSha256: files[candidateFile],
    candidateMetadataSha256: files[candidateFile + ".meta.json"],
  });
  const ownerDecision = join(root, "decision.json"),
    ownerDecisionSha256 = await json(ownerDecision, {
      decision: "ACCEPTED_OFFLINE_WITH_DOCUMENTED_RESIDUAL_RISKS",
    });
  const historicalInventory = join(root, "history.json"),
    historicalSha256 = await json(historicalInventory, {
      [archiveFile]: archiveSha256,
      [oldCookieFile]: files[oldCookieFile],
    });
  const parentManifest = join(root, "parent.json"),
    parentSha256 = await json(parentManifest, {
      schemaVersion: 1,
      files: { ...files },
      absentPaths: [absentSessionFile],
    });
  const policy: PackagePolicy = {
    repo,
    root,
    archive,
    descriptor,
    parentManifest,
    parentSha256,
    historicalInventory,
    historicalSha256,
    ownerDecision,
    ownerDecisionSha256,
  };
  const manifest: PackageManifest = {
    schemaVersion: 2,
    kind: "S04_PROVISION_EXECUTION_PACKAGE",
    phase: "provision-ingest",
    files: { ...files },
    absentPaths: [absentSessionFile],
    dotenvFiles: Object.fromEntries(
      [".env", ".env.local", ".env.production", ".env.production.local"].map(
        (n) => [join(repo, n), { exists: false, sha256: null }],
      ),
    ),
    candidateFile,
    candidateRecord,
    historicalInventorySha256: historicalSha256,
    parentManifestSha256: parentSha256,
  };
  const manifestFile = join(root, "manifest.json");
  const saveManifest = () => json(manifestFile, manifest);
  const manifestSha = await saveManifest();
  const grant: PackageGrant = {
    kind: "S04_SINGLE_PROVISION_OWNER_GRANT",
    phase: "provision-ingest",
    status: "OWNER_AUTHORIZED_ONE_ATTEMPT",
    approvedBy: "synthetic-owner",
    notBefore: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 599000).toISOString(),
    manifestSha256: manifestSha,
    runnerSha256: files[join(repo, "scripts/Invoke-S04ProvisionPackage.ps1")],
    candidateFile,
    outputDirectory: join(root, "future-output"),
    target: {
      host: "127.0.0.1",
      port: 55432,
      database: "wetscan_dev",
      marker: "wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f",
    },
    workspace: "github-user-187839747:test",
    project: "github-998736528",
    attempts: 1,
    allowCandidatePersistence: true,
    allowProviderReads: true,
    allowActiveHandoff: true,
    allowEmergencyContainment: true,
    allowRefresh: false,
    normalNewRows: 10,
    emergencyNewRows: 12,
    historicalRowsModified: 0,
  };
  return {
    base,
    policy,
    manifest,
    manifestFile,
    manifestSha,
    saveManifest,
    now,
    session,
    grant,
    candidateBefore: await readFile(candidateRecord),
  };
}
