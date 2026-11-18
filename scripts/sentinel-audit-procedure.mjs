import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  AuditStageError,
  requireAudit,
  runAuditNative,
  runAuditStages,
  safeFailure,
} from "./sentinel-audit-diagnostics.mjs";
import { infrastructureStages } from "./sentinel-audit-infrastructure.mjs";
import { verifyAuditPackageBindings } from "./sentinel-audit-package.ts";
import { parseObject } from "./sentinel-provision-package.ts";

const repo = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const privateRoot = path.resolve("C:/Users/sheil/.wetscan-sentinel");
const powershell = "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
export const auditProcedureTiming = Object.freeze({
  outerMs: 210000,
  auditMs: 120000,
  auditProcessMs: 150000, // Existing audit + startup/offline validation bound.
  // Coordinator cleanup (10s), native termination (5s), launcher stop wait (5s).
  cleanupReserveMs: 20000,
});
export function auditDeadlineBudget(
  deadlineUnixMs,
  wall = () => Date.now(),
  monotonic = () => performance.now(),
) {
  const startedWall = wall(), startedMonotonic = monotonic();
  requireAudit(Number.isSafeInteger(deadlineUnixMs) &&
    Number.isFinite(startedWall) && Number.isFinite(startedMonotonic) &&
    deadlineUnixMs <= startedWall + auditProcedureTiming.outerMs, "invalid_evidence");
  const initial = deadlineUnixMs - startedWall;
  const evidence = () => {
    const currentWall = wall(), elapsed = monotonic() - startedMonotonic;
    requireAudit(Number.isFinite(currentWall) && Number.isFinite(elapsed) && elapsed >= 0, "invalid_evidence");
    return {
      outerDeadlineUnixMs: deadlineUnixMs,
      remainingMs: Math.floor(Math.min(deadlineUnixMs - currentWall, initial - elapsed)),
      auditProcessMs: auditProcedureTiming.auditProcessMs,
      auditMs: auditProcedureTiming.auditMs,
      cleanupReserveMs: auditProcedureTiming.cleanupReserveMs,
    };
  };
  const requireRemaining = (minimum) => {
    const value = evidence();
    requireAudit(value.remainingMs >= minimum, "native_timeout");
    return value;
  };
  return { evidence, requireRemaining,
    admit: () => requireRemaining(auditProcedureTiming.auditProcessMs + auditProcedureTiming.cleanupReserveMs) };
}
const hash = (f) =>
  crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
function exclusive(file, value) {
  const fd = fs.openSync(file, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
export function validateAuditNativeEvidence(result, status) {
  let value;
  try {
    value = JSON.parse(result.stdout.replace(/^\uFEFF/, "").trim());
  } catch {
    throw new AuditStageError("invalid_evidence");
  }
  requireAudit(
    value && typeof value === "object" && value.status === status,
    "invalid_evidence",
  );
  if (status === "OFFLINE_READY")
    requireAudit(
      value.phase === "preservation-audit" &&
        value.databaseConnections === 0 &&
        value.executionPerformed === false,
      "invalid_evidence",
    );
  if (status === "PASS")
    requireAudit(
      value.phase === "preservation-audit" &&
        value.attempts === 1 &&
        value.auditExitCode === 0 &&
        value.watchdogExitCode === 0 &&
        Array.isArray(value.cleanupErrors) &&
        value.cleanupErrors.length === 0,
      "invalid_evidence",
    );
  return value;
}

export async function ownerAuditProcedure({
  packageDir,
  manifestSha256,
  evidenceDir,
  executeLive,
  owner,
  scope,
  outerDeadlineUnixMs,
}) {
  requireAudit(
    path.dirname(evidenceDir) === privateRoot &&
      path.basename(evidenceDir).startsWith("s04-audit-procedure-"),
  );
  requireAudit(path.dirname(packageDir) === privateRoot);
  const manifestFile = path.join(
    packageDir,
    "reviewed-audit-input-pins.private.json",
  );
  let budget, pins,
    binding,
    output,
    auditInvocations = 0;
  const record = (sequence, state) =>
    exclusive(
      path.join(
        evidenceDir,
        `stage-${String(sequence).padStart(4, "0")}.sanitized.json`,
      ),
      state,
    );
  const stages = [
    {
      name: "manifest_file",
      run: async () => {
        requireAudit(fs.existsSync(manifestFile), "manifest_missing");
        requireAudit(
          /^[a-f0-9]{64}$/.test(manifestSha256) &&
            hash(manifestFile) === manifestSha256,
          "manifest_hash",
        );
        pins = parseObject(fs.readFileSync(manifestFile));
      },
    },
    {
      name: "manifest_inputs",
      run: async () => {
        for (const [f, h] of Object.entries(pins)) {
          const s = fs.lstatSync(f);
          requireAudit(
            s.isFile() &&
              !s.isSymbolicLink() &&
              s.nlink === 1 &&
              fs.realpathSync(f) === f &&
              hash(f) === h,
            "input_hash",
          );
        }
      },
    },
    {
      name: "package_bindings",
      run: async () => {
        binding = await verifyAuditPackageBindings(
          manifestFile,
          pins,
          "C:/Users/sheil/.wetscan-sentinel/s01-20261114/secrets/migration.password",
        );
      },
    },
    {
      name: "runtime_configuration",
      run: async () => {
        requireAudit(
          !["NODE_PATH", "DOCKER_HOST", "DOCKER_CONTEXT"].some(
            (k) => process.env[k],
          ),
          "ambient_override",
        );
        if (executeLive)
          requireAudit(!process.env.NODE_OPTIONS, "ambient_override");
        requireAudit(
          binding.runtimeBinaries[path.resolve(process.execPath)] ===
            hash(process.execPath),
          "input_hash",
        );
      },
    },
    {
      name: "offline_audit",
      run: async () => {
        validateAuditNativeEvidence(
          await runAuditNative(
            process.execPath,
            [
              "--import",
              "tsx",
              path.join(repo, "scripts/sentinel-readonly-audit.ts"),
              "offline",
              "--migration-password-file=" + binding.credentialFile,
              "--input-manifest=" + manifestFile,
              "--input-manifest-sha256=" + manifestSha256,
            ],
            30000,
          ),
          "OFFLINE_READY",
        );
      },
    },
  ];
  if (executeLive) {
    stages.unshift({
      name: "deadline_evidence",
      run: async () => {
        budget = auditDeadlineBudget(outerDeadlineUnixMs);
        budget.requireRemaining(1);
      },
    });
    stages.push({
      name: "owner_authorization",
      run: async () =>
        requireAudit(
          /^[A-Za-z0-9 _:.\/-]{3,160}$/.test(owner) &&
            scope === "wetscan_dev:preservation-audit:read-only:1attempt",
          "owner_authorization",
        ),
    });
    // Metadata loaded only after the manifest guards have passed.
    for (const name of [
      "container_identity",
      "container_health",
      "container_storage_port",
      "container_inventory",
      "runtime_conflicts",
    ]) {
      stages.push({
        name,
        run: async () => {
          if (!infrastructure) {
            const prior = JSON.parse(
              fs.readFileSync(binding.infrastructureReceiptFile, "utf8"),
            );
            const inventory = JSON.parse(
              fs.readFileSync(
                path.join(
                  path.dirname(binding.infrastructureReceiptFile),
                  "containers-after.sanitized.json",
                ),
                "utf8",
              ),
            );
            infrastructure = infrastructureStages(
              binding,
              prior,
              inventory,
              runAuditNative,
              undefined,
              undefined,
              Math.max(0, Math.min(120000, budget.evidence().remainingMs -
                auditProcedureTiming.auditProcessMs - auditProcedureTiming.cleanupReserveMs)),
            );
          }
          await infrastructure.find((s) => s.name === name).run();
        },
      });
    }
    stages.push({
      name: "admission",
      run: async () => {
        const deadlineEvidence = budget.admit();
        output = path.join(
          privateRoot,
          "s04-readonly-audit-" + crypto.randomUUID().replaceAll("-", ""),
        );
        requireAudit(!fs.existsSync(output));
        exclusive(path.join(evidenceDir, "admission.sanitized.json"), {
          auditOutputDirectory: output,
          inputManifestSha256: manifestSha256,
          deadlineEvidence,
        });
      },
    });
    stages.push({
      name: "audit_execution",
      run: async () => {
        // Recheck after durable admission recording, before any child/approval.
        budget.admit();
        requireAudit(++auditInvocations === 1);
        validateAuditNativeEvidence(
          await runAuditNative(
            powershell,
            [
              "-NoProfile",
              "-NonInteractive",
              "-File",
              path.join(repo, "scripts/Invoke-S04ReadOnlyAudit.ps1"),
              "-MigrationPasswordFile",
              binding.credentialFile,
              "-InputManifestFile",
              manifestFile,
              "-InputManifestSha256",
              manifestSha256,
              "-OutputDir",
              output,
              "-ExecuteLive",
              "-OwnerAuthorization",
              owner,
              "-ConfirmScope",
              scope,
              "-OuterDeadlineUnixMs",
              String(outerDeadlineUnixMs),
            ],
            auditProcedureTiming.auditProcessMs,
          ),
          "PASS",
        );
      },
    });
    stages.push({
      name: "audit_evidence",
      run: async () => {
        const finished = JSON.parse(
          fs.readFileSync(
            path.join(output, "audit-runner-finished.json"),
            "utf8",
          ),
        );
        const approval = JSON.parse(
          fs.readFileSync(
            path.join(output, "dev-readonly-audit-approval.json"),
            "utf8",
          ),
        );
        requireAudit(
          finished.status === "PASS" &&
            finished.attempts === 1 &&
            finished.cleanupErrors.length === 0 &&
            approval.status === "CLOSED" &&
            approval.actions.length === 0 &&
            approval.closedAt &&
            approval.outputDirectory === output,
          "invalid_evidence",
        );
      },
    });
  }
  let infrastructure;
  const state = await runAuditStages(stages, record, async () => {
    if (
      !output ||
      !fs.existsSync(path.join(output, "dev-readonly-audit-approval.json"))
    )
      return;
    const a = JSON.parse(
      fs.readFileSync(
        path.join(output, "dev-readonly-audit-approval.json"),
        "utf8",
      ),
    );
    requireAudit(
      a.kind === "wetscan-s04-dev-preservation-audit" &&
        a.phase === "preservation-audit" &&
        a.outputDirectory === output &&
        /^[a-f0-9]{32}$/.test(a.runId),
    );
    const command = `$ErrorActionPreference='Stop'; . '${path.join(repo, "scripts/sentinel-readonly-audit-common.ps1").replaceAll("'", "''")}'; $e=@(Complete-ReadOnlyAuditCleanup '${output.replaceAll("'", "''")}' '${a.runId}'); if($e.Count){exit 1}; Write-Output '{"status":"CLEANUP_COMPLETE"}'`;
    validateAuditNativeEvidence(
      await runAuditNative(
        powershell,
        [
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(command, "utf16le").toString("base64"),
        ],
        10000,
      ),
      "CLEANUP_COMPLETE",
    );
  });
  let deadlineEvidence = null;
  if (budget) {
    try {
      deadlineEvidence = budget.evidence();
      budget.requireRemaining(1);
    } catch (error) {
      state.status = "NOT_VERIFIED";
      state.firstFailedStage ??= "coordinator_deadline";
      state.primaryFailure ??= safeFailure(error, "coordinator_deadline");
    }
  }
  const result = {
    ...state,
    status:
      state.status === "PASS"
        ? executeLive
          ? "PASS"
          : "OFFLINE_READY"
        : "NOT_VERIFIED",
    auditOutputDirectory: output ?? null,
    executionRequested: executeLive,
    liveAuditInvocations: auditInvocations,
    deadlineEvidence,
    overallS04Status: "IMPLEMENTED_PENDING_ACCEPTANCE",
  };
  try {
    exclusive(
      path.join(evidenceDir, "procedure-result.sanitized.json"),
      result,
    );
  } catch {
    throw new AuditStageError("diagnostic_write");
  }
  return result;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = {};
  (async () => {
    for (const a of process.argv.slice(2)) {
      const m =
        /^--(package-dir|manifest-sha256|evidence-dir|execute-live|owner|scope|outer-deadline-ms)=(.*)$/.exec(
          a,
        );
      requireAudit(m && !Object.hasOwn(args, m[1]));
      args[m[1]] = m[2];
    }
    requireAudit(args["execute-live"] === "0" || args["execute-live"] === "1");
    const result = await ownerAuditProcedure({
      packageDir: path.resolve(args["package-dir"]),
      manifestSha256: args["manifest-sha256"],
      evidenceDir: path.resolve(args["evidence-dir"]),
      executeLive: args["execute-live"] === "1",
      owner: args.owner ?? "",
      scope: args.scope ?? "",
      outerDeadlineUnixMs: /^\d{13}$/.test(args["outer-deadline-ms"] ?? "")
        ? Number(args["outer-deadline-ms"]) : undefined,
    });
    console.log(
      JSON.stringify({
        status: result.status,
        lastCompletedStage: result.lastCompletedStage,
        firstFailedStage: result.firstFailedStage,
      }),
    );
    if (result.status !== "PASS" && result.status !== "OFFLINE_READY")
      process.exitCode = 1;
  })().catch((error) => {
    console.log(
      JSON.stringify({
        status: "NOT_VERIFIED",
        primaryFailure: safeFailure(error, "bootstrap"),
      }),
    );
    process.exitCode = 1;
  });
}
