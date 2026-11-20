import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { openG04 } from "../../../src/features/guard/g04/db";

/** Environment references of the isolated G04 environment (pointer written by `GUARD_LOCAL_ENV=g04 ... guard-g02-local-env.ts provision`). */
export function g04Env(): Record<string, string> {
  const pointer = process.env.G04_ENV_POINTER ?? join(process.env.LOCALAPPDATA ?? ".", "WetScanGuardG04", "current.json"),
    root = JSON.parse(readFileSync(pointer, "utf8")).root as string;
  const f = (n: string) => resolve(root, n);
  return { GUARD_DB_APP_APPROVAL_FILE: f("app.database.json"), GUARD_DB_APP_PASSWORD_FILE: f("app.password"), GUARD_DB_WORKER_APPROVAL_FILE: f("worker.database.json"), GUARD_DB_WORKER_PASSWORD_FILE: f("worker.password") };
}
export const openTestRuntime = () => openG04(g04Env());
/** Unique scope per test run: no DELETE privilege exists, so tests isolate by data, not cleanup. */
const used: { workspaceId: string; projectId: string }[] = [];
export function freshScope() {
  const n = String(Math.floor(Math.random() * 9e9) + 1e9),
    s = { workspaceId: "github-user-" + n + ":w", projectId: "github-" + n, repositoryId: n };
  used.push(s);
  return s;
}
/** Leave no runnable rows behind (there is no DELETE): a later dispatcher or test must not inherit this run's work. */
export async function cancelLeftovers(rt: { appStore: { cancelAllOpen(s: { workspaceId: string; projectId: string }, note: string): Promise<number>; disableSchedules(s: { workspaceId: string; projectId: string }): Promise<number> } }) {
  for (const s of used) {
    await rt.appStore.cancelAllOpen(s, "test_cleanup");
    await rt.appStore.disableSchedules(s);
  }
}
