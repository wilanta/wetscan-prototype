import { pipelineFailureReason } from "../../../../worker/guard/source-failure";
import "server-only";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ApprovedPool, PlatformDatabase } from "../../../platform/database";
import type { ProjectAuthority, SourceAccess } from "./model";
import { LiveGuardError } from "./model";
import type { ScanJob } from "../contracts";
import type { JobLease } from "../../sentinel/platform-contracts";
import { guardMigrationPlan } from "./migrations";
import { guardDatabaseConfig, validateGuardApproval } from "./database-config";
import {
  loadDeployment,
  loadProductTarget,
  selectPolicy,
  type ProductDeployment,
} from "./product-deployment";
import {
  assertPrivateRuntimeRoot,
  verifyPhysical,
  qualificationAttestation,
  verifyProductDatabase,
} from "./product-preflight";
import { qualifiedProductService } from "./product-composition";
import { githubSourceAccess } from "./github-source";
import { PostgresGuardStore } from "./persistence";
import { repositoryScanKind, validateProductPolicy } from "./product-policy";
import { fingerprint } from "../../../platform/identity";
import { bindGuardJob } from "../../../../worker/guard/approval";
import { ProductScheduler } from "../../../../worker/guard/product-scheduler";
import { ProductSessionBroker } from "../../../../worker/guard/product-broker";
import { repositoryJobHandler } from "../../../../worker/guard/product-handler";
import { runRepositoryWorkerOnce } from "../../../../worker/guard/product-runtime";
import { operationalRepositoryScanner } from "../../../../worker/guard/scanner-adapter";
import { ResourceRegistry } from "../../../../worker/guard/acceptance/registry";
export interface ProductRequestContext {
  token: string | undefined;
  authority: ProjectAuthority;
  access?: "read" | "scan";
  defer(task: () => Promise<void>): void;
}
interface Host {
  digest: string;
  deployment: ProductDeployment;
  app: PlatformDatabase;
  worker: PlatformDatabase;
  scheduler: ProductScheduler;
  verify(): Promise<void>;
  close(): Promise<void>;
}
let cached: Promise<Host> | undefined;
async function openHost(env: NodeJS.ProcessEnv): Promise<Host> {
  const loaded = await loadDeployment(env.GUARD_PRODUCT_CONFIG_FILE),
    d = loaded.value,
    plan = await guardMigrationPlan();
  await assertPrivateRuntimeRoot(d.privateRoot);
  for (const e of d.deployments) await verifyPhysical(e, d.privateRoot);
  const appConfig = await guardDatabaseConfig(
      env,
      "app",
      plan.sha256,
      d.target,
    ),
    workerConfig = await guardDatabaseConfig(
      env,
      "worker",
      plan.sha256,
      d.target,
    );
  const ap = new ApprovedPool(appConfig),
    wp = new ApprovedPool(workerConfig);
  try {
    await verifyProductDatabase(ap, "app", d, plan);
    await verifyProductDatabase(wp, "worker", d, plan);
  } catch (error) {
    await Promise.allSettled([ap.end(), wp.end()]);
    throw error;
  }
  const scheduler = new ProductScheduler();
  return {
    digest: loaded.digest,
    deployment: d,
    app: new PlatformDatabase(ap, false, "guard"),
    worker: new PlatformDatabase(wp, true, "guard"),
    scheduler,
    verify: async () => {
      scheduler.assertReady();
      const fresh = await loadDeployment(env.GUARD_PRODUCT_CONFIG_FILE);
      if (fresh.digest !== loaded.digest)
        throw new LiveGuardError("execution_not_ready");
      for (const purpose of ["app", "worker"] as const) {
        const path = env[`GUARD_DB_${purpose.toUpperCase()}_APPROVAL_FILE`];
        if (!path) throw new LiveGuardError("not_configured");
        const a = validateGuardApproval(
          JSON.parse(await readFile(path, "utf8")),
          purpose,
          plan.sha256,
        );
        if (fingerprint(a.target) !== fingerprint(d.target))
          throw new LiveGuardError("approval_required");
      }
      for (const e of d.deployments)
        await qualificationAttestation(d.privateRoot, e);
    },
    close: async () => {
      await Promise.all([ap.end(), wp.end()]);
    },
  };
}
/** Host cache owns only role-specific DB pools and bounded scheduler, never persisted owner sessions. */
export async function productHostService(
  context: ProductRequestContext,
  env: NodeJS.ProcessEnv = process.env,
  /** G04 automation only: supplies source access for a server-held authority (no browser token). */
  automationSource?: (branch: string, commit: string) => SourceAccess,
) {
  if (!context.token && !automationSource) throw new LiveGuardError("not_found", 404);
  if (!cached)
    cached = openHost({ ...env }).catch((error) => {
      cached = undefined;
      throw error;
    });
  const host = await cached;
  const currentDeployment = await loadDeployment(env.GUARD_PRODUCT_CONFIG_FILE);
  if (currentDeployment.digest !== host.digest)
    throw new LiveGuardError("execution_not_ready");
  await host.verify();
  const d = host.deployment,
    policy = selectPolicy(
      d,
      context.authority.grant.workspaceId,
      context.authority.grant.projectId,
    ),
    source =
      automationSource ??
      ((branch: string, commit: string) =>
        githubSourceAccess(context.token, policy.projectId, { branch, commit }));
  return qualifiedProductService({
    db: host.app,
    policy,
    deployments: d.deployments,
    source,
    verifyRuntime: host.verify,
    onQueued: async (job) => {
      await host.app.scoped(job, async (tx) => {
        const r = await host.app.query(
          tx,
          "SELECT job_id FROM platform.jobs WHERE module='guard' AND kind='guard.scan.repository' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND job_id=$4 AND state='queued' AND attempts=0 AND max_attempts=1 AND NOT cancel_requested",
          [job.mode, job.workspaceId, job.projectId, job.id],
        );
        if (r.rowCount !== 1) throw new LiveGuardError("execution_not_ready");
      });
      const key = fingerprint([job.workspaceId, job.projectId, job.id]);
      host.scheduler.schedule(
        key,
        () =>
          runSession(
            host,
            job,
            source(job.repository.branch, job.repository.commit),
          ),
        context.defer,
      );
    },
  });
}
async function runSession(
  host: Host,
  job: ScanJob,
  source: ReturnType<typeof githubSourceAccess>,
) {
  const d = host.deployment,
    policy = selectPolicy(d, job.workspaceId, job.projectId);
  validateProductPolicy(policy, job);
  const broker = new ProductSessionBroker(job, policy, source),
    store = new PostgresGuardStore(host.worker, repositoryScanKind);
  let unknownCleanup = false;
  const verifyLease = async (l: JobLease) => {
    if (
      l.job.jobId !== job.id ||
      l.job.kind !== repositoryScanKind ||
      l.job.attempts !== 1 ||
      l.job.maxAttempts !== 1 ||
      !Number.isFinite(Date.parse(l.expiresAt)) ||
      Date.parse(l.expiresAt) <= Date.now()
    )
      throw new LiveGuardError("lease_lost", 409);
    await host.worker.scoped(job, async (tx) => {
      const r = await host.worker.query(
        tx,
        "SELECT job_id FROM platform.jobs WHERE module='guard' AND kind='guard.scan.repository' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND job_id=$4 AND lease_owner=$5 AND lease_token=$6 AND lease_until>clock_timestamp() AND state='leased' AND NOT cancel_requested",
        [
          job.mode,
          job.workspaceId,
          job.projectId,
          job.id,
          l.workerId,
          l.leaseToken,
        ],
      );
      if (r.rowCount !== 1) throw new LiveGuardError("lease_lost", 409);
    });
  };
  const handler = repositoryJobHandler({
    storage: store,
    resolve: async (_job, lease, current) => {
      const binding = bindGuardJob(job),
        scanners = [];
      for (const engine of job.requestedEngines) {
        const dep = d.deployments.find((e) => e.engine === engine);
        if (!dep) throw new LiveGuardError("not_configured");
        scanners.push(
          operationalRepositoryScanner({
            engine: dep.engine,
            binding,
            policy,
            qualification: dep.qualification,
            spec: dep.spec,
            evidence: await qualificationAttestation(d.privateRoot, dep),
            sourceOwner: broker.owner,
            registry: new ResourceRegistry(d.privateRoot),
            privateRoot: d.privateRoot,
            freshGrant: () => broker.freshGrant(),
            verifyLease: () => verifyLease(current()),
          }),
        );
      }
      return {
        policy,
        freshGrant: () => broker.freshGrant(),
        verifyLease,
        ports: {
          storage: store.persistence(
            {
              workerId: lease.workerId,
              leaseToken: lease.leaseToken,
            },
            () => broker.sourceCoverage(),
          ),
          snapshots: broker.snapshots,
          scanners,
          sandbox: {
            ready: true,
            readOnly: true,
            nonRoot: true,
            egressControlled: true,
            cpuLimit: 1,
            memoryMb: 256,
            pidsLimit: 64,
            timeoutMs: policy.scannerTimeoutMs,
          },
        },
      };
    },
  });
  try {
    await broker.freshGrant();
    await runRepositoryWorkerOnce({
      db: host.worker,
      scope: job,
      jobId: job.id,
      workerId: "g02-" + randomUUID(),
      handler,
      verifyReady: host.verify,
      signal: new AbortController().signal,
      timeoutMs: policy.jobTimeoutMs,
    });
  } catch (error) {
    console.warn(
      "[WetScan Guard]",
      JSON.stringify({
        event: "repository_worker_failed",
        jobId: job.id,
        diagnostic: JSON.parse(pipelineFailureReason(error, "broker")),
      }),
    );
    unknownCleanup =
      error instanceof LiveGuardError && error.code === "cleanup_failed";
    throw error;
  } finally {
    if (!unknownCleanup) await broker.close();
  }
}

/** App-role reader/review/cancellation remains available without a scanner or worker connection. */
export async function productReadService(env: NodeJS.ProcessEnv = process.env) {
  const target = await loadProductTarget(env.GUARD_PRODUCT_CONFIG_FILE),
    plan = await guardMigrationPlan();
  const config = await guardDatabaseConfig(env, "app", plan.sha256, target);
  const key = fingerprint([
    target,
    plan.sha256,
    env.GUARD_DB_APP_PASSWORD_FILE,
  ]);
  if (!readCache || readCache.key !== key) {
    if (readCache) await readCache.pool.end();
    readCache = { key, pool: new ApprovedPool(config) };
  }
  await verifyProductDatabase(readCache.pool, "app", { target }, plan);
  const { GuardLiveService, defaultReadiness } = await import("./service"),
    { PostgresGuardArtifacts } = await import("./product-artifacts");
  const db = new PlatformDatabase(readCache.pool, false, "guard");
  return new GuardLiveService(
    new PostgresGuardStore(db, repositoryScanKind),
    { ...defaultReadiness, database: "approved", schema: "verified" },
    undefined,
    new PostgresGuardArtifacts(db),
  );
}
let readCache: { key: string; pool: ApprovedPool } | undefined;
