import { createCipheriv, createHash, randomBytes } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  archiveFailureReceipt,
  sha256,
  verifyArchivedOwnerSession,
  type ArchiveSessionPolicy,
} from "../../scripts/sentinel-owner-session-exception";
import {
  inventoryOwnerAuth,
  type SnapshotGuards,
} from "../../scripts/sentinel-owner-auth-snapshot";

const secret = "SYNTHETIC_ONLY_NOT_A_REAL_SECRET_123456789";
const sessionName = (token: string) =>
  "session-" + sha256(Buffer.from(token)) + ".bin";
const encode = (value: unknown, record: string) => {
  const iv = randomBytes(12),
    cipher = createCipheriv(
      "aes-256-gcm",
      createHash("sha256").update(secret).digest(),
      iv,
    );
  cipher.setAAD(Buffer.from(record));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
};
const guards: SnapshotGuards = {
  privatePath: async (path) => path,
  assertPrivateAcl() {},
  createPrivateDirectory() {
    throw Error("read_only");
  },
};
const roots: string[] = [];
async function fixture(
  options: {
    owner?: number;
    workspace?: string;
    repository?: number;
    minutes?: number;
    expiredSession?: boolean;
    wrongCookie?: boolean;
    origin?: string;
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "wetscan-session-exception-test-"));
  roots.push(root);
  const authDir = join(root, "auth"),
    run = join(root, "run"),
    oldCookieFile = join(root, "old.cookie"),
    now = Date.now();
  const archive = join(run, "archive", "auth-store"),
    candidateFile = join(run, "candidate", "owner-session.cookie");
  for (const path of [
    authDir,
    archive,
    join(run, "candidate"),
    join(authDir, "canvas-graphs-v1"),
    join(archive, "canvas-graphs-v1"),
  ])
    await mkdir(path, { recursive: true });
  const profile = {
    githubId: 187839747,
    login: "synthetic-owner",
    workspace: "test",
    completedAt: "2026-01-01T00:00:00Z",
    installationId: 1,
    repositories: [{ id: 998736528 }],
  };
  const profileName = "user-187839747.bin";
  await writeFile(
    join(authDir, profileName),
    encode(profile, profileName.slice(0, -4)),
  );
  for (const token of ["a", "c", "d", "e"]) {
    const name = sessionName(token.repeat(64));
    await writeFile(
      join(authDir, name),
      encode(
        { githubId: 187839747, expiresAt: now + 86400000 },
        name.slice(0, -4),
      ),
    );
  }
  await writeFile(
    join(
      authDir,
      "canvas-graphs-v1",
      "a".repeat(64) + "." + "b".repeat(64) + "." + "c".repeat(40) + ".bin",
    ),
    "SYNTHETIC_CACHE",
  );
  await writeFile(oldCookieFile, "wetscan_session=" + "a".repeat(64));
  await writeFile(oldCookieFile + ".meta.json", "SYNTHETIC_OLD_METADATA");
  const before = await inventoryOwnerAuth(authDir, guards);
  for (const name of Object.keys(before.records))
    await copyFile(join(authDir, name), join(archive, name));
  await copyFile(oldCookieFile, join(run, "archive", "previous-owner.cookie"));
  await copyFile(
    oldCookieFile + ".meta.json",
    join(run, "archive", "previous-owner.cookie.meta.json"),
  );
  const absentSessionFile = join(authDir, sessionName("a".repeat(64))),
    archiveFile = join(archive, basename(absentSessionFile));
  await unlink(absentSessionFile); // Synthetic fixture only; never real auth data.
  const freshName = sessionName("b".repeat(64));
  await writeFile(
    join(authDir, freshName),
    encode(
      {
        githubId: options.owner ?? 187839747,
        expiresAt: now + (options.expiredSession ? -1000 : 86400000),
        userToken: "SYNTHETIC_ACCESS_SECRET",
        refreshToken: "SYNTHETIC_REFRESH_SECRET",
        tokenExpiresAt: now + (options.minutes ?? 60) * 60000,
      },
      freshName.slice(0, -4),
    ),
  );
  await writeFile(
    join(authDir, profileName),
    encode(
      {
        ...profile,
        workspace: options.workspace ?? profile.workspace,
        repositories: [{ id: options.repository ?? 998736528 }],
      },
      profileName.slice(0, -4),
    ),
  );
  await writeFile(
    candidateFile,
    "wetscan_session=" + (options.wrongCookie ? "f" : "b").repeat(64),
  );
  await writeFile(
    candidateFile + ".meta.json",
    JSON.stringify({
      schemaVersion: 1,
      origin: options.origin ?? "http://localhost:3000",
      callbackUrl:
        (options.origin ?? "http://localhost:3000") +
        "/api/auth/github/callback",
      recordedAt: new Date(now).toISOString(),
    }),
  );
  const baselineFile = join(run, "auth-before.private.json"),
    proposalFile = join(root, "proposal.json"),
    designFile = join(root, "design.json");
  const json = async (path: string, value: unknown) => {
    const bytes = Buffer.from(JSON.stringify(value));
    await writeFile(path, bytes);
    return sha256(bytes);
  };
  const archiveSha256 = sha256(await readFile(archiveFile));
  const baselineSha256 = await json(baselineFile, {
    schemaVersion: 2,
    startedAt: now - 10000,
    authDir,
    ...before,
    configPins: {},
    oldPins: {
      [oldCookieFile]: sha256(await readFile(oldCookieFile)),
      [oldCookieFile + ".meta.json"]: sha256(
        await readFile(oldCookieFile + ".meta.json"),
      ),
    },
  });
  const proposalSha256 = await json(proposalFile, {
    files: 1,
    destination: absentSessionFile,
    verifiedArchive: archiveFile,
    sha256: archiveSha256,
  });
  const current = await inventoryOwnerAuth(authDir, guards);
  const disposition = "PRESERVED_IN_VERIFIED_ARCHIVE_ONLY_DO_NOT_REACTIVATE";
  const design = {
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
      Object.entries(current.records).map(([name, hash]) => [
        join(authDir, name),
        hash,
      ]),
    ),
  };
  const designSha256 = await json(designFile, design);
  const policy: ArchiveSessionPolicy = {
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
  const descriptor = {
    ...policy,
    schemaVersion: 1,
    scope: "S04_OFFLINE_AUTH_ARCHIVE_EXCEPTION_ONLY",
    disposition,
    exceptionCount: 1,
    ownerGithubId: 187839747,
    workspace: "test",
    workspaceScope: "github-user-187839747:test",
    repositoryId: 998736528,
    project: "github-998736528",
    origin: "http://localhost:3000",
    environment: "DEV",
    authorizationScope:
      "OWNER_AUTHORIZED_OFFLINE_IMPLEMENTATION_TESTING_VERIFICATION_ONLY",
    liveAcceptanceAuthorized: false,
    candidateSha256: sha256(await readFile(candidateFile)),
    candidateMetadataSha256: sha256(
      await readFile(candidateFile + ".meta.json"),
    ),
  };
  const descriptorBytes = Buffer.from(JSON.stringify(descriptor));
  return {
    root,
    input: {
      descriptorBytes,
      policy: { ...policy, descriptorSha256: sha256(descriptorBytes) },
      guards,
      secret,
      configuredAuthDir: authDir,
      configuredOrigin: "http://localhost:3000",
      configPins: {},
      now,
    },
    descriptor,
    design,
    freshName,
  };
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    const path = resolve(root);
    if (
      !basename(path).startsWith("wetscan-session-exception-test-") ||
      relative(resolve(tmpdir()), path).startsWith("..")
    )
      throw Error("unsafe_fixture_cleanup");
    await rm(path, { recursive: true, force: true });
  }
});
/** A second owner login after the first candidate expired: the first candidate becomes a known baseline record. */
async function secondLogin(f: Awaited<ReturnType<typeof fixture>>) {
  const { policy, now } = f.input;
  const run2 = join(dirname(policy.run), "run2");
  const archive2 = join(run2, "archive", "auth-store");
  await mkdir(join(archive2, "canvas-graphs-v1"), { recursive: true });
  await mkdir(join(run2, "candidate"), { recursive: true });
  const knownName = sessionName("8".repeat(64));
  await writeFile(
    join(policy.authDir, knownName),
    encode(
      {
        githubId: 187839747,
        expiresAt: now + 86400000,
        userToken: "x",
        refreshToken: "y",
        tokenExpiresAt: now - 1000,
      },
      knownName.slice(0, -4),
    ),
  );
  const base = await inventoryOwnerAuth(policy.authDir, guards);
  for (const n of Object.keys(base.records))
    await copyFile(join(policy.authDir, n), join(archive2, n));
  const baselineFile = join(run2, "auth-before.private.json");
  const baselineBytes = Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      startedAt: now - 5000,
      authDir: policy.authDir,
      ...base,
      configPins: {},
      oldPins: {},
    }),
  );
  await writeFile(baselineFile, baselineBytes);
  const newName = sessionName("9".repeat(64));
  await writeFile(
    join(policy.authDir, newName),
    encode(
      {
        githubId: 187839747,
        expiresAt: now + 86400000,
        userToken: "SYNTHETIC_ACCESS_SECRET",
        refreshToken: "SYNTHETIC_REFRESH_SECRET",
        tokenExpiresAt: now + 3600000,
      },
      newName.slice(0, -4),
    ),
  );
  const candidateFile = join(run2, "candidate", "owner-session.cookie");
  await writeFile(candidateFile, "wetscan_session=" + "9".repeat(64));
  await writeFile(
    candidateFile + ".meta.json",
    JSON.stringify({
      schemaVersion: 1,
      origin: "http://localhost:3000",
      callbackUrl: "http://localhost:3000/api/auth/github/callback",
      recordedAt: new Date(now).toISOString(),
    }),
  );
  const descriptor = {
    ...f.descriptor,
    candidateFile,
    candidateSha256: sha256(await readFile(candidateFile)),
    candidateMetadataSha256: sha256(
      await readFile(candidateFile + ".meta.json"),
    ),
  };
  const descriptorBytes = Buffer.from(JSON.stringify(descriptor));
  const recovery = (knownRecords?: Record<string, string>) => ({
    ...f.input,
    descriptorBytes,
    policy: {
      ...policy,
      candidateFile,
      descriptorSha256: sha256(descriptorBytes),
      recovery: {
        baselineFile,
        baselineSha256: sha256(baselineBytes),
        knownRecords,
      },
    },
  });
  return { recovery, knownRecords: { [knownName]: base.records[knownName] } };
}
describe("one-record archive-only owner session exception", () => {
  it("accepts exactly one archived-only record and accurately labels the disposition", async () => {
    const { input } = await fixture();
    const result = await verifyArchivedOwnerSession(input);
    expect(result).toMatchObject({
      status: "PASS_WITH_APPROVED_AUTH_ARCHIVE_EXCEPTION",
      archiveOnlyHistoricalRecords: 1,
      completeHistoricalActiveFilePreservation: false,
      archivedSessionActiveFileAbsent: true,
      freshCandidateLocallyValid: true,
      allEightBackupsVerified: true,
      authWrites: 0,
      databaseConnections: 0,
      githubRequests: 0,
      liveAcceptanceAuthorized: false,
    });
    await expect(
      readFile(input.policy.absentSessionFile),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("accepts a second login when the first candidate is a pinned known baseline record", async () => {
    const f = await fixture();
    const { recovery, knownRecords } = await secondLogin(f);
    await expect(
      verifyArchivedOwnerSession(recovery(knownRecords)),
    ).resolves.toMatchObject({
      status: "PASS_WITH_APPROVED_AUTH_ARCHIVE_EXCEPTION",
      authWrites: 0,
      databaseConnections: 0,
    });
  });
  it("rejects a second login whose known baseline record is unpinned or altered", async () => {
    const f = await fixture();
    const { recovery, knownRecords } = await secondLogin(f);
    await expect(verifyArchivedOwnerSession(recovery())).rejects.toThrow();
    const [name] = Object.keys(knownRecords);
    await expect(
      verifyArchivedOwnerSession(recovery({ [name]: "0".repeat(64) })),
    ).rejects.toThrow();
  });
  it("rejects a different historical session identity even with internally consistent descriptor bytes", async () => {
    const f = await fixture();
    f.input.policy = {
      ...f.input.policy,
      absentSessionFile: join(
        f.input.policy.authDir,
        sessionName("c".repeat(64)),
      ),
    };
    await expect(verifyArchivedOwnerSession(f.input)).rejects.toMatchObject({
      classification: "descriptor_identity",
    });
  });
  it("rejects an incorrect archived backup hash", async () => {
    const { input } = await fixture();
    await writeFile(input.policy.archiveFile, "SYNTHETIC_CORRUPTION");
    await expect(verifyArchivedOwnerSession(input)).rejects.toMatchObject({
      classification: "backup_hash",
    });
  });
  it.each(["proposalFile", "designFile", "baselineFile"] as const)(
    "rejects modified %s evidence",
    async (key) => {
      const { input } = await fixture();
      await writeFile(input.policy[key], "{}");
      await expect(verifyArchivedOwnerSession(input)).rejects.toMatchObject({
        classification: "evidence_hash",
      });
    },
  );
  it.each(["proposalFile", "designFile", "baselineFile"] as const)(
    "rejects missing %s evidence",
    async (key) => {
      const { input } = await fixture();
      await unlink(input.policy[key]);
      await expect(verifyArchivedOwnerSession(input)).rejects.toBeDefined();
    },
  );
  it("rejects a second missing historical session", async () => {
    const { input } = await fixture();
    await unlink(join(input.policy.authDir, sessionName("c".repeat(64))));
    await expect(verifyArchivedOwnerSession(input)).rejects.toBeDefined();
  });
  it("rejects reappearance of the archived session", async () => {
    const { input } = await fixture();
    await copyFile(input.policy.archiveFile, input.policy.absentSessionFile);
    await expect(verifyArchivedOwnerSession(input)).rejects.toMatchObject({
      classification: "archived_session_reappeared",
    });
  });
  it("rejects changes to another historical record", async () => {
    const { input } = await fixture();
    await writeFile(
      join(input.policy.authDir, sessionName("c".repeat(64))),
      "CHANGED_SYNTHETIC",
    );
    await expect(verifyArchivedOwnerSession(input)).rejects.toMatchObject({
      classification: "historical_record_changed",
    });
  });
  it("rejects an unexpected additional authentication record", async () => {
    const { input } = await fixture();
    await writeFile(
      join(input.policy.authDir, sessionName("f".repeat(64))),
      "SYNTHETIC",
    );
    await expect(verifyArchivedOwnerSession(input)).rejects.toMatchObject({
      classification: "unexpected_auth_records",
    });
  });
  it("rejects a candidate cookie mapping to a different record", async () => {
    const { input } = await fixture({ wrongCookie: true });
    await expect(verifyArchivedOwnerSession(input)).rejects.toBeDefined();
  });
  it.each([
    { owner: 7 },
    { workspace: "other" },
    { repository: 7 },
    { origin: "http://127.0.0.1:3000" },
    { expiredSession: true },
    { minutes: 29 },
    { minutes: -1 },
  ])(
    "rejects invalid candidate invariant %j beyond hash validation",
    async (options) => {
      const { input } = await fixture(options);
      await expect(verifyArchivedOwnerSession(input)).rejects.toBeDefined();
    },
  );
  it.each([Buffer.alloc(0), Buffer.from("{"), Buffer.from("[]")])(
    "rejects absent or malformed descriptors",
    async (bytes) => {
      const { input } = await fixture();
      input.descriptorBytes = bytes;
      input.policy = { ...input.policy, descriptorSha256: sha256(bytes) };
      await expect(verifyArchivedOwnerSession(input)).rejects.toBeDefined();
    },
  );
  it("rejects a widened exception scope with a matching descriptor hash", async () => {
    const f = await fixture();
    const bytes = Buffer.from(
      JSON.stringify({ ...f.descriptor, exceptionCount: 2 }),
    );
    f.input.descriptorBytes = bytes;
    f.input.policy = { ...f.input.policy, descriptorSha256: sha256(bytes) };
    await expect(verifyArchivedOwnerSession(f.input)).rejects.toMatchObject({
      classification: "descriptor_scope",
    });
  });
  it("does not leak secrets, cookies, record identities or raw errors in receipts", async () => {
    const { input } = await fixture();
    const text = JSON.stringify(await verifyArchivedOwnerSession(input));
    for (const forbidden of [
      secret,
      "SYNTHETIC_ACCESS_SECRET",
      "SYNTHETIC_REFRESH_SECRET",
      "wetscan_session=",
      "a".repeat(64),
      "b".repeat(64),
      basename(input.policy.absentSessionFile),
    ])
      expect(text).not.toContain(forbidden);
    expect(
      JSON.stringify(
        archiveFailureReceipt(new Error("SENSITIVE_COOKIE_AND_RECORD")),
      ),
    ).not.toContain("SENSITIVE");
  });
  it("preserves failed receipts and every active/archive/cookie byte", async () => {
    const { input } = await fixture();
    const failed = join(input.policy.run, "previous-NOT_VERIFIED.json");
    await writeFile(failed, '{"status":"NOT_VERIFIED"}\n');
    const before = await inventoryOwnerAuth(input.policy.authDir, guards),
      receipt = await readFile(failed),
      cookie = await readFile(input.policy.candidateFile),
      archive = await readFile(input.policy.archiveFile);
    await verifyArchivedOwnerSession(input);
    expect(await inventoryOwnerAuth(input.policy.authDir, guards)).toEqual(
      before,
    );
    expect(await readFile(failed)).toEqual(receipt);
    expect(await readFile(input.policy.candidateFile)).toEqual(cookie);
    expect(await readFile(input.policy.archiveFile)).toEqual(archive);
    expect((await readdir(input.policy.run)).sort()).toEqual(
      [
        "archive",
        "auth-before.private.json",
        "candidate",
        "previous-NOT_VERIFIED.json",
      ].sort(),
    );
  });
  it("executable rejects arbitrary record flags without consulting authentication files", async () => {
    const result = await promisify(execFile)(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/sentinel-owner-session-audit.ts",
        "verify",
        "--record=arbitrary",
      ],
      { cwd: resolve("."), windowsHide: true },
    ).catch((error) => error);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr.trim())).toMatchObject({
      status: "NOT_VERIFIED",
      classification: "argument_scope",
      databaseConnections: 0,
    });
  });
});
