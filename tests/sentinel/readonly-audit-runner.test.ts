import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, relative } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const exec = promisify(execFile),
  quote = (v: string) => "'" + v.replaceAll("'", "''") + "'";
const common = resolve("scripts/sentinel-readonly-audit-common.ps1"),
  runner = resolve("scripts/Invoke-S04ReadOnlyAudit.ps1");
async function ps(code: string) {
  return (
    await exec(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$ErrorActionPreference='Stop'; . ${quote(common)}; ${code}`,
      ],
      { timeout: 20000, windowsHide: true },
    )
  ).stdout.trim();
}
describe.skipIf(process.platform !== "win32")(
  "read-only owner runner, expired unusable fixtures only",
  { timeout: 25000 },
  () => {
    let root: string,
      seq = 0;
    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), "wetscan-readonly-audit-"));
    });
    afterAll(async () => {
      if (
        !basename(root).startsWith("wetscan-readonly-audit-") ||
        relative(resolve(tmpdir()), resolve(root)).startsWith("..")
      )
        throw Error("fixture_cleanup");
      await rm(root, { recursive: true, force: true });
    });
    const runId = "a".repeat(32);
    async function expiredFixture(malformed = false) {
      const directory = join(root, `case-${seq++}`),
        authorization = join(directory, "dev-readonly-audit-approval.json");
      // Expired since 2020; never capable of authorizing a live audit.
      const value = {
        schemaVersion: 1,
        kind: "wetscan-s04-dev-preservation-audit",
        phase: "preservation-audit",
        status: "APPROVED",
        actions: ["read_only_audit"],
        runId,
        outputDirectory: directory,
        approvedBy: "EXPIRED_OFFLINE_FIXTURE",
        approvedAt: "2020-01-01T00:00:00.000Z",
        expiresAt: "2020-01-01T00:02:00.000Z",
      };
      await ps(
        `New-ProvisionPrivateDirectory ${quote(directory)}; Write-ProvisionExclusive ${quote(authorization)} ${quote(malformed ? "invalid fixture JSON" : JSON.stringify(value))}; Write-ProvisionExclusive ${quote(join(directory, "owned-processes.jsonl"))} ''`,
      );
      return { directory, authorization, value };
    }
    it("default-off returns without a directory, approval, process or connection", async () => {
      const planned = join(root, "default-must-not-exist");
      const answer = await ps(
        `function node { $global:LASTEXITCODE=0; '{"status":"OFFLINE_READY","databaseConnections":0,"executionPerformed":false}' }; & ${quote(runner)} -OutputDir ${quote(planned)}`,
      );
      expect(JSON.parse(answer)).toMatchObject({
        databaseConnections: 0,
        executionPerformed: false,
      });
      await expect(
        readFile(join(planned, "dev-readonly-audit-approval.json")),
      ).rejects.toThrow();
    });
    it("refuses ExecuteLive without exact separate owner scope before creating anything", async () => {
      const planned = join(root, "unauthorized-must-not-exist");
      const answer = await ps(
        `function node { $global:LASTEXITCODE=0; '{"status":"OFFLINE_READY","databaseConnections":0,"executionPerformed":false}' }; try { & ${quote(runner)} -ExecuteLive -OutputDir ${quote(planned)} } catch { }; @{created=(Test-Path -LiteralPath ${quote(planned)})} | ConvertTo-Json -Compress`,
      );
      expect(JSON.parse(answer).created).toBe(false);
    });
    it("closes only its bound expired fixture, preserving metadata and immutable before evidence", async () => {
      const f = await expiredFixture();
      await ps(
        `Close-ReadOnlyAuditApproval ${quote(f.directory)} ${quote(runId)}`,
      );
      const closed = JSON.parse(await readFile(f.authorization, "utf8"));
      expect(closed).toEqual({
        ...f.value,
        status: "CLOSED",
        actions: [],
        closedAt: expect.any(String),
      });
      const receipt = JSON.parse(
        await readFile(
          join(f.directory, "authorization-closure.sanitized.json"),
          "utf8",
        ),
      );
      expect(receipt).toMatchObject({
        status: "CLOSED",
        actionsCount: 0,
        beforeSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        afterSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      await ps(
        `Close-ReadOnlyAuditApproval ${quote(f.directory)} ${quote(runId)}`,
      );
      expect(JSON.parse(await readFile(f.authorization, "utf8"))).toEqual(
        closed,
      );
    });
    it("approval closure proceeds even if owned-process cleanup fails", async () => {
      const f = await expiredFixture();
      const result = JSON.parse(
        await ps(
          `function Stop-ProvisionOwnedProcesses { throw 'fixture_cleanup_failure' }; $e=@(Complete-ReadOnlyAuditCleanup ${quote(f.directory)} ${quote(runId)}); @{errors=$e} | ConvertTo-Json -Compress`,
        ),
      );
      expect(result.errors).toContain("audit_process_cleanup_failed");
      expect(JSON.parse(await readFile(f.authorization, "utf8")).status).toBe(
        "CLOSED",
      );
    });
    it("process cleanup still runs when approval closure fails; failure is reported", async () => {
      const f = await expiredFixture(true);
      const result = JSON.parse(
        await ps(
          `$script:stopped=$false; function Stop-ProvisionOwnedProcesses { $script:stopped=$true }; $e=@(Complete-ReadOnlyAuditCleanup ${quote(f.directory)} ${quote(runId)}); @{errors=$e;stopped=$script:stopped} | ConvertTo-Json -Compress`,
        ),
      );
      expect(result.errors).toContain("audit_approval_closure_failed");
      expect(result.stopped).toBe(true);
      expect(await readFile(f.authorization, "utf8")).toBe(
        "invalid fixture JSON",
      );
    });
    it("deadline watchdog closes an expired fixture independently", async () => {
      const f = await expiredFixture();
      await ps(
        `& ${quote(resolve("scripts/sentinel-readonly-audit-watchdog.ps1"))} -OutputDir ${quote(f.directory)} -RunId ${quote(runId)} -DeadlineUtc '2020-01-01T00:02:00.000Z'`,
      );
      expect(JSON.parse(await readFile(f.authorization, "utf8")).status).toBe(
        "CLOSED",
      );
      expect(
        JSON.parse(
          await readFile(
            join(f.directory, "audit-deadline-expired.sanitized.json"),
            "utf8",
          ),
        ).reason,
      ).toBe("audit_deadline");
    });
    it("a controller completion marker never bypasses independent approval closure", async () => {
      const f = await expiredFixture();
      await ps(
        `Write-ReadOnlyAuditReceipt ${quote(join(f.directory, "audit-controller-cleanup-complete.json"))} @{runId=${quote(runId)};outputDirectory=${quote(f.directory)};cleanupErrors=@()}; $future=Format-ProvisionUtc ([DateTime]::UtcNow.AddSeconds(60)); & ${quote(resolve("scripts/sentinel-readonly-audit-watchdog.ps1"))} -OutputDir ${quote(f.directory)} -RunId ${quote(runId)} -DeadlineUtc $future`,
      );
      expect(JSON.parse(await readFile(f.authorization, "utf8")).status).toBe(
        "CLOSED",
      );
      expect(
        JSON.parse(
          await readFile(
            join(f.directory, "audit-watchdog-cleanup.sanitized.json"),
            "utf8",
          ),
        ),
      ).toMatchObject({ status: "CLEANUP_COMPLETE", cleanupErrors: [] });
    });
    const databaseResult = {
      status: "PASS",
      phase: "preservation-audit",
      database: "wetscan_dev",
      marker: "wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f",
      role: "wetscan_migrator",
      transactionReadOnly: true,
      databaseMutations: 0,
      provisioningExecuted: false,
    };
    async function completedFixture(watchdog = true) {
      const f = await expiredFixture();
      const bound = { runId, outputDirectory: f.directory };
      const publish = (name: string, value: object) =>
        `Write-ReadOnlyAuditReceipt ${quote(join(f.directory, name))} (${quote(JSON.stringify({ ...bound, ...value }))} | ConvertFrom-Json);`;
      await ps(
        `Close-ReadOnlyAuditApproval ${quote(f.directory)} ${quote(runId)};` +
          publish("audit-result.sanitized.json", databaseResult) +
          publish("audit-controller-cleanup-complete.json", {
            cleanupErrors: [],
          }) +
          (watchdog
            ? publish("audit-watchdog-cleanup.sanitized.json", {
                status: "CLEANUP_COMPLETE",
                cleanupErrors: [],
              })
            : ""),
      );
      return { ...f, bound, publish };
    }
    async function finalResult(
      directory: string,
      audit = "0",
      watchdog = "0",
      errors = "@()",
    ) {
      return JSON.parse(
        await ps(
          `Get-ReadOnlyAuditFinalResult ${quote(directory)} ${quote(runId)} ${audit} ${watchdog} ${errors} | ConvertTo-Json -Depth 6 -Compress`,
        ),
      );
    }
    it("database PASS plus independently complete cleanup yields PASS", async () => {
      const f = await completedFixture();
      expect(await finalResult(f.directory)).toMatchObject({
        status: "PASS",
        auditExitCode: 0,
        watchdogExitCode: 0,
        runId,
        outputDirectory: f.directory,
        cleanupErrors: [],
      });
    });
    it("a bound watchdog receipt published before the controller handshake is also valid", async () => {
      const f = await expiredFixture();
      const bound = { runId, outputDirectory: f.directory };
      const publish = (name: string, value: object) =>
        `Write-ReadOnlyAuditReceipt ${quote(join(f.directory, name))} (${quote(JSON.stringify({ ...bound, ...value }))} | ConvertFrom-Json);`;
      const answer = await ps(
        `Close-ReadOnlyAuditApproval ${quote(f.directory)} ${quote(runId)};` +
          publish("audit-result.sanitized.json", databaseResult) +
          publish("audit-watchdog-cleanup.sanitized.json", {
            status: "CLEANUP_COMPLETE",
            cleanupErrors: [],
          }) +
          publish("audit-controller-cleanup-complete.json", {
            cleanupErrors: [],
          }) +
          `Get-ReadOnlyAuditFinalResult ${quote(f.directory)} ${quote(runId)} 0 0 @() | ConvertTo-Json -Depth 6 -Compress`,
      );
      expect(JSON.parse(answer).status).toBe("PASS");
    });
    it("a surviving owned process cannot be hidden by success receipts", async () => {
      const f = await completedFixture();
      const answer = await ps(
        `Add-ProvisionProcess ${quote(f.directory)} $PID; Get-ReadOnlyAuditFinalResult ${quote(f.directory)} ${quote(runId)} 0 0 @() | ConvertTo-Json -Depth 6 -Compress`,
      );
      expect(JSON.parse(answer)).toMatchObject({
        status: "NOT_VERIFIED",
        cleanupErrors: expect.arrayContaining([
          "audit_process_cleanup_NOT_VERIFIED",
        ]),
      });
    });
    it("database PASS cannot suppress a genuine cleanup failure", async () => {
      const f = await completedFixture();
      expect(
        await finalResult(
          f.directory,
          "0",
          "0",
          "@('audit_process_cleanup_failed')",
        ),
      ).toMatchObject({
        status: "NOT_VERIFIED",
        cleanupErrors: expect.arrayContaining(["audit_process_cleanup_failed"]),
      });
      const path = join(f.directory, "audit-watchdog-cleanup.sanitized.json");
      await writeFile(
        path,
        JSON.stringify({
          ...f.bound,
          status: "NOT_VERIFIED",
          cleanupErrors: ["audit_approval_closure_failed"],
        }),
      );
      expect((await finalResult(f.directory)).status).toBe("NOT_VERIFIED");
    });
    it.each(["$null", "7", "'0'"])(
      "unknown, nonzero or nonnumeric exit %s cannot become PASS",
      async (code) => {
        const f = await completedFixture();
        expect((await finalResult(f.directory, code)).status).toBe(
          "NOT_VERIFIED",
        );
        expect((await finalResult(f.directory, "0", code)).status).toBe(
          "NOT_VERIFIED",
        );
      },
    );
    it("retains actual child exit codes in both audit and watchdog wait flows", async () => {
      const result = JSON.parse(
        await ps(
          `$r=@(); foreach($code in @(0,7)){foreach($mode in @('audit','watchdog')){ $p=Start-ReadOnlyAuditProcess @{FilePath='powershell.exe';ArgumentList=@('-NoProfile','-NonInteractive','-Command',('"Start-Sleep -Milliseconds 100; exit '+$code+'"'))}; if($mode -eq 'audit'){while(-not $p.HasExited){Start-Sleep -Milliseconds 20;$p.Refresh()}}else{$null=$p.WaitForExit(5000)}; $r+=@{expected=$code;actual=(Get-ReadOnlyAuditExitCode $p);mode=$mode};$p.Dispose()}}; ConvertTo-Json -InputObject $r -Compress`,
        ),
      );
      expect(result).toHaveLength(4);
      for (const row of result) expect(row.actual).toBe(row.expected);
    });
    it("rejects a null exit code explicitly instead of coercing it", async () => {
      const result = await ps(
        `$p=[pscustomobject]@{HasExited=$true;ExitCode=$null}; $p | Add-Member ScriptMethod WaitForExit {}; try { Get-ReadOnlyAuditExitCode $p } catch { $_.Exception.Message }`,
      );
      expect(result).toBe("audit_process_exit_unverified");
    });
    it("missing or delayed receipts never revise an already published failure", async () => {
      const f = await completedFixture(false);
      await ps(
        `$r=Get-ReadOnlyAuditFinalResult ${quote(f.directory)} ${quote(runId)} 0 0 @(); Write-ReadOnlyAuditReceipt ${quote(join(f.directory, "audit-runner-finished.json"))} $r`,
      );
      const original = await readFile(
        join(f.directory, "audit-runner-finished.json"),
        "utf8",
      );
      expect(JSON.parse(original).status).toBe("NOT_VERIFIED");
      await ps(
        f.publish("audit-watchdog-cleanup.sanitized.json", {
          status: "CLEANUP_COMPLETE",
          cleanupErrors: [],
        }),
      );
      expect(
        await readFile(join(f.directory, "audit-runner-finished.json"), "utf8"),
      ).toBe(original);
      await expect(
        ps(
          `Write-ReadOnlyAuditReceipt ${quote(join(f.directory, "audit-runner-finished.json"))} @{status='PASS'}`,
        ),
      ).rejects.toThrow();
    });
    it("waits for a delayed watchdog's atomic receipt before final classification", async () => {
      const f = await completedFixture(false);
      const child = `$ErrorActionPreference='Stop'; . ${quote(common)}; Start-Sleep -Milliseconds 200; ${f.publish("audit-watchdog-cleanup.sanitized.json", { status: "CLEANUP_COMPLETE", cleanupErrors: [] })}`;
      const encoded = Buffer.from(child, "utf16le").toString("base64");
      const result = JSON.parse(
        await ps(
          `$p=Start-ReadOnlyAuditProcess @{FilePath='powershell.exe';ArgumentList=@('-NoProfile','-NonInteractive','-EncodedCommand',${quote(encoded)})}; if(-not $p.WaitForExit(5000)){throw 'fixture_timeout'}; $code=Get-ReadOnlyAuditExitCode $p; Get-ReadOnlyAuditFinalResult ${quote(f.directory)} ${quote(runId)} 0 $code @() | ConvertTo-Json -Depth 6 -Compress`,
        ),
      );
      expect(result.status).toBe("PASS");
    });
    it.each(["beforeSha256", "afterSha256"])(
      "incorrect closure %s fails closed",
      async (field) => {
        const f = await completedFixture();
        const path = join(f.directory, "authorization-closure.sanitized.json");
        const receipt = JSON.parse(await readFile(path, "utf8"));
        await writeFile(
          path,
          JSON.stringify({ ...receipt, [field]: "0".repeat(64) }),
        );
        expect((await finalResult(f.directory)).status).toBe("NOT_VERIFIED");
      },
    );
    it.each([
      "audit-result.sanitized.json",
      "authorization-closure.sanitized.json",
      "audit-controller-cleanup-complete.json",
      "audit-watchdog-cleanup.sanitized.json",
    ])("stale run ID in %s fails closed", async (name) => {
      const f = await completedFixture();
      const path = join(f.directory, name);
      const receipt = JSON.parse(await readFile(path, "utf8"));
      await writeFile(
        path,
        JSON.stringify({ ...receipt, runId: "b".repeat(32) }),
      );
      expect((await finalResult(f.directory)).status).toBe("NOT_VERIFIED");
    });
    it("missing, malformed and mismatched-directory receipts fail closed", async () => {
      for (const content of [
        "{",
        JSON.stringify({ runId, outputDirectory: root }),
      ]) {
        const f = await completedFixture();
        await writeFile(
          join(f.directory, "audit-watchdog-cleanup.sanitized.json"),
          content,
        );
        expect((await finalResult(f.directory)).status).toBe("NOT_VERIFIED");
      }
      const f = await completedFixture();
      await rm(join(f.directory, "authorization-closure.sanitized.json"));
      expect((await finalResult(f.directory)).status).toBe("NOT_VERIFIED");
    });
    it("publishes only after flush and close, and never overwrites a receipt", async () => {
      const f = await expiredFixture();
      const path = join(f.directory, "atomic.sanitized.json");
      const observed = JSON.parse(
        await ps(
          `$original=\${function:Write-ProvisionExclusive}; $script:visible=@(); function Write-ProvisionExclusive($p,$t){$script:visible+=Test-Path -LiteralPath ${quote(path)}; & $original $p $t; $script:visible+=Test-Path -LiteralPath ${quote(path)}}; Write-ReadOnlyAuditReceipt ${quote(path)} @{runId=${quote(runId)};outputDirectory=${quote(f.directory)};status='COMPLETE'}; @{visible=$script:visible;published=(Test-Path -LiteralPath ${quote(path)})} | ConvertTo-Json -Compress`,
        ),
      );
      expect(observed).toEqual({ visible: [false, false], published: true });
      const original = await readFile(path, "utf8");
      await expect(
        ps(`Write-ReadOnlyAuditReceipt ${quote(path)} @{status='REPLACED'}`),
      ).rejects.toThrow();
      expect(await readFile(path, "utf8")).toBe(original);
    });
    it("failed receipt flushing leaves no final receipt and cannot produce PASS", async () => {
      const f = await completedFixture(false);
      const answer = await ps(
        `function Write-ProvisionExclusive($p,$t){[IO.File]::WriteAllText($p,'{');throw 'fixture_flush_failed'}; try { Write-ReadOnlyAuditReceipt ${quote(join(f.directory, "audit-watchdog-cleanup.sanitized.json"))} @{} } catch {}; Get-ReadOnlyAuditFinalResult ${quote(f.directory)} ${quote(runId)} 0 0 @() | ConvertTo-Json -Depth 6 -Compress`,
      );
      expect(JSON.parse(answer).status).toBe("NOT_VERIFIED");
      await expect(
        readFile(join(f.directory, "audit-watchdog-cleanup.sanitized.json")),
      ).rejects.toThrow();
    });
    it("deadline evidence always prevents PASS, even when every success receipt exists", async () => {
      const f = await completedFixture();
      await ps(
        f.publish("audit-deadline-expired.sanitized.json", {
          reason: "audit_deadline",
        }),
      );
      expect(await finalResult(f.directory)).toMatchObject({
        status: "NOT_VERIFIED",
        cleanupErrors: expect.arrayContaining(["audit_deadline"]),
      });
    });
    it("concurrent controller/watchdog closure preserves one consistent before/after receipt", async () => {
      const f = await expiredFixture();
      const code = `$e=@(Complete-ReadOnlyAuditCleanup ${quote(f.directory)} ${quote(runId)}); ConvertTo-Json -InputObject $e -Compress`;
      const results = await Promise.all([ps(code), ps(code)]);
      expect(results.map((r) => JSON.parse(r))).toEqual([[], []]);
      await ps(
        `Assert-ReadOnlyAuditClosure ${quote(f.directory)} ${quote(runId)}`,
      );
    });
  },
);
