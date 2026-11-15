import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import { PlatformDatabase } from "../../../platform/database";
import { PlatformError } from "../../../platform/config";
import { PostgresQueue } from "../../../platform/queue";
import { fingerprint } from "../../../platform/identity";
import { bindProject } from "../storage/projects";
import type {
  SentinelProjectContext,
  SentinelScope,
  StoredSecurityEvent,
} from "../types";
import {
  credentialRoute,
  hash,
  issueCredential,
  kinds,
  limits,
  parseBatch,
  sameHash,
  severities,
  sourceInput,
  TelemetryError,
  timestamp,
  uuid,
  type EventPage,
  type SourceView,
} from "./validation";

const where = "mode=$1 AND workspace_id=$2 AND project_id=$3";
const values = (s: SentinelScope) => [s.mode, s.workspaceId, s.projectId];
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
// Query boundaries must retain PostgreSQL microseconds; event payload normalization stays unchanged.
function queryTimestamp(value: string): string {
  const normalized = timestamp(value);
  const fraction = value.match(/\.(\d+)Z$/)?.[1] ?? "";
  return `${normalized.slice(0, 19)}.${fraction.padEnd(6, "0")}Z`;
}
function microseconds(value: string) {
  return BigInt(Date.parse(value)) * 1000n + BigInt(value.slice(-4, -1));
}
function validateWindow(from: string, to: string) {
  const span = microseconds(to) - microseconds(from);
  if (span < 0n || span > 31n * 86400000000n)
    throw new TelemetryError("invalid_window");
}
function view(r: QueryResultRow, now: number): SourceView {
  const age = r.last_contact_at
    ? now - new Date(r.last_contact_at).getTime()
    : Infinity;
  return {
    schemaVersion: 1,
    mode: "live",
    workspaceId: r.workspace_id,
    projectId: r.project_id,
    sourceId: r.source_id,
    name: r.name,
    origin: r.origin,
    environment: r.environment,
    revision: r.revision,
    enabled: r.enabled,
    activeCredentials: Number(r.active_credentials),
    retentionDays: r.retention_days,
    rateLimit: r.rate_limit,
    lastContactAt: iso(r.last_contact_at),
    lastIngestedAt: iso(r.last_ingested_at),
    status: !r.enabled
      ? "disconnected"
      : !Number(r.active_credentials) || !r.last_contact_at
        ? "not_configured"
        : age <= 120000
          ? "connected"
          : age <= 900000
            ? "stale"
            : "disconnected",
  };
}
export class TelemetryStore {
  constructor(readonly db: PlatformDatabase) {}
  async sources(context: SentinelProjectContext) {
    return this.db.scoped(context.scope, async (tx) => {
      const rows = await this.db.query(
        tx,
        `SELECT s.*,(SELECT count(*)::int FROM sentinel.telemetry_credentials c WHERE c.mode=s.mode AND c.workspace_id=s.workspace_id AND c.project_id=s.project_id AND c.source_id=s.source_id AND c.revoked_at IS NULL) AS active_credentials,clock_timestamp() AS server_now FROM sentinel.telemetry_sources s WHERE ${where} ORDER BY created_at,source_id`,
        values(context.scope),
      );
      return rows.rows.map((r) => view(r, new Date(r.server_now).getTime()));
    });
  }
  async create(context: SentinelProjectContext, input: unknown) {
    const config = sourceInput(input),
      sourceId = randomUUID(),
      credential = issueCredential(context.scope, sourceId);
    await this.db.scoped(context.scope, async (tx) => {
      await bindProject(this.db, tx, context); // Existing binding lock serializes project source creation.
      const count = await this.db.query(
        tx,
        `SELECT count(*)::int AS n FROM sentinel.telemetry_sources WHERE ${where}`,
        values(context.scope),
      );
      if (Number(count.rows[0]?.n) >= limits.sourceCap)
        throw new TelemetryError("source_limit", 409);
      await this.db.query(
        tx,
        `INSERT INTO sentinel.telemetry_sources(mode,workspace_id,project_id,source_id,name,environment,origin,retention_days,rate_limit) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          ...values(context.scope),
          sourceId,
          config.name,
          config.environment,
          config.origin,
          config.retentionDays,
          config.rateLimit,
        ],
      );
      await this.db.query(
        tx,
        `INSERT INTO sentinel.telemetry_credentials(mode,workspace_id,project_id,source_id,credential_id,token_hash) VALUES($1,$2,$3,$4,$5,$6)`,
        [
          ...values(context.scope),
          sourceId,
          credential.route.credentialId,
          credential.digest,
        ],
      );
    });
    return {
      sourceId,
      credential: credential.token,
      credentialId: credential.route.credentialId,
      showOnce: true as const,
    };
  }
  async change(
    context: SentinelProjectContext,
    sourceId: string,
    action: "rotate" | "revoke" | "disable" | "enable",
  ) {
    uuid(sourceId);
    const credential =
      action === "rotate"
        ? issueCredential(context.scope, sourceId)
        : undefined;
    return this.db.scoped(context.scope, async (tx) => {
      const s = [...values(context.scope), sourceId];
      const rows = await this.db.query(
        tx,
        `SELECT enabled FROM sentinel.telemetry_sources WHERE ${where} AND source_id=$4 FOR UPDATE`,
        s,
      );
      if (!rows.rows[0]) throw new TelemetryError("not_found", 404);
      if (credential && !rows.rows[0].enabled)
        throw new TelemetryError("source_disabled", 409);
      if (action === "revoke" || action === "rotate")
        await this.db.query(
          tx,
          `UPDATE sentinel.telemetry_credentials SET revoked_at=clock_timestamp() WHERE ${where} AND source_id=$4 AND revoked_at IS NULL`,
          s,
        );
      if (credential) {
        const count = await this.db.query(
          tx,
          `SELECT count(*)::int AS n FROM sentinel.telemetry_credentials WHERE ${where} AND source_id=$4`,
          s,
        );
        if (Number(count.rows[0]?.n) >= 100)
          throw new TelemetryError("credential_history_limit", 409);
        await this.db.query(
          tx,
          `INSERT INTO sentinel.telemetry_credentials(mode,workspace_id,project_id,source_id,credential_id,token_hash) VALUES($1,$2,$3,$4,$5,$6)`,
          [...s, credential.route.credentialId, credential.digest],
        );
      }
      await this.db.query(
        tx,
        `UPDATE sentinel.telemetry_sources SET enabled=CASE WHEN $5='disable' THEN false WHEN $5='enable' THEN true ELSE enabled END,revision=revision+1 WHERE ${where} AND source_id=$4`,
        [...s, action],
      );
      return credential
        ? {
            sourceId,
            credential: credential.token,
            credentialId: credential.route.credentialId,
            showOnce: true as const,
          }
        : { sourceId };
    });
  }
  async ingest(token: string, input: unknown) {
    const route = credentialRoute(token);
    return this.db.scoped(route, async (tx) => {
      const s = [...values(route), route.sourceId];
      // Routing hints only select a candidate scope. The stored hash/identity is authoritative.
      const rows = await this.db.query(
        tx,
        `SELECT s.*,clock_timestamp() AS server_now FROM sentinel.telemetry_sources s JOIN sentinel.project_bindings p USING(mode,workspace_id,project_id) WHERE s.mode=$1 AND s.workspace_id=$2 AND s.project_id=$3 AND s.source_id=$4 AND s.enabled AND p.enabled FOR UPDATE OF s`,
        s,
      );
      const source = rows.rows[0];
      const key = await this.db.query(
        tx,
        `SELECT token_hash FROM sentinel.telemetry_credentials WHERE ${where} AND source_id=$4 AND credential_id=$5 AND revoked_at IS NULL`,
        [...s, route.credentialId],
      );
      if (
        !source ||
        !sameHash(String(key.rows[0]?.token_hash ?? ""), hash(token))
      )
        throw new TelemetryError("invalid_credential", 401);
      const now = new Date(source.server_now).getTime(),
        batch = parseBatch(input, source.project_id, now),
        digest = fingerprint(batch);
      const used = await this.db.query(
        tx,
        `UPDATE sentinel.telemetry_sources SET rate_window=date_trunc('minute',clock_timestamp()),rate_used=CASE WHEN rate_window=date_trunc('minute',clock_timestamp()) THEN rate_used+$5 ELSE $5 END WHERE ${where} AND source_id=$4 AND (CASE WHEN rate_window=date_trunc('minute',clock_timestamp()) THEN rate_used ELSE 0 END)+$5<=rate_limit RETURNING source_id`,
        [...s, batch.events.length],
      );
      if (!used.rowCount) throw new TelemetryError("rate_limited", 429);
      const previous = await this.db.query(
        tx,
        `SELECT fingerprint,receipt FROM sentinel.telemetry_batches WHERE ${where} AND source_id=$4 AND batch_id=$5`,
        [...s, batch.batchId],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].fingerprint !== digest)
          throw new TelemetryError("replay_conflict", 409);
        return {
          batchId: batch.batchId,
          duplicate: true,
          events: previous.rows[0].receipt,
        };
      }
      // Serialize project-wide capacity checks across different source credentials.
      const binding = await this.db.query(
        tx,
        `SELECT project_id FROM sentinel.project_bindings WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 AND enabled FOR UPDATE`,
        s.slice(0, 3),
      );
      if (!binding.rowCount)
        throw new TelemetryError("invalid_credential", 401);
      const batchCount = await this.db.query(
        tx,
        `SELECT count(*)::int AS n FROM sentinel.telemetry_batches WHERE ${where}`,
        s.slice(0, 3),
      );
      if (Number(batchCount.rows[0]?.n) >= limits.projectBatches)
        throw new TelemetryError("project_batch_limit", 429);
      const count = await this.db.query(
        tx,
        `SELECT count(*)::int AS n FROM sentinel.telemetry_events WHERE ${where}`,
        s.slice(0, 3),
      );
      const receipt: { eventId: string; duplicate: boolean }[] = [];
      for (const event of batch.events) {
        const eventHash = fingerprint(event);
        const old = await this.db.query(
          tx,
          `SELECT fingerprint FROM sentinel.telemetry_events WHERE ${where} AND source_id=$4 AND event_id=$5`,
          [...s, event.eventId],
        );
        if (old.rows[0]) {
          if (old.rows[0].fingerprint !== eventHash)
            throw new TelemetryError("event_conflict", 409);
          receipt.push({ eventId: event.eventId, duplicate: true });
          continue;
        }
        if (
          Number(count.rows[0]?.n) +
            receipt.filter((r) => !r.duplicate).length >=
          limits.projectEvents
        )
          throw new TelemetryError("project_event_limit", 429);
        await this.db.query(
          tx,
          `INSERT INTO sentinel.telemetry_events(mode,workspace_id,project_id,source_id,event_id,kind,severity,occurred_at,fingerprint,event) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
          [
            ...s,
            event.eventId,
            event.kind,
            event.severityHint,
            event.occurredAt,
            eventHash,
            JSON.stringify(event),
          ],
        );
        // Durable S03 seam only; S02 worker deliberately does not claim detection jobs.
        try {
          await new PostgresQueue(this.db).enqueue(tx, {
            ...route,
            schemaVersion: 1,
            module: "sentinel",
            jobId: randomUUID(),
            kind: "sentinel.telemetry.accepted",
            subjectRef: `${route.sourceId}/${event.eventId}`,
            idempotencyKey: `telemetry:${route.sourceId}:${event.eventId}`,
            revision: 1,
            attempts: 0,
            maxAttempts: 5,
            availableAt: new Date(now).toISOString(),
            cancelRequested: false,
          });
        } catch (error) {
          if (error instanceof PlatformError && error.code === "invalid_input")
            throw new TelemetryError("pending_processing_limit", 429);
          throw error;
        }
        receipt.push({ eventId: event.eventId, duplicate: false });
      }
      await this.db.query(
        tx,
        `INSERT INTO sentinel.telemetry_batches(mode,workspace_id,project_id,source_id,batch_id,fingerprint,receipt) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [...s, batch.batchId, digest, JSON.stringify(receipt)],
      );
      await this.db.query(
        tx,
        `UPDATE sentinel.telemetry_sources SET last_contact_at=clock_timestamp(),last_ingested_at=CASE WHEN $5 THEN clock_timestamp() ELSE last_ingested_at END WHERE ${where} AND source_id=$4`,
        [...s, receipt.some((r) => !r.duplicate)],
      );
      return { batchId: batch.batchId, duplicate: false, events: receipt };
    });
  }
  async events(
    context: SentinelProjectContext,
    query: URLSearchParams,
  ): Promise<EventPage> {
    if (
      [...query.keys()].some(
        (k) =>
          ![
            "sourceId",
            "kind",
            "severity",
            "from",
            "to",
            "cursor",
            "limit",
            "eventId",
          ].includes(k),
      ) ||
      [...new Set(query.keys())].some((k) => query.getAll(k).length > 1)
    )
      throw new TelemetryError("invalid_filter");
    const source = query.get("sourceId"),
      kind = query.get("kind"),
      severity = query.get("severity"),
      eventId = query.get("eventId");
    if (source) uuid(source);
    if (eventId) uuid(eventId);
    if (kind && !kinds.includes(kind as (typeof kinds)[number]))
      throw new TelemetryError("invalid_filter");
    if (
      severity &&
      !severities.includes(severity as (typeof severities)[number])
    )
      throw new TelemetryError("invalid_filter");
    const limit = Number(query.get("limit") ?? 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new TelemetryError("invalid_limit");
    const filterHash = fingerprint({
      scope: context.scope,
      source,
      kind,
      severity,
      eventId,
    });
    let cursor:
      | {
          at: string;
          source: string;
          id: string;
          filter: string;
          from: string;
          to: string;
        }
      | undefined;
    if (query.has("cursor")) {
      try {
        const raw = query.get("cursor")!;
        if (raw.length > 1500) throw Error();
        cursor = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
        if (!cursor || cursor.filter !== filterHash) throw Error();
        cursor.at = queryTimestamp(cursor.at);
        cursor.from = queryTimestamp(cursor.from);
        cursor.to = queryTimestamp(cursor.to);
        uuid(cursor.source);
        uuid(cursor.id);
      } catch {
        throw new TelemetryError("invalid_cursor");
      }
    }
    const requestedTo = query.has("to")
      ? queryTimestamp(query.get("to")!)
      : cursor?.to;
    const requestedFrom = query.has("from")
      ? queryTimestamp(query.get("from")!)
      : cursor?.from;
    if (cursor && (cursor.from !== requestedFrom || cursor.to !== requestedTo))
      throw new TelemetryError("invalid_window");
    if (requestedFrom && requestedTo)
      validateWindow(requestedFrom, requestedTo);
    return this.db.scoped(context.scope, async (tx) => {
      // Capture once after committed ingestion, using the same clock as ingested_at.
      // Later pages use the cursor's window, never a fresh host or database timestamp.
      const to =
        requestedTo ??
        queryTimestamp(
          (
            await this.db.query(
              tx,
              `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS query_now`,
            )
          ).rows[0].query_now,
        );
      const from =
        requestedFrom ??
        `${new Date(Date.parse(to) - 86400000).toISOString().slice(0, 19)}.${to.slice(-7)}`;
      validateWindow(from, to);
      const rows = await this.db.query(
        tx,
        `SELECT e.*,s.origin,to_char(e.ingested_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM sentinel.telemetry_events e JOIN sentinel.telemetry_sources s USING(mode,workspace_id,project_id,source_id) WHERE e.mode=$1 AND e.workspace_id=$2 AND e.project_id=$3 AND ($4::uuid IS NULL OR e.source_id=$4) AND ($5::text IS NULL OR e.kind=$5) AND ($6::text IS NULL OR e.severity=$6) AND e.ingested_at>=$7 AND e.ingested_at<=$8 AND ($9::timestamptz IS NULL OR (e.ingested_at,e.source_id,e.event_id)<($9,$10::uuid,$11::uuid)) AND ($12::uuid IS NULL OR e.event_id=$12) ORDER BY e.ingested_at DESC,e.source_id DESC,e.event_id DESC LIMIT $13`,
        [
          ...values(context.scope),
          source,
          kind,
          severity,
          from,
          to,
          cursor?.at ?? null,
          cursor?.source ?? null,
          cursor?.id ?? null,
          eventId,
          limit + 1,
        ],
      );
      const page = rows.rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map((r): StoredSecurityEvent => ({
          schemaVersion: 1,
          revision: 1,
          ...context.scope,
          sourceId: r.source_id,
          ingestedAt: iso(r.ingested_at)!,
          event: r.event,
          evidence: {
            id: `telemetry:${r.source_id}:${r.event_id}`,
            sourceId: r.source_id,
            origin: r.origin,
            occurredAt: iso(r.occurred_at)!,
            recordedAt: iso(r.ingested_at)!,
          },
        })),
        window: { from, to },
        nextCursor:
          rows.rows.length > limit && last
            ? Buffer.from(
                JSON.stringify({
                  at: last.cursor_at,
                  source: last.source_id,
                  id: last.event_id,
                  filter: filterHash,
                  from,
                  to,
                }),
              ).toString("base64url")
            : null,
      };
    });
  }
}

/** Worker-owned, per-project bounded retention. Does not touch source credentials or S01 data. */
export async function retainTelemetry(
  db: PlatformDatabase,
  scope: SentinelScope,
) {
  return db.scoped(scope, async (tx) => {
    db.requireWorker(tx);
    if (db.module !== "sentinel") throw new PlatformError("scope_denied");
    // Existing S01 UPDATE(last_cleanup_at) permits locking this binding, not telemetry rows.
    // Serialize cleanup with other cleanup, hold changes, ingestion and queue enrollment.
    const held = await db.query(
      tx,
      `SELECT retention_hold FROM sentinel.project_bindings WHERE mode=$1 AND workspace_id=$2 AND project_id=$3 FOR UPDATE`,
      values(scope),
    );
    if (!held.rows[0] || held.rows[0].retention_hold)
      return { events: 0, batches: 0 };
    const events = await db.query(
      tx,
      `DELETE FROM sentinel.telemetry_events WHERE ${where} AND (mode,workspace_id,project_id,source_id,event_id) IN (SELECT e.mode,e.workspace_id,e.project_id,e.source_id,e.event_id FROM sentinel.telemetry_events e JOIN sentinel.telemetry_sources s USING(mode,workspace_id,project_id,source_id) WHERE e.mode=$1 AND e.workspace_id=$2 AND e.project_id=$3 AND e.ingested_at<statement_timestamp()-(s.retention_days*interval '1 day') AND NOT EXISTS(SELECT 1 FROM platform.jobs j WHERE j.module='sentinel' AND j.mode=e.mode AND j.workspace_id=e.workspace_id AND j.project_id=e.project_id AND j.subject_ref=e.source_id::text||'/'||e.event_id::text AND j.state IN ('queued','leased')) ORDER BY e.ingested_at,e.source_id,e.event_id LIMIT 100)`,
      values(scope),
    );
    const batches = await db.query(
      tx,
      `DELETE FROM sentinel.telemetry_batches WHERE ${where} AND (mode,workspace_id,project_id,source_id,batch_id) IN (SELECT mode,workspace_id,project_id,source_id,batch_id FROM sentinel.telemetry_batches WHERE ${where} AND recorded_at<statement_timestamp()-interval '1 day' ORDER BY recorded_at,source_id,batch_id LIMIT 100)`,
      values(scope),
    );
    return { events: events.rowCount ?? 0, batches: batches.rowCount ?? 0 };
  });
}
