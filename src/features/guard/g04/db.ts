import { ApprovedPool, PlatformDatabase } from "../../../platform/database";
import type { Target } from "../../../platform/config";
import { guardDatabaseConfig } from "../live/database-config";
import { guardMigrationPlan } from "../live/migrations";
import { g04MigrationPlan, g04SchemaReady } from "./migrations";
import { G04Store } from "./store";

/**
 * Role-separated pools from the SAME purpose-bound approvals G02 uses (GUARD_DB_{APP,WORKER}_{APPROVAL,PASSWORD}_FILE).
 * The app pool serves HTTP (intake, UI, API); the worker pool serves the dispatcher. Neither can DELETE, migrate or bypass RLS.
 */
export async function openG04(env: Readonly<Record<string, string | undefined>> = process.env, expectedTarget?: Target) {
  const g02 = await guardMigrationPlan(),
    plan = await g04MigrationPlan();
  const appCfg = await guardDatabaseConfig(env, "app", g02.sha256, expectedTarget),
    workerCfg = await guardDatabaseConfig(env, "worker", g02.sha256, expectedTarget);
  const appPool = new ApprovedPool(appCfg),
    workerPool = new ApprovedPool(workerCfg);
  const app = new PlatformDatabase(appPool, false, "guard"),
    worker = new PlatformDatabase(workerPool, true, "guard");
  if (!(await g04SchemaReady(appPool, plan))) {
    await Promise.allSettled([appPool.end(), workerPool.end()]);
    throw new Error("g04_schema_not_ready");
  }
  return {
    target: appCfg.target,
    app,
    worker,
    appStore: new G04Store(app),
    workerStore: new G04Store(worker),
    close: () => Promise.all([appPool.end(), workerPool.end()]).then(() => undefined),
  };
}
export type G04Runtime = Awaited<ReturnType<typeof openG04>>;
