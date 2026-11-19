import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import { PlatformDatabase } from "../../../platform/database";
import type { TransactionContext } from "../platform-contracts";
import { bindProject } from "../storage/projects";
import type {
  EvidenceRef,
  SentinelProjectContext,
  SentinelScope,
  StoredSecurityEvent,
} from "../types";
import type { DetectionRule, SecurityAlert } from "../detection/model";
import { definition } from "../detection/validation";
import { preciseTime } from "../detection/time";
import type { IncidentStatus, SecurityIncident } from "../incidents/model";
import { TelemetryError, type SourceView } from "../telemetry/validation";
import {
  GHOST_FALSE_POSITIVE_POLICY,
  ghostLimits,
  type GhostAuditAction,
  type GhostAuditRecord,
  type GhostDecoyConnectionStatus,
  type GhostDecoyRecord,
  type GhostOverview,
} from "./model";
import { ghostCommand } from "./validation";

const where = "mode=$1 AND workspace_id=$2 AND project_id=$3";
const scopeValues = (s: SentinelScope) => [s.mode, s.workspaceId, s.projectId];
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

function computeSourceStatus(
  enabled: boolean,
  activeCredentials: number,
  lastContactAt: string | null,
  nowMs: number,
): SourceView["status"] {
  if (!enabled) return "disconnected";
  if (!activeCredentials || !lastContactAt) return "not_configured";
  const age = nowMs - Date.parse(lastContactAt);
  if (age <= 120000) return "connected";
  if (age <= 900000) return "stale";
  return "disconnected";
}

function computeConnectionStatus(
  decoyEnabled: boolean,
  sourceEnabled: boolean,
  sourceStatus: SourceView["status"],
): GhostDecoyConnectionStatus {
  if (!decoyEnabled) return "disabled";
  if (!sourceEnabled) return "disconnected";
  return sourceStatus;
}

function sourceView(r: QueryResultRow, nowMs: number): SourceView {
  const activeCredentials = Number(r.active_credentials);
  const lastContactAt = iso(r.last_contact_at);
  return {
    schemaVersion: 1,
    mode: "live",
    workspaceId: r.workspace_id,
    projectId: r.project_id,
    sourceId: r.source_id,
    name: r.name,
    origin: r.origin,
    environment: r.environment,
    revision: Number(r.revision),
    enabled: Boolean(r.enabled),
    activeCredentials,
    retentionDays: Number(r.retention_days),
    rateLimit: Number(r.rate_limit),
    lastContactAt,
    lastIngestedAt: iso(r.last_ingested_at),
    status: computeSourceStatus(
      Boolean(r.enabled),
      activeCredentials,
      lastContactAt,
      nowMs,
    ),
  };
}

function decoyView(
  r: QueryResultRow,
  scope: SentinelScope,
  nowMs: number,
): GhostDecoyRecord {
  const activeCredentials = Number(r.active_credentials);
  const lastContactAt = iso(r.last_contact_at);
  const sourceEnabled = Boolean(r.source_enabled);
  const sourceStatus = computeSourceStatus(
    sourceEnabled,
    activeCredentials,
    lastContactAt,
    nowMs,
  );
  const enabled = Boolean(r.enabled);
  return {
    ...scope,
    schemaVersion: 1,
    decoyId: r.decoy_id,
    sourceId: r.source_id,
    sourceName: r.source_name,
    name: r.name,
    environment: r.environment,
    origin: r.origin,
    targetRef: r.target_ref,
    decoyPath: r.decoy_path,
    enabled,
    ownedAppConfirmed: Boolean(r.owned_app_confirmed),
    responseStatus: Number(r.response_status) as 200 | 204 | 404,
    rateLimitPerMin: Number(r.rate_limit_per_min),
    h07ProofId: r.h07_proof_id ?? null,
    falsePositiveNotice: r.false_positive_notice,
    revision: Number(r.revision),
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
    lastHitAt: iso(r.last_hit_at),
    sourceEnabled,
    sourceStatus,
    activeCredentials,
    lastContactAt,
    lastIngestedAt: iso(r.last_ingested_at),
    connectionStatus: computeConnectionStatus(
      enabled,
      sourceEnabled,
      sourceStatus,
    ),
  };
}

function auditView(r: QueryResultRow, scope: SentinelScope): GhostAuditRecord {
  return {
    ...scope,
    schemaVersion: 1,
    auditId: r.audit_id,
    decoyId: r.decoy_id,
    sequence: Number(r.sequence),
    action: r.action as GhostAuditAction,
    actorId: r.actor_id,
    revision: Number(r.revision),
    summary: r.summary,
    recordedAt: iso(r.recorded_at)!,
  };
}

function ruleView(r: QueryResultRow, scope: SentinelScope): DetectionRule {
  const d = definition(r.definition);
  return {
    ...scope,
    schemaVersion: 1,
    ruleId: r.rule_id,
    revision: Number(r.current_version),
    version: Number(r.version),
    status: r.status,
    definition: d,
    actorId: r.actor_id,
    enabledAt: r.enabled_at
      ? preciseTime(r.exact_enabled_at ?? iso(r.enabled_at)!)
      : null,
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
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
    ingestedAt: iso(r.ingested_at)!,
    event: r.event,
    evidence: {
      id: `telemetry:${r.source_id}:${r.event_id}`,
      sourceId: r.source_id,
      origin: r.origin,
      occurredAt: iso(r.occurred_at)!,
      recordedAt: iso(r.ingested_at)!,
    },
  };
}

function alertView(r: QueryResultRow, scope: SentinelScope): SecurityAlert {
  return {
    ...scope,
    schemaVersion: 1,
    alertId: r.alert_id,
    ruleId: r.rule_id,
    ruleVersion: Number(r.rule_version),
    ruleName: r.rule_name,
    sourceId: r.source_id,
    category: r.category,
    severity: r.severity,
    confidence: Number(r.confidence),
    origin: r.origin,
    correlationKey: r.correlation_key,
    windowStart: iso(r.window_start)!,
    windowEnd: iso(r.window_end)!,
    firstObservedAt: iso(r.first_observed_at)!,
    lastObservedAt: iso(r.last_observed_at)!,
    detectedAt: iso(r.detected_at)!,
    matchedEventCount: Number(r.matched_event_count),
    deduplicationKey: r.deduplication_key,
    suppressionStatus: "not_suppressed",
  };
}

function incidentView(
  r: QueryResultRow,
  scope: SentinelScope,
  alertIds: string[],
  evidenceRefs: EvidenceRef[],
): SecurityIncident {
  const firstObservedAt = iso(r.first_observed_at)!;
  return {
    ...scope,
    schemaVersion: 1,
    incidentId: r.incident_id,
    sourceId: r.source_id,
    primaryAlertId: r.primary_alert_id,
    ruleId: r.rule_id,
    ruleVersion: Number(r.rule_version),
    ruleName: r.rule_name ?? r.title,
    title: r.title,
    summary: r.summary,
    category: r.category,
    severity: r.severity,
    status: r.status as IncidentStatus,
    verificationStatus: "not_requested",
    archived: false,
    origin: r.origin,
    correlationKey: r.correlation_key,
    deduplicationKey: r.deduplication_key,
    alertIds,
    evidenceIds: evidenceRefs.map((e) => e.id),
    evidenceRefs,
    occurredAt: firstObservedAt,
    firstObservedAt,
    lastObservedAt: iso(r.last_observed_at)!,
    openedAt: iso(r.opened_at)!,
    updatedAt: iso(r.updated_at)!,
    closedAt: r.closed_at ? iso(r.closed_at) : null,
    closedBy: r.closed_by ?? null,
    closeReason: r.close_reason ?? null,
    lastActorId: r.last_actor_id,
    revision: Number(r.revision),
  };
}

const decoySelect = `SELECT d.*,s.name AS source_name,s.enabled AS source_enabled,s.last_contact_at,s.last_ingested_at,
  (SELECT count(*)::int FROM sentinel.telemetry_credentials c WHERE c.mode=d.mode AND c.workspace_id=d.workspace_id AND c.project_id=d.project_id AND c.source_id=d.source_id AND c.revoked_at IS NULL) AS active_credentials,
  (SELECT max(e.ingested_at) FROM sentinel.telemetry_events e WHERE e.mode=d.mode AND e.workspace_id=d.workspace_id AND e.project_id=d.project_id AND e.source_id=d.source_id AND e.kind='ghost.decoy_triggered') AS last_hit_at,
  clock_timestamp() AS server_now
  FROM sentinel.ghost_decoys d
  JOIN sentinel.telemetry_sources s USING(mode,workspace_id,project_id,source_id)`;

export class GhostStore {
  constructor(readonly db: PlatformDatabase) {}

  async overview(context: SentinelProjectContext): Promise<GhostOverview> {
    const s = scopeValues(context.scope);
    return this.db.scoped(context.scope, async (tx) => {
      const decoyRows = (
        await this.db.query(
          tx,
          `${decoySelect} WHERE d.mode=$1 AND d.workspace_id=$2 AND d.project_id=$3 ORDER BY d.created_at,d.decoy_id LIMIT 10`,
          s,
        )
      ).rows;
      const sourceRows = (
        await this.db.query(
          tx,
          `SELECT s.*,(SELECT count(*)::int FROM sentinel.telemetry_credentials c WHERE c.mode=s.mode AND c.workspace_id=s.workspace_id AND c.project_id=s.project_id AND c.source_id=s.source_id AND c.revoked_at IS NULL) AS active_credentials,clock_timestamp() AS server_now FROM sentinel.telemetry_sources s WHERE ${where} ORDER BY created_at,source_id LIMIT 100`,
          s,
        )
      ).rows;
      const ruleRows = (
        await this.db.query(
          tx,
          `SELECT r.*,v.version,v.status,v.definition,v.enabled_at,v.actor_id,to_char(v.enabled_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_enabled_at FROM sentinel.detection_rules r JOIN sentinel.detection_rule_versions v ON r.mode=v.mode AND r.workspace_id=v.workspace_id AND r.project_id=v.project_id AND r.rule_id=v.rule_id AND r.current_version=v.version WHERE r.mode=$1 AND r.workspace_id=$2 AND r.project_id=$3 AND (r.seed_key='controlled-decoy-v1' OR v.definition->'eventKinds' ? 'ghost.decoy_triggered') ORDER BY (r.seed_key='controlled-decoy-v1') DESC,r.created_at,r.rule_id LIMIT 1`,
          s,
        )
      ).rows;
      const hitRows = (
        await this.db.query(
          tx,
          `SELECT e.*,s.origin FROM sentinel.telemetry_events e JOIN sentinel.telemetry_sources s USING(mode,workspace_id,project_id,source_id) WHERE e.mode=$1 AND e.workspace_id=$2 AND e.project_id=$3 AND e.kind='ghost.decoy_triggered' ORDER BY e.ingested_at DESC,e.source_id DESC,e.event_id DESC LIMIT 50`,
          s,
        )
      ).rows;
      const alertRows = (
        await this.db.query(
          tx,
          `SELECT a.*,v.definition->>'name' AS rule_name FROM sentinel.detection_alerts a JOIN sentinel.detection_rule_versions v ON a.mode=v.mode AND a.workspace_id=v.workspace_id AND a.project_id=v.project_id AND a.rule_id=v.rule_id AND a.rule_version=v.version WHERE a.mode=$1 AND a.workspace_id=$2 AND a.project_id=$3 AND a.category='decoy' ORDER BY a.detected_at DESC,a.alert_id DESC LIMIT 25`,
          s,
        )
      ).rows;
      const incidentRows = (
        await this.db.query(
          tx,
          `SELECT i.*,v.definition->>'name' AS rule_name FROM sentinel.incidents i JOIN sentinel.detection_rule_versions v ON i.mode=v.mode AND i.workspace_id=v.workspace_id AND i.project_id=v.project_id AND i.rule_id=v.rule_id AND i.rule_version=v.version WHERE i.mode=$1 AND i.workspace_id=$2 AND i.project_id=$3 AND i.category='decoy' ORDER BY i.last_observed_at DESC,i.incident_id DESC LIMIT 25`,
          s,
        )
      ).rows;
      const incidentIds = incidentRows.map((r) => r.incident_id as string);
      const alertMap = new Map<string, string[]>();
      const evidenceMap = new Map<string, EvidenceRef[]>();
      if (incidentIds.length) {
        const linkedAlerts = (
          await this.db.query(
            tx,
            `SELECT incident_id,alert_id FROM sentinel.incident_alerts WHERE ${where} AND incident_id=ANY($4::uuid[]) ORDER BY linked_at,alert_id`,
            [...s, incidentIds],
          )
        ).rows;
        for (const a of linkedAlerts) {
          const list = alertMap.get(a.incident_id) ?? [];
          list.push(a.alert_id);
          alertMap.set(a.incident_id, list);
        }
        const linkedEvidence = (
          await this.db.query(
            tx,
            `SELECT l.incident_id,e.source_id,e.event_id,s.origin,e.occurred_at,e.ingested_at FROM sentinel.incident_evidence l JOIN sentinel.telemetry_events e USING(mode,workspace_id,project_id,source_id,event_id) JOIN sentinel.telemetry_sources s USING(mode,workspace_id,project_id,source_id) WHERE l.mode=$1 AND l.workspace_id=$2 AND l.project_id=$3 AND l.incident_id=ANY($4::uuid[]) ORDER BY e.occurred_at,e.source_id,e.event_id`,
            [...s, incidentIds],
          )
        ).rows;
        for (const ev of linkedEvidence) {
          const list = evidenceMap.get(ev.incident_id) ?? [];
          list.push({
            id: `telemetry:${ev.source_id}:${ev.event_id}`,
            sourceId: ev.source_id,
            origin: ev.origin,
            occurredAt: iso(ev.occurred_at)!,
            recordedAt: iso(ev.ingested_at)!,
          });
          evidenceMap.set(ev.incident_id, list);
        }
      }
      const auditRows = (
        await this.db.query(
          tx,
          `SELECT * FROM sentinel.ghost_audit WHERE ${where} ORDER BY recorded_at DESC,sequence DESC LIMIT 25`,
          s,
        )
      ).rows;
      const rule = ruleRows[0] ? ruleView(ruleRows[0], context.scope) : null;
      const decoys = decoyRows.map((r) =>
        decoyView(r, context.scope, new Date(r.server_now).getTime()),
      );
      const sources = sourceRows.map((r) =>
        sourceView(r, new Date(r.server_now).getTime()),
      );
      const incidents = incidentRows.map((r) =>
        incidentView(
          r,
          context.scope,
          alertMap.get(r.incident_id) ?? [r.primary_alert_id],
          evidenceMap.get(r.incident_id) ?? [],
        ),
      );
      return {
        decoys,
        sources,
        rule,
        ruleStatus: rule ? rule.status : "not_seeded",
        hits: hitRows.map((r) => eventView(r, context.scope)),
        alerts: alertRows.map((r) => alertView(r, context.scope)),
        incidents,
        audit: auditRows.map((r) => auditView(r, context.scope)),
        falsePositivePolicy: GHOST_FALSE_POSITIVE_POLICY,
        futureS08Archive: {
          available: false,
          reason:
            "S08 Internal Intelligence Case Library is not implemented in S07.",
          eligibleIncidentCount: incidents.length,
        },
      };
    });
  }

  async command(context: SentinelProjectContext, input: unknown) {
    const c = ghostCommand(input);
    const s = scopeValues(context.scope);
    return this.db.scoped(context.scope, async (tx) => {
      if (c.action === "create") {
        await bindProject(this.db, tx, context);
        const count = Number(
          (
            await this.db.query(
              tx,
              `SELECT count(*)::int AS n FROM sentinel.ghost_decoys WHERE ${where}`,
              s,
            )
          ).rows[0].n,
        );
        if (count >= ghostLimits.decoysPerProject)
          throw new TelemetryError("decoy_limit", 409);
        const sourceRow = (
          await this.db.query(
            tx,
            `SELECT source_id,origin,environment FROM sentinel.telemetry_sources WHERE ${where} AND source_id=$4 FOR UPDATE`,
            [...s, c.sourceId],
          )
        ).rows[0];
        if (!sourceRow) throw new TelemetryError("source_not_found", 404);
        const decoyId = randomUUID();
        // Always creates in default-disabled state; activation requires an explicit separate enable command.
        await this.db.query(
          tx,
          `INSERT INTO sentinel.ghost_decoys(mode,workspace_id,project_id,decoy_id,source_id,name,environment,origin,target_ref,decoy_path,enabled,owned_app_confirmed,response_status,rate_limit_per_min,h07_proof_id,false_positive_notice,revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,true,$11,$12,$13,$14,1)`,
          [
            ...s,
            decoyId,
            c.sourceId,
            c.name,
            sourceRow.environment,
            sourceRow.origin,
            c.targetRef,
            c.decoyPath,
            c.responseStatus,
            c.rateLimitPerMin,
            c.h07ProofId,
            GHOST_FALSE_POSITIVE_POLICY,
          ],
        );
        await this.appendAudit(
          tx,
          context,
          decoyId,
          1,
          "created",
          1,
          `Registered disabled decoy ${c.decoyPath} on ${c.targetRef} (${sourceRow.origin}).`,
        );
        return { decoy: await this.fetchDecoy(tx, context.scope, decoyId) };
      }

      const binding = await this.db.query(
        tx,
        `SELECT project_id FROM sentinel.project_bindings WHERE ${where} AND enabled FOR UPDATE`,
        s,
      );
      if (!binding.rowCount)
        throw new TelemetryError("project_not_registered", 409);
      const current = (
        await this.db.query(
          tx,
          `SELECT * FROM sentinel.ghost_decoys WHERE ${where} AND decoy_id=$4 FOR UPDATE`,
          [...s, c.decoyId],
        )
      ).rows[0];
      if (!current) throw new TelemetryError("not_found", 404);
      if (Number(current.revision) !== c.expectedRevision)
        throw new TelemetryError("revision_conflict", 409);
      if (Number(current.revision) >= ghostLimits.revisions)
        throw new TelemetryError("revision_capacity", 409);

      const nextRev = Number(current.revision) + 1;
      if (c.action === "enable") {
        if (current.enabled)
          throw new TelemetryError("invalid_transition", 409);
        const sourceRow = (
          await this.db.query(
            tx,
            `SELECT enabled FROM sentinel.telemetry_sources WHERE ${where} AND source_id=$4 FOR UPDATE`,
            [...s, current.source_id],
          )
        ).rows[0];
        if (!sourceRow || !sourceRow.enabled)
          throw new TelemetryError("source_disabled", 409);
        await this.db.query(
          tx,
          `UPDATE sentinel.ghost_decoys SET enabled=true,revision=$5,updated_at=clock_timestamp() WHERE ${where} AND decoy_id=$4 AND revision=$6`,
          [...s, c.decoyId, nextRev, c.expectedRevision],
        );
        await this.appendAudit(
          tx,
          context,
          c.decoyId,
          nextRev,
          "enabled",
          nextRev,
          `Enabled decoy ${current.decoy_path} for ${current.origin} scope.`,
        );
        return { decoy: await this.fetchDecoy(tx, context.scope, c.decoyId) };
      }

      if (c.action === "disable") {
        if (!current.enabled)
          throw new TelemetryError("invalid_transition", 409);
        await this.db.query(
          tx,
          `UPDATE sentinel.ghost_decoys SET enabled=false,revision=$5,updated_at=clock_timestamp() WHERE ${where} AND decoy_id=$4 AND revision=$6`,
          [...s, c.decoyId, nextRev, c.expectedRevision],
        );
        await this.appendAudit(
          tx,
          context,
          c.decoyId,
          nextRev,
          "disabled",
          nextRev,
          `Disabled decoy ${current.decoy_path}.`,
        );
        return { decoy: await this.fetchDecoy(tx, context.scope, c.decoyId) };
      }

      if (current.enabled) throw new TelemetryError("disable_before_edit", 409);
      const nextName = c.name ?? current.name;
      const nextTarget = c.targetRef ?? current.target_ref;
      const nextPath = c.decoyPath ?? current.decoy_path;
      const nextStatus = c.responseStatus ?? Number(current.response_status);
      const nextRate = c.rateLimitPerMin ?? Number(current.rate_limit_per_min);
      const nextProof =
        c.h07ProofId !== undefined ? c.h07ProofId : current.h07_proof_id;
      await this.db.query(
        tx,
        `UPDATE sentinel.ghost_decoys SET name=$5,target_ref=$6,decoy_path=$7,response_status=$8,rate_limit_per_min=$9,h07_proof_id=$10,revision=$11,updated_at=clock_timestamp() WHERE ${where} AND decoy_id=$4 AND revision=$12`,
        [
          ...s,
          c.decoyId,
          nextName,
          nextTarget,
          nextPath,
          nextStatus,
          nextRate,
          nextProof,
          nextRev,
          c.expectedRevision,
        ],
      );
      await this.appendAudit(
        tx,
        context,
        c.decoyId,
        nextRev,
        "updated",
        nextRev,
        `Updated disabled decoy ${nextPath} (${nextStatus}, ${nextRate}/min).`,
      );
      return { decoy: await this.fetchDecoy(tx, context.scope, c.decoyId) };
    });
  }

  private async appendAudit(
    tx: TransactionContext,
    context: SentinelProjectContext,
    decoyId: string,
    sequence: number,
    action: GhostAuditAction,
    revision: number,
    summary: string,
  ) {
    await this.db.query(
      tx,
      `INSERT INTO sentinel.ghost_audit(mode,workspace_id,project_id,audit_id,decoy_id,sequence,action,actor_id,revision,summary) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        ...scopeValues(context.scope),
        randomUUID(),
        decoyId,
        sequence,
        action,
        context.actorId,
        revision,
        summary.slice(0, 280),
      ],
    );
  }

  private async fetchDecoy(
    tx: TransactionContext,
    scope: SentinelScope,
    decoyId: string,
  ): Promise<GhostDecoyRecord> {
    const row = (
      await this.db.query(
        tx,
        `${decoySelect} WHERE d.mode=$1 AND d.workspace_id=$2 AND d.project_id=$3 AND d.decoy_id=$4`,
        [...scopeValues(scope), decoyId],
      )
    ).rows[0];
    if (!row) throw new TelemetryError("not_found", 404);
    return decoyView(row, scope, new Date(row.server_now).getTime());
  }
}
