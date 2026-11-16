import { expect, it } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import {
  ResourceRegistry,
  eligibleContainer,
  eligibleSource,
  type ResourceRecord,
} from "../../../worker/guard/acceptance/registry";
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "wetscan-g01-snapshot-registry-")),
    source = join(root, "source");
  await mkdir(source);
  const r: ResourceRecord = {
    version: 2,
    runId: "a".repeat(36),
    caseId: "I01",
    jobId: "b".repeat(64),
    specDigest: "c".repeat(64),
    image: "fixed@sha256:" + "d".repeat(64),
    imageId: "sha256:" + "e".repeat(64),
    name: "wetscan-guard-" + "f".repeat(36),
    containerId: "1".repeat(64),
    deadline: Date.now() - 1,
    source: root,
    createdAt: Date.now() - 3600000,
    sourceExpiresAt: Date.now() - 1,
  };
  return {
    root,
    r,
    registry: new ResourceRegistry(root),
    clean: async () => {
      const p = resolve(root);
      if (
        dirname(p) !== resolve(tmpdir()) ||
        !basename(p).startsWith("wetscan-g01-snapshot-registry-")
      )
        throw Error("unsafe");
      await rm(p, { recursive: true, force: true });
    },
  };
}
it("wx physically denies overlapping containers and preserves lock on unverified absence", async () => {
  const f = await fixture();
  try {
    await f.registry.reserve(f.r);
    await expect(
      f.registry.reserve({ ...f.r, name: "wetscan-guard-" + "a".repeat(36) }),
    ).rejects.toThrow("execution_not_ready");
    await expect(f.registry.release(f.r, false)).rejects.toThrow(
      "cleanup_failed",
    );
    expect((await f.registry.current()).jobId).toBe(f.r.jobId);
    await f.registry.release(f.r, true);
    await f.registry.reserve({
      ...f.r,
      name: "wetscan-guard-" + "a".repeat(36),
    });
  } finally {
    await f.clean();
  }
});
it("orphan container needs exact ID/run/job/spec/image and actual deadline", async () => {
  const f = await fixture();
  try {
    const m = {
      Id: f.r.containerId,
      Name: "/" + f.r.name,
      Image: f.r.imageId,
      Config: {
        Image: f.r.image,
        Labels: {
          "wetscan.run": f.r.runId,
          "wetscan.job": f.r.jobId,
          "wetscan.spec": f.r.specDigest,
          "wetscan.deadline": String(f.r.deadline),
        },
      },
    };
    expect(eligibleContainer(f.r, m)).toBe(true);
    expect(eligibleContainer({ ...f.r, deadline: Date.now() + 1e5 }, m)).toBe(
      false,
    );
    expect(eligibleContainer(f.r, { ...m, Id: "2".repeat(64) })).toBe(false);
    expect(
      eligibleContainer(f.r, {
        ...m,
        Config: {
          ...m.Config,
          Labels: { ...m.Config.Labels, "wetscan.job": "foreign" },
        },
      }),
    ).toBe(false);
  } finally {
    await f.clean();
  }
});
it("source orphan retains the actual one-hour boundary and unmodified marker", async () => {
  const f = await fixture();
  try {
    const now = Date.now(),
      record = { ...f.r, createdAt: now - 3600000, sourceExpiresAt: now - 1 },
      marker = {
        version: 1,
        kind: "guard-source",
        rootName: basename(record.source),
        createdAt: record.createdAt,
        expiresAt: record.sourceExpiresAt,
      };
    expect(eligibleSource(record, marker, now)).toBe(true);
    expect(
      eligibleSource(
        { ...record, createdAt: now - 3599999 },
        { ...marker, createdAt: now - 3599999 },
        now,
      ),
    ).toBe(false);
    expect(eligibleSource(record, { ...marker, createdAt: 0 }, now)).toBe(
      false,
    );
    await writeFile(join(f.root, "retained.used"), "preserve");
  } finally {
    await f.clean();
  }
});
