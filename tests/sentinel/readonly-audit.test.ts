import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { parseApproval, type ApprovedAction } from "../../src/platform/config";
const mock = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  connect: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
  Pool: vi.fn(),
  uuid: 0,
}));
vi.mock("pg", () => ({ default: { Pool: mock.Pool } }));
vi.mock("node:crypto", async (original) => ({
  ...(await original<typeof import("node:crypto")>()),
  randomUUID: () =>
    `00000000-0000-4000-8000-${String(++mock.uuid).padStart(12, "0")}`,
}));
import {
  auditAction,
  auditKind,
  auditPhase,
  auditPlan,
  auditTarget,
  auditApprovalMetadata,
  validateAuditAuthorization,
  AuditError,
} from "../../scripts/sentinel-readonly-audit-contract";
import {
  auditAllowedQueries,
  auditIdentitySql,
  auditPermissionsSql,
  ReadOnlyAuditPool,
  performReadOnlyAudit,
  verifyReadOnlyAuditState,
  validateAuditManifest,
} from "../../scripts/sentinel-readonly-audit";
import { readOnlyDevStateQueries as queries } from "../../scripts/sentinel-dev-acceptance";
import {
  provisionDiagnostics,
  provisionFailure,
} from "../../scripts/sentinel-provision-diagnostics";
import {
  fixtureState,
  baselineFixture,
  fixedNow,
  refresh,
  tableNames,
  scopeRow,
} from "./provision-fixtures";
import {
  historicalMetadata,
  requireHistoricalClosed,
} from "../../scripts/sentinel-approval-history";

const binding = () => ({
  runId: "a".repeat(32),
  outputDirectory: resolve("C:/private/audit-fixture"),
  nowMs: fixedNow,
});
const approval = () => ({
  schemaVersion: 1,
  kind: auditKind,
  phase: auditPhase,
  status: "APPROVED",
  approvedBy: "IN_MEMORY_ONLY",
  approvedAt: new Date(fixedNow - 1000).toISOString(),
  expiresAt: new Date(fixedNow + 119000).toISOString(),
  actions: [auditAction],
  target: auditTarget,
  migrationPlanSha256: auditPlan,
  inputManifestSha256: "f".repeat(64),
  ...{ runId: binding().runId, outputDirectory: binding().outputDirectory },
});
function fixture() {
  const state = fixtureState(),
    b = baselineFixture(state);
  const inputs = {
    pre: b.pre,
    before: { deterministicState: { rowHashesByTable: b.historical } },
    plan: { migrations: structuredClone(state.ledger) },
  } as unknown as Parameters<typeof verifyReadOnlyAuditState>[1];
  return { state, inputs };
}
const identity = () => ({
  database: auditTarget.database,
  username: "wetscan_migrator",
  marker: auditTarget.marker,
  version: 170012,
  default_read_only: "on",
  read_only: "on",
  rolsuper: false,
  rolbypassrls: false,
  rolcreatedb: false,
  rolcreaterole: false,
  memberships: 0,
});
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function databaseDouble(state: ReturnType<typeof fixtureState>) {
  mock.query.mockImplementation(async (sql: string) => {
    let rows: unknown[];
    const read = Object.entries(queries).find(([, v]) => v === sql)?.[0];
    if (sql === auditIdentitySql) rows = [identity()];
    else if (sql === auditPermissionsSql) rows = [{ can_read: true }];
    else if (
      [
        "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
        "COMMIT",
        "ROLLBACK",
      ].includes(sql)
    )
      rows = [];
    else if (
      read === "activeLeases" ||
      read === "expiredLeases" ||
      read === "orphanedTimelineEvidence"
    )
      rows = [{ count: state[read] }];
    else if (read === "clockNow") rows = [{ now: state.clockNow }];
    else if (read === "ruleRows")
      rows = state.rowsByTable["sentinel.detection_rules"].map((r) => ({
        rule_id: r.row.rule_id,
        value: canonical(r.row),
      }));
    else if (read)
      rows =
        read === "identity"
          ? [state.identity]
          : (state as unknown as Record<string, unknown[]>)[read];
    else {
      const table =
        /^SELECT to_jsonb\(r\)::text AS value FROM ((?:platform|sentinel)\.[a-z_]+) r ORDER BY to_jsonb\(r\)::text$/.exec(
          sql,
        )?.[1];
      if (!table) throw Error("unrecognized fixture query");
      rows = state.rowsByTable[table].map((r) => ({ value: canonical(r.row) }));
    }
    return { rows, rowCount: rows.length };
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.release.mockReset();
  mock.uuid = 0;
  mock.Pool.mockImplementation(function () {
    return { connect: mock.connect, end: mock.end, on: mock.on };
  });
  mock.connect.mockResolvedValue({ query: mock.query, release: mock.release });
  mock.end.mockResolvedValue(undefined);
});
describe("separate audit-only authorization, in memory", () => {
  it("requires pinned code/input coverage and rejects references outside reviewed roots", () => {
    const path = resolve("scripts/sentinel-readonly-audit.ts"),
      pins = { [path]: "a".repeat(64) };
    expect(validateAuditManifest(pins, pins)).toEqual(pins);
    expect(() =>
      validateAuditManifest({ [path]: "b".repeat(64) }, pins),
    ).toThrow("audit_manifest_pin");
    expect(() => validateAuditManifest({}, pins)).toThrow();
    expect(() =>
      validateAuditManifest(
        { [resolve("C:/outside/fixture")]: "a".repeat(64) },
        {},
      ),
    ).toThrow("audit_manifest_boundary");
  });
  it("accepts only the exact DEV audit contract", () =>
    expect(validateAuditAuthorization(approval(), binding()).phase).toBe(
      auditPhase,
    ));
  it.each([
    "runtime",
    "migrate_up",
    "migrate_down",
    "integration_test",
  ] as ApprovedAction[])("cannot authorize generic %s access", (action) =>
    expect(() =>
      parseApproval(approval(), auditTarget, action, auditPlan),
    ).toThrow(),
  );
  it.each([
    { phase: "provision-ingest" },
    { actions: ["runtime"] },
    { actions: [auditAction, "runtime"] },
    { status: "CLOSED" },
    { h04cB2: { phase: "provision-ingest" } },
    { runId: "b".repeat(32) },
    { target: { ...auditTarget, database: "wetscan_s01_test" } },
    { target: { ...auditTarget, marker: "wrong" } },
    { target: { ...auditTarget, port: 5432 } },
    { expiresAt: new Date(fixedNow + 120000).toISOString() },
    { expiresAt: new Date(fixedNow - 1).toISOString() },
  ])(
    "rejects invalid, widened, expired or mismatched authorization %j",
    (change) =>
      expect(() =>
        validateAuditAuthorization({ ...approval(), ...change }, binding()),
      ).toThrow(),
  );
  it("recognizes closed audit authorizations without reopening historical lifecycle states", () => {
    const a = {
      ...approval(),
      status: "CLOSED",
      actions: [],
      closedAt: new Date(fixedNow).toISOString(),
    };
    expect(auditApprovalMetadata(a).status).toBe("CLOSED");
    expect(() =>
      requireHistoricalClosed([
        {
          ...historicalMetadata(a),
          path: "fixture",
          sha256: "x",
          createdAt: "fixture",
          modifiedAt: "fixture",
        },
      ]),
    ).not.toThrow();
    expect(() =>
      requireHistoricalClosed([
        {
          ...historicalMetadata(approval()),
          path: "fixture",
          sha256: "x",
          createdAt: "fixture",
          modifiedAt: "fixture",
        },
      ]),
    ).toThrow("prior_approval_not_closed");
  });
});
describe("complete post-containment preservation verifier", () => {
  it("accepts the authorized containment delta and all 91 rows, 16 jobs and 8 heartbeats", () => {
    const f = fixture();
    expect(verifyReadOnlyAuditState(f.state, f.inputs)).toMatchObject({
      status: "PASS",
      historicalRowsVerified: 91,
      historicalJobsVerified: 16,
      historicalHeartbeatsVerified: 8,
      containedRuleRevision: 3,
      databaseMutations: 0,
    });
  });
  it.each([
    "platform.jobs",
    "platform.worker_heartbeats",
    "sentinel.incidents",
    "sentinel.incident_evidence",
    "sentinel.detection_rules",
    "platform.notification_attempts",
  ])("rejects a changed historical %s row", (table) => {
    const f = fixture();
    f.state.rowsByTable[table][0].row.modified = true;
    refresh(f.state);
    expect(() => verifyReadOnlyAuditState(f.state, f.inputs)).toThrow();
  });
  it("rejects a missing historical row", () => {
    const f = fixture();
    f.state.rowsByTable["platform.jobs"].pop();
    refresh(f.state);
    expect(() => verifyReadOnlyAuditState(f.state, f.inputs)).toThrow();
  });
  it.each([
    "platform.jobs",
    "sentinel.incidents",
    "sentinel.detection_evaluations",
    "sentinel.telemetry_events",
    "sentinel.incident_timeline",
  ])("rejects any unexpected new %s row", (table) => {
    const f = fixture();
    f.state.rowsByTable[table].push({
      hash: "fixture",
      row: { ...scopeRow, id: "unexpected" },
    });
    refresh(f.state);
    expect(() => verifyReadOnlyAuditState(f.state, f.inputs)).toThrow();
  });
  it.each([
    "activeLeases",
    "expiredLeases",
    "orphanedTimelineEvidence",
  ] as const)("rejects %s", (field) => {
    const f = fixture();
    f.state[field] = 1;
    expect(() => verifyReadOnlyAuditState(f.state, f.inputs)).toThrow();
  });
  it.each([
    { marker: "wrong" },
    { database: "wetscan_s01_test" },
    { role: "wetscan_app" },
    { transaction_read_only: "off" },
  ])("rejects incorrect captured identity %j", (change) => {
    const f = fixture();
    Object.assign(f.state.identity, change);
    expect(() => verifyReadOnlyAuditState(f.state, f.inputs)).toThrow(
      "database_identity",
    );
  });
  it("rejects ledger changes and unauthorized containment version", () => {
    const f = fixture();
    f.state.ledger[0].checksum = "wrong";
    expect(() => verifyReadOnlyAuditState(f.state, f.inputs)).toThrow(
      "audit_migration_identity",
    );
    const g = fixture();
    g.state.rowsByTable["sentinel.detection_rule_versions"].find(
      (r) => r.row.version === 3,
    )!.row.actor_id = "wrong";
    refresh(g.state);
    expect(() => verifyReadOnlyAuditState(g.state, g.inputs)).toThrow(
      "contained_rule_version",
    );
  });
});
describe("restricted driver double: no PostgreSQL or TCP", () => {
  const pool = (guard = () => {}) =>
    new ReadOnlyAuditPool(
      "IN_MEMORY_INVALID_PASSWORD",
      binding().runId,
      auditAllowedQueries(tableNames),
      guard,
    );
  it("enforces read-only startup, one connection, fixed SQL, and complete pool closure", async () => {
    const f = fixture();
    databaseDouble(f.state);
    const p = pool();
    const answer = await performReadOnlyAudit({
      pool: p,
      inputs: f.inputs,
      guard: () => {},
      remainingMs: 1000,
    });
    expect(answer.result.status).toBe("PASS");
    expect(mock.Pool).toHaveBeenCalledWith(
      expect.objectContaining({
        user: "wetscan_migrator",
        max: 1,
        connectionTimeoutMillis: 3000,
        statement_timeout: 5000,
        options: "-c default_transaction_read_only=on -c lock_timeout=1000",
      }),
    );
    expect(mock.query).toHaveBeenCalledWith(
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      undefined,
    );
    expect(mock.query).toHaveBeenCalledWith("COMMIT", undefined);
    expect(mock.release).toHaveBeenCalledTimes(1);
    expect(mock.end).toHaveBeenCalledTimes(1);
    expect(mock.connect).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(answer)).not.toContain("definition");
    expect(answer.hashes.rowHashesByTable["platform.jobs"]).toHaveLength(16);
  });
  it.each(["ECONNREFUSED", "ETIMEDOUT"])(
    "does not retry %s and always ends pool",
    async (code) => {
      const f = fixture(),
        error = Object.assign(new Error("PRIVATE_PASSWORD"), { code });
      mock.connect.mockRejectedValueOnce(error);
      const p = pool();
      await expect(
        performReadOnlyAudit({
          pool: p,
          inputs: f.inputs,
          guard: () => {},
          remainingMs: 1000,
        }),
      ).rejects.toBe(error);
      expect(mock.connect).toHaveBeenCalledTimes(1);
      expect(mock.end).toHaveBeenCalledTimes(1);
      expect(mock.query).not.toHaveBeenCalled();
      expect(
        JSON.stringify(
          provisionFailure(error, provisionDiagnostics("unknown")),
        ),
      ).not.toContain("PRIVATE_PASSWORD");
    },
  );
  it.each([
    { marker: "wrong" },
    { username: "wetscan_app" },
    { default_read_only: "off" },
    { read_only: "off" },
    { rolsuper: true },
    { rolbypassrls: true },
    { rolcreatedb: true },
    { rolcreaterole: true },
    { memberships: 1 },
  ])(
    "rejects unsafe connection identity %j and destroys it",
    async (change) => {
      mock.query.mockResolvedValueOnce({
        rows: [{ ...identity(), ...change }],
      });
      const p = pool();
      await expect(p.connect()).rejects.toThrow("audit_database_identity");
      await p.end();
      expect(mock.release).toHaveBeenCalledExactlyOnceWith(true);
      expect(mock.end).toHaveBeenCalledTimes(1);
    },
  );
  it("denies writes, SET READ WRITE, arbitrary SELECT, and a second connection", async () => {
    const f = fixture();
    databaseDouble(f.state);
    const p = pool(),
      client = await p.connect();
    for (const sql of [
      "INSERT INTO platform.jobs DEFAULT VALUES",
      "UPDATE sentinel.incidents SET status='closed'",
      "DELETE FROM platform.jobs",
      "TRUNCATE platform.jobs",
      "SET default_transaction_read_only=off",
      "BEGIN READ WRITE",
      "SELECT dangerous_function()",
    ])
      await expect(client.query(sql)).rejects.toThrow("audit_sql_denied");
    await expect(p.connect()).rejects.toThrow("audit_single_connection");
    await p.end();
    expect(mock.release).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("rejects missing SELECT permissions and closes the unverified connection", async () => {
    mock.query
      .mockResolvedValueOnce({ rows: [identity()] })
      .mockResolvedValueOnce({ rows: [{ can_read: false }] });
    const p = pool();
    await expect(p.connect()).rejects.toThrow("audit_role_permissions");
    await p.end();
    expect(mock.release).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("rolls back and releases on snapshot failure", async () => {
    const f = fixture();
    databaseDouble(f.state);
    const implementation = mock.query.getMockImplementation()!;
    mock.query.mockImplementation(async (sql: string, ...args: unknown[]) => {
      if (sql === queries.ledger) throw Error("PRIVATE DRIVER MESSAGE");
      return implementation(sql, ...args);
    });
    await expect(
      performReadOnlyAudit({
        pool: pool(),
        inputs: f.inputs,
        guard: () => {},
        remainingMs: 1000,
      }),
    ).rejects.toThrow("PRIVATE DRIVER MESSAGE");
    expect(mock.query).toHaveBeenCalledWith("ROLLBACK", undefined);
    expect(mock.release).toHaveBeenCalledTimes(1);
    expect(mock.end).toHaveBeenCalledTimes(1);
  });
  it("expiry before connect still closes the pool; cleanup failure cannot report PASS", async () => {
    const f = fixture();
    await expect(
      performReadOnlyAudit({
        pool: pool(),
        inputs: f.inputs,
        guard: () => {
          throw new AuditError("audit_deadline");
        },
        remainingMs: 1000,
      }),
    ).rejects.toThrow("audit_deadline");
    expect(mock.connect).not.toHaveBeenCalled();
    expect(mock.end).toHaveBeenCalledTimes(1);
    mock.end.mockRejectedValueOnce(Error("PRIVATE"));
    await expect(
      performReadOnlyAudit({
        pool: pool(),
        inputs: f.inputs,
        guard: () => {},
        remainingMs: 0,
      }),
    ).rejects.toThrow("audit_pool_cleanup_failed");
  });
  it("the absolute deadline destroys an owned client exactly once", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      databaseDouble(f.state);
      let rejectPending: ((error: Error) => void) | undefined;
      const original = mock.query.getMockImplementation()!;
      mock.query.mockImplementation((sql: string, ...args: unknown[]) =>
        sql === queries.ledger
          ? new Promise((_resolve, reject) => {
              rejectPending = reject;
            })
          : original(sql, ...args),
      );
      mock.release.mockImplementation(() =>
        rejectPending?.(new Error("fixture socket destroyed")),
      );
      const result = performReadOnlyAudit({
        pool: pool(),
        inputs: f.inputs,
        guard: () => {},
        remainingMs: 10,
      }).catch((error) => error);
      for (let i = 0; i < 30 && !rejectPending; i++) await Promise.resolve();
      expect(rejectPending).toBeDefined();
      await vi.advanceTimersByTimeAsync(10);
      expect(await result).toMatchObject({ code: "audit_deadline" });
      expect(mock.release).toHaveBeenCalledExactlyOnceWith(true);
      expect(mock.end).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
