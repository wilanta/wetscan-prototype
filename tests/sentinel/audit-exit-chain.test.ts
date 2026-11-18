import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import {
  classifyAuditNativeFailure,
  safeFailure,
  AuditStageError,
} from "../../scripts/sentinel-audit-diagnostics.mjs";

const ps = "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const quote = (text: string) => text.replaceAll("'", "''");
const run = async (file: string, args: string[] = []) => {
  try {
    const r = await promisify(execFile)(
      ps,
      ["-NoProfile", "-NonInteractive", "-File", file, ...args],
      { timeout: 20000, windowsHide: true },
    );
    return { exit: 0, ...r };
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string };
    return { exit: e.code, stdout: e.stdout, stderr: e.stderr };
  }
};
async function fixture(task: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "wetscan-exit-chain-"));
  try {
    await task(dir);
  } finally {
    if (!dir.startsWith(join(tmpdir(), "wetscan-exit-chain-")))
      throw Error("fixture_cleanup_boundary");
    await rm(dir, { recursive: true, force: true });
  }
}

// This child imports only pure diagnostic/infrastructure modules. All Docker
// responses are injected; the marker stages cannot construct a database pool.
const coordinator = `
import fs from 'node:fs';
import {runAuditStages,AuditStageError} from ${JSON.stringify(pathToFileURL(resolve("scripts/sentinel-audit-diagnostics.mjs")).href)};
import {infrastructureStages} from ${JSON.stringify(pathToFileURL(resolve("scripts/sentinel-audit-infrastructure.mjs")).href)};
const scenario=process.argv[2],out=process.argv[3];
const ports={'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'55432'}]};
const mounts=[{Type:'volume',Name:'fixture-volume',Source:'fixture',Destination:'/var/lib/postgresql/data',RW:true}];
const c={Id:'fixture',Name:'/fixture-pg',Image:'digest',Config:{Image:'fixture',Labels:{}},State:{Running:true,Status:'running',Health:{Status:'healthy'}},HostConfig:{RestartPolicy:{Name:'no',MaximumRetryCount:0},PortBindings:ports},NetworkSettings:{Ports:ports},Mounts:structuredClone(mounts)};
if(scenario==='wrong_identity')c.Id='unexpected';
if(scenario==='wrong_mount')c.Mounts[0].Name='unexpected';
if(scenario==='wrong_port')c.NetworkSettings.Ports={'5432/tcp':[{HostIp:'0.0.0.0',HostPort:'55432'}]};
const b={target:{containerId:'fixture',containerName:'fixture-pg',imageId:'digest',volume:'fixture-volume'}};
const prior={container:{image:'fixture',bindings:ports,mounts},volume:{name:'fixture-volume',driver:'local',createdAt:'old',mountpoint:'fixture',scope:'local'}};
const inventory=[{id:'fixture',name:'/fixture-pg',imageId:'digest',restartPolicy:'no'}];
let calls=0,admissionReached=0,failedNative=false,afterFailure=0,clock=0;
const native=async(_exe,args,timeout)=>{calls++;if(failedNative)afterFailure++;if(timeout>20000)throw Error('timeout_widened');
 if(args.includes('inspect')&&!args.includes('volume')){
  if(['inspect_stderr','inspect_empty_stderr','engine_unavailable'].includes(scenario)){failedNative=true;clock=120000;throw new AuditStageError('native_exit',{exitCode:1,stderrBytes:scenario==='inspect_empty_stderr'?0:224,nativeDiagnostic:scenario==='engine_unavailable'?'docker_linux_engine_pipe_missing':null});}
  if(scenario==='checker_timeout'){failedNative=true;clock=120000;throw new AuditStageError('native_timeout',{timedOut:true});}
 }
 if(args.includes('volume'))return {stdout:JSON.stringify([{Name:scenario==='wrong_volume'?'unexpected':'fixture-volume',Driver:'local',CreatedAt:'old',Mountpoint:'fixture',Scope:'local'}])};
 if(args.includes('ps'))return {stdout:'fixture'};
 if(args.includes('inspect'))return {stdout:JSON.stringify(args.includes('--format')?c:[c])};
 return {stdout:'0'};
};
const stages=infrastructureStages(b,prior,inventory,native,()=>clock);
if(scenario==='coordinator_failure')stages.push({name:'coordinator',run:async()=>{throw new AuditStageError('validation_failed')}});
const r=await runAuditStages(stages,async()=>{if(scenario==='receipt_failure')throw Error('SECRET_DISK')},async()=>{if(scenario==='cleanup_failure')throw Error('SECRET_CLEANUP')});
if(r.status==='PASS')admissionReached++;
const value={...r,status:r.status==='PASS'?'OFFLINE_READY':'NOT_VERIFIED',databaseConnections:0,runtimeApprovals:0,admissionReached,calls,retries:afterFailure};
fs.writeFileSync(out,JSON.stringify(value),{flag:'wx'});console.log(JSON.stringify(value));process.exitCode=r.status==='PASS'?0:1;
`;

describe.skipIf(process.platform !== "win32")(
  "complete synthetic PowerShell owner exit chain",
  { timeout: 30000 },
  () => {
    it.each([
      "correct",
      "inspect_stderr",
      "inspect_empty_stderr",
      "engine_unavailable",
      "wrong_identity",
      "wrong_mount",
      "wrong_volume",
      "wrong_port",
      "checker_timeout",
      "coordinator_failure",
      "receipt_failure",
      "cleanup_failure",
      "outer_returns_zero",
    ])(
      "propagates %s through a real outer PowerShell process",
      async (scenario) => {
        await fixture(async (dir) => {
          const child = join(dir, "coordinator.mjs");
          const entry = join(dir, "entry.ps1");
          const receipt = join(dir, "result.json");
          await writeFile(child, coordinator);
          const actual =
            scenario === "outer_returns_zero"
              ? "coordinator_failure"
              : scenario;
          const entryText = `$ErrorActionPreference='Stop'; $text=(& '${quote(process.execPath)}' '${quote(child)}' '${actual}' '${quote(receipt)}' | Out-String); $childExit=$LASTEXITCODE; Write-Output $text; exit ${scenario === "outer_returns_zero" ? "0" : "$childExit"}`;
          await writeFile(entry, entryText);
          const template = await readFile(
            "scripts/sentinel-audit-owner-template.ps1",
            "utf8",
          );
          const owner = join(dir, "owner.ps1");
          await writeFile(
            owner,
            template
              .replace("__S04_ENTRY_PATH__", quote(entry))
              .replace("__S04_ENTRY_SHA256__", hash(entryText)),
          );
          const outer = await run(owner, ["-ManifestSha256", "0".repeat(64)]);
          expect(outer.stderr).toBe("");
          const state = JSON.parse(await readFile(receipt, "utf8"));
          expect(state.databaseConnections).toBe(0);
          expect(state.runtimeApprovals).toBe(0);
          expect(state.retries).toBe(0);
          if (scenario !== "correct") {
            expect(outer.exit).toBe(1);
            expect(JSON.parse(outer.stdout).status).toBe("NOT_VERIFIED");
            expect(state.status).toBe("NOT_VERIFIED");
            expect(state.admissionReached).toBe(0);
          } else {
            expect(outer.exit).toBe(0);
            expect(JSON.parse(outer.stdout).status).toBe("OFFLINE_READY");
          }
          expect(JSON.stringify(state)).not.toContain("SECRET");
        });
      },
    );
    it.each([
      "empty",
      "invalid",
      "pass_nonzero",
      "not_verified_zero",
      "cleanup_zero",
    ])(
      "the hash-guarded outer command rejects %s evidence",
      async (scenario) => {
        await fixture(async (dir) => {
          const manifest = "{}";
          await writeFile(
            join(dir, "reviewed-audit-input-pins.private.json"),
            manifest,
          );
          const status =
            scenario === "not_verified_zero" ? "NOT_VERIFIED" : "PASS";
          const value =
            scenario === "empty"
              ? ""
              : scenario === "invalid"
                ? "invalid"
                : JSON.stringify({
                    status,
                    cleanupFailures:
                      scenario === "cleanup_zero" ? ["fixture_cleanup"] : [],
                  });
          const entry = `Write-Output '${quote(value)}'; exit ${scenario === "pass_nonzero" ? "17" : "0"}`;
          await writeFile(join(dir, "reviewed-owner-procedure.ps1"), entry);
          const text = (
            await readFile(
              "scripts/sentinel-audit-command-template.ps1",
              "utf8",
            )
          )
            .replace("__S04_PACKAGE_PATH__", quote(dir))
            .replaceAll("__S04_PROCEDURE_SHA256__", hash(entry))
            .replaceAll("__S04_MANIFEST_SHA256__", hash(manifest));
          const outer = join(dir, "outer.ps1");
          await writeFile(outer, text);
          const r = await run(outer);
          expect(r.exit).toBe(1);
          expect(r.stderr).toBe("");
          const receipt = JSON.parse(r.stdout);
          expect(receipt.status).toBe("NOT_VERIFIED");
          expect(receipt.retry).toBe(false);
          if (scenario === "pass_nonzero")
            expect(receipt.childExitCode).toBe(17);
        });
      },
    );
    it("the launcher has explicit failure and success exits", async () => {
      const source = await readFile(
        "scripts/Invoke-S04AuditProcedure.ps1",
        "utf8",
      );
      expect(source).toContain(
        "if($status -cne 'PASS' -and $status -cne 'OFFLINE_READY'){exit 1}",
      );
      expect(source.trimEnd().endsWith("exit 0")).toBe(true);
    });
  },
);

it("classifies only fixed Docker signatures and never copies stderr secrets", () => {
  const docker =
    "C:/Users/sheil/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe";
  const diagnostic = classifyAuditNativeFailure(
    docker,
    "error during connect dockerDesktopLinuxEngine: The system cannot find the file specified SECRET_COOKIE",
  );
  expect(diagnostic).toBe("docker_linux_engine_pipe_missing");
  expect(classifyAuditNativeFailure(docker, "No such object: fixture")).toBe(
    "docker_container_not_found",
  );
  expect(
    classifyAuditNativeFailure(
      process.execPath,
      "dockerDesktopLinuxEngine: The system cannot find the file specified",
    ),
  ).toBeNull();
  expect(classifyAuditNativeFailure(docker, "SECRET_UNKNOWN")).toBeNull();
  expect(
    JSON.stringify(
      safeFailure(
        new AuditStageError("native_exit", {
          exitCode: 1,
          nativeDiagnostic: diagnostic,
          stderr: "SECRET_COOKIE",
        }),
        "container_identity",
      ),
    ),
  ).not.toContain("SECRET");
});
