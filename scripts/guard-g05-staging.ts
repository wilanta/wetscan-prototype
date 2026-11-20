/**
 * Isolated Docker / local manager for the G05 synthetic staging application on 127.0.0.1:4115.
 * Never alters production routes or customer data.
 *
 *   node --import tsx scripts/guard-g05-staging.ts start|stop|status|pin-env
 */
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
export const STAGING_CONTAINER = "wetscan-g05-synthetic-staging";
export const STAGING_IMAGE = "wetscan-g05-staging:local";
export const STAGING_PORT = 4115;
export const STAGING_IDENTITY = "wetscan-g05-synthetic-staging-v1";

const rootDir = () =>
  join(
    process.env.LOCALAPPDATA ?? join(process.env.HOME ?? ".", ".local/share"),
    "WetScanGuardG05",
  );
const stagingFile = () => join(rootDir(), "staging-runtime.json");
const pinFile = () => join(rootDir(), "synthetic-target-pin.json");

async function docker(args: string[]) {
  return (
    await run("docker", args, {
      windowsHide: true,
      maxBuffer: 1 << 24,
      timeout: 300000,
    })
  ).stdout.trim();
}

async function dockerOrNull(args: string[]) {
  try {
    return await docker(args);
  } catch {
    return null;
  }
}

async function freePort(port: number) {
  await new Promise<void>((ok, no) => {
    const s = createServer();
    s.once("error", no);
    s.listen(port, "127.0.0.1", () => s.close(() => ok()));
  });
}

async function ensureCredentials() {
  await mkdir(rootDir(), { recursive: true });
  try {
    return JSON.parse(await readFile(stagingFile(), "utf8")) as {
      origin: string;
      serviceIdentity: string;
      controlSecret: string;
      accounts: { role: string; username: string; password: string }[];
    };
  } catch {
    const gen = () => "syn_" + randomBytes(12).toString("hex");
    const doc = {
      origin: `http://127.0.0.1:${STAGING_PORT}`,
      serviceIdentity: STAGING_IDENTITY,
      controlSecret: randomBytes(24).toString("hex"),
      accounts: [
        { role: "user_a", username: "syn-user-a@synthetic.wetscan.invalid", password: gen() },
        { role: "user_b", username: "syn-user-b@synthetic.wetscan.invalid", password: gen() },
        { role: "privileged", username: "syn-admin@synthetic.wetscan.invalid", password: gen() },
      ],
    };
    await writeFile(stagingFile(), JSON.stringify(doc, null, 2) + "\n", { mode: 0o600 });
    await writeFile(
      pinFile(),
      JSON.stringify(
        {
          allowedOrigin: doc.origin,
          serviceIdentity: doc.serviceIdentity,
          healthPath: "/healthz",
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
    return doc;
  }
}

async function startStaging() {
  const existing = await dockerOrNull(["inspect", "--format", "{{.State.Running}}", STAGING_CONTAINER]);
  const creds = await ensureCredentials();
  if (existing === "true") {
    return { status: "already_running", origin: creds.origin, serviceIdentity: creds.serviceIdentity, pinFile: pinFile() };
  }
  if (existing === "false") {
    await docker(["rm", "-f", STAGING_CONTAINER]);
  }
  await freePort(STAGING_PORT);
  await docker([
    "build",
    "-t",
    STAGING_IMAGE,
    "-f",
    "worker/guard/g05-staging/Dockerfile",
    ".",
  ]);
  await docker([
    "create",
    "--name",
    STAGING_CONTAINER,
    "--label",
    "wetscan.env=g05-staging",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--cpus",
    "0.5",
    "--memory",
    "256m",
    "--pids-limit",
    "64",
    "--publish",
    `127.0.0.1:${STAGING_PORT}:${STAGING_PORT}`,
    "--env",
    `G05_STAGING_PORT=${STAGING_PORT}`,
    "--env",
    `G05_STAGING_IDENTITY=${creds.serviceIdentity}`,
    "--env",
    `G05_STAGING_CONTROL_SECRET=${creds.controlSecret}`,
    "--env",
    `G05_STAGING_USER_A_PASS=${creds.accounts[0].password}`,
    "--env",
    `G05_STAGING_USER_B_PASS=${creds.accounts[1].password}`,
    "--env",
    `G05_STAGING_ADMIN_PASS=${creds.accounts[2].password}`,
    STAGING_IMAGE,
  ]);
  await docker(["start", STAGING_CONTAINER]);
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${creds.origin}/healthz`, { signal: AbortSignal.timeout(1500) });
      if (r.ok && r.headers.get("x-wetscan-synthetic-target") === creds.serviceIdentity) {
        return {
          status: "started",
          container: STAGING_CONTAINER,
          origin: creds.origin,
          serviceIdentity: creds.serviceIdentity,
          pinFile: resolve(pinFile()),
        };
      }
    } catch {
      /* waiting for startup */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("STAGING_HEALTH_TIMEOUT");
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "start") {
    console.log(JSON.stringify(await startStaging()));
  } else if (cmd === "stop") {
    await dockerOrNull(["rm", "-f", STAGING_CONTAINER]);
    console.log(JSON.stringify({ container: STAGING_CONTAINER, stopped: true }));
  } else if (cmd === "status") {
    const info = await dockerOrNull(["inspect", "--format", "{{json .State}}", STAGING_CONTAINER]);
    console.log(info ?? JSON.stringify({ running: false }));
  } else if (cmd === "pin-env") {
    await ensureCredentials();
    console.log(`export GUARD_G05_SYNTHETIC_TARGET_FILE='${resolve(pinFile()).replaceAll("\\", "/")}'`);
  } else {
    throw new Error("USAGE: start|stop|status|pin-env");
  }
}

if (
  process.argv[1]
    ?.replaceAll("\\", "/")
    .endsWith("/guard-g05-staging.ts")
) {
  main().catch((err) => {
    console.error(JSON.stringify({ error: err instanceof Error ? err.message : "FAILED" }));
    process.exitCode = 1;
  });
}
