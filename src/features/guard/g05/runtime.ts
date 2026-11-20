import "server-only";
import { openG05, type G05Database } from "./db";
import {
  loadLocalSyntheticPinFromEnv,
  type LocalSyntheticTargetPin,
} from "./egress";
import { G05Service, G05ServiceError } from "./service";
import { G05PostgresStore } from "./store";
import { resolveVaultKey } from "./vault";

export class G05DisabledError extends Error {
  readonly code = "g05_disabled";
  readonly status = 503;
  constructor(message = "WetScan Guard G05 is disabled.") {
    super(message);
  }
}

interface CachedHost {
  envKey: string;
  db: G05Database;
}

let cached: CachedHost | null = null;

function hostKey(env: Readonly<Record<string, string | undefined>>): string {
  return JSON.stringify([
    env.GUARD_G05_ENABLED ?? "",
    env.GUARD_G05_DB_APP_APPROVAL_FILE ?? env.GUARD_DB_APP_APPROVAL_FILE ?? "",
    env.GUARD_G05_DB_APP_PASSWORD_FILE ?? env.GUARD_DB_APP_PASSWORD_FILE ?? "",
    env.GUARD_G05_DB_WORKER_APPROVAL_FILE ?? env.GUARD_DB_WORKER_APPROVAL_FILE ?? "",
    env.GUARD_G05_DB_WORKER_PASSWORD_FILE ?? env.GUARD_DB_WORKER_PASSWORD_FILE ?? "",
    env.GUARD_G05_SYNTHETIC_TARGET_FILE ?? "",
    env.GUARD_G05_LOCAL_SYNTHETIC_ORIGIN ?? "",
  ]);
}

export function isG05Enabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.GUARD_G05_ENABLED === "1";
}

export async function g05Host(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<{
  service: G05Service;
  store: G05PostgresStore;
  db: G05Database;
  vaultKey: Buffer | null;
  localPin: LocalSyntheticTargetPin | null;
}> {
  if (!isG05Enabled(env)) {
    throw new G05DisabledError();
  }
  const key = hostKey(env);
  if (!cached || cached.envKey !== key) {
    if (cached) await cached.db.close().catch(() => undefined);
    const db = await openG05(env);
    cached = { envKey: key, db };
  }

  let vaultKey: Buffer | null = null;
  try {
    vaultKey = resolveVaultKey(env);
  } catch {
    vaultKey = null;
  }

  let localPin: LocalSyntheticTargetPin | null = null;
  try {
    localPin = loadLocalSyntheticPinFromEnv(env);
  } catch (error) {
    throw new G05ServiceError(
      "local_synthetic_not_authorized",
      500,
      error instanceof Error ? error.message : "Invalid synthetic target pin configuration.",
    );
  }

  const store = new G05PostgresStore(cached.db.app);
  const service = new G05Service(store, { vaultKey, localPin });
  return {
    service,
    store,
    db: cached.db,
    vaultKey,
    localPin,
  };
}

export async function closeG05HostForTests() {
  if (!cached) return;
  const c = cached;
  cached = null;
  await c.db.close();
}
