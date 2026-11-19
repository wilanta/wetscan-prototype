/** Owner-invoked existing-password installer. Never run by the agent with real credentials. */
import { mkdir, readdir, realpath, writeFile } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { guardMigrationPlan } from "../src/features/guard/live/migrations";
import { assertPrivateRuntimeRoot } from "../src/features/guard/live/product-preflight";
export const g02Target = {
  host: "localhost",
  port: 5432,
  database: "wetscan_dev_guardg02",
  marker: "wetscan-s01:f0927e49-0e70-4b90-913f-6cd6984df9d8",
};
export function referenceDocuments(
  plan: string,
  expiresAt: string,
  now = Date.now(),
) {
  if (
    !/^[a-f0-9]{64}$/.test(plan) ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) <= now ||
    Date.parse(expiresAt) > now + 30 * 86400000
  )
    throw Error("INVALID_SETUP_METADATA");
  const approval = (purpose: "app" | "worker") => ({
    schemaVersion: 1,
    status: "APPROVED",
    module: "guard",
    purpose,
    role: purpose === "app" ? "wetscan_guard_app" : "wetscan_guard_worker",
    target: g02Target,
    actions: ["runtime"],
    approvedBy: "owner-local-existing-password-setup",
    approvedAt: new Date(now).toISOString(),
    expiresAt,
    migrationPlanSha256: plan,
  });
  return {
    app: approval("app"),
    worker: approval("worker"),
    target: {
      version: 1,
      module: "guard-product-runtime",
      hosting: "self_hosted_node",
      target: g02Target,
      policies: [],
      deployments: [],
      setup: "DATABASE_PREFLIGHT_ONLY_SCANNING_DISABLED",
    },
  };
}
export function validateExistingPasswords(input: unknown) {
  const v = input as { app: string; worker: string };
  if (
    !v ||
    Object.keys(v).sort().join() !== "app,worker" ||
    [v.app, v.worker].some(
      (s) =>
        typeof s !== "string" ||
        s.length < 20 ||
        s.length > 512 ||
        s.trim() !== s ||
        /[\r\n\0]/.test(s),
    )
  )
    throw Error("EXISTING_PASSWORD_INPUT_INVALID");
  // Values are never generated, changed, echoed, logged, passed in argv/env, or returned.
  return v;
}
async function secureNewRoot(root: string) {
  await mkdir(root, { mode: 0o700 });
  if (
    (await readdir(root)).length ||
    !/^wetscan-g02-runtime-db-[a-f0-9-]{36}$/.test(basename(root))
  )
    throw Error("NEW_EMPTY_SETUP_ROOT_REQUIRED");
  if (process.platform === "win32") {
    const system = process.env.SystemRoot;
    if (!system) throw Error("WINDOWS_METADATA_UNAVAILABLE");
    const literal = "'" + root.replaceAll("'", "''") + "'";
    const command =
      "$p=" +
      literal +
      "; $u=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; " +
      "$a=[System.Security.AccessControl.DirectorySecurity]::new(); $a.SetOwner($u); $a.SetAccessRuleProtection($true,$false); " +
      "foreach($s in @($u,[System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) { " +
      "$r=[System.Security.AccessControl.FileSystemAccessRule]::new($s,[System.Security.AccessControl.FileSystemRights]::FullControl," +
      "[System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[System.Security.AccessControl.PropagationFlags]::None," +
      "[System.Security.AccessControl.AccessControlType]::Allow); $a.AddAccessRule($r) }; Set-Acl -LiteralPath $p -AclObject $a";
    await promisify(execFile)(
      join(system, "System32/WindowsPowerShell/v1.0/powershell.exe"),
      ["-NoProfile", "-NonInteractive", "-Command", command],
      {
        windowsHide: true,
        timeout: 10000,
        maxBuffer: 16000,
        env: { SystemRoot: system, WINDIR: system, NODE_ENV: process.env.NODE_ENV ?? "development" },
      },
    );
  }
  await assertPrivateRuntimeRoot(root);
}
async function readInput() {
  const chunks: Buffer[] = [];
  let size = 0;
  const timer = setTimeout(
    () => process.stdin.destroy(Error("INPUT_TIMEOUT")),
    30000,
  );
  try {
    for await (const c of process.stdin) {
      const b = Buffer.from(c);
      size += b.length;
      if (size > 8192) throw Error("INPUT_LIMIT");
      chunks.push(b);
    }
    const encoded = Buffer.concat(chunks).toString("ascii").trim();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
      throw Error("INPUT_ENCODING_INVALID");
    const decoded = Buffer.from(encoded, "base64");
    try {
      if (decoded.length > 4096) throw Error("INPUT_LIMIT");
      return validateExistingPasswords(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded)),
      );
    } finally {
      decoded.fill(0);
    }
  } finally {
    clearTimeout(timer);
    for (const c of chunks) c.fill(0);
  }
}
async function main() {
  if (
    process.argv.length !== 5 ||
    process.argv[2] !== "--existing-passwords-base64-stdin" ||
    process.argv[3] !== "--expires-at"
  )
    throw Error("EXPLICIT_EXISTING_PASSWORD_SETUP_REQUIRED");
  const plan = await guardMigrationPlan(),
    documents = referenceDocuments(plan.sha256, process.argv[4]);
  if (
    plan.sha256 !==
    "b63e1e8568babcf8d7811fe0fa735ecbec11ade64df19bdea78deb030a85869d"
  )
    throw Error("MIGRATION_PLAN_DRIFT");
  const secrets = await readInput();
  const project = await realpath(process.cwd());
  if (!project.toLowerCase().endsWith("wetscan-guard-mvp-local-demo"))
    throw Error("INTEGRATION_WORKTREE_REQUIRED");
  const parent = resolve(project, ".local");
  await mkdir(parent, { recursive: true });
  if ((await realpath(parent)).toLowerCase() !== parent.toLowerCase())
    throw Error("PRIVATE_PARENT_SYMLINK_DENIED");
  const root = join(parent, "wetscan-g02-runtime-db-" + randomUUID());
  await secureNewRoot(root);
  const appPassword = join(root, "app.password"),
    workerPassword = join(root, "worker.password");
  await writeFile(appPassword, secrets.app, { flag: "wx", mode: 0o600 });
  await writeFile(workerPassword, secrets.worker, { flag: "wx", mode: 0o600 });
  secrets.app = "";
  secrets.worker = "";
  const appApproval = join(root, "app.database.json"),
    workerApproval = join(root, "worker.database.json"),
    config = join(root, "target-only.json");
  for (const [file, value] of [
    [appApproval, documents.app],
    [workerApproval, documents.worker],
    [config, documents.target],
  ] as const)
    await writeFile(file, JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
  await assertPrivateRuntimeRoot(root);
  // Capture this JSON into an owner-terminal variable; do not paste refs/paths into chat.
  console.log(
    JSON.stringify({
      refs: {
        GUARD_DB_APP_APPROVAL_FILE: appApproval,
        GUARD_DB_APP_PASSWORD_FILE: appPassword,
        GUARD_DB_WORKER_APPROVAL_FILE: workerApproval,
        GUARD_DB_WORKER_PASSWORD_FILE: workerPassword,
        GUARD_PRODUCT_CONFIG_FILE: config,
      },
      safe: {
        classification:
          "OWNER_EXISTING_PASSWORD_FILES_INSTALLED_NOT_DATABASE_AUTHENTICATED",
        target: g02Target,
        privateAclVerified: true,
        distinctFiles: true,
        configurationExpiresAt: process.argv[4],
        scanningEnabled: false,
        passwordChanged: false,
        databaseConnected: false,
        runtimeOperations: 0,
      },
    }),
  );
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/guard-live-setup.ts"))
  main().catch(() => {
    console.log(
      JSON.stringify({
        error: "G02_SETUP_STOP_NO_RETRY_INSPECT_METADATA_ONLY",
      }),
    );
    process.exitCode = 1;
  });
