// Independent filesystem-only checker. No provisioning/app/database imports.
import { execFileSync } from "node:child_process";
import { open, readdir } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import nextEnvironment from "@next/env";
import {
  discoverHistoricalApprovals,
  requireHistoricalClosed,
} from "./sentinel-approval-history";
import type { SnapshotGuards } from "./sentinel-owner-auth-snapshot";
import { sha256 } from "./sentinel-owner-session-exception";
import { packagePolicy as p } from "./sentinel-provision-package-policy";
import {
  PackageError,
  bytesAt,
  demand,
  initialArchiveCheck,
  loadPackageManifest,
  noLinks,
  parseObject,
  selectCandidate,
  validatePackageGrant,
  verifyAuthBoundary,
  verifyPackageFiles,
  within,
  type PackageGrant,
} from "./sentinel-provision-package";

const guards: SnapshotGuards = {
  async privatePath(path) {
    demand(
      isAbsolute(path) &&
        (within(p.root, path) || within(p.archive.authDir, path)) &&
        !/[\\/]OneDrive(?:[\\/]|$)/i.test(path),
      "private_boundary",
    );
    await noLinks(path);
    return path;
  },
  assertPrivateAcl(path, file = false) {
    try {
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-File",
          join(p.repo, "scripts/sentinel-provision-private.ps1"),
          "-Directory",
          path,
          ...(file ? ["-File"] : []),
        ],
        { windowsHide: true, stdio: "pipe", timeout: 5000 },
      );
    } catch {
      throw new PackageError("private_acl");
    }
  },
  createPrivateDirectory() {
    throw new PackageError("checker_directory_creation_forbidden");
  },
};
async function exclusive(path: string, bytes: Buffer) {
  await guards.privatePath(path);
  guards.assertPrivateAcl(dirname(path));
  const fd = await open(path, "wx", 0o600);
  try {
    await fd.writeFile(bytes);
    await fd.sync();
  } finally {
    await fd.close();
  }
  guards.assertPrivateAcl(path, true);
}
try {
  const mode = process.argv[2] ?? "preflight";
  demand(
    ["preflight", "authorize", "begin", "check", "finish"].includes(mode),
    "mode",
  );
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(3)) {
    const match =
      /^--(manifest|sha|cookie|grant|grant-sha|output|owner)=(.+)$/.exec(arg);
    demand(match && !Object.hasOwn(args, match[1]), "argument_scope");
    args[match[1]] = match[2];
  }
  demand(resolve(process.cwd()) === resolve(p.repo), "workspace");
  selectCandidate(args.cookie, p);
  const manifest = await loadPackageManifest(
    args.manifest,
    args.sha,
    p,
    guards,
  );
  let before: Buffer | undefined;
  let grant: PackageGrant | undefined;
  let grantHash: string | undefined;
  let output: string | undefined;
  if (mode !== "preflight") {
    demand(
      args.grant && /^[a-f0-9]{64}$/.test(args["grant-sha"] ?? ""),
      "live_owner_grant",
    );
    await guards.privatePath(resolve(args.grant));
    guards.assertPrivateAcl(resolve(args.grant), true);
    const bytes = await bytesAt(args.grant);
    grantHash = sha256(bytes);
    demand(grantHash === args["grant-sha"], "grant_digest");
    grant = parseObject(bytes) as unknown as PackageGrant;
    output = resolve(args.output ?? "");
    demand(
      dirname(output) === resolve(p.root) &&
        /^s04-h04c-b2-provision-package-[a-f0-9]{32}$/.test(basename(output)),
      "output_scope",
    );
    await guards.privatePath(output);
    validatePackageGrant(
      grant,
      args.sha,
      sha256(
        await bytesAt(join(p.repo, "scripts/Invoke-S04ProvisionPackage.ps1")),
      ),
      args.cookie,
      output,
      Date.now(),
      mode === "finish",
    );
    demand(args.owner === grant.approvedBy, "owner_binding");
    if (["check", "finish"].includes(mode)) {
      guards.assertPrivateAcl(output);
      const checkpoint = parseObject(
        await bytesAt(join(output, "package-state.private.json")),
      );
      demand(
        checkpoint.manifestSha256 === args.sha &&
          checkpoint.ownerGrantSha256 === grantHash &&
          checkpoint.outputDirectory === output &&
          checkpoint.expiresAtUtc === grant.expiresAt &&
          typeof checkpoint.beganAtMs === "number" &&
          checkpoint.beganAtMs >= Date.parse(grant.notBefore) &&
          checkpoint.beganAtMs <= Date.now(),
        "checkpoint_binding",
      );
      demand(
        parseObject(
          await bytesAt(join(output, "package-grant-consumed.sanitized.json")),
        ).ownerGrantSha256 === grantHash,
        "grant_not_consumed",
      );
      before = await bytesAt(join(output, "candidate-before.bin"));
      guards.assertPrivateAcl(join(output, "candidate-before.bin"), true);
      demand(
        sha256(before) === manifest.files[resolve(manifest.candidateRecord)],
        "candidate_before_pin",
      );
    }
  }
  await verifyPackageFiles(manifest, p, before);
  // Role files remain private at every boundary, independently of content pins.
  for (const name of ["app.password", "migration.password"])
    guards.assertPrivateAcl(join(p.root, "s01-20261114/secrets", name), true);
  const history = await discoverHistoricalApprovals({
    root: p.root,
    verifyBoundary: guards.privatePath,
    verifyDirectory: guards.privatePath,
  });
  const prior = history.filter(
    (a) =>
      !output ||
      !["web-runtime-approval.json", "controller-runtime-approval.json"].some(
        (n) => a.path === join(output!, n),
      ),
  );
  requireHistoricalClosed(prior);
  nextEnvironment.loadEnvConfig(p.repo, false, { info() {}, error() {} });
  demand(
    process.env.AUTH_SECRET &&
      resolve(process.env.AUTH_DATA_DIR ?? "") === resolve(p.archive.authDir) &&
      process.env.APP_URL === "http://localhost:3000",
    "auth_configuration",
  );
  const configPins: Record<string, string> = {};
  for (const [path, pin] of Object.entries(manifest.dotenvFiles))
    if (pin.exists) configPins[path] = sha256(await bytesAt(path));
  // The old validator remains a strict, unchanged pre-execution check. Runtime
  // checks never pass altered ciphertext to it or rewrite its reviewed design.
  if (!before) {
    await initialArchiveCheck(
      p,
      guards,
      process.env.AUTH_SECRET,
      process.env.AUTH_DATA_DIR!,
      process.env.APP_URL!,
      configPins,
    );
    before = await bytesAt(manifest.candidateRecord);
  }
  const result = await verifyAuthBoundary(
    manifest,
    p,
    guards,
    process.env.AUTH_SECRET,
    before,
    Date.now(),
  );
  if (["preflight", "authorize", "begin"].includes(mode))
    demand(result.tokenMinutesRemaining >= 40, "entry_lifetime_headroom");
  await verifyPackageFiles(manifest, p, mode === "begin" ? undefined : before);
  await verifyAuthBoundary(
    manifest,
    p,
    guards,
    process.env.AUTH_SECRET,
    before,
    Date.now(),
  );
  if (grant)
    validatePackageGrant(
      grant,
      args.sha,
      sha256(
        await bytesAt(join(p.repo, "scripts/Invoke-S04ProvisionPackage.ps1")),
      ),
      args.cookie,
      output!,
      Date.now(),
      mode === "finish",
    );
  if (mode === "begin") {
    demand(output && grant, "live_owner_grant");
    guards.assertPrivateAcl(output);
    demand(
      (await readdir(output)).every((n) =>
        [
          "owned-processes.jsonl",
          "watchdog.stdout.log",
          "watchdog.stderr.log",
          "package-begin.stdout.log",
          "package-begin.stderr.log",
        ].includes(n),
      ),
      "output_not_fresh",
    );
    await exclusive(join(output, "candidate-before.bin"), before);
    await exclusive(
      join(output, "package-state.private.json"),
      Buffer.from(
        JSON.stringify(
          {
            manifestSha256: args.sha,
            ownerGrantSha256: grantHash,
            outputDirectory: output,
            expiresAtUtc: grant.expiresAt,
            beganAtMs: Date.now(),
          },
          null,
          2,
        ) + "\n",
      ),
    );
    await exclusive(
      join(output, "package-grant-consumed.sanitized.json"),
      Buffer.from(
        JSON.stringify({
          result: "CONSUMED_ONCE",
          ownerGrantSha256: grantHash,
          liveExecutionPermissionFromThisReceipt: false,
        }) + "\n",
      ),
    );
  }
  const receipt = {
    status: mode === "preflight" ? "OFFLINE_READY" : "PACKAGE_BOUNDARY_PASS",
    mode,
    ...result,
    manifestSha256: args.sha,
    manifestPins: Object.keys(manifest.files).length,
    historicalApprovals: prior.length,
    providerCurrentAccess: "NOT_TESTED",
    databaseConnections: 0,
    providerRequests: 0,
    authWrites: 0,
    overallS04Status: "IMPLEMENTED_PENDING_ACCEPTANCE",
    offlineExceptionDisposition:
      "ACCEPTED_OFFLINE_WITH_DOCUMENTED_RESIDUAL_RISKS",
    liveAuthorizationFromChecker: false,
    separateOwnerGrantValidated: Boolean(grant),
    ...(mode === "authorize" ? { expiresAtUtc: grant!.expiresAt } : {}),
  };
  if (mode === "finish")
    await exclusive(
      join(output!, "package-final.sanitized.json"),
      Buffer.from(JSON.stringify(receipt, null, 2) + "\n"),
    );
  console.log(JSON.stringify(receipt));
} catch (error) {
  console.error(
    JSON.stringify({
      status: "NOT_VERIFIED",
      classification:
        error instanceof PackageError
          ? error.classification
          : "package_validation_failed",
      databaseConnections: 0,
      providerRequests: 0,
      authWrites: 0,
    }),
  );
  process.exitCode = 1;
}
