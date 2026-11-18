import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import { PlatformDatabase } from "../../../platform/database";
import { PlatformError } from "../../../platform/config";
import type { JobLease, TransactionContext } from "../platform-contracts";
import type {
  SentinelProjectContext,
  SentinelScope,
  StoredSecurityEvent,
} from "../types";
import { fingerprint } from "../../../platform/identity";
import { object, uuid, TelemetryError } from "../telemetry/validation";
import { definition, ruleCommand } from "./validation";
import {
  detectionLimits,
  type DetectionRule,
  type SecurityAlert,
  type AlertPage,
  type Evaluation,
} from "./model";
import { evaluate, eventWindow } from "./evaluator";
import { seedRules } from "./seeds";
import { preciseTime, micros } from "./time";
import { correlateAlertIncident } from "../incidents/store";
import { canonicalScope } from "../scope";

const where = "mode=$1 AND workspace_id=$2 AND project_id=$3";
const scopeValues = (s: SentinelScope) => [s.mode, s.workspaceId, s.projectId];
const iso = (v: unknown) => new Date(v as string).toISOString();
const exactIngest = `to_char(e.ingested_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_ingested_at`;
const rulesSelect = `SELECT r.*,v.version,v.status,v.definition,v.enabled_at,v.actor_id,to_char(v.enabled_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_enabled_at FROM sentinel.detection_rules r JOIN sentinel.detection_rule_versions v ON r.mode=v.mode AND r.workspace_id=v.workspace_id AND r.project_id=v.project_id AND r.rule_id=v.rule_id AND r.current_version=v.version`;
function ruleView(r: QueryResultRow, scope: SentinelScope): DetectionRule {
  const d = definition(r.definition);
  return {
    ...scope,
    schemaVersion: 1,
    ruleId: r.rule_id,
    revision: r.current_version,
    version: r.version,
    status: r.status,
    definition: d,
    actorId: r.actor_id,
    enabledAt: r.enabled_at
      ? preciseTime(r.exact_enabled_at ?? iso(r.enabled_at))
      : null,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    supported: d.correlation !== "actor_hash",
    unsupportedReason:
      d.correlation === "actor_hash" ? "actor_identity_not_persisted" : null,
  };
}
function eventView(
  r: QueryResultRow,
  scope: SentinelScope,
): StoredSecurityEvent {
  return {
    ...scope,
    schemaVersion: 1,
    revision: 1,
    sourceId: r.source_id,
    event: r.event,
    ingestedAt: preciseTime(r.exact_ingested_at ?? iso(r.ingested_at)),
    evidence: {
      id: `telemetry:${r.source_id}:${r.event_id}`,
      sourceId: r.source_id,
      origin: r.origin,
      occurredAt: iso(r.occurred_at),
      recordedAt: iso(r.ingested_at),
    },
  };
}
function alertView(r: QueryResultRow, scope: SentinelScope): SecurityAlert {
  return {
    ...scope,
    schemaVersion: 1,
    alertId: r.alert_id,
    ruleId: r.rule_id,
    ruleVersion: r.rule_version,
    ruleName: r.rule_name,
    sourceId: r.source_id,
    category: r.category,
    severity: r.severity,
    confidence: r.confidence,
    origin: r.origin,
    correlationKey: r.correlation_key,
    windowStart: iso(r.window_start),
    windowEnd: iso(r.window_end),
    firstObservedAt: iso(r.first_observed_at),
    lastObservedAt: iso(r.last_observed_at),
    detectedAt: iso(r.detected_at),
    matchedEventCount: r.matched_event_count,
    deduplicationKey: r.deduplication_key,
    suppressionStatus: "not_suppressed",
  };
}
export class DetectionStore {
  constructor(readonly db: PlatformDatabase) {}
  async rules(context: SentinelProjectContext) {
    return this.db.scoped(context.scope, async (tx) => {
      const rows = (
        await this.db.query(
          tx,
          `${rulesSelect} WHERE r.${where.replaceAll(" AND ", " AND r.")} ORDER BY r.created_at,r.rule_id LIMIT 26`,
          scopeValues(context.scope),
        )
      ).rows;
      if (rows.length > detectionLimits.rules)
        throw new TelemetryError("rule_capacity", 409);
      return rows.map((r) => ruleView(r, context.scope));
    });
  }
  async ruleDetails(context: SentinelProjectContext, ruleId: string) {
    uuid(ruleId);
    return this.db.scoped(context.scope, async (tx) => {
      const s = [...scopeValues(context.scope), ruleId];
      const row = (
        await this.db.query(
          tx,
          `${rulesSelect} WHERE r.mode=$1 AND r.workspace_id=$2 AND r.project_id=$3 AND r.rule_id=$4`,
          s,
        )
      ).rows[0];
      if (!row) throw new TelemetryError("not_found", 404);
      const versions = (
        await this.db.query(
          tx,
          `SELECT version,status,definition,actor_id,enabled_at,created_at FROM sentinel.detection_rule_versions WHERE ${where} AND rule_id=$4 ORDER BY version DESC LIMIT 100`,
          s,
        )
      ).rows;
      const audit = (
        await this.db.query(
          tx,
          `SELECT version,action,actor_id,recorded_at FROM sentinel.detection_audit WHERE ${where} AND rule_id=$4 ORDER BY version DESC LIMIT 100`,
          s,
        )
      ).rows;
      const evaluations = (
        await this.db.query(
          tx,
          `SELECT rule_version,source_id,event_id,outcome,reason,matched,evaluated_at FROM sentinel.detection_evaluations WHERE ${where} AND rule_id=$4 ORDER BY evaluated_at DESC,source_id,event_id LIMIT 50`,
          s,
        )
      ).rows;
      const suppressedEvidence = (
        await this.db.query(
          tx,
          `SELECT rule_version,source_id,event_id,evidence_event_id FROM sentinel.detection_suppressed_evidence WHERE ${where} AND rule_id=$4 ORDER BY rule_version DESC,source_id,event_id,evidence_event_id LIMIT 500`,
          s,
        )
      ).rows;
      return {
        rule: ruleView(row, context.scope),
        versions,
        audit,
        evaluations,
        suppressedEvidence,
      };
    });
  }
  async command(context: SentinelProjectContext, input: unknown) {
    const c = ruleCommand(input);
    return this.db.scoped(context.scope, async (tx) => {
      // Existing binding lock serializes configuration, ingest, detection and retention. Never re-enable a disabled binding implicitly.
      const s = scopeValues(context.scope);
      const binding = await this.db.query(
        tx,
        `SELECT project_id FROM sentinel.project_bindings WHERE ${where} AND enabled FOR UPDATE`,
        s,
      );
      if (!binding.rowCount)
        throw new TelemetryError("project_not_registered", 409);
      const count = Number(
        (
          await this.db.query(
            tx,
            `SELECT count(*)::int AS n FROM sentinel.detection_rules WHERE ${where}`,
            s,
          )
        ).rows[0].n,
      );
      const insert = async (
        d: ReturnType<typeof definition>,
        seedKey: string | null,
        total: number,
      ) => {
        if (total >= detectionLimits.rules)
          throw new TelemetryError("rule_capacity", 409);
        const id = randomUUID();
        await this.db.query(
          tx,
          `INSERT INTO sentinel.detection_rules(mode,workspace_id,project_id,rule_id,current_version,seed_key) VALUES($1,$2,$3,$4,1,$5)`,
          [...s, id, seedKey],
        );
        await this.version(
          tx,
          context,
          id,
          1,
          "DRAFT",
          d,
          seedKey ? "seed" : "create",
        );
        return id;
      };
      if (c.action === "seed") {
        const ids: string[] = [];
        let total = count;
        for (const seed of seedRules) {
          const existing = (
            await this.db.query(
              tx,
              `SELECT rule_id FROM sentinel.detection_rules WHERE ${where} AND seed_key=$4`,
              [...s, seed.key],
            )
          ).rows[0];
          ids.push(
            existing?.rule_id ??
              (await insert(definition(seed.definition), seed.key, total++)),
          );
        }
        return { ruleIds: ids, status: "DRAFT", automaticallyEnabled: false };
      }
      if (c.action === "create")
        return { ruleId: await insert(c.definition, null, count), revision: 1 };
      const row = (
        await this.db.query(
          tx,
          `${rulesSelect} WHERE r.mode=$1 AND r.workspace_id=$2 AND r.project_id=$3 AND r.rule_id=$4`,
          [...s, c.ruleId],
        )
      ).rows[0];
      if (!row) throw new TelemetryError("not_found", 404);
      if (row.current_version !== c.expectedRevision)
        throw new TelemetryError("revision_conflict", 409);
      if (row.current_version >= detectionLimits.versions)
        throw new TelemetryError("version_capacity", 409);
      if (c.action === "update" && row.status === "ENABLED")
        throw new TelemetryError("disable_before_edit", 409);
      if (
        (c.action === "enable" && row.status === "ENABLED") ||
        (c.action === "disable" && row.status !== "ENABLED")
      )
        throw new TelemetryError("invalid_transition", 409);
      const d =
        c.action === "update" ? c.definition : definition(row.definition);
      if (c.action === "enable" && d.correlation === "actor_hash")
        throw new TelemetryError("actor_identity_not_persisted", 409);
      const next = row.current_version + 1,
        status =
          c.action === "enable"
            ? "ENABLED"
            : c.action === "disable"
              ? "DISABLED"
              : "DRAFT";
      await this.version(tx, context, c.ruleId, next, status, d, c.action);
      const updated = await this.db.query(
        tx,
        `UPDATE sentinel.detection_rules SET current_version=$5,updated_at=clock_timestamp() WHERE ${where} AND rule_id=$4 AND current_version=$6 RETURNING rule_id`,
        [...s, c.ruleId, next, c.expectedRevision],
      );
      if (!updated.rowCount) throw new TelemetryError("revision_conflict", 409);
      return { ruleId: c.ruleId, revision: next, status };
    });
  }
  private async version(
    tx: TransactionContext,
    context: SentinelProjectContext,
    id: string,
    version: number,
    status: string,
    d: ReturnType<typeof definition>,
    action: string,
  ) {
    const s = [...scopeValues(context.scope), id, version];
    await this.db.query(
      tx,
      `INSERT INTO sentinel.detection_rule_versions(mode,workspace_id,project_id,rule_id,version,schema_version,status,definition,actor_id,enabled_at) VALUES($1,$2,$3,$4,$5,1,$6,$7::jsonb,$8,CASE WHEN $6='ENABLED' THEN clock_timestamp() ELSE NULL END)`,
      [...s, status, JSON.stringify(d), context.actorId],
    );
    await this.db.query(
      tx,
      `INSERT INTO sentinel.detection_audit(mode,workspace_id,project_id,rule_id,version,action,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [...s, action, context.actorId],
    );
  }
  async alerts(
    context: SentinelProjectContext,
    query: URLSearchParams,
  ): Promise<AlertPage> {
    if (
      [...query.keys()].some(
        (k) =>
          ![
            "sourceId",
            "severity",
            "ruleId",
            "from",
            "to",
            "cursor",
            "limit",
          ].includes(k) || query.getAll(k).length !== 1,
      )
    )
      throw new TelemetryError("invalid_filter");
    const source = query.get("sourceId"),
      rule = query.get("ruleId"),
      severity = query.get("severity");
    if (source !== null) uuid(source);
    if (rule !== null) uuid(rule);
    if (severity !== null && !["low", "medium", "high"].includes(severity))
      throw new TelemetryError("invalid_filter");
    const limit = Number(query.get("limit") ?? 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new TelemetryError("invalid_limit");
    const filter = fingerprint({
      scope: context.scope,
      source,
      rule,
      severity,
    });
    let cursor:
      | { at: string; id: string; from: string; to: string; filter: string }
      | undefined;
    if (query.has("cursor")) {
      try {
        if (query.get("cursor")!.length > 1800) throw Error();
        const v = object(
          JSON.parse(
            Buffer.from(query.get("cursor")!, "base64url").toString("utf8"),
          ),
          ["at", "id", "from", "to", "filter"],
        );
        if (v.filter !== filter) throw Error();
        v.at = preciseTime(v.at);
        v.from = preciseTime(v.from);
        v.to = preciseTime(v.to);
        uuid(v.id);
        cursor = v as unknown as typeof cursor;
      } catch {
        throw new TelemetryError("invalid_cursor");
      }
    }
    return this.db.scoped(context.scope, async (tx) => {
      const to = query.has("to")
        ? preciseTime(query.get("to"))
        : (cursor?.to ??
          preciseTime(
            (
              await this.db.query(
                tx,
                `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS query_now`,
              )
            ).rows[0].query_now,
          ));
      const from = query.has("from")
        ? preciseTime(query.get("from"))
        : (cursor?.from ??
          `${new Date(Date.parse(to) - 86400000).toISOString().slice(0, 19)}${to.slice(19)}`);
      const span = micros(to) - micros(from);
      if (
        span < 0n ||
        span > 31n * 86400000000n ||
        (cursor && (cursor.from !== from || cursor.to !== to))
      )
        throw new TelemetryError("invalid_window");
      const rows = (
        await this.db.query(
          tx,
          `SELECT a.*,v.definition->>'name' AS rule_name,to_char(a.detected_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM sentinel.detection_alerts a JOIN sentinel.detection_rule_versions v ON a.mode=v.mode AND a.workspace_id=v.workspace_id AND a.project_id=v.project_id AND a.rule_id=v.rule_id AND a.rule_version=v.version WHERE a.mode=$1 AND a.workspace_id=$2 AND a.project_id=$3 AND ($4::uuid IS NULL OR a.source_id=$4) AND ($5::uuid IS NULL OR a.rule_id=$5) AND ($6::text IS NULL OR a.severity=$6) AND a.detected_at>=$7 AND a.detected_at<=$8 AND ($9::timestamptz IS NULL OR (a.detected_at,a.alert_id)<($9,$10::uuid)) ORDER BY a.detected_at DESC,a.alert_id DESC LIMIT $11`,
          [
            ...scopeValues(context.scope),
            source,
            rule,
            severity,
            from,
            to,
            cursor?.at ?? null,
            cursor?.id ?? null,
            limit + 1,
          ],
        )
      ).rows;
      const page = rows.slice(0, limit),
        last = page.at(-1);
      return {
        items: page.map((r) => alertView(r, context.scope)),
        window: { from, to },
        nextCursor:
          rows.length > limit && last
            ? Buffer.from(
                JSON.stringify({
                  at: last.cursor_at,
                  id: last.alert_id,
                  from,
                  to,
                  filter,
                }),
              ).toString("base64url")
            : null,
      };
    });
  }
  async alertDetails(context: SentinelProjectContext, alertId: string) {
    uuid(alertId);
    return this.db.scoped(context.scope, async (tx) => {
      const s = [...scopeValues(context.scope), alertId];
      const row = (
        await this.db.query(
          tx,
          `SELECT a.*,v.definition,v.definition->>'name' AS rule_name FROM sentinel.detection_alerts a JOIN sentinel.detection_rule_versions v ON a.mode=v.mode AND a.workspace_id=v.workspace_id AND a.project_id=v.project_id AND a.rule_id=v.rule_id AND a.rule_version=v.version WHERE a.mode=$1 AND a.workspace_id=$2 AND a.project_id=$3 AND a.alert_id=$4`,
          s,
        )
      ).rows[0];
      if (!row) throw new TelemetryError("not_found", 404);
      const evidence = (
        await this.db.query(
          tx,
          `SELECT e.*,s.origin,${exactIngest} FROM sentinel.detection_evidence l JOIN sentinel.telemetry_events e USING(mode,workspace_id,project_id,source_id,event_id) JOIN sentinel.telemetry_sources s USING(mode,workspace_id,project_id,source_id) WHERE l.mode=$1 AND l.workspace_id=$2 AND l.project_id=$3 AND l.alert_id=$4 ORDER BY e.occurred_at,e.source_id,e.event_id LIMIT 500`,
          s,
        )
      ).rows.map((r) => eventView(r, context.scope));
      return {
        alert: alertView(row, context.scope),
        definition: definition(row.definition),
        evidence,
      };
    });
  }
  /** Effects are fenced in one transaction; executor acknowledges separately. A retry reads persisted evaluation identities. */
  async process(
    lease: JobLease,
    signal: AbortSignal,
    options?: { correlateIncidents?: boolean },
  ) {
    if (
      lease.job.module !== "sentinel" ||
      this.db.module !== "sentinel" ||
      lease.job.kind !== "sentinel.telemetry.accepted" ||
      lease.job.mode !== "live"
    )
      throw new PlatformError("scope_denied");
    const parts = lease.job.subjectRef.split("/");
    if (parts.length !== 2) throw new TelemetryError("invalid_job_reference");
    const source = uuid(parts[0]),
      id = uuid(parts[1]),
      cleanScope = canonicalScope(lease.job),
      s = scopeValues(cleanScope);
    return this.db.scoped(cleanScope, async (tx) => {
      this.db.requireWorker(tx);
      const check = () => {
        if (signal.aborted) throw Error("cancelled");
      };
      check();
      const bound = await this.db.query(
        tx,
        `SELECT project_id FROM sentinel.project_bindings WHERE ${where} AND enabled FOR UPDATE`,
        s,
      );
      if (!bound.rowCount) throw new PlatformError("scope_denied");
      const fence = await this.db.query(
        tx,
        `SELECT job_id FROM platform.jobs WHERE module='sentinel' AND ${where} AND job_id=$4 AND kind='sentinel.telemetry.accepted' AND subject_ref=$5 AND lease_owner=$6 AND lease_token=$7 AND state='leased' AND NOT cancel_requested AND lease_until>clock_timestamp() FOR UPDATE`,
        [
          ...s,
          lease.job.jobId,
          lease.job.subjectRef,
          lease.workerId,
          lease.leaseToken,
        ],
      );
      if (!fence.rowCount) throw new PlatformError("lease_lost");
      const row = (
        await this.db.query(
          tx,
          `SELECT e.*,s.origin,${exactIngest} FROM sentinel.telemetry_events e JOIN sentinel.telemetry_sources s USING(mode,workspace_id,project_id,source_id) WHERE e.mode=$1 AND e.workspace_id=$2 AND e.project_id=$3 AND e.source_id=$4 AND e.event_id=$5`,
          [...s, source, id],
        )
      ).rows[0];
      if (!row) throw new TelemetryError("stored_event_missing", 409);
      const anchor = eventView(row, cleanScope);
      const rules = (
        await this.db.query(
          tx,
          `${rulesSelect} WHERE r.mode=$1 AND r.workspace_id=$2 AND r.project_id=$3 ORDER BY r.rule_id LIMIT 26`,
          s,
        )
      ).rows;
      if (rules.length > detectionLimits.rules) throw Error("rule_capacity");
      const outcomes: string[] = [];
      for (const raw of rules) {
        check();
        const rule = ruleView(raw, cleanScope);
        const prior = await this.db.query(
          tx,
          `SELECT outcome FROM sentinel.detection_evaluations WHERE ${where} AND rule_id=$4 AND rule_version=$5 AND source_id=$6 AND event_id=$7`,
          [...s, rule.ruleId, rule.version, source, id],
        );
        if (prior.rows[0]) {
          outcomes.push(prior.rows[0].outcome);
          continue;
        }
        const evaluations = Number(
          (
            await this.db.query(
              tx,
              `SELECT count(*)::int AS n FROM sentinel.detection_evaluations WHERE ${where}`,
              s,
            )
          ).rows[0].n,
        );
        if (evaluations >= detectionLimits.evaluations)
          throw Error("evaluation_history_capacity");
        const w = eventWindow(
          anchor.event.occurredAt,
          rule.definition.windowSeconds,
        );
        const applicable =
          rule.status === "ENABLED" &&
          rule.supported &&
          rule.definition.eventKinds.includes(anchor.event.kind) &&
          !!rule.enabledAt &&
          micros(anchor.ingestedAt) >= micros(rule.enabledAt);
        const candidates = applicable
          ? (
              await this.db.query(
                tx,
                `SELECT e.*,s.origin,${exactIngest} FROM sentinel.telemetry_events e JOIN sentinel.telemetry_sources s USING(mode,workspace_id,project_id,source_id) WHERE e.mode=$1 AND e.workspace_id=$2 AND e.project_id=$3 AND e.source_id=$4 AND e.occurred_at>=$5 AND e.occurred_at<$6 AND e.kind=ANY($7::text[]) AND e.ingested_at>=$8::timestamptz ORDER BY e.occurred_at,e.event_id LIMIT 501`,
                [
                  ...s,
                  source,
                  w.start,
                  w.end,
                  rule.definition.eventKinds,
                  rule.enabledAt,
                ],
              )
            ).rows
          : [];
        const result = evaluate(
          rule,
          anchor,
          candidates.map((r) => eventView(r, cleanScope)),
          signal,
        );
        if (result.matched && result.outcome !== "alert_suppressed")
          await this.persistMatch(
            tx,
            cleanScope,
            rule,
            anchor,
            result,
            options?.correlateIncidents === true,
          );
        await this.db.query(
          tx,
          `INSERT INTO sentinel.detection_evaluations(mode,workspace_id,project_id,rule_id,rule_version,source_id,event_id,outcome,reason,matched,match_key,window_start,window_end) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            ...s,
            rule.ruleId,
            rule.version,
            source,
            id,
            result.outcome,
            result.reason,
            result.matched,
            result.matchKey,
            result.windowStart,
            result.windowEnd,
          ],
        );
        if (result.outcome === "alert_suppressed") {
          const count = Number(
            (
              await this.db.query(
                tx,
                `SELECT count(*)::int AS n FROM sentinel.detection_suppressed_evidence WHERE ${where}`,
                s,
              )
            ).rows[0].n,
          );
          if (
            count + result.evidence.length >
            detectionLimits.suppressedEvidence
          )
            throw Error("suppressed_evidence_capacity");
          await this.db.query(
            tx,
            `INSERT INTO sentinel.detection_suppressed_evidence(mode,workspace_id,project_id,rule_id,rule_version,source_id,event_id,evidence_event_id) SELECT $1,$2,$3,$4,$5,$6,$7,evidence_event_id FROM unnest($8::uuid[]) AS evidence_event_id`,
            [
              ...s,
              rule.ruleId,
              rule.version,
              source,
              id,
              result.evidence.map((e) => e.event.eventId),
            ],
          );
        }
        outcomes.push(result.outcome);
      }
      check();
      const active = await this.db.query(
        tx,
        `SELECT job_id FROM platform.jobs WHERE module='sentinel' AND ${where} AND job_id=$4 AND lease_token=$5 AND state='leased' AND NOT cancel_requested AND lease_until>clock_timestamp()`,
        [...s, lease.job.jobId, lease.leaseToken],
      );
      if (!active.rowCount) throw new PlatformError("lease_lost");
      return outcomes;
    });
  }
  private async persistMatch(
    tx: TransactionContext,
    scope: SentinelScope,
    rule: DetectionRule,
    anchor: StoredSecurityEvent,
    result: Evaluation,
    correlateIncidents = false,
  ) {
    const cleanScope = canonicalScope(scope),
      s = scopeValues(cleanScope),
      source = anchor.sourceId;
    const old = (
      await this.db.query(
        tx,
        `SELECT alert_id FROM sentinel.detection_alerts WHERE ${where} AND deduplication_key=$4`,
        [...s, result.matchKey],
      )
    ).rows[0];
    let alertId = old?.alert_id;
    if (!alertId) {
      const cooling = (
        await this.db.query(
          tx,
          `SELECT last_alert_at>clock_timestamp()-($7::int*interval '1 second') AS active FROM sentinel.detection_cooldowns WHERE ${where} AND rule_id=$4 AND rule_version=$5 AND source_id=$6 AND correlation_key=$8`,
          [
            ...s,
            rule.ruleId,
            rule.version,
            source,
            rule.definition.cooldownSeconds,
            result.correlationKey,
          ],
        )
      ).rows[0];
      if (cooling?.active) {
        result.outcome = "alert_suppressed";
        result.reason = "cooldown";
        return;
      }
      const count = Number(
        (
          await this.db.query(
            tx,
            `SELECT count(*)::int AS n FROM sentinel.detection_alerts WHERE ${where}`,
            s,
          )
        ).rows[0].n,
      );
      if (count >= detectionLimits.alerts) throw Error("alert_capacity");
      alertId = randomUUID();
      await this.db.query(
        tx,
        `INSERT INTO sentinel.detection_alerts(mode,workspace_id,project_id,alert_id,rule_id,rule_version,source_id,schema_version,category,severity,confidence,origin,correlation_key,window_start,window_end,first_observed_at,last_observed_at,matched_event_count,deduplication_key) VALUES($1,$2,$3,$4,$5,$6,$7,1,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          ...s,
          alertId,
          rule.ruleId,
          rule.version,
          source,
          rule.definition.category,
          rule.definition.severity,
          rule.definition.confidence,
          anchor.evidence.origin,
          result.correlationKey,
          result.windowStart,
          result.windowEnd,
          result.evidence[0].event.occurredAt,
          result.evidence.at(-1)!.event.occurredAt,
          result.evidence.length,
          result.matchKey,
        ],
      );
      await this.db.query(
        tx,
        `INSERT INTO sentinel.detection_cooldowns(mode,workspace_id,project_id,rule_id,rule_version,source_id,correlation_key,last_alert_at) VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()) ON CONFLICT(mode,workspace_id,project_id,rule_id,rule_version,source_id,correlation_key) DO UPDATE SET last_alert_at=EXCLUDED.last_alert_at`,
        [...s, rule.ruleId, rule.version, source, result.correlationKey],
      );
    } else {
      result.outcome = "alert_deduplicated";
      result.reason = "existing_window";
    }
    await this.db.query(
      tx,
      `INSERT INTO sentinel.detection_evidence(mode,workspace_id,project_id,alert_id,source_id,event_id) SELECT $1,$2,$3,$4,$5,event_id FROM unnest($6::uuid[]) AS event_id ON CONFLICT DO NOTHING`,
      [...s, alertId, source, result.evidence.map((e) => e.event.eventId)],
    );
    await this.db.query(
      tx,
      `UPDATE sentinel.detection_alerts SET matched_event_count=GREATEST(matched_event_count,$5),first_observed_at=LEAST(first_observed_at,$6),last_observed_at=GREATEST(last_observed_at,$7) WHERE ${where} AND alert_id=$4`,
      [
        ...s,
        alertId,
        result.evidence.length,
        result.evidence[0].event.occurredAt,
        result.evidence.at(-1)!.event.occurredAt,
      ],
    );
    if (correlateIncidents) {
      await correlateAlertIncident(
        this.db,
        tx,
        cleanScope,
        alertId,
        rule,
        anchor,
        result,
      );
    }
  }
}
