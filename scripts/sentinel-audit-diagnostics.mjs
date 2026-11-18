// Native output is memory-only. Receipts contain an explicit metadata allowlist.
import { spawn, execFile } from "node:child_process";

export class AuditStageError extends Error {
  constructor(code, details = {}) {
    super("audit_preflight_failed");
    this.code = code;
    this.details = details;
  }
}
const codes = new Set([
  "validation_failed",
  "manifest_missing",
  "manifest_hash",
  "input_hash",
  "dependency_missing",
  "native_start",
  "native_exit",
  "native_stderr",
  "native_empty",
  "native_timeout",
  "native_output_limit",
  "native_cleanup",
  "diagnostic_write",
  "invalid_evidence",
  "owner_authorization",
  "ambient_override",
]);
export function safeFailure(error, stage) {
  const d = error instanceof AuditStageError ? error.details : {};
  return {
    stage,
    code:
      error instanceof AuditStageError && codes.has(error.code)
        ? error.code
        : "validation_failed",
    errorClass:
      error instanceof AuditStageError
        ? "AuditStageError"
        : "UnhandledException",
    exitCode: Number.isInteger(d.exitCode) ? d.exitCode : null,
    stdoutBytes: Number.isSafeInteger(d.stdoutBytes) ? d.stdoutBytes : 0,
    stderrBytes: Number.isSafeInteger(d.stderrBytes) ? d.stderrBytes : 0,
    timedOut: d.timedOut === true,
    osErrorCode: ["ENOENT", "EACCES", "ETIMEDOUT"].includes(d.osErrorCode)
      ? d.osErrorCode
      : null,
    nativeDiagnostic: [
      "docker_linux_engine_pipe_missing",
      "docker_container_not_found",
    ].includes(d.nativeDiagnostic)
      ? d.nativeDiagnostic
      : null,
  };
}
export function requireAudit(value, code = "validation_failed") {
  if (!value) throw new AuditStageError(code);
}
export function classifyAuditNativeFailure(executable, stderr) {
  if (
    executable.replaceAll("\\", "/").toLowerCase() !==
    "c:/users/sheil/appdata/local/programs/dockerdesktop/resources/bin/docker.exe"
  )
    return null;
  if (
    stderr.includes("dockerDesktopLinuxEngine") &&
    /The system cannot find the file specified/i.test(stderr)
  )
    return "docker_linux_engine_pipe_missing";
  return /No such (object|container)/i.test(stderr)
    ? "docker_container_not_found"
    : null;
}
export function commandTimeout(start, now, perCommand = 5000, total = 20000) {
  const remaining = Math.floor(total - (now - start));
  requireAudit(
    Number.isSafeInteger(remaining) && remaining > 0,
    "native_timeout",
  );
  return Math.min(perCommand, remaining);
}
/** Each process is spawned once. No stdout, stderr, arguments or messages are logged. */
export function runAuditNative(executable, args, timeoutMs) {
  requireAudit(
    Number.isSafeInteger(timeoutMs) && timeoutMs > 0,
    "validation_failed",
  );
  return new Promise((accept, reject) => {
    let child,
      timer,
      failure,
      stdout = "",
      stderr = "",
      stdoutBytes = 0,
      stderrBytes = 0,
      cleanupError = false;
    let stopping, osErrorCode;
    const stop = () => {
      if (stopping || !child || child.exitCode !== null) return;
      if (process.platform === "win32") {
        // Only the process just spawned and still owned by this ChildProcess.
        stopping = new Promise((resolve) =>
          execFile(
            "C:/Windows/System32/taskkill.exe",
            ["/PID", String(child.pid), "/T", "/F"],
            { windowsHide: true, timeout: 5000 },
            (error) => {
              cleanupError = Boolean(error) && child.exitCode === null;
              resolve();
            },
          ),
        );
      } else {
        child.kill("SIGKILL");
        stopping = Promise.resolve();
      }
    };
    try {
      child = spawn(executable, args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      reject(new AuditStageError("native_start"));
      return;
    }
    child.on("error", (error) => {
      failure ??= "native_start";
      osErrorCode = error.code;
    });
    child.stdout.on("data", (bytes) => {
      stdoutBytes += bytes.length;
      if (stdoutBytes > 65536) {
        failure ??= "native_output_limit";
        stop();
      } else stdout += bytes.toString("utf8");
    });
    child.stderr.on("data", (bytes) => {
      stderrBytes += bytes.length;
      if (stderrBytes > 65536) {
        failure ??= "native_output_limit";
        stop();
      } else stderr += bytes.toString("utf8");
    });
    timer = setTimeout(() => {
      failure ??= "native_timeout";
      stop();
    }, timeoutMs);
    child.on("close", async (exitCode) => {
      clearTimeout(timer);
      if (stopping) await stopping;
      const details = {
        exitCode: failure === "native_start" ? null : exitCode,
        osErrorCode,
        stdoutBytes,
        stderrBytes,
        timedOut: failure === "native_timeout",
        nativeDiagnostic: classifyAuditNativeFailure(executable, stderr),
      };
      failure ??= cleanupError
        ? "native_cleanup"
        : exitCode !== 0
          ? "native_exit"
          : stderrBytes
            ? "native_stderr"
            : !stdout.trim()
              ? "native_empty"
              : null;
      if (failure) {
        const error = new AuditStageError(failure, details);
        error.cleanupFailed = cleanupError;
        reject(error);
      } else accept({ exitCode, stdout, stdoutBytes, stderrBytes });
    });
  });
}
/** Synthetic tests inject operations and receipt storage; production has no bypass flag. */
export async function runAuditStages(stages, write, cleanup = async () => {}) {
  /** @type {{status:string,lastCompletedStage:string|null,firstFailedStage:string|null,primaryFailure:ReturnType<typeof safeFailure>|null,cleanupFailures:object[],stages:{name:string,status:string}[]}} */
  const state = {
    status: "NOT_VERIFIED",
    lastCompletedStage: null,
    firstFailedStage: null,
    primaryFailure: null,
    cleanupFailures: [],
    stages: [],
  };
  let sequence = 0;
  const emit = async () => {
    try {
      await write(++sequence, structuredClone(state));
    } catch {
      throw new AuditStageError("diagnostic_write");
    }
  };
  for (const { name, run } of stages) {
    requireAudit(/^[a-z][a-z0-9_]{0,47}$/.test(name));
    try {
      state.stages.push({ name, status: "STARTED" });
      await emit();
      await run();
      state.stages.at(-1).status = "PASS";
      // Completion is trusted only after its durable receipt exists.
      const prior = state.lastCompletedStage;
      state.lastCompletedStage = name;
      try {
        await emit();
      } catch (error) {
        state.lastCompletedStage = prior;
        throw error;
      }
    } catch (error) {
      state.firstFailedStage = name;
      state.primaryFailure = safeFailure(error, name);
      state.stages.at(-1).status = "FAIL";
      if (error?.cleanupFailed)
        state.cleanupFailures.push({ stage: name, code: "native_cleanup" });
      break;
    }
  }
  try {
    await cleanup();
  } catch (error) {
    state.cleanupFailures.push(safeFailure(error, "cleanup"));
  }
  if (!state.primaryFailure && !state.cleanupFailures.length)
    state.status = "PASS";
  try {
    await emit();
  } catch {
    state.status = "NOT_VERIFIED";
    state.firstFailedStage ??= "final_receipt";
    state.primaryFailure ??= safeFailure(
      new AuditStageError("diagnostic_write"),
      "final_receipt",
    );
  }
  if (state.primaryFailure || state.cleanupFailures.length)
    state.status = "NOT_VERIFIED";
  return state;
}
