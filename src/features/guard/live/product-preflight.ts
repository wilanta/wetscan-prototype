import { readFile, lstat, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { ApprovedPool, type SqlPool } from "../../../platform/database";
import { guardDatabaseConfig, guardRoles } from "./database-config";
import { guardMigrationPlan } from "./migrations";
import { LiveGuardError } from "./model";
import { verifiedSnapshotAcl, aclInspectionScript } from "./snapshot-directory";
import { fingerprint } from "../../../platform/identity";
import {
  sandboxControls,
  dockerDriver,
  type SandboxAttestation,
  type DockerDriver,
} from "../../../../worker/guard/sandbox";
import { verifyScannerInstallation } from "../../../../worker/guard/scanner-adapter";
import {
  loadDeployment,
  loadProductTarget,
  selectPolicy,
  type ProductDeployment,
} from "./product-deployment";
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
export function referenceMetadata(env: NodeJS.ProcessEnv) {
  return {
    app: {
      approvalReferencePresent: !!env.GUARD_DB_APP_APPROVAL_FILE,
      passwordReferencePresent: !!env.GUARD_DB_APP_PASSWORD_FILE,
    },
    worker: {
      approvalReferencePresent: !!env.GUARD_DB_WORKER_APPROVAL_FILE,
      passwordReferencePresent: !!env.GUARD_DB_WORKER_PASSWORD_FILE,
    },
  };
}
export async function assertPrivateRuntimeRoot(root: string) {
  const s = await lstat(root);
  if (
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    (await realpath(root)).toLowerCase() !== resolve(root).toLowerCase()
  )
    throw new LiveGuardError("not_configured");
  if (process.platform !== "win32") {
    if (
      (s.mode & 0o077) !== 0 ||
      (process.getuid && s.uid !== process.getuid())
    )
      throw new LiveGuardError("not_configured");
    return;
  }
  const run = promisify(execFile),
    os = process.env.SystemRoot;
  if (!os) throw new LiveGuardError("not_configured");
  const options = {
    env: { NODE_ENV: "production" as const, SystemRoot: os, WINDIR: os },
    windowsHide: true,
    timeout: 20000,
    maxBuffer: 16384,
    encoding: "utf8" as const,
  };
  const who = await run(
      join(os, "System32/whoami.exe"),
      ["/user", "/fo", "csv", "/nh"],
      options,
    ),
    sid = who.stdout.match(/S-\d+(?:-\d+)+/)?.[0];
  if (!sid || sid === "S-1-5-18") throw new LiveGuardError("not_configured");
  const literal = "'" + root.replaceAll("'", "''") + "'";
  const script = aclInspectionScript(literal);
  const acl = await run(
    join(os, "System32/WindowsPowerShell/v1.0/powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-Command", script],
    options,
  );
  if (!verifiedSnapshotAcl(JSON.parse(acl.stdout), sid))
    throw new LiveGuardError("not_configured");
}
export async function qualificationAttestation(
  root: string,
  d: ProductDeployment["deployments"][number],
): Promise<SandboxAttestation> {
  await verifyScannerInstallation(d.qualification, root);
  const file = join(
      root,
      `qualification.${d.qualification.evidenceSha256}.json`,
    ),
    s = await lstat(file);
  if (!s.isFile() || s.isSymbolicLink() || s.size > 65536)
    throw new LiveGuardError("execution_not_ready");
  const bytes = await readFile(file);
  if (sha(bytes) !== d.qualification.evidenceSha256)
    throw new LiveGuardError("execution_not_ready");
  const e = JSON.parse(bytes.toString("utf8")),
    q = d.qualification;
  const same = [
    "engine",
    "specDigest",
    "imageId",
    "daemonId",
    "daemonVersion",
    "kernelVersion",
    "verifiedAt",
    "expiresAt",
  ];
  if (
    e.version !== 1 ||
    e.module !== "guard-sandbox-qualification" ||
    e.classification !== "LIVE_VERIFIED_SANDBOX" ||
    typeof e.verifiedBy !== "string" ||
    !e.verifiedBy.trim() ||
    same.some((k) => e[k] !== q[k as keyof typeof q]) ||
    !Array.isArray(e.controls) ||
    new Set(e.controls).size !== sandboxControls.length ||
    sandboxControls.some((c) => !e.controls.includes(c)) ||
    ["controls", "timeout", "output", "cancellation", "cleanup"].some(
      (k) => e.tests?.[k] !== "PASS",
    )
  )
    throw new LiveGuardError("execution_not_ready");
  return {
    verify: async (m) => {
      if (
        Date.parse(e.expiresAt) <= Date.now() ||
        [
          "specDigest",
          "imageId",
          "daemonId",
          "daemonVersion",
          "kernelVersion",
        ].some((k) => m[k as keyof typeof m] !== e[k])
      )
        return null;
      return {
        expiresAt: Date.parse(e.expiresAt),
        verified: sandboxControls,
        artifactRef: q.evidenceSha256,
      };
    },
  };
}
/** Docker metadata only: never create/start/exec/pull/kill/remove. */
export async function verifyPhysical(
  d: ProductDeployment["deployments"][number],
  root: string,
  driver: DockerDriver = dockerDriver(d.spec.docker, d.spec.endpoint),
) {
  const attestation = await qualificationAttestation(root, d),
    opts = { configDirectory: root, timeoutMs: 5000, maxBytes: 64000 };
  const server = JSON.parse(
      await driver.call(["version", "--format", "{{json .Server}}"], opts),
    ),
    info = JSON.parse(
      await driver.call(["info", "--format", "{{json .}}"], opts),
    );
  const images = JSON.parse(
    await driver.call(
      ["image", "inspect", "--format", "{{json .}}", d.spec.image],
      opts,
    ),
  );
  if (
    server.Os !== "linux" ||
    info.OSType !== "linux" ||
    images.Id !== d.qualification.imageId ||
    !(/^sha256:[a-f0-9]{64}$/.test(d.spec.image)
      ? images.Id === d.spec.image
      : images.RepoDigests?.includes(d.spec.image)) ||
    !(await attestation.verify({
      specDigest: fingerprint(d.spec),
      imageId: images.Id,
      image: d.spec.image,
      daemonId: info.ID,
      daemonVersion: server.Version,
      kernelVersion: info.KernelVersion,
    }))
  )
    throw new LiveGuardError("execution_not_ready");
  return attestation;
}
/** Opens one isolated-purpose role; every observation rolls back explicitly. */
export async function verifyProductDatabase(
  pool: SqlPool,
  purpose: "app" | "worker",
  deployment: Pick<ProductDeployment, "target">,
  plan: Awaited<ReturnType<typeof guardMigrationPlan>>,
) {
  const c = await pool.connect();
  let failed = false;
  try {
    await c.query("BEGIN READ ONLY");
    await c.query(
      "SELECT set_config('wetscan.module','guard',true),set_config('wetscan.mode','live',true)",
    );
    const r = await c.query(
      "SELECT current_database() AS database,current_user AS role,pg_get_userbyid(d.datdba) AS owner,shobj_description(d.oid,'pg_database') AS marker,current_setting('transaction_read_only') AS readonly,r.rolsuper,r.rolbypassrls FROM pg_database d JOIN pg_roles r ON r.rolname=current_user WHERE d.datname=current_database()",
    );
    const x = r.rows[0];
    if (
      !x ||
      x.database !== deployment.target.database ||
      x.marker !== deployment.target.marker ||
      x.owner !== guardRoles.migration ||
      x.role !== guardRoles[purpose] ||
      x.readonly !== "on" ||
      x.rolsuper ||
      x.rolbypassrls
    )
      throw new LiveGuardError("approval_required");
    const ledger = await c.query(
        "SELECT version,checksum FROM guard.schema_migrations ORDER BY version",
      ),
      platform = await c.query(
        "SELECT version,checksum FROM platform.schema_migrations ORDER BY version",
      );
    if (
      fingerprint(ledger.rows) !==
        fingerprint([
          {
            version: plan.migration.version,
            checksum: plan.migration.checksum,
          },
        ]) ||
      fingerprint(platform.rows) !== fingerprint(plan.platformVersions)
    )
      throw new LiveGuardError("approval_required");
    const rls = await c.query(
      "SELECT count(*)::int AS verified FROM pg_class WHERE oid IN ('guard.scans'::regclass,'platform.jobs'::regclass,'platform.job_attempts'::regclass) AND relrowsecurity AND relforcerowsecurity",
    );
    if (rls.rows[0]?.verified !== 3)
      throw new LiveGuardError("approval_required");
    const budget = await c.query(
      "SELECT max_running FROM platform.module_limits WHERE module='guard'",
    );
    if (budget.rows[0]?.max_running !== 1)
      throw new LiveGuardError("approval_required");
    const privileges: [string, string, string?][] = [
      ["guard.scans", "SELECT"],
      ["guard.scans", "UPDATE"],
      ["platform.jobs", "SELECT"],
      ["platform.jobs", "INSERT"],
      ["platform.jobs", "UPDATE"],
      ["platform.job_attempts", "SELECT"],
      ["platform.job_attempts", "UPDATE", "outcome"],
      ["platform.job_attempts", "UPDATE", "finished_at"],
    ];
    if (purpose === "app") privileges.push(["guard.scans", "INSERT"]);
    else
      privileges.push(
        ["platform.job_attempts", "INSERT"],
        ["platform.worker_heartbeats", "SELECT"],
        ["platform.worker_heartbeats", "INSERT"],
        ["platform.worker_heartbeats", "UPDATE"],
        ["platform.module_limits", "UPDATE", "module"],
      );
    // PostgreSQL treats a comma-separated privilege list as ANY, not ALL.
    const grants = await c.query(
      `SELECT bool_and(CASE WHEN col IS NULL THEN has_table_privilege(current_user,t,p) ELSE has_column_privilege(current_user,t,col,p) END) AS verified FROM jsonb_to_recordset($1::jsonb) AS required(t text,p text,col text)`,
      [
        JSON.stringify(
          privileges.map(([t, p, col]) => ({ t, p, col: col ?? null })),
        ),
      ],
    );
    if (grants.rows[0]?.verified !== true)
      throw new LiveGuardError("approval_required");
    return {
      connected: true,
      roleVerified: true,
      targetVerified: true,
      schemaVerified: true,
      rlsVerified: true,
      readOnly: true,
    };
  } finally {
    try {
      await c.query("ROLLBACK");
    } catch {
      failed = true;
    }
    c.release(failed);
    if (failed) throw new LiveGuardError("source_unavailable");
  }
}
type ConfigurationPhase = "TARGET_CONFIGURATION" | "SCHEMA_PLAN" | "DATABASE_CHECK";
function configurationFailure(error: unknown, phase: ConfigurationPhase) {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const reason = code === "EACCES" || code === "EPERM" ? "FILE_ACCESS_DENIED"
    : code === "ENOENT" ? "FILE_NOT_FOUND"
    : code === "EIO" || code === "ENOTDIR" || code === "EISDIR" ? "FILE_IO_ERROR"
    : error instanceof SyntaxError ? "INVALID_JSON"
    : error instanceof LiveGuardError ? "VALIDATION_FAILED" : "UNKNOWN";
  return { phase, reason };
}
export async function probeProductReadiness(
  env: NodeJS.ProcessEnv,
  scope?: { workspaceId: string; projectId: string },
) {
  const refs = referenceMetadata(env),
    result = {
      classification: "AUTHENTICATED_READONLY_PREFLIGHT_NOT_SCAN_AUTHORITY",
      observedAt: new Date().toISOString(),
      references: refs,
      configuration: "NOT_CONFIGURED",
      configurationDiagnostic: null as ReturnType<typeof configurationFailure> | null,
      policyBinding: "NOT_VERIFIED",
      sandbox: "NOT_VERIFIED",
      appDatabase: "NOT_CONNECTED",
      workerDatabase: "NOT_CONNECTED",
      runtimeOperations: 0,
      credentialValuesExposed: false,
      pinnedCommitVerified: false,
    };
  if (!env.GUARD_PRODUCT_CONFIG_FILE) return result;
  let phase: ConfigurationPhase = "TARGET_CONFIGURATION";
  try {
    const target = await loadProductTarget(env.GUARD_PRODUCT_CONFIG_FILE);
    result.configuration = "TARGET_VERIFIED";
    try {
      const d = (await loadDeployment(env.GUARD_PRODUCT_CONFIG_FILE)).value;
      if (scope) {
        selectPolicy(d, scope.workspaceId, scope.projectId);
        result.policyBinding = "VERIFIED";
      }
      await assertPrivateRuntimeRoot(d.privateRoot);
      for (const e of d.deployments) await verifyPhysical(e, d.privateRoot);
      result.sandbox = "METADATA_AND_QUALIFICATION_VERIFIED";
    } catch {
      result.sandbox = "CONFIGURATION_QUALIFICATION_OR_IMAGE_NOT_READY";
    }
    phase = "SCHEMA_PLAN";
    const plan = await guardMigrationPlan();
    phase = "DATABASE_CHECK";
    for (const purpose of ["app", "worker"] as const) {
      const key = purpose === "app" ? "appDatabase" : "workerDatabase";
      if (
        !refs[purpose].approvalReferencePresent ||
        !refs[purpose].passwordReferencePresent
      ) {
        result[key] = "REFERENCE_MISSING_IN_THIS_PROCESS";
        continue;
      }
      let pool: ApprovedPool | undefined;
      try {
        const config = await guardDatabaseConfig(
          env,
          purpose,
          plan.sha256,
          target,
        );
        pool = new ApprovedPool(config);
        await verifyProductDatabase(pool, purpose, { target }, plan);
        result[key] = "READONLY_TARGET_ROLE_SCHEMA_RLS_VERIFIED";
      } catch {
        result[key] = "APPROVAL_TARGET_ROLE_SCHEMA_OR_CONNECTION_NOT_READY";
      } finally {
        await pool?.end();
      }
    }
  } catch (error) {
    if (phase === "TARGET_CONFIGURATION") result.configuration = "INVALID_TARGET_CONFIGURATION";
    if (phase === "DATABASE_CHECK") {
      result.appDatabase = "DATABASE_PREFLIGHT_INCOMPLETE";
      result.workerDatabase = "DATABASE_PREFLIGHT_INCOMPLETE";
    }
    result.configurationDiagnostic = configurationFailure(error, phase);
  }
  return result;
}
