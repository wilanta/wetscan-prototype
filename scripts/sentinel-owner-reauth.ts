// Auth-recovery validation only. Never import the mutating auth store or a DB driver.
import { createDecipheriv, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import {
  inventoryOwnerAuth,
  snapshotOwnerAuth,
  type SnapshotGuards,
  type AuthInventory,
} from "./sentinel-owner-auth-snapshot";
import {
  canonical,
  sha256,
  validateDescriptor,
  readPrivateFile,
  requireAbsent,
  type ArchiveSessionPolicy,
} from "./sentinel-owner-session-exception";

export const AUTH_ORIGIN = "http://localhost:3000";
export const AUTH_CALLBACK = AUTH_ORIGIN + "/api/auth/github/callback";
export const AUTH_GRANT =
  "OWNER APPROVED ONE S04 AUTH ONLY WINDOW NO REFRESH NO PROVISIONING";
const root = "C:/Users/sheil/.wetscan-sentinel";
const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const oldRun = join(root, "s04-owner-login-0080a5fca3db4995be94fd55139bc58d");
const oldName =
  "session-f3c7b6eddeff1ea869f12c075adb438e92023dedd4e817adb2fded17fb63b17e.bin";
export const archivePolicy: ArchiveSessionPolicy = Object.freeze({
  descriptorSha256:
    "f847fbab8bbfd48f78089170c3e764a0da121236aa43e1e9299267b5dffad147",
  proposalSha256:
    "2b29c5f4c41a89ca663a3f3a5e282ba2d6f92ee7db5b8a086e2bb546c4a37152",
  designSha256:
    "932f11cbdb0dc37cb09aa421fe7cecf22245867e064381014cbbce2d18670509",
  baselineSha256:
    "4636a00c2b3aa82d23efe215cec3d42131f79549c37f5617022599c8c896780a",
  archiveSha256:
    "44af3d9ea05ba53ed1592d96e064a400f4c811dc86a17aa882947eb556f7e945",
  proposalFile: join(
    root,
    "s04-post-oauth-diagnosis-a22c77ec2c2846e6b204270909bcce48/missing-session-recovery-review.private.json",
  ),
  designFile: join(
    root,
    "s04-session-final-review-05cb0eb1640f4a4c93055416bbde022d/archive-only-exception.design.private.json",
  ),
  baselineFile: join(oldRun, "auth-before.private.json"),
  archiveFile: join(oldRun, "archive/auth-store", oldName),
  absentSessionFile: join("C:/Users/sheil/.wetscan-auth", oldName),
  authDir: "C:/Users/sheil/.wetscan-auth",
  run: oldRun,
  candidateFile: join(oldRun, "candidate/owner-session.cookie"),
  oldCookieFile: join(root, "s01-20261114/secrets/owner-session.cookie"),
});
const descriptor = join(
  root,
  "s04-auth-archive-exception-9c53ab2d86a94d0aa219d5a5535422e0/archive-only-exception.descriptor.private.json",
);
type RecordValue = Record<string, unknown>;
export class ReauthError extends Error {
  constructor(readonly classification: string) {
    super("auth_recovery_validation_failed");
  }
}
export function check(value: unknown, classification: string): asserts value {
  if (!value) throw new ReauthError(classification);
}
export function parseObject(bytes: Buffer): RecordValue {
  try {
    const v = JSON.parse(bytes.toString("utf8"));
    check(v && typeof v === "object" && !Array.isArray(v), "malformed_record");
    return v;
  } catch {
    throw new ReauthError("malformed_record");
  }
}
export function historicalPin(pins: Record<string, string>, file: string) {
  const norm = (p: string) =>
    process.platform === "win32" ? resolve(p).toLowerCase() : resolve(p);
  const keys = Object.keys(pins).filter((k) => norm(k) === norm(file));
  check(
    keys.length === 1 && /^[a-f0-9]{64}$/.test(pins[keys[0]]),
    "historical_pin_identity",
  );
  return pins[keys[0]];
}
export function decodeAuth(
  bytes: Buffer,
  name: string,
  secret: string,
): RecordValue {
  try {
    const d = createDecipheriv(
      "aes-256-gcm",
      createHash("sha256").update(secret).digest(),
      bytes.subarray(0, 12),
    );
    d.setAAD(Buffer.from(name.replace(/\.bin$/, "")));
    d.setAuthTag(bytes.subarray(12, 28));
    return parseObject(
      Buffer.concat([d.update(bytes.subarray(28)), d.final()]),
    );
  } catch {
    throw new ReauthError("encrypted_record_invalid");
  }
}
export function profileScope(p: RecordValue) {
  check(
    p.githubId === 187839747 &&
      p.workspace === "test" &&
      typeof p.completedAt === "string" &&
      p.completedAt &&
      Number.isSafeInteger(p.installationId) &&
      Number(p.installationId) > 0 &&
      Array.isArray(p.repositories) &&
      p.repositories.some(
        (r) => r && typeof r === "object" && r.id === 998736528,
      ) &&
      typeof p.login === "string" &&
      p.login,
    "owner_workspace_repository",
  );
}
export function validateDecodedRecords(records: Record<string, RecordValue>) {
  check(Object.hasOwn(records, "user-187839747.bin"), "owner_profile_missing");
  for (const [name, v] of Object.entries(records)) {
    if (name === "user-187839747.bin") profileScope(v);
    else
      check(
        /^session-[a-f0-9]{64}\.bin$/.test(name) &&
          Number.isFinite(v.expiresAt) &&
          typeof v.workspace === "string" &&
          (v.githubId === undefined || Number.isSafeInteger(v.githubId)) &&
          (v.userToken === undefined || typeof v.userToken === "string") &&
          (v.refreshToken === undefined || typeof v.refreshToken === "string"),
        "malformed_session",
      );
  }
}
export function validateWindowEvidence(
  stopped: RecordValue,
  outcome: RecordValue,
  watchdog: RecordValue,
  failed: boolean,
  run: string,
) {
  check(
    stopped.status === "STOPPED" && stopped.outputDirectory === run,
    "app_shutdown_unverified",
  );
  check(
    !failed &&
      watchdog.status === "CLEANUP_COMPLETE" &&
      watchdog.expired === false,
    "oauth_window_failed_or_expired",
  );
  check(
    outcome.status === "CALLBACK_COMPLETE" &&
      outcome.starts === 1 &&
      outcome.callbacks === 1 &&
      outcome.tokenExchanges === 1 &&
      outcome.identities === 1 &&
      outcome.blockedOperations === 0,
    "oauth_window_failure",
  );
}
export function checkRecoveryDelta(input: {
  before: AuthInventory;
  after: AuthInventory;
  archivedName: string;
  candidateName: string;
  oldPins: Record<string, string>;
  currentOldPins: Record<string, string>;
  previousProfile: RecordValue;
  profile: RecordValue;
  session: RecordValue;
  metadata: RecordValue;
  startedAt: number;
  candidateMtime: number;
  now: number;
}) {
  const { before, after, archivedName, candidateName, session: s, now } = input;
  check(
    !Object.hasOwn(before.records, archivedName) &&
      !Object.hasOwn(after.records, archivedName),
    "archived_session_reappeared",
  );
  check(
    canonical(before.directories) === canonical(after.directories),
    "auth_directories_changed",
  );
  check(
    canonical(input.oldPins) === canonical(input.currentOldPins),
    "historical_cookie_changed",
  );
  const added = Object.keys(after.records).filter(
    (n) => !Object.hasOwn(before.records, n),
  );
  check(
    /^session-[a-f0-9]{64}\.bin$/.test(candidateName) &&
      added.length === 1 &&
      added[0] === candidateName &&
      candidateName !== archivedName,
    "candidate_not_unique",
  );
  for (const [name, hash] of Object.entries(before.records)) {
    check(Object.hasOwn(after.records, name), "historical_record_missing");
    if (name !== "user-187839747.bin")
      check(after.records[name] === hash, "historical_record_changed");
  }
  profileScope(input.profile);
  profileScope(input.previousProfile);
  const withoutLogin = (p: RecordValue) =>
    Object.fromEntries(Object.entries(p).filter(([k]) => k !== "login"));
  check(
    canonical(withoutLogin(input.profile)) ===
      canonical(withoutLogin(input.previousProfile)),
    "profile_fields_changed",
  );
  check(
    s.githubId === 187839747 &&
      s.workspace === "" &&
      !s.flow &&
      !s.installationChoices &&
      Number.isFinite(s.expiresAt) &&
      Number(s.expiresAt) > now &&
      Object.keys(s).every((k) =>
        [
          "expiresAt",
          "workspace",
          "githubId",
          "userToken",
          "tokenExpiresAt",
          "refreshToken",
        ].includes(k),
      ),
    "candidate_identity",
  );
  check(
    typeof s.userToken === "string" &&
      s.userToken &&
      typeof s.refreshToken === "string" &&
      s.refreshToken &&
      Number.isFinite(s.tokenExpiresAt),
    "candidate_credentials",
  );
  check(
    Number(s.tokenExpiresAt) >= now + 30 * 60000,
    "candidate_token_lifetime",
  );
  const capturedAt = Date.parse(String(input.metadata.recordedAt));
  check(
    input.metadata.schemaVersion === 1 &&
      input.metadata.origin === AUTH_ORIGIN &&
      input.metadata.callbackUrl === AUTH_CALLBACK,
    "candidate_origin_callback",
  );
  check(
    Number.isFinite(capturedAt) &&
      capturedAt >= input.startedAt &&
      capturedAt <= now &&
      input.candidateMtime >= input.startedAt - 2000 &&
      input.candidateMtime <= now + 2000,
    "candidate_creation",
  );
  return {
    status: "PASS_LOCAL_SESSION_WITH_APPROVED_ARCHIVE_DISPOSITION",
    archiveOnlyHistoricalRecords: 1,
    completeHistoricalActiveFilePreservation: false,
    nonExemptHistoricalRecordsPreserved: true,
    canonicalCookieAndMetadataPreserved: true,
    newUniqueOwnerSession: true,
    tokenMinutesRemaining: Math.floor((Number(s.tokenExpiresAt) - now) / 60000),
    recoveryMinimumMinutes: 30,
    provisioningEntryMinimumMinutes: 40,
    provisioningBoundaryMinimumMinutes: 30,
    provisioningEntryLifetimeEligible:
      Number(s.tokenExpiresAt) >= now + 40 * 60000,
    provisioningAuthorized: false,
    providerCurrentRepositoryAccess: "NOT_TESTED",
    credentialRefreshPerformed: false,
  };
}
const within = (base: string, p: string) => {
  const r = relative(resolve(base), resolve(p));
  return r !== ".." && !r.startsWith(".." + sep) && !isAbsolute(r);
};
async function noLinks(p: string) {
  for (let cursor = resolve(p); ;) {
    const info = await lstat(cursor).catch((e) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    check(!info?.isSymbolicLink(), "path_link_rejected");
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}
const guards: SnapshotGuards = {
  async privatePath(p) {
    check(
      isAbsolute(p) &&
        !p.startsWith("\\\\") &&
        !/[\\/]OneDrive(?: - [^\\/]+)?(?:[\\/]|$)/i.test(p) &&
        (within(root, p) || within(archivePolicy.authDir, p)),
      "private_path_rejected",
    );
    await noLinks(p);
    return resolve(p);
  },
  assertPrivateAcl(p, file = false) {
    try {
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-File",
          join(repo, "scripts/sentinel-provision-private.ps1"),
          "-Directory",
          p,
          ...(file ? ["-File"] : []),
        ],
        { timeout: 5000, windowsHide: true, stdio: "pipe" },
      );
    } catch {
      throw new ReauthError("private_acl_rejected");
    }
  },
  createPrivateDirectory(p) {
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-File",
        join(repo, "scripts/sentinel-provision-private.ps1"),
        "-Directory",
        p,
        "-Create",
      ],
      { timeout: 5000, windowsHide: true, stdio: "pipe" },
    );
  },
};
type Manifest = {
  schemaVersion: number;
  phase: string;
  files: Record<string, string>;
  dotenvFiles: Record<string, { exists: boolean; sha256: string | null }>;
  auth: AuthInventory;
  absentPaths: string[];
  historicalFiles: Record<string, string>;
};
async function loadManifest(
  file: string,
  pin: string,
  afterLogin: boolean,
): Promise<Manifest> {
  check(/^[a-f0-9]{64}$/.test(pin), "manifest_pin");
  const bytes = await readPrivateFile(file, guards, true);
  check(sha256(bytes) === pin, "manifest_hash");
  const m = parseObject(bytes) as unknown as Manifest;
  check(
    m.schemaVersion === 1 &&
      m.phase === "S04_OWNER_AUTH_RECOVERY_ONLY" &&
      canonical(m.absentPaths) ===
        canonical([resolve(archivePolicy.absentSessionFile)]),
    "manifest_scope",
  );
  for (const [p, h] of Object.entries(m.files)) {
    check(
      isAbsolute(p) &&
        (within(root, p) ||
          within(repo, p) ||
          within(archivePolicy.authDir, p) ||
          resolve(p) === resolve(process.execPath)),
      "manifest_boundary",
    );
    await noLinks(p);
    check(
      (await lstat(p)).nlink === 1 && sha256(await readFile(p)) === h,
      "manifest_input_changed",
    );
  }
  check(Object.keys(m.dotenvFiles).length === 6, "dotenv_set");
  for (const name of [
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
    ".env.development",
    ".env.development.local",
  ]) {
    const p = join(repo, name),
      expected = m.dotenvFiles[p];
    check(expected, "dotenv_binding");
    const b = await readFile(p).catch((e) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    check(
      Boolean(b) === expected.exists && (!b || sha256(b) === expected.sha256),
      "configuration_changed",
    );
  }
  for (const required of [
    fileURLToPath(import.meta.url),
    join(repo, "scripts/Invoke-S04OwnerReauth.ps1"),
    join(repo, "scripts/sentinel-owner-reauth-app.mjs"),
    join(repo, "scripts/sentinel-owner-reauth-watchdog.ps1"),
    descriptor,
    archivePolicy.proposalFile,
    archivePolicy.designFile,
    archivePolicy.baselineFile,
    archivePolicy.archiveFile,
    archivePolicy.oldCookieFile,
    archivePolicy.oldCookieFile + ".meta.json",
  ])
    check(Object.hasOwn(m.files, resolve(required)), "manifest_required_pin");
  await requireAbsent(archivePolicy.absentSessionFile, guards);
  if (!afterLogin)
    check(
      canonical(await inventoryOwnerAuth(archivePolicy.authDir, guards)) ===
        canonical(m.auth),
      "auth_inventory_changed",
    );
  return m;
}
async function configuration() {
  check(
    !Object.keys(process.env).some((k) =>
      /^(AUTH_|GITHUB_|SENTINEL_|PG|DATABASE_|DB_|POSTGRES_)|^(APP_URL|DIRECT_URL|NODE_OPTIONS)$/.test(
        k,
      ),
    ),
    "ambient_configuration_forbidden",
  );
  check(
    !process.env.NODE_ENV || process.env.NODE_ENV === "development",
    "node_environment",
  );
  const loaded = nextEnv.loadEnvConfig(repo, true, { info() {}, error() {} });
  check(
    !Object.keys(process.env).some((k) =>
      /^(SENTINEL_|PG|DATABASE_|DB_|POSTGRES_)|^DIRECT_URL$/.test(k),
    ),
    "database_configuration_forbidden",
  );
  check(
    process.env.APP_URL === AUTH_ORIGIN &&
      resolve(process.env.AUTH_DATA_DIR ?? "") ===
        resolve(archivePolicy.authDir) &&
      Buffer.byteLength(process.env.AUTH_SECRET ?? "") >= 32,
    "configuration_identity",
  );
  for (const key of [
    "GITHUB_APP_CLIENT_ID",
    "GITHUB_APP_CLIENT_SECRET",
    "GITHUB_APP_ID",
    "GITHUB_APP_SLUG",
    "GITHUB_APP_PRIVATE_KEY",
  ])
    check(process.env[key], "configuration_missing");
  const configPins: Record<string, string> = {};
  for (const f of loaded.loadedEnvFiles)
    configPins[join(repo, f.path)] = sha256(await readFile(join(repo, f.path)));
  return { secret: process.env.AUTH_SECRET!, configPins };
}
async function decodedInventory(
  inventory: AuthInventory,
  secret: string,
  dir = archivePolicy.authDir,
) {
  const records: Record<string, RecordValue> = {};
  for (const name of Object.keys(inventory.records))
    if (!name.includes(sep) && !name.includes("/"))
      records[name] = decodeAuth(
        await readPrivateFile(join(dir, name), guards),
        name,
        secret,
      );
  validateDecodedRecords(records);
  return records;
}
async function archiveEvidence(secret: string, manifest: Manifest) {
  validateDescriptor(
    await readPrivateFile(descriptor, guards, true),
    archivePolicy,
  );
  for (const [p, h] of [
    [archivePolicy.proposalFile, archivePolicy.proposalSha256],
    [archivePolicy.designFile, archivePolicy.designSha256],
    [archivePolicy.baselineFile, archivePolicy.baselineSha256],
    [archivePolicy.archiveFile, archivePolicy.archiveSha256],
  ])
    check(
      sha256(await readPrivateFile(p, guards, true)) === h,
      "archive_evidence_hash",
    );
  const old = parseObject(
    await readPrivateFile(archivePolicy.baselineFile, guards, true),
  );
  const records = old.records as Record<string, string>,
    cookies = old.oldPins as Record<string, string>;
  check(
    records[oldName] === archivePolicy.archiveSha256 &&
      Object.keys(records).length === 6 &&
      Object.keys(cookies).length === 2,
    "archive_provenance",
  );
  for (const [name, h] of Object.entries(records))
    check(
      sha256(
        await readPrivateFile(
          join(oldRun, "archive/auth-store", name),
          guards,
          true,
        ),
      ) === h,
      "backup_hash",
    );
  for (const [source, target] of [
    [archivePolicy.oldCookieFile, "previous-owner.cookie"],
    [
      archivePolicy.oldCookieFile + ".meta.json",
      "previous-owner.cookie.meta.json",
    ],
  ])
    check(
      sha256(await readPrivateFile(source, guards, true)) ===
        historicalPin(cookies, source) &&
        sha256(
          await readPrivateFile(join(oldRun, "archive", target), guards, true),
        ) === historicalPin(cookies, source),
      "old_cookie_changed",
    );
  const archived = decodeAuth(
    await readPrivateFile(archivePolicy.archiveFile, guards, true),
    oldName,
    secret,
  );
  check(
    archived.githubId === 187839747 && !archived.flow,
    "archive_owner_identity",
  );
  const oldCookie = (
    await readPrivateFile(archivePolicy.oldCookieFile, guards, true)
  )
    .toString("utf8")
    .trim();
  check(
    /^wetscan_session=[a-f0-9]{64}$/.test(oldCookie) &&
      "session-" + sha256(Buffer.from(oldCookie.slice(16))) + ".bin" ===
        oldName,
    "archive_cookie_identity",
  );
  for (const [p, h] of Object.entries(manifest.historicalFiles))
    check(manifest.files[p] === h, "historical_binding_missing");
}
export async function main() {
  let stage = "arguments";
  try {
    const args: Record<string, string> = {};
    for (const a of process.argv.slice(3)) {
      const m = /^--(manifest|sha256|run|grant)=(.+)$/.exec(a);
      check(m && !Object.hasOwn(args, m[1]), "argument_scope");
      args[m[1]] = m[2];
    }
    const mode = process.argv[2] ?? "preflight";
    check(["preflight", "snapshot", "verify"].includes(mode), "mode");
    check(resolve(process.cwd()) === repo, "workspace");
    stage = "manifest";
    const manifest = await loadManifest(
      args.manifest,
      args.sha256,
      mode === "verify",
    );
    stage = "configuration";
    const { secret, configPins } = await configuration();
    stage = "archive_evidence";
    await archiveEvidence(secret, manifest);
    const inventory = await inventoryOwnerAuth(archivePolicy.authDir, guards);
    // Preserve the reviewed encrypted store's existing ACL. The original
    // contract applies owner/SYSTEM-only ACLs to private evidence, backups and
    // plaintext candidate files, not to rewriting this legacy store's DACL.
    stage = "encrypted_records";
    await decodedInventory(inventory, secret);
    if (mode === "preflight") {
      console.log(
        JSON.stringify({
          status: "OFFLINE_READY",
          filePins: Object.keys(manifest.files).length,
          historicalFiles: Object.keys(manifest.historicalFiles).length,
          activeAuthRecords: Object.keys(inventory.records).length,
          archiveOnlyException: true,
          credentialRefreshPerformed: false,
          databaseConnections: 0,
          providerRequests: 0,
          authenticationWrites: 0,
        }),
      );
      return;
    }
    check(args.grant === AUTH_GRANT, "fresh_owner_grant_required");
    check(
      args.run &&
        resolve(dirname(args.run)) === resolve(root) &&
        /^s04-owner-reauth-[a-f0-9]{32}$/.test(args.run.split(/[\\/]/).pop()!),
      "run_boundary",
    );
    const run = await guards.privatePath(args.run);
    guards.assertPrivateAcl(run);
    if (mode === "snapshot") {
      stage = "backup_snapshot";
      const result = await snapshotOwnerAuth({
        authDir: archivePolicy.authDir,
        oldCookie: archivePolicy.oldCookieFile,
        run,
        configPins,
        guards,
      });
      console.log(JSON.stringify(result));
      return;
    }
    stage = "post_login_preservation";
    const before = parseObject(
      await readPrivateFile(
        join(run, "auth-before.private.json"),
        guards,
        true,
      ),
    );
    check(
      before.schemaVersion === 2 &&
        resolve(String(before.authDir)) === resolve(archivePolicy.authDir) &&
        canonical(before.configPins) === canonical(configPins) &&
        canonical({
          records: before.records,
          directories: before.directories,
        }) === canonical(manifest.auth),
      "snapshot_binding",
    );
    for (const [name, h] of Object.entries(
      before.records as Record<string, string>,
    ))
      check(
        sha256(
          await readPrivateFile(
            join(run, "archive/auth-store", name),
            guards,
            true,
          ),
        ) === h,
        "backup_hash",
      );
    const currentOldPins: Record<string, string> = {};
    for (const p of Object.keys(before.oldPins as Record<string, string>))
      currentOldPins[p] = sha256(await readPrivateFile(p, guards, true));
    for (const [p, name] of [
      [archivePolicy.oldCookieFile, "previous-owner.cookie"],
      [
        archivePolicy.oldCookieFile + ".meta.json",
        "previous-owner.cookie.meta.json",
      ],
    ])
      check(
        sha256(
          await readPrivateFile(join(run, "archive", name), guards, true),
        ) === (before.oldPins as Record<string, string>)[p],
        "backup_hash",
      );
    const stopped = parseObject(
      await readPrivateFile(
        join(run, "server-stopped.sanitized.json"),
        guards,
        true,
      ),
    );
    check(
      stopped.status === "STOPPED" && stopped.outputDirectory === run,
      "app_shutdown_unverified",
    );
    for (const name of [
      "window-failure.sanitized.json",
      "deadline-expired.sanitized.json",
    ])
      check(
        !(await lstat(join(run, name)).then(
          () => true,
          (e) => {
            if (e.code === "ENOENT") return false;
            throw e;
          },
        )),
        "oauth_window_failed_or_expired",
      );
    const outcome = parseObject(
      await readPrivateFile(
        join(run, "oauth-window.sanitized.json"),
        guards,
        true,
      ),
    );
    validateWindowEvidence(
      stopped,
      outcome,
      parseObject(
        await readPrivateFile(
          join(run, "watchdog-finished.sanitized.json"),
          guards,
          true,
        ),
      ),
      false,
      run,
    );
    check(
      outcome.status === "CALLBACK_COMPLETE" &&
        outcome.starts === 1 &&
        outcome.callbacks === 1 &&
        outcome.tokenExchanges === 1 &&
        outcome.identities === 1 &&
        outcome.blockedOperations === 0,
      "oauth_window_failure",
    );
    const candidate = join(run, "candidate/owner-session.cookie");
    const cookie = (await readPrivateFile(candidate, guards, true))
      .toString("utf8")
      .trim();
    check(
      /^wetscan_session=[a-f0-9]{64}$/.test(cookie),
      "candidate_cookie_format",
    );
    const name = "session-" + sha256(Buffer.from(cookie.slice(16))) + ".bin";
    const profileName = "user-187839747.bin";
    const result = checkRecoveryDelta({
      before: {
        records: before.records as Record<string, string>,
        directories: before.directories as string[],
      },
      after: inventory,
      archivedName: oldName,
      candidateName: name,
      oldPins: before.oldPins as Record<string, string>,
      currentOldPins,
      previousProfile: decodeAuth(
        await readPrivateFile(
          join(run, "archive/auth-store", profileName),
          guards,
          true,
        ),
        profileName,
        secret,
      ),
      profile: decodeAuth(
        await readPrivateFile(join(archivePolicy.authDir, profileName), guards),
        profileName,
        secret,
      ),
      session: decodeAuth(
        await readPrivateFile(join(archivePolicy.authDir, name), guards),
        name,
        secret,
      ),
      metadata: parseObject(
        await readPrivateFile(candidate + ".meta.json", guards, true),
      ),
      startedAt: Number(before.startedAt),
      candidateMtime: (await lstat(join(archivePolicy.authDir, name))).mtimeMs,
      now: Date.now(),
    });
    await requireAbsent(archivePolicy.absentSessionFile, guards);
    check(
      canonical(await inventoryOwnerAuth(archivePolicy.authDir, guards)) ===
        canonical(inventory),
      "concurrent_auth_change",
    );
    console.log(JSON.stringify(result));
  } catch (error) {
    console.log(
      JSON.stringify({
        status: "NOT_VERIFIED",
        stage,
        classification:
          error instanceof ReauthError
            ? error.classification
            : "offline_validation_failed",
        databaseConnections: 0,
        providerRequests: 0,
      }),
    );
    process.exitCode = 1;
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
