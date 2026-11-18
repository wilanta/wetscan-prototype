import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  AuditStageError,
  commandTimeout,
  runAuditNative,
  runAuditStages,
  safeFailure,
} from "../../scripts/sentinel-audit-diagnostics.mjs";
import { infrastructureStages } from "../../scripts/sentinel-audit-infrastructure.mjs";
import { validateAuditNativeEvidence } from "../../scripts/sentinel-audit-procedure.mjs";

const names = [
  "manifest_file",
  "manifest_inputs",
  "package_bindings",
  "runtime_configuration",
  "offline_audit",
  "owner_authorization",
  "container_identity",
  "container_health",
  "container_storage_port",
  "container_inventory",
  "runtime_conflicts",
  "admission",
];
describe("audit stage admission and sanitized receipts", () => {
  it.each([
    { status: "OFFLINE_READY" },
    {
      status: "OFFLINE_READY",
      phase: "preservation-audit",
      databaseConnections: 1,
      executionPerformed: false,
    },
    { status: "PASS", phase: "preservation-audit", attempts: 1 },
    {
      status: "PASS",
      phase: "preservation-audit",
      attempts: 1,
      auditExitCode: 0,
      watchdogExitCode: 0,
      cleanupErrors: ["error"],
    },
  ])("rejects incomplete or contradictory child evidence %#", (value) =>
    expect(() =>
      validateAuditNativeEvidence(
        { stdout: JSON.stringify(value) },
        value.status,
      ),
    ).toThrow(),
  );
  it("accepts complete zero-connection offline evidence", () =>
    expect(
      validateAuditNativeEvidence(
        {
          stdout: JSON.stringify({
            status: "OFFLINE_READY",
            phase: "preservation-audit",
            databaseConnections: 0,
            executionPerformed: false,
          }),
        },
        "OFFLINE_READY",
      ).databaseConnections,
    ).toBe(0));
  it("completes synthetic preflight without database/provider/provision calls", async () => {
    const receipts: unknown[] = [];
    let operations = 0;
    const result = await runAuditStages(
      names.map((name) => ({
        name,
        run: async () => {
          operations++;
        },
      })),
      async (_n: number, state: unknown) => {
        receipts.push(state);
      },
    );
    expect(result.status).toBe("PASS");
    expect(result.lastCompletedStage).toBe("admission");
    expect(operations).toBe(names.length);
    expect(receipts.length).toBe(25);
  });
  it.each(names)(
    "stops at %s; no downstream database or provider admission",
    async (failed) => {
      const called: string[] = [];
      const result = await runAuditStages(
        [...names, "audit_execution"].map((name) => ({
          name,
          run: async () => {
            called.push(name);
            if (name === failed) throw new Error("SECRET_TOKEN_VALUE");
          },
        })),
        async () => {},
      );
      expect(result.status).toBe("NOT_VERIFIED");
      expect(result.firstFailedStage).toBe(failed);
      expect(called).not.toContain("audit_execution");
      const index = names.indexOf(failed);
      expect(result.lastCompletedStage).toBe(index ? names[index - 1] : null);
      expect(JSON.stringify(result)).not.toContain("SECRET_TOKEN_VALUE");
    },
  );
  it.each([
    "manifest_missing",
    "manifest_hash",
    "dependency_missing",
    "input_hash",
  ])("retains safe code %s", async (code) => {
    const r = await runAuditStages(
      [
        {
          name: "manifest_inputs",
          run: async () => {
            throw new AuditStageError(code);
          },
        },
      ],
      async () => {},
    );
    expect(r.primaryFailure?.code).toBe(code);
  });
  it("preserves primary native exit when cleanup also fails", async () => {
    const r = await runAuditStages(
      [
        {
          name: "container_identity",
          run: async () => {
            throw new AuditStageError("native_exit", {
              exitCode: 17,
              stdoutBytes: 0,
              stderrBytes: 99,
              raw: "SECRET_COOKIE",
            });
          },
        },
      ],
      async () => {},
      async () => {
        throw new Error("SECRET_CLEANUP");
      },
    );
    expect(r.primaryFailure?.exitCode).toBe(17);
    expect(r.cleanupFailures).toHaveLength(1);
    expect(r.status).toBe("NOT_VERIFIED");
    expect(JSON.stringify(r)).not.toMatch(/SECRET|raw/);
  });
  it.each([1, 2, 3])(
    "diagnostic failure at write %s never permits the next operation",
    async (failAt) => {
      let writes = 0,
        downstream = 0;
      const r = await runAuditStages(
        [
          { name: "manifest_file", run: async () => {} },
          {
            name: "audit_execution",
            run: async () => {
              downstream++;
            },
          },
        ],
        async () => {
          if (++writes === failAt) throw new Error("SECRET_DISK");
        },
      );
      expect(r.status).toBe("NOT_VERIFIED");
      expect(downstream).toBe(0);
      expect(r.primaryFailure?.code).toBe("diagnostic_write");
    },
  );
  it("final receipt failure cannot become PASS", async () => {
    let n = 0;
    const r = await runAuditStages(
      [{ name: "only", run: async () => {} }],
      async () => {
        if (++n === 3) throw Error("disk");
      },
    );
    expect(r.status).toBe("NOT_VERIFIED");
    expect(r.firstFailedStage).toBe("final_receipt");
  });
  it("does not copy arbitrary diagnostic properties", () => {
    const r = safeFailure(
      new AuditStageError("NOT_A_CODE_SECRET", {
        exitCode: 4,
        stdoutBytes: 3,
        stderrBytes: 4,
        message: "SECRET",
        environment: "SECRET",
        cookie: "SECRET",
      }),
      "manifest_file",
    );
    expect(r.code).toBe("validation_failed");
    expect(JSON.stringify(r)).not.toMatch(/SECRET|environment|cookie/);
  });
  it("rounds timeout budgets down and fails after the fixed total bound", () => {
    expect(commandTimeout(0, 15000.25)).toBe(4999);
    expect(() => commandTimeout(0, 20000)).toThrow();
  });
});

describe(
  "native stream collection (synthetic processes only)",
  { timeout: 30000 },
  () => {
    const ps = "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
    const encoded = (script: string) => [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ];
    it.each(["missing", "modified"])(
      "PowerShell bootstrap preserves %s manifest failure without starting the coordinator",
      async (mode) => {
        const dir = await mkdtemp(join(tmpdir(), "wetscan-bootstrap-fixture-"));
        try {
          const manifest = join(dir, "manifest.json");
          if (mode === "modified") await writeFile(manifest, "{}");
          const failure = await promisify(execFile)(
            ps,
            [
              "-NoProfile",
              "-NonInteractive",
              "-File",
              resolve("scripts/Invoke-S04AuditProcedure.ps1"),
              "-InputManifestFile",
              manifest,
              "-InputManifestSha256",
              "0".repeat(64),
            ],
            { timeout: 20000, windowsHide: true },
          ).catch((e) => e as { code: number; stdout: string; stderr: string });
          expect("code" in failure && failure.code).toBe(1);
          expect(failure.stderr).toBe("");
          const result = JSON.parse(failure.stdout);
          expect(result.status).toBe("NOT_VERIFIED");
          expect(result.primaryFailure.stage).toBe("manifest_file");
          const stored = JSON.parse(
            await readFile(
              join(result.evidenceDirectory, "launcher-result.sanitized.json"),
              "utf8",
            ),
          );
          expect(stored.lastCompletedStage).toBe("private_evidence");
          expect(stored.firstFailedStage).toBe("manifest_file");
          expect(
            await readFile(
              join(result.evidenceDirectory, "owned-processes.jsonl"),
              "utf8",
            ),
          ).toBe("");
        } finally {
          if (!dir.startsWith(join(tmpdir(), "wetscan-bootstrap-fixture-")))
            throw Error("fixture_cleanup_boundary");
          await rm(dir, { recursive: true, force: true });
        }
      },
    );
    it("captures a success object", async () =>
      expect(
        (
          await runAuditNative(
            process.execPath,
            ["-e", "console.log('{}')"],
            10000,
          )
        ).exitCode,
      ).toBe(0));
    it.each([
      {
        code: "process.stderr.write('SECRET_REFRESH_TOKEN');process.exit(17)",
        expected: "native_exit",
        exit: 17,
      },
      {
        code: "process.stderr.write('SECRET_COOKIE');console.log('{}')",
        expected: "native_stderr",
        exit: 0,
      },
      { code: "process.exit(0)", expected: "native_empty", exit: 0 },
    ])("fails closed for $expected", async (f) => {
      const error = await runAuditNative(
        process.execPath,
        ["-e", f.code],
        10000,
      ).catch((e: unknown) => e);
      const safe = safeFailure(error, "synthetic");
      expect(safe.code).toBe(f.expected);
      expect(safe.exitCode).toBe(f.exit);
      expect(JSON.stringify(safe)).not.toContain("SECRET");
    });
    it("captures startup failure with no invented exit code", async () => {
      const error = await runAuditNative(
        resolve(tmpdir(), "missing-wetscan-fixture-executable.exe"),
        [],
        1000,
      ).catch((e: unknown) => e);
      expect(safeFailure(error, "synthetic").code).toBe("native_start");
      expect(safeFailure(error, "synthetic").exitCode).toBeNull();
    });
    it("times out and terminates only its synthetic process tree", async () => {
      const error = await runAuditNative(
        process.execPath,
        ["-e", "setInterval(()=>{},1000)"],
        300,
      ).catch((e: unknown) => e);
      expect(safeFailure(error, "synthetic").code).toBe("native_timeout");
      expect(safeFailure(error, "synthetic").timedOut).toBe(true);
    });
    it.skipIf(process.platform !== "win32")(
      "records terminating and non-terminating PowerShell failures",
      async () => {
        for (const [script, expected, exit] of [
          ["throw 'SECRET_ACCESS_TOKEN'", "native_exit", 1],
          [
            "Write-Error 'SECRET_COOKIE' -ErrorAction Continue; Write-Output '{}'",
            "native_stderr",
            0,
          ],
        ] as const) {
          const error = await runAuditNative(ps, encoded(script), 15000).catch(
            (e: unknown) => e,
          );
          const safe = safeFailure(error, "synthetic");
          expect(safe.code).toBe(expected);
          expect(safe.exitCode).toBe(exit);
          expect(safe.stderrBytes).toBeGreaterThan(0);
          expect(JSON.stringify(safe)).not.toContain("SECRET");
        }
      },
    );
    it.skipIf(process.platform !== "win32")(
      "reproduces the historical generic catch losing the original error",
      async () => {
        const dir = await mkdtemp(join(tmpdir(), "wetscan-old-capture-"));
        try {
          const script = `$ErrorActionPreference='Stop'; $failure=$null; try { & '${process.execPath.replaceAll("'", "''")}' -e "process.stderr.write('SYNTHETIC_ORIGINAL_ERROR');process.exit(17)" 1> '${join(dir, "out").replaceAll("'", "''")}' 2> '${join(dir, "err").replaceAll("'", "''")}'; } catch {$failure='reviewed_procedure_STOP_NO_RETRY'}; @{failure=$failure;stderrLength=(Get-Item '${join(dir, "err").replaceAll("'", "''")}').Length}|ConvertTo-Json`;
          const { stdout } = await promisify(execFile)(ps, encoded(script), {
            timeout: 15000,
            windowsHide: true,
          });
          const r = JSON.parse(stdout);
          expect(r.failure).toBe("reviewed_procedure_STOP_NO_RETRY");
          expect(r.stderrLength).toBe(0);
          expect(await readFile(join(dir, "err"), "utf8")).not.toContain(
            "SYNTHETIC_ORIGINAL_ERROR",
          );
        } finally {
          if (!dir.startsWith(join(tmpdir(), "wetscan-old-capture-")))
            throw Error("fixture_cleanup_boundary");
          await rm(dir, { recursive: true, force: true });
        }
      },
    );
  },
);

describe("infrastructure uses only injected read-only metadata", () => {
  it("validates a complete fixture and never calls a real Docker/provider/database", async () => {
    const bindings = {
      target: {
        containerId: "fixture",
        containerName: "fixture-pg",
        imageId: "digest",
        volume: "fixture-volume",
      },
    };
    const ports = { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "55432" }] };
    const c = {
      Id: "fixture",
      Name: "/fixture-pg",
      Image: "digest",
      Config: { Image: "fixture", Labels: {} },
      State: {
        Running: true,
        Status: "running",
        Health: { Status: "healthy" },
      },
      HostConfig: {
        RestartPolicy: { Name: "no", MaximumRetryCount: 0 },
        PortBindings: ports,
      },
      NetworkSettings: { Ports: ports },
      Mounts: [],
    };
    const prior = {
      container: { image: "fixture", bindings: ports, mounts: [] },
      volume: {
        name: "fixture-volume",
        driver: "local",
        createdAt: "old",
        mountpoint: "fixture",
        scope: "local",
      },
    };
    const inventory = [
      {
        id: "fixture",
        name: "/fixture-pg",
        imageId: "digest",
        restartPolicy: "no",
      },
    ];
    let calls = 0;
    const native = async (_exe: string, args: string[]) => {
      calls++;
      let value;
      if (args.includes("volume"))
        value = [
          {
            Name: "fixture-volume",
            Driver: "local",
            CreatedAt: "old",
            Mountpoint: "fixture",
            Scope: "local",
          },
        ];
      else if (args.includes("ps")) return { stdout: "fixture" };
      else if (args.includes("inspect")) value = args.includes("--format") ? c : [c];
      else return { stdout: "0" };
      return { stdout: JSON.stringify(value) };
    };
    const stages = infrastructureStages(
      bindings,
      prior,
      inventory,
      native,
      () => 0,
    );
    const r = await runAuditStages(stages, async () => {});
    expect(r.status).toBe("PASS");
    expect(calls).toBe(5);
  });
});
