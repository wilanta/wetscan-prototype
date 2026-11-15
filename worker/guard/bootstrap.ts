import { ApprovedPool, PlatformDatabase } from "../../src/platform/database";
import { guardDatabaseConfig } from "../../src/features/guard/live/database-config";
import { guardMigrationPlan } from "../../src/features/guard/live/migrations";
import { verifyGuardSchema } from "../../src/features/guard/live/schema-readiness";
import { PostgresGuardStore } from "../../src/features/guard/live/persistence";
import { GuardPostgresQueue } from "../../src/features/guard/live/queue";
import { LiveGuardError } from "../../src/features/guard/live/model";
import type {
  JobLease,
  DurableJobPort,
} from "../../src/features/sentinel/platform-contracts";
import type { GuardWorkerApproval } from "./approval";
import { validateWorkerApproval } from "./approval";
import { privateIpcPort } from "./ipc";
import { ipcWorkerResolver } from "./auth-broker";
import { prepareGuardJob } from "./prepare";
import { runGuardWorker } from "./runtime";
import { guardWorkerStorage } from "./storage";
export async function receiveWorkerBoot(
  control: NodeJS.Process,
): Promise<GuardWorkerApproval> {
  if (!control.connected || !control.send)
    throw new LiveGuardError("approval_required");
  const port = privateIpcPort(control);
  return new Promise((done, fail) => {
    const timer = setTimeout(
      () => finish(new LiveGuardError("approval_required")),
      5000,
    );
    const off = port.message((value) => {
      if (
        !value ||
        typeof value !== "object" ||
        !("type" in value) ||
        value.type !== "guard.worker.boot"
      )
        return;
      const p = value as { version?: number; approval?: GuardWorkerApproval };
      if (p.version !== 1 || !p.approval) {
        finish(new LiveGuardError("approval_required"));
        return;
      }
      finish(undefined, p.approval);
    });
    const offDisconnect = port.disconnect(() =>
      finish(new LiveGuardError("approval_required")),
    );
    const finish = (error?: Error, permit?: GuardWorkerApproval) => {
      clearTimeout(timer);
      off();
      offDisconnect();
      if (error) fail(error);
      else done(permit!);
    };
    void port
      .send({ type: "guard.worker.boot_ready", version: 1 })
      .catch(() => finish(new LiveGuardError("approval_required")));
  });
}
/** One approved preparation job in a separate process. No scanners, migrations or Auth store in this child. */
export async function startApprovedWorker(input: {
  approval: unknown;
  environment: Readonly<Record<string, string | undefined>>;
  control: NodeJS.Process;
}) {
  if (
    !input.control.connected ||
    !input.control.send ||
    input.environment.GUARD_WORKER_LAUNCH !== "1"
  )
    throw new LiveGuardError("approval_required");
  const plan = await guardMigrationPlan(),
    candidate = input.approval as GuardWorkerApproval;
  const permit = validateWorkerApproval(
    candidate,
    candidate?.binding,
    plan.sha256,
  );
  // Validate both the launch permit and the independent worker-role DB approval before credential/pool access.
  const config = await guardDatabaseConfig(
    input.environment,
    "worker",
    plan.sha256,
    permit.target,
  );
  const check = () => {
    validateWorkerApproval(permit, permit.binding, plan.sha256);
    if (Date.parse(config.approval.expiresAt ?? "") <= Date.now())
      throw new LiveGuardError("approval_required");
  };
  check();
  const pool = new ApprovedPool(config),
    db = new PlatformDatabase(pool, true, "guard"),
    store = new PostgresGuardStore(db);
  const port = privateIpcPort(input.control),
    remote = ipcWorkerResolver(port),
    storage = guardWorkerStorage(db, permit.workerId);
  const queue = new GuardPostgresQueue(
    db,
    permit.binding,
    permit.binding.jobId,
  );
  let claimed: JobLease | undefined,
    pulse: ReturnType<typeof setInterval> | undefined,
    pendingPulse: Promise<void> = Promise.resolve();
  const requestStop = () =>
    input.control.emit("message", { type: "guard.shutdown", version: 1 });
  const expiry = setTimeout(
    requestStop,
    Math.max(
      1,
      Math.min(
        Date.parse(permit.expiresAt),
        Date.parse(config.approval.expiresAt),
      ) - Date.now(),
    ),
  );
  const gated: DurableJobPort = {
    enqueue: async () => {
      throw new LiveGuardError("approval_required");
    },
    async claim(value) {
      check();
      const leases = await queue.claim(value);
      claimed = leases[0];
      return leases;
    },
    heartbeat: async (lease) => {
      check();
      return queue.heartbeat(lease);
    },
    complete: async (lease) => {
      check();
      return queue.complete(lease);
    },
    retry: async (lease, failure) => {
      check();
      return queue.retry(lease, failure);
    },
    cancel: async () => {
      throw new LiveGuardError("approval_required");
    },
  };
  let ready = false;
  try {
    await runGuardWorker({
      workerId: permit.workerId,
      control: input.control,
      once: true,
      scopes: async () => {
        check();
        return [permit.binding];
      },
      queue: () => gated,
      handler: async (job, signal) => {
        check();
        if (!claimed || claimed.job.jobId !== job.jobId)
          throw new LiveGuardError("lease_lost", 409);
        await prepareGuardJob(store, remote.resolver, claimed, signal);
      },
      verifyReady: async () => {
        check();
        await verifyGuardSchema(db, plan);
        check();
        await storage.heartbeat("running");
        ready = true;
        pulse = setInterval(() => {
          pendingPulse = pendingPulse
            .then(async () => {
              check();
              await storage.heartbeat("running");
            })
            .catch(() => {
              requestStop();
            });
        }, 10000);
      },
      close: async () => {
        if (pulse) clearInterval(pulse);
        try {
          await pendingPulse;
          if (ready) await storage.heartbeat("stopped");
        } finally {
          remote.close();
          await pool.end();
        }
      },
      report: (event) => {
        void port
          .send({ type: "guard.worker.event", version: 1, phase: event.phase })
          .catch(() => undefined);
      },
    });
  } finally {
    clearTimeout(expiry);
    if (pulse) clearInterval(pulse);
    remote.close();
  }
}
