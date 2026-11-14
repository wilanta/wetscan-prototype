/** Process-independent orchestration. Not wired to a public API or production scheduler. */
import type {
  AuthorizedSnapshot,
  Engine,
  Grant,
  PersistencePort,
  SandboxPort,
  ScanJob,
  ScannerPort,
  Scope,
  SnapshotPort,
} from "../../src/features/guard/contracts";
import { transition } from "../../src/features/guard/pipeline";
import { deduplicate } from "../../src/features/guard/evidence";
import {
  authorize,
  GuardError,
  safePath,
} from "../../src/features/guard/security";
export function validateSnapshot(
  grant: Grant,
  job: ScanJob,
  snapshot: AuthorizedSnapshot,
): void {
  authorize(grant, snapshot, "scan");
  if (
    snapshot.workspaceId !== job.workspaceId ||
    snapshot.projectId !== job.projectId ||
    snapshot.mode !== job.mode ||
    snapshot.expiresAt <= Date.now() ||
    JSON.stringify(snapshot.repository) !== JSON.stringify(job.repository) ||
    !/^[a-f0-9]{64}$/.test(snapshot.digest) ||
    snapshot.files.length > 5000 ||
    new Set(snapshot.files.map((f) => f.path)).size !== snapshot.files.length
  )
    throw new GuardError("forbidden", "Invalid authorized immutable snapshot.");
  let total = 0;
  for (const file of snapshot.files) {
    safePath(file.path);
    total += file.size;
    if (
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      file.size > 65536 ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      total > 20 * 1024 * 1024
    )
      throw new GuardError(
        "invalid_input",
        "Snapshot file/resource limit exceeded.",
      );
  }
}
export interface WorkerPorts {
  storage: PersistencePort;
  snapshots: SnapshotPort;
  sandbox: SandboxPort;
  scanners: ScannerPort[];
}
/** The production queue must additionally lease jobs, bound global concurrency and persist retry/cancel requests. */
export async function executeScopedJob(
  ports: WorkerPorts,
  grant: Grant,
  scope: Scope,
  jobId: string,
  signal: AbortSignal,
): Promise<ScanJob> {
  authorize(grant, scope, "scan");
  let job = await ports.storage.get(grant, scope, jobId);
  if (!job)
    throw new GuardError(
      "invalid_input",
      "Scan job not found in this project.",
    );
  if (job.status !== "queued") return job;
  let snapshot: AuthorizedSnapshot | undefined;
  const save = async (next: ScanJob) => {
    await ports.storage.save(grant, next);
    job = next;
  };
  try {
    await save(transition(job, "preparing", grant.actorId));
    const sandbox = ports.sandbox;
    if (
      !sandbox.ready ||
      !sandbox.readOnly ||
      !sandbox.nonRoot ||
      !sandbox.egressControlled ||
      sandbox.cpuLimit < 1 ||
      sandbox.cpuLimit > 2 ||
      sandbox.memoryMb < 64 ||
      sandbox.memoryMb > 2048 ||
      sandbox.pidsLimit < 1 ||
      sandbox.pidsLimit > 128 ||
      sandbox.timeoutMs < 1 ||
      sandbox.timeoutMs > 120000
    )
      throw new GuardError(
        "not_configured",
        "Enforcing scanner sandbox is not configured.",
      );
    if (signal.aborted) throw new Error("cancelled");
    snapshot = await ports.snapshots.acquire(grant, {
      ...job,
      engines: job.requestedEngines,
    });
    validateSnapshot(grant, job, snapshot);
    await save(transition(job, "running", grant.actorId));
    for (const engine of job.requestedEngines) {
      if (signal.aborted) throw new Error("cancelled");
      const scanner = ports.scanners.find((s) => s.engine === engine);
      if (!scanner) continue;
      const startedAt = new Date().toISOString(),
        started = performance.now(),
        controller = new AbortController();
      let timedOut = false;
      const relay = () => controller.abort();
      signal.addEventListener("abort", relay, { once: true });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          scanner.execute(snapshot, controller.signal),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              timedOut = true;
              controller.abort();
              reject(new Error("timeout"));
            }, sandbox.timeoutMs);
            controller.signal.addEventListener(
              "abort",
              () => reject(new Error("cancelled")),
              { once: true },
            );
          }),
        ]);
        if (signal.aborted) throw new Error("cancelled");
        if (
          result.run.status === "not_applicable" &&
          (!result.run.reason || result.findings.length)
        )
          throw new GuardError(
            "invalid_input",
            "Not applicable requires a reason and no findings.",
          );
        if (
          result.run.engine !== engine ||
          !["completed", "not_applicable"].includes(result.run.status) ||
          !result.run.scanner ||
          !result.run.version ||
          !result.run.rulePack
        )
          throw new GuardError(
            "invalid_input",
            "Scanner result lacks completed provenance.",
          );
        for (const f of result.findings) {
          authorize(grant, f, "scan");
          if (
            f.source.engine !== engine ||
            !f.evidence.length ||
            f.evidence.some(
              (e) =>
                e.commit !== job!.repository.commit ||
                !/^[a-f0-9]{64}$/.test(e.artifactDigest) ||
                e.synthetic !== (job!.mode === "demo"),
            )
          )
            throw new GuardError(
              "invalid_input",
              "Scanner evidence scope/version mismatch.",
            );
        }
        const run = {
          ...result.run,
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: Math.round(performance.now() - started),
        };
        await save({
          ...job,
          runs: job.runs.map((r) => (r.engine === engine ? run : r)),
          findings: deduplicate([...job.findings, ...result.findings]),
        });
      } catch {
        if (signal.aborted) throw new Error("cancelled");
        await save({
          ...job,
          runs: job.runs.map((r) =>
            r.engine === engine
              ? {
                  ...r,
                  status: timedOut ? "timed_out" : "failed",
                  reason: timedOut
                    ? "Scanner time limit reached; coverage incomplete."
                    : "Scanner failed validation or execution; coverage incomplete.",
                  startedAt,
                  finishedAt: new Date().toISOString(),
                  durationMs: Math.round(performance.now() - started),
                }
              : r,
          ),
        });
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", relay);
        controller.abort();
      }
    }
    await save(transition(job, "normalizing", grant.actorId));
    const selected = job.runs.filter((r) =>
      job!.requestedEngines.includes(r.engine),
    );
    await save(
      transition(
        job,
        selected.every((r) =>
          ["completed", "not_applicable"].includes(r.status),
        )
          ? "completed"
          : selected.some((r) => r.status === "completed")
            ? "completed_partial"
            : "failed",
        grant.actorId,
      ),
    );
  } catch (error) {
    if (
      !["completed", "completed_partial", "failed", "cancelled"].includes(
        job.status,
      )
    ) {
      const next = transition(
        job,
        signal.aborted ? "cancelled" : "failed",
        grant.actorId,
      );
      next.audit.push({
        actorId: grant.actorId,
        at: new Date().toISOString(),
        action: "worker_stopped",
        subjectId: job.id,
        reason: error instanceof GuardError ? error.code : "execution_stopped",
      });
      await save(next);
    }
  } finally {
    if (snapshot) await ports.snapshots.dispose(snapshot);
  }
  return job;
}
export function unavailableEngines(job: ScanJob): Engine[] {
  return job.runs.filter((r) => r.status !== "completed").map((r) => r.engine);
}
