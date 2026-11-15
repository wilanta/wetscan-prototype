import { expect, it } from "vitest";
import { validateGuardApproval } from "../../../src/features/guard/live/database-config";
import { guardMigrationPlan } from "../../../src/features/guard/live/migrations";
import {
  scanInput,
  GuardLiveService,
  defaultReadiness,
} from "../../../src/features/guard/live/service";
import { readFile } from "node:fs/promises";
import { fingerprint } from "../../../src/platform/identity";
const grant = {
  mode: "live" as const,
  workspaceId: "github-user-7:test",
  projectId: "github-123",
  actorId: "github-user-7",
  expiresAt: Date.now() + 60000,
  operations: ["read", "scan"] as const,
};
const authority = {
  grant,
  repositoryId: "123",
  repositoryName: "fixture/repo",
  branch: "main",
  installationId: 1,
  userId: 7,
};
it("requires fresh Guard-purpose approval and rejects prior Sentinel DB approvals/targets", () => {
  const approval = {
    schemaVersion: 1,
    status: "APPROVED",
    approvedBy: "operator",
    approvedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    module: "guard",
    purpose: "app",
    role: "wetscan_guard_app",
    actions: ["runtime"],
    target: {
      host: "127.0.0.1",
      port: 55432,
      database: "wetscan_dev_guardg01",
      marker: "wetscan-s01:11111111-1111-1111-1111-111111111111",
    },
    migrationPlanSha256: "a".repeat(64),
  };
  expect(validateGuardApproval(approval, "app", "a".repeat(64)).role).toBe(
    "wetscan_guard_app",
  );
  for (const invalid of [
    { ...approval, module: "sentinel" },
    { ...approval, purpose: "worker" },
    { ...approval, role: "wetscan_app" },
    { ...approval, expiresAt: "2000-01-01" },
    {
      ...approval,
      target: { ...approval.target, database: "wetscan_s01_test" },
    },
    { ...approval, migrationPlanSha256: "b".repeat(64) },
  ])
    expect(() =>
      validateGuardApproval(invalid, "app", "a".repeat(64)),
    ).toThrow();
});
it("bounds input and rejects forged authority, duplicate engines and invalid commits", () => {
  const input = {
    profile: "quick",
    engines: ["sast"],
    idempotencyKey: "test-request",
  };
  expect(scanInput(input).profile).toBe("quick");
  for (const bad of [
    { ...input, workspaceId: "forged" },
    { ...input, installationId: 123 },
    { ...input, engines: ["sast", "sast"] },
    { ...input, commit: "HEAD" },
    { ...input, token: "synthetic-only" },
  ])
    expect(() => scanInput(bad)).toThrow();
});
it("does not accept a Live scan or return Demo data before approved capabilities", async () => {
  const service = new GuardLiveService(undefined);
  await expect(
    service.create(authority, {
      profile: "quick",
      engines: ["sast"],
      idempotencyKey: "request-test",
    }),
  ).rejects.toThrow("approval_required");
  await expect(service.list(authority, new URLSearchParams())).rejects.toThrow(
    "approval_required",
  );
  expect(defaultReadiness.execution).toBe("G02_NOT_CONFIGURED");
});
it("proposed SQL retains FORCE RLS, separate ledger, privilege isolation and refuses destructive rollback", async () => {
  const plan = await guardMigrationPlan();
  expect(plan.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(plan.artifacts).toHaveLength(5);
  expect(plan.migration.up).toContain("FORCE ROW LEVEL SECURITY");
  expect(plan.migration.up).not.toContain(
    "CREATE TABLE platform.schema_migrations",
  );
  expect(plan.migration.up).toContain("guard.pending_scopes");
  expect(plan.migration.down.replace(/--[^\n]*/g, "")).not.toContain("CASCADE");
  expect(plan.migration.down).toContain("RAISE EXCEPTION");
  const extension = await readFile(
    "migrations/guard/platform-access.proposed.sql",
    "utf8",
  );
  expect(extension).toContain("module='guard'");
  expect(extension).not.toMatch(
    /DROP POLICY|ALTER.*sentinel\.|UPDATE.*sentinel\.|GRANT.*TO wetscan_app;/,
  );
  expect(fingerprint(plan.artifacts.map((a) => a.sha256))).toMatch(
    /^[a-f0-9]{64}$/,
  );
});
