"use client";
import { useSyncExternalStore } from "react";
import type { Engine, Grant, ScanJob } from "./contracts";
import { createJob, transition, triage } from "./pipeline";
import { normalizeOpengrep } from "./evidence";
import { digest } from "./security";
export const demoScope = {
  workspaceId: "orderly-demo",
  projectId: "orderly-demo",
  mode: "demo" as const,
};
export function demoGrant(): Grant {
  return {
    ...demoScope,
    actorId: "demo-reviewer",
    operations: ["read", "scan", "triage", "report"],
    expiresAt: Date.now() + 3600000,
  };
}
interface Session {
  jobs: ScanJob[];
  busy: boolean;
  error: string;
  selectedId: string | null;
}
const empty: Session = { jobs: [], busy: false, error: "", selectedId: null };
let state = empty;
let active: AbortController | null = null;
const listeners = new Set<() => void>();
function publish(next: Session) {
  state = next;
  listeners.forEach((l) => l());
}
function replace(job: ScanJob) {
  publish({
    ...state,
    jobs: [job, ...state.jobs.filter((j) => j.id !== job.id)].slice(0, 20),
    selectedId: job.id,
  });
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useGuardDemo() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => empty,
  );
}
export function resetGuardDemo() {
  active?.abort();
  active = null;
  publish(empty);
}
export function selectJob(id: string) {
  if (state.jobs.some((j) => j.id === id))
    publish({ ...state, selectedId: id });
}
export function cancelGuardDemo() {
  active?.abort();
}
export function reviewDemo(
  findingId: string,
  status:
    "under_review" | "fix_pending_retest" | "false_positive" | "risk_accepted",
  reason: string,
) {
  const job = state.jobs.find((j) => j.id === state.selectedId);
  if (!job) return;
  const target = job.findings.find((f) => f.id === findingId);
  if (!target) return;
  const result = triage(demoGrant(), target, status, reason);
  replace({
    ...job,
    findings: job.findings.map((f) =>
      f.id === target.id ? result.finding : f,
    ),
    audit: [...job.audit, result.audit],
  });
}
/** Explicit simulation: normalized synthetic JSON, not a scanner invocation. No persistence on reload. */
export async function runGuardDemo(
  profile: ScanJob["profile"],
  selected: Engine[],
  failSast = false,
): Promise<void> {
  if (state.busy) return;
  const controller = new AbortController();
  active = controller;
  publish({ ...state, busy: true, error: "" });
  let job: ScanJob | undefined;
  const sleep = () =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        controller.signal.removeEventListener("abort", abort);
        resolve();
      }, 350);
      const abort = () => {
        clearTimeout(timer);
        reject(new Error("cancelled"));
      };
      if (controller.signal.aborted) abort();
      else controller.signal.addEventListener("abort", abort, { once: true });
    });
  try {
    job = await createJob(demoGrant(), {
      ...demoScope,
      repository: {
        provider: "github",
        repositoryId: "orderly-synthetic-fixture",
        branch: "demo-fixture",
        commit: "a".repeat(40),
      },
      profile,
      engines: selected,
      idempotencyKey: crypto.randomUUID(),
    });
    if (controller.signal.aborted) throw new Error("cancelled");
    replace(job);
    for (const next of ["preparing", "running", "normalizing"] as const) {
      await sleep();
      job = transition(job, next, "demo-reviewer");
      replace(job);
    }
    const recordedAt = new Date().toISOString();
    job.runs = job.runs.map((r) =>
      r.engine === "sast" && selected.includes("sast")
        ? {
            ...r,
            status: failSast ? "failed" : "completed",
            reason: failSast
              ? "Injected synthetic adapter failure; no coverage."
              : "Synthetic JSON normalized locally. No real scanner or repository access.",
            scanner: "demo-opengrep-format",
            version: "fixture-v1",
            rulePack: "synthetic-eval-v1",
            startedAt: job!.createdAt,
            finishedAt: recordedAt,
            durationMs: Date.now() - Date.parse(job!.createdAt),
          }
        : r,
    );
    if (selected.includes("sast") && !failSast)
      job.findings = await normalizeOpengrep(
        {
          results: [
            {
              check_id: "synthetic-eval",
              path: "fixtures/demo-handler.js",
              start: { line: 3 },
              extra: {
                message: "Synthetic input evaluation needs review",
                severity: "ERROR",
              },
            },
          ],
          errors: [],
        },
        {
          ...demoScope,
          commit: job.repository.commit,
          recordedAt,
          artifactDigest: await digest("wetscan-synthetic-eval-v1"),
          synthetic: true,
          scannerVersion: "fixture-v1",
          rulePack: "synthetic-eval-v1",
        },
      );
    if (controller.signal.aborted) throw new Error("cancelled");
    job = transition(
      job,
      job.runs.some(
        (r) => selected.includes(r.engine) && r.status !== "completed",
      )
        ? "completed_partial"
        : "completed",
      "demo-reviewer",
    );
    replace(job);
  } catch {
    if (active !== controller) return;
    if (
      job &&
      !["completed", "completed_partial", "failed", "cancelled"].includes(
        job.status,
      )
    )
      replace(
        transition(
          job,
          controller.signal.aborted ? "cancelled" : "failed",
          "demo-reviewer",
        ),
      );
    publish({
      ...state,
      error: controller.signal.aborted
        ? "Demo scan cancelled. No results were promoted to completed."
        : "Demo scan could not finish. Coverage remains incomplete.",
    });
  } finally {
    if (active === controller) {
      active = null;
      publish({ ...state, busy: false });
    }
  }
}
