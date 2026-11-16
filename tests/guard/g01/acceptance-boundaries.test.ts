import { it, expect, vi } from "vitest";
import {
  mkdtemp,
  writeFile,
  rm,
  realpath,
  readFile,
  lstat,
} from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { CaseFaults } from "../../../worker/guard/acceptance/faults";
import { waitForAbort } from "../../../worker/guard/acceptance/checkpoints";
import { proveN04Denial } from "../../../worker/guard/acceptance/n04";
import { authorize } from "../../../src/features/guard/security";
import {
  ResourceRegistry,
  type ResourceRecord,
} from "../../../worker/guard/acceptance/registry";
import { scopedProbeSandbox } from "../../../worker/guard/acceptance/scoped-sandbox";
import {
  makeProbeSpec,
  probeProgram,
  probeImage,
} from "../../../worker/guard/acceptance/probe-spec";
import { materializeWindowB } from "../../../worker/guard/acceptance/window-b";
import {
  validateExecution,
  hash,
} from "../../../worker/guard/acceptance/approval";
import {
  reapRegisteredContainer,
  reapRegisteredSource,
} from "../../../worker/guard/acceptance/reaper";
import { GuardSnapshotAdapter } from "../../../src/features/guard/live/snapshot";
import { sandboxControls } from "../../../worker/guard/sandbox";
import { fingerprint } from "../../../src/platform/identity";
import { acceptanceFixture } from "./acceptance-fixture";
import { offlineDocker } from "./acceptance-docker-fixture";
const actions = () => ({
  event: vi.fn(async () => {}),
  cancel: vi.fn(async () => {}),
  revoked: vi.fn(async () => {}),
  crashChild: vi.fn(async () => {}),
  parentCrashReady: vi.fn(async (signal: AbortSignal) => waitForAbort(signal)),
});
it("N01 offline: an acquired source checkpoint cannot succeed after the normal-session revocation observer rejects it", async () => {
  const a = actions(),
    fault = new CaseFaults("N01", a);
  await expect(
    fault.checkpoints.reach("acquired", new AbortController().signal),
  ).rejects.toThrow("not_found");
  expect(a.revoked).toHaveBeenCalledOnce();
  expect(a.cancel).not.toHaveBeenCalled();
});
it.each(["N02", "N03"] as const)(
  "%s offline: holds only at actual running checkpoint, aborts without success and cannot fire its fault twice",
  async (caseId) => {
    const a = actions(),
      fault = new CaseFaults(caseId, a),
      abort = new AbortController(),
      task = fault.checkpoints.reach("container_started", abort.signal),
      assertion = expect(task).rejects.toThrow("source_unavailable");
    await vi.waitFor(() => expect(a.event).toHaveBeenCalledOnce());
    abort.abort();
    await assertion;
    expect(a.cancel).toHaveBeenCalledTimes(caseId === "N02" ? 1 : 0);
    await fault.checkpoints.reach(
      "container_started",
      new AbortController().signal,
    );
    expect(a.event).toHaveBeenCalledOnce();
  },
);
it("N04 offline CLOCK DOUBLE: waits the full grant expiry, leaves the grant unchanged and authorization rejects it", async () => {
  const f = await acceptanceFixture("N04");
  vi.useFakeTimers();
  try {
    const grant = {
        ...f.grant,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60000,
      },
      original = structuredClone(grant);
    let settled = false;
    const task = proveN04Denial(
      grant,
      f.binding,
      new AbortController().signal,
    ).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(60999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await task;
    expect(grant).toEqual(original);
    expect(() => authorize(grant, f.binding, "scan")).toThrow();
  } finally {
    vi.useRealTimers();
  }
});
it("C01/C02A offline: exact first-attempt process callbacks fire once, recovery attempts cannot repeat crash injection", async () => {
  for (const caseId of ["C01", "C02A"] as const) {
    const a = actions(),
      fault = new CaseFaults(caseId, a),
      abort = new AbortController(),
      task = fault.checkpoints.reach("container_started", abort.signal),
      assertion = expect(task).rejects.toThrow("source_unavailable");
    await vi.waitFor(() =>
      expect(
        caseId === "C01" ? a.crashChild : a.parentCrashReady,
      ).toHaveBeenCalledOnce(),
    );
    abort.abort();
    await assertion;
    const recovery = new CaseFaults(caseId, a, false);
    await recovery.checkpoints.reach(
      "container_started",
      new AbortController().signal,
    );
    expect(
      caseId === "C01" ? a.crashChild : a.parentCrashReady,
    ).toHaveBeenCalledOnce();
  }
});
async function ownedTemp(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), "wetscan-g01-snapshot-" + prefix));
  return {
    root,
    clean: async () => {
      const path = await realpath(root);
      if (
        dirname(path).toLowerCase() !==
          (await realpath(tmpdir())).toLowerCase() ||
        !basename(path).startsWith("wetscan-g01-snapshot-" + prefix)
      )
        throw Error("unsafe owned unit cleanup");
      await rm(path, { recursive: true, force: true });
    },
  };
}
it("N07 offline: the real owned-sandbox removal boundary fails closed; exact identity and actual deadline are required for its single rescue", async () => {
  const f = await acceptanceFixture("N07"),
    source = await ownedTemp("unit-n07-source-"),
    registryRoot = await ownedTemp("unit-n07-registry-"),
    config = await mkdtemp(join(tmpdir(), "wetscan-g01-docker-"));
  try {
    const spec = makeProbeSpec(
        await probeProgram(),
        { mode: "manifest", holdMs: 0 },
        500,
      ),
      driver = offlineDocker(spec.image),
      registry = new ResourceRegistry(registryRoot.root),
      a = actions(),
      fault = new CaseFaults("N07", a),
      record: ResourceRecord = {
        version: 2,
        runId: f.packet.runId,
        caseId: "N07",
        jobId: f.binding.jobId,
        specDigest: fingerprint(spec),
        image: spec.image,
        imageId: f.packet.daemon!.imageId,
        name: f.packet.containerNames[0],
        containerId: null,
        deadline: Date.now() + 500,
        source: await realpath(source.root),
        createdAt: Date.now(),
        sourceExpiresAt: Date.now() + 60000,
      };
    await expect(
      scopedProbeSandbox(
        spec,
        {
          verify: async () => ({
            expiresAt: Date.now() + 60000,
            verified: sandboxControls,
            artifactRef: "OFFLINE_DOUBLE_ONLY",
          }),
        },
        registry,
        record,
        driver,
        fault.checkpoints,
      ).execute(source.root, new AbortController().signal),
    ).rejects.toThrow("cleanup_failed");
    expect(driver.entries.size).toBe(1);
    expect((await registry.current()).jobId).toBe(f.binding.jobId);
    const created = JSON.parse(
      await readFile(
        join(registryRoot.root, record.name + ".created.json"),
        "utf8",
      ),
    );
    await expect(
      reapRegisteredContainer(created, registry, driver, config),
    ).rejects.toThrow("cleanup_failed");
    await delay(Math.max(0, record.deadline - Date.now() + 1));
    expect(
      await reapRegisteredContainer(created, registry, driver, config),
    ).toEqual({ containerAbsent: true });
    expect(driver.entries.size).toBe(0);
    expect(a.event).toHaveBeenCalledOnce();
  } finally {
    await source.clean();
    await registryRoot.clean();
    const actual = await realpath(config);
    if (
      dirname(actual).toLowerCase() !==
        (await realpath(tmpdir())).toLowerCase() ||
      !basename(actual).startsWith("wetscan-g01-docker-")
    )
      throw Error("unsafe config cleanup");
    await rm(actual, { recursive: true, force: true });
  }
}, 10000);
it("C02B offline CLOCK DOUBLE: no marker rewrite, exact 1h boundary, independent after-hour approval and actual owned-root cleanup", async () => {
  const a = await acceptanceFixture("C02A"),
    b = await acceptanceFixture("C02B"),
    source = await ownedTemp("unit-window-b-");
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    const createdAt = Date.now(),
      record: ResourceRecord = {
        version: 2,
        runId: a.packet.runId,
        caseId: "C02A",
        jobId: a.binding.jobId,
        specDigest: a.packet.specDigests[0],
        image: probeImage,
        imageId: a.packet.daemon!.imageId,
        name: a.packet.containerNames[0],
        containerId: "1".repeat(64),
        deadline: createdAt + 120000,
        source: await realpath(source.root),
        createdAt,
        sourceExpiresAt: createdAt + 60000,
      },
      marker = JSON.stringify({
        version: 1,
        kind: "guard-source",
        rootName: basename(source.root),
        createdAt,
        expiresAt: record.sourceExpiresAt,
      });
    await writeFile(source.root + ".lease", marker);
    const bytes = Buffer.from(JSON.stringify(record)),
      result = {
        caseId: "C02A",
        status: "PASS",
        classification: "LIVE_VERIFIED_FOUNDATION_ACCEPTANCE",
        packetSha256: hash(JSON.stringify(a.packet)),
        observation: {
          deferredSourceOrphan: true,
          containerAbsent: true,
          leaseActive: false,
        },
      };
    await expect(
      materializeWindowB(a.packet, b.packet, bytes, result),
    ).rejects.toThrow("execution_not_ready");
    vi.setSystemTime(createdAt + 3599999);
    await expect(
      materializeWindowB(a.packet, b.packet, bytes, result),
    ).rejects.toThrow("execution_not_ready");
    expect(await readFile(source.root + ".lease", "utf8")).toBe(marker);
    vi.setSystemTime(createdAt + 3600000);
    const prepared = await materializeWindowB(
        a.packet,
        b.packet,
        bytes,
        result,
      ),
      approval = {
        ...b.approve(),
        packetSha256: prepared.packetSha256,
        approvedAt: new Date().toISOString(),
      };
    expect(() =>
      validateExecution(prepared.packet, {
        ...approval,
        approvedAt: new Date(createdAt + 3599999).toISOString(),
      }),
    ).toThrow("approval_required");
    expect(validateExecution(prepared.packet, approval).packet.caseId).toBe(
      "C02B",
    );
    const deny = {
      authorize: async () => {
        throw Error("no source/DB permission");
      },
      open: async () => {
        throw Error("no source/DB permission");
      },
    };
    expect(
      await reapRegisteredSource(
        prepared.packet,
        approval,
        bytes,
        new GuardSnapshotAdapter(deny),
      ),
    ).toMatchObject({
      sourceAbsent: true,
      actualAgeMs: 3600000,
      markerUnchanged: true,
    });
    await expect(lstat(source.root)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(source.root + ".lease")).rejects.toMatchObject({
      code: "ENOENT",
    });
  } finally {
    vi.useRealTimers();
    try {
      await source.clean();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    await rm(source.root + ".lease", { force: true });
  }
});
