import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
const root = await mkdtemp(join(tmpdir(), "wetscan-g03-production-smoke-"));
const port = await new Promise((done, fail) => {
  const s = createServer();
  s.once("error", fail);
  s.listen(0, "127.0.0.1", () => {
    const p = s.address().port;
    s.close(() => done(p));
  });
});
const origin = `http://127.0.0.1:${port}`,
  env = {
    ...process.env,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    APP_URL: origin,
    AUTH_SECRET: randomBytes(32).toString("hex"),
    AUTH_DATA_DIR: root,
  };
const server = spawn(
  process.execPath,
  [
    resolve("node_modules/next/dist/bin/next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
server.stdout.resume();
server.stderr.resume();
const checks = [];
try {
  let ready = false;
  for (let n = 0; n < 120; n++) {
    if (server.exitCode !== null)
      throw Error("owned_production_server_stopped");
    try {
      const r = await fetch(origin + "/login", {
        signal: AbortSignal.timeout(1500),
      });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) throw Error("owned_production_server_not_ready");
  for (const path of ["/", "/login", "/onboarding"]) {
    const r = await fetch(origin + path, { redirect: "manual" });
    if (![200, 307].includes(r.status)) throw Error("public_route_failed");
    checks.push({ path, status: r.status });
  }
  const path =
    "/api/guard/projects/github-101/scans/" + "a".repeat(64) + "/g03/";
  const denied = await fetch(origin + path + "state");
  if (denied.status !== 401) throw Error("g03_anonymous_not_denied");
  checks.push({
    path: "g03/state anonymous",
    status: denied.status,
    noStore: denied.headers.get("cache-control").includes("no-store"),
  });
  const csrf = await fetch(origin + path + "generate", {
    method: "POST",
    headers: {
      origin: "https://attacker.invalid",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (csrf.status !== 403) throw Error("g03_origin_not_denied");
  checks.push({ path: "g03/generate cross-origin", status: csrf.status });
  await writeFile(
    "test-results/guard-g03/smoke-evidence.json",
    JSON.stringify(
      {
        classification: "LOCAL_PRODUCTION_BUILD_SMOKE_NO_OWNER_PROVIDER_DB",
        checks,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ productionSmoke: "PASS", checks }));
} finally {
  if (server.exitCode === null)
    await new Promise((done) => {
      server.once("exit", done);
      server.kill();
    });
  const actual = await realpath(root);
  if (
    dirname(actual).toLowerCase() !==
      (await realpath(tmpdir())).toLowerCase() ||
    !basename(actual).startsWith("wetscan-g03-production-smoke-")
  )
    throw Error("fixture_cleanup_boundary");
  await rm(actual, { recursive: true });
}
