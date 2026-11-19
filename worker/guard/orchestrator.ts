import { pipelineFailureReason, type PipelinePhase } from "./source-failure";
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
import { LiveGuardError } from "../../src/features/guard/live/model";
import { within } from "../sentinel/lifecycle";
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
  if (
    job.mode === "live" &&
    (!snapshot.coverage ||
      snapshot.coverage.retrievedFiles !== snapshot.files.length ||
      (snapshot.coverage.status === "complete" &&
        (snapshot.coverage.exclusions.length !== 0 ||
          snapshot.coverage.treeTruncated)))
  )
    throw new GuardError(
      "invalid_input",
      "Live source coverage is missing or inconsistent.",
    );
}
export interface WorkerPorts {
  /** Trusted broker callback; renews authorization, never extends an old grant. */
  freshGrant?(): Promise<Grant>;
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
  const originalActor = grant.actorId;
  const refresh = async () => {
    if (ports.freshGrant) {
      const next = await ports.freshGrant();
      authorize(next, scope, "scan");
      if (next.actorId !== originalActor)
        throw new GuardError("forbidden", "Authorization changed.");
      grant = next;
    }
    authorize(grant, scope, "scan");
  };
  await refresh();
  let job = await ports.storage.get(grant, scope, jobId);
  if (!job)
    throw new GuardError(
      "invalid_input",
      "Scan job not found in this project.",
    );
  if (job.status !== "queued") return job;
  const repositoryOperation =
    job.mode === "live" &&
    job.audit.some((a) => a.action === "repository_scan_requested");
  let snapshot: AuthorizedSnapshot | undefined;
  let disposalAttempted = false;
  let phase: PipelinePhase = "preparing";
  const save = async (next: ScanJob) => {
    await refresh();
    await ports.storage.save(grant, next);
    job = next;
  };
  try {
    await save(transition(job, "preparing", grant.actorId));
    phase = "sandbox";
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
    phase = "snapshot_acquire";
    snapshot = await ports.snapshots.acquire(
      grant,
      {
        mode: job.mode,
        workspaceId: job.workspaceId,
        projectId: job.projectId,
        repository: job.repository,
        profile: job.profile,
        idempotencyKey: job.idempotencyKey,
        engines: job.requestedEngines,
      },
      signal,
    );
    phase = "snapshot_validate";
    await refresh();
    validateSnapshot(grant, job, snapshot);
    if (snapshot.coverage)
      job = {
        ...job,
        sourceCoverage: {
          status: snapshot.coverage.status,
          retrievedFiles: snapshot.coverage.retrievedFiles,
          excludedFiles: snapshot.coverage.exclusions.length,
          treeTruncated: snapshot.coverage.treeTruncated,
        },
      };
    await save(transition(job, "running", grant.actorId));
    for (const engine of job.requestedEngines) {
      phase = "scanner";
      await refresh();
      if (ports.snapshots.refresh) {
        snapshot = await ports.snapshots.refresh(snapshot, grant);
        validateSnapshot(grant, job, snapshot);
      }
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
      let scannerWork: ReturnType<ScannerPort["execute"]> | undefined;
      try {
        if (repositoryOperation)
          await save({
            ...job,
            runs: job.runs.map((r) =>
              r.engine === engine
                ? {
                    ...r,
                    status: "running",
                    startedAt,
                    reason:
                      "Qualified scanner requested; execution outcome pending.",
                  }
                : r,
            ),
          });
        scannerWork = scanner.execute(snapshot, controller.signal);
        const result = await Promise.race([
          scannerWork,
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
        if (
          job.mode === "live" &&
          job.audit.some((a) => a.action === "repository_scan_requested") &&
          result.run.status === "completed" &&
          (!/^[a-f0-9]{64}$/.test(result.run.artifactDigest ?? "") ||
            result.run.executionEvidence?.cleanup !== "VERIFIED")
        )
          throw new GuardError(
            "invalid_input",
            "Completed repository engine requires qualified execution and cleanup evidence.",
          );
        for (const f of result.findings) {
          authorize(grant, f, "scan");
          if (
            f.source.engine !== engine ||
            f.source.scanner !== result.run.scanner ||
            f.source.version !== result.run.version ||
            f.source.rulePack !== result.run.rulePack ||
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
          ...(result.inventory ? { inventory: result.inventory } : {}),
          ...(result.sbom ? { sbom: result.sbom } : {}),
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "cleanup_failed"
        )
          throw error;
        if (signal.aborted) throw new Error("cancelled");
        await save({
          ...job,
          runs: job.runs.map((r) =>
            r.engine === engine
              ? {
                  ...r,
                  status: timedOut ? "timed_out" : "failed",
                  reason: repositoryOperation
                    ? pipelineFailureReason(error, "scanner")
                    : timedOut
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
        if (repositoryOperation && scannerWork) {
          // A timeout only requests cancellation. Do not dispose source while the
          // source-owning sandbox is still completing its normal cleanup.
          let settled: PromiseSettledResult<Awaited<typeof scannerWork>>[];
          try {
            settled = await within(Promise.allSettled([scannerWork]), 10000);
          } catch {
            disposalAttempted = true; // Preserve the source; cleanup is unknown.
            throw new LiveGuardError("cleanup_failed");
          }
          const failed = settled[0];
          if (
            failed.status === "rejected" &&
            failed.reason?.code === "cleanup_failed"
          ) {
            disposalAttempted = true;
            throw new LiveGuardError("cleanup_failed");
          }
        }
      }
    }
    await save(transition(job, "normalizing", grant.actorId));
    const selected = job.runs.filter((r) =>
      job!.requestedEngines.includes(r.engine),
    );
    // A terminal success must never precede physical source cleanup. A failed cleanup is not retried silently.
    phase = "source_dispose";
    disposalAttempted = true;
    await ports.snapshots.dispose(snapshot);
    snapshot = undefined;
    phase = "final_save";
    await save(
      transition(
        job,
        selected.every((r) =>
          ["completed", "not_applicable"].includes(r.status),
        )
          ? job.sourceCoverage?.status === "partial" ||
            selected.some((r) => r.coverage?.status === "partial")
            ? "completed_partial"
            : "completed"
          : selected.some((r) => r.status === "completed")
            ? "completed_partial"
            : "failed",
        grant.actorId,
      ),
    );
  } catch (error) {
    if (
      repositoryOperation &&
      error instanceof LiveGuardError &&
      error.code === "cleanup_failed"
    )
      throw error;
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
      const reason = repositoryOperation
        ? pipelineFailureReason(error, phase)
        : error instanceof GuardError
          ? error.code
          : "execution_stopped";
      if (repositoryOperation)
        next.runs = next.runs.map((r) =>
          next.requestedEngines.includes(r.engine) &&
          !r.startedAt &&
          ["not_configured", "queued"].includes(r.status)
            ? {
                ...r,
                status: "failed" as const,
                reason: "Scanner not started; " + reason,
              }
            : r,
        );
      next.audit.push({
        actorId: grant.actorId,
        at: new Date().toISOString(),
        action: "worker_stopped",
        subjectId: job.id,
        reason,
      });
      await save(next);
    }
  } finally {
    if (snapshot && !disposalAttempted) await ports.snapshots.dispose(snapshot);
  }
  return job;
}
export function unavailableEngines(job: ScanJob): Engine[] {
  return job.runs.filter((r) => r.status !== "completed").map((r) => r.engine);
}
