import { ApprovedPool, PlatformDatabase } from "../../../platform/database";
import type { Target } from "../../../platform/config";
import { guardDatabaseConfig } from "../live/database-config";
import { guardMigrationPlan } from "../live/migrations";
import { g05MigrationPlan, g05SchemaReady } from "./migrations";

function g05DbEnv(
  env: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string | undefined>> {
  const out: Record<string, string | undefined> = { ...env };
  for (const purpose of ["APP", "WORKER", "MIGRATION"] as const) {
    for (const kind of ["APPROVAL_FILE", "PASSWORD_FILE"] as const) {
      const g05Key = `GUARD_G05_DB_${purpose}_${kind}`;
      const baseKey = `GUARD_DB_${purpose}_${kind}`;
      if (env[g05Key]) out[baseKey] = env[g05Key];
    }
  }
  return out;
}

/**
 * Role-separated pools from G05-isolated (GUARD_G05_DB_*) or Guard-standard (GUARD_DB_*) approvals.
 * Neither role has DELETE, DDL, or BYPASSRLS privileges.
 */
export async function openG05(
  env: Readonly<Record<string, string | undefined>> = process.env,
  expectedTarget?: Target,
) {
  const resolved = g05DbEnv(env);
  const g02 = await guardMigrationPlan();
  const plan = await g05MigrationPlan();
  const appCfg = await guardDatabaseConfig(resolved, "app", g02.sha256, expectedTarget);
  const workerCfg = await guardDatabaseConfig(resolved, "worker", g02.sha256, expectedTarget);
  const appPool = new ApprovedPool(appCfg);
  const workerPool = new ApprovedPool(workerCfg);
  const app = new PlatformDatabase(appPool, false, "guard");
  const worker = new PlatformDatabase(workerPool, true, "guard");
  if (!(await g05SchemaReady(appPool, plan))) {
    await Promise.allSettled([appPool.end(), workerPool.end()]);
    throw new Error("g05_schema_not_ready");
  }
  return {
    target: appCfg.target,
    app,
    worker,
    close: () =>
      Promise.all([appPool.end(), workerPool.end()]).then(() => undefined),
  };
}

export type G05Database = Awaited<ReturnType<typeof openG05>>;
