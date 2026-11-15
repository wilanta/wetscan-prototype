import { randomUUID } from "node:crypto";
import {
  approvedDatabaseConfig,
  PlatformError,
  workerConfig,
} from "../../src/platform/config";
import { ApprovedPool, PlatformDatabase } from "../../src/platform/database";
import { migrationPlan } from "../../src/platform/migrations";
import { runSentinelWorker } from "./runtime";
import { detectionActivation } from "../../src/features/sentinel/detection/activation";
import { requestedAcceptanceIsolation } from "./acceptance";

async function main() {
  const options = workerConfig(process.env);
  if (
    options.heartbeatMs * 2 >= options.leaseMs ||
    options.timeoutMs >= options.leaseMs
  )
    throw new PlatformError("invalid_input");
  // This dedicated process never needs Auth/OAuth/scanner/provider credentials.
  for (const key of Object.keys(process.env))
    if (/^(AUTH_|GITHUB_|TELEGRAM_|RESEND_|WHATSAPP_|AWS_)/.test(key))
      delete process.env[key];
  for (const purpose of ["APP", "MIGRATION", "TEST", "BOOTSTRAP"])
    delete process.env[`SENTINEL_DB_${purpose}_PASSWORD_FILE`];
  const plan = await migrationPlan();
  const config = await approvedDatabaseConfig(
    process.env,
    "worker",
    "runtime",
    plan.sha256,
  );
  const pool = new ApprovedPool(config);
  const detection = detectionActivation(
    config.approval,
    process.env.SENTINEL_DETECTION_ENABLED === "1",
  );
  const isolation = requestedAcceptanceIsolation(
    config,
    detection,
    process.env.SENTINEL_ACCEPTANCE_ISOLATION === "1",
  );
  await runSentinelWorker({
    db: new PlatformDatabase(pool, true),
    pool,
    migrations: plan.migrations,
    options,
    detection,
    isolation,
    workerId: randomUUID(),
    control: process,
    once: process.argv.includes("--once"),
    report: (event) => console.log(JSON.stringify(event)),
  });
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "not_started_or_stopped_with_failure",
      reason: error instanceof PlatformError ? error.code : "worker_failed",
      databaseMigration: "never_automatic",
    }),
  );
  process.exitCode = 2;
});
