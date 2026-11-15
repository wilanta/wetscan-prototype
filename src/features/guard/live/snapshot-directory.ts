import { promisify } from "node:util";
import { lstat, readdir, realpath, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { LiveGuardError } from "./model";
interface DirectoryAcl {
  owner: string;
  protected: boolean;
  rules: {
    sid: string;
    inherited: boolean;
    type: string;
    rights: number;
    inheritance: number;
    propagation: number;
  }[];
}
/** Fixed filesystem descriptor check; neither chmod nor a ready flag proves Windows isolation. */
export function verifiedSnapshotAcl(value: unknown, owner: string): boolean {
  const a = value as DirectoryAcl;
  return (
    !!a &&
    a.owner === owner &&
    a.protected === true &&
    Array.isArray(a.rules) &&
    a.rules.length === 2 &&
    a.rules.every((r) => r && typeof r === "object") &&
    new Set(a.rules.map((r) => r.sid)).size === 2 &&
    a.rules.every(
      (r) =>
        [owner, "S-1-5-18"].includes(r.sid) &&
        r.inherited === false &&
        r.type === "Allow" &&
        r.rights === 2032127 &&
        r.inheritance === 3 &&
        r.propagation === 0,
    )
  );
}
let identity: Promise<string> | undefined;
/** Only newly created EMPTY owned roots directly under OS temp, before the first source file is written. */
export async function secureSnapshotDirectory(root: string): Promise<void> {
  try {
    const same = (a: string, b: string) =>
      process.platform === "win32"
        ? a.toLowerCase() === b.toLowerCase()
        : a === b;
    const actual = await realpath(root),
      parent = await realpath(tmpdir()),
      entry = await lstat(root);
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      !same(dirname(actual), parent) ||
      !/^wetscan-g01-snapshot-[A-Za-z0-9_-]+$/.test(basename(actual)) ||
      (await readdir(actual)).length
    )
      throw Error();
    if (process.platform !== "win32") {
      await chmod(actual, 0o700);
      const checked = await lstat(actual);
      if (
        (checked.mode & 0o777) !== 0o700 ||
        (process.getuid && checked.uid !== process.getuid())
      )
        throw Error();
      return;
    }
    const execute = promisify((await import("node:child_process")).execFile);
    const os = process.env.SystemRoot;
    if (!os) throw Error();
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "production",
      SystemRoot: os,
      WINDIR: os,
      TEMP: tmpdir(),
      TMP: tmpdir(),
    };
    const options = {
      env,
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 16384,
      encoding: "utf8" as const,
    };
    if (!identity) {
      identity = execute(
        join(os, "System32/whoami.exe"),
        ["/user", "/fo", "csv", "/nh"],
        options,
      )
        .then((result) => {
          const sid = result.stdout.match(/S-\d+(?:-\d+)+/)?.[0];
          if (!sid || sid === "S-1-5-18") throw Error();
          return sid;
        })
        .catch((error) => {
          identity = undefined;
          throw error;
        });
    }
    const sid = await identity;
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
    const literal = "'" + actual.replaceAll("'", "''") + "'";
    const command = `$a=Get-Acl -LiteralPath ${literal}; [pscustomobject]@{owner=$a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;protected=$a.AreAccessRulesProtected;rules=@($a.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]) | ForEach-Object {[pscustomobject]@{sid=$_.IdentityReference.Value;inherited=$_.IsInherited;type=[string]$_.AccessControlType;rights=[int]$_.FileSystemRights;inheritance=[int]$_.InheritanceFlags;propagation=[int]$_.PropagationFlags}})} | ConvertTo-Json -Depth 4 -Compress`;
    const result = await execute(
      join(os, "System32/WindowsPowerShell/v1.0/powershell.exe"),
      ["-NoProfile", "-NonInteractive", "-Command", command],
      options,
    );
    if (!verifiedSnapshotAcl(JSON.parse(result.stdout), sid)) throw Error();
  } catch {
    // Never forward OS command/environment/identity details or use an insecure fallback.
    throw new LiveGuardError("source_unavailable");
  }
}
