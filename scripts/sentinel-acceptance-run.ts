// One-pass S04 worker/incident acceptance cycle for the isolated DEV clone.
// It only sequences the gated phases of sentinel-dev-acceptance.ts: the sealed
// approvals expire ~10 min after ingest and event 2 must land in event 1's
// 10-minute correlation bucket, so the whole chain has to run back to back.
// Run: node --import tsx scripts/sentinel-acceptance-run.ts (owner grant required).
import {
  execFileSync,
  spawn,
  spawnSync,
  type ChildProcess,
} from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  readdirSync,
  statSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { migrationPlan } from "../src/platform/migrations";
import {
  buildSealedS04RuntimeApproval,
  s04DevBaseline,
  s04DevTarget,
} from "../tests/sentinel/dev-acceptance-safety";
import { ruleDefinition, sourceDefinition } from "./sentinel-provision-safety";

const repo = process.cwd().replaceAll("\\", "/");
const root = "C:/Users/sheil/.wetscan-sentinel";
const secrets = `${root}/s01-20261114/secrets`;
const prevRoot = `${root}/s04-h04c-b2-provision-package-9ac15f9b4af75d161047cc02a6418e75`;
// Newest earlier cycle context (a failed cycle still leaves prior ids that must stay excluded).
const prev =
  readdirSync(root)
    .filter(
      (d) =>
        d.startsWith("s04-h04c-b2-accept2-") &&
        existsSync(`${root}/${d}/run-context.json`),
    )
    .map((d) => `${root}/${d}`)
    .sort(
      (a, b) =>
        statSync(`${b}/run-context.json`).mtimeMs -
        statSync(`${a}/run-context.json`).mtimeMs,
    )[0] ?? prevRoot;
const cookiePath = `${root}/s04-owner-reauth-3b5201e0110648a38c58df6b814bbde1/candidate/owner-session.cookie`;
const backup = `${root}/s04-h04c-a-12edb023-9852-40e3-805d-3e26d670f11e/wetscan_dev-before-0004.dump`;
const container = "wetscan-sentinel-s04-postgres-792151c53653";
const origin = "http://localhost:3000";
const base = `${origin}/api/sentinel/projects/github-998736528`;
const BUCKET = 600_000;

const psql = (sql: string) =>
  execFileSync(
    "docker",
    [
      "exec",
      container,
      "psql",
      "-U",
      "wetscan_bootstrap",
      "-d",
      "wetscan_dev",
      "-Atc",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clean = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k]) =>
      !/^(SENTINEL_|PG|DATABASE_|DB_|POSTGRES_|AUTH_|GITHUB_|APP_URL|NODE_OPTIONS$)/.test(
        k,
      ),
  ),
) as NodeJS.ProcessEnv;
const db = {
  SENTINEL_H04C_B2_EXECUTION: "1",
  SENTINEL_DB_HOST: s04DevTarget.host,
  SENTINEL_DB_PORT: String(s04DevTarget.port),
  SENTINEL_DB_NAME: s04DevTarget.database,
  SENTINEL_DB_MARKER: s04DevTarget.marker,
};
const pw = {
  migration: {
    SENTINEL_DB_MIGRATION_PASSWORD_FILE: `${secrets}/migration.password`,
  },
  worker: { SENTINEL_DB_WORKER_PASSWORD_FILE: `${secrets}/worker.password` },
  app: { SENTINEL_DB_APP_PASSWORD_FILE: `${secrets}/app.password` },
};

const dir = `${root}/s04-h04c-b2-accept2-${randomBytes(16).toString("hex")}`;
const ctxPath = `${dir}/run-context.json`;
const approvals: string[] = [];
const results: Record<string, unknown> = {};
let app: ChildProcess | undefined;
let credentialLive = false;

function writeJson(file: string, value: unknown, flag = "wx") {
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n", {
    flag,
    mode: 0o600,
  });
}
function approval(name: string, phase: string, ttlMs: number) {
  const file = `${dir}/${name}.json`;
  const approvedAt = new Date(Date.now() - 1000);
  writeJson(file, {
    schemaVersion: 1,
    status: "APPROVED",
    approvedBy: "owner-s04-acceptance-cycle-2026-11-19",
    approvedAt: approvedAt.toISOString(),
    target: { ...s04DevTarget },
    actions: ["runtime"],
    migrationPlanSha256: s04DevBaseline.planSha256,
    h04cB2: {
      phase,
      expiresAt: new Date(approvedAt.getTime() + ttlMs).toISOString(),
    },
  });
  approvals.push(file);
  return file;
}
function closeApprovals() {
  for (const f of approvals) {
    if (!existsSync(f)) continue;
    const j = JSON.parse(readFileSync(f, "utf8"));
    if (j.status === "APPROVED")
      writeJson(
        f,
        {
          ...j,
          status: "CLOSED_AFTER_H04C_B2",
          actions: [],
          closedAt: new Date().toISOString(),
        },
        "w",
      );
  }
}
function stage(
  cmd: string,
  label: string,
  env: Record<string, string | undefined>,
  args: string[] = [],
) {
  console.log(`>> ${label} @${new Date().toISOString().slice(11, 19)}`);
  const r = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/sentinel-dev-acceptance.ts",
      cmd,
      `--artifact-dir=${dir}`,
      `--context=${ctxPath}`,
      ...args,
    ],
    {
      cwd: repo,
      env: { ...clean, ...env } as NodeJS.ProcessEnv,
      encoding: "utf8",
      timeout: 600000,
      windowsHide: true,
    },
  );
  writeFileSync(`${dir}/${label}.log`, `${r.stdout}\n--stderr--\n${r.stderr}`, {
    mode: 0o600,
  });
  const line = (r.stdout || "").trim().split("\n").filter(Boolean).pop() ?? "";
  console.log(`   exit=${r.status} ${line.slice(0, 300)}`);
  if (r.status !== 0)
    throw new Error(`${label}_failed: ${(r.stderr || line).slice(0, 300)}`);
  try {
    results[label] = JSON.parse(line);
  } catch {
    results[label] = line;
  }
  return results[label] as Record<string, unknown>;
}
async function startApp(file: string) {
  const o = openSync(`${dir}/next.stdout.log`, "a"),
    e = openSync(`${dir}/next.stderr.log`, "a");
  app = spawn(
    process.execPath,
    [
      join(repo, "node_modules/next/dist/bin/next"),
      "start",
      "-H",
      "localhost",
      "-p",
      "3000",
    ],
    {
      cwd: repo,
      env: {
        ...clean,
        ...db,
        SENTINEL_H04C_B2_EXECUTION: undefined,
        ...pw.app,
        SENTINEL_DB_APPROVAL_FILE: file,
        APP_URL: origin,
      } as NodeJS.ProcessEnv,
      stdio: ["ignore", o, e],
      windowsHide: true,
    },
  );
  closeSync(o);
  closeSync(e);
  for (let i = 0; i < 120; i++) {
    if (app.exitCode !== null) throw new Error("app_exited_early");
    try {
      if (
        (await fetch(`${origin}/login`, { signal: AbortSignal.timeout(3000) }))
          .status < 500
      )
        return;
    } catch {
      /* starting */
    }
    await sleep(1000);
  }
  throw new Error("app_start_timeout");
}
function stopApp() {
  if (app?.pid)
    spawnSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], {
      windowsHide: true,
    });
  app = undefined;
}
async function call(url: string, init: RequestInit & { json?: unknown } = {}) {
  const r = await fetch(url, {
    method: init.method ?? "POST",
    headers: init.headers,
    body: init.json === undefined ? undefined : JSON.stringify(init.json),
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : null } as {
    status: number;
    json: any;
  };
}
function expect(cond: unknown, code: string): asserts cond {
  if (!cond) throw new Error(code);
}

async function main() {
  const cookie = readFileSync(cookiePath, "utf8").trim();
  const session = { cookie, origin, "content-type": "application/json" };
  expect(/^wetscan_session=[a-f0-9]{64}$/.test(cookie), "cookie_format");
  expect(
    JSON.parse(readFileSync(`${prev}/run-context.json`, "utf8")).sourceId,
    "prev_context",
  );
  const load = Number(
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "(Get-CimInstance Win32_Processor).LoadPercentage",
      ],
      { encoding: "utf8" },
    ).trim(),
  );
  expect(load < 60, `machine_busy_${load}`);
  expect(
    psql(
      "select count(*) from pg_stat_activity where datname='wetscan_dev' and usename like 'wetscan_%' and pid<>pg_backend_pid()",
    ) === "0",
    "db_sessions_open",
  );
  expect(
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "@(Get-NetTCPConnection -LocalPort 3000 -State Listen -EA SilentlyContinue).Count",
      ],
      { encoding: "utf8" },
    ).trim() === "0",
    "port_3000_busy",
  );

  mkdirSync(dir, { recursive: true });
  execFileSync(
    "icacls",
    [dir, "/inheritance:r", "/grant:r", "SYSTEM:(OI)(CI)F", "sheil:(OI)(CI)F"],
    { stdio: "ignore" },
  );
  const before = Object.fromEntries(
    [
      "sentinel.telemetry_sources",
      "sentinel.telemetry_credentials",
      "sentinel.detection_rules",
      "sentinel.detection_rule_versions",
      "sentinel.detection_audit",
      "sentinel.telemetry_batches",
      "sentinel.telemetry_events",
      "platform.jobs",
    ].map((t) => [t, Number(psql(`select count(*) from ${t}`))]),
  );

  await startApp(approval("app", "ui-verify", 1_500_000));

  // Provision a fresh source/credential/rule through the owner session API.
  const src = await call(`${base}/sources`, {
    headers: session,
    json: {
      action: "create",
      ownedApplicationConfirmed: true,
      source: { ...sourceDefinition, name: "H04C-B2 Controlled Probe 2" },
    },
  });
  expect(src.status === 201 && src.json.credential, "source_create");
  writeFileSync(
    `${dir}/h04c-b2-ingest-credential.secret`,
    src.json.credential + "\n",
    { flag: "wx", mode: 0o600 },
  );
  credentialLive = true;
  const sourceId: string = src.json.sourceId,
    credentialId: string = src.json.credentialId;
  const rule = await call(`${base}/rules`, {
    headers: session,
    json: {
      action: "create",
      definition: { ...ruleDefinition, name: "H04C-B2 Controlled 403 Rule 2" },
    },
  });
  expect(rule.status === 201 && rule.json.revision === 1, "rule_create");
  const ruleId: string = rule.json.ruleId;
  const enabled = await call(`${base}/rules`, {
    headers: session,
    json: { action: "enable", ruleId, expectedRevision: 1 },
  });
  expect(
    enabled.status === 200 &&
      enabled.json.revision === 2 &&
      enabled.json.status === "ENABLED",
    "rule_enable",
  );

  // Event 1 must open a fresh 10-minute bucket so event 2 and both workers fit inside it.
  const bucket = Math.ceil((Date.now() + 5000) / BUCKET) * BUCKET;
  console.log(
    `   waiting for bucket ${new Date(bucket).toISOString().slice(11, 19)}`,
  );
  while (Date.now() < bucket + 2000) await sleep(500);
  const preIngestAt = new Date(
    Number(
      psql("select (extract(epoch from clock_timestamp())*1000)::bigint"),
    ) - 500,
  ).toISOString();
  const occurredAt = new Date().toISOString();
  const batchId = randomUUID(),
    eventId = randomUUID();
  const batch = {
    schemaVersion: 1,
    batchId,
    sentAt: occurredAt,
    events: [
      {
        schemaVersion: 1,
        eventId,
        projectId: "github-998736528",
        occurredAt,
        kind: "http.request",
        severityHint: "low",
        actorHash: "f".repeat(64),
        request: {
          method: "GET",
          routeTemplate:
            "/api/v1/users/canaryPrivateUserSegment987654?token=canaryQueryToken",
          statusCode: 403,
        },
        attributes: {
          reasonCode: "canary_secret_reason_must_redact",
          durationMs: 14,
          controlled: true,
        },
      },
    ],
  };
  const bearer = {
    authorization: `Bearer ${src.json.credential}`,
    "content-type": "application/json",
  };
  const bad = await call(`${origin}/api/sentinel/ingest`, {
    headers: {
      authorization: "Bearer ws2.invalid.deadbeef",
      "content-type": "application/json",
    },
    json: {},
  });
  expect(bad.status === 401, "invalid_bearer");
  const first = await call(`${origin}/api/sentinel/ingest`, {
    headers: bearer,
    json: batch,
  });
  expect(
    first.status === 202 && first.json.duplicate === false,
    `ingest_${first.status}`,
  );
  const replay = await call(`${origin}/api/sentinel/ingest`, {
    headers: bearer,
    json: batch,
  });
  expect(
    replay.status === 200 && replay.json.duplicate === true,
    `replay_${replay.status}`,
  );
  const after = Object.fromEntries(
    Object.keys(before).map((t) => [
      t,
      Number(psql(`select count(*) from ${t}`)) - before[t],
    ]),
  );
  results.provisionDelta = after;
  expect(
    JSON.stringify(after) ===
      JSON.stringify({
        "sentinel.telemetry_sources": 1,
        "sentinel.telemetry_credentials": 1,
        "sentinel.detection_rules": 1,
        "sentinel.detection_rule_versions": 2,
        "sentinel.detection_audit": 2,
        "sentinel.telemetry_batches": 1,
        "sentinel.telemetry_events": 1,
        "platform.jobs": 1,
      }),
    "provision_delta",
  );
  const job = psql(
    `select job_id||'|'||state||'|'||attempts from platform.jobs where subject_ref='${sourceId}/${eventId}'`,
  );
  expect(/\|queued\|0$/.test(job), "job_not_queued");

  // Harness context: previous cycle's rows become "prior" so they are never admitted or re-checked as new.
  const old = JSON.parse(readFileSync(`${prev}/run-context.json`, "utf8"));
  writeJson(ctxPath, {
    ...old,
    artifactDir: dir,
    priorSourceIds: [...old.priorSourceIds, old.sourceId],
    priorRuleIds: [...old.priorRuleIds, old.ruleId],
    priorAttemptJobIds: [...old.priorAttemptJobIds, ...old.admittedJobIds],
    priorIncidentIds: [
      ...old.priorIncidentIds,
      ...(old.incidentId ? [old.incidentId] : []),
    ],
    sourceId,
    credentialId,
    ruleId,
    ruleRevision: 2,
    preIngestAt,
    credentialFile: `${dir}/h04c-b2-ingest-credential.secret`,
    batchId,
    eventId,
    batchIds: [batchId],
    eventIds: [eventId],
    firstEventOccurredAt: occurredAt,
    admittedJobIds: [],
    alertIds: [],
    incidentId: undefined,
  });
  const workerEnv = {
    ...db,
    ...pw.worker,
    SENTINEL_ACCEPTANCE_ISOLATION: "1",
    SENTINEL_DETECTION_ENABLED: "1",
    SENTINEL_INCIDENTS_ENABLED: "1",
  };
  const seal = (n: number, extra: string[] = []) => {
    const out = `${dir}/worker${n}-approval.json`;
    approvals.push(out);
    stage(
      "seal-worker",
      `seal${n}`,
      {
        ...db,
        ...pw.migration,
        SENTINEL_DB_APPROVAL_FILE: approval(`seal${n}`, "seal-worker", 300_000),
      },
      [`--out-approval=${out}`, ...extra],
    );
    return out;
  };

  stage("worker-run", "worker1", {
    ...workerEnv,
    SENTINEL_DB_APPROVAL_FILE: seal(1),
  });
  const dup = stage("ingest-duplicate", "ingest2", {
    ...db,
    ...pw.migration,
    SENTINEL_DB_APPROVAL_FILE: approval("dup", "provision-ingest", 300_000),
  });
  stage("worker-run", "worker2", {
    ...workerEnv,
    SENTINEL_DB_APPROVAL_FILE: seal(2, [`--not-before=${dup.cutoffIso}`]),
  });
  stage("verify-incidents", "verify", { ...db }, [
    `--cookie-file=${cookiePath}`,
  ]);

  // Negative matrix needs a sealed worker approval over both admitted jobs, phase-labelled for that stage.
  const ctx = JSON.parse(readFileSync(ctxPath, "utf8"));
  const jobs = JSON.parse(
    psql(
      `select json_agg(json_build_object('id',job_id,'at',created_at)) from platform.jobs where job_id = any(array[${ctx.admittedJobIds.map((j: string) => `'${j}'`).join(",")}])`,
    ),
  );
  const earliest = new Date(
    Math.min(...jobs.map((j: { at: string }) => Date.parse(j.at))),
  ).toISOString();
  const cutoff = new Date(
    Math.min(Date.now(), Date.parse(preIngestAt), Date.parse(earliest) - 100),
  ).toISOString();
  const sealed = buildSealedS04RuntimeApproval({
    approvedBy: "owner-s04-acceptance-cycle-2026-11-19",
    approvedAt: cutoff,
    ttlMs: 600_000,
    sourceId,
    protectedJobIds: ctx.protectedJobIds,
    priorAttemptJobIds: ctx.priorAttemptJobIds,
    jobIds: ctx.admittedJobIds,
    earliestJobCreatedAt: earliest,
    detectionNotBefore: cutoff,
    incidentsNotBefore: cutoff,
    baselineSha256:
      "198c67e08647f12fbde99c72d01bb50b2f8d2cb4238bd88d854f89f6d550af2e",
    migrations: (await migrationPlan()).migrations,
  });
  const negWorker = `${dir}/neg-worker.json`;
  writeJson(negWorker, {
    ...sealed,
    h04cB2: { ...sealed.h04cB2, phase: "negative-matrix" },
  });
  approvals.push(negWorker);
  stage(
    "negative-matrix",
    "negative",
    {
      ...db,
      ...pw.migration,
      ...pw.worker,
      ...pw.app,
      SENTINEL_DB_APPROVAL_FILE: approval(
        "neg-mig",
        "negative-matrix",
        900_000,
      ),
    },
    [
      `--worker-approval-file=${negWorker}`,
      `--app-approval-file=${approval("neg-app", "negative-matrix", 900_000)}`,
      `--migration-approval-file=${approval("neg-mig2", "negative-matrix", 900_000)}`,
    ],
  );
  stage("ui-verify", "ui", { ...db }, [
    `--cookie-file=${cookiePath}`,
    "--expect-status=investigating",
    "--exercise-transitions=1",
  ]);

  credentialLive = false;
  stage("cleanup", "cleanup", { ...db }, [
    `--cookie-file=${cookiePath}`,
    `--close-approvals=${approvals.join(",")}`,
  ]);
  stopApp();
  stage(
    "postflight",
    "postflight",
    {
      ...db,
      ...pw.migration,
      SENTINEL_DB_APPROVAL_FILE: approval("post", "postflight", 300_000),
    },
    [`--backup-file=${backup}`],
  );
  console.log("ACCEPTANCE_CYCLE_DONE");
}

main()
  .catch((e) => {
    console.error("CYCLE_FAILURE", String((e as Error).message).slice(0, 500));
    process.exitCode = 1;
    if (credentialLive && app) {
      try {
        stage("cleanup", "failure-cleanup", { ...db }, [
          `--cookie-file=${cookiePath}`,
        ]);
      } catch (c) {
        console.error(
          "FAILURE_CLEANUP_FAILED",
          String((c as Error).message).slice(0, 300),
        );
      }
    }
  })
  .finally(() => {
    stopApp();
    closeApprovals();
    try {
      writeJson(`${dir}/cycle-results.json`, results, "w");
      chmodSync(`${dir}/cycle-results.json`, 0o600);
    } catch {
      /* dir not created */
    }
  });
