// Mandatory shared live boundary. No caller-supplied guard or bypass switch.
import { execFile } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  demand,
  PackageError,
  parseObject,
} from "./sentinel-provision-package";

const repo = fileURLToPath(new URL("..", import.meta.url));
const prefix = "SENTINEL_PROVISION_PACKAGE_";
const keys = [
  "MANIFEST",
  "SHA",
  "COOKIE",
  "GRANT",
  "GRANT_SHA",
  "OUTPUT",
  "OWNER",
];

export async function assertProvisionPackageBoundary(): Promise<void> {
  const context: Record<string, string> = {};
  for (const key of Object.keys(process.env).filter((k) =>
    k.startsWith(prefix),
  ))
    demand(keys.includes(key.slice(prefix.length)), "package_context_unknown");
  for (const key of keys) {
    const value = process.env[prefix + key];
    demand(value, "package_context_missing");
    context[key] = value;
  }
  demand(resolve(process.cwd()) === resolve(repo), "package_workspace");
  const args: Record<string, string> = {};
  const invocation = process.argv.slice(3);
  for (const arg of invocation) {
    const match =
      /^--(pre-recovery|containment|cookie-file|app-password-file|migration-password-file|artifact-dir|origin|resume-from)=(.+)$/.exec(
        arg,
      );
    demand(match && !Object.hasOwn(args, match[1]), "package_cli_scope");
    args[match[1]] = match[2];
  }
  demand(
    args["cookie-file"] &&
      args["artifact-dir"] &&
      resolve(args["cookie-file"]) === resolve(context.COOKIE) &&
      resolve(args["artifact-dir"]) === resolve(context.OUTPUT) &&
      args.origin === "http://localhost:3000",
    "package_cli_binding",
  );
  const checkerArgs = [
    "--import",
    "tsx",
    join(repo, "scripts/sentinel-provision-package-check.ts"),
    "check",
  ];
  for (const key of keys)
    checkerArgs.push(
      "--" + key.toLowerCase().replaceAll("_", "-") + "=" + context[key],
    );
  const stdout = await new Promise<string>((accept, reject) => {
    execFile(
      process.execPath,
      checkerArgs,
      {
        cwd: repo,
        windowsHide: true,
        timeout: 120000,
        maxBuffer: 16384,
        encoding: "utf8",
      },
      (error, output) => {
        if (error) reject(new PackageError("package_boundary_failed"));
        else accept(output);
      },
    );
  });
  // Never trust a stale, default-off or partial-success receipt as live authority.
  const receipt = parseObject(Buffer.from(stdout));
  demand(
    receipt.status === "PACKAGE_BOUNDARY_PASS" &&
      receipt.mode === "check" &&
      receipt.manifestSha256 === context.SHA &&
      receipt.separateOwnerGrantValidated === true &&
      receipt.historicalAuthPreserved === true &&
      receipt.archiveOnlyRecords === 1 &&
      receipt.completeHistoricalActiveFilePreservation === false &&
      receipt.semanticContentsUnchanged === true &&
      Number(receipt.tokenMinutesRemaining) >= 30 &&
      receipt.databaseConnections === 0 &&
      receipt.providerRequests === 0 &&
      receipt.authWrites === 0 &&
      receipt.liveAuthorizationFromChecker === false,
    "package_boundary_receipt",
  );
  demand(
    keys.every((key) => process.env[prefix + key] === context[key]),
    "package_context_drift",
  );
  demand(
    JSON.stringify(process.argv.slice(3)) === JSON.stringify(invocation),
    "package_cli_drift",
  );
}
