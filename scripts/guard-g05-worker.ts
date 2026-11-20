/**
 * Standalone isolated worker runner for WetScan Guard G05 (DAST + Integrity).
 * Usage:
 *   node --import tsx scripts/guard-g05-worker.ts --once
 *   node --import tsx scripts/guard-g05-worker.ts --loop
 */
import { hostname } from "node:os";
import { openG05 } from "../src/features/guard/g05/db";
import { loadLocalSyntheticPinFromEnv } from "../src/features/guard/g05/egress";
import { G05PostgresStore } from "../src/features/guard/g05/store";
import { resolveVaultKey } from "../src/features/guard/g05/vault";
import { runG05WorkerLoop, runG05WorkerOnce } from "../src/features/guard/g05/worker";

async function main() {
  const mode = process.argv.includes("--loop") ? "loop" : "once";
  const workerId = `g05-worker-${hostname().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "local"}-${process.pid}`;
  const db = await openG05(process.env);
  let vaultKey: Buffer | null = null;
  try {
    vaultKey = resolveVaultKey(process.env);
  } catch {
    vaultKey = null;
  }
  const localPin = loadLocalSyntheticPinFromEnv(process.env);
  const store = new G05PostgresStore(db.worker);

  const ac = new AbortController();
  const stop = () => ac.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    if (mode === "loop") {
      console.log(JSON.stringify({ workerId, mode: "loop", ready: true, localPin: localPin?.allowedOrigin ?? null }));
      await runG05WorkerLoop({
        store,
        workerId,
        vaultKey,
        localPin,
        signal: ac.signal,
        onProcessed: (res) => {
          console.log(JSON.stringify({ processed: res }));
        },
      });
    } else {
      const batch = await runG05WorkerOnce({
        store,
        workerId,
        vaultKey,
        localPin,
      });
      console.log(JSON.stringify({ workerId, mode: "once", ...batch }));
    }
  } finally {
    await db.close();
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/guard-g05-worker.ts")) {
  main().catch((err) => {
    console.error(JSON.stringify({ error: err instanceof Error ? err.message : "WORKER_FAILED" }));
    process.exitCode = 1;
  });
}
