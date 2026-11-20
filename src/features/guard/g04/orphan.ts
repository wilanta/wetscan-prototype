import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ResourceRegistry, type ResourceRecord } from "../../../../worker/guard/acceptance/registry";

export type DockerRun = (args: string[]) => Promise<{ code: number; stdout: string }>;
export type OrphanResult =
  | { action: "none"; reason: "no_lock" }
  | { action: "blocked"; reason: "record_unreadable" | "deadline_not_reached" | "container_running" | "not_owned" | "removal_unverified"; name?: string }
  | { action: "released"; name: string; removed: boolean };

/**
 * Operational recovery for G02's single-flight container lock (`active-container.lock`) left behind by a hung or killed session.
 * It is NOT a bypass: it only ever acts on the exact record G02 wrote, only after that record's own deadline (+ grace) has passed,
 * only on a container that carries G02's ownership labels for that exact run, and it finishes through G02's own
 * `ResourceRegistry.release(record, absenceVerified)` after verifying the container is really gone.
 */
export async function reapOrphanLock(input: { root: string; docker: DockerRun; now?: number; graceMs?: number }): Promise<OrphanResult> {
  const now = input.now ?? Date.now(),
    registry = new ResourceRegistry(input.root);
  let record: ResourceRecord;
  try {
    await readFile(join(input.root, "active-container.lock"));
  } catch {
    return { action: "none", reason: "no_lock" };
  }
  try {
    record = await registry.current();
  } catch {
    return { action: "blocked", reason: "record_unreadable" };
  }
  if (now < record.deadline + (input.graceMs ?? 120_000)) return { action: "blocked", reason: "deadline_not_reached", name: record.name };
  const probe = async () => {
    const r = await input.docker(["inspect", "--type", "container", "--format", "{{json .}}", record.name]);
    return r.code === 0 ? (JSON.parse(r.stdout) as { State?: { Status?: string }; Config?: { Labels?: Record<string, string> } }) : null;
  };
  let removed = false;
  const found = await probe();
  if (found) {
    const labels = found.Config?.Labels ?? {};
    if (labels["wetscan.module"] !== "guard" || labels["wetscan.run"] !== record.runId || labels["wetscan.job"] !== record.jobId) return { action: "blocked", reason: "not_owned", name: record.name };
    // past its deadline a still-running scanner is a hung one; G02's own deadline label says it must be gone
    if (found.State?.Status === "running" && now < record.deadline + 2 * (input.graceMs ?? 120_000)) return { action: "blocked", reason: "container_running", name: record.name };
    await input.docker(["rm", "--force", record.name]); // exact name, verified ownership above
    removed = true;
    if (await probe()) return { action: "blocked", reason: "removal_unverified", name: record.name };
  }
  await registry.release(record, true);
  return { action: "released", name: record.name, removed };
}
