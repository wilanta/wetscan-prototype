/**
 * G04 dispatcher: the ONLY place trigger work (scan admission, policy evaluation, check publishing, schedules) runs.
 * Webhook handlers just enqueue. Several dispatchers may run: every step is claimed atomically in PostgreSQL.
 *   GUARD_G04_ENABLED=1 node --conditions=react-server --env-file-if-exists=.env.local --import tsx scripts/guard-g04-dispatcher.ts [--once]
 */
import { spawn } from "node:child_process";
import { g04Host } from "../src/features/guard/g04/runtime";
import { loadDeployment } from "../src/features/guard/live/product-deployment";
import { reapOrphanLock } from "../src/features/guard/g04/orphan";

/** Exit code the supervisor treats as "restart me": the G02 host latched a quarantine (in-process) and must be recreated. */
const RESTART = 75;
const dockerRun = (docker: string) => (args: string[]) =>
  new Promise<{ code: number; stdout: string }>((resolve) => {
    const c = spawn(docker, args, { windowsHide: true });
    let out = "";
    c.stdout.on("data", (d) => (out += d));
    c.once("error", () => resolve({ code: 127, stdout: "" }));
    c.once("close", (code) => resolve({ code: code ?? 1, stdout: out }));
  });
async function repairHost() {
  const cfg = await loadDeployment(process.env.GUARD_PRODUCT_CONFIG_FILE).catch(() => null);
  if (!cfg) return { action: "skipped" as const };
  return reapOrphanLock({ root: cfg.value.privateRoot, docker: dockerRun(cfg.value.deployments[0].spec.docker) });
}

const once = process.argv.includes("--once"),
  intervalMs = Math.max(2000, Number(process.env.GUARD_G04_POLL_MS ?? 5000));
let stopping = false,
  unhealthy: string | null = null;
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => (stopping = true));
async function main() {
  const host = await g04Host();
  host.dispatcher.setUnhealthyHandler((reason) => (unhealthy ??= reason));
  // a previous process may have left G02's container lock behind: repair it (only ever the exact, expired, owned record) before work starts
  console.log(JSON.stringify({ event: "g04_host_repair", ...(await repairHost().catch(() => ({ action: "error" }))) }));
  console.log(JSON.stringify({ event: "g04_dispatcher_started", once, intervalMs }));
  do {
    try {
      const done = await host.dispatcher.runOnce(20);
      if (done.triggers || done.checks || done.schedules) console.log(JSON.stringify({ event: "g04_dispatch", ...done }));
    } catch {
      // Fixed code only: never SQL, provider text, tokens or source.
      console.warn(JSON.stringify({ event: "g04_dispatch_failed" }));
    }
    if (unhealthy) {
      console.warn(JSON.stringify({ event: "g04_host_unhealthy", reason: unhealthy, action: "repair_and_exit_for_restart" }));
      console.log(JSON.stringify({ event: "g04_host_repair", ...(await repairHost().catch(() => ({ action: "error" }))) }));
      await host.rt.close();
      process.exit(RESTART);
    }
    if (!once) await new Promise((r) => setTimeout(r, intervalMs));
  } while (!stopping && !once);
  await host.rt.close();
}
main().catch(() => {
  console.error(JSON.stringify({ event: "g04_dispatcher_fatal" }));
  process.exitCode = 1;
});
