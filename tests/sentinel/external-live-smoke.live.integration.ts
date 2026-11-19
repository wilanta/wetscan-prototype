import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FeedClient } from "../../src/features/sentinel/external/feeds";
import { syncProvider } from "../../src/features/sentinel/external/sync";
import type { Provider } from "../../src/features/sentinel/external/model";
import {
  setupExternalHarness,
  type ExternalHarness,
} from "./external-pg-harness";

/**
 * S09-A7 controlled real-feed smoke test. OPT-IN (SENTINEL_S09_LIVE_SMOKE=1): bounded reads of the official public
 * CISA KEV, GitHub Global Security Advisories and OSV endpoints into a THROWAWAY database. Otherwise it is NOT_RUN.
 */
describe.skipIf(process.env.SENTINEL_S09_LIVE_SMOKE !== "1")(
  "S09-A7 official public feeds (bounded smoke)",
  () => {
    let h: ExternalHarness;
    const requests: string[] = [];
    const counting = (async (u: string, init?: RequestInit) => {
      requests.push(new URL(u).host + new URL(u).pathname);
      return fetch(u, init);
    }) as typeof fetch;
    const run = (
      provider: Provider,
      extra: Partial<Parameters<typeof syncProvider>[1]> = {},
    ) => {
      const signal = new AbortController().signal;
      return syncProvider(provider, {
        catalog: h.catalog,
        client: new FeedClient({
          signal,
          fetchImpl: counting,
          maxRequests: 12,
        }),
        workerId: "live-smoke",
        trigger: "manual",
        deadlineAt: Date.now() + 90_000,
        signal,
        ...extra,
      });
    };
    beforeAll(async () => void (h = await setupExternalHarness()));
    afterAll(async () => h.close());

    it("CISA KEV: authentic catalog, normalized and persisted, then repeat is a no-op", async () => {
      const r = await run("cisa_kev");
      expect(r).toMatchObject({ status: "succeeded" });
      const rows = (
        await h.admin.query(
          "SELECT count(*)::int AS n,min(source_id) AS a,max(source_id) AS b FROM sentinel.ext_advisories WHERE provider='cisa_kev'",
        )
      ).rows[0];
      expect(rows.n).toBeGreaterThan(1000);
      const src = (
        await h.admin.query(
          "SELECT * FROM sentinel.ext_sources WHERE provider='cisa_kev'",
        )
      ).rows[0];
      expect(src).toMatchObject({ status: "ok", last_error_code: null });
      expect(src.feed_version).toMatch(/^\d{4}\.\d\d\.\d\d/);
      expect(src.etag).toBeTruthy();
      const sample = (
        await h.admin.query(
          "SELECT source_id,kev->>'dateAdded' AS added,retrieved_at,raw_sha256 FROM sentinel.ext_advisories WHERE provider='cisa_kev' ORDER BY modified_at DESC LIMIT 3",
        )
      ).rows;
      for (const s of sample) expect(s.source_id).toMatch(/^CVE-\d{4}-\d{4,}$/);
      console.log(
        "LIVE_KEV",
        JSON.stringify({
          count: rows.n,
          feedVersion: src.feed_version,
          newest: sample.map((s) => s.source_id + "@" + s.added),
        }),
      );
      const again = await run("cisa_kev");
      // The origin may or may not honour If-None-Match (observed: it can answer 200); either way a repeat must change nothing.
      expect(["not_modified", "succeeded"]).toContain(again.status);
      expect(again.changed).toBe(0);
      console.log("LIVE_KEV_REPEAT", again.status);
    });
    it("GitHub Global Security Advisories: reviewed advisories with aliases and affected ranges", async () => {
      const r = await run("ghsa", { ghsaMaxPages: 1, ghsaBackfillDays: 2 });
      expect(["succeeded", "partial"]).toContain(r.status);
      const rows = (
        await h.admin.query(
          "SELECT count(*)::int AS n FROM sentinel.ext_advisories WHERE provider='ghsa'",
        )
      ).rows[0];
      expect(rows.n).toBeGreaterThan(0);
      const sample = (
        await h.admin.query(
          "SELECT source_id,canonical_id,severity,modified_at,source_url FROM sentinel.ext_advisories WHERE provider='ghsa' ORDER BY modified_at DESC LIMIT 3",
        )
      ).rows;
      for (const s of sample) {
        expect(s.source_id).toMatch(/^GHSA-/);
        expect(s.source_url).toMatch(
          /^https:\/\/github\.com\/advisories\/GHSA-/,
        );
      }
      const affected = (
        await h.admin.query(
          "SELECT count(*)::int AS n,count(*) FILTER (WHERE certainty='verified')::int AS v FROM sentinel.ext_affected WHERE provider='ghsa'",
        )
      ).rows[0];
      console.log(
        "LIVE_GHSA",
        JSON.stringify({
          stored: rows.n,
          status: r.status,
          affected,
          sample: sample.map((s) => `${s.source_id}→${s.canonical_id}`),
        }),
      );
    });
    it("OSV: enriches stored GHSA ids from the official API", async () => {
      const r = await run("osv", { osvBatch: 5 });
      expect(r.status).toBe("succeeded");
      const rows = (
        await h.admin.query(
          "SELECT source_id,canonical_id FROM sentinel.ext_advisories WHERE provider='osv'",
        )
      ).rows;
      console.log(
        "LIVE_OSV",
        JSON.stringify({ stored: rows.length, sample: rows.slice(0, 3) }),
      );
      expect(rows.length).toBeGreaterThan(0);
    });
    it("stays bounded and records accurate status; no runtime events are created", async () => {
      expect(requests.length).toBeLessThanOrEqual(30);
      expect(new Set(requests.map((r) => r.split("/")[0]))).toEqual(
        new Set(["www.cisa.gov", "api.github.com", "api.osv.dev"]),
      );
      const runs = (
        await h.admin.query(
          "SELECT provider,status,requests,bytes,records_seen,records_changed,records_rejected,error_code FROM sentinel.ext_runs ORDER BY started_at",
        )
      ).rows;
      console.log(
        "LIVE_RUNS",
        JSON.stringify(runs),
        "REQUESTS",
        requests.length,
      );
      for (const r of runs) expect(Number(r.requests)).toBeLessThanOrEqual(12);
      for (const t of ["telemetry_events", "detection_alerts", "incidents"])
        expect(
          Number(
            (await h.admin.query(`SELECT count(*) AS n FROM sentinel.${t}`))
              .rows[0].n,
          ),
        ).toBe(0);
    });
  },
);
