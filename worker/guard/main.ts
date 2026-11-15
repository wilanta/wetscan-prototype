import { LiveGuardError } from "../../src/features/guard/live/model";
import { receiveWorkerBoot, startApprovedWorker } from "./bootstrap";
/** No dotenv, ambient Auth store or automatic DB activation. Direct CLI invocation remains denied. */
async function main() {
  if (
    process.env.GUARD_WORKER_LAUNCH !== "1" ||
    !process.connected ||
    !process.send
  )
    throw new LiveGuardError("approval_required");
  const approval = await receiveWorkerBoot(process);
  await startApprovedWorker({
    approval,
    environment: process.env,
    control: process,
  });
}
main().catch(() => {
  console.error(
    JSON.stringify({
      module: "guard",
      status: "not_started_or_failed",
      reason: "worker_unavailable",
      databaseMigration: "never_automatic",
      scannerExecution: "G02_NOT_CONFIGURED",
    }),
  );
  process.exitCode = 2;
  if (process.connected) process.disconnect?.();
});
