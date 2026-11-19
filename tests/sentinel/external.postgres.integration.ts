import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { runSentinelWorker } from "../../worker/sentinel/runtime";
import { applyMigrations } from "../../src/platform/migrations";
import { FeedClient } from "../../src/features/sentinel/external/feeds";
import { syncProvider } from "../../src/features/sentinel/external/sync";
import { assessExposure } from "../../src/features/sentinel/external/exposure";
import { guardInventoryPort } from "../../src/features/sentinel/external/inventory-store";
import {
  normalizeGhsa,
  normalizeOsv,
} from "../../src/features/sentinel/external/normalize";
import { advisorySyncKind } from "../../src/features/sentinel/external/service";
import { externalLoop } from "../../worker/sentinel/external-sync";
import { workerConfig } from "../../src/platform/config";
import type { Provider } from "../../src/features/sentinel/external/model";
import {
  ctx,
  setupExternalHarness,
  type ExternalHarness,
} from "./external-pg-harness";
import {
  GHSA_LODASH,
  ghsaLodash,
  ghsaRange,
  kevSnapshot,
  osvLodash,
} from "./external-fixtures";

const res = (
  body: unknown,
  headers: Record<string, string> = {},
  status = 200,
) => new Response(JSON.stringify(body), { status, headers });
type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;
const fetcher = (h: Handler, log: string[] = []) =>
  (async (u: string, init: RequestInit) => {
    log.push(u);
    return h(new URL(u), init);
  }) as unknown as typeof fetch;
/** Provider-shaped router for the three official hosts. */
const providers =
  (
    o: { kev?: unknown; ghsa?: unknown[]; osv?: Record<string, unknown> } = {},
  ): Handler =>
  (url) => {
    if (url.host === "www.cisa.gov")
      return res(o.kev ?? kevSnapshot(), { etag: '"k1"' });
    if (url.host === "api.github.com") return res(o.ghsa ?? []);
    const id = url.pathname.split("/").pop()!;
    return o.osv?.[id] ? res(o.osv[id]) : new Response("", { status: 404 });
  };
const noSleep = async () => undefined;
const sync = (
  h: ExternalHarness,
  provider: Provider,
  f: typeof fetch,
  extra: Partial<Parameters<typeof syncProvider>[1]> = {},
) => {
  const signal = new AbortController().signal;
  return syncProvider(provider, {
    catalog: h.catalog,
    client: new FeedClient({ fetchImpl: f, signal, sleep: noSleep }),
    workerId: "w-test",
    trigger: "manual",
    deadlineAt: Date.now() + 20000,
    signal,
    ...extra,
  });
};
const one = async (h: ExternalHarness, sql: string, values: unknown[] = []) =>
  (await h.admin.query(sql, values)).rows[0];
const GHSA2 = "GHSA-cccc-cccc-cccc";
const GHSA3 = "GHSA-ffff-ffff-ffff";
const GHSA4 = "GHSA-hhhh-hhhh-hhhh";
const GHSA5 = "GHSA-jjjj-jjjj-jjjj";

describe("S09-A1 normalization, aliases, deduplication and provenance (PostgreSQL)", () => {
  let h: ExternalHarness;
  beforeAll(async () => void (h = await setupExternalHarness()));
  afterAll(async () => h.close());

  it("persists KEV + GHSA + OSV, merges them under one canonical CVE and keeps each provider's assertion", async () => {
    expect(await sync(h, "cisa_kev", fetcher(providers()))).toMatchObject({
      status: "succeeded",
      changed: 2,
    });
    const ghsa = [ghsaLodash(), ghsaRange(GHSA2, "left-pad", "< 1.3.0")];
    expect(await sync(h, "ghsa", fetcher(providers({ ghsa })))).toMatchObject({
      status: "succeeded",
      changed: 2,
    });
    expect(
      await sync(
        h,
        "osv",
        fetcher(providers({ osv: { [GHSA_LODASH]: osvLodash() } })),
      ),
    ).toMatchObject({ status: "succeeded", changed: 1 });
    const page = await h.appCatalog.list({ offset: 0 }); // read through the least-privilege app role
    const lodash = page.items.find((i) => i.canonicalId === "CVE-2021-23337")!;
    expect(lodash.assertions.map((a) => a.provider).sort()).toEqual([
      "cisa_kev",
      "ghsa",
      "osv",
    ]);
    expect(lodash.aliases).toContain(GHSA_LODASH);
    expect(lodash.kev).toBe(true);
    expect(lodash.conflicting).toBe(false);
    const g = lodash.assertions.find((a) => a.provider === "ghsa")!;
    expect(g).toMatchObject({
      sourceId: GHSA_LODASH,
      severity: "high",
      status: "active",
      feedVersion: null,
      sourceUrl: `https://github.com/advisories/${GHSA_LODASH}`,
    });
    expect(g.rawSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(new Date(g.retrievedAt).getTime()).toBeGreaterThan(
      Date.now() - 60000,
    );
    expect(
      lodash.assertions.find((a) => a.provider === "cisa_kev")!.feedVersion,
    ).toBe("2026.11.18");
    expect(
      page.items.find((i) => i.canonicalId === "CVE-2020-0001")!.assertions,
    ).toHaveLength(1);
    // The 404 from OSV for the second GHSA is recorded as checked, never as an error or an invented record.
    expect(
      (
        await one(
          h,
          "SELECT osv_checked_at FROM sentinel.ext_advisories WHERE source_id=$1",
          [GHSA2],
        )
      ).osv_checked_at,
    ).not.toBeNull();
  });
  it("is idempotent: repeating every sync changes nothing (no duplicate rows, revisions or history)", async () => {
    const snapshot = async () => ({
      rows: Number(
        (await one(h, "SELECT count(*) AS n FROM sentinel.ext_advisories")).n,
      ),
      rev: Number(
        (await one(h, "SELECT sum(revision) AS n FROM sentinel.ext_advisories"))
          .n,
      ),
      hist: Number(
        (await one(h, "SELECT count(*) AS n FROM sentinel.ext_history")).n,
      ),
      aff: Number(
        (await one(h, "SELECT count(*) AS n FROM sentinel.ext_affected")).n,
      ),
    });
    const before = await snapshot();
    expect(
      await sync(
        h,
        "cisa_kev",
        fetcher((_u, init) =>
          (init.headers as Record<string, string>)["If-None-Match"]
            ? new Response(null, { status: 304 })
            : res(kevSnapshot()),
        ),
      ),
    ).toMatchObject({ status: "not_modified" });
    const ghsa = [ghsaLodash(), ghsaRange(GHSA2, "left-pad", "< 1.3.0")];
    expect(await sync(h, "ghsa", fetcher(providers({ ghsa })))).toMatchObject({
      status: "succeeded",
      changed: 0,
    });
    expect(
      await sync(
        h,
        "osv",
        fetcher(providers({ osv: { [GHSA_LODASH]: osvLodash() } })),
      ),
    ).toMatchObject({ changed: 0 });
    expect(await snapshot()).toEqual(before);
  });
  it("records an updated assertion as a new revision with bounded append-only history", async () => {
    await sync(
      h,
      "ghsa",
      fetcher(
        providers({
          ghsa: [
            ghsaLodash({
              summary: "Updated summary",
              updated_at: "2026-11-15T00:00:00Z",
            }),
          ],
        }),
      ),
    );
    const row = await one(
      h,
      "SELECT revision,title,modified_at FROM sentinel.ext_advisories WHERE provider='ghsa' AND source_id=$1",
      [GHSA_LODASH],
    );
    expect([Number(row.revision), row.title]).toEqual([2, "Updated summary"]);
    expect(
      Number(
        (
          await one(
            h,
            "SELECT count(*) AS n FROM sentinel.ext_history WHERE source_id=$1 AND provider='ghsa'",
            [GHSA_LODASH],
          )
        ).n,
      ),
    ).toBe(2);
    for (let i = 0; i < 12; i++)
      await sync(
        h,
        "ghsa",
        fetcher(
          providers({
            ghsa: [
              ghsaLodash({
                summary: `Revision ${i}`,
                updated_at: `2026-11-${16 + (i % 10)}T00:00:00Z`,
              }),
            ],
          }),
        ),
      );
    const hist = await h.admin.query(
      "SELECT revision FROM sentinel.ext_history WHERE source_id=$1 AND provider='ghsa' ORDER BY revision",
      [GHSA_LODASH],
    );
    expect(hist.rowCount).toBeLessThanOrEqual(10);
    const rev = Number(
      (
        await one(
          h,
          "SELECT revision FROM sentinel.ext_advisories WHERE provider='ghsa' AND source_id=$1",
          [GHSA_LODASH],
        )
      ).revision,
    );
    expect(Number(hist.rows.at(-1).revision)).toBe(rev); // latest revision always retained
  });
  it("marks withdrawn advisories and KEV removals without deleting history", async () => {
    await sync(
      h,
      "ghsa",
      fetcher(
        providers({
          ghsa: [
            ghsaRange(GHSA2, "left-pad", "< 1.3.0", {
              withdrawn_at: "2026-11-17T00:00:00Z",
              updated_at: "2026-11-17T00:00:00Z",
            }),
          ],
        }),
      ),
    );
    expect(
      (
        await one(
          h,
          "SELECT status FROM sentinel.ext_advisories WHERE source_id=$1",
          [GHSA2],
        )
      ).status,
    ).toBe("withdrawn");
    const kev = kevSnapshot();
    kev.vulnerabilities.pop(); // CVE-2020-0001 vanishes from the published catalog
    await sync(h, "cisa_kev", fetcher(providers({ kev })));
    expect(
      (
        await one(
          h,
          "SELECT status FROM sentinel.ext_advisories WHERE source_id='CVE-2020-0001'",
        )
      ).status,
    ).toBe("removed_from_source");
    expect(
      (
        await one(
          h,
          "SELECT status FROM sentinel.ext_advisories WHERE source_id='CVE-2021-23337' AND provider='cisa_kev'",
        )
      ).status,
    ).toBe("active");
    const withdrawn = await h.appCatalog.list({
      status: "withdrawn",
      offset: 0,
    });
    expect(withdrawn.items.map((i) => i.assertions[0].sourceId)).toEqual([
      GHSA2,
    ]);
  });
  it("resolves alias chains deterministically, never splitting an already merged cluster", async () => {
    const osvFirst = normalizeOsv({
      id: "PYSEC-2026-1",
      modified: "2026-11-01T00:00:00Z",
      aliases: [GHSA3],
      summary: "alias chain",
      affected: [],
    })!;
    await h.catalog.upsertChunk([osvFirst], new Date().toISOString());
    expect(
      (
        await one(
          h,
          "SELECT canonical_id FROM sentinel.ext_advisories WHERE source_id='PYSEC-2026-1'",
        )
      ).canonical_id,
    ).toBe(GHSA3);
    const ghsaThen = normalizeGhsa(
      ghsaRange(GHSA3, "chain-pkg", "< 1.0.0", {
        cve_id: "CVE-2026-5555",
        identifiers: [
          { type: "GHSA", value: GHSA3 },
          { type: "CVE", value: "CVE-2026-5555" },
        ],
      }),
    )!;
    await h.catalog.upsertChunk([ghsaThen], new Date().toISOString());
    const rows = (
      await h.admin.query(
        "SELECT source_id,canonical_id FROM sentinel.ext_advisories WHERE source_id IN ('PYSEC-2026-1',$1) ORDER BY source_id",
        [GHSA3],
      )
    ).rows;
    expect(rows.map((r) => r.canonical_id)).toEqual([
      "CVE-2026-5555",
      "CVE-2026-5555",
    ]); // earlier row moved, nothing split
    // A third record that only overlaps the OSV row joins the existing cluster instead of forming a new one.
    const joiner = normalizeOsv({
      id: "OSV-2026-77",
      modified: "2026-11-02T00:00:00Z",
      aliases: ["PYSEC-2026-1"],
      summary: "joins via osv",
      affected: [],
    })!;
    await h.catalog.upsertChunk([joiner], new Date().toISOString());
    expect(
      (
        await one(
          h,
          "SELECT canonical_id FROM sentinel.ext_advisories WHERE source_id='OSV-2026-77'",
        )
      ).canonical_id,
    ).toBe("CVE-2026-5555");
  });
  it("keeps unrelated advisories separate even when their package names collide (alias collision safety)", async () => {
    const a = normalizeGhsa(
      ghsaRange(GHSA4, "shared-name", "< 1.0.0", {
        cve_id: "CVE-2026-1001",
        identifiers: [{ type: "CVE", value: "CVE-2026-1001" }],
      }),
    )!;
    const b = normalizeGhsa(
      ghsaRange(GHSA5, "shared-name", "< 2.0.0", {
        cve_id: "CVE-2026-1002",
        identifiers: [{ type: "CVE", value: "CVE-2026-1002" }],
      }),
    )!;
    await h.catalog.upsertChunk([a, b], new Date().toISOString());
    const rows = (
      await h.admin.query(
        "SELECT source_id,canonical_id FROM sentinel.ext_advisories WHERE source_id=ANY($1) ORDER BY source_id",
        [[GHSA4, GHSA5]],
      )
    ).rows;
    expect(rows.map((r) => r.canonical_id)).toEqual([
      "CVE-2026-1001",
      "CVE-2026-1002",
    ]);
  });
  it("preserves conflicting provider claims side by side and flags the disagreement", async () => {
    const id = "GHSA-mmmm-mmmm-mmmm";
    await h.catalog.upsertChunk(
      [
        normalizeGhsa(
          ghsaRange(id, "conflict-pkg", "< 2.0.0", {
            cve_id: "CVE-2026-2002",
            identifiers: [{ type: "CVE", value: "CVE-2026-2002" }],
          }),
        )!,
        normalizeOsv({
          id,
          modified: "2026-11-12T00:00:00Z",
          aliases: ["CVE-2026-2002"],
          summary: "osv view",
          affected: [
            {
              package: { ecosystem: "npm", name: "conflict-pkg" },
              ranges: [
                {
                  type: "SEMVER",
                  events: [{ introduced: "0" }, { fixed: "1.5.0" }],
                },
              ],
            },
          ],
        })!,
      ],
      new Date().toISOString(),
    );
    const detail = await h.appCatalog.detail("CVE-2026-2002");
    expect(detail!.advisory.conflicting).toBe(true);
    expect(
      detail!.advisory.assertions
        .map((a) => [a.provider, a.affected[0].ranges[0].fixed])
        .sort(),
    ).toEqual([
      ["ghsa", "2.0.0"],
      ["osv", "1.5.0"],
    ]);
    expect(
      (await h.appCatalog.detail(id.toLowerCase()))!.advisory.canonicalId,
    ).toBe("CVE-2026-2002"); // alias lookup
    expect(await h.appCatalog.detail("CVE-2099-0000")).toBeNull();
  });
  it("searches, filters and paginates the catalog", async () => {
    expect(
      (await h.appCatalog.list({ q: "lodash", offset: 0 })).items.map(
        (i) => i.canonicalId,
      ),
    ).toContain("CVE-2021-23337");
    expect(
      (await h.appCatalog.list({ kev: true, offset: 0 })).items.map(
        (i) => i.canonicalId,
      ),
    ).toEqual(["CVE-2021-23337"]);
    expect(
      (
        await h.appCatalog.list({
          ecosystem: "npm",
          packageName: "lodash",
          offset: 0,
        })
      ).items.map((i) => i.canonicalId),
    ).toEqual(["CVE-2021-23337"]);
    expect((await h.appCatalog.list({ q: "%", offset: 0 })).items).toHaveLength(
      0,
    ); // LIKE metacharacters are escaped
    for (const q of [GHSA_LODASH, GHSA_LODASH.toUpperCase(), "cve-2021-23337"])
      expect(
        (await h.appCatalog.list({ q, offset: 0 })).items.map(
          (i) => i.canonicalId,
        ),
        q,
      ).toContain("CVE-2021-23337"); // identifier search is canonicalized
    const alphabet = "23456789cfghjmpqrvwx";
    const gid = (i: number) =>
      "GHSA-pppp-pppp-" +
      [3, 2, 1, 0].map((k) => alphabet[Math.floor(i / 20 ** k) % 20]).join("");
    const many = Array.from({ length: 30 }, (_, i) =>
      normalizeGhsa(ghsaRange(gid(i), `bulk-${i}`, "< 1.0.0"))!,
    );
    await h.catalog.upsertChunk(many, new Date().toISOString());
    const first = await h.appCatalog.list({ offset: 0 });
    expect(first.items).toHaveLength(25);
    expect(first.nextOffset).toBe(25);
    expect(
      (await h.appCatalog.list({ offset: 25 })).items.length,
    ).toBeGreaterThan(0);
  });
});

describe("S09-A2 outages, rate limits, stale data and crash recovery (PostgreSQL)", () => {
  let h: ExternalHarness;
  beforeAll(async () => void (h = await setupExternalHarness()));
  afterAll(async () => h.close());
  const src = (p: Provider) =>
    one(h, "SELECT * FROM sentinel.ext_sources WHERE provider=$1", [p]);

  it("keeps last-known-good rows and reports degraded health after a provider outage", async () => {
    await sync(h, "cisa_kev", fetcher(providers()));
    const good = await src("cisa_kev");
    expect(good).toMatchObject({
      status: "ok",
      etag: '"k1"',
      consecutive_failures: 0,
      feed_version: "2026.11.18",
    });
    const log: string[] = [];
    const down = await sync(
      h,
      "cisa_kev",
      fetcher(() => {
        throw new DOMException("t", "TimeoutError");
      }, log),
    );
    expect(down).toMatchObject({ status: "failed", errorCode: "timeout" });
    expect(log).toHaveLength(3); // bounded retries
    const bad = await src("cisa_kev");
    expect(bad).toMatchObject({
      status: "degraded",
      last_error_code: "timeout",
      consecutive_failures: 1,
      etag: '"k1"',
      lease_owner: null,
    });
    expect(new Date(bad.last_success_at).getTime()).toBe(
      new Date(good.last_success_at).getTime(),
    ); // never fabricated
    expect(
      Number(
        (
          await one(
            h,
            "SELECT count(*) AS n FROM sentinel.ext_advisories WHERE status='active'",
          )
        ).n,
      ),
    ).toBe(2);
    const run = await one(
      h,
      "SELECT status,error_code,requests FROM sentinel.ext_runs WHERE provider='cisa_kev' ORDER BY started_at DESC LIMIT 1",
    );
    expect(run).toMatchObject({
      status: "failed",
      error_code: "timeout",
      requests: 3,
    });
  });
  it("rejects a malformed payload without touching stored data", async () => {
    const r = await sync(
      h,
      "cisa_kev",
      fetcher(() => new Response("<html>nope</html>", { status: 200 })),
    );
    expect(r).toMatchObject({
      status: "failed",
      errorCode: "malformed_payload",
    });
    expect(
      Number(
        (await one(h, "SELECT count(*) AS n FROM sentinel.ext_advisories")).n,
      ),
    ).toBe(2);
    expect((await src("cisa_kev")).consecutive_failures).toBe(2);
  });
  it("derives freshness from the last success, not from the last attempt", async () => {
    await h.admin.query(
      "UPDATE sentinel.ext_sources SET last_success_at=clock_timestamp()-interval '3 days' WHERE provider='cisa_kev'",
    );
    const o = await h.service.overview(ctx(1));
    expect(o.sources.find((s) => s.provider === "cisa_kev")).toMatchObject({
      freshness: "stale",
      status: "degraded",
      lastErrorCode: "malformed_payload",
    });
    expect(o.sources.find((s) => s.provider === "ghsa")).toMatchObject({
      freshness: "never_synced",
      status: "never_run",
    });
  });
  it("honours HTTP 429: records a block window and then makes no request until it passes", async () => {
    const r = await sync(
      h,
      "ghsa",
      fetcher(
        () =>
          new Response("", { status: 429, headers: { "retry-after": "900" } }),
      ),
    );
    expect(r).toMatchObject({ status: "rate_limited" });
    const s = await src("ghsa");
    expect(s.status).toBe("rate_limited");
    expect(new Date(s.blocked_until).getTime() - Date.now()).toBeGreaterThan(
      800_000,
    );
    expect(await h.catalog.due(900_000)).not.toContain("ghsa");
    const log: string[] = [];
    expect(
      await sync(
        h,
        "ghsa",
        fetcher(() => res([]), log),
      ),
    ).toMatchObject({ status: "skipped_backoff" });
    expect(log).toHaveLength(0);
    expect((await src("ghsa")).lease_owner).toBeNull();
  });
  it("serializes concurrent runs with a database lease and recovers from a crashed holder", async () => {
    const log: string[] = [];
    const slow = fetcher(async () => {
      await new Promise((r) => setTimeout(r, 250));
      return res(kevSnapshot(), { etag: '"k2"' });
    }, log);
    const [a, b] = await Promise.all([
      sync(h, "cisa_kev", slow),
      sync(h, "cisa_kev", slow),
    ]);
    expect([a.status, b.status].sort()).toEqual([
      "skipped_locked",
      "succeeded",
    ]); // exactly one fetched
    expect(log).toHaveLength(1);
    await h.admin.query(
      "UPDATE sentinel.ext_sources SET lease_owner='crashed',lease_until=clock_timestamp()+interval '1 hour' WHERE provider='cisa_kev'",
    );
    expect(
      (
        await sync(
          h,
          "cisa_kev",
          fetcher(() => res(kevSnapshot())),
        )
      ).status,
    ).toBe("skipped_locked");
    await h.admin.query(
      "UPDATE sentinel.ext_sources SET lease_until=clock_timestamp()-interval '1 second' WHERE provider='cisa_kev'",
    );
    expect(
      (
        await sync(
          h,
          "cisa_kev",
          fetcher(() => res(kevSnapshot())),
        )
      ).status,
    ).toBe("succeeded");
  });
  it("ends an over-budget run as partial, not success, and keeps its progress honest", async () => {
    const r = await sync(
      h,
      "cisa_kev",
      fetcher(() => res(kevSnapshot())),
      { deadlineAt: Date.now() - 1 },
    );
    expect(r).toMatchObject({ status: "partial", errorCode: "time_budget" });
    expect((await src("cisa_kev")).status).toBe("partial");
  });
  it("aborts cleanly on shutdown and releases the lease", async () => {
    await h.catalog.upsertChunk(
      [normalizeGhsa(ghsaLodash())!],
      new Date().toISOString(),
    ); // an OSV candidate to fetch
    const ac = new AbortController();
    const hang = fetcher(
      (_u, init) =>
        new Promise<Response>((_res, rej) =>
          (init.signal as AbortSignal).addEventListener("abort", () =>
            rej(new DOMException("a", "AbortError")),
          ),
        ),
    );
    const p = syncProvider("osv", {
      catalog: h.catalog,
      client: new FeedClient({
        fetchImpl: hang,
        signal: ac.signal,
        sleep: noSleep,
      }),
      workerId: "w",
      trigger: "scheduled",
      deadlineAt: Date.now() + 20000,
      signal: ac.signal,
    });
    setTimeout(() => ac.abort(), 100);
    expect(await p).toMatchObject({ status: "failed", errorCode: "aborted" });
    expect((await src("osv")).lease_owner).toBeNull();
  });
  it("never creates runtime events, alerts, incidents, responses or notifications from advisory data", async () => {
    for (const t of [
      "telemetry_events",
      "detection_alerts",
      "incidents",
      "response_actions",
      "notification_deliveries",
      "intel_cases",
      "ghost_decoys",
    ])
      expect(
        Number((await one(h, `SELECT count(*) AS n FROM sentinel.${t}`)).n),
        t,
      ).toBe(0);
    expect(
      Number((await one(h, "SELECT count(*) AS n FROM platform.jobs")).n),
    ).toBe(0);
  });
  it("retains bounded run history", async () => {
    await h.admin.query(
      "INSERT INTO sentinel.ext_runs(run_id,provider,trigger,status,started_at,finished_at) SELECT gen_random_uuid(),'osv','scheduled','succeeded',clock_timestamp()-(g||' minutes')::interval,clock_timestamp() FROM generate_series(1,230) g",
    );
    await h.catalog.retain();
    expect(
      Number(
        (
          await one(
            h,
            "SELECT count(*) AS n FROM sentinel.ext_runs WHERE provider='osv'",
          )
        ).n,
      ),
    ).toBeLessThanOrEqual(200);
    expect(
      Number(
        (
          await one(
            h,
            "SELECT count(*) AS n FROM sentinel.ext_runs WHERE provider='cisa_kev'",
          )
        ).n,
      ),
    ).toBeGreaterThan(0);
  });
});

describe("S09-A3/A4 potential repository exposure and cannot_assess (PostgreSQL)", () => {
  let h: ExternalHarness;
  const A = ctx(1),
    NONE = ctx(2),
    EMPTY = ctx(3),
    KEVONLY = ctx(4);
  const commit = (n: number) => n.toString(16).padStart(40, "0");
  const sha = (n: number) => n.toString(16).padStart(64, "0");
  const item = (
    name: string,
    version: string,
    scope: "runtime" | "dev" = "runtime",
  ) => ({ ecosystem: "npm" as const, name, version, scope });
  const save = (c: typeof A, n: number, items: ReturnType<typeof item>[]) =>
    h.service.inventory.save(c, {
      commitSha: commit(n),
      lockfilePath: "package-lock.json",
      lockfileSha256: sha(n),
      lockfileVersion: 3,
      items,
    });
  beforeAll(async () => {
    h = await setupExternalHarness();
    for (const c of [A, NONE, EMPTY, KEVONLY]) await h.bind(c);
  });
  afterAll(async () => h.close());

  it("S09-A4: no inventory is `Cannot assess project exposure`, never a clean result", async () => {
    const r = await h.service.exposures(NONE);
    expect(r).toMatchObject({
      assessment: "cannot_assess",
      reason: "no_inventory",
      exposures: [],
    });
    expect(r.message.startsWith("Cannot assess project exposure")).toBe(true);
    expect(r.coverage.snapshot).toBeNull();
    expect(r.disclaimer).toMatch(/not proof of deployment/);
  });
  it("S09-A4: advisories alone (KEV only, no package feed) still cannot assess an existing inventory", async () => {
    await sync(h, "cisa_kev", fetcher(providers()));
    await save(KEVONLY, 1, [item("lodash", "4.17.20")]);
    const r = await h.service.exposures(KEVONLY);
    expect(r).toMatchObject({
      assessment: "cannot_assess",
      reason: "advisory_data_unavailable",
    });
    // Public advisory visibility works without any inventory or package feed.
    expect((await h.service.list({ kev: true, offset: 0 })).items).toHaveLength(
      2,
    );
  });
  it("S09-A4: empty inventories are reported as such", async () => {
    await save(EMPTY, 1, []);
    expect(await h.service.exposures(EMPTY)).toMatchObject({
      assessment: "cannot_assess",
      reason: "inventory_empty",
    });
  });
  it("S09-A3: matches exactly the affected versions, with advisory and inventory evidence", async () => {
    const ghsa = [
      ghsaLodash(),
      ghsaRange(GHSA2, "left-pad", ">= 1.0.0, <= 1.2.0"),
      ghsaRange(GHSA3, "is-odd", "> 1.0.0"), // exclusive lower bound: cannot be evaluated
      ghsaRange(GHSA4, "old-pkg", "< 9.0.0", {
        withdrawn_at: "2026-11-01T00:00:00Z",
      }),
      ghsaRange(GHSA5, "conflict-pkg", "< 2.0.0", {
        cve_id: "CVE-2026-2002",
        identifiers: [{ type: "CVE", value: "CVE-2026-2002" }],
      }),
    ];
    await sync(h, "ghsa", fetcher(providers({ ghsa })));
    await h.catalog.upsertChunk(
      [
        normalizeOsv(osvLodash())!,
        normalizeOsv({
          id: GHSA5,
          modified: "2026-11-12T00:00:00Z",
          aliases: ["CVE-2026-2002"],
          summary: "osv view",
          affected: [
            {
              package: { ecosystem: "npm", name: "conflict-pkg" },
              ranges: [
                {
                  type: "SEMVER",
                  events: [{ introduced: "0" }, { fixed: "1.5.0" }],
                },
              ],
            },
          ],
        })!,
      ],
      new Date().toISOString(),
    );
    const snap = await save(A, 1, [
      item("lodash", "4.17.20"),
      item("lodash", "4.17.21", "dev"), // fixed boundary: unaffected
      item("left-pad", "1.2.0"), // last_affected boundary: inclusive
      item("left-pad", "1.2.1"),
      item("left-pad", "0.9.9"),
      item("is-odd", "2.0.0"),
      item("old-pkg", "1.0.0"),
      item("conflict-pkg", "1.8.0"),
      item("express", "4.0.0"),
    ]);
    const r = await h.service.exposures(A);
    expect(r.assessment).toBe("potential_exposure");
    const found = r.exposures
      .map((e) => `${e.packageName}@${e.installedVersion}`)
      .sort();
    expect(found).toEqual([
      "conflict-pkg@1.8.0",
      "left-pad@1.2.0",
      "lodash@4.17.20",
    ]);
    const lodash = r.exposures.find((e) => e.packageName === "lodash")!;
    expect(lodash).toMatchObject({
      canonicalId: "CVE-2021-23337",
      kev: true,
      topSeverity: "high",
      dependencyScope: "runtime",
      conflicting: false,
    });
    expect(
      lodash.sources
        .map((s) => [
          s.provider,
          s.matched,
          s.matchedRange?.fixed,
          s.fixedVersions,
        ])
        .sort(),
    ).toEqual([
      ["ghsa", true, "4.17.21", ["4.17.21"]],
      ["osv", true, "4.17.21", ["4.17.21"]],
    ]);
    expect(lodash.sources[0].sourceUrl).toMatch(/^https:\/\//);
    // Providers disagree: shown as a conflict, still reported because at least one source asserts exposure.
    const conflict = r.exposures.find((e) => e.packageName === "conflict-pkg")!;
    expect(conflict.conflicting).toBe(true);
    expect(conflict.sources.map((s) => [s.provider, s.matched]).sort()).toEqual(
      [
        ["ghsa", true],
        ["osv", false],
      ],
    );
    expect(r.coverage).toMatchObject({
      itemsTotal: 9,
      itemsAssessable: 9,
      uncertainAdvisories: 1,
    });
    expect(r.coverage.snapshot).toMatchObject({
      snapshotId: snap.snapshotId,
      commitSha: commit(1),
      lockfileSha256: sha(1),
      sourceKind: "repository_lockfile",
    });
    expect(r.message).toMatch(/cannot be evaluated/);
    expect(r.disclaimer).toMatch(
      /not proof of deployment, exploitability, compromise or an observed attack/,
    );
    expect(JSON.stringify(r)).not.toMatch(
      /exploited in this|is compromised|is safe/i,
    );
  });
  it("S09-A3: `no match` is bounded by coverage and never claims safety", async () => {
    await save(NONE, 1, [item("express", "4.0.0"), item("left-pad", "1.2.1")]);
    const r = await h.service.exposures(NONE);
    expect(r).toMatchObject({
      assessment: "no_match_within_coverage",
      exposures: [],
    });
    expect(r.message).toMatch(/not a security guarantee/);
    expect(r.coverage.itemsAssessable).toBe(2);
  });
  it("S09-A4: expired inventories and stale catalogs are surfaced, not trusted", async () => {
    await h.admin.query(
      "UPDATE sentinel.ext_inventory_snapshots SET collected_at=clock_timestamp()-interval '10 days',expires_at=clock_timestamp()-interval '3 days' WHERE workspace_id=$1",
      [NONE.scope.workspaceId],
    );
    expect(await h.service.exposures(NONE)).toMatchObject({
      assessment: "cannot_assess",
      reason: "inventory_expired",
      exposures: [],
    });
    await h.admin.query(
      "UPDATE sentinel.ext_sources SET last_success_at=clock_timestamp()-interval '10 days' WHERE provider='ghsa'",
    );
    const stale = await h.service.exposures(A);
    expect(stale.assessment).toBe("potential_exposure");
    expect(stale.message).toMatch(/stale/);
    expect(
      stale.coverage.catalogSources.find((s) => s.provider === "ghsa")!
        .freshness,
    ).toBe("stale");
  });
  it("re-verifying the same commit/lockfile extends validity without duplicating; retention keeps five snapshots", async () => {
    const again = await save(A, 1, [item("lodash", "4.17.20")]);
    expect(
      Number(
        (
          await one(
            h,
            "SELECT count(*) AS n FROM sentinel.ext_inventory_snapshots WHERE workspace_id=$1",
            [A.scope.workspaceId],
          )
        ).n,
      ),
    ).toBe(1);
    expect(again.itemCount).toBe(9); // the original immutable snapshot, not the new payload
    for (let n = 2; n <= 8; n++) await save(A, n, [item("express", "4.0.0")]);
    expect(
      Number(
        (
          await one(
            h,
            "SELECT count(*) AS n FROM sentinel.ext_inventory_snapshots WHERE workspace_id=$1",
            [A.scope.workspaceId],
          )
        ).n,
      ),
    ).toBe(5);
    expect(
      Number(
        (
          await one(
            h,
            "SELECT count(*) AS n FROM sentinel.ext_inventory_items i WHERE workspace_id=$1 AND NOT EXISTS(SELECT 1 FROM sentinel.ext_inventory_snapshots s WHERE s.snapshot_id=i.snapshot_id)",
            [A.scope.workspaceId],
          )
        ).n,
      ),
    ).toBe(0);
  });
  it("Guard GRD-020 stays not integrated: no guard-sourced snapshot can exist or be reported", async () => {
    expect(guardInventoryPort).toMatchObject({
      source: "guard_grd020",
      configured: false,
    });
    expect(await guardInventoryPort.latest(A.scope)).toBeNull();
    await expect(
      h.admin.query(
        "INSERT INTO sentinel.ext_inventory_snapshots(mode,workspace_id,project_id,snapshot_id,source_kind,repository_id,commit_sha,lockfile_path,lockfile_sha256,lockfile_version,item_count,ecosystems,collected_by,expires_at) VALUES('live',$1,$2,gen_random_uuid(),'guard_grd020','1',$3,'x',$4,1,0,'{}','x',clock_timestamp()+interval '1 day')",
        [A.scope.workspaceId, A.scope.projectId, commit(99), sha(99)],
      ),
    ).rejects.toThrow(/source_kind|check constraint/);
    const direct = await assessExposure(h.app, A.scope);
    expect(direct.coverage.snapshot?.sourceKind).toBe("repository_lockfile");
  });
  it("refuses to store inventory for an unregistered project or invalid provenance", async () => {
    await expect(save(ctx(50), 1, [item("x", "1.0.0")])).rejects.toMatchObject({
      code: "project_not_registered",
    });
    await expect(
      h.service.inventory.save(A, {
        commitSha: "zz",
        lockfilePath: "package-lock.json",
        lockfileSha256: sha(1),
        lockfileVersion: 3,
        items: [],
      }),
    ).rejects.toMatchObject({ code: "invalid_inventory" });
  });
});

describe("S09-A5 tenant isolation, roles and RLS (PostgreSQL)", () => {
  let h: ExternalHarness;
  const A = ctx(1),
    B = ctx(2),
    A2 = ctx(1, A.scope.workspaceId, "910099"); // same workspace, different project
  const commit = (n: number) => n.toString(16).padStart(40, "0");
  const sha = (n: number) => n.toString(16).padStart(64, "0");
  const items = (name: string, version: string) => [
    { ecosystem: "npm" as const, name, version, scope: "runtime" as const },
  ];
  beforeAll(async () => {
    h = await setupExternalHarness();
    for (const c of [A, B, A2]) await h.bind(c);
    await sync(
      h,
      "ghsa",
      fetcher(
        providers({
          ghsa: [ghsaLodash(), ghsaRange(GHSA2, "private-only-pkg", "< 9.9.9")],
        }),
      ),
    );
    await h.service.inventory.save(A, {
      commitSha: commit(1),
      lockfilePath: "package-lock.json",
      lockfileSha256: sha(1),
      lockfileVersion: 3,
      items: items("private-only-pkg", "1.0.0"),
    });
    await h.service.inventory.save(B, {
      commitSha: commit(2),
      lockfilePath: "package-lock.json",
      lockfileSha256: sha(2),
      lockfileVersion: 3,
      items: items("lodash", "4.17.20"),
    });
  });
  afterAll(async () => h.close());

  it("each project sees only its own snapshot, items and exposures", async () => {
    const a = await h.service.exposures(A),
      b = await h.service.exposures(B),
      a2 = await h.service.exposures(A2);
    expect(a.exposures.map((e) => e.packageName)).toEqual(["private-only-pkg"]);
    expect(b.exposures.map((e) => e.packageName)).toEqual(["lodash"]);
    expect(a2).toMatchObject({
      assessment: "cannot_assess",
      reason: "no_inventory",
    }); // same workspace is not enough
    expect((await h.service.inventory.latest(A.scope))!.commitSha).toBe(
      commit(1),
    );
    expect(
      await h.service.inventory.items(
        B.scope,
        (await h.service.inventory.latest(A.scope))!.snapshotId,
      ),
    ).toHaveLength(0); // A's snapshot id under B's scope
    expect(JSON.stringify(b)).not.toContain("private-only-pkg");
  });
  it("RLS hides other tenants and unscoped sessions even for raw SQL", async () => {
    const inB = await h.app.scoped(B.scope, (tx) =>
      h.app.query(
        tx,
        "SELECT workspace_id,project_id FROM sentinel.ext_inventory_snapshots",
      ),
    );
    expect(inB.rows).toEqual([
      { workspace_id: B.scope.workspaceId, project_id: B.scope.projectId },
    ]);
    const unscoped = await h.app.transaction((tx) =>
      h.app.query(tx, "SELECT * FROM sentinel.ext_inventory_snapshots"),
    );
    expect(unscoped.rowCount).toBe(0);
    const items = await h.app.transaction((tx) =>
      h.app.query(tx, "SELECT * FROM sentinel.ext_inventory_items"),
    );
    expect(items.rowCount).toBe(0);
    expect(
      Number(
        (
          await one(
            h,
            "SELECT count(*) AS n FROM sentinel.ext_inventory_snapshots",
          )
        ).n,
      ),
    ).toBe(2);
  });
  it("forged scope, demo mode and cross-tenant writes are rejected by the database", async () => {
    const forged = h.app.scoped(B.scope, (tx) =>
      h.app.query(
        tx,
        "INSERT INTO sentinel.ext_inventory_snapshots(mode,workspace_id,project_id,snapshot_id,source_kind,repository_id,commit_sha,lockfile_path,lockfile_sha256,lockfile_version,item_count,ecosystems,collected_by,expires_at) VALUES('live',$1,$2,gen_random_uuid(),'repository_lockfile','1',$3,'x',$4,3,0,'{}','x',clock_timestamp()+interval '1 day')",
        [A.scope.workspaceId, A.scope.projectId, commit(7), sha(7)],
      ),
    );
    await expect(forged).rejects.toMatchObject({ code: "42501" });
    let demoCode: string | undefined;
    try {
      await h.app.scoped({ ...B.scope, mode: "demo" }, async () => 1);
    } catch (e) {
      demoCode = (e as { code?: string }).code;
    }
    expect(demoCode).toBe("scope_denied");
    await expect(
      h.admin.query(
        "INSERT INTO sentinel.ext_inventory_snapshots(mode,workspace_id,project_id,snapshot_id,source_kind,repository_id,commit_sha,lockfile_path,lockfile_sha256,lockfile_version,item_count,ecosystems,collected_by,expires_at) VALUES('demo','w','p',gen_random_uuid(),'repository_lockfile','1',$1,'x',$2,3,0,'{}','x',clock_timestamp()+interval '1 day')",
        [commit(8), sha(8)],
      ),
    ).rejects.toThrow(/check constraint/);
    const cross = await h.app.scoped(B.scope, (tx) =>
      h.app.query(
        tx,
        "DELETE FROM sentinel.ext_inventory_snapshots WHERE workspace_id=$1",
        [A.scope.workspaceId],
      ),
    );
    expect(cross.rowCount).toBe(0);
    expect(
      Number(
        (
          await one(
            h,
            "SELECT count(*) AS n FROM sentinel.ext_inventory_snapshots WHERE workspace_id=$1",
            [A.scope.workspaceId],
          )
        ).n,
      ),
    ).toBe(1);
  });
  it("snapshot provenance is immutable to the app role", async () => {
    await expect(
      h.app.scoped(A.scope, (tx) =>
        h.app.query(
          tx,
          "UPDATE sentinel.ext_inventory_snapshots SET commit_sha=$1",
          [commit(5)],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      h.app.scoped(A.scope, (tx) =>
        h.app.query(
          tx,
          "UPDATE sentinel.ext_inventory_items SET version='9.9.9'",
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("the app role is read-only on the global catalog; the worker role cannot touch project inventory", async () => {
    for (const sql of [
      "INSERT INTO sentinel.ext_advisories(provider,source_id,canonical_id,ident,title,source_url,retrieved_at,raw_sha256,content_hash) VALUES('ghsa','GHSA-xxxx','x',ARRAY['x'],'t','https://x',now(),repeat('a',64),repeat('b',64))",
      "UPDATE sentinel.ext_advisories SET title='tampered'",
      "UPDATE sentinel.ext_sources SET status='ok'",
      "DELETE FROM sentinel.ext_runs",
      "INSERT INTO sentinel.ext_history(provider,source_id,revision,content_hash,retrieved_at,snapshot) VALUES('ghsa','x',1,repeat('a',64),now(),'{}')",
    ])
      await expect(
        h.app.transaction((tx) => h.app.query(tx, sql)),
        sql,
      ).rejects.toMatchObject({ code: "42501" });
    for (const sql of [
      "SELECT * FROM sentinel.ext_inventory_snapshots",
      "SELECT * FROM sentinel.ext_inventory_items",
      "DELETE FROM sentinel.ext_inventory_snapshots",
    ])
      await expect(
        h.worker.transaction((tx) => h.worker.query(tx, sql)),
        sql,
      ).rejects.toMatchObject({ code: "42501" });
    expect(
      Number(
        (
          await one(
            h,
            "SELECT count(*) AS n FROM sentinel.ext_advisories WHERE title='tampered'",
          )
        ).n,
      ),
    ).toBe(0);
  });
  it("global catalog tables carry no tenant or project columns and expose no inventory", async () => {
    const cols = (
      await h.admin.query(
        "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='sentinel' AND table_name IN ('ext_sources','ext_runs','ext_advisories','ext_affected','ext_history')",
      )
    ).rows;
    expect(
      cols.filter((c) =>
        /workspace|project|repository|actor|tenant/.test(c.column_name),
      ),
    ).toEqual([]);
    const page = JSON.stringify(
      await h.service.list({ q: "private-only-pkg", offset: 0 }),
    );
    expect(page).not.toMatch(
      new RegExp(`${A.scope.workspaceId}|${A.scope.projectId}|${commit(1)}`),
    );
  });
  it("sync requests and pending counts are scoped per project", async () => {
    await h.service.requestSync(B, ["ghsa"]);
    expect((await h.service.overview(B)).pendingSyncRequests).toBe(1);
    expect((await h.service.overview(A)).pendingSyncRequests).toBe(0);
  });
});

describe("S09-A6 worker-controlled synchronization (PostgreSQL)", () => {
  let h: ExternalHarness;
  const A = ctx(1);
  const options = workerConfig({
    SENTINEL_WORKER_POLL_MS: "100",
    SENTINEL_JOB_TIMEOUT_MS: "20000",
    SENTINEL_JOB_LEASE_MS: "30000",
    SENTINEL_WORKER_HEARTBEAT_MS: "1000",
  });
  const activation = (
    over: Partial<Parameters<typeof externalLoop>[0]["activation"]> = {},
  ) => ({
    scope: A.scope,
    notBefore: "2026-01-01T00:00:00.000Z",
    providers: ["cisa_kev", "ghsa", "osv"] as Provider[],
    intervalMs: 6 * 3_600_000,
    budgetMs: 15000,
    ...over,
  });
  const loop = (
    f: typeof fetch,
    act = activation(),
    signal = new AbortController().signal,
  ) =>
    externalLoop({
      db: h.worker,
      activation: act,
      workerId: "w-loop",
      options,
      signal,
      once: true,
      feed: { fetchImpl: f, sleep: noSleep },
    });
  beforeAll(async () => {
    h = await setupExternalHarness();
    await h.bind(A);
  });
  afterAll(async () => h.close());

  it("manual sync is a deduplicated durable job; nothing is fetched until the worker runs it", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const first = await h.service.requestSync(
      A,
      ["ghsa", "osv"],
      1_800_000_000_000,
    );
    const second = await h.service.requestSync(
      A,
      ["ghsa", "osv"],
      1_800_000_000_000 + 60_000,
    );
    expect(
      second.requested.map((r) => [r.provider, r.jobId, r.duplicate]),
    ).toEqual(first.requested.map((r) => [r.provider, r.jobId, true]));
    const later = await h.service.requestSync(
      A,
      ["ghsa"],
      1_800_000_000_000 + 6 * 60_000,
    );
    expect(later.requested[0].duplicate).toBe(false); // new 5-minute bucket
    expect(
      Number(
        (
          await one(
            h,
            "SELECT count(*) AS n FROM platform.jobs WHERE kind=$1",
            [advisorySyncKind],
          )
        ).n,
      ),
    ).toBe(3);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    await h.admin.query(
      "UPDATE platform.jobs SET state='cancelled',finished_at=clock_timestamp() WHERE kind=$1",
      [advisorySyncKind],
    );
  });
  it("the worker claims a manual job, syncs through the lease and completes it", async () => {
    await h.service.requestSync(A, ["cisa_kev"], Date.now());
    const log: string[] = [];
    await h.admin.query(
      "UPDATE sentinel.ext_sources SET last_attempt_at=clock_timestamp() WHERE provider IN ('ghsa','osv')",
    ); // keep the scheduler quiet
    await loop(fetcher(providers(), log));
    expect(log.filter((u) => u.includes("cisa.gov"))).toHaveLength(1);
    const job = await one(
      h,
      "SELECT state,attempts FROM platform.jobs WHERE kind=$1 AND subject_ref='cisa_kev' AND state<>'cancelled'",
      [advisorySyncKind],
    );
    expect(job).toMatchObject({ state: "completed", attempts: 1 });
    expect(
      await one(
        h,
        "SELECT trigger,status FROM sentinel.ext_runs WHERE provider='cisa_kev' ORDER BY started_at LIMIT 1",
      ),
    ).toMatchObject({ trigger: "manual", status: "succeeded" });
  });
  it("a job for a provider outside the approved set is retried, never executed", async () => {
    await h.admin.query(
      "UPDATE sentinel.ext_sources SET last_attempt_at=clock_timestamp()",
    );
    await h.service.requestSync(A, ["ghsa"], 1_900_000_000_000);
    await h.admin.query(
      "UPDATE platform.jobs SET available_at=clock_timestamp()-interval '1 second' WHERE state='queued'",
    );
    const log: string[] = [];
    await loop(
      fetcher(providers(), log),
      activation({ providers: ["cisa_kev"] }),
    );
    expect(log).toHaveLength(0);
    expect(
      await one(
        h,
        "SELECT state,attempts,last_error FROM platform.jobs WHERE subject_ref='ghsa' AND state<>'cancelled' ORDER BY created_at DESC LIMIT 1",
      ),
    ).toMatchObject({
      state: "queued",
      attempts: 1,
      last_error: "handler_failed",
    });
  });
  it("the scheduler syncs due providers once per interval, with the optional token sent to GitHub only, and leaks no secret", async () => {
    const token = "ghp_" + "S".repeat(36);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await h.admin.query(
      "UPDATE sentinel.ext_sources SET last_attempt_at=NULL,blocked_until=NULL,status='never_run'",
    );
    await h.admin.query(
      "UPDATE platform.jobs SET state='cancelled',finished_at=clock_timestamp() WHERE state IN ('queued','leased')",
    );
    const seen: { host: string; auth: string | undefined }[] = [];
    const f = fetcher((url, init) => {
      seen.push({
        host: url.host,
        auth: (init.headers as Record<string, string>).Authorization,
      });
      return providers({
        ghsa: [ghsaLodash()],
        osv: { [GHSA_LODASH]: osvLodash() },
      })(url, init);
    });
    await loop(f, activation({ ghsaToken: token }));
    expect(
      seen
        .filter((s) => s.host === "api.github.com")
        .every((s) => s.auth === `Bearer ${token}`),
    ).toBe(true);
    expect(
      seen
        .filter((s) => s.host !== "api.github.com")
        .every((s) => s.auth === undefined),
    ).toBe(true);
    const runs = (
      await h.admin.query(
        "SELECT provider,trigger,status FROM sentinel.ext_runs WHERE trigger='scheduled' ORDER BY provider",
      )
    ).rows;
    expect(runs).toEqual([
      { provider: "cisa_kev", trigger: "scheduled", status: "succeeded" },
      { provider: "ghsa", trigger: "scheduled", status: "succeeded" },
      { provider: "osv", trigger: "scheduled", status: "succeeded" },
    ]);
    const before = seen.length;
    await loop(f, activation({ ghsaToken: token })); // not due again within the interval
    expect(seen.length).toBe(before);
    const dump =
      JSON.stringify(
        await Promise.all(
          [
            "ext_sources",
            "ext_runs",
            "ext_advisories",
            "ext_affected",
            "ext_history",
          ].map(
            async (t) =>
              (await h.admin.query(`SELECT * FROM sentinel.${t}`)).rows,
          ),
        ),
      ) +
      JSON.stringify(
        (await h.admin.query("SELECT * FROM platform.jobs")).rows,
      ) +
      JSON.stringify(
        (await h.admin.query("SELECT * FROM platform.job_attempts")).rows,
      );
    expect(dump).not.toContain(token);
    expect(
      JSON.stringify([...warn.mock.calls, ...logSpy.mock.calls]),
    ).not.toContain(token);
    warn.mockRestore();
    logSpy.mockRestore();
  });
  it("shutdown during a sync returns promptly and releases the provider lease", async () => {
    await h.admin.query(
      "UPDATE sentinel.ext_sources SET last_attempt_at=NULL,blocked_until=NULL",
    );
    const ac = new AbortController();
    const hang = fetcher(
      (_u, init) =>
        new Promise<Response>((_r, rej) =>
          (init.signal as AbortSignal).addEventListener("abort", () =>
            rej(new DOMException("a", "AbortError")),
          ),
        ),
    );
    setTimeout(() => ac.abort(), 200);
    const t = Date.now();
    await loop(hang, activation(), ac.signal);
    expect(Date.now() - t).toBeLessThan(5000);
    expect(
      Number(
        (
          await one(
            h,
            "SELECT count(*) AS n FROM sentinel.ext_sources WHERE lease_owner IS NOT NULL",
          )
        ).n,
      ),
    ).toBe(0);
  });
});

describe("S09 migration reversal protocol (PostgreSQL)", () => {
  it("rolls back an untouched 0009, re-applies it, and refuses once data exists", async () => {
    const h = await setupExternalHarness();
    try {
      const m = h.plan.migrations;
      await applyMigrations(h.migrator, m, "down");
      expect(
        (await one(h, "SELECT to_regclass('sentinel.ext_advisories') AS t")).t,
      ).toBeNull();
      expect(
        (
          await one(
            h,
            "SELECT max(version) AS v FROM platform.schema_migrations",
          )
        ).v,
      ).toBe("0008_internal_intelligence");
      await applyMigrations(h.migrator, m, "up");
      expect(
        (
          await one(
            h,
            "SELECT max(version) AS v FROM platform.schema_migrations",
          )
        ).v,
      ).toBe("0009_external_intelligence");
      await sync(h, "cisa_kev", fetcher(providers()));
      await expect(
        applyMigrations(h.migrator, m, "down"),
      ).rejects.toMatchObject({ code: "target_denied" });
      expect(
        Number(
          (await one(h, "SELECT count(*) AS n FROM sentinel.ext_advisories")).n,
        ),
      ).toBe(2); // nothing destroyed
    } finally {
      await h.close();
    }
  });
});

describe("S09-A6 real worker runtime wiring (PostgreSQL)", () => {
  const A = ctx(1);
  async function runtime(
    h: ExternalHarness,
    external: Parameters<typeof runSentinelWorker>[0]["external"],
    f: typeof fetch,
  ) {
    const events: string[] = [];
    await runSentinelWorker({
      db: h.worker,
      pool: h.workerPool,
      migrations: h.plan.migrations,
      options: { ...workerConfig({}), healthPort: 0, pollMs: 100 },
      external,
      externalFeed: { fetchImpl: f, sleep: noSleep },
      workerId: randomUUID(),
      control: Object.assign(new EventEmitter(), {
        connected: true,
        disconnect: () => {},
      }),
      once: true,
      report: (e) => events.push(e.phase),
    });
    return events;
  }
  it("without an approved activation the worker never creates a feed client or makes a request", async () => {
    const h = await setupExternalHarness();
    try {
      const log: string[] = [];
      const events = await runtime(h, undefined, fetcher(providers(), log));
      expect(events).toEqual(["started", "shutdown_requested", "stopped"]);
      expect(log).toHaveLength(0);
      expect(
        Number((await one(h, "SELECT count(*) AS n FROM sentinel.ext_runs")).n),
      ).toBe(0);
      expect(
        (
          await one(
            h,
            "SELECT count(*) AS n FROM sentinel.ext_sources WHERE last_attempt_at IS NOT NULL",
          )
        ).n,
      ).toBe("0");
    } finally {
      await h.close();
    }
  });
  it("with an approved activation the worker syncs the due providers, then shuts down cleanly", async () => {
    const h = await setupExternalHarness();
    try {
      await h.bind(A);
      const log: string[] = [];
      const events = await runtime(
        h,
        {
          scope: A.scope,
          notBefore: "2026-01-01T00:00:00.000Z",
          providers: ["cisa_kev", "ghsa", "osv"],
          intervalMs: 6 * 3_600_000,
          budgetMs: 15000,
        },
        fetcher(
          providers({
            ghsa: [ghsaLodash()],
            osv: { [GHSA_LODASH]: osvLodash() },
          }),
          log,
        ),
      );
      expect(events).toEqual(["started", "shutdown_requested", "stopped"]);
      expect(new Set(log.map((u) => new URL(u).host))).toEqual(
        new Set(["www.cisa.gov", "api.github.com", "api.osv.dev"]),
      );
      const runs = (
        await h.admin.query(
          "SELECT provider,trigger,status FROM sentinel.ext_runs ORDER BY provider",
        )
      ).rows;
      expect(runs).toEqual([
        { provider: "cisa_kev", trigger: "scheduled", status: "succeeded" },
        { provider: "ghsa", trigger: "scheduled", status: "succeeded" },
        { provider: "osv", trigger: "scheduled", status: "succeeded" },
      ]);
      expect(
        Number(
          (
            await one(
              h,
              "SELECT count(*) AS n FROM sentinel.ext_sources WHERE lease_owner IS NOT NULL",
            )
          ).n,
        ),
      ).toBe(0);
    } finally {
      await h.close();
    }
  });
});
