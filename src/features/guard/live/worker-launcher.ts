import "server-only";
import { fork } from "node:child_process";
import { resolve } from "node:path";
import { ApprovedPool, PlatformDatabase } from "../../../platform/database";
import { authorizeGuardProject } from "./project";
import { githubSourceAccess } from "./github-source";
import { GuardSnapshotAdapter } from "./snapshot";
import { PostgresGuardStore } from "./persistence";
import { guardDatabaseConfig } from "./database-config";
import { guardMigrationPlan } from "./migrations";
import { verifyGuardSchema } from "./schema-readiness";
import type { ScanJob } from "../contracts";
import { LiveGuardError } from "./model";
import {
  bindGuardJob,
  validateWorkerApproval,
} from "../../../../worker/guard/approval";
import { GuardSessionBroker } from "../../../../worker/guard/auth-broker";
import {
  privateIpcPort,
  attachGuardBroker,
} from "../../../../worker/guard/ipc";
import { within } from "../../../../worker/sentinel/lifecycle";
/** Explicit server-only launch seam. No route or automatic startup invokes this function. */
export async function launchApprovedGuardWorker(input: {
  approval: unknown;
  job: ScanJob;
  sessionToken: string | undefined;
  environment: Readonly<Record<string, string | undefined>>;
}) {
  const plan = await guardMigrationPlan(),
    binding = bindGuardJob(input.job);
  const permit = validateWorkerApproval(input.approval, binding, plan.sha256);
  // Exact app target approval is independent of Wil's general implementation review and of worker-role approval.
  const config = await guardDatabaseConfig(
    input.environment,
    "app",
    plan.sha256,
    permit.target,
  );
  const workerApprovalPath = input.environment.GUARD_DB_WORKER_APPROVAL_FILE,
    workerPasswordPath = input.environment.GUARD_DB_WORKER_PASSWORD_FILE;
  if (!workerApprovalPath || !workerPasswordPath)
    throw new LiveGuardError("not_configured");
  const pool = new ApprovedPool(config),
    db = new PlatformDatabase(pool, false, "guard"),
    store = new PostgresGuardStore(db);
  let token = input.sessionToken;
  const snapshots = new GuardSnapshotAdapter({
    authorize: () => authorizeGuardProject(token, binding.projectId),
    open: (authority, signal) =>
      githubSourceAccess(token, binding.projectId).open(authority, signal),
  });
  const checkParent = () => {
    validateWorkerApproval(permit, binding, plan.sha256);
    if (Date.parse(config.approval.expiresAt) <= Date.now())
      throw new LiveGuardError("approval_required");
  };
  const broker = new GuardSessionBroker(permit, {
    current: () => {
      checkParent();
      return authorizeGuardProject(token, binding.projectId);
    },
    load: (grant) => {
      checkParent();
      return store.get(grant, binding, binding.jobId);
    },
    snapshots,
    verifyLease: (lease) => {
      checkParent();
      return db.scoped(binding, async (tx) => {
        const active = await db.query(
          tx,
          "SELECT job_id FROM platform.jobs WHERE module='guard' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND job_id=$4 AND lease_owner=$5 AND lease_token=$6 AND lease_until>clock_timestamp() AND state='leased' AND NOT cancel_requested",
          [
            binding.mode,
            binding.workspaceId,
            binding.projectId,
            binding.jobId,
            lease.workerId,
            lease.leaseToken,
          ],
        );
        if (!active.rowCount) throw new LiveGuardError("lease_lost", 409);
      });
    },
  });
  try {
    checkParent();
    await verifyGuardSchema(db, plan);
    await broker.admission();
    validateWorkerApproval(permit, binding, plan.sha256);
  } catch (error) {
    token = undefined;
    await broker.close();
    await pool.end();
    throw error;
  }
  const environment: NodeJS.ProcessEnv = {
    GUARD_WORKER_LAUNCH: "1",
    GUARD_DB_WORKER_APPROVAL_FILE: workerApprovalPath,
    GUARD_DB_WORKER_PASSWORD_FILE: workerPasswordPath,
    NODE_ENV: "production",
  };
  for (const name of ["SystemRoot", "WINDIR", "TEMP", "TMP"])
    if (process.env[name]) environment[name] = process.env[name]!;
  let child: ReturnType<typeof fork>;
  try {
    child = fork(resolve(process.cwd(), "worker/guard/main.ts"), [], {
      cwd: process.cwd(),
      execArgv: ["--import", "tsx"],
      env: environment,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      windowsHide: true,
    });
  } catch {
    token = undefined;
    await broker.close();
    await pool.end();
    throw new LiveGuardError("source_unavailable");
  }
  let exited = false;
  const exit = new Promise<number>((done) => {
    child.once("exit", (code) => {
      exited = true;
      done(code ?? 2);
    });
    child.once("error", () => {
      if (!child.pid) exited = true;
      done(2);
    });
  });
  let port: ReturnType<typeof privateIpcPort>;
  try {
    port = privateIpcPort(child);
  } catch {
    child.kill();
    await within(exit, 5000).catch(() => undefined);
    try {
      await broker.close();
    } finally {
      token = undefined;
      await pool.end();
    }
    throw new LiveGuardError("source_unavailable");
  }
  const detach = attachGuardBroker(port, (packet, signal) =>
    broker.handle(packet, signal),
  );
  const cleanup = async () => {
    try {
      await detach();
      await broker.close();
    } finally {
      token = undefined;
      await pool.end();
    }
  };
  const done = exit.then(async (code) => {
    await within(cleanup(), 9000);
    if (code !== 0) throw new LiveGuardError("source_unavailable");
    return { processExit: 0, scannerExecution: "NOT_RUN" as const };
  });
  void done.catch(() => undefined);
  const stop = async () => {
    if (!exited) {
      await port
        .send({ type: "guard.shutdown", version: 1 })
        .catch(() => undefined);
      try {
        await within(exit, 10000);
      } catch {
        child.kill();
        await within(exit, 5000);
        throw new LiveGuardError("cleanup_failed");
      }
    }
    return done;
  };
  try {
    await within(
      new Promise<void>((ready, fail) => {
        const off = port.message((value) => {
          if (
            value &&
            typeof value === "object" &&
            "type" in value &&
            value.type === "guard.worker.boot_ready"
          ) {
            off();
            void port
              .send({ type: "guard.worker.boot", version: 1, approval: permit })
              .then(ready, fail);
          }
        });
        void exit.then(() => {
          off();
          fail(new LiveGuardError("source_unavailable"));
        });
      }),
      6000,
    );
  } catch {
    await stop().catch(() => undefined);
    throw new LiveGuardError("source_unavailable");
  }
  return { stop, done };
}
