import { describe, expect, it } from "vitest";
import type { CatalogStore } from "../../src/features/sentinel/external/catalog-store";
import {
  FeedClient,
  feedUrls,
} from "../../src/features/sentinel/external/feeds";
import type { NormalizedAdvisory } from "../../src/features/sentinel/external/model";
import { syncProvider } from "../../src/features/sentinel/external/sync";
import {
  GHSA_LODASH,
  ghsaLodash,
  ghsaRange,
  kevSnapshot,
  osvLodash,
} from "./external-fixtures";

type Finish = Parameters<CatalogStore["finish"]>[2];
/** In-memory stand-in for the catalog: models last-known-good rows, the lease and the ledger. */
class FakeCatalog {
  rows = new Map<string, NormalizedAdvisory>();
  finished: Finish[] = [];
  leased = false;
  state = {
    etag: null as string | null,
    watermark: null as string | null,
    feedVersion: null as string | null,
    blockedUntil: null as string | null,
    lastSuccessAt: null as string | null,
    recordCount: 0,
    consecutiveFailures: 0,
  };
  removedCalls: string[][] = [];
  checked: string[] = [];
  osvIds: string[] = [];
  async claim(provider: string) {
    if (this.leased) return null;
    this.leased = true;
    return { provider, ...this.state };
  }
  async release() {
    this.leased = false;
  }
  async totalAdvisories() {
    return this.rows.size;
  }
  async startRun() {
    return "run-1";
  }
  async finish(_p: string, _r: string, o: Finish) {
    this.leased = false;
    this.finished.push(o);
    if (o.success) {
      if (o.etag !== undefined) this.state.etag = o.etag;
      if (o.watermark !== undefined) this.state.watermark = o.watermark;
      this.state.lastSuccessAt = "now";
    }
    if (
      o.status !== "succeeded" &&
      o.status !== "not_modified" &&
      o.watermark !== undefined
    )
      this.state.watermark = o.watermark;
    this.state.blockedUntil = o.blockedUntil ?? null;
  }
  async upsertChunk(records: NormalizedAdvisory[]) {
    let n = 0;
    for (const r of records) {
      const key = `${r.provider}:${r.sourceId}`;
      if (JSON.stringify(this.rows.get(key)) !== JSON.stringify(r)) n++;
      this.rows.set(key, r);
      this.state.recordCount = this.rows.size;
    }
    return n;
  }
  async markRemoved(_p: string, keep: string[]) {
    this.removedCalls.push(keep);
    return 0;
  }
  async osvCandidates() {
    return this.osvIds;
  }
  async osvStale() {
    return [];
  }
  async markOsvChecked(ids: string[]) {
    this.checked.push(...ids);
  }
}
const jsonRes = (
  body: unknown,
  headers: Record<string, string> = {},
  status = 200,
) => new Response(JSON.stringify(body), { status, headers });
function run(
  provider: Parameters<typeof syncProvider>[0],
  cat: FakeCatalog,
  fetchImpl: typeof fetch,
  extra: Partial<Parameters<typeof syncProvider>[1]> = {},
) {
  const signal = new AbortController().signal;
  const client = new FeedClient({
    fetchImpl,
    signal,
    sleep: async () => undefined,
  });
  return {
    client,
    result: syncProvider(provider, {
      catalog: cat as unknown as CatalogStore,
      client,
      workerId: "w1",
      trigger: "manual",
      deadlineAt: Date.now() + 20000,
      signal,
      ...extra,
    }),
  };
}

describe("S09-A2 provider failure, retry and stale-data behaviour", () => {
  it("stores a KEV snapshot, then treats an unchanged ETag as not_modified without refetching the body", async () => {
    const cat = new FakeCatalog();
    const first = run("cisa_kev", cat, (async () =>
      jsonRes(kevSnapshot(), { etag: '"v1"' })) as typeof fetch);
    expect(await first.result).toMatchObject({
      status: "succeeded",
      changed: 2,
    });
    expect(cat.finished[0]).toMatchObject({
      success: true,
      etag: '"v1"',
      feedVersion: "2026.11.18",
    });
    expect(cat.removedCalls[0]).toEqual(["CVE-2021-23337", "CVE-2020-0001"]);
    let inm: string | null = null;
    const second = run("cisa_kev", cat, (async (
      _u: string,
      init: RequestInit,
    ) => {
      inm = (init.headers as Record<string, string>)["If-None-Match"];
      return new Response(null, { status: 304 });
    }) as unknown as typeof fetch);
    expect(await second.result).toMatchObject({
      status: "not_modified",
      changed: 0,
    });
    expect(inm).toBe('"v1"');
    expect(cat.rows.size).toBe(2);
  });
  it("retries timeouts a bounded number of times, keeps last-known-good rows and never fabricates success", async () => {
    const cat = new FakeCatalog();
    await run("cisa_kev", cat, (async () =>
      jsonRes(kevSnapshot(), { etag: '"v1"' })) as typeof fetch).result;
    const before = JSON.stringify([...cat.rows]);
    let calls = 0;
    const r = run("cisa_kev", cat, (async () => {
      calls++;
      throw new DOMException("t", "TimeoutError");
    }) as typeof fetch);
    expect(await r.result).toMatchObject({
      status: "failed",
      errorCode: "timeout",
    });
    expect(calls).toBe(3);
    const last = cat.finished.at(-1)!;
    expect(last.success).toBe(false);
    expect(last.etag).toBeUndefined(); // validators only move on success
    expect(JSON.stringify([...cat.rows])).toBe(before);
    expect(cat.leased).toBe(false); // lease released for the next attempt
  });
  it("records HTTP 429 with a block window and then skips (no request) until it passes", async () => {
    const cat = new FakeCatalog();
    let calls = 0;
    const r = run(
      "ghsa",
      cat,
      (async () => (
        calls++,
        new Response("", { status: 429, headers: { "retry-after": "600" } })
      )) as typeof fetch,
    );
    expect(await r.result).toMatchObject({
      status: "rate_limited",
      errorCode: "rate_limited",
    });
    expect(calls).toBe(1);
    const blocked = cat.finished[0].blockedUntil!;
    expect(Date.parse(blocked) - Date.now()).toBeGreaterThan(590_000);
    cat.state.blockedUntil = blocked;
    const again = run(
      "ghsa",
      cat,
      (async () => (calls++, jsonRes([]))) as typeof fetch,
    );
    expect(await again.result).toMatchObject({ status: "skipped_backoff" });
    expect(calls).toBe(1);
    expect(cat.leased).toBe(false);
  });
  it("rejects a malformed or implausibly small KEV snapshot without removing anything", async () => {
    const cat = new FakeCatalog();
    expect(
      await run(
        "cisa_kev",
        cat,
        (async () => new Response("<html>", { status: 200 })) as typeof fetch,
      ).result,
    ).toMatchObject({ status: "failed", errorCode: "malformed_payload" });
    expect(
      await run("cisa_kev", cat, (async () =>
        jsonRes({ vulnerabilities: "no" })) as typeof fetch).result,
    ).toMatchObject({ errorCode: "malformed_payload" });
    cat.state.recordCount = 100;
    expect(
      await run("cisa_kev", cat, (async () =>
        jsonRes(kevSnapshot())) as typeof fetch).result,
    ).toMatchObject({ status: "failed", errorCode: "implausible_snapshot" });
    expect(cat.removedCalls).toHaveLength(0);
    expect(cat.rows.size).toBe(0);
  });
  it("paginates GHSA within the page budget and reports an honest partial run when more remains", async () => {
    const cat = new FakeCatalog();
    const page1 = [
      ghsaLodash(),
      ghsaRange("GHSA-cccc-cccc-cccc", "left-pad", "< 1.3.0", {
        updated_at: "2026-11-13T00:00:00Z",
      }),
    ];
    const page2 = [
      ghsaRange("GHSA-ffff-ffff-ffff", "is-odd", "< 3.0.0", {
        updated_at: "2026-11-14T00:00:00Z",
      }),
    ];
    const urls: string[] = [];
    const f = (async (u: string) => {
      urls.push(u);
      return u.includes("after=p2")
        ? jsonRes(page2)
        : jsonRes(page1, {
            link: `<${feedUrls.ghsa}?type=reviewed&per_page=100&sort=updated&direction=asc&after=p2>; rel="next"`,
          });
    }) as unknown as typeof fetch;
    const full = run("ghsa", cat, f);
    expect(await full.result).toMatchObject({
      status: "succeeded",
      changed: 3,
    });
    expect(urls).toHaveLength(2);
    expect(urls[0]).toMatch(/updated=%3E%3D\d{4}-\d\d-\d\d(&|$)/); // date granularity only: GitHub answers 422 to a timestamp
    expect(cat.finished[0].watermark).toBe("2026-11-14T00:00:00.000Z");
    const cat2 = new FakeCatalog();
    const capped = run("ghsa", cat2, f, { ghsaMaxPages: 1 });
    expect(await capped.result).toMatchObject({
      status: "partial",
      errorCode: "page_budget",
    });
    expect(cat2.finished[0].success).toBe(false); // freshness is not advanced by a partial pass
    expect(cat2.state.watermark).toBe("2026-11-13T00:00:00.000Z"); // but progress is kept
    expect(cat2.finished[0].etag).toMatch(/^ghsa:\d{4}-\d\d-\d\d:p2$/); // and the page cursor, so a busy day cannot stall
  });
  it("counts rejected GHSA records instead of storing them", async () => {
    const cat = new FakeCatalog();
    const r = run("ghsa", cat, (async () =>
      jsonRes([
        ghsaLodash(),
        ghsaLodash({ ghsa_id: "bad" }),
        ghsaLodash({ type: "malware", ghsa_id: "GHSA-cccc-cccc-cccc" }),
      ])) as typeof fetch);
    await r.result;
    expect(cat.rows.size).toBe(1);
  });
  it("enriches known GHSA ids from OSV, tolerates 404s and stops cleanly on 429", async () => {
    const cat = new FakeCatalog();
    cat.osvIds = [GHSA_LODASH, "GHSA-cccc-cccc-cccc", "GHSA-ffff-ffff-ffff"];
    const urls: string[] = [];
    const f = (async (u: string) => {
      urls.push(u);
      if (u.endsWith(GHSA_LODASH)) return jsonRes(osvLodash());
      if (u.endsWith("cccc")) return new Response("", { status: 404 });
      return new Response("", {
        status: 429,
        headers: { "retry-after": "60" },
      });
    }) as unknown as typeof fetch;
    const r = await run("osv", cat, f).result;
    expect(r.status).toBe("rate_limited");
    expect(cat.rows.has(`osv:${GHSA_LODASH}`)).toBe(true);
    expect(cat.checked).toEqual([GHSA_LODASH, "GHSA-cccc-cccc-cccc"]); // the rate-limited id stays unchecked
    expect(
      urls.every((u) => u.startsWith("https://api.osv.dev/v1/vulns/GHSA-")),
    ).toBe(true);
  });
  it("a concurrent run (held lease) fetches nothing", async () => {
    const cat = new FakeCatalog();
    cat.leased = true;
    let calls = 0;
    const r = run(
      "cisa_kev",
      cat,
      (async () => (calls++, jsonRes(kevSnapshot()))) as typeof fetch,
    );
    expect(await r.result).toMatchObject({ status: "skipped_locked" });
    expect(calls).toBe(0);
  });
  it("ends a run as partial (never succeeded) when the time budget is exhausted", async () => {
    const cat = new FakeCatalog();
    const r = run(
      "cisa_kev",
      cat,
      (async () => jsonRes(kevSnapshot())) as typeof fetch,
      { deadlineAt: Date.now() - 1 },
    );
    expect(await r.result).toMatchObject({
      status: "partial",
      errorCode: "time_budget",
    });
    expect(cat.finished[0].success).toBe(false);
    expect(cat.removedCalls).toHaveLength(0);
  });
});
