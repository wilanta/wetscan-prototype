import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  acceptancePermission,
  preserveS02,
} from "./detection-acceptance-safety";
import type { DatabaseApproval } from "../../src/platform/config";
import type { EvidenceSnapshot } from "./telemetry-retest-safety";

const approval: DatabaseApproval = {
  schemaVersion: 1,
  status: "APPROVED",
  approvedBy: "test fixture only",
  approvedAt: "2026-11-15T00:00:00Z",
  target: {
    host: "127.0.0.1",
    port: 55432,
    database: "wetscan_s01_test",
    marker: "wetscan-s01:00000000-0000-4000-8000-000000000001",
  },
  actions: ["integration_test"],
  migrationPlanSha256: "a".repeat(64),
};
const operations = [
  "up_up",
  "new_fixtures",
  "process_fixture_jobs",
  "expire_fixture_lease",
  "fixture_hold_transitions",
  "negative_dml_rollback",
  "populated_down_refusal",
];
describe("S03 acceptance gate - no database configuration or connections", () => {
  it("read-only preflight refuses absent approval before connecting", () => {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(env))
      if (key.startsWith("SENTINEL_")) delete env[key];
    const p = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/sentinel-detection-preflight.ts",
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
      ["--import", "tsx", "scripts/sentinel-detection-test.ts"],
      { env, encoding: "utf8", windowsHide: true, timeout: 10000 },
    );
    expect(p.status).toBe(2);
    expect(p.stderr).toContain("not_configured");
    expect(p.stdout).not.toContain("RUN");
  });
  it("refuses missing backup/scope/baseline approval", async () => {
    await expect(acceptancePermission(approval)).rejects.toThrow();
  });
  it("verifies exact backup bytes and refuses amended operations", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wetscan-s03-unit-"));
    try {
      const backupFile = join(dir, "fixture-backup.dump"),
        data = "unit fixture only, not a PostgreSQL backup";
      await writeFile(backupFile, data, { flag: "wx" });
      const ext = {
        fixtureId: "00000000-0000-4000-8000-000000000001",
        baselineSha256: "b".repeat(64),
        backupFile,
        backupSha256: createHash("sha256").update(data).digest("hex"),
        operations,
      };
      const a = { ...approval, s03Acceptance: ext };
      expect((await acceptancePermission(a)).workspaceId).toContain("s03-");
      await expect(
        acceptancePermission({
          ...a,
          s03Acceptance: {
            ...ext,
            operations: [...operations, "delete_old_events"],
          },
        }),
      ).rejects.toThrow();
      await writeFile(backupFile, "changed unit fixture");
      await expect(acceptancePermission(a)).rejects.toThrow(
        "approval_required",
      );
    } finally {
      await unlink(join(dir, "fixture-backup.dump"));
      await rmdir(dir);
    } // Only this freshly-created OS temporary test file/directory.
  });
  const baseline = {
    rows: {
      "sentinel.telemetry_events": ["old-event"],
      "platform.schema_migrations": ["ledger-1", "ledger-2"],
    },
    ledger: [{ version: "0001_foundation" }, { version: "0002_telemetry" }],
    counts: {},
    structure: {
      catalog: [{ nspname: "sentinel", relname: "telemetry_events" }],
      policies: [
        { schemaname: "sentinel", tablename: "telemetry_events", qual: "old" },
      ],
      roles: [{ rolname: "wetscan_app", rolsuper: false }],
      grants: [
        {
          table_schema: "sentinel",
          table_name: "telemetry_events",
          grantee: "wetscan_app",
          privilege_type: "SELECT",
        },
      ],
    },
  } as unknown as EvidenceSnapshot;
  it("allows only additive S03 catalog/ledger/fixture rows", () => {
    const after = structuredClone(baseline);
    after.rows["sentinel.telemetry_events"].push("new-fixture");
    after.rows["platform.schema_migrations"].push("ledger-3");
    after.ledger.push({ version: "0003_detection" });
    after.structure.catalog.push({
      nspname: "sentinel",
      relname: "detection_alerts",
    });
    expect(() => preserveS02(baseline, after)).not.toThrow();
  });
  it.each(["row", "role", "policy", "grant", "ledger"])(
    "refuses historical %s modification",
    (kind) => {
      const after = structuredClone(baseline);
      if (kind === "row") after.rows["sentinel.telemetry_events"] = [];
      if (kind === "role") after.structure.roles[0].rolsuper = true;
      if (kind === "policy") after.structure.policies[0].qual = "changed";
      if (kind === "grant") after.structure.grants[0].privilege_type = "UPDATE";
      if (kind === "ledger") after.ledger[0].version = "changed";
      expect(() => preserveS02(baseline, after)).toThrow();
    },
  );
});
