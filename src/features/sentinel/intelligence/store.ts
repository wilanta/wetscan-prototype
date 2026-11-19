import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import { PlatformDatabase } from "../../../platform/database";
import type { TransactionContext } from "../platform-contracts";
import type {
  SentinelEventV1,
  SentinelProjectContext,
  SentinelScope,
} from "../types";
import type { EventKind } from "../detection/model";
import { DetectionStore } from "../detection/store";
import { definition } from "../detection/validation";
import { TelemetryError } from "../telemetry/validation";
import {
  GROUPING_VERSION,
  INTEL_SIMILARITY_DISCLAIMER,
  GROUPING_WINDOW_DAYS,
  intelLimits,
  type CaseEvidenceRef,
  type IntelAuditAction,
  type IntelAuditRecord,
  type IntelCase,
  type IntelCaseDetail,
  type IntelOverview,
  type RuleCandidate,
} from "./model";
import {
  caseSignature,
  extractIndicators,
  groupCases,
  proposeRule,
  type GroupableCase,
} from "./grouping";
import { caseTransitions, intelCommand, type IntelQuery } from "./validation";

const where = "mode=$1 AND workspace_id=$2 AND project_id=$3";
const scopeValues = (s: SentinelScope) => [s.mode, s.workspaceId, s.projectId];
const iso = (v: unknown) => new Date(v as string).toISOString();
const isoOrNull = (v: unknown) => (v ? iso(v) : null);

const caseSelect = `SELECT c.*,i.status AS inc_status,i.revision AS inc_revision,(i.incident_id IS NOT NULL) AS inc_present,
  (SELECT count(*)::int FROM sentinel.intel_case_evidence e WHERE e.mode=c.mode AND e.workspace_id=c.workspace_id AND e.project_id=c.project_id AND e.case_id=c.case_id) AS ev_total,
  (SELECT count(*)::int FROM sentinel.intel_case_evidence e JOIN sentinel.telemetry_events t ON t.mode=e.mode AND t.workspace_id=e.workspace_id AND t.project_id=e.project_id AND t.source_id=e.source_id AND t.event_id=e.event_id WHERE e.mode=c.mode AND e.workspace_id=c.workspace_id AND e.project_id=c.project_id AND e.case_id=c.case_id) AS ev_available
  FROM sentinel.intel_cases c LEFT JOIN sentinel.incidents i ON i.mode=c.mode AND i.workspace_id=c.workspace_id AND i.project_id=c.project_id AND i.incident_id=c.incident_id`;
const candidateSelect = `SELECT c.*,rv.status AS rule_status,
  COALESCE((SELECT array_agg(cc.case_id::text ORDER BY cc.case_id) FROM sentinel.intel_candidate_cases cc WHERE cc.mode=c.mode AND cc.workspace_id=c.workspace_id AND cc.project_id=c.project_id AND cc.candidate_id=c.candidate_id),'{}') AS case_ids
  FROM sentinel.intel_candidates c
  LEFT JOIN sentinel.detection_rules r ON r.mode=c.mode AND r.workspace_id=c.workspace_id AND r.project_id=c.project_id AND r.rule_id=c.promoted_rule_id
  LEFT JOIN sentinel.detection_rule_versions rv ON rv.mode=r.mode AND rv.workspace_id=r.workspace_id AND rv.project_id=r.project_id AND rv.rule_id=r.rule_id AND rv.version=r.current_version`;

function caseView(
  r: QueryResultRow,
  scope: SentinelScope,
  refs?: CaseEvidenceRef[],
): IntelCase {
  const total = Number(r.ev_total),
    available = Number(r.ev_available);
  return {
    ...scope,
    schemaVersion: 1,
    caseId: r.case_id,
    incidentId: r.incident_id,
    sourceId: r.source_id,
    ruleId: r.rule_id,
    ruleVersion: Number(r.rule_version),
    title: r.title,
    category: r.category,
    severity: r.severity,
    origin: r.origin,
    incidentStatusAtArchive: r.incident_status_at_archive,
    incidentRevisionAtArchive: Number(r.incident_revision_at_archive),
    incidentFirstObservedAt: iso(r.incident_first_observed_at),
    incidentLastObservedAt: iso(r.incident_last_observed_at),
    indicators: r.indicators,
    signature: r.signature ?? null,
    groupingVersion: 1,
    tags: r.tags,
    status: r.status,
    shelfState: r.shelf_state,
    archivedBy: r.archived_by,
    archivedAt: iso(r.archived_at),
    updatedAt: iso(r.updated_at),
    revision: Number(r.revision),
    incidentPinned:
      r.shelf_state === "active" && r.status !== "dismissed" && r.inc_present,
    incident: r.inc_present
      ? {
          state: "available",
          status: r.inc_status,
          revision: Number(r.inc_revision),
          changedSinceArchive:
            Number(r.inc_revision) !== Number(r.incident_revision_at_archive),
        }
      : { state: "expired" },
    evidence: {
      total,
      available,
      missing: total - available,
      state:
        !total || !available
          ? "unavailable"
          : available === total
            ? "complete"
            : "partial",
    },
    ...(refs ? { evidenceRefs: refs } : {}),
  };
}

function candidateView(r: QueryResultRow, scope: SentinelScope): RuleCandidate {
  return {
    ...scope,
    schemaVersion: 1,
    candidateId: r.candidate_id,
    origin: r.origin,
    signature: r.signature,
    groupingVersion: 1,
    definition: definition(r.definition),
    basis: r.basis,
    reviewStatus: r.review_status,
    reviewedBy: r.reviewed_by ?? null,
    reviewedAt: isoOrNull(r.reviewed_at),
    reviewReason: r.review_reason ?? null,
    validatedBy: r.validated_by ?? null,
    validatedAt: isoOrNull(r.validated_at),
    promotedRuleId: r.promoted_rule_id ?? null,
    promotedBy: r.promoted_by ?? null,
    promotedAt: isoOrNull(r.promoted_at),
    ruleStatus: r.rule_status ?? null,
    proposedBy: r.proposed_by,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    revision: Number(r.revision),
    caseIds: r.case_ids,
  };
}

function auditView(r: QueryResultRow, scope: SentinelScope): IntelAuditRecord {
  return {
    ...scope,
    schemaVersion: 1,
    auditId: r.audit_id,
    caseId: r.case_id ?? null,
    candidateId: r.candidate_id ?? null,
    sequence: Number(r.sequence),
    action: r.action,
    actorId: r.actor_id,
    revision: Number(r.revision),
    summary: r.summary,
    note: r.note ?? null,
    recordedAt: iso(r.recorded_at),
  };
}

export interface ArchiveExpectation {
  sourceId: string;
  category: string;
  origin: string;
  evidenceIds: string[];
}

export class IntelligenceStore {
  private readonly detection: DetectionStore;
  constructor(readonly db: PlatformDatabase) {
    this.detection = new DetectionStore(db);
  }

  async overview(
    context: SentinelProjectContext,
    query: IntelQuery = {},
  ): Promise<IntelOverview> {
    const s = scopeValues(context.scope);
    return this.db.scoped(context.scope, async (tx) => {
      const filters: string[] = [];
      const params: unknown[] = [...s];
      const add = (sql: string, v: unknown) => {
        params.push(v);
        filters.push(sql.replace("?", `$${params.length}`));
      };
      if (query.status) add("c.status=?", query.status);
      if (query.shelf) add("c.shelf_state=?", query.shelf);
      if (query.category) add("c.category=?", query.category);
      if (query.origin) add("c.origin=?", query.origin);
      if (query.tag) add("?=ANY(c.tags)", query.tag);
      if (query.q)
        add(
          "(c.title ILIKE ? ESCAPE '\\')",
          `%${query.q.replace(/[\\%_]/g, "\\$&")}%`,
        );
      const caseRows = (
        await this.db.query(
          tx,
          `${caseSelect} WHERE c.mode=$1 AND c.workspace_id=$2 AND c.project_id=$3${filters.map((f) => ` AND ${f}`).join("")} ORDER BY c.archived_at DESC,c.case_id DESC LIMIT 100`,
          params,
        )
      ).rows;
      const groupable = (
        await this.db.query(
          tx,
          `SELECT case_id,incident_id,source_id,origin,category,severity,signature,incident_first_observed_at,incident_last_observed_at,indicators,status,shelf_state FROM sentinel.intel_cases WHERE ${where} ORDER BY archived_at DESC,case_id DESC LIMIT ${intelLimits.casesPerProject}`,
          s,
        )
      ).rows.map((r): GroupableCase => ({
        caseId: r.case_id,
        incidentId: r.incident_id,
        sourceId: r.source_id,
        origin: r.origin,
        category: r.category,
        severity: r.severity,
        signature: r.signature ?? null,
        firstObservedAt: iso(r.incident_first_observed_at),
        lastObservedAt: iso(r.incident_last_observed_at),
        indicators: r.indicators,
        status: r.status,
        shelfState: r.shelf_state,
      }));
      const candidates = (
        await this.db.query(
          tx,
          `${candidateSelect} WHERE c.mode=$1 AND c.workspace_id=$2 AND c.project_id=$3 ORDER BY c.created_at DESC,c.candidate_id DESC LIMIT ${intelLimits.candidatesPerProject}`,
          s,
        )
      ).rows.map((r) => candidateView(r, context.scope));
      const { groups, ungroupedCount } = groupCases(groupable);
      for (const g of groups)
        g.candidateId =
          candidates.find(
            (c) => c.signature === g.groupId && c.groupingVersion === 1,
          )?.candidateId ?? null;
      const archivable = (
        await this.db.query(
          tx,
          `SELECT i.incident_id,i.title,i.category,i.severity,i.status,i.origin,i.last_observed_at FROM sentinel.incidents i WHERE i.mode=$1 AND i.workspace_id=$2 AND i.project_id=$3 AND NOT EXISTS(SELECT 1 FROM sentinel.intel_cases c WHERE c.mode=i.mode AND c.workspace_id=i.workspace_id AND c.project_id=i.project_id AND c.incident_id=i.incident_id) ORDER BY i.last_observed_at DESC,i.incident_id DESC LIMIT 25`,
          s,
        )
      ).rows.map((r) => ({
        incidentId: r.incident_id,
        title: r.title,
        category: r.category,
        severity: r.severity,
        status: r.status,
        origin: r.origin,
        lastObservedAt: iso(r.last_observed_at),
      }));
      const auditRows = (
        await this.db.query(
          tx,
          `SELECT * FROM sentinel.intel_audit WHERE ${where} ORDER BY recorded_at DESC,sequence DESC LIMIT 25`,
          s,
        )
      ).rows;
      return {
        cases: caseRows.map((r) => caseView(r, context.scope)),
        groups,
        ungroupedCount,
        candidates,
        archivableIncidents: archivable,
        audit: auditRows.map((r) => auditView(r, context.scope)),
        grouping: {
          version: GROUPING_VERSION,
          windowDays: GROUPING_WINDOW_DAYS,
          disclaimer: INTEL_SIMILARITY_DISCLAIMER,
        },
        aiExplanation: {
          configured: false,
          status: "disabled",
          reason:
            "No AI provider is configured. No case or evidence data is sent to any model.",
        },
      };
    });
  }

  async detail(
    context: SentinelProjectContext,
    caseId: string,
  ): Promise<IntelCaseDetail> {
    const s = scopeValues(context.scope);
    return this.db.scoped(context.scope, async (tx) => {
      const view = await this.fetchCase(tx, context.scope, caseId, true);
      const audit = (
        await this.db.query(
          tx,
          `SELECT * FROM sentinel.intel_audit WHERE ${where} AND case_id=$4 ORDER BY sequence DESC LIMIT 100`,
          [...s, caseId],
        )
      ).rows;
      const candidates = (
        await this.db.query(
          tx,
          `${candidateSelect} WHERE c.mode=$1 AND c.workspace_id=$2 AND c.project_id=$3 AND EXISTS(SELECT 1 FROM sentinel.intel_candidate_cases m WHERE m.mode=c.mode AND m.workspace_id=c.workspace_id AND m.project_id=c.project_id AND m.candidate_id=c.candidate_id AND m.case_id=$4) ORDER BY c.created_at DESC`,
          [...s, caseId],
        )
      ).rows;
      return {
        case: view,
        audit: audit.map((r) => auditView(r, context.scope)),
        candidates: candidates.map((r) => candidateView(r, context.scope)),
      };
    });
  }

  command(
    context: SentinelProjectContext,
    input: { action: "archive"; incidentId: string },
  ): Promise<{ case: IntelCase; deduplicated: boolean }>;
  command(
    context: SentinelProjectContext,
    input: { action: "propose"; groupId: string },
  ): Promise<{ candidate: RuleCandidate; deduplicated: boolean }>;
  command(
    context: SentinelProjectContext,
    input: { action: "promote"; candidateId: string; expectedRevision: number },
  ): Promise<{
    candidate: RuleCandidate;
    ruleId: string | null;
    ruleStatus: "DRAFT";
    automaticallyEnabled: false;
  }>;
  command(
    context: SentinelProjectContext,
    input: {
      action: "review" | "validate";
      candidateId: string;
      expectedRevision: number;
      decision?: "approve" | "reject";
      reason?: string;
    },
  ): Promise<{ candidate: RuleCandidate }>;
  command(
    context: SentinelProjectContext,
    input: {
      action: "tag" | "annotate" | "set_status" | "set_shelf";
      caseId: string;
      expectedRevision?: number;
      tags?: string[];
      note?: string;
      status?: string;
      shelfState?: string;
    },
  ): Promise<{ case: IntelCase }>;
  command(context: SentinelProjectContext, input: unknown): Promise<unknown>;
  async command(
    context: SentinelProjectContext,
    input: unknown,
  ): Promise<unknown> {
    const c = intelCommand(input);
    const s = scopeValues(context.scope);
    return this.db.scoped(context.scope, async (tx) => {
      await this.lockBinding(tx, s);
      if (c.action === "archive")
        return this.archiveTx(tx, context, c.incidentId);
      if (c.action === "propose") return this.proposeTx(tx, context, c.groupId);
      if (
        c.action === "review" ||
        c.action === "validate" ||
        c.action === "promote"
      )
        return this.candidateTx(tx, context, c);

      const row = (
        await this.db.query(
          tx,
          `SELECT * FROM sentinel.intel_cases WHERE ${where} AND case_id=$4 FOR UPDATE`,
          [...s, c.caseId],
        )
      ).rows[0];
      if (!row) throw new TelemetryError("not_found", 404);
      if (c.action === "annotate") {
        await this.audit(
          tx,
          context,
          { caseId: c.caseId },
          "case_annotated",
          Number(row.revision),
          "Investigator annotation added.",
          c.note,
        );
        return { case: await this.fetchCase(tx, context.scope, c.caseId) };
      }
      if (Number(row.revision) !== c.expectedRevision)
        throw new TelemetryError("revision_conflict", 409);
      if (Number(row.revision) >= intelLimits.revisions)
        throw new TelemetryError("revision_capacity", 409);
      const next = Number(row.revision) + 1;
      let set: string;
      let value: unknown;
      let action: IntelAuditAction;
      let summary: string;
      if (c.action === "tag") {
        set = "tags=$5::text[]";
        value = c.tags;
        action = "case_tagged";
        summary = `Tags set to [${c.tags.join(", ")}].`;
      } else if (c.action === "set_status") {
        if (
          !caseTransitions[row.status as keyof typeof caseTransitions].includes(
            c.status,
          )
        )
          throw new TelemetryError("invalid_transition", 409);
        set = "status=$5";
        value = c.status;
        action = "case_status_changed";
        summary = `Case review status ${row.status} -> ${c.status}. Source incident state is unchanged.`;
      } else {
        if (row.shelf_state === c.shelfState)
          throw new TelemetryError("invalid_transition", 409);
        set = "shelf_state=$5";
        value = c.shelfState;
        action = "case_shelf_changed";
        summary =
          c.shelfState === "shelved"
            ? "Case shelved: set aside from grouping and source-incident retention pin released. Not a resolution."
            : "Case returned to active shelf.";
      }
      await this.db.query(
        tx,
        `UPDATE sentinel.intel_cases SET ${set},revision=$6,updated_at=clock_timestamp() WHERE ${where} AND case_id=$4 AND revision=$7`,
        [...s, c.caseId, value, next, c.expectedRevision],
      );
      await this.audit(
        tx,
        context,
        { caseId: c.caseId },
        action,
        next,
        summary,
      );
      return { case: await this.fetchCase(tx, context.scope, c.caseId) };
    });
  }

  /** Port entry (S07 CaseLibraryPort): the DB, not the candidate payload, is the authority; mismatches are rejected. */
  async archiveFromHandoff(
    context: SentinelProjectContext,
    incidentId: string,
    expect: ArchiveExpectation,
  ) {
    return this.db.scoped(context.scope, async (tx) => {
      await this.lockBinding(tx, scopeValues(context.scope));
      return this.archiveTx(tx, context, incidentId, expect);
    });
  }

  private async lockBinding(tx: TransactionContext, s: unknown[]) {
    // Serializes with ingest, detection, incident retention and every other Intelligence command for this project.
    const binding = await this.db.query(
      tx,
      `SELECT project_id FROM sentinel.project_bindings WHERE ${where} AND enabled FOR UPDATE`,
      s,
    );
    if (!binding.rowCount)
      throw new TelemetryError("project_not_registered", 409);
  }

  private async archiveTx(
    tx: TransactionContext,
    context: SentinelProjectContext,
    incidentId: string,
    expect?: ArchiveExpectation,
  ) {
    const s = scopeValues(context.scope);
    const incident = (
      await this.db.query(
        tx,
        `SELECT i.*,v.definition->>'name' AS rule_name FROM sentinel.incidents i JOIN sentinel.detection_rule_versions v ON i.mode=v.mode AND i.workspace_id=v.workspace_id AND i.project_id=v.project_id AND i.rule_id=v.rule_id AND i.rule_version=v.version WHERE i.mode=$1 AND i.workspace_id=$2 AND i.project_id=$3 AND i.incident_id=$4`,
        [...s, incidentId],
      )
    ).rows[0];
    const existing = (
      await this.db.query(
        tx,
        `SELECT case_id FROM sentinel.intel_cases WHERE ${where} AND incident_id=$4`,
        [...s, incidentId],
      )
    ).rows[0];
    if (existing) {
      const view = await this.fetchCase(
        tx,
        context.scope,
        existing.case_id,
        true,
      );
      // A replay through the typed port must still agree with the stored provenance.
      if (
        expect &&
        (expect.sourceId !== view.sourceId ||
          expect.category !== view.category ||
          expect.origin !== view.origin ||
          !expect.evidenceIds.length ||
          expect.evidenceIds.some(
            (id) => !view.evidenceRefs!.some((r) => r.id === id),
          ))
      )
        throw new TelemetryError("provenance_mismatch", 409);
      return { case: view, deduplicated: true };
    }
    if (!incident) throw new TelemetryError("incident_not_found", 404);
    const evidence = (
      await this.db.query(
        tx,
        `SELECT l.source_id,l.event_id,e.kind,e.occurred_at,e.event FROM sentinel.incident_evidence l JOIN sentinel.telemetry_events e USING(mode,workspace_id,project_id,source_id,event_id) WHERE l.mode=$1 AND l.workspace_id=$2 AND l.project_id=$3 AND l.incident_id=$4 ORDER BY e.occurred_at,l.source_id,l.event_id LIMIT ${intelLimits.evidencePerCase}`,
        [...s, incidentId],
      )
    ).rows;
    if (expect) {
      const actual = new Set(
        evidence.map((e) => `telemetry:${e.source_id}:${e.event_id}`),
      );
      if (
        expect.sourceId !== incident.source_id ||
        expect.category !== incident.category ||
        expect.origin !== incident.origin ||
        !expect.evidenceIds.length ||
        expect.evidenceIds.some((id) => !actual.has(id))
      )
        throw new TelemetryError("provenance_mismatch", 409);
    }
    const count = Number(
      (
        await this.db.query(
          tx,
          `SELECT count(*)::int AS n FROM sentinel.intel_cases WHERE ${where}`,
          s,
        )
      ).rows[0].n,
    );
    if (count >= intelLimits.casesPerProject)
      throw new TelemetryError("case_capacity", 409);
    const alertCount = Number(
      (
        await this.db.query(
          tx,
          `SELECT count(*)::int AS n FROM sentinel.incident_alerts WHERE ${where} AND incident_id=$4`,
          [...s, incidentId],
        )
      ).rows[0].n,
    );
    const first = iso(incident.first_observed_at),
      last = iso(incident.last_observed_at);
    const indicators = extractIndicators({
      ruleName: incident.rule_name ?? incident.title,
      events: evidence.map((e) => ({
        kind: e.kind as EventKind,
        occurredAt: iso(e.occurred_at),
        event: e.event as SentinelEventV1,
      })),
      evidenceCount: evidence.length,
      alertCount,
      firstObservedAt: first,
      lastObservedAt: last,
    });
    const caseId = randomUUID();
    await this.db.query(
      tx,
      `INSERT INTO sentinel.intel_cases(mode,workspace_id,project_id,case_id,incident_id,source_id,rule_id,rule_version,title,category,severity,origin,incident_status_at_archive,incident_revision_at_archive,incident_first_observed_at,incident_last_observed_at,indicators,signature,grouping_version,archived_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,1,$19)`,
      [
        ...s,
        caseId,
        incidentId,
        incident.source_id,
        incident.rule_id,
        incident.rule_version,
        incident.title,
        incident.category,
        incident.severity,
        incident.origin,
        incident.status,
        incident.revision,
        first,
        last,
        JSON.stringify(indicators),
        caseSignature(incident.origin, incident.category, indicators),
        context.actorId,
      ],
    );
    for (const e of evidence)
      await this.db.query(
        tx,
        `INSERT INTO sentinel.intel_case_evidence(mode,workspace_id,project_id,case_id,source_id,event_id,event_kind,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [...s, caseId, e.source_id, e.event_id, e.kind, iso(e.occurred_at)],
      );
    await this.audit(
      tx,
      context,
      { caseId },
      "case_archived",
      1,
      `Incident archived into the case library (incident was ${incident.status} at archive; archival does not imply resolution or neutralization).`,
    );
    return {
      case: await this.fetchCase(tx, context.scope, caseId),
      deduplicated: false,
    };
  }

  private async proposeTx(
    tx: TransactionContext,
    context: SentinelProjectContext,
    groupId: string,
  ) {
    const s = scopeValues(context.scope);
    const rows = (
      await this.db.query(
        tx,
        `SELECT case_id,incident_id,source_id,origin,category,severity,signature,incident_first_observed_at,incident_last_observed_at,indicators,status,shelf_state FROM sentinel.intel_cases WHERE ${where} AND signature=$4`,
        [...s, groupId],
      )
    ).rows.map((r): GroupableCase => ({
      caseId: r.case_id,
      incidentId: r.incident_id,
      sourceId: r.source_id,
      origin: r.origin,
      category: r.category,
      severity: r.severity,
      signature: r.signature,
      firstObservedAt: iso(r.incident_first_observed_at),
      lastObservedAt: iso(r.incident_last_observed_at),
      indicators: r.indicators,
      status: r.status,
      shelfState: r.shelf_state,
    }));
    const group = groupCases(rows).groups[0];
    if (!group) throw new TelemetryError("group_not_found", 404);
    const existing = (
      await this.db.query(
        tx,
        `${candidateSelect} WHERE c.mode=$1 AND c.workspace_id=$2 AND c.project_id=$3 AND c.origin=$4 AND c.signature=$5 AND c.grouping_version=1`,
        [...s, group.origin, group.groupId],
      )
    ).rows[0];
    if (existing)
      return {
        candidate: candidateView(existing, context.scope),
        deduplicated: true,
      };
    const proposal = proposeRule(group);
    if (!proposal.ok) throw new TelemetryError(proposal.error, 422);
    const count = Number(
      (
        await this.db.query(
          tx,
          `SELECT count(*)::int AS n FROM sentinel.intel_candidates WHERE ${where}`,
          s,
        )
      ).rows[0].n,
    );
    if (count >= intelLimits.candidatesPerProject)
      throw new TelemetryError("candidate_capacity", 409);
    const candidateId = randomUUID();
    await this.db.query(
      tx,
      `INSERT INTO sentinel.intel_candidates(mode,workspace_id,project_id,candidate_id,origin,signature,grouping_version,definition,basis,proposed_by) VALUES($1,$2,$3,$4,$5,$6,1,$7::jsonb,$8::jsonb,$9)`,
      [
        ...s,
        candidateId,
        group.origin,
        group.groupId,
        JSON.stringify(proposal.definition),
        JSON.stringify(proposal.basis),
        context.actorId,
      ],
    );
    for (const id of group.caseIds)
      await this.db.query(
        tx,
        `INSERT INTO sentinel.intel_candidate_cases(mode,workspace_id,project_id,candidate_id,case_id) VALUES($1,$2,$3,$4,$5)`,
        [...s, candidateId, id],
      );
    await this.audit(
      tx,
      context,
      { candidateId },
      "candidate_proposed",
      1,
      `DRAFT candidate proposed from ${group.caseIds.length} ${group.origin} cases (grouping v${GROUPING_VERSION}). Not a rule; not enabled.`,
    );
    return {
      candidate: await this.fetchCandidate(tx, context.scope, candidateId),
      deduplicated: false,
    };
  }

  private async candidateTx(
    tx: TransactionContext,
    context: SentinelProjectContext,
    c: Extract<
      ReturnType<typeof intelCommand>,
      { action: "review" | "validate" | "promote" }
    >,
  ) {
    const s = scopeValues(context.scope);
    const row = (
      await this.db.query(
        tx,
        `SELECT * FROM sentinel.intel_candidates WHERE ${where} AND candidate_id=$4 FOR UPDATE`,
        [...s, c.candidateId],
      )
    ).rows[0];
    if (!row) throw new TelemetryError("not_found", 404);
    if (Number(row.revision) !== c.expectedRevision)
      throw new TelemetryError("revision_conflict", 409);
    if (Number(row.revision) >= intelLimits.revisions)
      throw new TelemetryError("revision_capacity", 409);
    const next = Number(row.revision) + 1;
    const key = [...s, c.candidateId, next, c.expectedRevision];
    if (c.action === "review") {
      if (row.review_status !== "DRAFT")
        throw new TelemetryError("invalid_transition", 409);
      const status = c.decision === "approve" ? "APPROVED" : "REJECTED";
      await this.db.query(
        tx,
        `UPDATE sentinel.intel_candidates SET review_status=$7,reviewed_by=$8,reviewed_at=clock_timestamp(),review_reason=$9,revision=$5,updated_at=clock_timestamp() WHERE ${where} AND candidate_id=$4 AND revision=$6`,
        [...key, status, context.actorId, c.reason],
      );
      await this.audit(
        tx,
        context,
        { candidateId: c.candidateId },
        status === "APPROVED" ? "candidate_approved" : "candidate_rejected",
        next,
        `Candidate ${status.toLowerCase()} by a human reviewer. Approval does not validate, promote or enable any rule.`,
        c.reason,
      );
    } else if (c.action === "validate") {
      if (row.review_status !== "APPROVED" || row.validated_at)
        throw new TelemetryError("invalid_transition", 409);
      const d = definition(row.definition);
      if (d.correlation !== "source")
        throw new TelemetryError("actor_identity_not_persisted", 409);
      const members = Number(
        (
          await this.db.query(
            tx,
            `SELECT count(*)::int AS n FROM sentinel.intel_candidate_cases WHERE ${where} AND candidate_id=$4`,
            [...s, c.candidateId],
          )
        ).rows[0].n,
      );
      if (members < 2) throw new TelemetryError("insufficient_cases", 422);
      const rules = Number(
        (
          await this.db.query(
            tx,
            `SELECT count(*)::int AS n FROM sentinel.detection_rules WHERE ${where}`,
            s,
          )
        ).rows[0].n,
      );
      if (rules >= intelLimits.detectionRules)
        throw new TelemetryError("rule_capacity", 409);
      await this.db.query(
        tx,
        `UPDATE sentinel.intel_candidates SET validated_by=$7,validated_at=clock_timestamp(),revision=$5,updated_at=clock_timestamp() WHERE ${where} AND candidate_id=$4 AND revision=$6`,
        [...key, context.actorId],
      );
      await this.audit(
        tx,
        context,
        { candidateId: c.candidateId },
        "candidate_validated",
        next,
        "Definition passed S03 rule validation. Not yet a rule; not enabled.",
      );
    } else {
      if (!row.validated_at || row.promoted_rule_id)
        throw new TelemetryError("invalid_transition", 409);
      const ruleId = await this.detection.createDraftInTx(
        tx,
        context,
        definition(row.definition),
      );
      await this.db.query(
        tx,
        `UPDATE sentinel.intel_candidates SET promoted_rule_id=$7,promoted_by=$8,promoted_at=clock_timestamp(),revision=$5,updated_at=clock_timestamp() WHERE ${where} AND candidate_id=$4 AND revision=$6`,
        [...key, ruleId, context.actorId],
      );
      await this.audit(
        tx,
        context,
        { candidateId: c.candidateId },
        "candidate_promoted",
        next,
        `Created S03 rule ${ruleId} as DRAFT. Enabling requires a separate explicit action in the detection engine.`,
      );
    }
    const candidate = await this.fetchCandidate(
      tx,
      context.scope,
      c.candidateId,
    );
    return c.action === "promote"
      ? {
          candidate,
          ruleId: candidate.promotedRuleId,
          ruleStatus: "DRAFT" as const,
          automaticallyEnabled: false as const,
        }
      : { candidate };
  }

  private async audit(
    tx: TransactionContext,
    context: SentinelProjectContext,
    subject: { caseId?: string; candidateId?: string },
    action: IntelAuditAction,
    revision: number,
    summary: string,
    note?: string,
  ) {
    const s = scopeValues(context.scope);
    const col = subject.caseId ? "case_id" : "candidate_id";
    const id = subject.caseId ?? subject.candidateId;
    // Subject row is locked FOR UPDATE (or just inserted) by the caller, so max+1 cannot race.
    const seq =
      Number(
        (
          await this.db.query(
            tx,
            `SELECT COALESCE(max(sequence),0)::int AS m FROM sentinel.intel_audit WHERE ${where} AND ${col}=$4`,
            [...s, id],
          )
        ).rows[0].m,
      ) + 1;
    if (seq > intelLimits.auditPerSubject)
      throw new TelemetryError("audit_capacity", 409);
    await this.db.query(
      tx,
      `INSERT INTO sentinel.intel_audit(mode,workspace_id,project_id,audit_id,${col},sequence,action,actor_id,revision,summary,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        ...s,
        randomUUID(),
        id,
        seq,
        action,
        context.actorId,
        revision,
        summary.slice(0, 280),
        note ?? null,
      ],
    );
    return seq;
  }

  private async fetchCase(
    tx: TransactionContext,
    scope: SentinelScope,
    caseId: string,
    withRefs = false,
  ): Promise<IntelCase> {
    const s = scopeValues(scope);
    const row = (
      await this.db.query(
        tx,
        `${caseSelect} WHERE c.mode=$1 AND c.workspace_id=$2 AND c.project_id=$3 AND c.case_id=$4`,
        [...s, caseId],
      )
    ).rows[0];
    if (!row) throw new TelemetryError("not_found", 404);
    let refs: CaseEvidenceRef[] | undefined;
    if (withRefs)
      refs = (
        await this.db.query(
          tx,
          `SELECT e.source_id,e.event_id,e.event_kind,e.occurred_at,(t.event_id IS NOT NULL) AS present FROM sentinel.intel_case_evidence e LEFT JOIN sentinel.telemetry_events t ON t.mode=e.mode AND t.workspace_id=e.workspace_id AND t.project_id=e.project_id AND t.source_id=e.source_id AND t.event_id=e.event_id WHERE e.mode=$1 AND e.workspace_id=$2 AND e.project_id=$3 AND e.case_id=$4 ORDER BY e.occurred_at,e.source_id,e.event_id`,
          [...s, caseId],
        )
      ).rows.map((e) => ({
        id: `telemetry:${e.source_id}:${e.event_id}`,
        sourceId: e.source_id,
        eventId: e.event_id,
        kind: e.event_kind,
        occurredAt: iso(e.occurred_at),
        state: e.present ? ("available" as const) : ("missing" as const),
      }));
    return caseView(row, scope, refs);
  }

  private async fetchCandidate(
    tx: TransactionContext,
    scope: SentinelScope,
    candidateId: string,
  ): Promise<RuleCandidate> {
    const row = (
      await this.db.query(
        tx,
        `${candidateSelect} WHERE c.mode=$1 AND c.workspace_id=$2 AND c.project_id=$3 AND c.candidate_id=$4`,
        [...scopeValues(scope), candidateId],
      )
    ).rows[0];
    if (!row) throw new TelemetryError("not_found", 404);
    return candidateView(row, scope);
  }
}
