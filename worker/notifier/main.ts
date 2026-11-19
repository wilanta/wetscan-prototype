import { randomUUID } from "node:crypto";
import { approvedDatabaseConfig, integer, PlatformError, workerConfig } from "../../src/platform/config";
import { ApprovedPool, PlatformDatabase } from "../../src/platform/database";
import { migrationPlan } from "../../src/platform/migrations";
import { notificationActivation } from "../../src/features/sentinel/notifications/activation";
import { ResendSender, secretReader, TelegramSender } from "../../src/features/sentinel/notifications/providers";
import type { NotificationChannel, SenderPort } from "../../src/features/sentinel/notifications/model";
import { runNotifier } from "./runtime";

/**
 * Credential-isolated notification sender (S06). The ONLY process that may hold TELEGRAM_/RESEND_ secrets.
 * It authenticates to PostgreSQL as wetscan_sentinel_notifier (outbox jobs + notification ledger only) and gets
 * none of the app/worker/migration/Auth/GitHub credentials. Start: `npm run sentinel:notifier`.
 */
async function main() {
  const options = workerConfig(process.env);
  if (options.heartbeatMs * 2 >= options.leaseMs || options.timeoutMs >= options.leaseMs) throw new PlatformError("invalid_input");
  // Capture provider secrets references first, then drop everything this lane must never carry.
  const providerEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => /^(TELEGRAM_|RESEND_|NOTIFICATION_FROM_EMAIL$)/.test(k)),
  );
  for (const key of Object.keys(process.env))
    if (/^(AUTH_|GITHUB_|AWS_|WHATSAPP_)/.test(key)) delete process.env[key];
  for (const purpose of ["APP", "WORKER", "MIGRATION", "TEST", "BOOTSTRAP"]) delete process.env[`SENTINEL_DB_${purpose}_PASSWORD_FILE`];
  const plan = await migrationPlan();
  const config = await approvedDatabaseConfig(process.env, "notifier", "runtime", plan.sha256);
  const activation = notificationActivation(config.approval, process.env.SENTINEL_NOTIFIER_ENABLED === "1");
  if (!activation) throw new PlatformError("not_configured");
  const senders = new Map<NotificationChannel, SenderPort>();
  if (activation.channels.includes("telegram"))
    senders.set("telegram", new TelegramSender({ token: secretReader(providerEnv, "TELEGRAM_BOT_TOKEN"), baseUrl: providerEnv.TELEGRAM_API_BASE_URL }));
  if (activation.channels.includes("email"))
    senders.set("email", new ResendSender({ apiKey: secretReader(providerEnv, "RESEND_API_KEY"), from: providerEnv.NOTIFICATION_FROM_EMAIL, baseUrl: providerEnv.RESEND_API_BASE_URL }));
  const pool = new ApprovedPool(config);
  await runNotifier({
    db: new PlatformDatabase(pool, true),
    pool,
    migrations: plan.migrations,
    options,
    activation,
    senders,
    workerId: randomUUID(),
    control: process,
    healthPort: integer(process.env.SENTINEL_NOTIFIER_HEALTH_PORT, 3113, 1024, 65535),
    once: process.argv.includes("--once"),
    report: (event) => console.log(JSON.stringify(event)),
  });
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "not_started_or_stopped_with_failure",
      reason: error instanceof PlatformError ? error.code : "notifier_failed",
      databaseMigration: "never_automatic",
    }),
  );
  process.exitCode = 2;
});
