import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const stateDir = join(
  process.env.LOCALAPPDATA ?? join(process.env.HOME ?? ".", ".local/share"),
  "WetScanGuardG05",
);

const pointer = JSON.parse(await readFile(join(stateDir, "current.json"), "utf8"));
const staging = JSON.parse(await readFile(join(stateDir, "staging-runtime.json"), "utf8"));
const pinPath = join(stateDir, "synthetic-target-pin.json");

// Verify Docker synthetic staging health first
const stHealth = await fetch(`${staging.origin}/healthz`, { signal: AbortSignal.timeout(3000) });
if (!stHealth.ok) throw new Error(`Synthetic staging container unreachable at ${staging.origin}`);

await new Promise((done, reject) => {
  const srv = createServer();
  srv.once("error", () => reject(new Error("Port 3119 occupied; preserving existing process.")));
  srv.listen(3119, "127.0.0.1", () => srv.close(done));
});

const authDir = await mkdtemp(join(tmpdir(), "wetscan-g05-e2e-"));
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
const serverEnv = {
  ...cleanEnv,
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  APP_URL: "http://127.0.0.1:3119",
  AUTH_DATA_DIR: authDir,
  AUTH_SECRET: randomBytes(32).toString("hex"),
  WETSCAN_G05_BROWSER_E2E: "1",
  GUARD_G05_ENABLED: "1",
  GUARD_G05_DB_APP_APPROVAL_FILE: join(pointer.root, "app.database.json"),
  GUARD_G05_DB_APP_PASSWORD_FILE: join(pointer.root, "app.password"),
  GUARD_G05_DB_WORKER_APPROVAL_FILE: join(pointer.root, "worker.database.json"),
  GUARD_G05_DB_WORKER_PASSWORD_FILE: join(pointer.root, "worker.password"),
  GUARD_G05_VAULT_KEY_FILE: join(pointer.root, "vault.key"),
  GUARD_G05_SYNTHETIC_TARGET_FILE: pinPath,
  NODE_OPTIONS: `${baseNodeOpts} --import "${pathToFileURL(join(root, "tests/guard/g05/browser/auth-fixture.mjs")).href}"`,
};

const workerEnv = {
  ...cleanEnv,
  GUARD_G05_ENABLED: "1",
  GUARD_G05_DB_APP_APPROVAL_FILE: join(pointer.root, "app.database.json"),
  GUARD_G05_DB_APP_PASSWORD_FILE: join(pointer.root, "app.password"),
  GUARD_G05_DB_WORKER_APPROVAL_FILE: join(pointer.root, "worker.database.json"),
  GUARD_G05_DB_WORKER_PASSWORD_FILE: join(pointer.root, "worker.password"),
  GUARD_G05_VAULT_KEY_FILE: join(pointer.root, "vault.key"),
  GUARD_G05_SYNTHETIC_TARGET_FILE: pinPath,
  NODE_OPTIONS: baseNodeOpts,
};

function runSyncChild(args, env) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, args, { cwd: root, env, stdio: "inherit", windowsHide: true });
    p.once("error", () => resolve(2));
    p.once("exit", (c) => resolve(c ?? 2));
  });
}

// Build production Webpack bundle cleanly
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
    ["--import", "tsx", join(root, "scripts/guard-g05-worker.ts"), "--loop"],
    { cwd: root, env: workerEnv, stdio: "inherit", windowsHide: true },
  );

  serverProc = spawn(
    process.execPath,
    [join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3119"],
    { cwd: root, env: serverEnv, stdio: "inherit", windowsHide: true },
  );

  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (serverProc.exitCode !== null) throw new Error(`next start exited early (${serverProc.exitCode})`);
    try {
      const r = await fetch("http://127.0.0.1:3119/onboarding");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {
      /* waiting */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!ready) throw new Error("G05 E2E Next.js server timed out.");

  const pwEnv = {
    ...cleanEnv,
    G05_E2E_STAGING_ORIGIN: staging.origin,
    G05_E2E_STAGING_IDENTITY: staging.serviceIdentity,
    G05_E2E_STAGING_CONTROL: staging.controlSecret,
    G05_E2E_STAGING_PASS_USER_A: staging.accounts.find((a) => a.role === "user_a")?.password ?? "",
    G05_E2E_STAGING_PASS_USER_B: staging.accounts.find((a) => a.role === "user_b")?.password ?? "",
    G05_E2E_STAGING_PASS_PRIVILEGED: staging.accounts.find((a) => a.role === "privileged")?.password ?? "",
  };

  pwExit = await runSyncChild(
    [
      join(root, "node_modules/@playwright/test/cli.js"),
      "test",
      "-c",
      join(root, "tests/guard/g05/browser/playwright.config.ts"),
    ],
    pwEnv,
  );
} finally {
  await fetch(`${staging.origin}/api/synthetic/reset`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wetscan-control-secret": staging.controlSecret,
    },
    body: "{}",
  }).catch(() => undefined);

  for (const proc of [serverProc, workerProc]) {
    if (proc && proc.exitCode === null) {
      proc.kill("SIGTERM");
    }
  }
  await new Promise((r) => setTimeout(r, 500));
  await rm(authDir, { recursive: true, force: true }).catch(() => undefined);
}

await mkdir(join(root, "test-results/guard-g05"), { recursive: true });
await writeFile(
  join(root, "test-results/guard-g05/browser.result.json"),
  JSON.stringify(
    {
      classification: "REAL_LOCAL_SYNTHETIC_VERIFIED",
      finishedAt: new Date().toISOString(),
      exitCode: pwExit,
      databasePort: pointer.port,
      stagingOrigin: staging.origin,
    },
    null,
    2,
  ) + "\n",
);
process.exitCode = pwExit;
