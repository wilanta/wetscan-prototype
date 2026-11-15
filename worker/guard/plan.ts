import { guardMigrationPlan } from "../../src/features/guard/live/migrations";
guardMigrationPlan()
  .then((plan) =>
    console.log(
      JSON.stringify(
        {
          status: "PREPARATION_ONLY",
          sha256: plan.sha256,
          migrationChecksum: plan.migration.checksum,
          platformPlanSha256: plan.platformPlanSha256,
          platformVersions: plan.platformVersions,
          artifacts: plan.artifacts.map(({ name, sha256 }) => ({
            name,
            sha256,
          })),
          databaseMutation: "NOT_EXECUTED",
        },
        null,
        2,
      ),
    ),
  )
  .catch(() => {
    console.error(JSON.stringify({ status: "plan_unavailable" }));
    process.exitCode = 2;
  });
