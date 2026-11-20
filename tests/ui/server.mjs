// Starts an isolated, credential-free dev server (stubbed GitHub, temp AUTH_DATA_DIR) on port 3109.
// Used by tests/ui/playwright.config.ts (webServer) and manually: `node tests/ui/server.mjs`.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const port = process.env.UI_TEST_PORT ?? "3109";
const dir = mkdtempSync(join(tmpdir(), "wetscan-auth-browser-"));
const env = { ...process.env };
for (const key of Object.keys(env))
  if (/^(?:SENTINEL_|GUARD_|GITHUB_|GITLAB_|AUTH_|WETSCAN_|PG|DATABASE_URL$|APP_URL$|NODE_OPTIONS$)/.test(key))
    delete env[key];
const skip = join(root, "tests/auth/skip-dotenv.cjs").replaceAll("\\", "/");
Object.assign(env, {
  NODE_ENV: "development",
  NEXT_TELEMETRY_DISABLED: "1",
  APP_URL: `http://127.0.0.1:${port}`,
  AUTH_DATA_DIR: dir,
  AUTH_SECRET: randomBytes(32).toString("hex"),
  UI_TEST_DIST_DIR: ".next-ui",
  WETSCAN_GITHUB_EXISTING_E2E: "1",
  NODE_OPTIONS: `--require "${skip}" --import "${pathToFileURL(join(root, "tests/auth/github-existing-fixture.mjs")).href}"`,
});
const server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", port], { cwd: root, env, stdio: "inherit", windowsHide: true });
const stop = () => { server.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch {} };
server.on("exit", (c) => { try { rmSync(dir, { recursive: true, force: true }); } catch {} process.exit(c ?? 0); });
process.on("SIGINT", stop); process.on("SIGTERM", stop);
