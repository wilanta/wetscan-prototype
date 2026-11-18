import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const exec = promisify(execFile),
  quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
describe.skipIf(process.platform !== "win32")(
  "offline provisioning failure lifecycle (no phase runner, services or database)",
  { timeout: 20000 },
  () => {
    let root: string,
      seq = 0;
    async function ps(code: string) {
      const r = await exec(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `$ErrorActionPreference='Stop'; . ${quote(resolve("scripts/sentinel-provision-common.ps1"))}; . ${quote(resolve("scripts/sentinel-provision-auth.ps1"))}; ${code}`,
        ],
        { timeout: 15000, windowsHide: true },
      );
      expect(r.stderr.trim()).toBe("");
      return r.stdout.trim();
    }
    async function directory() {
      const dir = join(root, `case-${seq++}`);
      await ps(`New-ProvisionPrivateDirectory ${quote(dir)}`);
      return dir;
    }
    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), "wetscan-provision-failure-"));
    });
    afterAll(async () => {
      if (
        !basename(root).startsWith("wetscan-provision-failure-") ||
        relative(resolve(tmpdir()), resolve(root)).startsWith("..")
      )
        throw Error("fixture_cleanup");
      await rm(root, { recursive: true, force: true });
    });
    it("waits for owned synthetic processes to exit before permitting a failure audit", async () => {
      const dir = await directory();
      const result = JSON.parse(
        await ps(`
      Write-ProvisionExclusive ${quote(join(dir, "owned-processes.jsonl"))} ''
      $results=@()
      for($i=0;$i -lt 6;$i++){
        $p=Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-NonInteractive','-Command','"Start-Sleep -Seconds 20"') -PassThru -WindowStyle Hidden
        $null=$p.Handle; Add-ProvisionProcess ${quote(dir)} $p.Id
        try { Stop-ProvisionOwnedProcesses ${quote(dir)}; $results+=@{stopped=$p.HasExited} }
        finally { if(-not $p.HasExited){Stop-Process -InputObject $p -Force}; $p.WaitForExit(3000)|Out-Null; $p.Dispose() }
      }
      ConvertTo-Json -InputObject $results -Compress
    `),
      );
      expect(result).toEqual(
        Array.from({ length: 6 }, () => ({ stopped: true })),
      );
    });
    it.each([false, true])(
      "failure audit runs before closure; genuine audit failure=%s stays unverified",
      async (fails) => {
        const dir = await directory();
        const result = JSON.parse(
          await ps(`
      $global:sequence=New-Object Collections.Generic.List[string]
      try {
        try { throw 'FIXTURE_AUTH_FAILURE' } catch {
          try { Invoke-ProvisionFailureFinalAudit -OutputDir ${quote(dir)} -StopOwned { $global:sequence.Add('stop') } -Audit { $global:sequence.Add('audit'); ${fails ? "throw 'FIXTURE_DB_UNAVAILABLE_SECRET'" : ""} } } catch {}
        }
      } finally {
        # Deliberately invalid, expired fixtures; cannot authorize any runtime.
        foreach($name in @('web-runtime-approval.json','controller-runtime-approval.json')) {
          Write-ProvisionExclusive (Join-Path ${quote(dir)} $name) '{"status":"FIXTURE_ONLY","actions":["fixture"],"h04cB2":{"phase":"provision-ingest","expiresAt":"2020-01-01T00:00:00Z"}}'
        }
        Write-ProvisionExclusive ${quote(join(dir, "owned-processes.jsonl"))} ''
        $global:sequence.Add('close'); Close-ProvisionApprovals ${quote(dir)}
        $deadline=Format-ProvisionUtc ([DateTime]::UtcNow.AddSeconds(30))
        Write-ProvisionReceipt ${quote(join(dir, "controller-cleanup-complete.json"))} @{outputDirectory=${quote(dir)};deadlineUtc=$deadline;cleanupErrors=@()}
        $global:sequence.Add('watchdog')
        & ${quote(resolve("scripts/sentinel-provision-watchdog.ps1"))} -OutputDir ${quote(dir)} -DeadlineUtc $deadline
        Assert-ProvisionWatchdogCleanup ${quote(dir)} $deadline 0
      }
      ConvertTo-Json -InputObject @($global:sequence) -Compress
    `),
        );
        expect(result).toEqual(["stop", "audit", "close", "watchdog"]);
        const evidence = JSON.parse(
          await readFile(
            join(dir, "failure-end.lifecycle.sanitized.json"),
            "utf8",
          ),
        );
        expect(evidence.status).toBe(fails ? "NOT_VERIFIED" : "PASS");
        expect(evidence.auditCompleted).toBe(!fails);
        expect(JSON.stringify(evidence)).not.toContain("SECRET");
      },
    );
    it("a stop failure cannot skip the independent audit or masquerade as PASS", async () => {
      const dir = await directory();
      expect(
        await ps(
          `$global:audited=$false;try { Invoke-ProvisionFailureFinalAudit -OutputDir ${quote(dir)} -StopOwned {throw 'owned_process_survived'} -Audit {$global:audited=$true} }catch{}; $global:audited | ConvertTo-Json`,
        ),
      ).toBe("true");
      expect(
        JSON.parse(
          await readFile(
            join(dir, "failure-end.lifecycle.sanitized.json"),
            "utf8",
          ),
        ),
      ).toMatchObject({
        status: "NOT_VERIFIED",
        auditCompleted: true,
        serverStopFailure: { category: "owned_process_survived" },
      });
    });
    it.each([
      "unauthenticated",
      "forbidden",
      "timeout",
      "response_parse_failed",
    ])(
      "phase-start PASS followed by %s records one GET and no provisioning",
      async (category) => {
        const dir = await directory(),
          cookieFile = join(dir, "fixture-cookie.secret");
        await writeFile(cookieFile, "wetscan_session=" + "a".repeat(64));
        const result = JSON.parse(
          await ps(`
      Write-ProvisionReceipt ${quote(join(dir, "phase-start.private.json"))} @{status='PASS';fixture=$true}
      $global:requests=0; $global:provisioned=$false
      try {
        Invoke-ProvisionAuthenticatedGet -CookieFile ${quote(cookieFile)} -OutputDir ${quote(dir)} -Guard {} -ServerRunning {$true} -Request {
          param($uri,$cookie)
          $global:requests++; $e=New-Object Exception('PRIVATE_RESPONSE_BODY_'+$cookie)
          $e.Data['S04SessionDiagnostic']=@{status='NOT_VERIFIED';stage='http';category='${category}';httpStatus=${category === "unauthenticated" ? "401" : category === "forbidden" ? "403" : category === "response_parse_failed" ? "200" : "$null"};transportStatus=$null}; throw $e
        }
        $global:provisioned=$true
      } catch {}
      @{requests=$global:requests;provisioned=$global:provisioned} | ConvertTo-Json -Compress
    `),
        );
        expect(result).toEqual({ requests: 1, provisioned: false });
        const text = await readFile(
          join(dir, "authenticated-get.sanitized.json"),
          "utf8",
        );
        expect(JSON.parse(text).diagnostic.category).toBe(category);
        expect(text).not.toContain("PRIVATE_RESPONSE_BODY");
        expect(text).not.toContain("a".repeat(64));
      },
    );
    it("only pre-response connection refusal is polled; success still requires exact identity and revision", async () => {
      const dir = await directory(),
        cookieFile = join(dir, "fixture-cookie.secret");
      await writeFile(cookieFile, "SYNTHETIC_NOT_A_SESSION");
      await ps(`
      $global:requests=0
      Invoke-ProvisionAuthenticatedGet -CookieFile ${quote(cookieFile)} -OutputDir ${quote(dir)} -Guard {} -ServerRunning {$true} -Request {
        param($uri,$cookie); $global:requests++
        if($global:requests -eq 1){$e=New-Object Exception('SYNTHETIC');$e.Data['S04SessionDiagnostic']=@{status='NOT_VERIFIED';stage='transport';category='connection_refused';httpStatus=$null;transportStatus='ConnectFailure'};throw $e}
        return @{diagnostic=@{status='PASS';stage='complete';category='success';httpStatus=200;transportStatus=$null};data=[pscustomobject]@{rule=[pscustomobject]@{ruleId='7ad1deb8-e555-44ec-be98-b7def574781d';workspaceId='github-user-187839747:test';projectId='github-998736528';mode='live';status='DISABLED';revision=3;version=3}}}
      }
    `);
      const result = JSON.parse(
        await readFile(join(dir, "authenticated-get.sanitized.json"), "utf8"),
      );
      expect(result).toMatchObject({
        diagnostic: { status: "PASS", httpStatus: 200 },
        attempts: 2,
      });
    });
    it.each(["wrong_revision", "wrong_project", "missing_rule"])(
      "HTTP 200 with %s stays fail-closed before provisioning",
      async (fault) => {
        const dir = await directory(),
          cookieFile = join(dir, "fixture-cookie.secret");
        await writeFile(cookieFile, "SYNTHETIC_NOT_A_SESSION");
        const result = JSON.parse(
          await ps(`
      $global:provisioned=$false
      try {
        Invoke-ProvisionAuthenticatedGet -CookieFile ${quote(cookieFile)} -OutputDir ${quote(dir)} -Guard {} -ServerRunning {$true} -Request {
          param($uri,$cookie)
          $rule=[pscustomobject]@{ruleId='7ad1deb8-e555-44ec-be98-b7def574781d';workspaceId='github-user-187839747:test';projectId='github-998736528';mode='live';status='DISABLED';revision=3;version=3}
          ${fault === "wrong_revision" ? "$rule.revision=4" : fault === "wrong_project" ? "$rule.projectId='github-999'" : "$rule=$null"}
          return @{diagnostic=@{status='PASS';httpStatus=200};data=[pscustomobject]@{rule=$rule}}
        }
        $global:provisioned=$true
      } catch {}
      @{provisioned=$global:provisioned} | ConvertTo-Json -Compress
    `),
        );
        expect(result.provisioned).toBe(false);
        expect(
          JSON.parse(
            await readFile(
              join(dir, "authenticated-get.sanitized.json"),
              "utf8",
            ),
          ),
        ).toMatchObject({
          diagnostic: {
            status: "NOT_VERIFIED",
            category: "response_scope_failed",
            httpStatus: 200,
          },
          attempts: 1,
        });
      },
    );
  },
);
