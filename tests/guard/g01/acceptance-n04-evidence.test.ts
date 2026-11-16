import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../../src/features/guard/live/github-source", () => ({
  githubSourceAccess: () => {
    throw Error("offline test must not reach live Auth/source");
  },
}));
vi.mock("../../../worker/guard/acceptance/database", () => ({
  caseDatabaseConfig: () => {
    throw Error("offline test must not reach purpose credentials/database");
  },
}));
import { mkdtemp, writeFile, rm, realpath, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { acceptanceFixture } from "./acceptance-fixture";
import { expectedFaultObserved } from "../../../worker/guard/acceptance/fault-proof";
import { finalizeObservedCase } from "../../../worker/guard/acceptance/finalize-case";
import { OwnerCaseActions } from "../../../worker/guard/acceptance/actions";
import { initialSentinelProjection } from "../../../worker/guard/acceptance/preservation";
import { CaseJournal } from "../../../worker/guard/acceptance/journal";
import { validatePacket } from "../../../worker/guard/acceptance/approval";
async function setup() {
  const f = await acceptanceFixture("N04"),
    root = await mkdtemp(join(tmpdir(), "wetscan-g01-n04-evidence-test-")),
    now = Date.now();
  const before = {
    sentinel: {
      scope: "isolated G01 database; external Sentinel database not observed",
      preserved: true,
      beforeSha256: initialSentinelProjection,
      afterSha256: initialSentinelProjection,
      differentSections: [],
      state: {
        database: f.packet.target.database,
        serverPort: 5432,
        owner: "wetscan_guard_migrator",
        marker: f.packet.target.marker,
      },
    },
    guard: {
      caseId: "N04",
      database: f.packet.target.database,
      port: 5432,
      marker: f.packet.target.marker,
      owner: "wetscan_guard_migrator",
      projectionSha256: "b".repeat(64),
      excludedJob: f.binding.jobId,
      excludedWorkers: f.packet.workerIds,
      currentCaseScans: 0,
      currentCaseJobs: 0,
      observedAt: new Date(now).toISOString(),
      rlsVerified: true,
    },
  };
  const boundary = {
    boundary: "grant_expired",
    issuedAt: now - 61000,
    expiresAt: now - 1000,
    authorizationCheckedAt: now,
    observedAt: now,
    realExpiryReached: true,
    actualElapsedMs: 61000,
    authorization: {
      operation: "scan",
      outcome: "denied",
      errorCode: "forbidden",
    },
  };
  const retry = {
    jobId: f.binding.jobId,
    workerId: f.packet.workerIds[0],
    attempt: 1,
    retryScheduled: false,
    failureCode: "handler_failed",
    observedAt: now,
  };
  const launch = { exitCode: 0, endedAt: now };
  const rows = {
    bindingMatches: true,
    scanCount: 1,
    queueCount: 1,
    scanState: "cancelled",
    queueState: "cancelled",
    attempts: 1,
    fence: 1,
    leaseActive: false,
    hasLeaseOwner: false,
    cancelRequested: true,
    heartbeat: "stopped",
    foundation: false,
    sandboxAudit: false,
    coverage: false,
    sourceAbsent: true,
    containerAbsent: true,
    attemptHistory: [{ attempt: 1, outcome: "cancelled", finished: true }],
  };
  const write = (suffix: string, value: unknown) =>
    writeFile(
      join(root, f.packet.runId + "." + suffix + ".json"),
      JSON.stringify(value),
    );
  await write("preservation.before", before);
  await write("preservation.after", {
    ...before,
    guard: { ...before.guard, currentCaseScans: 1, currentCaseJobs: 1 },
  });
  const evidence = async () => {
    await write("boundary", boundary);
    await write("retry-guard", retry);
    await write("launch.0.used.result", launch);
  };
  const cleanup = async () => {
    const actual = await realpath(root),
      parent = await realpath(tmpdir());
    if (
      dirname(actual).toLowerCase() !== parent.toLowerCase() ||
      !basename(actual).startsWith("wetscan-g01-n04-evidence-test-")
    )
      throw Error("unsafe cleanup");
    await rm(actual, { recursive: true, force: true });
  };
  return {
    ...f,
    root,
    before,
    boundary,
    retry,
    launch,
    rows,
    write,
    evidence,
    cleanup,
  };
}
it("OFFLINE N04 finalizer requires actual post-authorize forbidden,61s,stopped child and no scheduled retry before explicit cancellation", async () => {
  const f = await setup();
  try {
    expect(await expectedFaultObserved(f.packet, f.root)).toBe(false);
    await f.evidence();
    expect(await expectedFaultObserved(f.packet, f.root)).toBe(true);
    const result = await finalizeObservedCase(f.packet, f.root, f.rows);
    expect(result.observation).toMatchObject({
      authorizationDenied: true,
      retryScheduled: false,
      actualElapsedMs: 61000,
      cancelRequested: true,
    });
    expect(result.overallG01).toBe("PARTIALLY_COMPLETE");
  } finally {
    await f.cleanup();
  }
});
it.each([
  "pre_authorize",
  "wrong_error",
  "too_early",
  "unknown_launch",
  "retry_scheduled",
  "missing_retry_proof",
  "wrong_job",
])(
  "OFFLINE N04 %s evidence cannot unlock cancellation or PASS",
  async (mode) => {
    const f = await setup();
    try {
      await f.evidence();
      if (mode === "pre_authorize")
        await f.write("boundary", { ...f.boundary, authorization: undefined });
      if (mode === "wrong_error")
        await f.write("boundary", {
          ...f.boundary,
          authorization: { ...f.boundary.authorization, errorCode: "unknown" },
        });
      if (mode === "too_early")
        await f.write("boundary", {
          ...f.boundary,
          authorizationCheckedAt: f.boundary.issuedAt + 60001,
          actualElapsedMs: 60001,
        });
      if (mode === "unknown_launch")
        await f.write("launch.0.used.result", { status: "failed_no_retry" });
      if (mode === "retry_scheduled")
        await f.write("retry-guard", { ...f.retry, retryScheduled: true });
      if (mode === "missing_retry_proof")
        await rm(join(f.root, f.packet.runId + ".retry-guard.json"));
      if (mode === "wrong_job")
        await f.write("retry-guard", { ...f.retry, jobId: "e".repeat(64) });
      expect(await expectedFaultObserved(f.packet, f.root)).toBe(false);
      await expect(
        new OwnerCaseActions(
          f.packet,
          f.approve(),
          f.root,
          undefined,
          {},
        ).cancel(),
      ).rejects.toThrow("execution_not_ready");
      // No actual Auth/database/credential loader is reached; rejection is at the evidence gate.
      await expect(
        finalizeObservedCase(f.packet, f.root, f.rows),
      ).rejects.toThrow();
    } finally {
      await f.cleanup();
    }
  },
);
it.each([
  "two_attempts",
  "unfinished_attempt",
  "coverage",
  "lease_owner",
  "missing_cancel",
])(
  "OFFLINE N04 finalizer rejects %s despite valid expiry evidence",
  async (mode) => {
    const f = await setup();
    try {
      await f.evidence();
      if (mode === "two_attempts") {
        f.rows.attempts = 2;
        f.rows.attemptHistory.push({
          attempt: 2,
          outcome: "cancelled",
          finished: true,
        });
      }
      if (mode === "unfinished_attempt")
        f.rows.attemptHistory[0].finished = false;
      if (mode === "coverage") f.rows.coverage = true;
      if (mode === "lease_owner") f.rows.hasLeaseOwner = true;
      if (mode === "missing_cancel") f.rows.cancelRequested = false;
      await expect(
        finalizeObservedCase(f.packet, f.root, f.rows),
      ).rejects.toThrow("execution_not_ready");
    } finally {
      await f.cleanup();
    }
  },
);
it("OFFLINE N04 zero snapshot/container limits reject packet escalation and acquisitions before any receipt/effect", async () => {
  const f = await setup();
  try {
    expect(f.packet.limits).toMatchObject({
      snapshots: 0,
      containers: 0,
      enqueues: 1,
      launches: 1,
      cancels: 1,
    });
    expect(f.packet.containerNames).toEqual([]);
    expect(f.packet.daemon).toBeNull();
    expect(() =>
      validatePacket({
        ...f.packet,
        limits: { ...f.packet.limits, containers: 1 },
      }),
    ).toThrow("approval_required");
    expect(() =>
      validatePacket({
        ...f.packet,
        limits: { ...f.packet.limits, snapshots: 1 },
      }),
    ).toThrow("approval_required");
    await expect(
      new CaseJournal(f.root, f.packet, f.approve()).reserve("snapshot"),
    ).rejects.toThrow("approval_required");
    await expect(
      readFile(join(f.root, f.packet.runId + ".snapshot.0.used")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await f.cleanup();
  }
});
