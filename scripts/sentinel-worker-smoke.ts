/** Approval-gated, idle-only local lifecycle test. Never migrates or enqueues. */
import { fork, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { approvedDatabaseConfig, PlatformError } from "../src/platform/config";
import { ApprovedPool } from "../src/platform/database";
import { migrationPlan } from "../src/platform/migrations";
import { within } from "../worker/sentinel/lifecycle";
import type { LifecycleEvent } from "../worker/sentinel/runtime";

const expectedPlan =
  "7dac33cd59f2373d6ef87a94d6f588c723a8ce34f3115c47676d7353f7d61e43";
const expectedChecksum =
  "dd061a60b123284882f154c438de3a171d60967b7b07a4e07200b6693f4eb778";
const expectedTarget = {
  host: "127.0.0.1",
  port: 55432,
  database: "wetscan_dev",
  marker: "wetscan-s01:26b6b537-c016-4dc7-8007-4e839e8b838f",
};
const evidence: Record<string, unknown> = {
  startedAt: new Date().toISOString(),
  mode: "idle_only_private_parent_ipc",
  cycles: [],
};
let active: ChildProcess | undefined, observer: ApprovedPool | undefined;
let expired = false;
const deadline = Date.now() + 180000;
const watchdog = setTimeout(() => {
  expired = true;
  if (active && active.exitCode === null && active.signalCode === null)
    active.kill("SIGKILL");
}, 180000);
function assert(value: unknown, code: string): asserts value {
  if (!value) throw Error(code);
}
function remaining() {
  assert(!expired && Date.now() < deadline, "overall_deadline");
  return deadline - Date.now();
}
async function portUnused() {
  const server = createServer();
  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(3112, "127.0.0.1", ok);
  });
  await new Promise<void>((r) => server.close(() => r()));
}
async function snapshot() {
  assert(observer, "observer_unavailable");
  const client = await observer.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const identity = (
      await client.query(
        "SELECT current_database() AS database,shobj_description(d.oid,'pg_database') AS marker,current_setting('server_version_num')::int AS version FROM pg_database d WHERE datname=current_database()",
      )
    ).rows[0];
    const ledger = (
      await client.query(
        "SELECT version,checksum,applied_at FROM platform.schema_migrations ORDER BY version",
      )
    ).rows;
    const heartbeats = (
      await client.query(
        "SELECT worker_id,status,started_at,last_seen_at,extract(epoch FROM clock_timestamp()-last_seen_at)::float AS age_seconds FROM platform.worker_heartbeats WHERE module='sentinel' ORDER BY worker_id",
      )
    ).rows;
    const sessions = (
      await client.query(
        "SELECT pid,usename,application_name FROM pg_stat_activity WHERE datname=current_database() AND application_name='wetscan-sentinel-worker' ORDER BY pid",
      )
    ).rows;
    const counts = (
      await client.query(
        "SELECT (SELECT count(*)::int FROM platform.jobs) AS jobs,(SELECT count(*)::int FROM platform.notification_outbox) AS outbox,(SELECT count(*)::int FROM sentinel.project_bindings) AS bindings",
      )
    ).rows[0];
    const roles = (
      await client.query(
        "SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname IN ('wetscan_app','wetscan_migrator','wetscan_sentinel_worker') ORDER BY rolname",
      )
    ).rows;
    await client.query("ROLLBACK");
    assert(
      identity.database === expectedTarget.database &&
        identity.marker === expectedTarget.marker &&
        identity.version === 170012,
      "identity_changed",
    );
    assert(
      ledger.length === 1 &&
        ledger[0].version === "0001_foundation" &&
        ledger[0].checksum === expectedChecksum &&
        new Date(ledger[0].applied_at).toISOString() ===
          "2026-11-14T12:36:51.243Z",
      "ledger_changed",
    );
    assert(
      Object.values(counts).every((n) => n === 0),
      "development_not_idle",
    );
    assert(
      roles.length === 3 &&
        roles.every(
          (r) =>
            !r.rolsuper &&
            !r.rolcreatedb &&
            !r.rolcreaterole &&
            !r.rolbypassrls,
        ),
      "roles_changed",
    );
    return { identity, ledger, heartbeats, sessions, counts, roles };
  } finally {
    client.release();
  }
}
function exits(child: ChildProcess) {
  return new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (ok, fail) => {
      child.once("error", fail);
    child.once("close", (code, signal) => ok({ code, signal }));
    },
  );
}
async function cycle(
  index: number,
  previous: Awaited<ReturnType<typeof snapshot>>,
) {
  remaining();
  await portUnused();
  const began = Date.now();
  const events: LifecycleEvent[] = [],
    diagnostics: string[] = [];
  const child = (active = fork(resolve("worker/sentinel/main.ts"), [], {
    cwd: process.cwd(),
    windowsHide: true,
    silent: true,
    execArgv: ["--max-old-space-size=256", "--import", "tsx"],
    env: { ...process.env, SENTINEL_WORKER_HEALTH_PORT: "3112" },
  }));
  const exited = exits(child); // Attach before observing readiness or asking for shutdown.
  let buffer = "";
  child.stdout!.on("data", (chunk: Buffer) => {
    buffer = (buffer + chunk.toString()).slice(-16000);
    for (let end; (end = buffer.indexOf("\n")) !== -1;) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      try {
        const event = JSON.parse(line) as LifecycleEvent;
        if (event.event === "sentinel_lifecycle" && events.length < 16)
          events.push(event);
      } catch {
        /* no raw output */
      }
    }
  });
  child.stderr!.on("data", () => {
    if (diagnostics.length < 4) diagnostics.push("redacted_worker_stderr");
  });
  const result: Record<string, unknown> = {
    index,
    pid: child.pid,
    startedAt: new Date().toISOString(),
    events,
    diagnostics,
  };
  (evidence.cycles as unknown[]).push(result);
  let health: unknown;
  await within(
    (async () => {
      while (true) {
        remaining();
        assert(
          child.exitCode === null && child.signalCode === null,
          "startup_exited",
        );
        try {
          const response = await fetch("http://127.0.0.1:3112/health", {
            signal: AbortSignal.timeout(1500),
          });
          const body = await response.json();
          if (
            response.status === 200 &&
            body.status === "ready" &&
            body.database === "connected" &&
            body.schema === "0001_foundation" &&
            body.worker === "running"
          ) {
            health = body;
            break;
          }
        } catch {
          /* readiness is bounded below */
        }
        await delay(150);
      }
    })(),
    Math.min(20000, remaining()),
  );
  const started = events.find((e) => e.phase === "started");
  assert(started && started.pid === child.pid, "missing_start_diagnostic");
  const running = await snapshot();
  const heartbeat = running.heartbeats.find(
    (h) => h.worker_id === started.workerId,
  );
  assert(
    heartbeat?.status === "running" && heartbeat.age_seconds < 30,
    "heartbeat_not_fresh",
  );
  assert(
    running.sessions.length >= 1 &&
      running.sessions.length <= 3 &&
      running.sessions.every((s) => s.usename === "wetscan_sentinel_worker"),
    "worker_role_changed",
  );
  const body = health as {
    queue: Record<string, number>;
    outbox: { pending: number; provider: string };
    telemetry: string;
  };
  assert(
    Object.values(body.queue).every((n) => n === 0) &&
      body.outbox.pending === 0 &&
      body.outbox.provider === "not_configured" &&
      body.telemetry === "not_implemented",
    "unexpected_health",
  );
  result.startupMs = Date.now() - began;
  result.health = health;
  result.running = running;
  // Confirm genuine heartbeat advancement during idle, not just an initial row.
  await within(
    (async () => {
      while (true) {
        remaining();
        await delay(250);
        const idle = await snapshot();
        const next = idle.heartbeats.find(
          (h) => h.worker_id === started.workerId,
        );
        if (
          next &&
          new Date(next.last_seen_at).getTime() >
            new Date(heartbeat.last_seen_at).getTime()
        ) {
          result.idle = idle;
          break;
        }
      }
    })(),
    Math.min(15000, remaining()),
  );
  const requested = Date.now();
  child.send({ type: "sentinel.shutdown", version: 1 });
  child.send({ type: "sentinel.shutdown", version: 1 });
  const exit = await within(exited, Math.min(10000, remaining()));
  result.shutdownMs = Date.now() - requested;
  result.exit = exit;
  assert(
    exit.code === 0 &&
      exit.signal === null &&
      Number(result.shutdownMs) < 10000,
    "shutdown_failed",
  );
  assert(
    events.filter((e) => e.phase === "shutdown_requested").length === 1 &&
      events.some((e) => e.phase === "stopped") &&
      !events.some((e) => e.phase === "shutdown_failed"),
    "cleanup_not_confirmed",
  );
  active = undefined;
  await portUnused();
  let exists = true;
  try {
    process.kill(child.pid!, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") exists = false;
    else throw error;
  }
  assert(!exists, "owned_process_survived");
  const stopped = await snapshot();
  assert(
    stopped.sessions.length === 0 &&
      stopped.heartbeats.find((h) => h.worker_id === started.workerId)
        ?.status === "stopped",
    "shutdown_cleanup_failed",
  );
  // Keep every previous row byte-for-byte in its persistent fields; age alone advances.
  for (const row of previous.heartbeats) {
    const current = stopped.heartbeats.find(
      (h) => h.worker_id === row.worker_id,
    );
    assert(
      current &&
        ["status", "started_at", "last_seen_at"].every(
          (k) => String(current[k]) === String(row[k]),
        ),
      "historical_heartbeat_changed",
    );
  }
  result.stopped = stopped;
  result.processAbsent = true;
  result.listenerClosed = true;
  return stopped;
}
async function main() {
  const plan = await migrationPlan();
  assert(
    plan.sha256 === expectedPlan &&
      plan.migrations[0]?.checksum === expectedChecksum,
    "plan_changed",
  );
  const worker = await approvedDatabaseConfig(
    process.env,
    "worker",
    "runtime",
    plan.sha256,
  );
  assert(
    JSON.stringify(worker.target) === JSON.stringify(expectedTarget),
    "target_not_approved",
  );
  const observerConfig = await approvedDatabaseConfig(
    {
      ...process.env,
      SENTINEL_DB_APPROVAL_FILE:
        process.env.SENTINEL_SMOKE_OBSERVER_APPROVAL_FILE,
    },
    "migration",
    "migrate_up",
    plan.sha256,
  );
  assert(
    JSON.stringify(observerConfig.target) === JSON.stringify(expectedTarget),
    "observer_target_not_approved",
  );
  observer = new ApprovedPool(observerConfig);
  try {
    process.kill(10016, 0);
    throw Error("previous_pid_present");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
  const before = await snapshot();
  assert(before.sessions.length === 0, "existing_worker_session");
  evidence.before = before;
  evidence.planSha256 = plan.sha256;
  const first = await cycle(1, before);
  const second = await cycle(2, first);
  evidence.after = second;
  evidence.status = "PASS";
}
main()
  .catch(async (error) => {
    expired = true; // Cancel any readiness/idle loop left by a deadline race.
    evidence.status = "FAIL";
    evidence.reason =
      error instanceof PlatformError
        ? error.code
        : /^[a-z_]+$/.test(String(error?.message))
          ? error.message
          : "redacted_lifecycle_failure";
    if (active && active.exitCode === null && active.signalCode === null) {
      const child = active;
      const ended = exits(child);
      evidence.forcedCleanupPid = child.pid;
      child.kill("SIGKILL");
      await within(ended, 5000).catch(() => {
        evidence.forcedCleanupUnconfirmed = true;
      });
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    clearTimeout(watchdog);
    if (observer)
      await within(observer.end(), 5000).catch(() => {
        evidence.observerCloseFailed = true;
        process.exitCode = 1;
      });
    evidence.finishedAt = new Date().toISOString();
    await writeFile(
      ".local/sentinel/worker-lifecycle-retest.json",
      JSON.stringify(evidence, null, 2) + "\n",
      { flag: "wx" },
    );
    console.log(JSON.stringify(evidence));
  });
