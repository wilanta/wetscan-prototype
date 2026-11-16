import { it, expect } from "vitest";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { acceptanceFixture } from "./acceptance-fixture";
import {
  preserved,
  publicProjection,
  requireBeforeProjection,
  initialSentinelProjection,
  type PreservationProjection,
} from "../../../worker/guard/acceptance/preservation";
import { expectedFaultObserved } from "../../../worker/guard/acceptance/fault-proof";
function projection(
  f: Awaited<ReturnType<typeof acceptanceFixture>>,
): PreservationProjection {
  return {
    sentinel: {
      scope: "isolated G01 database; external Sentinel database not observed",
      preserved: true,
      beforeSha256: initialSentinelProjection,
      afterSha256: initialSentinelProjection,
      differentSections: [],
      state: {
        database: f.packet.target.database,
        serverPort: f.packet.target.port,
        marker: f.packet.target.marker,
        owner: "wetscan_guard_migrator",
      },
    },
    guard: {
      caseId: f.packet.caseId,
      database: f.packet.target.database,
      port: f.packet.target.port,
      marker: f.packet.target.marker,
      owner: "wetscan_guard_migrator",
      projectionSha256: "b".repeat(64),
      excludedJob: f.packet.binding?.jobId ?? null,
      excludedWorkers: f.packet.workerIds,
      currentCaseScans: 0,
      currentCaseJobs: 0,
      observedAt: new Date().toISOString(),
      rlsVerified: true,
    },
  };
}
it("compares exact retained rows/schema/fixture projections and rejects changed scope, stale fingerprints, hidden additions and RLS loss", async () => {
  const f = await acceptanceFixture("N04"),
    before = projection(f),
    after = {
      ...before,
      guard: { ...before.guard, currentCaseJobs: 1, currentCaseScans: 1 },
    };
  expect(
    preserved(before, after, "N04", f.binding.jobId, f.packet.workerIds)
      .originalRowsPreserved,
  ).toBe(true);
  for (const guard of [
    { ...after.guard, projectionSha256: "c".repeat(64) },
    { ...after.guard, excludedJob: "c".repeat(64) },
    { ...after.guard, excludedWorkers: [] },
    { ...after.guard, currentCaseScans: 2 },
    { ...after.guard, rlsVerified: false },
  ])
    expect(() =>
      preserved(
        before,
        { ...after, guard },
        "N04",
        f.binding.jobId,
        f.packet.workerIds,
      ),
    ).toThrow();
  expect(() =>
    preserved(
      before,
      {
        ...after,
        sentinel: { ...after.sentinel, afterSha256: "c".repeat(64) },
      },
      "N04",
      f.binding.jobId,
      f.packet.workerIds,
    ),
  ).toThrow();
  const input = {
    ...before,
    headers: { Authorization: "SYNTHETIC_UNIT_HEADER_MUST_NOT_PERSIST" },
    sentinel: {
      ...before.sentinel,
      cookie: "SYNTHETIC_UNIT_COOKIE_MUST_NOT_PERSIST",
    },
  };
  expect(JSON.stringify(publicProjection(input, f.packet))).not.toMatch(
    /SYNTHETIC_UNIT/,
  );
});
it("requires immutable fresh same-case BEFORE metadata rather than treating a missing observer as a ready boolean", async () => {
  const f = await acceptanceFixture("N04"),
    root = await mkdtemp(
      join(tmpdir(), "wetscan-g01-snapshot-unit-preservation-"),
    );
  try {
    await expect(
      requireBeforeProjection(f.packet, f.approve(), root),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(
      join(root, f.packet.runId + ".preservation.before.json"),
      JSON.stringify(projection(f)),
      { flag: "wx" },
    );
    expect(
      (await requireBeforeProjection(f.packet, f.approve(), root)).guard
        .currentCaseJobs,
    ).toBe(0);
  } finally {
    const actual = await realpath(root);
    if (
      dirname(actual).toLowerCase() !==
        (await realpath(tmpdir())).toLowerCase() ||
      !basename(actual).startsWith("wetscan-g01-snapshot-unit-preservation-")
    )
      throw Error("unsafe cleanup");
    await rm(actual, { recursive: true, force: true });
  }
});
it("only the intended observed fault permits later mutation; an unknown failure or externally aborted timer does not", async () => {
  const f = await acceptanceFixture("N05"),
    root = await mkdtemp(
      join(tmpdir(), "wetscan-g01-snapshot-unit-fault-proof-"),
    );
  try {
    expect(await expectedFaultObserved(f.packet, root)).toBe(false);
    const path = join(root, f.packet.runId + ".start-failure.0.json");
    await writeFile(
      path,
      JSON.stringify({ running: true, signalAborted: true, elapsedMs: 1500 }),
    );
    expect(await expectedFaultObserved(f.packet, root)).toBe(false);
    await writeFile(
      path,
      JSON.stringify({ running: true, signalAborted: false, elapsedMs: 1500 }),
    );
    expect(await expectedFaultObserved(f.packet, root)).toBe(true);
  } finally {
    const actual = await realpath(root);
    if (
      dirname(actual).toLowerCase() !==
        (await realpath(tmpdir())).toLowerCase() ||
      !basename(actual).startsWith("wetscan-g01-snapshot-unit-fault-proof-")
    )
      throw Error("unsafe cleanup");
    await rm(actual, { recursive: true, force: true });
  }
});
