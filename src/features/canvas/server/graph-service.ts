import "server-only";
import type {
  CanvasCacheIdentity,
  CanvasGraphStore,
  CanvasLoadResult,
} from "../cache-contracts";
import type { ArchitectureGraph } from "../types";
import { analyzerVersion } from "../discovery/analyzer";
import { projectCacheScope } from "./graph-cache";

export interface CanvasRepositoryProvider {
  authorize(): Promise<CanvasCacheIdentity>;
  head(identity: CanvasCacheIdentity): Promise<string>;
  analyze(
    identity: CanvasCacheIdentity,
    revision: string,
  ): Promise<ArchitectureGraph>;
  validateSession(): Promise<void>;
}
// Per process, versioned revision keys; all waiters authorize independently first.
const jobs = new Map<
  string,
  Promise<Awaited<ReturnType<CanvasGraphStore["put"]>>>
>();
export class CanvasGraphService {
  readonly metrics = {
    authorizationMs: 0,
    cacheMs: 0,
    headMs: 0,
    analysisMs: 0,
    analysisRuns: 0,
  };
  constructor(
    private store: CanvasGraphStore,
    private provider: CanvasRepositoryProvider,
  ) {}
  private async authorize() {
    const start = performance.now();
    try {
      return await this.provider.authorize();
    } finally {
      this.metrics.authorizationMs += performance.now() - start;
    }
  }
  private async latest(identity: CanvasCacheIdentity, revision?: string) {
    const start = performance.now();
    try {
      return await this.store.latest(identity, revision);
    } finally {
      this.metrics.cacheMs += performance.now() - start;
    }
  }
  async cached(revision?: string) {
    const identity = await this.authorize();
    const entry = await this.latest(identity, revision);
    await this.provider.validateSession();
    return entry;
  }
  async load(
    action: "load" | "check" | "refresh" | "reanalyze",
    requestedRevision?: string,
  ): Promise<CanvasLoadResult> {
    const identity = await this.authorize();
    const entry = await this.latest(identity, requestedRevision);
    if (action === "load" && entry) {
      await this.provider.validateSession();
      return { state: "ready", entry, cached: true };
    }
    let revision: string;
    try {
      const start = performance.now();
      try {
        revision = await this.provider.head(identity);
      } finally {
        this.metrics.headMs += performance.now() - start;
      }
    } catch (error) {
      if (!entry) throw error;
      // Reconfirm authorization before retaining a graph after a provider failure.
      await this.authorize();
      return {
        state: "refresh_failed",
        message:
          "Revision check failed. Showing the previously analyzed revision; retry the check.",
      };
    }
    if (requestedRevision && revision !== requestedRevision) {
      const { AuthError } = await import("@/lib/auth/config");
      throw new AuthError("stale_revision", 409);
    }
    await this.provider.validateSession();
    if (action === "check" && entry)
      return revision === entry.graph.revision
        ? { state: "up_to_date", revision }
        : { state: "new_revision", revision };
    if (action !== "reanalyze") {
      const exact = await this.latest(identity, revision);
      if (exact) return { state: "ready", entry: exact, cached: true };
    }
    const key = JSON.stringify([
      projectCacheScope(identity),
      identity.installationId,
      identity.repositoryName,
      revision,
      analyzerVersion,
      1,
    ]);
    let job = jobs.get(key);
    if (!job) {
      if (jobs.size >= 4) {
        const { AuthError } = await import("@/lib/auth/config");
        throw new AuthError("source_busy", 429);
      }
      job = (async () => {
        const start = performance.now();
        this.metrics.analysisRuns++;
        const graph = await this.provider.analyze(identity, revision);
        this.metrics.analysisMs += performance.now() - start;
        if (entry && entry.graph.revision !== revision) {
          const ids = new Set(graph.nodes.map((n) => n.id));
          const removed = entry.graph.nodes.filter(
            (n) => !ids.has(n.id),
          ).length;
          if (removed)
            graph.diagnostics.push({
              code: "revision_components_changed",
              severity: "warning",
              message: `${removed} components from the previous map no longer appear in this revision. Unmatched manual annotations remain available in the export.`,
            });
        }
        if (
          !graph.nodes.length ||
          graph.diagnostics.some((d) => d.severity === "error")
        )
          throw new Error("Analysis did not produce a usable graph");
        return this.store.put(identity, graph);
      })();
      jobs.set(key, job);
      void job.finally(() => jobs.delete(key)).catch(() => undefined);
    }
    try {
      const updated = await job;
      await this.authorize();
      return { state: "ready", entry: updated, cached: false };
    } catch (error) {
      if (!entry) throw error;
      await this.authorize();
      return {
        state: "refresh_failed",
        message:
          "Source refresh failed. Your previous graph and edits remain available; retry when ready.",
      };
    }
  }
}
