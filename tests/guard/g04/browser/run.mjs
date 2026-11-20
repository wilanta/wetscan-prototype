// G04 browser runner: production build + isolated server (fixture GitHub provider, REAL G04 PostgreSQL environment) + Playwright.
import { spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "wetscan-auth-browser-"));
const preload = join(root, "tests/auth/skip-dotenv.cjs").replaceAll("\\", "/");
const env = { ...process.env, NODE_OPTIONS: `--require "${preload}"`, NEXT_TELEMETRY_DISABLED: "1" };
for (const key of Object.keys(env)) if (/^(GITHUB_|AUTH_|GUARD_|SENTINEL_|APP_URL$|WETSCAN_GITHUB|WETSCAN_GUARD)/.test(key)) delete env[key];
Object.assign(env, { APP_URL: "http://127.0.0.1:3109", AUTH_DATA_DIR: directory, AUTH_SECRET: randomBytes(32).toString("hex") });
const pointer = process.env.G04_ENV_POINTER ?? join(process.env.LOCALAPPDATA ?? ".", "WetScanGuardG04", "current.json"),
  proot = JSON.parse(readFileSync(pointer, "utf8")).root,
  f = (n) => resolve(proot, n).replaceAll("\\", "/");
const g04 = { GUARD_G04_ENABLED: "1", WETSCAN_GUARD_G04_E2E: "1", GITHUB_APP_WEBHOOK_SECRET: randomBytes(32).toString("hex"), GUARD_DB_APP_APPROVAL_FILE: f("app.database.json"), GUARD_DB_APP_PASSWORD_FILE: f("app.password"), GUARD_DB_WORKER_APPROVAL_FILE: f("worker.database.json"), GUARD_DB_WORKER_PASSWORD_FILE: f("worker.password") };
const next = join(root, "node_modules/next/dist/bin/next");
const run = (args, environment) => new Promise((ok, no) => { const c = spawn(process.execPath, args, { cwd: root, env: environment, stdio: "inherit", windowsHide: true }); c.once("error", no); c.once("exit", (code) => (code === 0 ? ok() : no(new Error("command failed: " + code)))); });
let server;
const cleanup = () => run([join(root, "tests/guard/g04/browser/cleanup.mjs")], process.env);
try {
  await cleanup();
  await new Promise((ok, no) => { const p = createServer(); p.once("error", () => no(new Error("Port 3109 must be unused"))); p.listen(3109, "127.0.0.1", () => p.close(ok)); });
  const buildEnv = { ...env, GITHUB_APP_ID: "123", GITHUB_APP_SLUG: "wetscan-test-app", GITHUB_APP_CLIENT_ID: "fixture-client", GITHUB_APP_CLIENT_SECRET: "fixture-only", GITHUB_APP_PRIVATE_KEY: generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
  if (!process.env.G04_SKIP_BUILD) await run([next, "build", "--webpack"], buildEnv);
  const serverEnv = { ...env, ...g04, WETSCAN_GITHUB_EXISTING_E2E: "1", WETSCAN_GUARD_REVISION_E2E: "1", NODE_OPTIONS: env.NODE_OPTIONS + ` --import "${pathToFileURL(join(root, "tests/guard/g04/browser/fixture.mjs")).href}"` };
  server = spawn(process.execPath, [next, "start", "--hostname", "127.0.0.1", "--port", "3109"], { cwd: root, env: serverEnv, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  server.stderr.on("data", () => {});
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) {
    if (server.exitCode !== null) throw new Error("G04 fixture server exited");
    try { ready = (await fetch(env.APP_URL + "/api/onboarding")).ok; } catch { /* startup */ }
    if (!ready) await new Promise((r) => setTimeout(r, 300));
  }
  if (!ready) throw new Error("G04 fixture server not ready");
  await run([join(root, "node_modules/@playwright/test/cli.js"), "test", "--config", "tests/guard/g04/browser/playwright.config.ts"], { ...env, ...g04 });
} finally {
  await cleanup().catch(() => {});
  if (server && server.exitCode === null) await new Promise((r) => { server.once("exit", r); server.kill(); });
}
