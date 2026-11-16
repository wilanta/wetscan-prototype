import { lstat, writeFile, mkdtemp, rm } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { ApprovedPool, PlatformDatabase } from "../../../src/platform/database";
import { githubSourceAccess } from "../../../src/features/guard/live/github-source";
import { prepareAuthorizedScan } from "../../../src/features/guard/live/service";
import { PostgresGuardStore } from "../../../src/features/guard/live/persistence";
import { GuardPostgresQueue } from "../../../src/features/guard/live/queue";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import { authorize } from "../../../src/features/guard/security";
import { fingerprint } from "../../../src/platform/identity";
import { bindGuardJob } from "../approval";
import { dockerDriver } from "../sandbox";
import { CaseJournal } from "./journal";
import {
  validateExecution,
  type ExecutionPacket,
  type ExecutionApproval,
} from "./approval";
import { launchFoundation } from "./launch";
import { caseDatabaseConfig } from "./database";
import { observeCase } from "./observe";
import { admitProbeCase } from "./admission";
import { regularJson } from "./package";
import {
  ResourceRegistry,
  confinedSource,
  type ResourceRecord,
} from "./registry";
import { reapRegisteredContainer } from "./reaper";
import { probeProgram } from "./probe-spec";
import { caseSpecs } from "./case-specs";
import { physicalContainerAbsence } from "./physical-observer";
import { finalizeObservedCase } from "./finalize-case";
import { requireBeforeProjection } from "./preservation";
import { expectedFaultObserved } from "./fault-proof";
import { measureDaemon, sameDaemon } from "./daemon";
const globalState = globalThis as typeof globalThis & {
  guardG01Acceptances?: Map<
    string,
    Awaited<ReturnType<typeof launchFoundation>>
  >;
};
const handles = (globalState.guardG01Acceptances ??= new Map());
export type CaseAction =
  | "enqueue"
  | "launch_0"
  | "launch_1"
  | "launch_2"
  | "cancel"
  | "rescue"
  | "observe"
  | "result"
  | "complete";
const check = (value: unknown) => {
  if (!value) throw new LiveGuardError("execution_not_ready");
};
export class OwnerCaseActions {
  private journal: CaseJournal;
  constructor(
    readonly p: ExecutionPacket,
    readonly a: ExecutionApproval,
    private readonly root: string,
    private readonly token: string | undefined,
    private readonly env: Readonly<Record<string, string | undefined>>,
  ) {
    validateExecution(p, a);
    this.journal = new CaseJournal(root, p, a);
  }
  private source() {
    if (!this.p.binding) throw new LiveGuardError("approval_required");
    return githubSourceAccess(this.token, this.p.binding.projectId, {
      branch: this.p.binding.repository.branch,
      commit: this.p.binding.repository.commit,
    });
  }
  private async authority() {
    const b = this.p.binding!,
      authority = await this.source().authorize();
    authorize(authority.grant, b, "scan");
    check(
      authority.grant.actorId === b.actorId &&
        authority.repositoryId === b.repository.repositoryId &&
        authority.repositoryName === this.p.repositoryName &&
        authority.branch === b.repository.branch,
    );
    return authority;
  }
  private async database<T>(
    purpose: "app" | "worker",
    work: (db: PlatformDatabase, pool: ApprovedPool) => Promise<T>,
  ) {
    const config = await caseDatabaseConfig(this.p, this.a, this.env, purpose),
      pool = new ApprovedPool(config);
    try {
      return await work(
        new PlatformDatabase(pool, purpose === "worker", "guard"),
        pool,
      );
    } finally {
      await pool.end();
    }
  }
  async observe() {
    validateExecution(this.p, this.a);
    await this.authority();
    const b = this.p.binding!;
    const rows = await this.database("worker", (_db, pool) =>
      observeCase(pool, b, this.p.workerIds),
    );
    const sources: { slot: number; absent: boolean }[] = [];
    for (let slot = 0; slot < this.p.limits.snapshots; slot++) {
      const file = join(this.root, `${this.p.runId}.source.${slot}.json`);
      let record;
      try {
        record = await regularJson(file);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw e;
      }
      check(record.jobId === b.jobId);
      let absent = false;
      try {
        await confinedSource(record.root);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") {
          try {
            await lstat(record.root + ".lease");
          } catch (marker) {
            if ((marker as NodeJS.ErrnoException).code === "ENOENT")
              absent = true;
            else throw marker;
          }
        } else throw e;
      }
      sources.push({ slot, absent });
    }
    let activeContainer = false;
    try {
      const record = await new ResourceRegistry(this.root).current();
      activeContainer = record.runId === this.p.runId;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    const containerAbsent = await physicalContainerAbsence(this.p);
    const events = [];
    for (const worker of this.p.workerIds)
      for (const point of [
        "acquired",
        "partial_source",
        "source_remove",
        "container_started",
        "container_remove",
        "claimed",
      ]) {
        try {
          const value = await regularJson(
            join(this.root, `${this.p.runId}.${worker}.${point}.json`),
          );
          events.push(value);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
      }
    return {
      ...rows,
      sources,
      sourceAbsent: sources.every((v) => v.absent),
      containerAbsent: !activeContainer && containerAbsent,
      deferredSourceOrphan:
        this.p.caseId === "C02A" &&
        sources.filter((v) => !v.absent).length === 1 &&
        sources.some((v) => v.slot === 0 && !v.absent),
      events,
      expectedFaultObserved: await expectedFaultObserved(this.p, this.root),
      scannerExecution: "NOT_RUN",
    };
  }
  async cancel() {
    validateExecution(this.p, this.a);
    await requireBeforeProjection(this.p, this.a, this.root);
    check(await expectedFaultObserved(this.p, this.root));
    const authority = await this.authority(),
      receipt = await this.journal.reserve("cancel");
    try {
      await this.database("app", (db) =>
        new PostgresGuardStore(db).cancel(
          authority.grant,
          this.p.binding!,
          this.p.binding!.jobId,
        ),
      );
      await this.journal.result(receipt, {
        status: "cancelled",
        at: Date.now(),
      });
    } catch (e) {
      await this.journal.result(receipt, { status: "failed_no_retry" });
      throw e;
    }
  }
  private async staleFence() {
    const old = handles.get(this.p.runId + ":0")?.ownedLease();
    check(old);
    const authority = await this.authority();
    return this.database("worker", async (db) => {
      const store = new PostgresGuardStore(db),
        queue = new GuardPostgresQueue(
          db,
          this.p.binding!,
          this.p.binding!.jobId,
        ),
        stored = await store.get(
          authority.grant,
          this.p.binding!,
          this.p.binding!.jobId,
        );
      check(stored);
      const before = fingerprint(stored),
        results = [];
      for (const [name, effect] of [
        [
          "metadata",
          () =>
            store.update(authority.grant, stored!.job, stored!.revision, {
              workerId: old!.workerId,
              leaseToken: old!.leaseToken,
            }),
        ],
        ["heartbeat", () => queue.heartbeat(old!)],
        ["complete", () => queue.complete(old!)],
        [
          "retry",
          () =>
            queue.retry(old!, {
              availableAt: new Date().toISOString(),
              redactedError: "handler_failed",
            }),
        ],
      ] as const) {
        let denied = false;
        try {
          await effect();
        } catch (e) {
          denied =
            !!e &&
            typeof e === "object" &&
            "code" in e &&
            e.code === "lease_lost";
        }
        check(denied);
        results.push({ operation: name, denied: true });
      }
      check(
        fingerprint(
          await store.get(
            authority.grant,
            this.p.binding!,
            this.p.binding!.jobId,
          ),
        ) === before,
      );
      await writeFile(
        join(this.root, `${this.p.runId}.stale-fence.json`),
        JSON.stringify({
          status: "DENIED_ALL_FOUR",
          results,
          rowUnchanged: true,
          at: Date.now(),
        }),
        { flag: "wx", mode: 0o600 },
      );
    });
  }
  private async rescue() {
    check(["N07", "N08", "C02A"].includes(this.p.caseId));
    check(await expectedFaultObserved(this.p, this.root));
    const receipt = await this.journal.reserve("reap");
    if (this.p.caseId === "N08") {
      const handle = handles.get(this.p.runId + ":0");
      check(handle);
      await handle!.done;
      await handle!.rescueSource();
      await this.journal.result(receipt, {
        sourceAbsent: true,
        ownedHelperReleased: true,
      });
      return;
    }
    const record = (await regularJson(
      join(this.root, this.p.containerNames[0] + ".created.json"),
    )) as ResourceRecord;
    check(
      record.runId === this.p.runId && record.jobId === this.p.binding!.jobId,
    );
    const config = await mkdtemp(join(tmpdir(), "wetscan-g01-docker-"));
    try {
      await delay(Math.max(0, record.deadline - Date.now() + 1));
      validateExecution(this.p, this.a);
      const spec = caseSpecs(this.p.caseId, await probeProgram())[0];
      sameDaemon(this.p.daemon, await measureDaemon(spec));
      const result = await reapRegisteredContainer(
        record,
        new ResourceRegistry(this.root),
        dockerDriver(spec.docker, spec.endpoint),
        config,
      );
      await this.journal.result(receipt, result);
    } finally {
      if (
        dirname(config).toLowerCase() !== tmpdir().toLowerCase() ||
        !basename(config).startsWith("wetscan-g01-docker-")
      )
        throw new LiveGuardError("cleanup_failed");
      await rm(config, { recursive: true, force: true });
    }
  }
  async dispatch(action: CaseAction) {
    validateExecution(this.p, this.a);
    if (action === "observe" || action === "result") return this.observe();
    if (action === "complete")
      return finalizeObservedCase(this.p, this.root, await this.observe());
    await requireBeforeProjection(this.p, this.a, this.root);
    if (action === "cancel") {
      await this.cancel();
      return this.observe();
    }
    if (action === "rescue") {
      await this.rescue();
      return this.observe();
    }
    check(
      this.p.binding && Date.parse(this.a.expiresAt) - Date.now() >= 180000,
    );
    await admitProbeCase(this.p, this.a, this.root);
    const before = await this.observe();
    check(before.bindingMatches || before.scanCount === 0);
    if (action === "enqueue") {
      check(before.scanCount === 0 && before.queueCount === 0);
      const receipt = await this.journal.reserve("enqueue"),
        b = this.p.binding!,
        authority = await this.authority(),
        request = {
          profile: b.profile,
          engines: b.engines,
          commit: b.repository.commit,
          branch: b.repository.branch,
          idempotencyKey: b.idempotencyKey,
        };
      try {
        const signal = AbortSignal.timeout(30000),
          source = await this.source().open(authority, signal);
        try {
          const head = await source.head(signal);
          check(
            head.commit === b.repository.commit &&
              /^[a-f0-9]{40}$/.test(head.tree),
          );
        } finally {
          await source.close();
        }
        const fresh = await this.authority(),
          job = await prepareAuthorizedScan(
            fresh,
            request,
            b.repository.commit,
          );
        check(fingerprint(bindGuardJob(job)) === fingerprint(b));
        const stored = await this.database("app", (db) =>
          new PostgresGuardStore(db).create(fresh.grant, job),
        );
        check(stored.job.id === b.jobId && stored.job.status === "queued");
        const result = {
          scanId: b.jobId,
          status: "queued",
          execution: "foundation_probe",
          scannerExecution: "NOT_RUN",
        };
        await this.journal.result(receipt, result);
        return result;
      } catch (e) {
        await this.journal.result(receipt, {
          status: "failed_or_unknown_no_retry",
        });
        throw e;
      }
    }
    const slot = Number(action.slice(-1));
    check(
      /^launch_[012]$/.test(action) &&
        slot < this.p.limits.launches &&
        before.scanCount === 1 &&
        before.queueCount === 1 &&
        !before.leaseActive &&
        before.attempts === slot,
    );
    if (slot === 0) check(before.queueState === "queued");
    if (slot > 0) {
      check(this.p.caseId === "C01" || this.p.caseId === "C02A");
      await regularJson(
        join(
          this.root,
          `${this.p.runId}.${this.p.workerIds[0]}.container_started.json`,
        ),
      );
    }
    if (this.p.caseId === "C02A" && slot === 1) {
      const checkpoint = await regularJson(
        join(
          this.root,
          `${this.p.runId}.${this.p.workerIds[0]}.container_started.json`,
        ),
      );
      check(checkpoint.pid !== process.pid);
      await new ResourceRegistry(this.root).current();
    }
    if (this.p.caseId === "C02A" && slot === 2)
      check(
        before.containerAbsent &&
          before.queueState === "queued" &&
          before.attemptHistory[1]?.outcome === "handler_failed",
      );
    const receipt = await this.journal.reserve("launch", slot);
    try {
      const handle = await launchFoundation({
        packet: this.p,
        approval: this.a,
        slot,
        sessionToken: this.token,
        environment: this.env,
        privateRoot: this.root,
        cancel: () => this.cancel(),
        event: async () => {},
        afterClaim:
          this.p.caseId === "C01" && slot === 1
            ? () => this.staleFence()
            : undefined,
      });
      handles.set(this.p.runId + ":" + slot, handle);
      void handle.done
        .then(
          (result) =>
            this.journal.result(receipt, { ...result, endedAt: Date.now() }),
          () =>
            this.journal.result(receipt, {
              status: "failed_no_retry",
              endedAt: Date.now(),
            }),
        )
        .catch(() => undefined);
      return {
        scanId: this.p.binding!.jobId,
        status: "launch_started",
        slot,
        execution: "foundation_probe",
        scannerExecution: "NOT_RUN",
      };
    } catch (e) {
      await this.journal.result(receipt, {
        status: "failed_to_start_no_retry",
      });
      throw e;
    }
  }
}
