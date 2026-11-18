import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);
function isolatedEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("SENTINEL_")) delete env[key];
  return env;
}
describe(
  "executable aliases cannot omit shared enforcement",
  { timeout: 20000 },
  () => {
    it.each([
      ["scripts/sentinel-provision-owner.ts", "audit-start"],
      ["scripts/sentinel-provision-owner.ts", "execute"],
      ["scripts/sentinel-provision-owner.ts", "recover"],
      ["scripts/sentinel-provision-package-owner.ts", "execute"],
      ["scripts/sentinel-provision-package-owner.ts", "recover"],
      ["scripts/sentinel-dev-acceptance.ts", "provision-and-ingest"],
    ])("%s %s stops without package context", async (script, mode) => {
      const result = await exec(
        process.execPath,
        ["--import", "tsx", script, mode],
        {
          env: isolatedEnv(),
          windowsHide: true,
          timeout: 15000,
        },
      ).catch((error) => error);
      expect(result.code).toBe(1);
      const receipt = JSON.parse(result.stderr.trim());
      if (script.endsWith("sentinel-dev-acceptance.ts")) {
        expect(receipt).toEqual({
          status: "blocked",
          reason: "provision_package_failed",
        });
      } else {
        expect(receipt.status).toBe("NOT_VERIFIED");
        expect(receipt.diagnostic.databaseConnectAttempts).toBe(0);
      }
    });
    it("an alternative import and an extra callback cannot disable the shared gate", async () => {
      const result = await exec(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          "const {runProvisionOperation}=await import('./scripts/sentinel-provision-owner.ts');try{await runProvisionOperation('execute',undefined,async()=>{});process.exitCode=9}catch{console.log('BLOCKED_BEFORE_LIVE')}",
        ],
        { env: isolatedEnv(), windowsHide: true, timeout: 15000 },
      );
      expect(result.stdout.trim()).toBe("BLOCKED_BEFORE_LIVE");
    });
    it.skipIf(process.platform !== "win32")(
      "retired PowerShell live mode stops before any fresh output is created",
      async () => {
        const root = await mkdtemp(join(tmpdir(), "wetscan-entrypoint-cli-"));
        try {
          const output = join(root, "must-stay-absent");
          const result = await exec(
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-File",
              resolve("scripts/Invoke-H04CB2ProvisionAndIngest.ps1"),
              "-ExecuteLive",
              "-OutputDir",
              output,
            ],
            { env: isolatedEnv(), windowsHide: true, timeout: 15000 },
          ).catch((error) => error);
          expect(result.code).not.toBe(0);
          expect(result.stderr).toContain(
            "legacy_live_entrypoint_retired_USE_REVIEWED_PACKAGE_STOP",
          );
          await expect(access(output)).rejects.toMatchObject({
            code: "ENOENT",
          });
        } finally {
          if (
            !basename(root).startsWith("wetscan-entrypoint-cli-") ||
            relative(resolve(tmpdir()), root).startsWith("..")
          )
            throw Error("unsafe_fixture_cleanup");
          await rm(root, { recursive: true, force: true });
        }
      },
    );
    it("guards the CookieContainer request before and after authentication side effects", async () => {
      const ps = await readFile(
        "scripts/Invoke-S04ProvisionPackage.ps1",
        "utf8",
      );
      const request = ps.indexOf("  Invoke-ProvisionAuthenticatedGet ");
      expect(ps.indexOf("'package-before-get'")).toBeLessThan(request);
      expect(ps.indexOf("'package-after-get'")).toBeGreaterThan(request);
    });
  },
);
