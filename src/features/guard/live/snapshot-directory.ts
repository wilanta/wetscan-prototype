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
/**
 * Reads owner, protection and explicit ACEs of a directory as JSON. Language constructs and .NET only: no
 * Get-Acl/ForEach-Object/ConvertTo-Json, whose module autoload took 20-37 s with a minimal environment on a hosted
 * runner (0.3 s this way). `literal` is an already single-quoted PowerShell literal.
 */
export const aclInspectionScript = (literal: string) =>
  `$a=[System.IO.DirectoryInfo]::new(${literal}).GetAccessControl();$j='{"owner":"'+$a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value+'","protected":'+$a.AreAccessRulesProtected.ToString().ToLower()+',"rules":[';$f=$true;foreach($r in $a.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])){if(-not $f){$j+=','};$f=$false;$j+='{"sid":"'+$r.IdentityReference.Value+'","inherited":'+$r.IsInherited.ToString().ToLower()+',"type":"'+[string]$r.AccessControlType+'","rights":'+[int]$r.FileSystemRights+',"inheritance":'+[int]$r.InheritanceFlags+',"propagation":'+[int]$r.PropagationFlags+'}'};$j+=']}';[Console]::Out.Write($j)`;
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
      timeout: 20000,
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
    // An elevated administrator token creates the directory owned by BUILTIN\Administrators with an explicit
    // Administrators ACE (its default owner/DACL). Make the verified owner the user and drop that ACE so the exact
    // owner + SYSTEM invariant below is reachable for elevated accounts too (hosted CI runs elevated). Both are no-ops
    // when already true.
    await execute(
      join(os, "System32/icacls.exe"),
      [actual, "/setowner", `*${sid}`],
      options,
    );
    await execute(
      join(os, "System32/icacls.exe"),
      [actual, "/remove:g", "*S-1-5-32-544"],
      options,
    );
    const literal = "'" + actual.replaceAll("'", "''") + "'";
    // Language constructs and .NET only: no Get-Acl/ForEach-Object/ConvertTo-Json, whose module autoload took 20-37 s
    // with this minimal environment on a hosted runner (0.3 s this way). Output is the same JSON shape as before.
    const command = aclInspectionScript(literal);
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
