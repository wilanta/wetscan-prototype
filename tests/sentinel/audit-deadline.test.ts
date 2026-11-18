import { describe, expect, it } from "vitest";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { auditDeadlineBudget, auditProcedureTiming } from "../../scripts/sentinel-audit-procedure.mjs";
import { AuditStageError, runAuditStages } from "../../scripts/sentinel-audit-diagnostics.mjs";
import { infrastructureStages } from "../../scripts/sentinel-audit-infrastructure.mjs";

const epoch = 1800000000000;
function clock() {
  let wall = epoch, mono = 0;
  const budget = auditDeadlineBudget(epoch + 210000, () => wall, () => mono);
  return { budget, advance: (ms: number) => { wall += ms; mono += ms; }, wallBack: () => { wall -= 60000; } };
}
describe("S04 shared outer deadline, synthetic time only", () => {
  it("accounts for process startup already spent before coordinator entry", () => {
    const b = auditDeadlineBudget(epoch + 210000, () => epoch + 2000, () => 500);
    expect(b.evidence().remainingMs).toBe(208000);
  });
  it.each([undefined, null, NaN, Infinity, epoch + 210001])("rejects missing or invalid deadline evidence %s", value => {
    expect(() => auditDeadlineBudget(value, () => epoch, () => 0)).toThrow();
  });
  it("accepts the exact 170-second admission boundary and rejects one millisecond less", () => {
    const c = clock(); c.advance(40000);
    expect(c.budget.admit().remainingMs).toBe(170000);
    c.advance(1); expect(() => c.budget.admit()).toThrow();
  });
  it("never extends the deadline when the wall clock moves backward", () => {
    const c = clock(); c.advance(40001); c.wallBack();
    expect(c.budget.evidence().remainingMs).toBe(169999);
    expect(() => c.budget.admit()).toThrow();
  });
  it("fails closed when the clock evidence becomes invalid", () => {
    let now = 0;
    const b = auditDeadlineBudget(epoch + 210000, () => epoch, () => now);
    now = NaN; expect(() => b.admit()).toThrow();
  });
  it.each([0, 39999, 40000, 40001, 210000])("gates admission after %i ms of preflight without a real connection", async elapsed => {
    const c = clock(); let connections = 0, approvals = 0;
    const result = await runAuditStages([
      { name: "preflight", run: async () => { c.advance(elapsed); } },
      { name: "admission", run: async () => { c.budget.admit(); } },
      { name: "audit_execution", run: async () => { c.budget.admit(); connections++; approvals++; } },
    ], async () => {});
    expect(result.status).toBe(elapsed <= 40000 ? "PASS" : "NOT_VERIFIED");
    expect(connections).toBe(elapsed <= 40000 ? 1 : 0);
    expect(approvals).toBe(connections);
  });
  it("rechecks admission after durable receipt writing consumes time", async () => {
    const c = clock(); let connections = 0;
    const r = await runAuditStages([
      { name: "admission", run: async () => { c.budget.admit(); c.advance(40001); } },
      { name: "audit_execution", run: async () => { c.budget.admit(); connections++; } },
    ], async () => {});
    expect(r.firstFailedStage).toBe("audit_execution"); expect(connections).toBe(0);
  });
  it("failed deadline evidence cannot reach admission", async () => {
    let connections = 0;
    const r = await runAuditStages([
      { name: "deadline_evidence", run: async () => { throw new AuditStageError("invalid_evidence"); } },
      { name: "admission", run: async () => { connections++; } },
    ], async () => {});
    expect(r.status).toBe("NOT_VERIFIED"); expect(connections).toBe(0);
  });
  it.each([19999, 20000, 20001])("cleanup using %i ms cannot turn expiry into PASS", async cleanup => {
    const c = clock(); c.advance(40000); c.budget.admit(); c.advance(150000);
    const r = await runAuditStages([], async () => {}, async () => {
      c.advance(cleanup); c.budget.requireRemaining(1);
    });
    expect(r.status).toBe(cleanup < 20000 ? "PASS" : "NOT_VERIFIED");
  });
  it("a primary admission failure survives cleanup failure", async () => {
    const c = clock(); c.advance(40001);
    const r = await runAuditStages([{ name: "admission", run: async () => { c.budget.admit(); } }], async () => {}, async () => { throw new AuditStageError("native_cleanup"); });
    expect(r.primaryFailure?.stage).toBe("admission"); expect(r.cleanupFailures).toHaveLength(1);
  });
  it.each([0, 2])("Docker returns immediately after %i transient failures", async failures => {
    let time = 0, calls = 0, sleeps = 0;
    const native = async () => { calls++; if (calls <= failures) throw new AuditStageError("native_exit"); return { stdout: JSON.stringify([{ Id: "fixture", Name: "/fixture", Image: "digest", Config: { Image: "digest" } }]) }; };
    const stages = infrastructureStages({ target: { containerId: "fixture", containerName: "fixture", imageId: "digest" } }, { container: { image: "digest" } }, [], native, () => time, async (ms: number) => { time += ms; sleeps++; });
    await stages[0].run(); expect(calls).toBe(failures + 1); expect(sleeps).toBe(failures); expect(time).toBe(failures * 1000);
  });
  it("stops transient polling when only the audit and cleanup reserve remain", async () => {
    let time = 0, calls = 0;
    const stages = infrastructureStages({ target: { containerId: "fixture" } }, {}, [], async () => { calls++; throw new AuditStageError("native_exit"); }, () => time, async (ms: number) => { time += ms; }, 3000);
    await expect(stages[0].run()).rejects.toThrow();
    expect(time).toBe(3000); expect(calls).toBe(3);
  });
  it("keeps the same deadline in the launcher, coordinator and existing runner", async () => {
    const launcher = await readFile("scripts/Invoke-S04AuditProcedure.ps1", "utf8"), coordinator = await readFile("scripts/sentinel-audit-procedure.mjs", "utf8"), runner = await readFile("scripts/Invoke-S04ReadOnlyAudit.ps1", "utf8");
    expect(launcher).toContain("210000-$coordinatorClock.ElapsedMilliseconds");
    expect(launcher).toContain("'--outer-deadline-ms='");
    expect(coordinator).toContain('"-OuterDeadlineUnixMs"');
    expect(runner).toContain("$deadline=$approved.AddSeconds(120)");
    expect(runner.indexOf("throw 'audit_outer_deadline_reserve'")).toBeLessThan(runner.indexOf("New-ProvisionPrivateDirectory $output"));
    expect(auditProcedureTiming.cleanupReserveMs).toBe(10000 + 5000 + 5000);
  });
});

describe.skipIf(process.platform !== "win32")("actual PowerShell deadline rejection, mocked offline dependencies", { timeout: 25000 }, () => {
  it.each([0, 1000, 211000])("rejects absent/insufficient/excessive runner deadline %i before output or approval creation", async offset => {
    const dir = await mkdtemp(join(tmpdir(), "wetscan-deadline-"));
    try {
      const runner = resolve("scripts/Invoke-S04ReadOnlyAudit.ps1").replaceAll("'", "''"), planned = join(dir, "must-not-exist").replaceAll("'", "''");
      const code = `$ErrorActionPreference='Stop'; function node { $global:LASTEXITCODE=0; '{"status":"OFFLINE_READY","databaseConnections":0,"executionPerformed":false}' }; $blocked=$false; try { & '${runner}' -ExecuteLive -OutputDir '${planned}' -OwnerAuthorization 'SYNTHETIC_OFFLINE_ONLY' -ConfirmScope 'wetscan_dev:preservation-audit:read-only:1attempt' -OuterDeadlineUnixMs ${offset === 0 ? "0" : `([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+${offset})`} } catch { $blocked=$_.Exception.Message -ceq 'audit_outer_deadline_reserve' }; @{blocked=$blocked;created=(Test-Path -LiteralPath '${planned}')}|ConvertTo-Json -Compress`;
      const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", code], { windowsHide: true, timeout: 20000 });
      expect(JSON.parse(stdout)).toEqual({ blocked: true, created: false });
    } finally {
      if (!dir.startsWith(join(tmpdir(), "wetscan-deadline-"))) throw Error("fixture_cleanup_boundary");
      await rm(dir, { recursive: true, force: true });
    }
  });
  it.each([-1, 0])("enforces the actual runner handoff cleanup boundary at offset %i", async offset => {
    const source = await readFile("scripts/Invoke-S04ReadOnlyAudit.ps1", "utf8");
    const guard = source.split(/\r?\n/).find(line => line.startsWith("if (([DateTimeOffset]$deadline)"));
    expect(guard).toBeTruthy();
    const code = `$ErrorActionPreference='Stop'; $deadline=[DateTime]::Parse('2030-01-01T00:02:00Z').ToUniversalTime(); $OuterDeadlineUnixMs=([DateTimeOffset]$deadline).ToUnixTimeMilliseconds()+20000+(${offset});$blocked=$false; try { ${guard} } catch {$blocked=$_.Exception.Message -ceq 'audit_outer_deadline_reserve'}; @{blocked=$blocked}|ConvertTo-Json -Compress`;
    const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", code], { windowsHide: true, timeout: 20000 });
    expect(JSON.parse(stdout).blocked).toBe(offset < 0);
  });
  it("propagates actual admission failure through a PowerShell child exit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wetscan-deadline-"));
    try {
      const child = join(dir, "synthetic.mjs");
      await writeFile(child, `import {auditDeadlineBudget} from ${JSON.stringify(pathToFileURL(resolve("scripts/sentinel-audit-procedure.mjs")).href)}; import {runAuditStages} from ${JSON.stringify(pathToFileURL(resolve("scripts/sentinel-audit-diagnostics.mjs")).href)};const b=auditDeadlineBudget(1800000210000,()=>1800000040001,()=>0);let databaseConnections=0;const r=await runAuditStages([{name:'admission',run:async()=>b.admit()},{name:'audit_execution',run:async()=>{databaseConnections++}}],async()=>{});console.log(JSON.stringify({status:r.status,databaseConnections}));process.exitCode=r.status==='PASS'?0:1;`);
      const source = `& '${process.execPath.replaceAll("'", "''")}' --import tsx '${child.replaceAll("'", "''")}'; exit $LASTEXITCODE`;
      const error = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", source], { timeout: 20000, windowsHide: true }).catch(e => e);
      expect(error.code).toBe(1); expect(JSON.parse(error.stdout)).toEqual({ status: "NOT_VERIFIED", databaseConnections: 0 });
    } finally {
      if (!dir.startsWith(join(tmpdir(), "wetscan-deadline-"))) throw Error("fixture_cleanup_boundary");
      await rm(dir, { recursive: true, force: true });
    }
  });
});
