import { approvedDatabaseConfig, PlatformError } from "../src/platform/config";
import { ApprovedPool } from "../src/platform/database";
import { applyMigrations, migrationPlan } from "../src/platform/migrations";

async function main() {
  const command = process.argv[2] ?? "plan";
  const plan = await migrationPlan();
  if (command === "plan") {
    console.log(
      JSON.stringify(
        {
          action: "review_only",
          databaseConnections: 0,
          planSha256: plan.sha256,
          versions: plan.migrations.map(({ version, checksum }) => ({
            version,
            checksum,
          })),
          requires:
            "Explicit owner target/database and migration approval; ignored approval file + exact --approve-plan hash",
        },
        null,
        2,
      ),
    );
    return;
  }
  if (!["up", "down", "status"].includes(command))
    throw new PlatformError("invalid_input");
  if (
    command !== "status" &&
    !process.argv.includes(`--approve-plan=${plan.sha256}`)
  )
    throw new PlatformError("approval_required");
  const config = await approvedDatabaseConfig(
    process.env,
    "migration",
    command === "up"
      ? "migrate_up"
      : command === "down"
        ? "migrate_down"
        : "runtime",
    plan.sha256,
  );
  const pool = new ApprovedPool(config);
  try {
    if (command === "status") {
      const client = await pool.connect();
      try {
        console.log(
          JSON.stringify({
            migrations: (
              await client.query(
                "SELECT version,checksum FROM platform.schema_migrations ORDER BY version",
              )
            ).rows,
          }),
        );
      } finally {
        client.release();
      }
    } else {
      await applyMigrations(pool, plan.migrations, command as "up" | "down");
      console.log(
        JSON.stringify({
          status: "applied",
          direction: command,
          planSha256: plan.sha256,
        }),
      );
    }
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "blocked",
      reason: error instanceof PlatformError ? error.code : "migration_failed",
      secretsLogged: false,
    }),
  );
  process.exitCode = 1;
});
