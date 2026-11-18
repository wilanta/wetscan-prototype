import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  exclusiveJson,
  exclusiveText,
  privatePath,
  assertNoAmbientCredentials,
} from "../../scripts/sentinel-provision-owner";
import { validateProvisionApprovals } from "../../scripts/sentinel-provision-safety";
import { s04DevBaseline, s04DevTarget } from "./dev-acceptance-safety";

const exec = promisify(execFile),
  quote = (v: string) => "'" + v.replaceAll("'", "''") + "'";
const common = resolve("scripts/sentinel-provision-common.ps1"),
  runner = resolve("scripts/Invoke-H04CB2ProvisionAndIngest.ps1");
async function ps(code: string) {
  const r = await exec(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$ErrorActionPreference='Stop'; . ${quote(common)}; ${code}`,
    ],
    { timeout: 15000, windowsHide: true },
  );
  return r.stdout.trim();
}
it.each(["APP", "MIGRATION", "WORKER", "BOOTSTRAP", "TEST"])(
  "rejects ambient %s credentials before the web process can inherit dotenv pollution",
  (role) => {
    expect(() =>
      assertNoAmbientCredentials({
        [`SENTINEL_DB_${role}_PASSWORD_FILE`]: "FIXTURE_NOT_A_CREDENTIAL_FILE",
      }),
    ).toThrow("dotenv_credentials");
  },
);

it("imports the controller in native Node ESM without executing a phase", async () => {
  const r = await exec(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      "const m=await import('./scripts/sentinel-provision-owner.ts'); console.log(JSON.stringify({imported:typeof m.provisionOffline==='function'}));",
    ],
    { timeout: 15000, windowsHide: true },
  );
  expect(JSON.parse(r.stdout)).toEqual({ imported: true });
}, 20000);
describe.skipIf(process.platform !== "win32")(
  "owner runner private-file and cleanup primitives (temporary fixtures only)",
  { timeout: 20000 },
  () => {
    let root: string,
      seq = 0;
    async function directory() {
      const path = join(root, `private-${seq++}`);
      await ps(`New-ProvisionPrivateDirectory ${quote(path)}`);
      return path;
    }
    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), "wetscan-provision-files-"));
    });
    afterAll(async () => {
      const target = resolve(root);
      if (
        !basename(target).startsWith("wetscan-provision-files-") ||
        relative(resolve(tmpdir()), target).startsWith("..")
      )
        throw new Error("fixture_cleanup");
      await rm(target, { recursive: true, force: true });
    });
    it("creates a protected ACL containing only owner and SYSTEM", async () => {
      const dir = await directory();
      expect(
        JSON.parse(
          await ps(
            `Assert-ProvisionPrivateDirectory ${quote(dir)}; (Get-Acl -LiteralPath ${quote(dir)}).AreAccessRulesProtected | ConvertTo-Json`,
          ),
        ),
      ).toBe(true);
    });
    it("PowerShell approval timestamps round-trip through the exact phase validator", async () => {
      const dates = JSON.parse(
        await ps(
          "$stamp=[DateTime]::UtcNow; @{approvedAt=(Format-ProvisionUtc $stamp);expiresAt=(Format-ProvisionUtc ($stamp.AddMinutes(10)))} | ConvertTo-Json -Compress",
        ),
      );
      const approval = {
        schemaVersion: 1,
        status: "APPROVED",
        approvedBy: "in-memory-fixture-only",
        approvedAt: dates.approvedAt,
        target: s04DevTarget,
        actions: ["runtime"],
        migrationPlanSha256: s04DevBaseline.planSha256,
        h04cB2: { phase: "provision-ingest", expiresAt: dates.expiresAt },
      };
      expect(() =>
        validateProvisionApprovals([approval, structuredClone(approval)]),
      ).not.toThrow();
      expect(dates.expiresAt).toMatch(/\.\d{3}Z$/);
    });
    it("exclusive-create preserves an existing artifact byte-for-byte", async () => {
      const dir = await directory(),
        path = join(dir, "fixture.json");
      await exclusiveJson(path, { fixture: "first" });
      const before = await readFile(path, "utf8");
      await expect(
        exclusiveJson(path, { fixture: "second" }),
      ).rejects.toThrow();
      expect(await readFile(path, "utf8")).toBe(before);
    });
    it("keeps a synthetic credential in its sole secret file and never overwrites it", async () => {
      const dir = await directory(),
        path = join(dir, "credential.secret");
      await exclusiveText(path, "FIXTURE_ONLY_NOT_A_VALID_BEARER\n");
      await expect(exclusiveText(path, "REPLACEMENT")).rejects.toThrow();
      expect((await readFile(path, "utf8")).trim()).toBe(
        "FIXTURE_ONLY_NOT_A_VALID_BEARER",
      );
    });
    it("rejects inherited ACLs instead of treating chmod as Windows privacy", async () => {
      await expect(
        exclusiveJson(join(root, "public.json"), {}),
      ).rejects.toThrow("private_acl");
    });
    it.each([
      "C:/Users/fixture/OneDrive/private/new/file.json",
      "C:/Users/fixture/OneDrive - Example/private/file.json",
      join(process.cwd(), "private.json"),
    ])("rejects private path %s", async (path) => {
      await expect(privatePath(path)).rejects.toThrow("private_path");
    });
    it("closes the second approval even if the first closure fails", async () => {
      const dir = await directory();
      await writeFile(
        join(dir, "web-runtime-approval.json"),
        "invalid fixture JSON",
      );
      await exclusiveJson(join(dir, "controller-runtime-approval.json"), {
        status: "FIXTURE_ONLY",
        actions: ["fixture"],
        h04cB2: { phase: "provision-ingest" },
      });
      const response = await ps(
        `try { Close-ProvisionApprovals ${quote(dir)} } catch { }; $a=Get-Content -LiteralPath ${quote(join(dir, "controller-runtime-approval.json"))} -Raw | ConvertFrom-Json; @{status=$a.status;actions=$a.actions.Count} | ConvertTo-Json -Compress`,
      );
      expect(JSON.parse(response)).toEqual({ status: "CLOSED", actions: 0 });
    });
    it("approval closure still executes when owned-process cleanup throws", async () => {
      const dir = await directory();
      for (const name of [
        "web-runtime-approval.json",
        "controller-runtime-approval.json",
      ])
        await exclusiveJson(join(dir, name), {
          status: "FIXTURE_ONLY",
          actions: ["fixture"],
          h04cB2: { phase: "provision-ingest" },
        });
      const out = await ps(
        `function Stop-ProvisionOwnedProcesses { throw 'fixture_process_cleanup_failure' }; try { try { Stop-ProvisionOwnedProcesses ${quote(dir)} } finally { Close-ProvisionApprovals ${quote(dir)} } } catch { }; $a=@(Get-ChildItem -LiteralPath ${quote(dir)} -Filter '*approval.json' | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json }); @{closed=@($a | Where-Object {$_.status -eq 'CLOSED' -and $_.actions.Count -eq 0}).Count} | ConvertTo-Json -Compress`,
      );
      expect(JSON.parse(out).closed).toBe(2);
    });
    it("deadline sidecar independently revokes fixture approvals with no process to kill", async () => {
      const dir = join(root, `deadline-${seq++}`);
      const fixture = JSON.stringify({
        status: "FIXTURE_ONLY",
        actions: ["fixture"],
        h04cB2: { phase: "provision-ingest" },
      });
      await ps(
        `New-ProvisionPrivateDirectory ${quote(dir)}; foreach($name in @('web-runtime-approval.json','controller-runtime-approval.json')) { Write-ProvisionExclusive (Join-Path ${quote(dir)} $name) ${quote(fixture)} }; Write-ProvisionExclusive ${quote(join(dir, "owned-processes.jsonl"))} ''; & ${quote(resolve("scripts/sentinel-provision-watchdog.ps1"))} -OutputDir ${quote(dir)} -DeadlineUtc '2020-01-01T00:00:00Z'`,
      );
      const report = JSON.parse(
        await readFile(join(dir, "deadline-expired.json"), "utf8"),
      );
      expect(report.reason).toBe("deadline_expired");
      for (const name of [
        "web-runtime-approval.json",
        "controller-runtime-approval.json",
      ])
        expect(
          JSON.parse(await readFile(join(dir, name), "utf8")).actions,
        ).toEqual([]);
    });
    it("refuses PID reuse: a mismatched start time never authorizes process termination", async () => {
      const dir = await directory();
      await ps(
        `[IO.File]::WriteAllText(${quote(join(dir, "owned-processes.jsonl"))}, ('{"pid":' + $PID + ',"startTicks":"0"}')); Stop-ProvisionOwnedProcesses ${quote(dir)}; @{survived=$true} | ConvertTo-Json -Compress`,
      ).then((out) => expect(JSON.parse(out).survived).toBe(true));
    });
    it("normal watchdog independently closes both unusable fixture approvals before reporting completion", async () => {
      const dir = await directory();
      const fixture = JSON.stringify({
        status: "FIXTURE_ONLY",
        actions: ["invalid-fixture"],
        h04cB2: {
          phase: "provision-ingest",
          expiresAt: "2020-01-01T00:00:00Z",
        },
      });
      await ps(
        `foreach($name in @('web-runtime-approval.json','controller-runtime-approval.json')) { Write-ProvisionExclusive (Join-Path ${quote(dir)} $name) ${quote(fixture)} }; Write-ProvisionExclusive ${quote(join(dir, "owned-processes.jsonl"))} ''; Write-ProvisionExclusive ${quote(join(dir, "runner-finished.json"))} '{"status":"PASS"}'; $deadline=Format-ProvisionUtc ([DateTime]::UtcNow.AddSeconds(30)); Write-ProvisionReceipt ${quote(join(dir, "controller-cleanup-complete.json"))} @{outputDirectory=${quote(dir)};deadlineUtc=$deadline;cleanupErrors=@()}; & ${quote(resolve("scripts/sentinel-provision-watchdog.ps1"))} -OutputDir ${quote(dir)} -DeadlineUtc $deadline; Assert-ProvisionWatchdogCleanup ${quote(dir)} $deadline 0`,
      );
      for (const name of [
        "web-runtime-approval.json",
        "controller-runtime-approval.json",
      ]) {
        expect(
          JSON.parse(await readFile(join(dir, name), "utf8")),
        ).toMatchObject({ status: "CLOSED", actions: [] });
      }
    });
    async function closedFixture() {
      const dir = await directory();
      const fixture = JSON.stringify({
        status: "FIXTURE_ONLY",
        actions: ["invalid-fixture"],
        h04cB2: {
          phase: "provision-ingest",
          expiresAt: "2020-01-01T00:00:00Z",
        },
      });
      await ps(
        `foreach($name in @('web-runtime-approval.json','controller-runtime-approval.json')) { Write-ProvisionExclusive (Join-Path ${quote(dir)} $name) ${quote(fixture)} }; Write-ProvisionExclusive ${quote(join(dir, "owned-processes.jsonl"))} ''; Close-ProvisionApprovals ${quote(dir)}; Assert-ProvisionApprovalsClosed ${quote(dir)}`,
      );
      return dir;
    }
    it("retains native handles and propagates zero/nonzero child exits", async () => {
      const answer = JSON.parse(
        await ps(
          `$r=@(); foreach($code in @(0,7)){ $p=Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-NonInteractive','-Command',('"Start-Sleep -Milliseconds 100; exit '+$code+'"')) -PassThru -WindowStyle Hidden; $null=$p.Handle; while(-not $p.HasExited){Start-Sleep -Milliseconds 25;$p.Refresh()}; $r+=@{expected=$code;observed=(Get-ProvisionExitCode $p)};$p.Dispose()}; ConvertTo-Json -InputObject $r -Compress`,
        ),
      );
      expect(answer).toEqual([
        { expected: 0, observed: 0 },
        { expected: 7, observed: 7 },
      ]);
      expect(
        await ps(
          `$p=[pscustomobject]@{HasExited=$true;ExitCode=$null};$p | Add-Member ScriptMethod WaitForExit {};try{Get-ProvisionExitCode $p}catch{$_.Exception.Message}`,
        ),
      ).toBe("process_exit_unverified");
    });
    it("normal second closure preserves both closedAt values and receipt bytes", async () => {
      const dir = await closedFixture();
      const names = [
        "web-runtime-approval.json",
        "controller-runtime-approval.json",
        "web-runtime-approval.json.closure.sanitized.json",
        "controller-runtime-approval.json.closure.sanitized.json",
      ];
      const before = await Promise.all(
        names.map((n) => readFile(join(dir, n), "utf8")),
      );
      expect(
        JSON.parse(
          await ps(
            `ConvertTo-Json -InputObject @(Complete-ProvisionCleanup ${quote(dir)}) -Compress`,
          ),
        ),
      ).toEqual([]);
      expect(
        await Promise.all(names.map((n) => readFile(join(dir, n), "utf8"))),
      ).toEqual(before);
    });
    it.each(["$null", "7", "'0'"])(
      "watchdog exit %s cannot satisfy final cleanup",
      async (code) => {
        const dir = await closedFixture();
        await expect(
          ps(
            `Assert-ProvisionWatchdogCleanup ${quote(dir)} '2020-01-01T00:00:00Z' ${code}`,
          ),
        ).rejects.toThrow();
      },
    );
    it("missing, failed and stale watchdog receipts cannot satisfy final cleanup", async () => {
      const dir = await closedFixture();
      const path = join(dir, "watchdog-cleanup.sanitized.json");
      await expect(
        ps(
          `Assert-ProvisionWatchdogCleanup ${quote(dir)} '2020-01-01T00:00:00Z' 0`,
        ),
      ).rejects.toThrow();
      for (const r of [
        {
          status: "NOT_VERIFIED",
          outputDirectory: dir,
          deadlineUtc: "2020-01-01T00:00:00Z",
          cleanupErrors: ["approval_closure_failed"],
        },
        {
          status: "CLEANUP_COMPLETE",
          outputDirectory: root,
          deadlineUtc: "2020-01-01T00:00:00Z",
          cleanupErrors: [],
        },
        {
          status: "CLEANUP_COMPLETE",
          outputDirectory: dir,
          deadlineUtc: "2020-01-02T00:00:00Z",
          cleanupErrors: [],
        },
      ]) {
        await writeFile(path, JSON.stringify(r));
        await expect(
          ps(
            `Assert-ProvisionWatchdogCleanup ${quote(dir)} '2020-01-01T00:00:00Z' 0`,
          ),
        ).rejects.toThrow();
      }
    });
    it("incorrect closure hash prevents handoff acceptance", async () => {
      const dir = await closedFixture();
      const path = join(
        dir,
        "web-runtime-approval.json.closure.sanitized.json",
      );
      const r = JSON.parse(await readFile(path, "utf8"));
      await writeFile(
        path,
        JSON.stringify({ ...r, afterSha256: "0".repeat(64) }),
      );
      await expect(
        ps(`Assert-ProvisionApprovalsClosed ${quote(dir)}`),
      ).rejects.toThrow();
    });
    it("concurrent normal closures serialize without replacing historical closure evidence", async () => {
      const dir = await closedFixture();
      await Promise.all([
        ps(`Close-ProvisionApprovals ${quote(dir)}`),
        ps(`Close-ProvisionApprovals ${quote(dir)}`),
      ]);
      await ps(`Assert-ProvisionApprovalsClosed ${quote(dir)}`);
    });
    it("the final receipt is published only after watchdog cleanup verification", async () => {
      const source = await readFile(runner, "utf8");
      expect(
        source.indexOf("Assert-ProvisionWatchdogCleanup $output"),
      ).toBeLessThan(
        source.indexOf(
          "Write-ProvisionReceipt (Join-Path $output 'runner-finished.json')",
        ),
      );
      expect(source).toContain("$null = $proc.Handle");
      expect(source).toContain("$null = $watchdog.Handle");
    });
    it("default runner returns before all live operations (mocked offline diagnostic only)", async () => {
      const planned = join(root, "must-not-be-created");
      const out = await ps(
        `function node { $global:LASTEXITCODE=0; if ($args -contains 'approvals-check') { '{"status":"CLOSED","databaseConnections":0,"executionPerformed":false}' } else { '{"status":"OFFLINE_READY","databaseConnections":0,"executionPerformed":false}' } }; & ${quote(runner)} -OutputDir ${quote(planned)}`,
      );
      expect(JSON.parse(out).executionPerformed).toBe(false);
      await expect(
        readFile(join(planned, "web-runtime-approval.json")),
      ).rejects.toThrow();
    });
    it("an unresolved history check stops even an opted-in runner before offline/live creation", async () => {
      const planned = join(root, "blocked-must-not-be-created");
      const out = await ps(
        `$global:offlineCalled=$false; function node { if ($args -contains 'approvals-check') { $global:LASTEXITCODE=1; return } else { $global:offlineCalled=$true; throw 'unexpected_offline_or_live' } }; try { & ${quote(runner)} -ExecuteLive -OutputDir ${quote(planned)} } catch { }; @{offlineCalled=$global:offlineCalled;created=(Test-Path -LiteralPath ${quote(planned)})} | ConvertTo-Json -Compress`,
      );
      expect(JSON.parse(out)).toEqual({ offlineCalled: false, created: false });
    });
  },
);
