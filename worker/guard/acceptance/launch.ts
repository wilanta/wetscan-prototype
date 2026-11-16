import { fork } from "node:child_process";
import { readFile, writeFile, realpath } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ApprovedPool, PlatformDatabase } from "../../../src/platform/database";
import { fingerprint } from "../../../src/platform/identity";
import { githubSourceAccess } from "../../../src/features/guard/live/github-source";
import { GuardSnapshotAdapter } from "../../../src/features/guard/live/snapshot";
import { PostgresGuardStore } from "../../../src/features/guard/live/persistence";
import { verifyGuardSchema } from "../../../src/features/guard/live/schema-readiness";
import { guardMigrationPlan } from "../../../src/features/guard/live/migrations";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import type { JobLease } from "../../../src/features/sentinel/platform-contracts";
import { privateIpcPort, attachGuardBroker, safeBrokerCode } from "../ipc";
import { dockerDriver } from "../sandbox";
import { currentProcessIdentity } from "./process-identity";
import { operatorSandboxEvidence } from "../sandbox-evidence";
import { within } from "../../sentinel/lifecycle";
import {
  validateExecution,
  hash,
  type ExecutionPacket,
  type ExecutionApproval,
} from "./approval";
import { verifyArtifacts } from "./integrity";
import { caseDatabaseConfig } from "./database";
import { sourcePermit } from "./subpermit";
import { probeProgram } from "./probe-spec";
import { caseSpecs } from "./case-specs";
import { FoundationBroker } from "./broker";
import { CaseFaults } from "./faults";
import { Checkpoints, waitForAbort, type Checkpoint } from "./checkpoints";
import {
  ResourceRegistry,
  confinedSource,
  type ResourceRecord,
} from "./registry";
import { scopedProbeSandbox } from "./scoped-sandbox";
import { sameDaemon, measureDaemon } from "./daemon";
import { CaseJournal } from "./journal";
import type { AcceptanceBoot } from "./bootstrap";
import { validN04Denial } from "./n04-evidence";
/** Exact-case Auth-process composition, separate from the old prepare_only entry and all scanners. */
export async function launchFoundation(input: {
  packet: ExecutionPacket;
  approval: ExecutionApproval;
  slot: number;
  sessionToken: string | undefined;
  environment: Readonly<Record<string, string | undefined>>;
  privateRoot: string;
  cancel(): Promise<void>;
  event(point: Checkpoint): Promise<void>;
  afterClaim?(lease: JobLease): Promise<void>;
}) {
  const { packet: p, approval: a } = validateExecution(
    input.packet,
    input.approval,
  );
  await verifyArtifacts(p);
  if (!p.binding || !p.workerIds[input.slot])
    throw new LiveGuardError("approval_required");
  const plan = await guardMigrationPlan();
  if (plan.sha256 !== p.migrationPlanSha256)
    throw new LiveGuardError("approval_required");
  const program = await probeProgram(),
    specs = caseSpecs(p.caseId, program),
    containerSlot = p.caseId === "C02A" && input.slot === 2 ? 1 : input.slot,
    spec = specs[containerSlot];
  if (
    hash(program) !== p.programSha256 ||
    JSON.stringify(specs.map(fingerprint)) !== JSON.stringify(p.specDigests)
  )
    throw new LiveGuardError("approval_required");
  const permit = sourcePermit(p, a, input.slot),
    config = await caseDatabaseConfig(p, a, input.environment, "app"),
    pool = new ApprovedPool(config),
    db = new PlatformDatabase(pool, false, "guard"),
    store = new PostgresGuardStore(db),
    registry = new ResourceRegistry(input.privateRoot),
    journal = new CaseJournal(input.privateRoot, p, a);
  let token = input.sessionToken,
    child: ReturnType<typeof fork> | undefined,
    lastLease: JobLease | undefined,
    observedLease: JobLease | undefined;
  const source = () =>
    githubSourceAccess(token, p.binding!.projectId, {
      branch: p.binding!.repository.branch,
      commit: p.binding!.repository.commit,
    });
  const event = async (point: Checkpoint) => {
    await writeFile(
      join(input.privateRoot, `${p.runId}.${permit.workerId}.${point}.json`),
      JSON.stringify({
        caseId: p.caseId,
        scanId: p.binding!.jobId,
        workerId: permit.workerId,
        point,
        at: new Date().toISOString(),
        ...(p.caseId === "C02A" && point === "container_started"
          ? await currentProcessIdentity()
          : {}),
      }),
      { flag: "wx", mode: 0o600 },
    );
    await input.event(point);
  };
  const faults = new CaseFaults(
    p.caseId,
    {
      event,
      cancel: input.cancel,
      crashChild: async () => {
        if (!child?.pid) throw new LiveGuardError("execution_not_ready");
        child.kill();
      },
      parentCrashReady: async (signal) => {
        await waitForAbort(signal);
        throw new LiveGuardError("source_unavailable");
      },
      revoked: async (signal) => {
        const limit = Date.now() + 15000;
        while (!signal.aborted && Date.now() < limit) {
          try {
            await source().authorize();
          } catch (error) {
            if (
              error &&
              typeof error === "object" &&
              "code" in error &&
              [
                "unauthenticated",
                "session_expired",
                "session_revoked",
              ].includes(String(error.code))
            ) {
              await writeFile(
                join(input.privateRoot, `${p.runId}.revocation.json`),
                JSON.stringify({
                  oldSessionRejected: true,
                  code: String(error.code),
                  at: Date.now(),
                }),
                { flag: "wx", mode: 0o600 },
              );
              return;
            }
            throw new LiveGuardError("source_unavailable");
          }
          await delay(250, undefined, { signal });
        }
        throw new LiveGuardError("source_unavailable");
      },
    },
    input.slot === 0,
  );
  const hooks = faults.snapshotHooks(),
    sourceSlot = p.caseId === "C02A" && input.slot === 2 ? 1 : input.slot;
  const snapshots = new GuardSnapshotAdapter(
    {
      authorize: () => source().authorize(),
      open: (authority, signal) => source().open(authority, signal),
    },
    undefined,
    {
      afterWrite: async (root, relative, written, signal) => {
        if (written === 1)
          await writeFile(
            join(input.privateRoot, `${p.runId}.source.${sourceSlot}.json`),
            JSON.stringify({ jobId: p.binding!.jobId, root, at: Date.now() }),
            { flag: "wx", mode: 0o600 },
          );
        await hooks.afterWrite(root, relative, written, signal);
      },
      beforeCleanup: (root) => hooks.beforeCleanup(root),
    },
  );
  const checkpoints = new Checkpoints(p.caseId, async (point, signal) => {
    if (point === "claimed") {
      if (!lastLease) throw new LiveGuardError("lease_lost", 409);
      observedLease = lastLease;
      if (p.caseId === "C02A" && input.slot === 1) {
        const active = await registry.current();
        if (active.runId !== p.runId || active.jobId !== p.binding!.jobId)
          throw new LiveGuardError("cleanup_failed");
        await event("claimed");
        throw new LiveGuardError("execution_not_ready");
      }
      await input.afterClaim?.(lastLease);
    } else await faults.checkpoints.reach(point, signal);
  });
  const guard = () => {
    validateExecution(p, a);
    if (Date.parse(permit.expiresAt) <= Date.now())
      throw new LiveGuardError("approval_required");
  };
  let sourceReceipt: string | undefined;
  const broker = new FoundationBroker(
    p,
    a,
    permit,
    {
      current: () => {
        guard();
        return source().authorize();
      },
      load: (grant) => {
        guard();
        return store.get(grant, p.binding!, p.binding!.jobId);
      },
      verifyLease: (lease) => {
        guard();
        return db.scoped(p.binding!, async (tx) => {
          const active = await db.query(
            tx,
            "SELECT job_id FROM platform.jobs WHERE module='guard' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND job_id=$4 AND lease_owner=$5 AND lease_token=$6 AND lease_until>clock_timestamp() AND state='leased' AND NOT cancel_requested",
            [
              p.binding!.mode,
              p.binding!.workspaceId,
              p.binding!.projectId,
              p.binding!.jobId,
              lease.workerId,
              lease.leaseToken,
            ],
          );
          if (!active.rowCount) throw new LiveGuardError("lease_lost", 409);
        });
      },
      snapshots: {
        acquire: async (g, r, s) => {
          sourceReceipt = await journal.reserve("snapshot", sourceSlot);
          const started = Date.now();
          try {
            const snapshot = await snapshots.acquire(g, r, s);
            const root = await snapshots.directory(snapshot);
            await writeFile(
              join(
                input.privateRoot,
                `${p.runId}.acquired-source.${sourceSlot}.json`,
              ),
              JSON.stringify({
                jobId: p.binding!.jobId,
                root,
                marker: JSON.parse(await readFile(root + ".lease", "utf8")),
              }),
              { flag: "wx", mode: 0o600 },
            );
            return snapshot;
          } catch (error) {
            await journal.result(sourceReceipt, {
              status: "failed",
              elapsedMs: Date.now() - started,
              code:
                error instanceof LiveGuardError
                  ? error.code
                  : "source_unavailable",
            });
            throw error;
          }
        },
        dispose: (s) => snapshots.dispose(s),
      },
    },
    spec ?? null,
    async (snapshot, signal) => {
      // Containerless cases stop at their earlier real negative boundary. They cannot gain a probe implicitly.
      if (!spec || !p.containerNames[containerSlot] || !p.daemon)
        throw new LiveGuardError("approval_required");
      guard();
      sameDaemon(p.daemon, await measureDaemon(spec));
      const sourceRoot = await confinedSource(
          await snapshots.directory(snapshot),
        ),
        marker = JSON.parse(await readFile(sourceRoot + ".lease", "utf8"));
      const record: ResourceRecord = {
        version: 2,
        caseId: p.caseId,
        runId: p.runId,
        jobId: p.binding!.jobId,
        specDigest: fingerprint(spec),
        image: spec.image,
        imageId: p.daemon.imageId,
        name: p.containerNames[containerSlot],
        containerId: null,
        deadline: Date.now() + spec.timeoutMs,
        source: sourceRoot,
        createdAt: marker.createdAt,
        sourceExpiresAt: marker.expiresAt,
      };
      if (sourceReceipt)
        await journal.result(sourceReceipt, {
          sourceRegistered: true,
          rootSha256: hash(sourceRoot),
          markerSha256: hash(JSON.stringify(marker)),
        });
      // This private immutable intent is also the late-bound actual source reference for window B.
      const actualDriver = dockerDriver(spec.docker, spec.endpoint);
      const driver = {
        call: async (...args: Parameters<typeof actualDriver.call>) => {
          const started = Date.now();
          try {
            return await actualDriver.call(...args);
          } catch (error) {
            if (args[0][0] === "start") {
              const state = JSON.parse(
                await actualDriver.call(
                  ["inspect", "--format", "{{json .State}}", record.name],
                  {
                    configDirectory: args[1].configDirectory,
                    timeoutMs: 5000,
                    maxBytes: 16000,
                  },
                ),
              );
              await writeFile(
                join(
                  input.privateRoot,
                  `${p.runId}.start-failure.${input.slot}.json`,
                ),
                JSON.stringify({
                  elapsedMs: Date.now() - started,
                  code: safeBrokerCode(error),
                  running: state.Running === true,
                  signalAborted: args[1].signal?.aborted === true,
                  at: Date.now(),
                }),
                { flag: "wx", mode: 0o600 },
              );
            }
            throw error;
          }
        },
      };
      return scopedProbeSandbox(
        spec,
        operatorSandboxEvidence(
          JSON.parse(
            await readFile(
              join(input.privateRoot, `evidence.${fingerprint(spec)}.json`),
              "utf8",
            ),
          ),
        ),
        registry,
        record,
        driver,
        input.slot === 0 ? checkpoints : undefined,
      ).execute(sourceRoot, signal);
    },
    checkpoints,
  );
  try {
    guard();
    await verifyGuardSchema(db, plan);
    await broker.admission();
  } catch (e) {
    token = undefined;
    await broker.close();
    await pool.end();
    throw e;
  }
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    GUARD_ACCEPTANCE_LAUNCH: "2",
    GUARD_DB_WORKER_PASSWORD_FILE:
      input.environment.GUARD_DB_WORKER_PASSWORD_FILE,
  };
  for (const k of ["SystemRoot", "WINDIR", "TEMP", "TMP"])
    if (process.env[k]) environment[k] = process.env[k];
  const launchedAt = new Date().toISOString();
  try {
    child = fork(
      await realpath(resolve("worker/guard/acceptance/main.ts")),
      [],
      {
        cwd: process.cwd(),
        execArgv: ["--import", "tsx"],
        env: environment,
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        windowsHide: true,
      },
    );
  } catch {
    token = undefined;
    await broker.close();
    await pool.end();
    throw new LiveGuardError("source_unavailable");
  }
  const ownedChild = child,
    port = privateIpcPort(ownedChild),
    exit = new Promise<number>((done) => {
      ownedChild.once("exit", (code) => done(code ?? 2));
      ownedChild.once("error", () => done(2));
    });
  let grantExpiresAt: number | undefined, grantIssuedAt: number | undefined;
  let evidenceFailed = false;
  let evidenceWrites = Promise.resolve();
  const recordEvidence = (suffix: string, value: unknown) => {
    evidenceWrites = evidenceWrites
      .then(() =>
        writeFile(
          join(input.privateRoot, `${p.runId}.${suffix}.json`),
          JSON.stringify(value),
          { flag: "wx", mode: 0o600 },
        ),
      )
      .catch(() => {
        evidenceFailed = true;
      });
  };
  const offBoundary = port.message((value) => {
    const v = value as Record<string, unknown>;
    if (
      p.caseId === "N04" &&
      v?.type === "guard.acceptance.retry_guard" &&
      v.version === 2
    ) {
      if (
        v.jobId === p.binding!.jobId &&
        v.workerId === p.workerIds[input.slot] &&
        v.attempt === 1 &&
        v.retryScheduled === false &&
        typeof v.observedAt === "number" &&
        v.observedAt <= Date.now() &&
        ["handler_failed", "handler_timeout", "worker_stopping"].includes(
          String(v.failureCode),
        )
      )
        recordEvidence("retry-guard", {
          jobId: v.jobId,
          workerId: v.workerId,
          attempt: v.attempt,
          retryScheduled: false,
          failureCode: v.failureCode,
          observedAt: v.observedAt,
        });
      else evidenceFailed = true;
      return;
    }
    if (!v || v.type !== "guard.acceptance.boundary" || v.version !== 2) return;
    const expected =
      p.caseId === "N03"
        ? Date.parse(permit.expiresAt)
        : p.caseId === "N04"
          ? grantExpiresAt
          : undefined;
    if (
      !expected ||
      v.expiresAt !== expected ||
      (p.caseId === "N04" && v.issuedAt !== grantIssuedAt) ||
      typeof v.observedAt !== "number" ||
      v.observedAt < expected ||
      v.observedAt > Date.now() + 1000
    )
      return;
    if (p.caseId === "N04") {
      const proof = {
        boundary: v.boundary,
        issuedAt: grantIssuedAt,
        expiresAt: expected,
        authorizationCheckedAt: v.authorizationCheckedAt,
        observedAt: v.observedAt,
        authorization:
          v.authorization && typeof v.authorization === "object"
            ? {
                operation: (v.authorization as Record<string, unknown>)
                  .operation,
                outcome: (v.authorization as Record<string, unknown>).outcome,
                errorCode: (v.authorization as Record<string, unknown>)
                  .errorCode,
              }
            : undefined,
        realExpiryReached: Date.now() >= expected,
        actualElapsedMs:
          Number(v.authorizationCheckedAt) - Number(grantIssuedAt),
      };
      if (!validN04Denial(proof)) {
        evidenceFailed = true;
        return;
      }
      recordEvidence("boundary", proof);
      return;
    }
    void writeFile(
      join(input.privateRoot, `${p.runId}.boundary.json`),
      JSON.stringify({
        boundary: p.caseId === "N03" ? "permit_expired" : "grant_expired",
        expiresAt: expected,
        observedAt: v.observedAt,
        realExpiryReached: Date.now() >= expected,
      }),
      { flag: "wx", mode: 0o600 },
    ).catch(() => undefined);
  });
  const detach = attachGuardBroker(port, async (value, signal) => {
    if (value.lease) lastLease = value.lease as JobLease;
    try {
      const result = await broker.handle(value, signal);
      if (value.op === "resolve")
        grantExpiresAt = (result as { grant: { expiresAt: number } }).grant
          .expiresAt;
      if (value.op === "resolve")
        grantIssuedAt = (result as { grant: { issuedAt?: number } }).grant
          .issuedAt;
      return result;
    } catch (error) {
      if (value.op === "dispose")
        await writeFile(
          join(
            input.privateRoot,
            `${p.runId}.dispose-failure.${input.slot}.json`,
          ),
          JSON.stringify({ code: safeBrokerCode(error), at: Date.now() }),
          { flag: "wx", mode: 0o600 },
        ).catch(() => undefined);
      throw error;
    }
  });
  let exited = false;
  const done = exit.then(async (exitCode) => {
    exited = true;
    offBoundary();
    try {
      await evidenceWrites;
      await within(detach(), 9000);
      if (p.caseId !== "N08") await within(broker.close(), 9000);
    } finally {
      token = undefined;
      await pool.end();
    }
    if (evidenceFailed) throw new LiveGuardError("execution_not_ready");
    return { exitCode, scannerExecution: "NOT_RUN" as const };
  });
  void done.catch(() => undefined);
  try {
    await within(
      new Promise<void>((ready, fail) => {
        const off = port.message((value) => {
          if (
            value &&
            typeof value === "object" &&
            "type" in value &&
            value.type === "guard.acceptance.boot_ready"
          ) {
            off();
            const boot: AcceptanceBoot = {
              packet: p,
              approval: a,
              permit,
              slot: input.slot,
              launchedAt,
            };
            void port
              .send({ type: "guard.acceptance.boot", version: 2, boot })
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
    ownedChild.kill();
    await done.catch(() => undefined);
    throw new LiveGuardError("source_unavailable");
  }
  return {
    done,
    ownedLease: () => observedLease,
    stop: async () => {
      if (!exited) {
        await port
          .send({ type: "guard.shutdown", version: 1 })
          .catch(() => undefined);
        try {
          await within(exit, 10000);
        } catch {
          ownedChild.kill();
          await within(exit, 5000);
        }
      }
      return done;
    },
    rescueSource: async () => {
      if (p.caseId !== "N08") throw new LiveGuardError("approval_required");
      await faults.releaseOwnedLock();
      await broker.close();
    },
  };
}
