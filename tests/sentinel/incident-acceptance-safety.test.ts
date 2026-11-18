import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  assertS04DownRefusalAudit,
  createS04DownRefusalPool,
  incidentAcceptancePermission,
  isAllowedS04DownRefusalSql,
  preserveAllS04CommittedRows,
  preserveS03,
  reviewedS04Plan,
  s04ApprovedOperations,
  s04DownRefusalAllowedSql,
  s04DownRefusalLockTimeoutSql,
  s04TestTarget,
  verifyPopulatedS04DownRefusal,
  type FullS04Snapshot,
} from "./incident-acceptance-safety";
import { applyMigrations, migrationPlan } from "../../src/platform/migrations";
import { PlatformError, type DatabaseApproval } from "../../src/platform/config";
import type { EvidenceSnapshot } from "./telemetry-retest-safety";
import { RecordingClient, fakePool } from "../platform/helpers";

const approval: DatabaseApproval = {
  schemaVersion: 1,
  status: "APPROVED",
  approvedBy: "test fixture only",
  approvedAt: "2026-11-15T00:00:00Z",
  target: { ...s04TestTarget },
  actions: ["integration_test", "migrate_up"],
  migrationPlanSha256: reviewedS04Plan,
};

describe("S04 acceptance gate - no database configuration or connections", () => {
  it("read-only preflight refuses absent approval before connecting", () => {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(env))
      if (key.startsWith("SENTINEL_")) delete env[key];
    const p = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/sentinel-incident-preflight.ts",
        "--read-only",
      ],
      { env, encoding: "utf8", windowsHide: true, timeout: 10000 },
    );
    expect(p.status).toBe(2);
    expect(p.stderr).toContain("not_configured");
    expect(p.stdout).toBe("");
  });

  it("CLI refuses absent approval before pools or mutating test child", () => {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(env))
      if (key.startsWith("SENTINEL_")) delete env[key];
    const p = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/sentinel-incident-test.ts"],
      { env, encoding: "utf8", windowsHide: true, timeout: 10000 },
    );
    expect(p.status).toBe(2);
    expect(p.stderr).toContain("not_configured");
    expect(p.stdout).not.toContain("RUN");
  });

  it("CLI rejects approval files granting unauthorized migrate_down or runtime actions before connecting", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wetscan-s04-cli-"));
    const approvalFile = join(dir, "approval.json");
    const secretFile = join(dir, "secret.txt");
    const backupFile = join(dir, "fixture-backup.dump");
    try {
      const data = "unit fixture only, not a PostgreSQL backup";
      await writeFile(backupFile, data, { flag: "wx" });
      await writeFile(secretFile, "012345678901234567890123456789", {
        flag: "wx",
      });
      await writeFile(
        approvalFile,
        JSON.stringify({
          ...approval,
          actions: ["integration_test", "migrate_up", "migrate_down"],
          s04Acceptance: {
            fixtureId: "00000000-0000-4000-8000-000000000001",
            baselineSha256: "b".repeat(64),
            backupFile,
            backupSha256: createHash("sha256").update(data).digest("hex"),
            operations: [...s04ApprovedOperations],
          },
        }),
        { flag: "wx" },
      );
      const env: NodeJS.ProcessEnv = { ...process.env };
      for (const key of Object.keys(env))
        if (key.startsWith("SENTINEL_")) delete env[key];
      env.SENTINEL_DB_HOST = s04TestTarget.host;
      env.SENTINEL_DB_PORT = String(s04TestTarget.port);
      env.SENTINEL_DB_NAME = s04TestTarget.database;
      env.SENTINEL_DB_MARKER = s04TestTarget.marker;
      env.SENTINEL_DB_APPROVAL_FILE = approvalFile;
      env.SENTINEL_DB_APP_PASSWORD_FILE = secretFile;
      env.SENTINEL_DB_WORKER_PASSWORD_FILE = secretFile;
      env.SENTINEL_DB_MIGRATION_PASSWORD_FILE = secretFile;
      const p = spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/sentinel-incident-test.ts"],
        { env, encoding: "utf8", windowsHide: true, timeout: 10000 },
      );
      expect(p.status).toBe(2);
      expect(p.stderr).toContain("approval_required");
      expect(p.stdout).not.toContain("RUN");
    } finally {
      await unlink(approvalFile).catch(() => {});
      await unlink(secretFile).catch(() => {});
      await unlink(backupFile).catch(() => {});
      await rmdir(dir).catch(() => {});
    }
  });

  it("refuses missing backup/scope/baseline approval", async () => {
    await expect(incidentAcceptancePermission(approval)).rejects.toThrow();
  });

  it("accepts least-privilege H04B approval without migrate_down and enforces exact TEST identity, migration hash, backup, baseline, and action allowlist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wetscan-s04-unit-"));
    try {
      const backupFile = join(dir, "fixture-backup.dump");
      const data = "unit fixture only, not a PostgreSQL backup";
      await writeFile(backupFile, data, { flag: "wx" });
      const ext = {
        fixtureId: "00000000-0000-4000-8000-000000000001",
        baselineSha256: "b".repeat(64),
        backupFile,
        backupSha256: createHash("sha256").update(data).digest("hex"),
        operations: [...s04ApprovedOperations],
      };
      const a = { ...approval, s04Acceptance: ext };
      expect((await incidentAcceptancePermission(a)).workspaceId).toContain(
        "s04-",
      );
      for (const badActions of [
        ["integration_test"] as DatabaseApproval["actions"],
        ["migrate_up"] as DatabaseApproval["actions"],
        [
          "integration_test",
          "migrate_up",
          "migrate_down",
        ] as DatabaseApproval["actions"],
        ["integration_test", "migrate_down"] as DatabaseApproval["actions"],
        [
          "integration_test",
          "migrate_up",
          "runtime",
        ] as DatabaseApproval["actions"],
      ]) {
        await expect(
          incidentAcceptancePermission({ ...a, actions: badActions }),
        ).rejects.toThrow("approval_required");
      }
      for (const badTarget of [
        { ...s04TestTarget, host: "localhost" },
        { ...s04TestTarget, port: 5432 },
        { ...s04TestTarget, database: "wetscan_dev" },
        {
          ...s04TestTarget,
          marker: "wetscan-s01:00000000-0000-4000-8000-000000000001",
        },
      ]) {
        await expect(
          incidentAcceptancePermission({ ...a, target: badTarget }),
        ).rejects.toThrow("target_denied");
      }
      await expect(
        incidentAcceptancePermission({
          ...a,
          migrationPlanSha256: "a".repeat(64),
        }),
      ).rejects.toThrow("approval_required");
      await expect(
        incidentAcceptancePermission({
          ...a,
          s04Acceptance: { ...ext, baselineSha256: "not-a-sha256" },
        }),
      ).rejects.toThrow("approval_required");
      await expect(
        incidentAcceptancePermission({
          ...a,
          s04Acceptance: {
            ...ext,
            operations: [...s04ApprovedOperations, "backfill_old_alerts"],
          },
        }),
      ).rejects.toThrow();
      await writeFile(backupFile, "changed unit fixture");
      await expect(incidentAcceptancePermission(a)).rejects.toThrow(
        "approval_required",
      );
    } finally {
      await unlink(join(dir, "fixture-backup.dump"));
      await rmdir(dir);
    }
  });

  it("enforces strict read/lock-only SQL allowlist and blocks all destructive SQL during populated-down refusal", async () => {
    const plan = await migrationPlan("0004_incidents");
    for (const sql of s04DownRefusalAllowedSql) {
      expect(isAllowedS04DownRefusalSql(sql)).toBe(true);
      expect(isAllowedS04DownRefusalSql(sql, ["unexpected_param"])).toBe(false);
    }
    for (const forbidden of [
      plan.migrations[3].down,
      "DROP TABLE sentinel.incidents",
      "DELETE FROM platform.schema_migrations WHERE version=$1",
      "TRUNCATE sentinel.incidents",
      "ALTER TABLE sentinel.incidents DISABLE ROW LEVEL SECURITY",
      "UPDATE sentinel.incidents SET status='open'",
      "INSERT INTO sentinel.incidents VALUES ()",
      "COMMIT",
    ]) {
      expect(isAllowedS04DownRefusalSql(forbidden)).toBe(false);
    }

    const occupiedClient = new RecordingClient();
    occupiedClient.respond = async (sql) => ({
      rows: sql.includes("to_regclass")
        ? [{ ledger: "exists" }]
        : sql.startsWith("SELECT version,checksum")
          ? plan.migrations
          : sql.includes("SELECT EXISTS")
            ? [{ occupied: sql.includes("FROM sentinel.incidents ") }]
            : [],
      rowCount: 1,
    });
    const audit = await verifyPopulatedS04DownRefusal(
      fakePool(occupiedClient),
      plan.migrations,
    );
    expect(audit.blockedStatements).toEqual([]);
    expect(audit.lockTimeoutConfigured).toBe(true);
    expect(audit.clientReleased).toBe(true);
    expect(audit.inTransaction).toBe(false);
    expect(audit.destroyedOnRelease).toBe(false);
    expect(occupiedClient.release).toHaveBeenCalledWith(false);
    expect(
      occupiedClient.calls.some((x) => x.sql === s04DownRefusalLockTimeoutSql),
    ).toBe(true);
    expect(occupiedClient.calls.at(-1)?.sql).toBe("ROLLBACK");

    const makeEmptyClient = () => {
      const client = new RecordingClient();
      client.respond = async (sql) => ({
        rows: sql.includes("to_regclass")
          ? [{ ledger: "exists" }]
          : sql.startsWith("SELECT version,checksum")
            ? plan.migrations
            : sql.includes("SELECT EXISTS")
              ? [{ occupied: false }]
              : [],
        rowCount: 1,
      });
      return client;
    };
    const emptyClient = makeEmptyClient();
    await expect(
      verifyPopulatedS04DownRefusal(fakePool(emptyClient), plan.migrations),
    ).rejects.toThrow(
      "unexpected_down_refusal_outcome:blocked_unapproved_down_sql",
    );
    expect(
      emptyClient.calls.some((x) =>
        /\b(DROP|DELETE|TRUNCATE|ALTER|COMMIT)\b/i.test(x.sql),
      ),
    ).toBe(false);
    expect(emptyClient.calls.at(-1)?.sql).toBe("ROLLBACK");
    expect(emptyClient.release).toHaveBeenCalledWith(false);

    const directBlockedClient = makeEmptyClient();
    const { pool: directBlockedPool, audit: directBlockedAudit } =
      createS04DownRefusalPool(fakePool(directBlockedClient));
    await expect(
      applyMigrations(directBlockedPool, plan.migrations, "down"),
    ).rejects.toThrow("blocked_unapproved_down_sql");
    expect(directBlockedAudit.blockedStatements).toEqual([
      plan.migrations[3].down,
    ]);
    expect(directBlockedAudit.inTransaction).toBe(false);
    expect(directBlockedAudit.clientReleased).toBe(true);
    expect(directBlockedAudit.destroyedOnRelease).toBe(false);
    expect(
      directBlockedClient.calls.some((x) =>
        /\b(DROP|DELETE|TRUNCATE|ALTER|COMMIT)\b/i.test(x.sql),
      ),
    ).toBe(false);
    expect(directBlockedClient.calls.at(-1)?.sql).toBe("ROLLBACK");

    const makeBrokenRollbackClient = () => {
      const client = new RecordingClient();
      client.respond = async (sql) => {
        if (sql === "ROLLBACK") throw new Error("rollback_failed");
        return {
          rows: sql.includes("to_regclass")
            ? [{ ledger: "exists" }]
            : sql.startsWith("SELECT version,checksum")
              ? plan.migrations
              : sql.includes("SELECT EXISTS")
                ? [{ occupied: true }]
                : [],
          rowCount: 1,
        };
      };
      return client;
    };
    const brokenRollbackClient = makeBrokenRollbackClient();
    await expect(
      verifyPopulatedS04DownRefusal(
        fakePool(brokenRollbackClient),
        plan.migrations,
      ),
    ).rejects.toThrow("invalid_down_refusal_audit");
    expect(
      brokenRollbackClient.calls.some(
        (x) => x.sql === s04DownRefusalLockTimeoutSql,
      ),
    ).toBe(true);
    expect(
      brokenRollbackClient.calls.some((x) =>
        /\b(DROP|DELETE|TRUNCATE|ALTER|COMMIT)\b/i.test(x.sql),
      ),
    ).toBe(false);
    expect(brokenRollbackClient.release).toHaveBeenCalledWith(true);

    const singleDestroyClient = makeBrokenRollbackClient();
    const { pool: guarded, audit: brokenAudit } = createS04DownRefusalPool(
      fakePool(singleDestroyClient),
    );
    let brokenCaught: unknown;
    try {
      await applyMigrations(guarded, plan.migrations, "down");
    } catch (error) {
      brokenCaught = error;
    }
    expect(brokenCaught).toBeInstanceOf(PlatformError);
    expect((brokenCaught as PlatformError).code).toBe("target_denied");
    expect(brokenAudit.blockedStatements).toEqual([]);
    expect(brokenAudit.lockTimeoutConfigured).toBe(true);
    expect(brokenAudit.inTransaction).toBe(true);
    expect(brokenAudit.clientReleased).toBe(true);
    expect(brokenAudit.destroyedOnRelease).toBe(true);
    expect(singleDestroyClient.release).toHaveBeenCalledWith(true);
    expect(() => assertS04DownRefusalAudit(brokenCaught, brokenAudit)).toThrow(
      "invalid_down_refusal_audit",
    );
    expect(() =>
      assertS04DownRefusalAudit(new PlatformError("target_denied"), {
        ...audit,
        lockTimeoutConfigured: false,
      }),
    ).toThrow("invalid_down_refusal_audit");
    expect(() =>
      assertS04DownRefusalAudit(new PlatformError("target_denied"), {
        ...audit,
        blockedStatements: ["DROP TABLE sentinel.incidents"],
      }),
    ).toThrow("invalid_down_refusal_audit");
  });

  const baseline = {
    rows: {
      "sentinel.telemetry_events": ["old-event"],
      "sentinel.detection_alerts": ["old-alert"],
      "platform.schema_migrations": ["ledger-1", "ledger-2", "ledger-3"],
    },
    ledger: [
      { version: "0001_foundation" },
      { version: "0002_telemetry" },
      { version: "0003_detection" },
    ],
    counts: {},
    structure: {
      catalog: [
        { nspname: "sentinel", relname: "telemetry_events" },
        { nspname: "sentinel", relname: "detection_alerts" },
      ],
      policies: [
        { schemaname: "sentinel", tablename: "detection_alerts", qual: "old" },
      ],
      roles: [{ rolname: "wetscan_app", rolsuper: false }],
      grants: [
        {
          table_schema: "sentinel",
          table_name: "detection_alerts",
          grantee: "wetscan_app",
          privilege_type: "SELECT",
        },
      ],
    },
  } as unknown as EvidenceSnapshot;

  it("allows only additive S04 catalog/ledger/fixture rows while preserving S01-S03 rows", () => {
    const after = structuredClone(baseline);
    after.rows["sentinel.telemetry_events"].push("new-fixture");
    after.rows["sentinel.detection_alerts"].push("new-alert");
    after.rows["platform.schema_migrations"].push("ledger-4");
    after.ledger.push({ version: "0004_incidents" });
    after.structure.catalog.push({
      nspname: "sentinel",
      relname: "incidents",
    });
    expect(() => preserveS03(baseline, after)).not.toThrow();
  });

  it.each(["row", "role", "policy", "grant", "ledger"])(
    "refuses historical %s modification",
    (kind) => {
      const after = structuredClone(baseline);
      if (kind === "row") after.rows["sentinel.detection_alerts"] = [];
      if (kind === "role") after.structure.roles[0].rolsuper = true;
      if (kind === "policy") after.structure.policies[0].qual = "changed";
      if (kind === "grant") after.structure.grants[0].privilege_type = "DELETE";
      if (kind === "ledger") after.ledger[2].version = "changed";
      expect(() => preserveS03(baseline, after)).toThrow();
    },
  );

  it("post-H04B preflight and postflight flags refuse absent approval before connecting", () => {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(env))
      if (key.startsWith("SENTINEL_")) delete env[key];
    for (const args of [
      ["--import", "tsx", "scripts/sentinel-incident-preflight.ts", "--post-h04b"],
      [
        "--import",
        "tsx",
        "scripts/sentinel-incident-preflight.ts",
        "--postflight=.local/sentinel/missing.json",
      ],
    ]) {
      const p = spawnSync(process.execPath, args, {
        env,
        encoding: "utf8",
        windowsHide: true,
        timeout: 10000,
      });
      expect(p.status).toBe(2);
      expect(p.stderr).toContain("not_configured");
      expect(p.stdout).toBe("");
    }
  });

  it("preserveAllS04CommittedRows allows additive S04 regression rows and rejects tampering with S01-S04 committed rows", () => {
    const fullBefore: FullS04Snapshot = {
      rows: {
        "sentinel.telemetry_events": ["h03-event", "h04b-event"],
        "sentinel.incidents": ["h04b-incident"],
        "sentinel.incident_timeline": ["h04b-tl-1", "h04b-tl-2"],
        "sentinel.incident_timeline_evidence": ["h04b-ite-1"],
      },
      counts: {
        "sentinel.telemetry_events": 2,
        "sentinel.incidents": 1,
        "sentinel.incident_timeline": 2,
        "sentinel.incident_timeline_evidence": 1,
      },
      ledger: [
        { version: "0001_foundation", checksum: "a", applied_at: "t1" },
        { version: "0002_telemetry", checksum: "b", applied_at: "t2" },
        { version: "0003_detection", checksum: "c", applied_at: "t3" },
        { version: "0004_incidents", checksum: "d", applied_at: "t4" },
      ],
      catalogCount: 25,
      activeLeases: 0,
    };

    const fullAdditive = structuredClone(fullBefore);
    fullAdditive.rows["sentinel.incidents"].push("reg-incident");
    fullAdditive.rows["sentinel.incident_timeline"].push("reg-tl-1");
    expect(() =>
      preserveAllS04CommittedRows(fullBefore, fullAdditive),
    ).not.toThrow();

    const tamperedH04b = structuredClone(fullBefore);
    tamperedH04b.rows["sentinel.incident_timeline"] = ["h04b-tl-1"];
    expect(() => preserveAllS04CommittedRows(fullBefore, tamperedH04b)).toThrow(
      "historical_or_accepted_row_changed:sentinel.incident_timeline",
    );

    const tamperedLedger = structuredClone(fullBefore);
    tamperedLedger.ledger[3].checksum = "tampered";
    expect(() => preserveAllS04CommittedRows(fullBefore, tamperedLedger)).toThrow(
      "historical_ledger_changed",
    );
  });
});
