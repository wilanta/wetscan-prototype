import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { referenceEmitter } from "../src/features/sentinel/telemetry/emitter";
import {
  TelemetryError,
  kinds,
} from "../src/features/sentinel/telemetry/validation";

async function main() {
  if (
    process.env.SENTINEL_EMITTER_ENABLED !== "1" ||
    process.env.SENTINEL_EMITTER_OWNED_APP_CONFIRMED !== "1"
  )
    throw new TelemetryError("emitter_opt_in_required");
  const file = process.env.SENTINEL_INGEST_CREDENTIAL_FILE;
  if (!file || !isAbsolute(file))
    throw new TelemetryError("credential_file_required");
  const endpoint = process.env.SENTINEL_INGEST_ENDPOINT;
  if (!endpoint) throw new TelemetryError("local_endpoint_required");
  const emitter = referenceEmitter({
    enabled: true,
    ownedApplicationConfirmed: true,
    endpoint,
    credential: (await readFile(file, "utf8")).trim(),
  });
  const batch = emitter.prepare(
    kinds.map((kind) => ({
      kind,
      severityHint: "info",
      request: { method: "GET", routeTemplate: "/api/decoy", statusCode: 200 },
      attributes: { reasonCode: "controlled_probe" },
    })),
  );
  console.log(
    JSON.stringify({
      outcome: "accepted_by_receiver",
      ...(await emitter.send(batch)),
    }),
  );
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "NOT_ACCEPTED",
      reason:
        error instanceof TelemetryError
          ? error.code
          : "emitter_configuration_invalid",
    }),
  );
  process.exitCode = 1;
});
