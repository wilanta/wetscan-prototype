import { expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fingerprint } from "../../../src/platform/identity";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import {
  validateSourceAcceptance,
  sourceAcceptance,
} from "../../../src/features/guard/live/source-acceptance";
import {
  GuardSnapshotAdapter,
  snapshotPolicy,
} from "../../../src/features/guard/live/snapshot";
import type {
  ProjectAuthority,
  SourceAccess,
  GuardSnapshot,
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
    { approvedAt: new Date(Date.now() - 7200000).toISOString() },
    { branch: "other-branch" },
    { operations: [...permit.operations, "cleanup"] },
    { operations: ["scan"] },
    { maxFiles: 999999 },
    { attemptId: "../escape" },
    { attemptId: null },
    { attemptId: 7 },
    { attemptId: "00000000-0000-0000-0000-000000000000" },
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

it("preserves an existing one-attempt marker and rejects replay before provider access", async () => {
  const root = await mkdtemp(join(tmpdir(), "wetscan-source-permit-test-"));
  try {
    const file = join(root, "approval.json");
    const approval = {
      ...permit,
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };
    const marker = JSON.stringify({
      module: approval.module,
      approvalDigest: fingerprint(approval),
      at: new Date().toISOString(),
    });
    await writeFile(file, JSON.stringify(approval));
    await writeFile(file + ".used", marker, { flag: "wx" });
    const source = { authorize: vi.fn(), open: vi.fn() } as SourceAccess;
    await expect(
      sourceAcceptance(
        authority,
        { commit: approval.commit },
        approval.origin,
        source,
        file,
      ),
    ).rejects.toThrow("approval_required");
    expect(source.authorize).not.toHaveBeenCalled();
    expect(source.open).not.toHaveBeenCalled();
    expect(await readFile(file + ".used", "utf8")).toBe(marker);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("consumes an approved attempt on provider failure and does not hide the first error as approval_required", async () => {
  const root = await mkdtemp(join(tmpdir(), "wetscan-source-permit-test-"));
  try {
    const file = join(root, "approval.json");
    const approval = {
      ...permit,
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };
    await writeFile(file, JSON.stringify(approval));
    const source = {
      authorize: vi.fn(async () => {
        throw new LiveGuardError("source_unavailable");
      }),
      open: vi.fn(),
    } as SourceAccess;
    const run = () =>
      sourceAcceptance(
        authority,
        { commit: approval.commit },
        approval.origin,
        source,
        file,
      );
    await expect(run()).rejects.toThrow("source_unavailable");
    const firstMarker = await readFile(file + ".used", "utf8");
    expect(JSON.parse(firstMarker).approvalDigest).toBe(fingerprint(approval));
    await expect(run()).rejects.toThrow("approval_required");
    expect(await readFile(file + ".used", "utf8")).toBe(firstMarker);
    expect(source.authorize).toHaveBeenCalledTimes(1);
    expect(source.open).not.toHaveBeenCalled();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const attemptId = "12345678-1234-4234-8234-123456789abc";
const freshApproval = () => ({
  ...permit,
  attemptId,
  approvedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60000).toISOString(),
});
it("requires a new operator attempt identity without erasing or reusing the legacy marker", async () => {
  const root = await mkdtemp(join(tmpdir(), "wetscan-source-permit-test-"));
  try {
    const file = join(root, "approval.json"),
      approval = freshApproval();
    await writeFile(file, JSON.stringify(approval));
    await writeFile(file + ".used", "preserved-legacy-evidence", {
      flag: "wx",
    });
    const source = {
      authorize: vi.fn(async () => {
        throw new LiveGuardError("source_unavailable");
      }),
      open: vi.fn(),
    } as SourceAccess;
    const run = () =>
      sourceAcceptance(
        authority,
        { commit: approval.commit },
        approval.origin,
        source,
        file,
      );
    await expect(run()).rejects.toThrow("source_unavailable");
    const marker = file + ".used." + attemptId,
      original = await readFile(marker, "utf8");
    expect(await readFile(file + ".used", "utf8")).toBe(
      "preserved-legacy-evidence",
    );
    const journal = JSON.parse(await readFile(marker + ".result.json", "utf8"));
    expect(journal).toMatchObject({
      status: "failed",
      phase: "acquiring",
      cleanup: "NOT_VERIFIED",
      error: "source_unavailable",
      approvalDigest: fingerprint(approval),
      attemptId,
    });
    await writeFile(
      file,
      JSON.stringify({
        ...approval,
        approvedBy: "changed-operator-field-must-not-reset-attempt",
      }),
    );
    await expect(run()).rejects.toThrow("approval_required");
    expect(source.authorize).toHaveBeenCalledTimes(1);
    expect(await readFile(marker, "utf8")).toBe(original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("allows only one reservation for concurrent identical approved attempts", async () => {
  const root = await mkdtemp(join(tmpdir(), "wetscan-source-permit-test-"));
  try {
    const file = join(root, "approval.json"),
      approval = freshApproval();
    await writeFile(file, JSON.stringify(approval));
    const source = {
      authorize: vi.fn(async () => {
        throw new LiveGuardError("source_unavailable");
      }),
      open: vi.fn(),
    } as SourceAccess;
    const run = () =>
      sourceAcceptance(
        authority,
        { commit: approval.commit },
        approval.origin,
        source,
        file,
      );
    const result = await Promise.allSettled([run(), run()]);
    expect(
      result
        .map((r) => (r.status === "rejected" ? r.reason.code : "unexpected"))
        .sort(),
    ).toEqual(["approval_required", "source_unavailable"]);
    expect(source.authorize).toHaveBeenCalledTimes(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("records only a fixed safe error code and preserves the original provider error", async () => {
  const root = await mkdtemp(join(tmpdir(), "wetscan-source-permit-test-"));
  try {
    const file = join(root, "approval.json"),
      approval = freshApproval();
    await writeFile(file, JSON.stringify(approval));
    const failure = Object.assign(
      new Error("synthetic-private-message-must-not-be-journaled"),
      { code: "unreviewed_provider_code" },
    );
    const source = {
      authorize: vi.fn(async () => {
        throw failure;
      }),
      open: vi.fn(),
    } as SourceAccess;
    await expect(
      sourceAcceptance(
        authority,
        { commit: approval.commit },
        approval.origin,
        source,
        file,
      ),
    ).rejects.toBe(failure);
    const raw = await readFile(
      file + ".used." + attemptId + ".result.json",
      "utf8",
    );
    expect(JSON.parse(raw).error).toBe("source_unavailable");
    expect(raw).not.toContain("synthetic-private");
    expect(raw).not.toContain("unreviewed_provider_code");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("journals completion only after cleanup and excludes raw file paths and exclusion digests", async () => {
  const root = await mkdtemp(join(tmpdir(), "wetscan-source-permit-test-"));
  const snapshot = {
    mode: "live",
    workspaceId: authority.grant.workspaceId,
    projectId: authority.grant.projectId,
    repository: {
      provider: "github",
      repositoryId: "123",
      branch: "main",
      commit: permit.commit,
    },
    expiresAt: Date.now() + 60000,
    files: [],
    digest: "c".repeat(64),
    sourceKind: "github",
    tree: "b".repeat(40),
    policyVersion: "guard-source-v1",
    coverage: {
      status: "partial",
      treeTruncated: false,
      eligibleFiles: 0,
      retrievedFiles: 0,
      bytes: 0,
      exclusions: [{ pathDigest: "d".repeat(64), reason: "sensitive_path" }],
    },
  } as GuardSnapshot;
  const acquire = vi
    .spyOn(GuardSnapshotAdapter.prototype, "acquire")
    .mockResolvedValue(snapshot);
  const dispose = vi
    .spyOn(GuardSnapshotAdapter.prototype, "dispose")
    .mockResolvedValue();
  try {
    const file = join(root, "approval.json"),
      approval = freshApproval();
    await writeFile(file, JSON.stringify(approval));
    const result = await sourceAcceptance(
      authority,
      { commit: approval.commit },
      approval.origin,
      { authorize: vi.fn(), open: vi.fn() } as SourceAccess,
      file,
    );
    expect(result.cleanup).toBe("verified");
    expect(dispose).toHaveBeenCalledWith(snapshot);
    const raw = await readFile(
      file + ".used." + attemptId + ".result.json",
      "utf8",
    );
    expect(JSON.parse(raw)).toMatchObject({
      status: "completed",
      cleanup: "verified",
      scannerExecution: "NOT_RUN",
      snapshotDigest: snapshot.digest,
      coverage: { exclusionCounts: { sensitive_path: 1 } },
    });
    expect(raw).not.toContain("pathDigest");
    expect(raw).not.toContain("d".repeat(64));
  } finally {
    acquire.mockRestore();
    dispose.mockRestore();
    await rm(root, { recursive: true, force: true });
  }
});
it("does not journal or return success when source cleanup fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "wetscan-source-permit-test-"));
  const acquire = vi
    .spyOn(GuardSnapshotAdapter.prototype, "acquire")
    .mockResolvedValue({
      repository: { commit: permit.commit },
      tree: "b".repeat(40),
      digest: "c".repeat(64),
      coverage: { status: "complete", bytes: 0, exclusions: [] },
      files: [],
    } as unknown as GuardSnapshot);
  const dispose = vi
    .spyOn(GuardSnapshotAdapter.prototype, "dispose")
    .mockRejectedValue(new LiveGuardError("cleanup_failed"));
  try {
    const file = join(root, "approval.json"),
      approval = freshApproval();
    await writeFile(file, JSON.stringify(approval));
    await expect(
      sourceAcceptance(
        authority,
        { commit: approval.commit },
        approval.origin,
        { authorize: vi.fn(), open: vi.fn() } as SourceAccess,
        file,
      ),
    ).rejects.toThrow("cleanup_failed");
    expect(
      JSON.parse(
        await readFile(file + ".used." + attemptId + ".result.json", "utf8"),
      ),
    ).toMatchObject({
      status: "failed",
      phase: "cleanup",
      cleanup: "NOT_VERIFIED",
      error: "cleanup_failed",
    });
  } finally {
    acquire.mockRestore();
    dispose.mockRestore();
    await rm(root, { recursive: true, force: true });
  }
});

it("rejects client attempt identities before approval or provider access", async () => {
  const source = { authorize: vi.fn(), open: vi.fn() } as SourceAccess;
  await expect(
    sourceAcceptance(
      authority,
      { commit: permit.commit, attemptId },
      permit.origin,
      source,
      undefined,
    ),
  ).rejects.toThrow("invalid_input");
  expect(source.authorize).not.toHaveBeenCalled();
  expect(source.open).not.toHaveBeenCalled();
});
it("fails closed rather than overwriting pre-existing terminal evidence or claiming success", async () => {
  const root = await mkdtemp(join(tmpdir(), "wetscan-source-permit-test-"));
  const acquire = vi
    .spyOn(GuardSnapshotAdapter.prototype, "acquire")
    .mockResolvedValue({
      repository: { commit: permit.commit },
      tree: "b".repeat(40),
      digest: "c".repeat(64),
      coverage: { status: "complete", bytes: 0, exclusions: [] },
      files: [],
    } as unknown as GuardSnapshot);
  const dispose = vi
    .spyOn(GuardSnapshotAdapter.prototype, "dispose")
    .mockResolvedValue();
  try {
    const file = join(root, "approval.json"),
      approval = freshApproval();
    await writeFile(file, JSON.stringify(approval));
    const resultPath = file + ".used." + attemptId + ".result.json";
    await writeFile(resultPath, "retained-existing-evidence", { flag: "wx" });
    await expect(
      sourceAcceptance(
        authority,
        { commit: approval.commit },
        approval.origin,
        { authorize: vi.fn(), open: vi.fn() } as SourceAccess,
        file,
      ),
    ).rejects.toThrow("source_unavailable");
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(await readFile(resultPath, "utf8")).toBe(
      "retained-existing-evidence",
    );
  } finally {
    acquire.mockRestore();
    dispose.mockRestore();
    await rm(root, { recursive: true, force: true });
  }
});
