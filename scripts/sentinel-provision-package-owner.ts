// Compatibility CLI adapter. Security enforcement lives inside the shared owner.
import { runProvisionOperation } from "./sentinel-provision-owner";
import {
  provisionDiagnostics,
  provisionFailure,
} from "./sentinel-provision-diagnostics";
const mode = process.argv[2] ?? "offline";
const diagnostic = provisionDiagnostics(mode);
runProvisionOperation(mode, diagnostic).catch((error) => {
  console.error(JSON.stringify(provisionFailure(error, diagnostic)));
  process.exitCode = 1;
});
