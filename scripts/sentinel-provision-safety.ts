import { createHash, randomUUID } from "node:crypto";
import { fingerprint } from "../src/platform/identity";
import {
  credentialRoute,
  parseBatch,
} from "../src/features/sentinel/telemetry/validation";
import {
  parseH04CB2PhaseApproval,
  s04DevProjectScope,
  s04DevTarget,
  type PreRecoverySnapshot,
} from "../tests/sentinel/dev-acceptance-safety";
import type { captureReadOnlyDevState } from "./sentinel-dev-acceptance";

export type ProvisionState = Awaited<
  ReturnType<typeof captureReadOnlyDevState>
>;
export type Row = Record<string, unknown>;
export type ResourceIds = {
  sourceId?: string;
  credentialId?: string;
  ruleId?: string;
  batchId?: string;
  eventId?: string;
};
export const sourceDefinition = {
  name: "H04C-B2 Controlled Probe",
  environment: "local",
  origin: "controlled_test",
  retentionDays: 7,
  rateLimit: 1000,
};
export const ruleDefinition = {
  schemaVersion: 1,
  name: "H04C-B2 Controlled 403 Rule",
  description: "Bounded runtime acceptance verification rule.",
  category: "http",
  severity: "high",
  confidence: 95,
  eventKinds: ["http.request"],
  conditions: [
    { field: "request.method", op: "eq", value: "GET" },
    { field: "request.statusCode", op: "eq", value: 403 },
  ],
  correlation: "source",
  windowSeconds: 600,
  threshold: 1,
  cooldownSeconds: 0,
  suppressionWindows: [],
};
export const budgets: Record<string, number> = {
  "sentinel.telemetry_sources": 1,
  "sentinel.telemetry_credentials": 1,
  "sentinel.detection_rules": 1,
  "sentinel.detection_rule_versions": 2,
  "sentinel.detection_audit": 2,
  "sentinel.telemetry_events": 1,
  "sentinel.telemetry_batches": 1,
  "platform.jobs": 1,
};
export const oldRuleId = "7ad1deb8-e555-44ec-be98-b7def574781d";
export const oldIncidentId = "8e8cc956-88cf-585f-ae59-6d47eb6996dc";
export class ProvisionError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export function check(value: unknown, code: string): asserts value {
  if (!value) throw new ProvisionError(code);
}
export function record(value: unknown): Row {
  check(
    value && typeof value === "object" && !Array.isArray(value),
    "response_schema",
  );
  return value as Row;
}
export function exact(value: unknown, keys: string[]): Row {
  const r = record(value);
  check(
    Object.keys(r).sort().join() === [...keys].sort().join(),
    "response_schema",
  );
  return r;
}
export function id(value: unknown): string {
  check(
    typeof value === "string" &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        value,
      ),
    "resource_id",
  );
  return value;
}
export const hash = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
export function validateProvisionApprovals(
  approvals: unknown[],
  nowMs = Date.now(),
) {
  check(approvals.length === 2, "approval_pair");
  const valid = approvals.map((a) =>
    parseH04CB2PhaseApproval(a, "runtime", {
      phase: "provision-ingest",
      maxTtlMs: 600000,
      nowMs,
    }),
  );
  for (const a of valid)
    check(
      a.actions.length === 1 &&
        a.actions[0] === "runtime" &&
        ![
          "detection",
          "incidents",
          "s04RuntimeAcceptance",
          "s03RuntimeAcceptance",
        ].some((k) => k in a),
      "approval_scope",
    );
  return Math.min(...valid.map((a) => Date.parse(a.h04cB2.expiresAt)));
}
export function provisionContext(
  output: string,
  pre: PreRecoverySnapshot,
  paths: { recovery: string; containment: string },
  result: { ids: ResourceIds; preIngestAt: string; occurredAt: string },
) {
  return {
    schemaVersion: 1,
    artifactDir: output,
    origin: "http://localhost:3000",
    recoveryMode: true,
    preRecoveryBaselineFile: paths.recovery,
    containmentFile: paths.containment,
    priorSourceIds: pre.priorSources.map((r) => r.source_id),
    priorRuleIds: pre.priorRules.map((r) => r.rule_id),
    priorAttemptJobIds: pre.priorAttemptJobs.map((j) => j.job_id),
    priorIncidentIds: pre.existingIncidentIds,
    ...result.ids,
    ruleRevision: 2,
    preIngestAt: result.preIngestAt,
    credentialFile:
      output.replace(/[\\/]$/, "") + "/h04c-b2-ingest-credential.secret",
    canaryValues: [
      "canaryPrivateUserSegment987654",
      "canaryQueryToken",
      "canary_secret_reason_must_redact",
      "f".repeat(64),
    ],
    protectedJobIds: pre.protectedJobIds,
    admittedJobIds: [],
    batchIds: [result.ids.batchId],
    eventIds: [result.ids.eventId],
    firstEventOccurredAt: result.occurredAt,
    alertIds: [],
    workerIds: [],
  };
}
const rows = (s: ProvisionState, table: string) =>
  s.rowsByTable[table]?.map((r) => r.row) ?? [];
function scoped(r: Row) {
  check(
    r.mode === "live" &&
      r.workspace_id === s04DevProjectScope.workspaceId &&
      r.project_id === s04DevProjectScope.projectId,
    "row_scope",
  );
}
function subset(before: readonly string[], after: readonly string[]) {
  const counts = new Map<string, number>();
  for (const h of after) counts.set(h, (counts.get(h) ?? 0) + 1);
  for (const h of before) {
    check((counts.get(h) ?? 0) > 0, "historical_row_changed");
    counts.set(h, counts.get(h)! - 1);
  }
}
function same(a: unknown, b: unknown) {
  return fingerprint(a) === fingerprint(b);
}
function baseState(s: ProvisionState, allowApp: boolean) {
  check(
    s.identity.database === s04DevTarget.database &&
      s.identity.marker === s04DevTarget.marker &&
      s.identity.role === "wetscan_migrator" &&
      s.identity.transaction_read_only === "on",
    "database_identity",
  );
  check(
    s.tables.length === 25 &&
      Object.keys(s.rowsByTable).length === 25 &&
      s.ledger.length === 4 &&
      s.s04Indexes.length === 6,
    "database_schema",
  );
  check(
    s.activeLeases === 0 &&
      s.expiredLeases === 0 &&
      s.orphanedTimelineEvidence === 0,
    "runtime_activity",
  );
  check(
    s.liveSessions.every(
      (r) =>
        allowApp &&
        r.datname === "wetscan_dev" &&
        r.usename === "wetscan_app" &&
        r.application_name === "wetscan-sentinel-app",
    ) && s.liveSessions.length <= 5,
    "unexpected_sessions",
  );
  // Verify hashes are paired with the row returned by the same snapshot; callers
  // supply SQL-text hashes, not JSON.stringify hashes (PostgreSQL has its own spacing).
  for (const [table, rr] of Object.entries(s.rowsByTable))
    check(
      rr.length === s.tableCounts[table] &&
        same(
          rr.map((r) => r.hash).sort(),
          [...s.rowHashesByTable[table]].sort(),
        ),
      "snapshot_rows",
    );
}
export function verifyProvisionStart(
  s: ProvisionState,
  pre: PreRecoverySnapshot,
  historical: Record<string, string[]>,
  allowApp = false,
) {
  baseState(s, allowApp);
  check(
    Object.keys(historical).length === 20 &&
      Object.values(historical).reduce((n, a) => n + a.length, 0) === 91,
    "historical_baseline",
  );
  for (const [t, hashes] of Object.entries(historical))
    subset(hashes, s.rowHashesByTable[t] ?? []);
  const versions = rows(s, "sentinel.detection_rule_versions").filter(
    (r) => r.rule_id === oldRuleId,
  );
  const v2 = versions.find((r) => r.version === 2),
    v3 = versions.find((r) => r.version === 3);
  check(
    v2 &&
      v3 &&
      v2.status === "ENABLED" &&
      v3.status === "DISABLED" &&
      v3.enabled_at === null &&
      same(v2.definition, v3.definition) &&
      v3.actor_id === "github-user-187839747",
    "contained_rule_version",
  );
  const oldRule = rows(s, "sentinel.detection_rules").find(
    (r) => r.rule_id === oldRuleId,
  );
  check(oldRule?.current_version === 3, "contained_rule_revision");
  scoped(oldRule);
  exact(oldRule, [
    "mode",
    "workspace_id",
    "project_id",
    "rule_id",
    "current_version",
    "seed_key",
    "created_at",
    "updated_at",
  ]);
  check(
    oldRule.seed_key === null &&
      Number.isFinite(Date.parse(String(oldRule.created_at))) &&
      Number.isFinite(Date.parse(String(oldRule.updated_at))) &&
      Date.parse(String(oldRule.created_at)) <=
        Date.parse(String(oldRule.updated_at)) &&
      Date.parse(String(oldRule.updated_at)) <=
        Date.parse("2026-11-15T17:09:59.103Z"),
    "contained_rule_metadata",
  );
  const audit = rows(s, "sentinel.detection_audit").filter(
    (r) => r.rule_id === oldRuleId && r.version === 3,
  );
  check(
    audit.length === 1 &&
      audit[0].action === "disable" &&
      audit[0].actor_id === "github-user-187839747",
    "contained_rule_audit",
  );
  for (const [t, original] of Object.entries(pre.preRecoveryRowHashesByTable)) {
    const before =
      t === "sentinel.detection_rules"
        ? original.filter((h) => h !== pre.priorRuleRowHashesById?.[oldRuleId])
        : original;
    subset(before, s.rowHashesByTable[t] ?? []);
    const extra = [
      "sentinel.detection_rule_versions",
      "sentinel.detection_audit",
    ].includes(t)
      ? 1
      : 0;
    check(s.tableCounts[t] === original.length + extra, "starting_table_delta");
  }
  check(
    s.jobsInventory.length === 16 &&
      pre.protectedJobIds.length === 8 &&
      pre.historicalCompletedJobIds.length === 6 &&
      pre.priorAttemptJobs.length === 2 &&
      s.workerHeartbeats.length === 8,
    "starting_inventory",
  );
  check(
    s.sources.length === 3 &&
      s.sources.every((r) => !r.enabled && r.active_credentials === 0) &&
      s.rules.length === 3 &&
      s.rules.every((r) => r.status === "DISABLED"),
    "prior_containment",
  );
  check(
    s.existingIncidents.length === 1 &&
      s.existingIncidents[0].incident_id === oldIncidentId,
    "prior_incident",
  );
  const binding = rows(s, "sentinel.project_bindings").filter(
    (r) =>
      r.project_id === s04DevProjectScope.projectId &&
      r.workspace_id === s04DevProjectScope.workspaceId,
  );
  check(
    binding.length === 1 &&
      binding[0].enabled === true &&
      binding[0].actor_id === "github-user-187839747" &&
      binding[0].repository_id === "998736528",
    "project_binding",
  );
}

/** Every existing SQL row must remain byte-identical, including rows in tables
 * which receive new records. Counts alone cannot satisfy this audit. */
export function verifyProvisionDelta(
  start: ProvisionState,
  end: ProvisionState,
  ids: ResourceIds,
  options: {
    partial?: boolean;
    emergency?: boolean;
    allowApp?: boolean;
    credentialHash?: string;
    preIngestAt?: string;
    expectedEvent?: unknown;
  } = {},
) {
  baseState(end, options.allowApp ?? false);
  check(
    same(
      Object.keys(start.rowHashesByTable).sort(),
      Object.keys(end.rowHashesByTable).sort(),
    ),
    "table_inventory",
  );
  const added: Record<string, Row[]> = {};
  let inserts = 0;
  for (const [t, before] of Object.entries(start.rowHashesByTable)) {
    subset(before, end.rowHashesByTable[t] ?? []);
    const old = new Map<string, number>();
    for (const h of before) old.set(h, (old.get(h) ?? 0) + 1);
    added[t] = end.rowsByTable[t]
      .filter((r) => {
        const n = old.get(r.hash) ?? 0;
        if (n) {
          old.set(r.hash, n - 1);
          return false;
        }
        return true;
      })
      .map((r) => r.row);
    const limit =
      (budgets[t] ?? 0) +
      (options.emergency &&
      ["sentinel.detection_rule_versions", "sentinel.detection_audit"].includes(
        t,
      )
        ? 1
        : 0);
    check(
      added[t].length <= limit &&
        (options.partial || added[t].length === limit),
      "mutation_budget",
    );
    inserts += added[t].length;
    for (const row of added[t]) scoped(row);
  }
  check(
    inserts <= (options.emergency ? 12 : 10) &&
      (options.partial || inserts === (options.emergency ? 12 : 10)),
    "insert_budget",
  );
  const one = (t: string) => added[t]?.[0];
  const source = one("sentinel.telemetry_sources");
  if (source) {
    check(
      ids.sourceId &&
        source.source_id === ids.sourceId &&
        source.name === sourceDefinition.name &&
        source.environment === "local" &&
        source.origin === "controlled_test" &&
        source.retention_days === 7 &&
        source.rate_limit === 1000,
      "new_source_identity",
    );
    check(
      options.emergency
        ? Number(source.revision) >= 1 && Number(source.revision) <= 3
        : source.enabled === true && source.revision === 1,
      "new_source_state",
    );
    check(
      Number(source.rate_used) >= 0 && Number(source.rate_used) <= 2,
      "rate_budget",
    );
  }
  const credential = one("sentinel.telemetry_credentials");
  if (credential)
    check(
      credential.source_id === ids.sourceId &&
        credential.credential_id === ids.credentialId &&
        (!options.credentialHash ||
          credential.token_hash === options.credentialHash) &&
        (options.emergency || credential.revoked_at === null),
      "credential_attribution",
    );
  const rule = one("sentinel.detection_rules");
  if (rule)
    check(
      rule.rule_id === ids.ruleId &&
        rule.seed_key === null &&
        (options.partial
          ? [1, 2, ...(options.emergency ? [3] : [])].includes(
              Number(rule.current_version),
            )
          : rule.current_version === (options.emergency ? 3 : 2)),
      "new_rule_state",
    );
  for (const r of added["sentinel.detection_rule_versions"])
    check(
      r.rule_id === ids.ruleId &&
        [1, 2, ...(options.emergency ? [3] : [])].includes(Number(r.version)) &&
        r.status ===
          (
            { 1: "DRAFT", 2: "ENABLED", 3: "DISABLED" } as Record<
              number,
              string
            >
          )[Number(r.version)] &&
        same(r.definition, ruleDefinition) &&
        r.actor_id === "github-user-187839747" &&
        (r.version === 2 ? !!r.enabled_at : r.enabled_at === null),
      "rule_version_attribution",
    );
  for (const r of added["sentinel.detection_audit"])
    check(
      r.rule_id === ids.ruleId &&
        [1, 2, ...(options.emergency ? [3] : [])].includes(Number(r.version)) &&
        r.action ===
          (
            { 1: "create", 2: "enable", 3: "disable" } as Record<number, string>
          )[Number(r.version)] &&
        r.actor_id === "github-user-187839747",
      "rule_audit_attribution",
    );
  if (rule)
    check(
      added["sentinel.detection_rule_versions"].length ===
        rule.current_version &&
        added["sentinel.detection_audit"].length === rule.current_version,
      "rule_history",
    );
  const event = one("sentinel.telemetry_events");
  if (event)
    check(
      event.source_id === ids.sourceId &&
        event.event_id === ids.eventId &&
        event.kind === "http.request" &&
        event.severity === "low" &&
        (!options.expectedEvent || same(event.event, options.expectedEvent)) &&
        !/ws2\.[A-Za-z0-9_-]+\.[a-f0-9]{64}/.test(JSON.stringify(event)),
      "event_attribution",
    );
  const batch = one("sentinel.telemetry_batches");
  if (batch)
    check(
      batch.source_id === ids.sourceId &&
        batch.batch_id === ids.batchId &&
        same(batch.receipt, [{ eventId: ids.eventId, duplicate: false }]),
      "batch_attribution",
    );
  const job = one("platform.jobs");
  if (job)
    check(
      typeof job.job_id === "string" &&
        !start.jobsInventory.some((j) => j.job_id === job.job_id) &&
        job.module === "sentinel" &&
        job.kind === "sentinel.telemetry.accepted" &&
        job.subject_ref === `${ids.sourceId}/${ids.eventId}` &&
        job.idempotency_key === `telemetry:${ids.sourceId}:${ids.eventId}` &&
        job.state === "queued" &&
        job.attempts === 0 &&
        job.revision === 1 &&
        job.max_attempts === 5 &&
        Number(job.fence) === 0 &&
        job.cancel_requested === false &&
        job.lease_owner === null &&
        job.lease_token === null &&
        job.lease_until === null &&
        job.finished_at === null &&
        (!options.preIngestAt ||
          Date.parse(String(job.created_at)) >=
            Date.parse(options.preIngestAt)),
      "job_attribution",
    );
  check(!!event === !!batch && !!event === !!job, "ingestion_atomicity");
  return {
    status: "PASS",
    inserts,
    newQueuedJobIds: job ? [String(job.job_id)] : [],
    oldRowsUnchanged: true,
    deltas: Object.fromEntries(
      Object.entries(added).map(([t, r]) => [t, r.length]),
    ),
  };
}

export interface HttpResult {
  status: number;
  json: unknown;
}
export type JournalEntry = {
  type: "intent" | "response" | "ack" | "uncertain" | "failure";
  operation: string;
  ids: ResourceIds;
  httpStatus?: number;
};
export interface ProvisionDeps {
  origin: string;
  cookie: string;
  start: ProvisionState;
  deadlineMs: number;
  now(): number;
  guard(): Promise<void>;
  capture(): Promise<ProvisionState>;
  request(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
    kind?: "none" | "session" | "invalid" | "bearer",
  ): Promise<HttpResult>;
  journal(entry: JournalEntry): Promise<void>;
  saveSecret(value: string): Promise<void>;
  rememberCredential(value: string): void;
}
function deadline(d: ProvisionDeps) {
  check(d.now() < d.deadlineMs, "deadline_expired");
}
async function operation(
  d: ProvisionDeps,
  ids: ResourceIds,
  name: string,
  fn: () => Promise<HttpResult>,
) {
  deadline(d);
  await d.guard();
  await d.journal({ type: "intent", operation: name, ids: { ...ids } });
  try {
    const result = await fn();
    await d.journal({
      type: "response",
      operation: name,
      ids: { ...ids },
      httpStatus: result.status,
    });
    return result;
  } catch {
    await d.journal({ type: "uncertain", operation: name, ids: { ...ids } });
    throw new ProvisionError("http_outcome_unknown");
  }
}
async function createResources(d: ProvisionDeps, ids: ResourceIds) {
  for (const [path, method, body, kind, status] of [
    ["incidents", "GET", undefined, "none", 401],
    ["foreign", "GET", undefined, "session", 404],
    [
      "bad-origin",
      "POST",
      { action: "investigate", incidentId: randomUUID(), expectedRevision: 1 },
      "session",
      403,
    ],
    ["demo", "GET", undefined, "session", 404],
  ] as const) {
    const res = await operation(d, ids, path, () =>
      d.request(path, method, body, kind),
    );
    check(res.status === status, "http_denial");
    await d.journal({
      type: "ack",
      operation: path,
      ids: {},
      httpStatus: res.status,
    });
  }
  const src = await operation(d, ids, "create-source", () =>
    d.request("sources", "POST", {
      action: "create",
      ownedApplicationConfirmed: true,
      source: sourceDefinition,
    }),
  );
  check(src.status === 201, "source_status");
  const s = exact(src.json, [
    "sourceId",
    "credentialId",
    "credential",
    "showOnce",
  ]);
  ids.sourceId = id(s.sourceId);
  ids.credentialId = id(s.credentialId);
  // Durable positive ID attribution before any next write, including secret storage.
  await d.journal({
    type: "ack",
    operation: "create-source",
    ids: { ...ids },
    httpStatus: 201,
  });
  check(
    typeof s.credential === "string" && s.showOnce === true,
    "credential_response",
  );
  const route = credentialRoute(s.credential);
  check(
    route.sourceId === ids.sourceId &&
      route.credentialId === ids.credentialId &&
      route.workspaceId === s04DevProjectScope.workspaceId &&
      route.projectId === s04DevProjectScope.projectId,
    "credential_scope",
  );
  check(
    !rows(d.start, "sentinel.telemetry_sources").some(
      (r) => r.source_id === ids.sourceId,
    ),
    "resource_collision",
  );
  d.rememberCredential(s.credential);
  await d.saveSecret(s.credential);
  const cr = await operation(d, ids, "create-rule", () =>
    d.request("rules", "POST", {
      action: "create",
      definition: ruleDefinition,
    }),
  );
  check(cr.status === 201, "rule_create_status");
  const c = exact(cr.json, ["ruleId", "revision"]);
  ids.ruleId = id(c.ruleId);
  await d.journal({
    type: "ack",
    operation: "create-rule",
    ids: { ...ids },
    httpStatus: 201,
  });
  check(
    c.revision === 1 &&
      !rows(d.start, "sentinel.detection_rules").some(
        (r) => r.rule_id === ids.ruleId,
      ),
    "rule_create_revision",
  );
  const en = await operation(d, ids, "enable-rule", () =>
    d.request("rules", "POST", {
      action: "enable",
      ruleId: ids.ruleId,
      expectedRevision: 1,
    }),
  );
  check(en.status === 200, "rule_enable_status");
  const e = exact(en.json, ["ruleId", "revision", "status"]);
  check(
    e.ruleId === ids.ruleId && e.revision === 2 && e.status === "ENABLED",
    "rule_enable_revision",
  );
  await d.journal({
    type: "ack",
    operation: "enable-rule",
    ids: { ...ids },
    httpStatus: 200,
  });
  return s.credential as string;
}
/** Resume after a deadline stop: ids and credential come from the failed run's audited journal. */
async function adoptResources(
  d: ProvisionDeps,
  ids: ResourceIds,
  resume: { ids: ResourceIds; credential: string },
) {
  Object.assign(ids, resume.ids);
  check(ids.sourceId && ids.credentialId && ids.ruleId, "resume_ids");
  check(!ids.batchId && !ids.eventId, "resume_ingest_started");
  d.rememberCredential(resume.credential);
  await d.saveSecret(resume.credential);
  await d.journal({ type: "ack", operation: "resume-adopt", ids: { ...ids } });
  return resume.credential;
}
export async function executeProvision(
  d: ProvisionDeps,
  resume?: { ids: ResourceIds; credential: string },
) {
  const ids: ResourceIds = {};
  check(
    d.origin === "http://localhost:3000" &&
      /^wetscan_session=[a-f0-9]{64}$/.test(d.cookie),
    "auth_origin",
  );
  const credential = resume
    ? await adoptResources(d, ids, resume)
    : await createResources(d, ids);
  deadline(d);
  await d.guard();
  const beforeIngest = await d.capture();
  verifyProvisionDelta(d.start, beforeIngest, ids, {
    partial: true,
    allowApp: true,
    credentialHash: hash(credential),
  });
  check(
    Math.abs(Date.parse(beforeIngest.clockNow) - d.now()) <= 5000,
    "clock_drift",
  );
  const preIngestAt = new Date(
    Date.parse(beforeIngest.clockNow) - 500,
  ).toISOString();
  const invalid = await operation(d, ids, "invalid-bearer", () =>
    d.request("ingest", "POST", {}, "invalid"),
  );
  check(invalid.status === 401, "invalid_bearer_status");
  await d.journal({
    type: "ack",
    operation: "invalid-bearer",
    ids: { ...ids },
    httpStatus: 401,
  });
  ids.batchId = randomUUID();
  ids.eventId = randomUUID();
  await d.journal({
    type: "ack",
    operation: "allocate-batch-event",
    ids: { ...ids },
  });
  const occurredAt = new Date(d.now()).toISOString();
  const batch = {
    schemaVersion: 1,
    batchId: ids.batchId,
    sentAt: occurredAt,
    events: [
      {
        schemaVersion: 1,
        eventId: ids.eventId,
        projectId: s04DevProjectScope.projectId,
        occurredAt,
        kind: "http.request",
        severityHint: "low",
        actorHash: "f".repeat(64),
        request: {
          method: "GET",
          routeTemplate:
            "/api/v1/users/canaryPrivateUserSegment987654?token=canaryQueryToken",
          statusCode: 403,
        },
        attributes: {
          reasonCode: "canary_secret_reason_must_redact",
          durationMs: 14,
          controlled: true,
        },
      },
    ],
  };
  const normalized = parseBatch(batch, s04DevProjectScope.projectId, d.now());
  for (const [name, status, duplicate] of [
    ["ingest", 202, false],
    ["batch-replay", 200, true],
  ] as const) {
    const res = await operation(d, ids, name, () =>
      d.request("ingest", "POST", batch, "bearer"),
    );
    check(res.status === status, "ingest_status");
    const b = exact(res.json, ["batchId", "duplicate", "events"]);
    check(
      b.batchId === ids.batchId &&
        b.duplicate === duplicate &&
        same(b.events, [{ eventId: ids.eventId, duplicate: false }]),
      "ingest_receipt",
    );
    await d.journal({
      type: "ack",
      operation: name,
      ids: { ...ids },
      httpStatus: status,
    });
    const state = await d.capture();
    verifyProvisionDelta(d.start, state, ids, {
      allowApp: true,
      credentialHash: hash(credential),
      preIngestAt,
      expectedEvent: normalized.events[0] as unknown as Row,
    });
  }
  deadline(d);
  await d.guard();
  return {
    ids,
    preIngestAt,
    occurredAt,
    expectedEvent: normalized.events[0],
    credentialHash: hash(credential),
  };
}

/** Only acknowledged IDs may be targeted. Lost create responses remain unknown;
 * a database delta is evidence, never permission to guess an ID. */
export async function emergencyContain(
  d: Pick<
    ProvisionDeps,
    "capture" | "request" | "journal" | "guard" | "now" | "deadlineMs"
  >,
  start: ProvisionState,
  ids: ResourceIds,
) {
  check(d.now() < d.deadlineMs, "deadline_expired");
  await d.guard();
  const state = await d.capture();
  verifyProvisionDelta(start, state, ids, {
    partial: true,
    emergency: true,
    allowApp: true,
  });
  const source = rows(state, "sentinel.telemetry_sources").find(
    (r) => r.source_id === ids.sourceId,
  );
  if (source) {
    check(
      source.revision === 1 && source.enabled === true,
      "emergency_source_revision",
    );
    for (const action of ["revoke", "disable"] as const) {
      check(d.now() < d.deadlineMs, "deadline_expired");
      await d.guard();
      await d.journal({
        type: "intent",
        operation: `emergency-${action}`,
        ids: { ...ids },
      });
      let res: HttpResult;
      try {
        res = await d.request("sources", "POST", {
          action,
          sourceId: ids.sourceId,
        });
      } catch {
        await d.journal({
          type: "uncertain",
          operation: `emergency-${action}`,
          ids: { ...ids },
        });
        throw new ProvisionError("emergency_outcome_unknown");
      }
      check(
        res.status === 200 &&
          exact(res.json, ["sourceId"]).sourceId === ids.sourceId,
        "emergency_response",
      );
      await d.journal({
        type: "ack",
        operation: `emergency-${action}`,
        ids: { ...ids },
        httpStatus: 200,
      });
    }
  }
  const rule = rows(state, "sentinel.detection_rules").find(
    (r) => r.rule_id === ids.ruleId,
  );
  if (rule?.current_version === 2) {
    check(d.now() < d.deadlineMs, "deadline_expired");
    await d.guard();
    await d.journal({
      type: "intent",
      operation: "emergency-disable-rule",
      ids: { ...ids },
    });
    let res: HttpResult;
    try {
      res = await d.request("rules", "POST", {
        action: "disable",
        ruleId: ids.ruleId,
        expectedRevision: 2,
      });
    } catch {
      await d.journal({
        type: "uncertain",
        operation: "emergency-disable-rule",
        ids: { ...ids },
      });
      throw new ProvisionError("emergency_outcome_unknown");
    }
    const b = exact(res.json, ["ruleId", "revision", "status"]);
    check(
      res.status === 200 &&
        b.ruleId === ids.ruleId &&
        b.revision === 3 &&
        b.status === "DISABLED",
      "emergency_rule_response",
    );
    await d.journal({
      type: "ack",
      operation: "emergency-disable-rule",
      ids: { ...ids },
      httpStatus: 200,
    });
  }
  const end = await d.capture();
  const audit = verifyProvisionDelta(start, end, ids, {
    partial: true,
    emergency: true,
    allowApp: true,
  });
  const sources = rows(end, "sentinel.telemetry_sources").filter(
      (r) => r.source_id === ids.sourceId,
    ),
    credentials = rows(end, "sentinel.telemetry_credentials").filter(
      (r) => r.source_id === ids.sourceId,
    );
  check(
    sources.every((r) => r.enabled === false && r.revision === 3) &&
      credentials.every((r) => r.revoked_at !== null),
    "emergency_not_contained",
  );
  check(
    rows(end, "sentinel.detection_rules")
      .filter((r) => r.rule_id === ids.ruleId)
      .every((r) => r.current_version === 1 || r.current_version === 3),
    "emergency_rule_active",
  );
  return audit;
}
