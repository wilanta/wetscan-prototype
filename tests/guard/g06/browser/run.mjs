import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const stateDir =
  process.platform === "win32"
    ? join(process.env.LOCALAPPDATA ?? tmpdir(), "WetScanGuardG06")
    : join(process.env.XDG_STATE_HOME || "/tmp", "wetscan-guard-g06");

const pointer = JSON.parse(
  await readFile(join(stateDir, "g06-local-pg.pointer.json"), "utf8"),
);

await new Promise((done, reject) => {
  const srv = createServer();
  srv.once("error", () =>
    reject(new Error("Port 3120 occupied; preserving existing process.")),
  );
  srv.listen(3120, "127.0.0.1", () => srv.close(done));
});

const workspaceId = "github-user-70006:G06 Live Verification";
const projectId = "github-101";
const commitSha = "a".repeat(40);
const scanId = "e".repeat(64);
const bootPw = (
  await readFile(join(pointer.root, "bootstrap.password"), "utf8")
).trim();

// Seed isolated G06 browser E2E baseline data cleanly into Guard & Sentinel PG databases
const guardAdmin = new pg.Pool({
  host: pointer.target.host,
  port: pointer.port,
  database: pointer.target.database,
  user: "postgres",
  password: bootPw,
  max: 2,
});
const sentinelAdmin = new pg.Pool({
  host: pointer.target.host,
  port: pointer.port,
  database: pointer.sentinelTarget.database,
  user: "postgres",
  password: bootPw,
  max: 2,
});

try {
  // Clear prior runs for workspaceId so every run starts deterministically
  for (const t of [
    "guard.g06_audit",
    "guard.g06_reports",
    "guard.g06_intelligence_sync",
    "guard.g06_delivery_attempts",
    "guard.g06_outbox",
    "guard.g06_canvas_overlays",
    "guard.g05_findings",
    "guard.g05_reports",
    "guard.g05_runs",
    "guard.g05_test_plans",
    "guard.g05_grants",
    "guard.g05_targets",
    "guard.g04_check_runs",
    "guard.g04_evaluations",
    "guard.g04_triggers",
    "guard.g04_policies",
    "guard.scans",
  ]) {
    await guardAdmin
      .query(`DELETE FROM ${t} WHERE workspace_id=$1`, [workspaceId])
      .catch(() => undefined);
  }

  const job = {
    mode: "live",
    workspaceId,
    projectId,
    id: scanId,
    idempotencyKey: `g02-live-${scanId.slice(0, 12)}`,
    requestedEngines: ["sast", "sca", "sbom"],
    repository: {
      provider: "github",
      repositoryId: "101",
      branch: "main",
      commit: commitSha,
    },
    profile: "standard",
    status: "completed",
    createdAt: "2026-11-20T02:00:00.000Z",
    finishedAt: "2026-11-20T02:02:00.000Z",
    runs: [
      {
        engine: "sast",
        status: "completed",
        reason: "Scanned cleanly",
        scanner: "opengrep",
        version: "1.99.0",
        rulePack: "p/default",
        artifactDigest: "f".repeat(64),
        executionEvidence: {
          version: 1,
          runId: "run-g06-e2e",
          imageId: "wetscan-g02-scanners:local",
          specDigest: "d".repeat(64),
          installationArtifactSha256: "b".repeat(64),
          cleanup: "VERIFIED",
        },
      },
      {
        engine: "sbom",
        status: "completed",
        reason: "Generated CycloneDX SBOM",
        scanner: "cdxgen",
        version: "1.0.0",
        rulePack: "cyclonedx-1.6",
        artifactDigest: "f".repeat(64),
        executionEvidence: {
          version: 1,
          runId: "sbom-g06-e2e",
          imageId: "wetscan-g02-scanners:local",
          specDigest: "d".repeat(64),
          installationArtifactSha256: "b".repeat(64),
          cleanup: "VERIFIED",
        },
      },
    ],
    findings: [
      {
        mode: "live",
        workspaceId,
        projectId,
        id: "f-e2e-inv",
        title: "Unbounded inventory SQL query",
        severity: "high",
        confidence: "high",
        status: "verified",
        source: {
          engine: "sast",
          scanner: "opengrep",
          version: "1.99.0",
          ruleId: "ts.pg.raw-query",
          rulePack: "p/default",
        },
        location: { path: "src/app/api/inventory/route.ts", line: 1 },
        evidence: [
          {
            id: "ev-1",
            commit: commitSha,
            recordedAt: "2026-11-20T02:01:00.000Z",
            summary: "SQL query invoked inside GET handler",
            artifactDigest: "f".repeat(64),
            synthetic: false,
          },
        ],
      },
      {
        mode: "live",
        workspaceId,
        projectId,
        id: "f-e2e-unmatched",
        title: "Out-of-graph script note",
        severity: "low",
        confidence: "medium",
        status: "potential",
        source: {
          engine: "sast",
          scanner: "opengrep",
          version: "1.99.0",
          ruleId: "docs.note",
          rulePack: "p/default",
        },
        location: { path: "docs/untracked.md", line: 3 },
        evidence: [],
      },
    ],
    inventory: [
      {
        ecosystem: "npm",
        name: "lodash",
        version: "4.17.20",
        license: null,
        sourcePath: "package-lock.json",
      },
    ],
    sbom: {
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      version: 1,
      metadata: {
        properties: [
          { name: "wetscan:repository-id", value: "101" },
          { name: "wetscan:commit", value: commitSha },
          { name: "wetscan:scanner-artifact-sha256", value: "f".repeat(64) },
        ],
      },
      components: [
        {
          type: "library",
          "bom-ref": "dep-0",
          name: "lodash",
          version: "4.17.20",
          properties: [
            { name: "wetscan:ecosystem", value: "npm" },
            { name: "wetscan:source-path", value: "package-lock.json" },
          ],
        },
      ],
    },
    sourceCoverage: {
      status: "complete",
      retrievedFiles: 3,
      excludedFiles: 0,
      treeTruncated: false,
    },
    audit: [
      {
        actorId: "github-user-70006",
        at: "2026-11-20T02:00:00.000Z",
        action: "repository_scan_requested",
        subjectId: scanId,
        reason: "e2e-seed",
      },
    ],
  };

  await guardAdmin.query(
    `INSERT INTO guard.scans(mode,workspace_id,project_id,scan_id,idempotency_key,fingerprint,repository_id,commit_sha,status,job,created_at)
     VALUES('live',$1,$2,$3,$4,$5,'101',$6,'completed',$7::jsonb,clock_timestamp())`,
    [workspaceId, projectId, scanId, job.idempotencyKey, "1".repeat(64), commitSha, JSON.stringify(job)],
  );

  // Seed G04 BLOCK evaluation (enforced = false)
  await guardAdmin.query(
    `INSERT INTO guard.g04_policies(workspace_id,project_id,repository_id,repository_name,installation_id,installation_state,owner_actor,owner_user_id,policy,policy_digest,revision,updated_by)
     VALUES($1,$2,'101','fixture/wetscan-web',77,'active','github-user-70006',70006,$3::jsonb,$4,1,'github-user-70006')`,
    [
      workspaceId,
      projectId,
      JSON.stringify({
        version: 1,
        enabled: true,
        protectedBranches: ["main"],
        triggers: { pullRequest: true, push: true, manual: true, schedule: false },
        scanProfile: "standard",
        requiredEngines: ["sast"],
        blockSeverities: ["critical", "high"],
        warnSeverities: ["medium"],
        minBlockConfidence: "medium",
        blockPotential: true,
        requireCompleteSourceCoverage: true,
        onMissingCoverage: "incomplete",
        onUnknownSeverity: "incomplete",
        onNotApplicable: "incomplete",
        warnConclusion: "neutral",
        incompleteConclusion: "action_required",
      }),
      "2".repeat(64),
    ],
  );
  await guardAdmin.query(
    `INSERT INTO guard.g04_triggers(workspace_id,project_id,id,source,repository_id,installation_id,branch,protect_branch,commit_sha,policy_revision,status,idempotency_key,actor)
     VALUES($1,$2,$3,'push','101',77,'main','main',$4,1,'completed','trg-g06-e2e-1','github-user-70006')`,
    [workspaceId, projectId, "4".repeat(64), commitSha],
  );
  await guardAdmin.query(
    `INSERT INTO guard.g04_evaluations(workspace_id,project_id,id,trigger_id,scan_id,commit_sha,branch,policy_revision,decision,evaluation,enforcement)
     VALUES($1,$2,$3,$4,$5,$6,'main',1,'BLOCK','{"blockedBy":["f-e2e-inv"]}'::jsonb,'{"enforced":false}'::jsonb)`,
    [workspaceId, projectId, "3".repeat(64), "4".repeat(64), scanId, commitSha],
  );

  // Seed Sentinel S09 project binding + GHSA advisory
  await sentinelAdmin.query(
    "DELETE FROM sentinel.ext_inventory_items WHERE workspace_id=$1",
    [workspaceId],
  );
  await sentinelAdmin.query(
    "DELETE FROM sentinel.ext_inventory_snapshots WHERE workspace_id=$1",
    [workspaceId],
  );
  await sentinelAdmin.query(
    `INSERT INTO sentinel.project_bindings(mode,workspace_id,project_id,repository_id,actor_id,enabled)
     VALUES('live',$1,$2,'101','github-user-70006',true)
     ON CONFLICT (mode,workspace_id,project_id) DO UPDATE SET enabled=true, actor_id='github-user-70006'`,
    [workspaceId, projectId],
  );
  await sentinelAdmin.query(
    `INSERT INTO sentinel.ext_advisories(canonical_id,provider,source_id,ident,status,title,summary,severity,published_at,modified_at,source_url,raw_sha256,content_hash,retrieved_at)
     VALUES('GHSA-35jh-r3h4-6jhm','osv','GHSA-35jh-r3h4-6jhm',ARRAY['CVE-2021-23337'],'active','Command injection in lodash','Lodash template injection','high','2021-02-15T00:00:00Z','2024-01-01T00:00:00Z','https://osv.dev/GHSA-35jh-r3h4-6jhm',$1,$1,clock_timestamp())
     ON CONFLICT (provider,source_id) DO NOTHING`,
    ["9".repeat(64)],
  );
  await sentinelAdmin.query(
    `INSERT INTO sentinel.ext_affected(provider,source_id,idx,ecosystem,package_name,ranges,versions,fixed,certainty)
     SELECT 'osv','GHSA-35jh-r3h4-6jhm',0,'npm','lodash','[{"introduced":"0","fixed":"4.17.21","lastAffected":null}]'::jsonb,ARRAY['4.17.20'],ARRAY['4.17.21'],'verified'
     WHERE NOT EXISTS (SELECT 1 FROM sentinel.ext_affected WHERE provider='osv' AND source_id='GHSA-35jh-r3h4-6jhm' AND package_name='lodash')`,
  );
  await sentinelAdmin.query(
    `UPDATE sentinel.ext_sources SET status='ok', last_success_at=clock_timestamp(), last_attempt_at=clock_timestamp(), record_count=GREATEST(record_count, 1) WHERE provider='osv'`,
  );
} finally {
  await Promise.all([guardAdmin.end(), sentinelAdmin.end()]);
}

const authDir = await mkdtemp(join(tmpdir(), "wetscan-g06-e2e-"));
const cleanEnv = { ...process.env };
for (const k of Object.keys(cleanEnv)) {
  if (/^(?:SENTINEL_|GUARD_|GITHUB_|GITLAB_|AUTH_|WETSCAN_|PG|DATABASE_URL$|APP_URL$|NODE_OPTIONS$)/.test(k)) {
    delete cleanEnv[k];
  }
}

const baseNodeOpts = `--require "${join(root, "tests/auth/skip-dotenv.cjs").replaceAll("\\", "/")}"`;
const buildEnv = {
  ...cleanEnv,
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_OPTIONS: baseNodeOpts,
};
const sharedDbEnv = {
  GUARD_LIVE_READ_ENABLED: "1",
  GUARD_G06_ENABLED: "1",
  GUARD_DB_APP_APPROVAL_FILE: join(pointer.root, "app.database.json"),
  GUARD_DB_APP_PASSWORD_FILE: join(pointer.root, "app.password"),
  GUARD_DB_WORKER_APPROVAL_FILE: join(pointer.root, "worker.database.json"),
  GUARD_DB_WORKER_PASSWORD_FILE: join(pointer.root, "worker.password"),
  SENTINEL_DB_HOST: pointer.sentinelTarget.host,
  SENTINEL_DB_PORT: String(pointer.port),
  SENTINEL_DB_NAME: pointer.sentinelTarget.database,
  SENTINEL_DB_MARKER: pointer.sentinelTarget.marker,
  SENTINEL_DB_APPROVAL_FILE: join(pointer.root, "sentinel-app.database.json"),
  SENTINEL_DB_APP_PASSWORD_FILE: join(pointer.root, "sentinel-app.password"),
};
const serverEnv = {
  ...cleanEnv,
  ...sharedDbEnv,
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  APP_URL: "http://127.0.0.1:3120",
  AUTH_DATA_DIR: authDir,
  AUTH_SECRET: randomBytes(32).toString("hex"),
  WETSCAN_G06_BROWSER_E2E: "1",
  NODE_OPTIONS: `${baseNodeOpts} --import "${pathToFileURL(join(root, "tests/guard/g06/browser/auth-fixture.mjs")).href}"`,
};

function runSyncChild(args, env) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, args, {
      cwd: root,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    p.once("error", () => resolve(2));
    p.once("exit", (c) => resolve(c ?? 2));
  });
}

const buildCode = await runSyncChild(
  [join(root, "node_modules/next/dist/bin/next"), "build", "--webpack"],
  buildEnv,
);
if (buildCode !== 0) {
  await rm(authDir, { recursive: true, force: true }).catch(() => undefined);
  process.exit(buildCode);
}

let serverProc;
let workerProc;
let pwExit = 2;

try {
  workerProc = spawn(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      pathToFileURL(join(root, "scripts/server-only-stub.mjs")).href,
      "--import",
      "tsx",
      join(root, "scripts/guard-g06-worker.ts"),
    ],
    {
      cwd: root,
      env: { ...cleanEnv, ...sharedDbEnv, NODE_OPTIONS: baseNodeOpts },
      stdio: "inherit",
      windowsHide: true,
    },
  );

  serverProc = spawn(
    process.execPath,
    [
      join(root, "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3120",
    ],
    { cwd: root, env: serverEnv, stdio: "inherit", windowsHide: true },
  );

  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (serverProc.exitCode !== null) {
      throw new Error(`next start exited early (${serverProc.exitCode})`);
    }
    try {
      const r = await fetch("http://127.0.0.1:3120/onboarding");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {
      /* waiting */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!ready) throw new Error("G06 E2E Next.js server timed out.");

  pwExit = await runSyncChild(
    [
      join(root, "node_modules/@playwright/test/cli.js"),
      "test",
      "-c",
      join(root, "tests/guard/g06/browser/playwright.config.ts"),
    ],
    cleanEnv,
  );
} finally {
  for (const proc of [serverProc, workerProc]) {
    if (proc && proc.exitCode === null) proc.kill("SIGTERM");
  }
  await new Promise((r) => setTimeout(r, 500));
  await rm(authDir, { recursive: true, force: true }).catch(() => undefined);
}

await mkdir(join(root, "test-results/guard-g06"), { recursive: true });
await writeFile(
  join(root, "test-results/guard-g06/browser.result.json"),
  JSON.stringify(
    {
      classification: "COMPLETE_LOCAL_PG_VERIFIED",
      finishedAt: new Date().toISOString(),
      exitCode: pwExit,
      databasePort: pointer.port,
    },
    null,
    2,
  ) + "\n",
);
process.exitCode = pwExit;
