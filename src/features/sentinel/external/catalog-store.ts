import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { PlatformDatabase } from "../../../platform/database";
import type { TransactionContext } from "../platform-contracts";
import { contentHash, normId, pickCanonical } from "./normalize";
import {
  catalogLimits,
  type AdvisoryAssertion,
  type AdvisoryPage,
  type AffectedPackage,
  type CanonicalAdvisory,
  type NormalizedAdvisory,
  type Provider,
  type Severity,
  type SourceStatus,
  ADVISORY_DISCLAIMER,
  severities,
} from "./model";

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
export const hashOf = (r: NormalizedAdvisory) => {
  const { rawSha256: _raw, feedVersion: _feed, ...assertion } = r;
  void _raw;
  void _feed;
  return contentHash(assertion);
};
const rank = (s: Severity) => severities.indexOf(s);
function snapshotOf(r: NormalizedAdvisory) {
  const full = JSON.stringify(r);
  if (full.length <= 60000) return JSON.parse(full);
  return { ...r, affected: [], affectedTruncated: true };
}

export interface SourceState {
  provider: Provider;
  etag: string | null;
  watermark: string | null;
  feedVersion: string | null;
  blockedUntil: string | null;
  lastSuccessAt: string | null;
  recordCount: number;
  consecutiveFailures: number;
}
export interface RunCounters {
  requests: number;
  bytes: number;
  recordsSeen: number;
  recordsChanged: number;
  recordsRejected: number;
  httpStatus: number | null;
}
export interface ListInput {
  q?: string;
  provider?: Provider;
  severity?: Severity;
  kev?: boolean;
  ecosystem?: string;
  packageName?: string;
  status?: "active" | "withdrawn" | "removed_from_source";
  offset: number;
}
export type RunStatus =
  "succeeded" | "partial" | "not_modified" | "failed" | "rate_limited";

/** Global public-advisory catalog. Writes require the worker role (grants + RLS); the app role is read-only. */
export class CatalogStore {
  constructor(private readonly db: PlatformDatabase) {}
  private q<R extends QueryResultRow = QueryResultRow>(
    tx: TransactionContext,
    sql: string,
    values: unknown[] = [],
  ) {
    return this.db.query<R>(tx, sql, values);
  }

  // ---- sync (worker) ----
  /** Per-provider lease: a second worker/job/schedule tick gets null and must not fetch. Expired leases self-heal after a crash. */
  async claim(provider: Provider, workerId: string, leaseMs: number) {
    return this.db.transaction(async (tx) => {
      const r = await this.q(
        tx,
        `UPDATE sentinel.ext_sources SET lease_owner=$2,lease_until=clock_timestamp()+($3::int*interval '1 millisecond'),revision=revision+1,updated_at=clock_timestamp()
         WHERE provider=$1 AND (lease_until IS NULL OR lease_until<=clock_timestamp())
         RETURNING etag,watermark,feed_version,blocked_until,last_success_at,record_count,consecutive_failures`,
        [provider, workerId, leaseMs],
      );
      const row = r.rows[0];
      if (!row) return null;
      return {
        provider,
        etag: row.etag,
        watermark: iso(row.watermark),
        feedVersion: row.feed_version,
        blockedUntil: iso(row.blocked_until),
        lastSuccessAt: iso(row.last_success_at),
        recordCount: Number(row.record_count),
        consecutiveFailures: Number(row.consecutive_failures),
      } satisfies SourceState;
    });
  }
  async release(provider: Provider) {
    await this.db.transaction((tx) =>
      this.q(
        tx,
        "UPDATE sentinel.ext_sources SET lease_owner=NULL,lease_until=NULL WHERE provider=$1",
        [provider],
      ),
    );
  }
  /** OSV records not re-read for a day, oldest first, so withdrawals and updates are picked up. */
  async osvStale(limit: number) {
    return this.db.transaction(async (tx) =>
      (
        await this.q(
          tx,
          "SELECT source_id FROM sentinel.ext_advisories WHERE provider='osv' AND retrieved_at<clock_timestamp()-interval '24 hours' ORDER BY retrieved_at LIMIT $1",
          [limit],
        )
      ).rows.map((r) => r.source_id as string),
    );
  }
  async totalAdvisories() {
    return this.db.transaction(async (tx) =>
      Number(
        (
          await this.q(
            tx,
            "SELECT COALESCE(sum(record_count),0)::int AS n FROM sentinel.ext_sources",
          )
        ).rows[0].n,
      ),
    );
  }
  async startRun(
    provider: Provider,
    trigger: "manual" | "scheduled",
    workerId: string,
  ) {
    const runId = randomUUID();
    await this.db.transaction((tx) =>
      this.q(
        tx,
        "INSERT INTO sentinel.ext_runs(run_id,provider,trigger,status,worker_id) VALUES($1,$2,$3,'running',$4)",
        [runId, provider, trigger, workerId],
      ),
    );
    return runId;
  }
  /** Last-known-good data is never touched here; success fields move only when `success` is true. */
  async finish(
    provider: Provider,
    runId: string,
    outcome: {
      status: RunStatus;
      errorCode: string | null;
      counters: RunCounters;
      success: boolean;
      etag?: string | null;
      watermark?: string | null;
      feedVersion?: string | null;
      blockedUntil?: string | null;
    },
  ) {
    const c = outcome.counters;
    await this.db.transaction(async (tx) => {
      await this.q(
        tx,
        `UPDATE sentinel.ext_runs SET status=$2,finished_at=clock_timestamp(),http_status=$3,requests=$4,bytes=$5,records_seen=$6,records_changed=$7,records_rejected=$8,error_code=$9 WHERE run_id=$1`,
        [
          runId,
          outcome.status,
          c.httpStatus,
          Math.min(c.requests, 1000),
          c.bytes,
          c.recordsSeen,
          c.recordsChanged,
          c.recordsRejected,
          outcome.errorCode,
        ],
      );
      const hadSuccess = (
        await this.q(
          tx,
          "SELECT last_success_at IS NOT NULL AS had FROM sentinel.ext_sources WHERE provider=$1",
          [provider],
        )
      ).rows[0]?.had;
      const partial = outcome.status === "partial";
      const status: SourceStatus = outcome.success
        ? "ok"
        : partial
          ? "partial"
          : outcome.status === "rate_limited"
            ? "rate_limited"
            : hadSuccess
              ? "degraded"
              : "failed";
      await this.q(
        tx,
        `UPDATE sentinel.ext_sources SET status=$2,last_attempt_at=clock_timestamp(),
          last_success_at=CASE WHEN $3 THEN clock_timestamp() ELSE last_success_at END,
          last_error_code=$4,consecutive_failures=CASE WHEN $3 THEN 0 WHEN $12::boolean THEN consecutive_failures ELSE LEAST(consecutive_failures+1,100000) END,
          etag=CASE WHEN $5::boolean THEN $6 ELSE etag END,
          watermark=CASE WHEN $7::boolean THEN $8::timestamptz ELSE watermark END,
          feed_version=CASE WHEN $9::boolean THEN $10 ELSE feed_version END,
          blocked_until=$11::timestamptz,lease_owner=NULL,lease_until=NULL,revision=revision+1,updated_at=clock_timestamp(),
          record_count=(SELECT count(*)::int FROM sentinel.ext_advisories WHERE provider=$1)
         WHERE provider=$1`,
        [
          provider,
          status,
          outcome.success,
          outcome.errorCode,
          outcome.etag !== undefined,
          outcome.etag ?? null,
          outcome.watermark !== undefined,
          outcome.watermark ?? null,
          outcome.feedVersion !== undefined,
          outcome.feedVersion ?? null,
          outcome.blockedUntil ?? null,
          partial,
        ],
      );
    });
  }
  /** Idempotent chunk upsert. Returns the number of changed records (unchanged ones only refresh last_seen/retrieved). */
  async upsertChunk(records: NormalizedAdvisory[], retrievedAt: string) {
    if (!records.length) return 0;
    return this.db.transaction(async (tx) => {
      const provider = records[0].provider;
      const keys = records.map((r) => r.sourceId);
      const existing = new Map(
        (
          await this.q(
            tx,
            "SELECT source_id,content_hash FROM sentinel.ext_advisories WHERE provider=$1 AND source_id=ANY($2::text[])",
            [provider, keys],
          )
        ).rows.map((r) => [r.source_id as string, r.content_hash as string]),
      );
      const hashes = new Map(records.map((r) => [r.sourceId, hashOf(r)]));
      const changed = records.filter(
        (r) => hashes.get(r.sourceId) !== existing.get(r.sourceId),
      );
      const unchanged = records
        .filter((r) => !changed.includes(r))
        .map((r) => r.sourceId);
      if (unchanged.length)
        await this.q(
          tx,
          "UPDATE sentinel.ext_advisories SET last_seen_at=clock_timestamp(),retrieved_at=$3 WHERE provider=$1 AND source_id=ANY($2::text[])",
          [provider, unchanged, retrievedAt],
        );
      if (!changed.length) return 0;
      const canonical = await this.resolveCanonical(tx, changed);
      const rows = changed.map((r) => ({
        provider: r.provider,
        source_id: r.sourceId,
        canonical_id: canonical.get(`${r.provider}:${r.sourceId}`),
        ident: r.ident,
        status: r.status,
        title: r.title,
        summary: r.summary,
        severity: r.severity,
        cvss_vector: r.cvssVector,
        cvss_score: r.cvssScore,
        kev: r.kev,
        published_at: r.publishedAt,
        modified_at: r.modifiedAt,
        withdrawn_at: r.withdrawnAt,
        source_url: r.sourceUrl,
        feed_version: r.feedVersion,
        retrieved_at: retrievedAt,
        raw_sha256: r.rawSha256,
        content_hash: hashes.get(r.sourceId),
      }));
      const written = await this.q(
        tx,
        `INSERT INTO sentinel.ext_advisories(provider,source_id,canonical_id,ident,status,title,summary,severity,cvss_vector,cvss_score,kev,published_at,modified_at,withdrawn_at,source_url,feed_version,retrieved_at,raw_sha256,content_hash)
         SELECT provider,source_id,canonical_id,ident,status,title,summary,severity,cvss_vector,cvss_score,kev,published_at,modified_at,withdrawn_at,source_url,feed_version,retrieved_at,raw_sha256,content_hash
         FROM jsonb_to_recordset($1::jsonb) AS x(provider text,source_id text,canonical_id text,ident text[],status text,title text,summary text,severity text,cvss_vector text,cvss_score numeric,kev jsonb,published_at timestamptz,modified_at timestamptz,withdrawn_at timestamptz,source_url text,feed_version text,retrieved_at timestamptz,raw_sha256 text,content_hash text)
         ON CONFLICT(provider,source_id) DO UPDATE SET canonical_id=EXCLUDED.canonical_id,ident=EXCLUDED.ident,status=EXCLUDED.status,title=EXCLUDED.title,summary=EXCLUDED.summary,
          severity=EXCLUDED.severity,cvss_vector=EXCLUDED.cvss_vector,cvss_score=EXCLUDED.cvss_score,kev=EXCLUDED.kev,published_at=EXCLUDED.published_at,modified_at=EXCLUDED.modified_at,
          withdrawn_at=EXCLUDED.withdrawn_at,source_url=EXCLUDED.source_url,feed_version=EXCLUDED.feed_version,retrieved_at=EXCLUDED.retrieved_at,raw_sha256=EXCLUDED.raw_sha256,
          content_hash=EXCLUDED.content_hash,revision=sentinel.ext_advisories.revision+1,last_seen_at=clock_timestamp()
         RETURNING source_id,revision`,
        [JSON.stringify(rows)],
      );
      const revisions = new Map(
        written.rows.map((r) => [r.source_id as string, Number(r.revision)]),
      );
      const changedKeys = changed.map((r) => r.sourceId);
      await this.q(
        tx,
        "DELETE FROM sentinel.ext_affected WHERE provider=$1 AND source_id=ANY($2::text[])",
        [provider, changedKeys],
      );
      const affected = changed.flatMap((r) =>
        r.affected.slice(0, 200).map((a: AffectedPackage, idx) => ({
          provider: r.provider,
          source_id: r.sourceId,
          idx,
          ecosystem: a.ecosystem,
          package_name: a.packageName,
          ranges: a.ranges,
          versions: a.versions,
          fixed: a.fixed,
          certainty: a.certainty,
        })),
      );
      if (affected.length)
        await this.q(
          tx,
          `INSERT INTO sentinel.ext_affected(provider,source_id,idx,ecosystem,package_name,ranges,versions,fixed,certainty)
           SELECT provider,source_id,idx,ecosystem,package_name,ranges,versions,fixed,certainty
           FROM jsonb_to_recordset($1::jsonb) AS x(provider text,source_id text,idx smallint,ecosystem text,package_name text,ranges jsonb,versions text[],fixed text[],certainty text)`,
          [JSON.stringify(affected)],
        );
      const history = changed.map((r) => ({
        provider: r.provider,
        source_id: r.sourceId,
        revision: revisions.get(r.sourceId),
        modified_at: r.modifiedAt,
        content_hash: hashes.get(r.sourceId),
        retrieved_at: retrievedAt,
        snapshot: snapshotOf(r),
      }));
      await this.q(
        tx,
        `INSERT INTO sentinel.ext_history(provider,source_id,revision,modified_at,content_hash,retrieved_at,snapshot)
         SELECT provider,source_id,revision,modified_at,content_hash,retrieved_at,snapshot
         FROM jsonb_to_recordset($1::jsonb) AS x(provider text,source_id text,revision integer,modified_at timestamptz,content_hash text,retrieved_at timestamptz,snapshot jsonb)`,
        [JSON.stringify(history)],
      );
      await this.q(
        tx,
        `DELETE FROM sentinel.ext_history h USING sentinel.ext_advisories a WHERE h.provider=a.provider AND h.source_id=a.source_id
         AND a.provider=$1 AND a.source_id=ANY($2::text[]) AND h.revision<=a.revision-$3`,
        [provider, changedKeys, catalogLimits.historyKeep],
      );
      return changed.length;
    });
  }
  /**
   * Alias-aware grouping: connected components over shared identifiers, canonical = min identifier (CVE < GHSA < other).
   * Whole existing clusters are loaded so a merge never splits a previously joined group.
   */
  private async resolveCanonical(
    tx: TransactionContext,
    changed: NormalizedAdvisory[],
  ) {
    const provider = changed[0].provider;
    const replacing = changed.map((r) => r.sourceId);
    const idents = [...new Set(changed.flatMap((r) => r.ident))];
    const near = await this.q(
      tx,
      "SELECT DISTINCT canonical_id FROM sentinel.ext_advisories WHERE ident && $1::text[]",
      [idents],
    );
    const cluster = await this.q(
      tx,
      `SELECT provider,source_id,canonical_id,ident FROM sentinel.ext_advisories
       WHERE (canonical_id=ANY($1::text[]) OR ident && $2::text[]) AND NOT (provider=$3 AND source_id=ANY($4::text[]))`,
      [near.rows.map((r) => r.canonical_id), idents, provider, replacing],
    );
    type Node = { key: string; ident: string[]; current: string | null };
    const nodes: Node[] = [
      ...cluster.rows.map((r) => ({
        key: `${r.provider}:${r.source_id}`,
        ident: r.ident as string[],
        current: r.canonical_id as string,
      })),
      ...changed.map((r) => ({
        key: `${r.provider}:${r.sourceId}`,
        ident: r.ident,
        current: null,
      })),
    ];
    const parent = nodes.map((_, i) => i);
    const find = (i: number): number =>
      parent[i] === i ? i : (parent[i] = find(parent[i]));
    const owner = new Map<string, number>();
    nodes.forEach((n, i) =>
      n.ident.forEach((id) => {
        const o = owner.get(id);
        if (o === undefined) owner.set(id, i);
        else parent[find(i)] = find(o);
      }),
    );
    // Existing rows already sharing a canonical id stay together even if their identifiers no longer overlap directly.
    const byCanonical = new Map<string, number>();
    nodes.forEach((n, i) => {
      if (!n.current) return;
      const o = byCanonical.get(n.current);
      if (o === undefined) byCanonical.set(n.current, i);
      else parent[find(i)] = find(o);
    });
    const groups = new Map<number, Node[]>();
    nodes.forEach((n, i) =>
      groups.set(find(i), [...(groups.get(find(i)) ?? []), n]),
    );
    const result = new Map<string, string>();
    const moved: {
      provider: string;
      source_id: string;
      canonical_id: string;
    }[] = [];
    for (const members of groups.values()) {
      const canonical = pickCanonical(members.flatMap((m) => m.ident));
      for (const m of members) {
        result.set(m.key, canonical);
        if (m.current && m.current !== canonical) {
          const [p, ...rest] = m.key.split(":");
          moved.push({
            provider: p,
            source_id: rest.join(":"),
            canonical_id: canonical,
          });
        }
      }
    }
    if (moved.length)
      await this.q(
        tx,
        `UPDATE sentinel.ext_advisories a SET canonical_id=x.canonical_id FROM jsonb_to_recordset($1::jsonb) AS x(provider text,source_id text,canonical_id text)
         WHERE a.provider=x.provider AND a.source_id=x.source_id`,
        [JSON.stringify(moved)],
      );
    return result;
  }
  /** KEV is a full snapshot: records no longer published are marked, never deleted. */
  async markRemoved(provider: Provider, keep: string[]) {
    return this.db.transaction(async (tx) => {
      const r = await this.q(
        tx,
        `UPDATE sentinel.ext_advisories SET status='removed_from_source',last_seen_at=clock_timestamp()
         WHERE provider=$1 AND status='active' AND NOT (source_id=ANY($2::text[]))`,
        [provider, keep],
      );
      return r.rowCount ?? 0;
    });
  }
  /** GHSA ids that OSV has not been asked about yet (oldest-checked first so 404s cannot starve the queue). */
  async osvCandidates(limit: number) {
    return this.db.transaction(async (tx) =>
      (
        await this.q(
          tx,
          `SELECT source_id FROM sentinel.ext_advisories a WHERE provider='ghsa' AND status='active'
           AND NOT EXISTS(SELECT 1 FROM sentinel.ext_advisories o WHERE o.provider='osv' AND o.ident && a.ident)
           ORDER BY osv_checked_at NULLS FIRST,modified_at DESC NULLS LAST LIMIT $1`,
          [limit],
        )
      ).rows.map((r) => r.source_id as string),
    );
  }
  async markOsvChecked(ids: string[]) {
    if (ids.length)
      await this.db.transaction((tx) =>
        this.q(
          tx,
          "UPDATE sentinel.ext_advisories SET osv_checked_at=clock_timestamp() WHERE provider='ghsa' AND source_id=ANY($1::text[])",
          [ids],
        ),
      );
  }
  /** Providers whose last attempt is older than the interval and which are not backed off or leased. */
  async due(intervalMs: number) {
    return this.db.transaction(async (tx) =>
      (
        await this.q(
          tx,
          `SELECT provider FROM sentinel.ext_sources WHERE (blocked_until IS NULL OR blocked_until<=clock_timestamp())
           AND (lease_until IS NULL OR lease_until<=clock_timestamp())
           AND (last_attempt_at IS NULL OR last_attempt_at<=clock_timestamp()-(CASE status
             WHEN 'partial' THEN LEAST($1::int,60000) WHEN 'failed' THEN LEAST($1::int,1800000) WHEN 'degraded' THEN LEAST($1::int,1800000) ELSE $1::int END)*interval '1 millisecond')
           ORDER BY provider`,
          [intervalMs],
        )
      ).rows.map((r) => r.provider as Provider),
    );
  }
  async retain() {
    await this.db.transaction((tx) =>
      this.q(
        tx,
        `DELETE FROM sentinel.ext_runs r WHERE r.status<>'running' AND (r.started_at<clock_timestamp()-interval '90 days' OR r.run_id NOT IN
         (SELECT run_id FROM (SELECT run_id,row_number() OVER (PARTITION BY provider ORDER BY started_at DESC) AS n FROM sentinel.ext_runs) s WHERE n<=$1))`,
        [catalogLimits.runsKeep],
      ),
    );
  }

  // ---- reads (app + worker) ----
  async sources() {
    return this.db.transaction(async (tx) => {
      const rows = (
        await this.q(tx, "SELECT * FROM sentinel.ext_sources ORDER BY provider")
      ).rows;
      return rows;
    });
  }
  async runs(limit = 12) {
    return this.db.transaction(
      async (tx) =>
        (
          await this.q(
            tx,
            "SELECT * FROM sentinel.ext_runs ORDER BY started_at DESC LIMIT $1",
            [limit],
          )
        ).rows,
    );
  }
  async totals() {
    return this.db.transaction(async (tx) => {
      const r = (
        await this.q(
          tx,
          `SELECT count(DISTINCT canonical_id)::int AS advisories,
            count(DISTINCT canonical_id) FILTER (WHERE kev IS NOT NULL AND status='active')::int AS kev,
            count(DISTINCT canonical_id) FILTER (WHERE status='withdrawn')::int AS withdrawn FROM sentinel.ext_advisories`,
        )
      ).rows[0];
      return {
        advisories: Number(r.advisories),
        kev: Number(r.kev),
        withdrawn: Number(r.withdrawn),
      };
    });
  }
  async list(input: ListInput): Promise<AdvisoryPage> {
    return this.db.transaction(async (tx) => {
      const where: string[] = [];
      const v: unknown[] = [];
      const add = (sql: string, value: unknown) => {
        v.push(value);
        where.push(sql.replace("?", `$${v.length}`));
      };
      if (input.q) {
        v.push(
          normId(input.q) ?? input.q,
          `%${input.q.replace(/[\\%_]/g, "\\$&")}%`,
        );
        where.push(
          `(ident @> ARRAY[$${v.length - 1}::text] OR title ILIKE $${v.length})`,
        );
      }
      if (input.provider) add("provider=?", input.provider);
      if (input.severity) add("severity=?", input.severity);
      if (input.kev) where.push("(kev IS NOT NULL AND status='active')");
      if (input.status) add("status=?", input.status);
      if (input.ecosystem && input.packageName)
        where.push(
          `EXISTS(SELECT 1 FROM sentinel.ext_affected f WHERE f.provider=a.provider AND f.source_id=a.source_id AND f.ecosystem=$${v.push(input.ecosystem)} AND f.package_name=$${v.push(input.packageName)})`,
        );
      const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
      v.push(catalogLimits.pageSize + 1, input.offset);
      const ids = (
        await this.q(
          tx,
          `SELECT canonical_id FROM sentinel.ext_advisories a ${w} GROUP BY canonical_id
           ORDER BY max(modified_at) DESC NULLS LAST,canonical_id LIMIT $${v.length - 1} OFFSET $${v.length}`,
          v,
        )
      ).rows.map((r) => r.canonical_id as string);
      const page = ids.slice(0, catalogLimits.pageSize);
      return {
        items: await this.canonical(tx, page),
        nextOffset:
          ids.length > catalogLimits.pageSize &&
          input.offset + catalogLimits.pageSize <= catalogLimits.maxOffset
            ? input.offset + catalogLimits.pageSize
            : null,
        disclaimer: ADVISORY_DISCLAIMER,
      };
    });
  }
  async detail(rawId: string) {
    const id = normId(rawId) ?? rawId;
    return this.db.transaction(async (tx) => {
      const found = await this.q(
        tx,
        "SELECT canonical_id FROM sentinel.ext_advisories WHERE canonical_id=$1 OR ident @> ARRAY[$1::text] LIMIT 1",
        [id],
      );
      if (!found.rows[0]) return null;
      const [item] = await this.canonical(tx, [found.rows[0].canonical_id]);
      const history = (
        await this.q(
          tx,
          `SELECT h.provider,h.source_id,h.revision,h.modified_at,h.content_hash,h.retrieved_at FROM sentinel.ext_history h
           JOIN sentinel.ext_advisories a ON a.provider=h.provider AND a.source_id=h.source_id WHERE a.canonical_id=$1 ORDER BY h.retrieved_at DESC,h.revision DESC LIMIT 40`,
          [found.rows[0].canonical_id],
        )
      ).rows.map((r) => ({
        provider: r.provider as Provider,
        sourceId: r.source_id as string,
        revision: Number(r.revision),
        modifiedAt: iso(r.modified_at),
        contentHash: r.content_hash as string,
        retrievedAt: iso(r.retrieved_at)!,
      }));
      return { advisory: item, history, disclaimer: ADVISORY_DISCLAIMER };
    });
  }
  async canonical(
    tx: TransactionContext,
    ids: string[],
  ): Promise<CanonicalAdvisory[]> {
    if (!ids.length) return [];
    const rows = (
      await this.q(
        tx,
        "SELECT * FROM sentinel.ext_advisories WHERE canonical_id=ANY($1::text[])",
        [ids],
      )
    ).rows;
    const affected = (
      await this.q(
        tx,
        `SELECT f.* FROM sentinel.ext_affected f JOIN sentinel.ext_advisories a ON a.provider=f.provider AND a.source_id=f.source_id
         WHERE a.canonical_id=ANY($1::text[]) ORDER BY f.provider,f.source_id,f.idx`,
        [ids],
      )
    ).rows;
    const byKey = new Map<string, AffectedPackage[]>();
    for (const f of affected)
      byKey.set(`${f.provider}:${f.source_id}`, [
        ...(byKey.get(`${f.provider}:${f.source_id}`) ?? []),
        {
          ecosystem: f.ecosystem,
          packageName: f.package_name,
          ranges: f.ranges,
          versions: f.versions,
          fixed: f.fixed,
          certainty: f.certainty,
        },
      ]);
    const out = new Map<string, CanonicalAdvisory>();
    for (const r of rows) {
      const a: AdvisoryAssertion = {
        provider: r.provider,
        sourceId: r.source_id,
        status: r.status,
        title: r.title,
        summary: r.summary,
        severity: r.severity,
        cvssVector: r.cvss_vector,
        cvssScore: r.cvss_score === null ? null : Number(r.cvss_score),
        kev: r.kev,
        publishedAt: iso(r.published_at),
        modifiedAt: iso(r.modified_at),
        withdrawnAt: iso(r.withdrawn_at),
        sourceUrl: r.source_url,
        retrievedAt: iso(r.retrieved_at)!,
        feedVersion: r.feed_version,
        rawSha256: r.raw_sha256,
        revision: Number(r.revision),
        affected: byKey.get(`${r.provider}:${r.source_id}`) ?? [],
        ident: r.ident,
      };
      const c = out.get(r.canonical_id) ?? {
        canonicalId: r.canonical_id,
        aliases: [],
        kev: false,
        topSeverity: "unknown" as Severity,
        modifiedAt: null,
        assertions: [] as AdvisoryAssertion[],
        conflicting: false,
      };
      c.assertions.push(a);
      c.aliases = [...new Set([...c.aliases, ...a.ident])]
        .filter((x) => x !== r.canonical_id)
        .sort();
      c.kev ||= a.kev !== null && a.status === "active";
      if (rank(a.severity) > rank(c.topSeverity)) c.topSeverity = a.severity;
      if (a.modifiedAt && (!c.modifiedAt || a.modifiedAt > c.modifiedAt))
        c.modifiedAt = a.modifiedAt;
      out.set(r.canonical_id, c);
    }
    for (const c of out.values()) c.conflicting = disagree(c.assertions);
    return ids
      .map((id) => out.get(id))
      .filter((x): x is CanonicalAdvisory => !!x);
  }
}
/** Two providers assert different ranges for the same package: surfaced to the user, never merged. */
export function disagree(assertions: AdvisoryAssertion[]) {
  const seen = new Map<string, string>();
  for (const a of assertions)
    for (const f of a.affected) {
      if (f.certainty !== "verified") continue;
      const key = `${f.ecosystem}:${f.packageName}`;
      const sig = JSON.stringify([f.ranges, [...f.versions].sort()]);
      const prev = seen.get(key);
      if (prev !== undefined && prev !== sig) return true;
      seen.set(key, sig);
    }
  return false;
}
