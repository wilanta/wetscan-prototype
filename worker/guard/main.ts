import { LiveGuardError } from "../../src/features/guard/live/model";
/** No dotenv loader or automatic DB/worker activation. Auth broker/runtime target approval is a separate owner handoff. */
async function main() {
  // Existing Auth store serializes only inside one Node process; do not share refresh-token writes with a second process.
  // A fresh-auth broker/capability resolver must be approved before installing the standalone process bindings.
  throw new LiveGuardError("approval_required");
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      module: "guard",
      status: "not_started",
      reason: error instanceof LiveGuardError ? error.code : "not_configured",
      databaseMigration: "never_automatic",
      scannerExecution: "G02_NOT_CONFIGURED",
    }),
  );
  process.exitCode = 2;
});
