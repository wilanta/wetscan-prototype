// TEMPORARY CI diagnostic (removed before merge): timings and outputs of the ACL steps used by secureSnapshotDirectory.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const ex = promisify(execFile);
const os = process.env.SystemRoot;
const env = { NODE_ENV: "production", SystemRoot: os, WINDIR: os, TEMP: tmpdir(), TMP: tmpdir() };
const t = async (label, f) => {
  const s = Date.now();
  try {
    const r = await f();
    console.log(label, "OK", Date.now() - s, "ms", JSON.stringify(r).slice(0, 600));
    return r;
  } catch (e) {
    console.log(label, "ERR", Date.now() - s, "ms", e.code, "killed=" + e.killed, e.signal, JSON.stringify(String(e.stderr || e.message)).slice(0, 600));
  }
};
console.log("tmpdir", tmpdir(), "SystemRoot", os, "user", process.env.USERNAME);
const dir = await mkdtemp(join(tmpdir(), "wetscan-g01-snapshot-dbg-"));
const who = await t("whoami", () => ex(join(os, "System32/whoami.exe"), ["/user", "/fo", "csv", "/nh"], { env, windowsHide: true, timeout: 30000 }).then((r) => r.stdout));
const sid = who && who.match(/S-\d+(?:-\d+)+/)?.[0];
await t("icacls", () => ex(join(os, "System32/icacls.exe"), [dir, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`, "*S-1-5-18:(OI)(CI)F"], { env, windowsHide: true, timeout: 30000 }).then((r) => r.stdout));
const ps = join(os, "System32/WindowsPowerShell/v1.0/powershell.exe");
const cmd = `$a=Get-Acl -LiteralPath '${dir}'; [pscustomobject]@{owner=$a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;protected=$a.AreAccessRulesProtected;rules=@($a.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]) | ForEach-Object {[pscustomobject]@{sid=$_.IdentityReference.Value;inherited=$_.IsInherited;type=[string]$_.AccessControlType;rights=[int]$_.FileSystemRights;inheritance=[int]$_.InheritanceFlags;propagation=[int]$_.PropagationFlags}})} | ConvertTo-Json -Depth 4 -Compress`;
for (const n of [1, 2]) await t("get-acl minimal-env run " + n, () => ex(ps, ["-NoProfile", "-NonInteractive", "-Command", cmd], { env, windowsHide: true, timeout: 60000 }).then((r) => r.stdout));
await t("get-acl full-env", () => ex(ps, ["-NoProfile", "-NonInteractive", "-Command", cmd], { windowsHide: true, timeout: 60000 }).then((r) => r.stdout));
console.log("expected owner sid", sid);
