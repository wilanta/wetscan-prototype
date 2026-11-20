/**
 * G04 dispatcher: the ONLY place trigger work (scan admission, policy evaluation, check publishing, schedules) runs.
 * Webhook handlers just enqueue. Several dispatchers may run: every step is claimed atomically in PostgreSQL.
 *   GUARD_G04_ENABLED=1 node --conditions=react-server --env-file-if-exists=.env.local --import tsx scripts/guard-g04-dispatcher.ts [--once]
 */
import { g04Host } from "../src/features/guard/g04/runtime";

const once = process.argv.includes("--once"),
  intervalMs = Math.max(2000, Number(process.env.GUARD_G04_POLL_MS ?? 5000));
let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => (stopping = true));
async function main() {
  const host = await g04Host();
  console.log(JSON.stringify({ event: "g04_dispatcher_started", once, intervalMs }));
  do {
    try {
      const done = await host.dispatcher.runOnce(20);
      if (done.triggers || done.checks || done.schedules) console.log(JSON.stringify({ event: "g04_dispatch", ...done }));
    } catch {
      // Fixed code only: never SQL, provider text, tokens or source.
      console.warn(JSON.stringify({ event: "g04_dispatch_failed" }));
    }
    if (!once) await new Promise((r) => setTimeout(r, intervalMs));
  } while (!stopping && !once);
  await host.rt.close();
}
main().catch(() => {
  console.error(JSON.stringify({ event: "g04_dispatcher_fatal" }));
  process.exitCode = 1;
});
