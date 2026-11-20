import "server-only";
import { ApprovedPool, PlatformDatabase } from "../../../platform/database";
import { fingerprint } from "../../../platform/identity";
import { guardDatabaseConfig } from "../live/database-config";
import { guardMigrationPlan } from "../live/migrations";
import { loadProductTarget } from "../live/product-deployment";
import { verifyProductDatabase } from "../live/product-preflight";
import { authorizeGuardProject } from "../live/project";
import { guardLiveService } from "../live/runtime";
import type { ProjectAuthority } from "../live/model";
import { G03Error } from "./contracts";
import { PostgresG03Store } from "./store";
import { G03Service } from "./service";
import { remediationAi } from "./provider";
import { githubRemediationSource } from "./source";
import { githubPullRequests } from "./github";
let cached: { key: string; pool: ApprovedPool } | undefined;
export async function g03Runtime(
  token: string | undefined,
  authority: ProjectAuthority,
  defer: (task: () => Promise<void>) => void,
) {
  if (process.env.GUARD_G03_ENABLED !== "1")
    throw new G03Error("g03_not_configured", 503);
  const target = await loadProductTarget(process.env.GUARD_PRODUCT_CONFIG_FILE),
    plan = await guardMigrationPlan();
  const config = await guardDatabaseConfig(
    process.env,
    "app",
    plan.sha256,
    target,
  );
  const key = fingerprint([
    target,
    plan.sha256,
    process.env.GUARD_DB_APP_PASSWORD_FILE ?? null,
  ]);
  if (!cached || cached.key !== key) {
    if (cached) await cached.pool.end();
    cached = { key, pool: new ApprovedPool(config) };
  }
  await verifyProductDatabase(cached.pool, "app", { target }, plan);
  return new G03Service({
    store: new PostgresG03Store(
      new PlatformDatabase(cached.pool, false, "guard"),
    ),
    source: githubRemediationSource(token),
    provider: remediationAi(),
    github: githubPullRequests(token),
    revalidate: () => authorizeGuardProject(token, authority.grant.projectId),
    scanner: {
      async enqueue(a, input, signal) {
        // G02 policy, deployment qualification, source broker, durable queue and scanner stay authoritative.
        if (process.env.GUARD_PRODUCT_ENABLED !== "1")
          throw new G03Error("scanner_not_configured", 503);
        const service = await guardLiveService({
          token,
          authority: a,
          access: "scan",
          defer,
        });
        return service.create(
          a,
          {
            branch: input.branch,
            commit: input.commit,
            profile: "quick",
            engines: [input.engine],
            idempotencyKey: input.idempotencyKey,
          },
          signal,
        );
      },
      async get(a, id) {
        const service = await guardLiveService({
          token,
          authority: a,
          access: "read",
          defer,
        });
        return (await service.get(a, id)).job;
      },
    },
  });
}
