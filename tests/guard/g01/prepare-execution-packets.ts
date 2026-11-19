/** Documentation/hash preparation only. Never opens DB/Auth/daemon, activates permits, enqueues or starts a worker. */
import { readdir, readFile, mkdir, writeFile, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  caseLimits,
  fixtureTarget,
  type CaseId,
} from "../../../worker/guard/acceptance/catalog";
import {
  validatePacket,
  hash,
  currentHostRuntime,
  type ExecutionPacket,
} from "../../../worker/guard/acceptance/approval";
import { verifyArtifacts } from "../../../worker/guard/acceptance/integrity";
import { reviewWorkspace } from "../../../worker/guard/acceptance/package";
import { caseSpecs } from "../../../worker/guard/acceptance/case-specs";
import { probeProgram } from "../../../worker/guard/acceptance/probe-spec";
import { guardMigrationPlan } from "../../../src/features/guard/live/migrations";
import { fingerprint } from "../../../src/platform/identity";
const root = "docs/acceptance/guard-g01/remaining-gates-v3",
  v1 = "docs/acceptance/guard-g01/remaining-gates-v1";
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const write = async (file: string, value: unknown) =>
  writeFile(
    join(root, file),
    typeof value === "string"
      ? value.trimEnd() + "\n"
      : JSON.stringify(value, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
async function walk(directory: string) {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
    const file = join(directory, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) result.push(...(await walk(file)));
    else if (/\.(?:ts|tsx|py|cjs|mjs)$/.test(file)) result.push(file);
  }
  return result;
}
const sqlLiteral = (s: string) => "'" + s.replaceAll("'", "''") + "'";
function projectionSql(p: ExecutionPacket) {
  const b = p.binding,
    scope = b
      ? `mode='live' AND workspace_id=${sqlLiteral(b.workspaceId)} AND project_id=${sqlLiteral(b.projectId)}`
      : "false",
    scan = b ? `(${scope} AND scan_id=${sqlLiteral(b.jobId)})` : "false",
    job = b ? `(${scope} AND job_id=${sqlLiteral(b.jobId)})` : "false",
    workers = p.workerIds.length
      ? `ARRAY[${p.workerIds.map(sqlLiteral).join(",")}]::text[]`
      : "ARRAY[]::text[]";
  const rows = (table: string, where: string) =>
    `(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM ${table} t WHERE ${where})`;
  return `-- Frozen READ ONLY projection for ${p.caseId}. Run before and after; ROLLBACK separately. No writes or destructive lifecycle operations.\nBEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSET LOCAL lock_timeout='1s';\nSET LOCAL statement_timeout='5s';\nDO $target$ BEGIN IF current_database()<>'wetscan_s01_test_guardg01' OR current_user<>'postgres' OR inet_server_port() IS DISTINCT FROM 5432 OR NOT COALESCE(inet_server_addr() IN ('127.0.0.1'::inet,'::1'::inet),false) OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM '${fixtureTarget.marker}' OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'wetscan_guard_migrator' THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF; END $target$;\nSET LOCAL row_security=off;\nWITH projection AS(SELECT jsonb_build_object(\n 'scans',${rows("guard.scans", `NOT ${scan}`)},\n 'jobs',${rows("platform.jobs", `module='guard' AND NOT ${job}`)},\n 'attempts',${rows("platform.job_attempts", `module='guard' AND NOT ${job}`)},\n 'outbox',${rows("platform.notification_outbox", `module='guard' AND NOT ${job}`)},\n 'heartbeats',${rows("platform.worker_heartbeats", `module='guard' AND NOT(worker_id=ANY(${workers}))`)},\n 'guardLedger',${rows("guard.schema_migrations", "true")},\n 'platformLedger',${rows("platform.schema_migrations", "true")},\n 'guardBudget',${rows("platform.module_limits", "module='guard'")},\n 'guardCatalog',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',c.relowner,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity) ORDER BY c.relname),'[]'::jsonb) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='guard'),\n 'guardPolicies',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM pg_policies t WHERE schemaname='guard'),\n 'guardGrants',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM information_schema.table_privileges t WHERE table_schema='guard')\n ) AS document)\nSELECT jsonb_build_object('caseId','${p.caseId}','database',current_database(),'port',inet_server_port(),'marker',shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database'),'owner',(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()),'projectionSha256',encode(sha256(convert_to(document::text,'UTF8')),'hex'),'excludedJob',${b ? sqlLiteral(b.jobId) : "NULL"},'excludedWorkers',to_jsonb(${workers}),'currentCaseScans',(SELECT count(*)::int FROM guard.scans WHERE ${scan}),'currentCaseJobs',(SELECT count(*)::int FROM platform.jobs WHERE module='guard' AND ${job}),'observedAt',clock_timestamp(),'rlsVerified',(SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE oid IN('guard.scans'::regclass,'platform.module_limits'::regclass))) AS guard_projection FROM projection;\n-- Keep this safe JSON together with SQL18's safe JSON as {sentinel:<SQL18>,guard:<this result>}.\n-- ROLLBACK; must be executed separately.\n`;
}
async function main() {
  const context = await reviewWorkspace();
  if (process.argv[2] !== "--write" || process.argv.length !== 3) {
    console.log(
      JSON.stringify({
        status: "PREPARATION_ONLY_EXPLICIT_WRITE_REQUIRED",
        runtimeOperations: 0,
      }),
    );
    return;
  }
  if (
    resolve(process.cwd()).toLowerCase() !==
      "c:\\laragon\\www\\wetscan-2\\wetscan-guard-g01-s03-candidate" ||
    context.head !== "1ae505c65934b4135c402395936ff9d552b3d3cc"
  )
    throw Error("reverify preparation baseline");
  for (const folder of [
    "packets",
    "templates",
    "specs",
    "operator",
    "cases",
    "review",
  ])
    await mkdir(join(root, folder), { recursive: true });
  const plan = await guardMigrationPlan(),
    program = await probeProgram(),
    ids = Object.keys(caseLimits) as CaseId[],
    prepared: ExecutionPacket[] = [];
  for (const caseId of ids) {
    const old = (await json(join(v1, "approval-intents", caseId + ".json")))
        .packet,
      limits = caseLimits[caseId],
      runId = randomUUID();
    prepared.push({
      schemaVersion: 2,
      module: "guard-g01-acceptance",
      caseId,
      execution:
        caseId === "Q00" || caseId === "N00"
          ? "qualification"
          : caseId === "C02B"
            ? "cleanup_only"
            : caseId.startsWith("L")
              ? "schema_readonly"
              : "foundation_probe",
      runId,
      target: fixtureTarget,
      hostRuntime: currentHostRuntime(),
      binding: limits[0] ? old.proposedJob.binding : null,
      repositoryName: limits[0] ? "inkAja/wdu" : null,
      workerIds: Array.from(
        { length: limits[1] },
        (_, i) => `g01-rgv2-${caseId.toLowerCase()}-${i}-${runId.slice(0, 8)}`,
      ),
      containerNames: Array.from(
        { length: limits[3] },
        () => "wetscan-guard-" + randomUUID(),
      ),
      limits: {
        enqueues: limits[0],
        launches: limits[1],
        snapshots: limits[2],
        containers: limits[3],
        cancels: limits[4],
        minutes: limits[5],
      },
      artifacts: [],
      specDigests: caseSpecs(caseId, program).map(fingerprint),
      migrationPlanSha256: plan.sha256,
      programSha256: hash(program),
      daemon: null,
      cleanupReference: null,
    });
  }
  await write("review/context.json", {
    createdAt: new Date().toISOString(),
    classification: "OFFLINE_PREPARATION_NOT_RUNTIME_AUTHORITY",
    ...context,
    hostRuntime: currentHostRuntime(),
    developmentRemote: "https://github.com/wilanta/wetscan-prototype",
    existingPr: "https://github.com/wilanta/wetscan-prototype/pull/7",
    owner: "owner/Codex",
    target: fixtureTarget,
    oldJobNeverRepeated:
      "2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18",
    actualDbConnections: 0,
    scannerOrWorkerLaunches: 0,
  });
  await write("review/environment-observation.json", {
    classification: "HISTORICAL_PREREQUISITE_CARRIED_FORWARD_NOT_REPROBED",
    source:
      "docs/acceptance/guard-g01/remaining-gates-v2/review/environment-observation.json",
    observation: await json(
      "docs/acceptance/guard-g01/remaining-gates-v2/review/environment-observation.json",
    ),
    currentRuntimeOperations: 0,
  });
  for (const p of prepared) {
    await write(`specs/${p.caseId}.json`, {
      caseId: p.caseId,
      programSha256: hash(program),
      specs: caseSpecs(p.caseId, program),
      specDigests: p.specDigests,
      classification: "FROZEN_SPEC_NOT_ENFORCEMENT_PROOF",
      casePolicy:
        p.caseId === "N04"
          ? {
              grantTtlMs: 60000,
              minimumHoldSinceIssuedMs: 61000,
              boundaryAfterAuthorize: true,
              requiredErrorClass: "GuardError",
              requiredErrorCode: "forbidden",
              retryDatabaseCallback: "NEVER_CALLED",
              unknown: "STOP_WITHOUT_CANCEL_OR_RETRY",
              snapshots: 0,
              containers: 0,
            }
          : null,
    });
    await write(
      `operator/${p.caseId}.preservation.READONLY.sql`,
      projectionSql(p),
    );
  }
  await write("operator/rollback-only.sql", "ROLLBACK;\n");
  const sourceRoots = [
    "worker/guard",
    "src/features/guard",
    "src/platform",
    "src/lib/auth",
    "src/features/canvas/server",
    "src/app/api/guard",
  ];
  const files = new Set<string>([
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "src/features/sentinel/platform-contracts.ts",
    "src/features/sentinel/types.ts",
    "src/features/sentinel/scope.ts",
    "worker/sentinel/executor.ts",
    "worker/sentinel/lifecycle.ts",
    "tests/auth/skip-dotenv.cjs",
    "tests/guard/run-validation.mjs",
    "tests/guard/g01/prepare-execution-packets.ts",
    ...(await walk("tests/guard/g01")),
    ...(await walk("tests/guard").then((list) =>
      list.filter(
        (f) => !f.includes("/fixtures/") && !f.includes("/evidence/"),
      ),
    )),
    "docs/acceptance/guard-g01/18-readonly-initial-observer-comparison.sql",
    `${v1}/operator/retained-data-down-refusal.READONLY.sql`,
    `${root}/README.md`,
    `${root}/review/context.json`,
    `${root}/review/environment-observation.json`,
  ]);
  for (const source of sourceRoots)
    for (const file of await walk(source)) files.add(file);
  for (const p of prepared) {
    files.add(`${root}/specs/${p.caseId}.json`);
    files.add(`${root}/operator/${p.caseId}.preservation.READONLY.sql`);
  }
  files.add(`${root}/operator/rollback-only.sql`);
  const artifacts = [];
  for (const file of [...files].sort()) {
    const stat = await lstat(file);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 2000000)
      throw Error("invalid code artifact");
    artifacts.push({ file, sha256: hash(await readFile(file)) });
  }
  const entries = [];
  for (const p of prepared) {
    p.artifacts = artifacts;
    const docker = p.limits.containers > 0 || p.caseId === "N00",
      blocked = docker
        ? "DOCKER_VERSION_UNAVAILABLE"
        : p.caseId === "C02B"
          ? "ACTUAL_WINDOW_A_AND_ONE_HOUR_REQUIRED"
          : null,
      file = `${blocked ? "templates" : "packets"}/${p.caseId}.json`;
    if (!blocked) {
      validatePacket(p);
      await verifyArtifacts(p);
    }
    await write(file, p);
    const old = (await json(join(v1, "approval-intents", p.caseId + ".json")))
        .packet,
      entry = {
        caseId: p.caseId,
        file,
        requestSha256: hash(JSON.stringify(p)),
        packetVerified: !blocked,
        canRequestMutationApproval: !blocked && p.caseId !== "L02",
        runtimeAuthorityActive: false,
        runtimeExecution: "NOT_RUN",
        blocker: blocked,
        requiresOwnerReadonlySql: p.caseId === "L02",
        maximumWindowMinutes: p.limits.minutes,
        newJobId: p.binding?.jobId ?? null,
      };
    entries.push(entry);
    await write(
      `cases/${p.caseId}.md`,
      `# ${p.caseId}: ${old.title}\n\nOwner: owner/Codex. Runtime: NOT_RUN. ${blocked ? "BLOCKED: " + blocked : "Frozen packet/code verification passed; no runtime authority is active."}\n\nRequest SHA256: \`${entry.requestSha256}\`. [Packet](${"../" + file}). Maximum ${p.limits.minutes} minutes from a NEW owner approval. Counts: enqueue ${p.limits.enqueues}, new durable jobs ${p.limits.enqueues}, worker launches ${p.limits.launches}, snapshot acquisitions ${p.limits.snapshots}, containers ${p.limits.containers}, explicit cancellations ${p.limits.cancels}. One physical Guard container at a time; no scanner runs.\n\n${old.permittedEffectDescription}\n\nDatabase effect: ${old.databaseEffects}\n\nControlled fault: ${old.controlledFault}\n\nExpected independent evidence: ${old.expectedEvidence}\n\nFollow [execution procedure](../README.md). Current Auth/HEAD, exact code/spec hashes, DB marker/roles, before-preservation evidence, lease and permit expiry are checked before effects. A failed/unknown operation consumes its slot. Stop after any unexpected failure; do not retry, remove markers or rebind a job. No test double or old attestation is live evidence.\n\n${p.caseId === "C02B" ? "Window B is materialized only from actual completed C02A registration and unchanged marker after real age >= one hour, then requires a NEW cleanup-only approval. There is no executable B request yet." : ""}\n`,
    );
  }
  await write("review/APPROVAL_EXAMPLE.NOT_AUTHORIZED.json", {
    schemaVersion: 2,
    module: "guard-g01-acceptance-approval",
    status: "NOT_AUTHORIZED",
    packetSha256: "OWNER_MUST_SELECT_ONE_VERIFIED_PACKET",
    approvedBy: null,
    approvedAt: null,
    expiresAt: null,
    note: "This example is deliberately rejected by runtime. Never self-approve or invent timestamps.",
  });
  await write("code-manifest.json", {
    schemaVersion: 2,
    classification: "FROZEN_IMPLEMENTATION_AND_OFFLINE_ARTIFACTS",
    artifactHashEncoding: "SHA256 raw file bytes",
    baseHead: context.head,
    branch: context.branch,
    artifacts,
    artifactSetSha256: hash(JSON.stringify(artifacts)),
  });
  await write("approval-index.json", {
    schemaVersion: 2,
    status: "CODE_FROZEN_NO_RUNTIME_PERMISSION",
    owner: "owner/Codex",
    requestHashEncoding: "SHA256(JSON.stringify(packet))",
    artifactSetSha256: hash(JSON.stringify(artifacts)),
    cases: entries,
    externalSentinel: {
      status: "NOT_VERIFIED",
      reason: "TARGET_NOT_IDENTIFIED",
    },
    fullSchemaDown: "BLOCKED_BY_PRESERVATION_CONSTRAINT",
  });
  console.log(
    JSON.stringify({
      status: "FROZEN_NOT_AUTHORIZED",
      artifactCount: artifacts.length,
      validPackets: entries
        .filter((e) => e.packetVerified)
        .map((e) => e.caseId),
      blocked: entries
        .filter((e) => !e.packetVerified)
        .map((e) => ({ caseId: e.caseId, blocker: e.blocker })),
      runtimeOperations: 0,
    }),
  );
}
main().catch(() => {
  console.error(
    JSON.stringify({ status: "PREPARATION_FAILED", runtimeOperations: 0 }),
  );
  process.exitCode = 2;
});
