import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdir, lstat, realpath, readdir, chmod } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { verifiedSnapshotAcl } from "../../../src/features/guard/live/snapshot-directory";
import { LiveGuardError } from "../../../src/features/guard/live/model";
const execute = promisify(execFile);
export function acceptancePrivateRoot() {
  return resolve(".local/sentinel/guard-g01-unblock/remaining-v2");
}
/** Only this fixed new case-registry directory; never chmod a populated existing folder or source. */
export async function privateAcceptanceRoot(create = false) {
  const root = acceptancePrivateRoot(),
    workspace = await realpath(process.cwd());
  let made = false;
  if (create) {
    try {
      await mkdir(root, { mode: 0o700 });
      made = true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST")
        throw new LiveGuardError("not_configured");
    }
  }
  const actual = await realpath(root),
    stat = await lstat(root);
  if (
    stat.isSymbolicLink() ||
    !stat.isDirectory() ||
    !actual.toLowerCase().startsWith((workspace + sep).toLowerCase()) ||
    actual.toLowerCase() !== root.toLowerCase()
  )
    throw new LiveGuardError("approval_required");
  if (process.platform !== "win32") {
    if (made) await chmod(actual, 0o700);
    const s = await lstat(actual);
    if (
      (s.mode & 0o777) !== 0o700 ||
      (process.getuid && s.uid !== process.getuid())
    )
      throw new LiveGuardError("approval_required");
    return actual;
  }
  const os = process.env.SystemRoot;
  if (!os) throw new LiveGuardError("not_configured");
  const env: NodeJS.ProcessEnv = {
      NODE_ENV: "production",
      SystemRoot: os,
      WINDIR: os,
    },
    options = {
      env,
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 16384,
      encoding: "utf8" as const,
    };
  const sid = (
    await execute(
      join(os, "System32/whoami.exe"),
      ["/user", "/fo", "csv", "/nh"],
      options,
    )
  ).stdout.match(/S-\d+(?:-\d+)+/)?.[0];
  if (!sid || sid === "S-1-5-18") throw new LiveGuardError("approval_required");
  if (made) {
    if ((await readdir(actual)).length)
      throw new LiveGuardError("approval_required");
    await execute(
      join(os, "System32/icacls.exe"),
      [
        actual,
        "/inheritance:r",
        "/grant:r",
        `*${sid}:(OI)(CI)F`,
        "*S-1-5-18:(OI)(CI)F",
      ],
      options,
    );
  }
  const literal = "'" + actual.replaceAll("'", "''") + "'",
    command = `$a=Get-Acl -LiteralPath ${literal}; [pscustomobject]@{owner=$a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;protected=$a.AreAccessRulesProtected;rules=@($a.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]) | ForEach-Object {[pscustomobject]@{sid=$_.IdentityReference.Value;inherited=$_.IsInherited;type=[string]$_.AccessControlType;rights=[int]$_.FileSystemRights;inheritance=[int]$_.InheritanceFlags;propagation=[int]$_.PropagationFlags}})} | ConvertTo-Json -Depth 4 -Compress`;
  const acl = JSON.parse(
    (
      await execute(
        join(os, "System32/WindowsPowerShell/v1.0/powershell.exe"),
        ["-NoProfile", "-NonInteractive", "-Command", command],
        options,
      )
    ).stdout,
  );
  if (!verifiedSnapshotAcl(acl, sid))
    throw new LiveGuardError("approval_required");
  return actual;
}
