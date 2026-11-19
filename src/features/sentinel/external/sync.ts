import {
  CatalogStore,
  type RunCounters,
  type RunStatus,
} from "./catalog-store";
import { FeedClient, FeedError, feedUrls } from "./feeds";
import { catalogLimits, type NormalizedAdvisory, type Provider } from "./model";
import { normalizeGhsa, normalizeKev, normalizeOsv } from "./normalize";

export interface SyncDeps {
  catalog: CatalogStore;
  client: FeedClient;
  workerId: string;
  trigger: "manual" | "scheduled";
  /** Wall-clock budget (epoch ms) for this run; exceeding it ends the run as `partial`, never as success. */
  deadlineAt: number;
  signal: AbortSignal;
  ghsaBackfillDays?: number;
  ghsaMaxPages?: number;
  osvBatch?: number;
}
export interface SyncResult {
  provider: Provider;
  status: RunStatus | "skipped_locked" | "skipped_backoff";
  errorCode: string | null;
  changed: number;
}
class SyncFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
const MB = 1024 * 1024;
const DEFAULT_BACKOFF_MS = 15 * 60_000;

/**
 * One provider, one bounded pass. Only global ext_* tables are written: advisory data can never create
 * telemetry, alerts, incidents or responses. A failed/partial run leaves last-known-good rows untouched.
 */
export async function syncProvider(
  provider: Provider,
  deps: SyncDeps,
): Promise<SyncResult> {
  const { catalog } = deps;
  const budget = Math.max(5000, deps.deadlineAt - Date.now());
  const state = await catalog.claim(provider, deps.workerId, budget + 30_000);
  if (!state)
    return { provider, status: "skipped_locked", errorCode: null, changed: 0 };
  if (state.blockedUntil && Date.parse(state.blockedUntil) > Date.now()) {
    await catalog.release(provider);
    return {
      provider,
      status: "skipped_backoff",
      errorCode: "rate_limited",
      changed: 0,
    };
  }
  const runId = await catalog.startRun(provider, deps.trigger, deps.workerId);
  const counters: RunCounters = {
    requests: 0,
    bytes: 0,
    recordsSeen: 0,
    recordsChanged: 0,
    recordsRejected: 0,
    httpStatus: null,
  };
  const timeLeft = () => deps.deadlineAt - Date.now();
  const store = async (records: NormalizedAdvisory[]) => {
    counters.recordsSeen += records.length;
    const retrievedAt = new Date().toISOString();
    for (let i = 0; i < records.length; i += catalogLimits.chunk) {
      if (deps.signal.aborted) throw new FeedError("aborted");
      counters.recordsChanged += await catalog.upsertChunk(
        records.slice(i, i + catalogLimits.chunk),
        retrievedAt,
      );
    }
  };
  let outcome: Parameters<CatalogStore["finish"]>[2];
  try {
    if ((await catalog.totalAdvisories()) >= catalogLimits.maxAdvisories)
      throw new SyncFailure("storage_limit");
    const done = await run(provider, deps, state, counters, store, timeLeft);
    outcome = { ...done, counters };
  } catch (e) {
    const rate = e instanceof FeedError && e.code === "rate_limited";
    outcome = {
      status: rate ? "rate_limited" : "failed",
      errorCode:
        e instanceof FeedError || e instanceof SyncFailure
          ? e.code
          : "internal_error",
      success: false,
      counters,
      blockedUntil: rate
        ? new Date(
            Date.now() + ((e as FeedError).retryAfterMs ?? DEFAULT_BACKOFF_MS),
          ).toISOString()
        : null,
    };
    if (e instanceof FeedError) counters.httpStatus = e.httpStatus;
  }
  counters.requests = deps.client.requests;
  counters.bytes = deps.client.bytes;
  await catalog.finish(provider, runId, outcome);
  return {
    provider,
    status: outcome.status,
    errorCode: outcome.errorCode,
    changed: counters.recordsChanged,
  };
}

type Done = Omit<Parameters<CatalogStore["finish"]>[2], "counters">;
async function run(
  provider: Provider,
  deps: SyncDeps,
  state: NonNullable<Awaited<ReturnType<CatalogStore["claim"]>>>,
  counters: RunCounters,
  store: (r: NormalizedAdvisory[]) => Promise<void>,
  timeLeft: () => number,
): Promise<Done> {
  const { client, catalog } = deps;
  if (provider === "cisa_kev") {
    const res = await client.getJson(feedUrls.cisa_kev, {
      maxBytes: 8 * MB,
      etag: state.etag,
    });
    counters.httpStatus = res.status;
    if (res.notModified)
      return { status: "not_modified", errorCode: null, success: true };
    const n = normalizeKev(res.json);
    counters.recordsRejected = n.rejected;
    // A snapshot that shrank by half is a bad payload, not 700 retractions: refuse before marking anything removed.
    if (state.recordCount > 0 && n.records.length < state.recordCount * 0.5)
      throw new SyncFailure("implausible_snapshot");
    await store(n.records);
    if (timeLeft() <= 0)
      return {
        status: "partial",
        errorCode: "time_budget",
        success: false,
        feedVersion: n.feedVersion,
      };
    await catalog.markRemoved(
      "cisa_kev",
      n.records.map((r) => r.sourceId),
    );
    return {
      status: "succeeded",
      errorCode: null,
      success: true,
      etag: res.etag,
      feedVersion: n.feedVersion,
    };
  }
  if (provider === "ghsa") {
    // GitHub only accepts date granularity for `updated` (a full timestamp is a 422). Re-reading the watermark day is
    // harmless (unchanged records are skipped by content hash); a persisted page cursor keeps a busy day from stalling.
    const sinceDay = (
      state.watermark ??
      new Date(
        Date.now() - (deps.ghsaBackfillDays ?? 30) * 86_400_000,
      ).toISOString()
    ).slice(0, 10);
    const saved = /^ghsa:(d{4}-dd-dd):([A-Za-z0-9_=-]{1,200})$/.exec(
      state.etag ?? "",
    );
    const base = `${feedUrls.ghsa}?type=reviewed&per_page=100&sort=updated&direction=asc&updated=${encodeURIComponent(`>=${sinceDay}`)}`;
    let url: string | null =
      saved?.[1] === sinceDay ? `${base}&after=${saved[2]}` : base;
    let watermark = state.watermark;
    const maxPages = deps.ghsaMaxPages ?? 3;
    for (let page = 0; url; page++) {
      if (page >= maxPages || timeLeft() <= 0) {
        const after = new URL(url).searchParams.get("after");
        return {
          status: "partial",
          errorCode: page >= maxPages ? "page_budget" : "time_budget",
          success: false,
          watermark,
          etag:
            after && /^[A-Za-z0-9_=-]{1,200}$/.test(after)
              ? `ghsa:${sinceDay}:${after}`
              : null,
        };
      }
      const res = await client.getJson(url, { maxBytes: 6 * MB });
      counters.httpStatus = res.status;
      if (!Array.isArray(res.json) || res.json.length > 100)
        throw new FeedError("malformed_payload");
      const records: NormalizedAdvisory[] = [];
      for (const item of res.json) {
        const r = normalizeGhsa(item);
        if (r) records.push(r);
        else counters.recordsRejected++;
      }
      await store(records);
      for (const r of records)
        if (r.modifiedAt && (!watermark || r.modifiedAt > watermark))
          watermark = r.modifiedAt;
      url = res.nextUrl;
    }
    return {
      status: "succeeded",
      errorCode: null,
      success: true,
      watermark,
      etag: null,
    };
  }
  // OSV: enrich known GHSA advisories by id (no project data ever leaves), then refresh the oldest OSV rows.
  const batch = deps.osvBatch ?? 25;
  const fresh = await catalog.osvCandidates(batch);
  const stale = await catalog.osvStale(Math.max(0, batch - fresh.length));
  const checked: string[] = [];
  try {
    for (const id of [...fresh, ...stale]) {
      if (timeLeft() <= 0 || deps.signal.aborted)
        return { status: "partial", errorCode: "time_budget", success: false };
      try {
        const res = await client.getJson(feedUrls.osv + id, {
          maxBytes: 1 * MB,
        });
        counters.httpStatus = res.status;
        const rec = normalizeOsv(res.json);
        if (rec) await store([rec]);
        else counters.recordsRejected++;
      } catch (e) {
        if (
          !(e instanceof FeedError) ||
          !["not_found", "malformed_payload"].includes(e.code)
        )
          throw e;
        if (e.code === "malformed_payload") counters.recordsRejected++;
      }
      checked.push(id);
    }
  } finally {
    await catalog.markOsvChecked(checked.filter((id) => fresh.includes(id)));
  }
  return { status: "succeeded", errorCode: null, success: true };
}
