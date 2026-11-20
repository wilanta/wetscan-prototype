import { pathToFileURL } from "node:url";
import { openG06 } from "../src/features/guard/g06/db";
import { openSentinelConsumerFromEnv } from "../src/features/guard/g06/intelligence-bridge";
import { sentinelConsumerFromEnv } from "../src/features/guard/g06/sentinel-bridge";
import { G06PostgresStore } from "../src/features/guard/g06/store";
import { G06OutboxWorker } from "../src/features/guard/g06/worker";

export async function runG06WorkerOnce(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const db = await openG06(env);
  const intel = await openSentinelConsumerFromEnv(env);
  const sentinel = sentinelConsumerFromEnv(env);
  try {
    const store = new G06PostgresStore(db.app, db.worker);
    const worker = new G06OutboxWorker(store, {
      intelligenceConsumer: intel.consumer,
      sentinelConsumer: sentinel.consumer,
    });
    return await worker.runOnce(25);
  } finally {
    await Promise.allSettled([intel.close(), db.close()]);
  }
}

async function main() {
  const once = process.argv.includes("--once");
  if (once) {
    const summary = await runG06WorkerOnce();
    console.log(JSON.stringify(summary));
    return;
  }

  let running = true;
  const stop = () => {
    running = false;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const db = await openG06(process.env);
  const intel = await openSentinelConsumerFromEnv(process.env);
  const sentinel = sentinelConsumerFromEnv(process.env);
  try {
    const store = new G06PostgresStore(db.app, db.worker);
    const worker = new G06OutboxWorker(store, {
      intelligenceConsumer: intel.consumer,
      sentinelConsumer: sentinel.consumer,
    });
    const pollMs = Math.max(
      1000,
      Number(process.env.GUARD_G06_WORKER_POLL_MS ?? 5000),
    );
    while (running) {
      await worker.runOnce(25);
      if (!running) break;
      await new Promise((r) => setTimeout(r, pollMs));
    }
  } finally {
    await Promise.allSettled([intel.close(), db.close()]);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
