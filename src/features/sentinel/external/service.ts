import { randomUUID } from "node:crypto";
import type { PlatformDatabase } from "../../../platform/database";
import { PostgresQueue } from "../../../platform/queue";
import type { SentinelProjectContext } from "../types";
import { CatalogStore, type ListInput } from "./catalog-store";
import { assessExposure } from "./exposure";
import { InventoryStore } from "./inventory-store";
import {
  ADVISORY_DISCLAIMER,
  type ExternalOverview,
  type Provider,
} from "./model";
import { runView, sourceView } from "./status";

export const advisorySyncKind = "sentinel.advisory.sync";
const BUCKET_MS = 5 * 60_000;

/** App-side API service. It reads the catalog and queues sync requests; it never performs outbound feed traffic. */
export class ExternalService {
  readonly catalog: CatalogStore;
  readonly inventory: InventoryStore;
  constructor(private readonly db: PlatformDatabase) {
    this.catalog = new CatalogStore(db);
    this.inventory = new InventoryStore(db);
  }
  async overview(ctx: SentinelProjectContext): Promise<ExternalOverview> {
    const now = new Date();
    const [sources, runs, totals, snapshot, pending] = await Promise.all([
      this.catalog.sources(),
      this.catalog.runs(),
      this.catalog.totals(),
      this.inventory.latest(ctx.scope),
      this.pending(ctx),
    ]);
    return {
      schemaVersion: 1,
      sources: sources.map((s) => sourceView(s, now)),
      runs: runs.map(runView),
      catalog: totals,
      pendingSyncRequests: pending,
      inventory: {
        configured: true,
        guardProducer: "not_integrated",
        snapshot,
        expired: snapshot
          ? Date.parse(snapshot.expiresAt) <= now.getTime()
          : false,
      },
      disclaimer: ADVISORY_DISCLAIMER,
    };
  }
  private pending(ctx: SentinelProjectContext) {
    return this.db.scoped(ctx.scope, async (tx) =>
      Number(
        (
          await this.db.query(
            tx,
            "SELECT count(*)::int AS n FROM platform.jobs WHERE module='sentinel' AND mode=$1 AND workspace_id=$2 AND project_id=$3 AND kind=$4 AND state IN ('queued','leased')",
            [
              ctx.scope.mode,
              ctx.scope.workspaceId,
              ctx.scope.projectId,
              advisorySyncKind,
            ],
          )
        ).rows[0].n,
      ),
    );
  }
  list(q: ListInput) {
    return this.catalog.list(q);
  }
  detail(id: string) {
    return this.catalog.detail(id);
  }
  exposures(ctx: SentinelProjectContext) {
    return assessExposure(this.db, ctx.scope);
  }
  /**
   * Manual sync = durable worker jobs only. Identical requests inside a 5-minute bucket collapse onto one job
   * (same idempotency key + fingerprint), so repeated clicks or retries cannot flood providers.
   */
  async requestSync(
    ctx: SentinelProjectContext,
    providers: Provider[],
    now = Date.now(),
  ) {
    const bucket = Math.floor(now / BUCKET_MS) * BUCKET_MS;
    const queue = new PostgresQueue(this.db);
    return this.db.scoped(ctx.scope, async (tx) => {
      const jobs: { provider: Provider; jobId: string; duplicate: boolean }[] =
        [];
      for (const provider of providers) {
        const r = await queue.enqueue(tx, {
          mode: ctx.scope.mode,
          workspaceId: ctx.scope.workspaceId,
          projectId: ctx.scope.projectId,
          schemaVersion: 1,
          module: "sentinel",
          jobId: randomUUID(),
          kind: advisorySyncKind,
          subjectRef: provider,
          idempotencyKey: `advisory-sync:${provider}:${bucket}`,
          revision: 1,
          attempts: 0,
          maxAttempts: 3,
          availableAt: new Date(bucket).toISOString(),
          cancelRequested: false,
        });
        jobs.push({ provider, ...r });
      }
      return {
        requested: jobs,
        note: "Queued for the Sentinel worker. Nothing is fetched by this request; it runs only when the worker has External Intelligence enabled.",
      };
    });
  }
}
