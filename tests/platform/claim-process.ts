import { approvedDatabaseConfig } from "../../src/platform/config";
import { ApprovedPool, PlatformDatabase } from "../../src/platform/database";
import { migrationPlan } from "../../src/platform/migrations";
import { PostgresQueue } from "../../src/platform/queue";
import type { SentinelScope } from "../../src/features/sentinel/types";
async function main() {
  const plan = await migrationPlan();
  const c = await approvedDatabaseConfig(
    process.env,
    "worker",
    "integration_test",
    plan.sha256,
  );
  const scope = JSON.parse(process.argv[2]) as SentinelScope;
  const pool = new ApprovedPool(c),
    q = new PostgresQueue(new PlatformDatabase(pool, true), scope, [
      "sentinel.maintenance",
    ]);
  try {
    const leases = await q.claim({
      module: "sentinel",
      workerId: process.argv[3],
      limit: 1,
      leaseMs: 5000,
    });
    if (process.argv.includes("--complete") && leases[0])
      await q.complete(leases[0]);
    console.log(JSON.stringify(leases));
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error("approved_test_process_failed");
  process.exitCode = 1;
});
