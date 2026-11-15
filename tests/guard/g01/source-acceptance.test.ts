import { expect, it } from "vitest";
import {
  validateSourceAcceptance,
  sourceAcceptance,
} from "../../../src/features/guard/live/source-acceptance";
import { snapshotPolicy } from "../../../src/features/guard/live/snapshot";
import type {
  ProjectAuthority,
  SourceAccess,
} from "../../../src/features/guard/live/model";
const authority: ProjectAuthority = {
  grant: {
    mode: "live",
    workspaceId: "github-user-7:fixture",
    projectId: "github-123",
    actorId: "github-user-7",
    operations: ["read", "scan"],
    expiresAt: Date.now() + 60000,
  },
  repositoryId: "123",
  repositoryName: "fixture/repo",
  branch: "main",
  installationId: 1,
  userId: 7,
};
const permit = {
  schemaVersion: 1,
  module: "guard-source-acceptance",
  status: "APPROVED",
  approvedBy: "unit-test-not-real-approval",
  approvedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  origin: "http://localhost:3000",
  workspaceId: authority.grant.workspaceId,
  projectId: authority.grant.projectId,
  actorId: authority.grant.actorId,
  repositoryId: "123",
  commit: "a".repeat(40),
  operations: ["snapshot_read", "temporary_artifact_write", "cleanup"],
  maxFiles: snapshotPolicy.maxFiles,
  maxFileBytes: snapshotPolicy.maxFileBytes,
  maxTotalBytes: snapshotPolicy.maxTotalBytes,
};
it("binds an acceptance approval to exact current project/user/repository/commit/origin and bounded read operations", () => {
  expect(
    validateSourceAcceptance(permit, authority, permit.commit, permit.origin)
      .commit,
  ).toBe(permit.commit);
  for (const patch of [
    { module: "sentinel" },
    { repositoryId: "999" },
    { workspaceId: "other" },
    { actorId: "other" },
    { commit: "b".repeat(40) },
    { expiresAt: "2000-01-01" },
    { operations: ["scan"] },
    { maxFiles: 999999 },
  ])
    expect(() =>
      validateSourceAcceptance(
        { ...permit, ...patch },
        authority,
        permit.commit,
        permit.origin,
      ),
    ).toThrow("approval_required");
});
it("requires an operator approval before touching any provider", async () => {
  const source: SourceAccess = {
    authorize: async () => {
      throw new Error("must not call provider");
    },
    open: async () => {
      throw new Error("must not call provider");
    },
  };
  await expect(
    sourceAcceptance(
      authority,
      { commit: permit.commit },
      permit.origin,
      source,
      undefined,
    ),
  ).rejects.toThrow("approval_required");
  await expect(
    sourceAcceptance(
      authority,
      { commit: permit.commit, workspaceId: "forged" },
      permit.origin,
      source,
      undefined,
    ),
  ).rejects.toThrow("invalid_input");
});
