// Offline-only entrypoint. Never imports the mutating auth store or a DB driver.
import { execFileSync } from "node:child_process";
import { createPrivateKey } from "node:crypto";
import { lstat, open, readFile, readdir } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import {
  ArchiveSessionError,
  archiveFailureReceipt,
  canonical,
  sha256,
  validateDescriptor,
  verifyArchivedOwnerSession,
  type ArchiveSessionPolicy,
} from "./sentinel-owner-session-exception";
import type { SnapshotGuards } from "./sentinel-owner-auth-snapshot";

const repo = fileURLToPath(new URL("..", import.meta.url));
const root = "C:/Users/sheil/.wetscan-sentinel";
const run = join(root, "s04-owner-login-0080a5fca3db4995be94fd55139bc58d");
const descriptorFile = join(
  root,
  "s04-auth-archive-exception-9c53ab2d86a94d0aa219d5a5535422e0/archive-only-exception.descriptor.private.json",
);
const oldName =
  "session-f3c7b6eddeff1ea869f12c075adb438e92023dedd4e817adb2fded17fb63b17e.bin";
const policy: ArchiveSessionPolicy = Object.freeze({
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
  baselineFile: join(run, "auth-before.private.json"),
  archiveFile: join(run, "archive/auth-store", oldName),
  absentSessionFile: join("C:/Users/sheil/.wetscan-auth", oldName),
  authDir: "C:/Users/sheil/.wetscan-auth",
  run,
  candidateFile: join(run, "candidate/owner-session.cookie"),
  oldCookieFile: join(root, "s01-20261114/secrets/owner-session.cookie"),
});
function requireValue(value: unknown, classification: string): asserts value {
  if (!value) throw new ArchiveSessionError(classification);
}
const within = (base: string, path: string) => {
  const rel = relative(resolve(base), resolve(path));
  return rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel);
};
async function noLinks(path: string) {
  let cursor = resolve(path);
  while (true) {
    const info = await lstat(cursor).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    requireValue(!info?.isSymbolicLink(), "path_link_rejected");
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}
const guards: SnapshotGuards = {
  async privatePath(path) {
    requireValue(
      isAbsolute(path) &&
        !/^\\\\/.test(path) &&
        !/[\\/]OneDrive(?: - [^\\/]+)?(?:[\\/]|$)/i.test(path) &&
        !within(repo, path),
      "private_path_rejected",
    );
    await noLinks(path);
    return resolve(path);
  },
  assertPrivateAcl(path, file = false) {
    try {
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-File",
          join(repo, "scripts/sentinel-provision-private.ps1"),
          "-Directory",
          path,
          ...(file ? ["-File"] : []),
        ],
        { windowsHide: true, stdio: "pipe", timeout: 5000 },
      );
    } catch {
      throw new ArchiveSessionError("private_acl_rejected");
    }
  },
  createPrivateDirectory() {
    throw new ArchiveSessionError("auth_writes_forbidden");
  },
};
async function verifyManifest(file: string, digest: string) {
  await guards.privatePath(file);
  guards.assertPrivateAcl(file, true);
  const bytes = await readFile(file);
  requireValue(sha256(bytes) === digest, "manifest_hash");
  const manifest = JSON.parse(bytes.toString("utf8"));
  requireValue(
    manifest.schemaVersion === 1 &&
      manifest.files &&
      canonical(manifest.absentPaths) ===
        canonical([resolve(policy.absentSessionFile)]),
    "manifest_scope",
  );
  for (const [path, hash] of Object.entries(manifest.files)) {
    requireValue(
      isAbsolute(path) &&
        (within(repo, path) ||
          within(root, path) ||
          within(policy.authDir, path)),
      "manifest_boundary",
    );
    await noLinks(path);
    const info = await lstat(path);
    requireValue(info.isFile() && info.nlink === 1, "manifest_file_identity");
    requireValue(
      typeof hash === "string" && sha256(await readFile(path)) === hash,
      "manifest_input_changed",
    );
  }
  for (const path of [
    descriptorFile,
    fileURLToPath(import.meta.url),
    join(repo, "scripts/sentinel-owner-session-exception.ts"),
    join(repo, "scripts/Invoke-S04OwnerSessionArchiveAudit.ps1"),
    policy.baselineFile,
    policy.archiveFile,
    policy.proposalFile,
    policy.designFile,
    policy.candidateFile,
    policy.candidateFile + ".meta.json",
  ])
    requireValue(
      Object.hasOwn(manifest.files, resolve(path)),
      "manifest_required_pin",
    );
  for (const [path, pin] of Object.entries(manifest.dotenvFiles ?? {})) {
    requireValue(
      within(repo, path) &&
        [
          ".env",
          ".env.local",
          ".env.production",
          ".env.production.local",
        ].includes(relative(repo, path)),
      "manifest_dotenv_boundary",
    );
    const p = pin as { exists: boolean; sha256: string | null };
    const bytes = await readFile(path).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    requireValue(
      Boolean(bytes) === p.exists && (!bytes || sha256(bytes) === p.sha256),
      "manifest_dotenv_changed",
    );
  }
  requireValue(
    Object.keys(manifest.dotenvFiles ?? {}).length === 4,
    "manifest_dotenv_set",
  );
  return Object.keys(manifest.files).length;
}
let output: string | undefined;
let safeOutput = false;
async function writeReceipt(name: string, result: unknown) {
  requireValue(safeOutput && output, "output_not_owned");
  const fd = await open(join(output, name), "wx", 0o600);
  try {
    await fd.writeFile(JSON.stringify(result, null, 2) + "\n");
    await fd.sync();
  } finally {
    await fd.close();
  }
  guards.assertPrivateAcl(join(output, name), true);
}
try {
  const mode = process.argv[2] ?? "preflight";
  requireValue(["preflight", "verify"].includes(mode), "mode");
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(3)) {
    const match = /^--(descriptor|manifest|manifest-sha256|output)=(.+)$/.exec(
      arg,
    );
    requireValue(match && !Object.hasOwn(args, match[1]), "argument_scope");
    args[match[1]] = match[2];
  }
  requireValue(
    !args.descriptor || resolve(args.descriptor) === resolve(descriptorFile),
    "descriptor_path",
  );
  requireValue(resolve(process.cwd()) === resolve(repo), "workspace");
  await guards.privatePath(descriptorFile);
  guards.assertPrivateAcl(descriptorFile, true);
  const descriptorBytes = await readFile(descriptorFile);
  validateDescriptor(descriptorBytes, policy);
  let manifestEntries = 0;
  if (args.manifest || args["manifest-sha256"]) {
    requireValue(
      args.manifest && /^[a-f0-9]{64}$/.test(args["manifest-sha256"] ?? ""),
      "manifest_required",
    );
    manifestEntries = await verifyManifest(
      args.manifest,
      args["manifest-sha256"],
    );
  }
  requireValue(mode !== "verify" || manifestEntries > 0, "manifest_required");
  if (mode === "verify") {
    requireValue(
      args.output &&
        resolve(dirname(args.output)) === resolve(root) &&
        /^s04-auth-archive-validation-[a-f0-9]{32}$/.test(
          basename(args.output),
        ),
      "output_boundary",
    );
    output = await guards.privatePath(args.output);
    guards.assertPrivateAcl(output);
    requireValue((await readdir(output)).length === 0, "output_not_empty");
    safeOutput = true;
  } else requireValue(!args.output, "default_off_output_forbidden");
  const loaded = nextEnv.loadEnvConfig(repo, false, { info() {}, error() {} });
  requireValue(
    !Object.keys(process.env).some((key) =>
      /^(SENTINEL_|PG|DATABASE_)|^DIRECT_URL$/.test(key),
    ),
    "database_environment_forbidden",
  );
  for (const key of [
    "AUTH_SECRET",
    "AUTH_DATA_DIR",
    "GITHUB_APP_ID",
    "GITHUB_APP_SLUG",
    "GITHUB_APP_CLIENT_ID",
    "GITHUB_APP_CLIENT_SECRET",
    "GITHUB_APP_PRIVATE_KEY",
  ])
    requireValue(process.env[key], "auth_configuration");
  const key = process.env
    .GITHUB_APP_PRIVATE_KEY!.trim()
    .replace(/^(['"])([\s\S]*)\1$/, "$2")
    .replace(/\\+r\\+n/g, "\n")
    .replace(/\\+n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim();
  requireValue(
    createPrivateKey(key).asymmetricKeyType === "rsa",
    "auth_configuration",
  );
  const configPins: Record<string, string> = {};
  for (const file of loaded.loadedEnvFiles) {
    const path = join(repo, file.path);
    configPins[path] = sha256(await readFile(path));
  }
  const result = await verifyArchivedOwnerSession({
    descriptorBytes,
    policy,
    guards,
    secret: process.env.AUTH_SECRET!,
    configuredAuthDir: process.env.AUTH_DATA_DIR!,
    configuredOrigin: process.env.APP_URL ?? "",
    configPins,
  });
  if (mode === "preflight")
    console.log(
      JSON.stringify({
        status: "OFFLINE_READY",
        executionPerformed: false,
        outputCreated: false,
        archiveExceptionValidated: true,
        databaseConnections: 0,
        githubRequests: 0,
      }),
    );
  else {
    const receipt = {
      ...result,
      manifestSha256: args["manifest-sha256"],
      manifestEntries,
      verifiedAtUtc: new Date().toISOString(),
      overallS04Status: "IMPLEMENTED_PENDING_ACCEPTANCE",
    };
    await writeReceipt("archive-session-validation.sanitized.json", receipt);
    console.log(JSON.stringify(receipt));
  }
} catch (error) {
  const receipt = archiveFailureReceipt(error);
  if (safeOutput) {
    try {
      await writeReceipt("validation-failure.sanitized.json", receipt);
    } catch {
      /* No overwrite or retry. */
    }
  }
  console.error(JSON.stringify(receipt));
  process.exitCode = 1;
}
