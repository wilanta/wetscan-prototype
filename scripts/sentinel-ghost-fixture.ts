import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { startGhostFixture } from "../src/features/sentinel/ghost/decoy";
import { DEFAULT_GHOST_DECOY_PATH } from "../src/features/sentinel/ghost/model";
import { TelemetryError } from "../src/features/sentinel/telemetry/validation";

async function main() {
  if (
    process.env.SENTINEL_GHOST_ENABLED !== "1" ||
    process.env.SENTINEL_GHOST_OWNED_APP_CONFIRMED !== "1"
  )
    throw new TelemetryError("ghost_opt_in_required");
  const credentialFile = process.env.SENTINEL_INGEST_CREDENTIAL_FILE;
  if (!credentialFile || !isAbsolute(credentialFile))
    throw new TelemetryError("credential_file_required");
  const ingestEndpoint = process.env.SENTINEL_INGEST_ENDPOINT;
  if (!ingestEndpoint) throw new TelemetryError("local_endpoint_required");

  const port = Number(process.env.SENTINEL_GHOST_PORT ?? 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new TelemetryError("invalid_port");

  const rateLimitPerMinute = Number(
    process.env.SENTINEL_GHOST_RATE_LIMIT ?? 30,
  );
  const decoyPath =
    process.env.SENTINEL_GHOST_DECOY_PATH || DEFAULT_GHOST_DECOY_PATH;
  const rawStatus = Number(process.env.SENTINEL_GHOST_RESPONSE_STATUS ?? 200);
  if (rawStatus !== 200 && rawStatus !== 204 && rawStatus !== 404)
    throw new TelemetryError("invalid_response_status");

  const fixture = await startGhostFixture({
    enabled: true,
    ownedApplicationConfirmed: true,
    decoyPath,
    responseStatus: rawStatus,
    rateLimitPerMinute,
    ingestEndpoint,
    credentialFile,
    port,
    onEmitError: (code) => {
      console.error(JSON.stringify({ event: "ghost_emit_error", code }));
    },
  });

  console.log(
    JSON.stringify({
      event: "ghost_fixture_started",
      url: fixture.url,
      decoyPath: fixture.decoyPath,
      loopbackOnly: true,
    }),
  );
  let stopped = false;
  const shutdown = () => {
    if (stopped) return;
    stopped = true;
    void fixture.stop().then(() => {
      if (process.connected) process.disconnect?.();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGBREAK", shutdown);
  if (process.connected) {
    process.on("message", (msg: unknown) => {
      const m = msg as { type?: unknown } | null;
      if (m?.type === "sentinel.shutdown") shutdown();
    });
    process.on("disconnect", shutdown);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        status: "NOT_STARTED",
        reason:
          error instanceof TelemetryError
            ? error.code
            : "ghost_fixture_configuration_invalid",
      }),
    );
    process.exitCode = 2;
  });
}
