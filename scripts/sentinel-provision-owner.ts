import { execFileSync } from "node:child_process";
import { open, readFile, readdir, lstat, realpath } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { createDecipheriv, createHash } from "node:crypto";
import nextEnvironment from "@next/env";
import { assertProvisionPackageBoundary } from "./sentinel-provision-enforcement";
import {
  discoverHistoricalApprovals,
  requireHistoricalClosed,
  type HistoricalApproval,
} from "./sentinel-approval-history";
import { ApprovedPool } from "../src/platform/database";
import {
  observeProvisionDatabase,
  provisionDiagnostics,
  provisionFailure,
  type ProvisionDiagnostics,
} from "./sentinel-provision-diagnostics";
import { migrationPlan } from "../src/platform/migrations";
import {
  requireH04CB2ExecutionGate,
  s04DevBaseline,
  verifyPreRecoverySnapshot,
} from "../tests/sentinel/dev-acceptance-safety";
import { captureReadOnlyDevState } from "./sentinel-dev-acceptance";
import {
  check,
  emergencyContain,
  executeProvision,
  hash,
  ProvisionError,
  provisionContext,
  validateProvisionApprovals,
  verifyProvisionDelta,
  verifyProvisionStart,
  type JournalEntry,
  type ProvisionDeps,
  type ProvisionState,
  type ResourceIds,
} from "./sentinel-provision-safety";

const repo = fileURLToPath(new URL("..", import.meta.url));
const defaultRoot = "C:/Users/sheil/.wetscan-sentinel";
const recoveryDefault = join(
  defaultRoot,
  "s04-h04c-b2-recovery-b3ecaac2-a04c-417f-83e9-64fcdd3cab41",
);
const containmentDefault = join(
  defaultRoot,
  "s04-h04c-b2-contain-codex-f1862fad0fd1475d86cd39b2badba1cb",
);
const pinnedContainment: Record<string, string> = {
  "containment.json":
    "8b83c60fc15625671f44962f67f74572c4d1842ca1ad84a6c9e91f58da22c507",
  "contain-rule-postcheck.json":
    "9b2514fdc8843bbde93053938b4cee0d29dfe0e28939e1d48638ac8e61f7d984",
  "dev-contain-rule-approval.json":
    "e1eac3d6f911efd7b113f147845e5b2f8d6f1d123385fa194795f0f847845fc8",
  "execution-summary.sanitized.json":
    "0ae8e2bb84858eaa2d334e704fd4c270c0c38c3a9a188f7d8a83d81fe73a464c",
};
export const arg = (name: string, fallback?: string) =>
  process.argv
    .find((v) => v.startsWith(`--${name}=`))
    ?.slice(name.length + 3) ?? fallback;
function requiredArg(name: string) {
  const value = arg(name);
  check(value, "missing_argument");
  return value;
}
export async function privatePath(path: string) {
  check(
    isAbsolute(path) &&
      !/^\\\\/.test(path) &&
      !/[\\/]OneDrive(?: - [^\\/]+)?(?:[\\/]|$)/i.test(path),
    "private_path",
  );
  const abs = resolve(path),
    rel = relative(resolve(repo), abs);
  check(
    rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel),
    "private_path",
  );
  let cursor = abs;
  while (true) {
    const stat = await lstat(cursor).catch((e) => {
      if (e.code !== "ENOENT") throw new ProvisionError("private_path");
      return null;
    });
    check(!stat?.isSymbolicLink(), "private_reparse");
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return abs;
}
export function assertPrivateAcl(directory: string, file = false) {
  check(process.platform === "win32", "windows_required");
  try {
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-File",
        join(repo, "scripts/sentinel-provision-private.ps1"),
        "-Directory",
        directory,
        ...(file ? ["-File"] : []),
      ],
      { stdio: "pipe", windowsHide: true },
    );
  } catch {
    throw new ProvisionError("private_acl");
  }
}
export async function exclusiveJson(path: string, value: unknown) {
  await exclusiveText(path, JSON.stringify(value, null, 2) + "\n");
}
export async function exclusiveText(path: string, text: string) {
  await privatePath(path);
  assertPrivateAcl(dirname(path));
  const fd = await open(path, "wx", 0o600);
  try {
    await fd.writeFile(text, "utf8");
    await fd.sync();
    assertPrivateAcl(path, true);
  } finally {
    await fd.close();
  }
}
async function json(path: string) {
  return JSON.parse(await readFile(path, "utf8"));
}
export async function treeHashes(
  root: string,
  excludedDirectory?: string,
): Promise<Record<string, string>> {
  const output: Record<string, string> = {};
  await privatePath(root);
  for (const f of await readdir(root, { withFileTypes: true })) {
    const path = join(root, f.name);
    if (path === excludedDirectory) continue;
    check(!f.isSymbolicLink(), "artifact_reparse");
    if (f.isDirectory())
      Object.assign(output, await treeHashes(path, excludedDirectory));
    else output[path] = hash(await readFile(path));
  }
  return output;
}
export async function inspectApprovalHistory() {
  return discoverHistoricalApprovals({
    root: defaultRoot,
    verifyBoundary: privatePath,
    // Historical evidence is read-only: verify its directory boundary without
    // rewriting inherited legacy ACLs. New output/secret ACL checks stay strict.
    verifyDirectory: privatePath,
  });
}
export async function verifyAllPriorApprovals() {
  const records = await inspectApprovalHistory();
  requireHistoricalClosed(records);
  return records;
}
export async function loadProvisionInputs(ownedOutput?: string) {
  const historical = await inspectApprovalHistory();
  // ownedOutput is supplied only after the live gate validates this exact pair.
  const prior = historical.filter(
    (a) =>
      !ownedOutput ||
      !["web-runtime-approval.json", "controller-runtime-approval.json"].some(
        (name) => a.path === join(ownedOutput, name),
      ),
  );
  return loadPreservationInputs(prior);
}
/** Shared filesystem-only input verification; it grants no database permission. */
export async function loadPreservationInputs(prior: HistoricalApproval[]) {
  requireHistoricalClosed(prior);
  const recovery = await privatePath(
    dirname(
      arg("pre-recovery", join(recoveryDefault, "pre-recovery-baseline.json"))!,
    ),
  );
  const containment = await privatePath(
    dirname(arg("containment", join(containmentDefault, "containment.json"))!),
  );
  const pre = verifyPreRecoverySnapshot(
    await json(join(recovery, "pre-recovery-baseline.json")),
  );
  check(
    pre.preRecoverySha256 ===
      "198c67e08647f12fbde99c72d01bb50b2f8d2cb4238bd88d854f89f6d550af2e",
    "recovery_checksum",
  );
  for (const [file, digest] of Object.entries(pinnedContainment))
    check(
      hash(await readFile(join(containment, file))) === digest,
      "containment_checksum",
    );
  const c = await json(join(containment, "containment.json"));
  const post = await json(join(containment, "contain-rule-postcheck.json"));
  const approval = await json(
    join(containment, "dev-contain-rule-approval.json"),
  );
  check(
    c.preRecoverySha256 === pre.preRecoverySha256 &&
      c.ruleRowBeforeHash === pre.priorRuleRowHashesById?.[c.ruleId] &&
      c.finalStatus === "DISABLED" &&
      c.finalRevision === 3 &&
      post.status === "PASS" &&
      approval.status === "CLOSED" &&
      approval.actions.length === 0,
    "containment_link",
  );
  const h04ca = await privatePath(
    (
      await readFile(
        join(repo, ".local/sentinel/s04-h04c-a-private-directory.txt"),
        "utf8",
      )
    )
      .replace(/^\uFEFF/, "")
      .trim(),
  );
  const before = await json(join(h04ca, "before.json"));
  check(
    before.digest === s04DevBaseline.historicalDigest &&
      hash(JSON.stringify(before.deterministicState)) === before.digest,
    "historical_checksum",
  );
  const backup = await readFile(join(h04ca, "wetscan_dev-before-0004.dump"));
  check(
    backup.length === s04DevBaseline.backupSizeBytes &&
      hash(backup) === s04DevBaseline.backupSha256,
    "backup_checksum",
  );
  const plan = await migrationPlan();
  check(plan.sha256 === s04DevBaseline.planSha256, "plan_checksum");
  const preserved = {
    ...Object.fromEntries(prior.map((a) => [a.path, a.sha256])),
    ...(await treeHashes(h04ca)),
    ...(await treeHashes(recovery)),
    ...(await treeHashes(containment)),
  };
  // Both failed attempts and all their files are immutable inputs too.
  Object.assign(
    preserved,
    await treeHashes(
      join(
        defaultRoot,
        "s04-h04c-b2-contain-retry-14ad56d619ca4c9d859ba5e734dfb715",
      ),
    ),
  );
  const codeFiles = [
    "scripts/sentinel-dev-acceptance.ts",
    "scripts/sentinel-provision-safety.ts",
    "scripts/sentinel-provision-owner.ts",
    "scripts/sentinel-provision-diagnostics.ts",
    "src/platform/database.ts",
    "scripts/sentinel-approval-history.ts",
    "scripts/Invoke-H04CB2ProvisionAndIngest.ps1",
    "scripts/sentinel-provision-common.ps1",
    "scripts/sentinel-provision-auth.ps1",
    "scripts/sentinel-provision-watchdog.ps1",
    "scripts/sentinel-provision-private.ps1",
    "scripts/sentinel-session-get.ps1",
    "tests/sentinel/dev-acceptance-safety.ts",
  ];
  for (const file of codeFiles)
    preserved[join(repo, file)] = hash(await readFile(join(repo, file)));
  return { pre, before, plan, preserved, recovery, containment };
}
export async function verifyPreserved(preserved: Record<string, string>) {
  for (const [path, digest] of Object.entries(preserved))
    check(hash(await readFile(path)) === digest, "artifact_changed");
}
function noWorkers() {
  const script =
    "$p=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'node|tsx' -and $_.CommandLine -match 'worker[\\\\/](sentinel|guard)' }); Write-Output $p.Count";
  check(
    execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf8", windowsHide: true },
    ).trim() === "0",
    "worker_activity",
  );
}
async function gate(output: string, diagnostic?: ProvisionDiagnostics) {
  if (diagnostic) diagnostic.stage = "execution_opt_in";
  check(
    process.env.SENTINEL_PROVISION_EXECUTION === "1" &&
      process.env.SENTINEL_PROVISION_ACTIVE_HANDOFF === "1" &&
      process.env.SENTINEL_PROVISION_EMERGENCY === "1",
    "provision_opt_in",
  );
  if (diagnostic) diagnostic.stage = "approval_validation";
  check(
    resolve(process.env.SENTINEL_DB_APPROVAL_FILE ?? "") ===
      join(output, "controller-runtime-approval.json"),
    "controller_approval_path",
  );
  const web = await json(join(output, "web-runtime-approval.json"));
  const deadlineMs = validateProvisionApprovals([
    web,
    await json(join(output, "controller-runtime-approval.json")),
  ]);
  if (diagnostic) diagnostic.stage = "database_configuration";
  for (const k of Object.keys(process.env))
    if (/^SENTINEL_DB_(APP|WORKER|BOOTSTRAP|TEST)_PASSWORD_FILE$/.test(k))
      check(!process.env[k], "role_credentials");
  const config = await requireH04CB2ExecutionGate(
    process.env,
    "migration",
    "runtime",
    { phase: "provision-ingest", maxTtlMs: 600000 },
  );
  return { config, deadlineMs };
}
/** Resume only from this package's own deadline-stopped run, before any ingest began. */
async function loadResume(output: string, operation: string) {
  const from = arg("resume-from");
  if (!from) return undefined;
  check(operation === "audit-start" || operation === "execute", "resume_scope");
  const dir = await privatePath(from);
  check(
    resolve(dirname(dir)) === resolve(defaultRoot) &&
      /^s04-h04c-b2-provision-package-[a-f0-9]{32}$/.test(basename(dir)) &&
      resolve(dir) !== resolve(output),
    "resume_scope",
  );
  assertPrivateAcl(dir);
  check(
    (await lstat(join(dir, "deadline-expired.json"))).isFile(),
    "resume_state",
  );
  const entries = (
    await readFile(join(dir, "resource-journal.private.jsonl"), "utf8")
  )
    .split(String.fromCharCode(10))
    .filter(Boolean)
    .map((l) => JSON.parse(l) as JournalEntry);
  // Only the side-effect-free invalid-bearer 401 probe may be uncertain (it was cut by the deadline).
  check(
    !entries.some(
      (e) => e.type === "uncertain" && e.operation !== "invalid-bearer",
    ),
    "resume_uncertain",
  );
  const ids: ResourceIds = {};
  for (const e of entries) if (e.type === "ack") Object.assign(ids, e.ids);
  const secret = await privatePath(
    join(dir, "h04c-b2-ingest-credential.secret"),
  );
  assertPrivateAcl(secret, true);
  return {
    ids,
    start: (await json(
      join(dir, "phase-start.private.json"),
    )) as ProvisionState,
    credential: (await readFile(secret, "utf8")).trim(),
  };
}
async function capture(
  pool: ApprovedPool,
  inputs: Awaited<ReturnType<typeof loadProvisionInputs>>,
  diagnostic?: ProvisionDiagnostics,
) {
  if (diagnostic) diagnostic.stage = "read_only_snapshot";
  const state = await captureReadOnlyDevState(pool, true);
  if (diagnostic) diagnostic.stage = "migration_validation";
  check(
    JSON.stringify(state.ledger.map((r) => [r.version, r.checksum])) ===
      JSON.stringify(
        inputs.plan.migrations.map((r) => [r.version, r.checksum]),
      ),
    "migration_identity",
  );
  return state;
}
export function assertNoAmbientCredentials(
  env: Readonly<Record<string, string | undefined>>,
) {
  for (const key of Object.keys(env))
    if (
      /^SENTINEL_DB_(APP|MIGRATION|WORKER|BOOTSTRAP|TEST)_PASSWORD_FILE$/.test(
        key,
      )
    )
      check(!env[key], "dotenv_credentials");
}
export async function provisionOffline() {
  await verifyAllPriorApprovals();
  const inputs = await loadProvisionInputs();
  // This runs in a separate diagnostic process; no getSession call can delete
  // an expired private record and no provider/database request is made.
  nextEnvironment.loadEnvConfig(repo, false, { info() {}, error() {} });
  check(
    process.env.APP_URL === "http://localhost:3000" &&
      Buffer.byteLength(process.env.AUTH_SECRET ?? "") >= 32,
    "auth_configuration",
  );
  assertNoAmbientCredentials(process.env);
  const authDir = await privatePath(process.env.AUTH_DATA_DIR ?? "");
  const cookieFile = await privatePath(
    arg(
      "cookie-file",
      join(defaultRoot, "s01-20261114/secrets/owner-session.cookie"),
    )!,
  );
  const cookie = (await readFile(cookieFile, "utf8")).trim();
  check(/^wetscan_session=[a-f0-9]{64}$/.test(cookie), "cookie_format");
  const meta = await json(cookieFile + ".meta.json");
  check(
    meta.origin === process.env.APP_URL &&
      meta.callbackUrl === process.env.APP_URL + "/api/auth/github/callback",
    "cookie_origin",
  );
  function decode(file: Buffer, name: string) {
    const d = createDecipheriv(
      "aes-256-gcm",
      createHash("sha256").update(process.env.AUTH_SECRET!).digest(),
      file.subarray(0, 12),
    );
    d.setAAD(Buffer.from(name));
    d.setAuthTag(file.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([d.update(file.subarray(28)), d.final()]).toString("utf8"),
    );
  }
  const sessionName =
    "session-" + hash(cookie.slice("wetscan_session=".length));
  const session = decode(
    await readFile(join(authDir, sessionName + ".bin")),
    sessionName,
  );
  const userName = "user-" + session.githubId;
  const user = decode(
    await readFile(join(authDir, userName + ".bin")),
    userName,
  );
  check(
    session.expiresAt > Date.now() &&
      session.githubId === 187839747 &&
      user.githubId === session.githubId &&
      user.workspace === "test" &&
      user.completedAt &&
      user.installationId &&
      user.repositories.some((r: { id: number }) => r.id === 998736528),
    "session_identity",
  );
  noWorkers();
  const conflicting = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$p=@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne ${process.pid} -and $_.Name -match 'node|tsx' -and $_.CommandLine -match 'next[\\\\/]dist[\\\\/]bin[\\\\/]next|next-server|sentinel-dev-acceptance|sentinel-provision-owner' }); Write-Output $p.Count`,
    ],
    { encoding: "utf8", windowsHide: true },
  ).trim();
  check(conflicting === "0", "process_conflict");
  const historicalApprovals = Object.keys(inputs.preserved).filter((p) =>
    p.endsWith("dev-contain-rule-approval.json"),
  );
  for (const path of historicalApprovals) {
    const a = await json(path);
    check(
      a.status === "CLOSED" && a.actions.length === 0,
      "prior_approval_open",
    );
  }
  const app = arg(
      "app-password-file",
      join(defaultRoot, "s01-20261114/secrets/app.password"),
    )!,
    mig = arg(
      "migration-password-file",
      join(defaultRoot, "s01-20261114/secrets/migration.password"),
    )!;
  await privatePath(app);
  await privatePath(mig);
  check((await realpath(app)) !== (await realpath(mig)), "credential_files");
  const appBytes = await readFile(app),
    migBytes = await readFile(mig);
  check(
    appBytes.toString().trim().length >= 20 &&
      migBytes.toString().trim().length >= 20 &&
      hash(appBytes) !== hash(migBytes),
    "credential_files",
  );
  await readFile(join(repo, ".next/BUILD_ID"));
  const port = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$p=@(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue); Write-Output $p.Count",
    ],
    { encoding: "utf8", windowsHide: true },
  ).trim();
  check(port === "0", "port_conflict");
  return {
    status: "OFFLINE_READY",
    databaseConnections: 0,
    executionPerformed: false,
    phase: "provision-ingest",
    cli: "provision-and-ingest",
    inputsVerified: true,
    normalInsertMaximum: 10,
    emergencyInsertMaximum: 12,
    activeHandoffRequiresSeparateApproval: true,
  };
}
/** Consume the response inside its HTTP deadline before the filesystem boundary.
 * No acknowledgement or subsequent mutation is permitted until the hook passes.
 */
export async function readProvisionResponse(
  response: Pick<Response, "status" | "json">,
) {
  const result = {
    status: response.status,
    json: await response.json().catch(() => null),
  };
  await assertProvisionPackageBoundary();
  return result;
}
export async function runProvisionOperation(
  operation: string,
  diagnostic = provisionDiagnostics(operation),
) {
  if (operation === "approvals-check") {
    diagnostic.stage = "approval_validation";
    const records = await verifyAllPriorApprovals();
    console.log(
      JSON.stringify({
        status: "CLOSED",
        count: records.length,
        databaseConnections: 0,
        executionPerformed: false,
      }),
    );
    return;
  }
  if (operation === "offline") {
    diagnostic.stage = "input_validation";
    console.log(JSON.stringify(await provisionOffline()));
    return;
  }
  // All callers, including direct CLI/import and the older acceptance alias,
  // must pass this same gate before any pool or live operation exists.
  check(
    [
      "audit-start",
      "execute",
      "recover",
      "audit-end",
      "audit-failure-end",
    ].includes(operation),
    "phase_operation",
  );
  await assertProvisionPackageBoundary();
  diagnostic.stage = "output_validation";
  const output = await privatePath(requiredArg("artifact-dir"));
  assertPrivateAcl(output);
  const { config, deadlineMs } = await gate(output, diagnostic);
  diagnostic.stage = "input_validation";
  const inputs = await loadProvisionInputs(output);
  diagnostic.stage = "process_isolation";
  noWorkers();
  diagnostic.stage = "pool_setup";
  const pool = new ApprovedPool(config, (event) =>
    observeProvisionDatabase(diagnostic, event),
  );
  const readStart = async () =>
    (await json(join(output, "phase-start.private.json"))) as ProvisionState;
  try {
    if (operation === "audit-start") {
      const resume = await loadResume(output, operation);
      const state = await capture(pool, inputs, diagnostic);
      diagnostic.stage = "historical_validation";
      if (resume) {
        verifyProvisionStart(
          resume.start,
          inputs.pre,
          inputs.before.deterministicState.rowHashesByTable,
        );
        verifyProvisionDelta(resume.start, state, resume.ids, {
          partial: true,
          credentialHash: hash(resume.credential),
        });
      } else
        verifyProvisionStart(
          state,
          inputs.pre,
          inputs.before.deterministicState.rowHashesByTable,
        );
      diagnostic.stage = "artifact_write";
      await exclusiveJson(
        join(output, "input-manifest.private.json"),
        inputs.preserved,
      );
      await exclusiveJson(
        join(output, "phase-start.private.json"),
        resume ? resume.start : state,
      );
      console.log(
        JSON.stringify({
          status: "PASS",
          operation,
          oldRowsVerified: 91,
          oldJobsVerified: 16,
        }),
      );
      return;
    }
    diagnostic.stage = "phase_operation";
    await verifyPreserved(
      await json(join(output, "input-manifest.private.json")),
    );
    const start = await readStart();
    if (operation === "audit-failure-end") {
      const state = await capture(pool, inputs);
      await exclusiveJson(
        join(output, "failure-phase-end.private.json"),
        state,
      );
      const journalPath = join(output, "resource-journal.private.jsonl");
      const entries = (await readFile(journalPath, "utf8").catch(() => ""))
        .split("\n")
        .filter(Boolean)
        .map((s) => JSON.parse(s) as JournalEntry);
      const ids: ResourceIds = {};
      for (const entry of entries)
        if (entry.type === "ack") Object.assign(ids, entry.ids);
      const audit = verifyProvisionDelta(start, state, ids, {
        partial: true,
        emergency: true,
      });
      const oldSourceIds = new Set(start.sources.map((r) => r.source_id)),
        oldRuleIds = new Set(start.rules.map((r) => r.rule_id));
      check(
        state.sources
          .filter((r) => !oldSourceIds.has(r.source_id))
          .every((r) => !r.enabled && r.active_credentials === 0) &&
          state.rules
            .filter((r) => !oldRuleIds.has(r.rule_id))
            .every((r) => r.status !== "ENABLED"),
        "failure_resources_active",
      );
      await exclusiveJson(
        join(output, "failure-final-audit.sanitized.json"),
        audit,
      );
      console.log(JSON.stringify(audit));
      return;
    }
    if (operation === "audit-end") {
      const result = await json(join(output, "provision-result.private.json"));
      const secret = await privatePath(
        join(output, "h04c-b2-ingest-credential.secret"),
      );
      assertPrivateAcl(secret, true);
      check(
        hash((await readFile(secret, "utf8")).trim()) === result.credentialHash,
        "credential_file_integrity",
      );
      const state = await capture(pool, inputs);
      await exclusiveJson(join(output, "phase-end.private.json"), state);
      const audit = verifyProvisionDelta(start, state, result.ids, {
        credentialHash: result.credentialHash,
        preIngestAt: result.preIngestAt,
        expectedEvent: result.expectedEvent,
      });
      await exclusiveJson(
        join(output, "provision-audit.sanitized.json"),
        audit,
      );
      console.log(JSON.stringify(audit));
      return;
    }
    check(
      operation === "execute" || operation === "recover",
      "operation_denied",
    );
    const cookie = (
      await readFile(await privatePath(requiredArg("cookie-file")), "utf8")
    ).trim();
    check(/^wetscan_session=[a-f0-9]{64}$/.test(cookie), "cookie_format");
    check(arg("origin") === "http://localhost:3000", "origin");
    let credential = "";
    const base = "http://localhost:3000/api/sentinel/projects/github-998736528";
    if (operation === "recover")
      check(
        (await lstat(join(output, "resource-journal.private.jsonl"))).isFile(),
        "missing_resource_journal",
      );
    const fd = await open(
      join(output, "resource-journal.private.jsonl"),
      operation === "execute" ? "wx" : "a",
      0o600,
    );
    const journal = async (entry: JournalEntry) => {
      await fd.write(
        JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n",
      );
      await fd.sync();
    };
    const guard = async () => {
      await gate(output);
      noWorkers();
      check(Date.now() < deadlineMs, "deadline_expired");
    };
    const deps: ProvisionDeps = {
      origin: "http://localhost:3000",
      cookie,
      start,
      deadlineMs,
      now: Date.now,
      guard,
      capture: () => capture(pool, inputs),
      journal,
      rememberCredential: (v) => {
        credential = v;
      },
      saveSecret: (v) =>
        exclusiveText(
          join(output, "h04c-b2-ingest-credential.secret"),
          v + "\n",
        ),
      request: async (path, method, body, kind = "session") => {
        await assertProvisionPackageBoundary();
        await guard();
        let url =
          path === "ingest"
            ? "http://localhost:3000/api/sentinel/ingest"
            : `${base}/${path}`;
        if (path === "foreign")
          url =
            "http://localhost:3000/api/sentinel/projects/github-999999999999/incidents";
        if (path === "demo")
          url =
            "http://localhost:3000/api/sentinel/projects/orderly-demo/incidents";
        if (path === "bad-origin") url = base + "/incidents";
        const headers: Record<string, string> = {
          "content-type": "application/json",
        };
        if (kind === "session") {
          headers.cookie = cookie;
          headers.origin =
            path === "bad-origin"
              ? "https://evil.invalid"
              : "http://localhost:3000";
        }
        if (kind === "invalid")
          headers.authorization = "Bearer ws2.invalid.deadbeef";
        if (kind === "bearer") headers.authorization = "Bearer " + credential;
        const response = await fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          redirect: "manual",
          signal: AbortSignal.timeout(
            Math.max(1, Math.min(10000, deadlineMs - Date.now())),
          ),
        });
        // Auth may re-encrypt only the selected candidate. Check before the
        // caller acknowledges this response or proceeds to another mutation.
        return readProvisionResponse(response);
      },
    };
    try {
      if (operation === "recover") {
        const entries = (
          await readFile(join(output, "resource-journal.private.jsonl"), "utf8")
        )
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((s) => JSON.parse(s) as JournalEntry);
        const ids: ResourceIds = {};
        for (const entry of entries)
          if (entry.type === "ack") Object.assign(ids, entry.ids);
        await exclusiveJson(
          join(output, "emergency-observed-state.private.json"),
          await capture(pool, inputs),
        );
        const audit = await emergencyContain(deps, start, ids);
        await exclusiveJson(
          join(output, "emergency-audit.sanitized.json"),
          audit,
        );
        console.log(JSON.stringify({ status: "FAIL_CONTAINED", operation }));
        return;
      }
      const state = await capture(pool, inputs);
      const resume = await loadResume(output, operation);
      if (resume) {
        verifyProvisionDelta(start, state, resume.ids, {
          partial: true,
          allowApp: true,
          credentialHash: hash(resume.credential),
        });
        check(
          JSON.stringify(start) === JSON.stringify(resume.start),
          "resume_start_drift",
        );
      } else {
        verifyProvisionStart(
          state,
          inputs.pre,
          inputs.before.deterministicState.rowHashesByTable,
          true,
        );
        for (const [table, hashes] of Object.entries(start.rowHashesByTable))
          check(
            JSON.stringify([...hashes].sort()) ===
              JSON.stringify([...state.rowHashesByTable[table]].sort()),
            "start_state_drift",
          );
      }
      const result = await executeProvision(deps, resume);
      await exclusiveJson(
        join(output, "provision-result.private.json"),
        result,
      );
      const context = provisionContext(
        output,
        inputs.pre,
        {
          recovery: join(inputs.recovery, "pre-recovery-baseline.json"),
          containment: join(inputs.containment, "containment.json"),
        },
        result,
      );
      await exclusiveJson(join(output, "run-context.json"), context);
      await exclusiveJson(join(output, "active-handoff.sanitized.json"), {
        status: "PENDING_FINAL_AUDIT",
        sourceId: result.ids.sourceId,
        ruleId: result.ids.ruleId,
        sourceEnabled: true,
        credentialActive: true,
        ruleRevision: 2,
        credentialFile: "h04c-b2-ingest-credential.secret",
        nextPhasesRequireSeparateApproval: true,
        eventualContainment:
          "Revoke credential, disable new source and rule in separately approved final cleanup. No automatic processing.",
      });
      console.log(
        JSON.stringify({
          status: "PROVISIONED_PENDING_FINAL_AUDIT",
          phase: "provision-and-ingest",
          ids: result.ids,
        }),
      );
    } catch (error) {
      await journal({
        type: "failure",
        operation:
          error instanceof ProvisionError ? error.code : "provision_failed",
        ids: {},
      });
      throw error;
    } finally {
      await fd.close();
    }
  } finally {
    await pool.end();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const diagnostic = provisionDiagnostics(process.argv[2] ?? "offline");
  runProvisionOperation(process.argv[2] ?? "offline", diagnostic).catch(
    (error) => {
      console.error(JSON.stringify(provisionFailure(error, diagnostic)));
      process.exitCode = 1;
    },
  );
}
