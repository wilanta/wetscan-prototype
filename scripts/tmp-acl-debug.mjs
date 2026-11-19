// TEMPORARY CI diagnostic (removed before merge): candidate ACL hardening + faster verification on a hosted Windows runner.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const ex = promisify(execFile);
const os = process.env.SystemRoot;
const sys = join(os, "System32");
const env = { NODE_ENV: "production", SystemRoot: os, WINDIR: os, TEMP: tmpdir(), TMP: tmpdir() };
const t = async (label, f) => {
  const s = Date.now();
  try {
    const r = await f();
    console.log(label, "OK", Date.now() - s, "ms", JSON.stringify(r).slice(0, 700));
    return r;
  } catch (e) {
    console.log(label, "ERR", Date.now() - s, "ms", e.code, "killed=" + e.killed, JSON.stringify(String(e.stderr || e.message)).slice(0, 500));
  }
};
const ps = join(sys, "WindowsPowerShell/v1.0/powershell.exe");
const run = (cmd, e = env) => ex(ps, ["-NoProfile", "-NonInteractive", "-Command", cmd], { env: e, windowsHide: true, timeout: 90000 }).then((r) => r.stdout.trim());
const who = await ex(join(sys, "whoami.exe"), ["/user", "/fo", "csv", "/nh"], { env, windowsHide: true }).then((r) => r.stdout);
const sid = who.match(/S-\d+(?:-\d+)+/)[0];
const dir = await mkdtemp(join(tmpdir(), "wetscan-g01-snapshot-dbg-"));
const icacls = (args) => ex(join(sys, "icacls.exe"), [dir, ...args], { env, windowsHide: true, timeout: 60000 }).then((r) => r.stdout.trim().split("\n")[0]);
console.log("tmpdir", tmpdir(), "sid", sid);
await t("icacls inheritance+grant", () => icacls(["/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`, "*S-1-5-18:(OI)(CI)F"]));
await t("icacls setowner user", () => icacls(["/setowner", `*${sid}`]));
await t("icacls remove Administrators", () => icacls(["/remove:g", "*S-1-5-32-544"]));
const fmt = `[pscustomobject]@{owner=$a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;protected=$a.AreAccessRulesProtected;rules=@($a.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]) | ForEach-Object {[pscustomobject]@{sid=$_.IdentityReference.Value;inherited=$_.IsInherited;type=[string]$_.AccessControlType;rights=[int]$_.FileSystemRights;inheritance=[int]$_.InheritanceFlags;propagation=[int]$_.PropagationFlags}})} | ConvertTo-Json -Depth 4 -Compress`;
const pure = (dir) => `$a=[System.IO.DirectoryInfo]::new('${dir}').GetAccessControl();$j='{"owner":"'+$a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value+'","protected":'+$a.AreAccessRulesProtected.ToString().ToLower()+',"rules":[';$f=$true;foreach($r in $a.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])){if(-not $f){$j+=','};$f=$false;$j+='{"sid":"'+$r.IdentityReference.Value+'","inherited":'+$r.IsInherited.ToString().ToLower()+',"type":"'+[string]$r.AccessControlType+'","rights":'+[int]$r.FileSystemRights+',"inheritance":'+[int]$r.InheritanceFlags+',"propagation":'+[int]$r.PropagationFlags+'}'};$j+=']}';[Console]::Out.Write($j)`;
await t("baseline powershell startup (minimal env)", () => run("1"));
for (const n of [1, 2, 3]) await t("C pure-language .NET run " + n, () => run(pure(dir)));
