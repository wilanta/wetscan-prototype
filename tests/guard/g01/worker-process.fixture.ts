// Trusted process fixture: no pool, credentials, provider, listener or scanner.
import { runGuardWorker } from "../../../worker/guard/runtime";
const noWork = {
  enqueue: async () => ({ jobId: "unused", duplicate: false }),
  claim: async () => [],
  heartbeat: async () => {
    throw new Error("unused");
  },
  complete: async () => {},
  retry: async () => {},
  cancel: async () => {},
};
runGuardWorker({
  workerId: "g01-process-fixture",
  control: process,
  scopes: async () => [],
  queue: () => noWork,
  handler: async () => {},
  verifyReady: async () => {},
  close: async () => {
    process.send?.({ phase: "closed" });
  },
  report: (event) => {
    if (event.phase === "started") process.send?.({ phase: "started" });
  },
}).catch(() => {
  process.exitCode = 2;
});
