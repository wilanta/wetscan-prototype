import { randomUUID } from "node:crypto";
import { fingerprint } from "../../src/platform/identity";
import {
  issueCredential,
  parseBatch,
} from "../../src/features/sentinel/telemetry/validation";
import {
  s04DevProjectScope,
  s04DevTarget,
  type PreRecoverySnapshot,
} from "./dev-acceptance-safety";
import {
  oldIncidentId,
  oldRuleId,
  ruleDefinition,
  sourceDefinition,
  type JournalEntry,
  type ProvisionDeps,
  type ProvisionState,
  type Row,
} from "../../scripts/sentinel-provision-safety";

export const tableNames = [
  "platform.job_attempts",
  "platform.jobs",
  "platform.module_limits",
  "platform.notification_attempts",
  "platform.notification_outbox",
  "platform.schema_migrations",
  "platform.worker_heartbeats",
  "sentinel.detection_alerts",
  "sentinel.detection_audit",
  "sentinel.detection_cooldowns",
  "sentinel.detection_evaluations",
  "sentinel.detection_evidence",
  "sentinel.detection_rule_versions",
  "sentinel.detection_rules",
  "sentinel.detection_suppressed_evidence",
  "sentinel.incident_alerts",
  "sentinel.incident_evidence",
  "sentinel.incident_timeline",
  "sentinel.incident_timeline_evidence",
  "sentinel.incidents",
  "sentinel.project_bindings",
  "sentinel.telemetry_batches",
  "sentinel.telemetry_credentials",
  "sentinel.telemetry_events",
  "sentinel.telemetry_sources",
];
export const scopeRow = {
  mode: "live",
  workspace_id: s04DevProjectScope.workspaceId,
  project_id: s04DevProjectScope.projectId,
};
export const fixedNow = Date.parse("2026-11-16T01:00:00.000Z");
export function fixtureState() {
  const state = {
    identity: {
      database: s04DevTarget.database,
      marker: s04DevTarget.marker,
      role: "wetscan_migrator",
      transaction_read_only: "on",
    },
    ledger: Array.from({ length: 4 }, (_, i) => ({
      version: `000${i + 1}`,
      checksum: "a".repeat(64),
    })),
    tables: tableNames.map((t) => ({
      nspname: t.split(".")[0],
      relname: t.split(".")[1],
    })),
    s04Indexes: Array.from({ length: 6 }, () => ({})),
    jobsInventory: [],
    activeLeases: 0,
    expiredLeases: 0,
    workerHeartbeats: [],
    liveSessions: [],
    sources: [],
    rules: [],
    ruleRowHashesById: {},
    existingIncidents: [],
    orphanedTimelineEvidence: 0,
    clockNow: new Date(fixedNow).toISOString(),
    rowHashesByTable: {},
    rowsByTable: {},
    tableCounts: {},
  } as unknown as ProvisionState;
  for (const t of tableNames) state.rowsByTable[t] = [];
  const put = (t: string, r: Row) =>
    state.rowsByTable[t].push({ hash: fingerprint(r), row: r });
  for (let i = 0; i < 16; i++)
    put("platform.jobs", {
      ...scopeRow,
      job_id: `old-${i}`,
      state: i < 8 ? "queued" : i === 15 ? "failed" : "completed",
      attempts: i < 8 ? 0 : i === 15 ? 5 : 1,
      revision: 1,
    });
  for (let i = 0; i < 8; i++)
    put("platform.worker_heartbeats", {
      module: "sentinel",
      worker_id: `old-worker-${i}`,
      status: "running",
      started_at: "2026-11-14",
      last_seen_at: "2026-11-14",
    });
  for (let i = 0; i < 3; i++) {
    const ruleId = i === 0 ? oldRuleId : randomUUID();
    put("sentinel.telemetry_sources", {
      ...scopeRow,
      source_id: randomUUID(),
      enabled: false,
      revision: 1,
      active_credentials: 0,
    });
    put("sentinel.detection_rules", {
      ...scopeRow,
      rule_id: ruleId,
      current_version: i === 0 ? 3 : 1,
      seed_key: null,
      created_at: "2026-11-14T00:00:00Z",
      updated_at: "2026-11-15T17:09:58Z",
    });
    for (let v = 1; v <= (i === 0 ? 3 : 1); v++) {
      put("sentinel.detection_rule_versions", {
        ...scopeRow,
        rule_id: ruleId,
        version: v,
        status: v === 2 ? "ENABLED" : "DISABLED",
        definition: ruleDefinition,
        actor_id: "github-user-187839747",
        enabled_at: v === 2 ? "2026-11-14" : null,
      });
      put("sentinel.detection_audit", {
        ...scopeRow,
        rule_id: ruleId,
        version: v,
        action: v === 3 ? "disable" : "create",
        actor_id: "github-user-187839747",
      });
    }
  }
  put("sentinel.incidents", {
    ...scopeRow,
    incident_id: oldIncidentId,
    status: "open",
    source_id: "old-source",
    rule_id: oldRuleId,
  });
  put("sentinel.incident_evidence", {
    ...scopeRow,
    incident_id: oldIncidentId,
    event_id: "old-event",
  });
  put("sentinel.project_bindings", {
    ...scopeRow,
    repository_id: "998736528",
    actor_id: "github-user-187839747",
    enabled: true,
  });
  for (let i = 0; i < 100; i++)
    put("platform.notification_attempts", {
      ...scopeRow,
      id: `immutable-${i}`,
    });
  refresh(state);
  return state;
}
export function refresh(s: ProvisionState) {
  for (const [t, rr] of Object.entries(s.rowsByTable)) {
    for (const r of rr) r.hash = fingerprint(r.row);
    s.rowHashesByTable[t] = rr.map((r) => r.hash);
    s.tableCounts[t] = rr.length;
  }
  s.jobsInventory = s.rowsByTable["platform.jobs"].map(
    (r) => r.row,
  ) as unknown as ProvisionState["jobsInventory"];
  s.workerHeartbeats = s.rowsByTable["platform.worker_heartbeats"].map(
    (r) => r.row,
  ) as unknown as ProvisionState["workerHeartbeats"];
  s.sources = s.rowsByTable["sentinel.telemetry_sources"].map((r) => ({
    ...r.row,
    active_credentials: s.rowsByTable["sentinel.telemetry_credentials"].filter(
      (c) => c.row.source_id === r.row.source_id && c.row.revoked_at === null,
    ).length,
  })) as unknown as ProvisionState["sources"];
  s.rules = s.rowsByTable["sentinel.detection_rules"].map((r) => ({
    rule_id: r.row.rule_id,
    revision: r.row.current_version,
    status: s.rowsByTable["sentinel.detection_rule_versions"].find(
      (v) =>
        v.row.rule_id === r.row.rule_id &&
        v.row.version === r.row.current_version,
    )?.row.status,
  })) as unknown as ProvisionState["rules"];
  s.existingIncidents = s.rowsByTable["sentinel.incidents"].map(
    (r) => r.row,
  ) as unknown as ProvisionState["existingIncidents"];
}
export function baselineFixture(start: ProvisionState) {
  const original = structuredClone(start);
  original.rowsByTable["sentinel.detection_rules"].find(
    (r) => r.row.rule_id === oldRuleId,
  )!.row.current_version = 2;
  for (const table of [
    "sentinel.detection_rule_versions",
    "sentinel.detection_audit",
  ])
    original.rowsByTable[table] = original.rowsByTable[table].filter(
      (r) => !(r.row.rule_id === oldRuleId && r.row.version === 3),
    );
  refresh(original);
  const historical: Record<string, string[]> = {};
  let remain = 91;
  for (const t of tableNames.filter(
    (t) => !t.startsWith("sentinel.incident"),
  )) {
    historical[t] = [];
    if (t !== "platform.notification_attempts")
      historical[t] = original.rowsByTable[t]
        .filter(
          (r) =>
            !(t === "sentinel.detection_rules" && r.row.rule_id === oldRuleId),
        )
        .slice(0, Math.min(remain, 16))
        .map((r) => r.hash);
    remain -= historical[t].length;
  }
  historical["platform.notification_attempts"] = original.rowHashesByTable[
    "platform.notification_attempts"
  ].slice(0, remain);
  const pre = {
    preRecoveryRowHashesByTable: original.rowHashesByTable,
    priorRuleRowHashesById: {
      [oldRuleId]: original.rowsByTable["sentinel.detection_rules"].find(
        (r) => r.row.rule_id === oldRuleId,
      )!.hash,
    },
    protectedJobIds: Array.from({ length: 8 }, (_, i) => `old-${i}`),
    historicalCompletedJobIds: Array.from(
      { length: 6 },
      (_, i) => `old-${i + 8}`,
    ),
    priorAttemptJobs: original.jobsInventory.slice(14),
    priorSources: original.sources,
    priorRules: original.rules,
    existingIncidentIds: [oldIncidentId],
  } as unknown as PreRecoverySnapshot;
  return { pre, historical };
}

/** Stateful in-memory application fixture: mutations mirror the reviewed SQL
 * transactions; it never opens a socket, pool, worker or real approval. */
export function provisionFixture() {
  const start = fixtureState(),
    state = structuredClone(start),
    entries: JournalEntry[] = [],
    calls: { path: string; body: Row | undefined; kind: string | undefined }[] =
      [],
    secrets: string[] = [];
  let credential = "";
  const sid = randomUUID(),
    rid = randomUUID(),
    jid = randomUUID();
  const issued = issueCredential(s04DevProjectScope, sid);
  const token = issued.token;
  const actualCid = issued.route.credentialId;
  const put = (t: string, r: Row) =>
    state.rowsByTable[t].push({ hash: fingerprint(r), row: r });
  const source = () =>
    state.rowsByTable["sentinel.telemetry_sources"].find(
      (r) => r.row.source_id === sid,
    )!.row;
  const rule = () =>
    state.rowsByTable["sentinel.detection_rules"].find(
      (r) => r.row.rule_id === rid,
    )!.row;
  const version = (v: number, status: string, action: string) => {
    put("sentinel.detection_rule_versions", {
      ...scopeRow,
      rule_id: rid,
      version: v,
      status,
      definition: ruleDefinition,
      actor_id: "github-user-187839747",
      enabled_at: v === 2 ? new Date(fixedNow).toISOString() : null,
    });
    put("sentinel.detection_audit", {
      ...scopeRow,
      rule_id: rid,
      version: v,
      action,
      actor_id: "github-user-187839747",
    });
  };
  const deps: ProvisionDeps = {
    origin: "http://localhost:3000",
    cookie: "wetscan_session=" + "a".repeat(64),
    start,
    deadlineMs: fixedNow + 600000,
    now: () => fixedNow,
    guard: async () => {},
    capture: async () => {
      refresh(state);
      return structuredClone(state);
    },
    journal: async (e) => {
      entries.push(structuredClone(e));
    },
    saveSecret: async (v) => {
      secrets.push(v);
    },
    rememberCredential: (v) => {
      credential = v;
    },
    request: async (path, _method, body, kind) => {
      const b = body as Row | undefined;
      calls.push({ path, body: b, kind });
      if (path === "incidents")
        return { status: 401, json: { error: "unauthenticated" } };
      if (path === "foreign" || path === "demo")
        return { status: 404, json: { error: "not_found" } };
      if (path === "bad-origin")
        return { status: 403, json: { error: "invalid_origin" } };
      if (path === "sources" && b?.action === "create") {
        put("sentinel.telemetry_sources", {
          ...scopeRow,
          source_id: sid,
          name: sourceDefinition.name,
          origin: "controlled_test",
          environment: "local",
          retention_days: 7,
          rate_limit: 1000,
          rate_used: 0,
          enabled: true,
          revision: 1,
        });
        put("sentinel.telemetry_credentials", {
          ...scopeRow,
          source_id: sid,
          credential_id: actualCid,
          token_hash: createHashFixture(token),
          revoked_at: null,
        });
        return {
          status: 201,
          json: {
            sourceId: sid,
            credentialId: actualCid,
            credential: token,
            showOnce: true,
          },
        };
      }
      if (path === "rules" && b?.action === "create") {
        put("sentinel.detection_rules", {
          ...scopeRow,
          rule_id: rid,
          current_version: 1,
          seed_key: null,
        });
        version(1, "DRAFT", "create");
        return { status: 201, json: { ruleId: rid, revision: 1 } };
      }
      if (path === "rules" && b?.action === "enable") {
        rule().current_version = 2;
        version(2, "ENABLED", "enable");
        return {
          status: 200,
          json: { ruleId: rid, revision: 2, status: "ENABLED" },
        };
      }
      if (path === "rules" && b?.action === "disable") {
        rule().current_version = 3;
        version(3, "DISABLED", "disable");
        return {
          status: 200,
          json: { ruleId: rid, revision: 3, status: "DISABLED" },
        };
      }
      if (path === "sources" && b?.action === "revoke") {
        state.rowsByTable["sentinel.telemetry_credentials"].find(
          (r) => r.row.source_id === sid,
        )!.row.revoked_at = new Date(fixedNow).toISOString();
        source().revision = 2;
        return { status: 200, json: { sourceId: sid } };
      }
      if (path === "sources" && b?.action === "disable") {
        source().enabled = false;
        source().revision = 3;
        return { status: 200, json: { sourceId: sid } };
      }
      if (path === "ingest" && kind === "invalid")
        return { status: 401, json: { error: "invalid_credential" } };
      if (path === "ingest") {
        if (!credential) throw new Error("fixture_missing_token");
        const normalized = parseBatch(
            body,
            s04DevProjectScope.projectId,
            fixedNow,
          ),
          event = normalized.events[0];
        source().rate_used = Number(source().rate_used) + 1;
        const receipt = [{ eventId: event.eventId, duplicate: false }];
        if (
          state.rowsByTable["sentinel.telemetry_batches"].some(
            (r) => r.row.batch_id === normalized.batchId,
          )
        )
          return {
            status: 200,
            json: {
              batchId: normalized.batchId,
              duplicate: true,
              events: receipt,
            },
          };
        put("sentinel.telemetry_events", {
          ...scopeRow,
          source_id: sid,
          event_id: event.eventId,
          kind: "http.request",
          severity: "low",
          event,
          fingerprint: fingerprint(event),
        });
        put("sentinel.telemetry_batches", {
          ...scopeRow,
          source_id: sid,
          batch_id: normalized.batchId,
          receipt,
          fingerprint: fingerprint(normalized),
        });
        put("platform.jobs", {
          ...scopeRow,
          module: "sentinel",
          job_id: jid,
          kind: "sentinel.telemetry.accepted",
          subject_ref: `${sid}/${event.eventId}`,
          idempotency_key: `telemetry:${sid}:${event.eventId}`,
          state: "queued",
          revision: 1,
          attempts: 0,
          max_attempts: 5,
          fence: 0,
          cancel_requested: false,
          lease_owner: null,
          lease_token: null,
          lease_until: null,
          finished_at: null,
          created_at: new Date(fixedNow).toISOString(),
        });
        return {
          status: 202,
          json: {
            batchId: normalized.batchId,
            duplicate: false,
            events: receipt,
          },
        };
      }
      throw new Error("fixture_unexpected_request");
    },
  };
  return { start, state, deps, entries, calls, secrets, token, sid, rid, jid };
}
import { hash as createHashFixture } from "../../scripts/sentinel-provision-safety";
