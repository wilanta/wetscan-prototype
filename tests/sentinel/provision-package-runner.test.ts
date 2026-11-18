import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  readProvisionResponse,
  runProvisionOperation,
} from "../../scripts/sentinel-provision-owner";

const exec = promisify(execFile);
describe("package runner default-off and STOP boundaries", () => {
  it("consumes an HTTP body before auditing and never returns it through a failed boundary", async () => {
    const response = new Response('{"synthetic":true}', { status: 200 });
    await expect(readProvisionResponse(response)).rejects.toThrow();
    expect(response.bodyUsed).toBe(true);
  });
  it("rejects an incomplete package before consulting authentication inputs", async () => {
    const result = await exec(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/sentinel-provision-package-check.ts",
        "preflight",
        "--cookie=SYNTHETIC_WRONG_SELECTION",
      ],
      { windowsHide: true },
    ).catch((e) => e);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr.trim())).toMatchObject({
      status: "NOT_VERIFIED",
      classification: "explicit_candidate_required",
      databaseConnections: 0,
      providerRequests: 0,
    });
  });
  it("rejects unknown checker flags before reading actual auth files", async () => {
    const result = await exec(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/sentinel-provision-package-check.ts",
        "preflight",
        "--skip-validation=yes",
      ],
      { windowsHide: true },
    ).catch((e) => e);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr.trim()).classification).toBe(
      "argument_scope",
    );
  });
  it("rejects missing runtime package authorization before constructing a DB pool", async () => {
    const env = { ...process.env };
    for (const key of Object.keys(env))
      if (key.startsWith("SENTINEL_")) delete env[key];
    const result = await exec(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/sentinel-provision-package-owner.ts",
        "audit-start",
      ],
      { env, windowsHide: true },
    ).catch((e) => e);
    expect(result.code).toBe(1);
    const failure = JSON.parse(result.stderr.trim());
    expect(failure.status).toBe("NOT_VERIFIED");
    expect(failure.diagnostic.databaseConnectAttempts).toBe(0);
  });
  it("ignores an extra callback argument instead of allowing it to replace the mandatory guard", async () => {
    let calls = 0;
    await expect(
      Reflect.apply(runProvisionOperation, undefined, [
        "audit-start",
        undefined,
        async () => {
          calls++;
        },
      ]),
    ).rejects.toThrow();
    expect(calls).toBe(0);
  });
  it.skipIf(process.platform !== "win32")(
    "default PowerShell invocation creates no runtime work",
    async () => {
      const { stdout } = await exec(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-File",
          resolve("scripts/Invoke-S04ProvisionPackage.ps1"),
        ],
        { windowsHide: true, timeout: 15000 },
      );
      expect(JSON.parse(stdout)).toEqual({
        status: "OFFLINE_ONLY_INPUTS_REQUIRED",
        executionPerformed: false,
        databaseConnections: 0,
        providerRequests: 0,
      });
    },
  );
  it.skipIf(process.platform !== "win32")(
    "parses the exact new owner procedure in Windows PowerShell 5.1",
    async () => {
      const file = resolve("scripts/Invoke-S04ProvisionPackage.ps1").replaceAll(
        "'",
        "''",
      );
      const { stdout } = await exec(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `$t=$null;$e=$null;$null=[Management.Automation.Language.Parser]::ParseFile('${file}',[ref]$t,[ref]$e);Write-Output @($e).Count`,
        ],
        { windowsHide: true },
      );
      expect(stdout.trim()).toBe("0");
    },
  );
  it("preserves watchdog, explicit grants, owned cleanup and both approval closures", async () => {
    const text = await readFile(
      "scripts/Invoke-S04ProvisionPackage.ps1",
      "utf8",
    );
    expect(text).toContain("fresh_owner_grant_required_STOP");
    expect(text).not.toContain("sentinel-dev-acceptance.ts");
    expect(text).toContain("Close-ProvisionApprovals $output");
    expect(text).toContain("Assert-ProvisionWatchdogCleanup");
    expect(text.indexOf("'sentinel-provision-watchdog.ps1'")).toBeLessThan(
      text.indexOf("$packageCheck,'begin'"),
    );
    expect(text.indexOf("Close-ProvisionApprovals $output")).toBeLessThan(
      text.indexOf("$packageCheck,'finish'"),
    );
  });
});
