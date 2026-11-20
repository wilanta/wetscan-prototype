import { ApprovedPool, PlatformDatabase } from "@/platform/database";
import { guardDatabaseConfig } from "../live/database-config";
import { guardMigrationPlan } from "../live/migrations";
import { g06MigrationPlan, g06SchemaReady } from "./migrations";

type Target = Parameters<typeof guardDatabaseConfig>[3];

function g06DbEnv(env: Readonly<Record<string, string | undefined>>) {
  const out = { ...env };
  for (const suffix of [
    "APP_APPROVAL_FILE",
    "APP_PASSWORD_FILE",
    "WORKER_APPROVAL_FILE",
    "WORKER_PASSWORD_FILE",
    "MIGRATE_APPROVAL_FILE",
    "MIGRATE_PASSWORD_FILE",
  ]) {
    const specific = env[`GUARD_G06_DB_${suffix}`];
    if (specific) out[`GUARD_DB_${suffix}`] = specific;
  }
  return out;
}

export async function openG06(
  env: Readonly<Record<string, string | undefined>> = process.env,
  expectedTarget?: Target,
) {
  const resolved = g06DbEnv(env);
  const g02 = await guardMigrationPlan();
  const plan = await g06MigrationPlan();
  const appCfg = await guardDatabaseConfig(
    resolved,
    "app",
    g02.sha256,
    expectedTarget,
  );
  const workerCfg = await guardDatabaseConfig(
    resolved,
    "worker",
    g02.sha256,
    expectedTarget,
  );
  const appPool = new ApprovedPool(appCfg);
  const workerPool = new ApprovedPool(workerCfg);
  const app = new PlatformDatabase(appPool, false, "guard");
  const worker = new PlatformDatabase(workerPool, true, "guard");
  if (!(await g06SchemaReady(appPool, plan))) {
    await Promise.allSettled([appPool.end(), workerPool.end()]);
    throw new Error("g06_schema_not_ready");
  }
  return {
    target: appCfg.target,
    app,
    worker,
    close: () =>
      Promise.all([appPool.end(), workerPool.end()]).then(() => undefined),
  };
}

export type G06Database = Awaited<ReturnType<typeof openG06>>;
