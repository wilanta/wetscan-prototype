import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { openG05 } from "../../../src/features/guard/g05/db";
import { loadLocalSyntheticPinFromEnv } from "../../../src/features/guard/g05/egress";
import { resolveVaultKey } from "../../../src/features/guard/g05/vault";

export function g05StateDir(): string {
  return join(
    process.env.LOCALAPPDATA ?? join(process.env.HOME ?? ".", ".local/share"),
    "WetScanGuardG05",
  );
}

export interface G05LocalRuntimePointer {
  root: string;
  port: number;
  target: { host: string; port: number; database: string; marker: string };
}

export async function loadG05LocalPointer(): Promise<G05LocalRuntimePointer> {
  const raw = await readFile(join(g05StateDir(), "current.json"), "utf8");
  return JSON.parse(raw) as G05LocalRuntimePointer;
}

export async function g05TestEnv(): Promise<Record<string, string>> {
  const p = await loadG05LocalPointer();
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter((kv): kv is [string, string] => typeof kv[1] === "string"),
    ),
    GUARD_G05_ENABLED: "1",
    GUARD_G05_DB_APP_APPROVAL_FILE: join(p.root, "app.database.json"),
    GUARD_G05_DB_APP_PASSWORD_FILE: join(p.root, "app.password"),
    GUARD_G05_DB_WORKER_APPROVAL_FILE: join(p.root, "worker.database.json"),
    GUARD_G05_DB_WORKER_PASSWORD_FILE: join(p.root, "worker.password"),
    GUARD_G05_DB_MIGRATION_APPROVAL_FILE: join(p.root, "migration.database.json"),
    GUARD_G05_DB_MIGRATION_PASSWORD_FILE: join(p.root, "migration.password"),
    GUARD_G05_VAULT_KEY_FILE: join(p.root, "vault.key"),
    GUARD_G05_SYNTHETIC_TARGET_FILE: join(g05StateDir(), "synthetic-target-pin.json"),
  };
}

export async function loadStagingRuntimeCredentials(): Promise<{
  origin: string;
  serviceIdentity: string;
  controlSecret: string;
  accounts: { role: string; username: string; password: string }[];
}> {
  const raw = await readFile(join(g05StateDir(), "staging-runtime.json"), "utf8");
  return JSON.parse(raw);
}

export async function openG05ForTests() {
  const env = await g05TestEnv();
  const db = await openG05(env);
  const vaultKey = resolveVaultKey(env);
  const localPin = loadLocalSyntheticPinFromEnv(env);
  return { env, db, vaultKey, localPin };
}

export async function openG05MigratorPool() {
  const p = await loadG05LocalPointer();
  const password = (await readFile(join(p.root, "migration.password"), "utf8")).trim();
  return new pg.Pool({
    host: p.target.host,
    port: p.target.port,
    database: p.target.database,
    user: "wetscan_guard_migrator",
    password,
    ssl: false,
    max: 4,
    allowExitOnIdle: true,
  });
}
