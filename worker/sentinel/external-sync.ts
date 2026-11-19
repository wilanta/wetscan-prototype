import { setTimeout as delay } from "node:timers/promises";
import { PlatformError, type workerConfig } from "../../src/platform/config";
import type { PlatformDatabase } from "../../src/platform/database";
import { PostgresQueue } from "../../src/platform/queue";
import type { ExternalActivation } from "../../src/features/sentinel/external/activation";
import { CatalogStore } from "../../src/features/sentinel/external/catalog-store";
import {
  FeedClient,
  type FeedClientOptions,
} from "../../src/features/sentinel/external/feeds";
import type { Provider } from "../../src/features/sentinel/external/model";
import { advisorySyncKind } from "../../src/features/sentinel/external/service";
import {
  syncProvider,
  type SyncResult,
} from "../../src/features/sentinel/external/sync";
import { executeLease } from "./executor";

export interface ExternalLoopInput {
  db: PlatformDatabase;
  activation: ExternalActivation;
  workerId: string;
  options: ReturnType<typeof workerConfig>;
  signal: AbortSignal;
  once?: boolean;
  /** Test seam only; production always uses the platform `fetch`. */
  feed?: Pick<FeedClientOptions, "fetchImpl" | "sleep">;
  report?: (result: SyncResult) => void;
}
/**
 * The ONLY place outbound advisory traffic originates. Runs beside (not inside) the telemetry/detection loop so a
 * slow provider can never delay incident processing. Manual requests arrive as durable jobs; scheduled syncs are
 * guarded by the same per-provider database lease, so duplicate jobs, ticks or workers cannot double-fetch.
 */
export async function externalLoop(i: ExternalLoopInput) {
  const catalog = new CatalogStore(i.db);
  const a = i.activation;
  const queue = new PostgresQueue(
    i.db,
    a.scope,
    [advisorySyncKind],
    a.notBefore,
  );
  const sync = async (
    provider: Provider,
    trigger: "manual" | "scheduled",
    budgetMs: number,
    signal: AbortSignal,
  ) => {
    const composite = AbortSignal.any([
      signal,
      i.signal,
      AbortSignal.timeout(budgetMs),
    ]);
    const result = await syncProvider(provider, {
      catalog,
      client: new FeedClient({
        signal: composite,
        ghsaToken: provider === "ghsa" ? a.ghsaToken : undefined,
        ...i.feed,
      }),
      workerId: i.workerId,
      trigger,
      deadlineAt: Date.now() + budgetMs,
      signal: composite,
    });
    i.report?.(result);
    return result;
  };
  let lastRetain = 0;
  while (!i.signal.aborted) {
    try {
      const leases = await queue.claim({
        module: "sentinel",
        workerId: i.workerId,
        limit: 1,
        leaseMs: i.options.leaseMs,
      });
      for (const lease of leases)
        await executeLease(
          queue,
          lease,
          async (job, signal) => {
            const provider = job.subjectRef as Provider;
            if (!a.providers.includes(provider))
              throw new PlatformError("scope_denied");
            await sync(
              provider,
              "manual",
              Math.min(a.budgetMs, i.options.timeoutMs - 3000),
              signal,
            );
          },
          {
            heartbeatMs: i.options.heartbeatMs,
            timeoutMs: i.options.timeoutMs,
            signal: i.signal,
          },
        );
      for (const provider of await catalog.due(a.intervalMs)) {
        if (i.signal.aborted) break;
        if (a.providers.includes(provider))
          await sync(provider, "scheduled", a.budgetMs, i.signal);
      }
      if (Date.now() - lastRetain > 3_600_000) {
        await catalog.retain();
        lastRetain = Date.now();
      }
    } catch {
      if (i.once) throw new PlatformError("database_unavailable");
      console.warn(
        JSON.stringify({
          status: "degraded",
          reason: "external_intelligence_cycle_failed",
        }),
      );
    }
    if (i.once) break;
    try {
      await delay(Math.max(i.options.pollMs, 2000), undefined, {
        signal: i.signal,
      });
    } catch {
      break;
    }
  }
}
