import "server-only";
import { openG06, type G06Database } from "./db";
import { openSentinelConsumerFromEnv } from "./intelligence-bridge";
import { sentinelConsumerFromEnv } from "./sentinel-bridge";
import { G06Service } from "./service";
import { G06PostgresStore } from "./store";
import { G06OutboxWorker } from "./worker";

export class G06DisabledError extends Error {
  readonly code = "g06_disabled" as const;
  readonly status = 503 as const;

  constructor(
    message = "Guard G06 integrations are disabled (GUARD_G06_ENABLED !== '1').",
  ) {
    super(message);
    this.name = "G06DisabledError";
  }
}

export interface G06RuntimeHost {
  db: G06Database;
  store: G06PostgresStore;
  worker: G06OutboxWorker;
  service: G06Service;
  sentinelConsumerConfigured: boolean;
  intelligenceConsumerConfigured: boolean;
  close(): Promise<void>;
}

let cachedHost: Promise<G06RuntimeHost> | null = null;

export function isG06Enabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return env.GUARD_G06_ENABLED === "1";
}

export async function g06Host(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<G06RuntimeHost> {
  if (!isG06Enabled(env)) {
    throw new G06DisabledError();
  }
  if (!cachedHost) {
    cachedHost = (async () => {
      const db = await openG06(env);
      const intel = await openSentinelConsumerFromEnv(env);
      const sentinel = sentinelConsumerFromEnv(env);
      const store = new G06PostgresStore(db.app, db.worker);
      const worker = new G06OutboxWorker(store, {
        intelligenceConsumer: intel.consumer,
        sentinelConsumer: sentinel.consumer,
      });
      const service = new G06Service(store, {
        intelligenceConsumer: intel.consumer,
        sentinelConsumer: sentinel.consumer,
        sentinelConsumerConfigured: sentinel.configured,
        worker,
      });
      return {
        db,
        store,
        worker,
        service,
        sentinelConsumerConfigured: sentinel.configured,
        intelligenceConsumerConfigured: intel.configured,
        close: async () => {
          await Promise.allSettled([intel.close(), db.close()]);
        },
      };
    })().catch((err) => {
      cachedHost = null;
      throw err;
    });
  }
  return cachedHost;
}

export async function closeG06HostForTests() {
  const current = cachedHost;
  cachedHost = null;
  if (current) {
    const resolved = await current.catch(() => null);
    await resolved?.close();
  }
}
