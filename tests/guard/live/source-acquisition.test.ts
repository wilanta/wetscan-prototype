import { it, expect, vi, afterEach } from "vitest";
import { access, rm } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { tmpdir } from "node:os";
import {
  GuardSnapshotAdapter,
  snapshotPolicy,
} from "../../../src/features/guard/live/snapshot";
import { sourceFixture } from "./source-fixture";
import { sourceFailureMetadata } from "../../../worker/guard/source-failure";
vi.mock("server-only", () => ({}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function virtualDeadline() {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
  });
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  });
}
it("reproduces serial80 blobs exceeding the unchanged45s source deadline (offline timing model, not historical proof)", async () => {
  virtualDeadline();
  const f = sourceFixture({ count: 80, delay: 700 }),
    adapter = new GuardSnapshotAdapter(f.source);
  const result = adapter.acquire(f.grant, f.request).catch((e) => e);
  await vi.advanceTimersByTimeAsync(45001);
  const e = await result;
  expect(e.code).toBe("source_unavailable");
  expect(sourceFailureMetadata(e)).toMatchObject({
    phase: "blob",
    timedOut: true,
    cleanup: "NOT_CREATED",
    concurrency: 1,
  });
  expect(f.metrics()).toMatchObject({ active: 0, peak: 1 });
  expect(f.close).toHaveBeenCalledOnce();
  expect(snapshotPolicy.maxMs).toBe(45000);
});
it("operational3-wide acquisition hands all80 real fixture files to the caller within the same deadline without extending a grant", async () => {
  virtualDeadline();
  const f = sourceFixture({ count: 80, delay: 700 }),
    expiry = f.grant.expiresAt;
  const adapter = new GuardSnapshotAdapter(f.source, undefined, undefined, {
    blobConcurrency: 3,
  });
  const work = adapter.acquire(f.grant, f.request);
  await vi.advanceTimersByTimeAsync(18901);
  const snapshot = await work;
  try {
    expect(snapshot.files).toHaveLength(80);
    expect(snapshot.coverage.status).toBe("complete");
    expect(f.metrics()).toMatchObject({ active: 0, peak: 3, completed: 80 });
    expect(snapshot.expiresAt).toBe(expiry);
    expect(f.grant.expiresAt).toBe(expiry);
    expect(snapshot.files.map((x) => x.path)).toEqual(
      [...snapshot.files.map((x) => x.path)].sort(),
    );
    await access(await adapter.directory(snapshot));
  } finally {
    await adapter.dispose(snapshot);
  }
  expect(f.close).toHaveBeenCalledOnce();
}, 15000);
it("serial and bounded retrieval produce identical immutable manifests for the same source", async () => {
  const a = sourceFixture({ count: 7 }),
    b = sourceFixture({ count: 7 });
  const x = new GuardSnapshotAdapter(a.source),
    y = new GuardSnapshotAdapter(b.source, undefined, undefined, {
      blobConcurrency: 3,
    });
  const s = await x.acquire(a.grant, a.request),
    t = await y.acquire(b.grant, b.request);
  try {
    expect(t.digest).toBe(s.digest);
    expect(t.files).toEqual(s.files);
  } finally {
    await x.dispose(s);
    await y.dispose(t);
  }
}, 15000);
it.each([
  ["repository_denied", 403],
  ["github_rate_limited", 429],
])(
  "permission/rate failure %s aborts and drains the batch, never starts a fourth read",
  async (code, status) => {
    const f = sourceFixture({
      count: 8,
      delay: 2,
      failAt: 1,
      error: Object.assign(Error("SECRET_PROVIDER_TEXT"), { code, status }),
    });
    const a = new GuardSnapshotAdapter(f.source, undefined, undefined, {
      blobConcurrency: 3,
    });
    const e = await a.acquire(f.grant, f.request).catch((e) => e);
    expect(e.code).toBe(code);
    expect(f.blob.mock.calls.length).toBeLessThanOrEqual(3);
    expect(f.metrics().active).toBe(0);
    expect(f.close).toHaveBeenCalledOnce();
    expect(sourceFailureMetadata(e)?.cleanup).toBe("NOT_CREATED");
  },
);
it("corrupt content aborts other pending reads and never returns a snapshot", async () => {
  const f = sourceFixture({ count: 8, delay: 2, corruptAt: 1 }),
    a = new GuardSnapshotAdapter(f.source, undefined, undefined, {
      blobConcurrency: 3,
    });
  const e = await a.acquire(f.grant, f.request).catch((e) => e);
  expect(e.code).toBe("source_integrity");
  expect(f.metrics().active).toBe(0);
  expect(f.blob.mock.calls.length).toBeLessThanOrEqual(3);
  expect(f.close).toHaveBeenCalledOnce();
});
it("filesystem interruption reports actual verified normal cleanup and no source path in metadata", async () => {
  const f = sourceFixture({ count: 4 }),
    c = new AbortController();
  let root = "";
  const a = new GuardSnapshotAdapter(
    f.source,
    undefined,
    {
      afterWrite: async (r) => {
        root = r;
        c.abort();
      },
      beforeCleanup: async () => {},
    },
    { blobConcurrency: 3 },
  );
  const e = await a.acquire(f.grant, f.request, c.signal).catch((e) => e);
  expect(sourceFailureMetadata(e)).toMatchObject({
    phase: "write",
    parentCancelled: true,
    cleanup: "VERIFIED",
  });
  expect(JSON.stringify(sourceFailureMetadata(e))).not.toContain(root);
  await expect(access(root)).rejects.toMatchObject({ code: "ENOENT" });
});
it("unknown cleanup remains cleanup_failed with UNKNOWN evidence, never verified", async () => {
  const f = sourceFixture({ count: 3 }),
    c = new AbortController();
  let root = "";
  const a = new GuardSnapshotAdapter(
    f.source,
    async () => {
      throw Error("synthetic refusal");
    },
    {
      afterWrite: async (r) => {
        root = r;
        c.abort();
      },
      beforeCleanup: async () => {},
    },
    { blobConcurrency: 3 },
  );
  const e = await a.acquire(f.grant, f.request, c.signal).catch((e) => e);
  try {
    expect(e.code).toBe("cleanup_failed");
    expect(sourceFailureMetadata(e)?.cleanup).toBe("UNKNOWN");
  } finally {
    if (
      dirname(root).toLowerCase() !== tmpdir().toLowerCase() ||
      !basename(root).startsWith("wetscan-g01-snapshot-")
    )
      throw Error("fixture boundary");
    await rm(root, { recursive: true, force: true });
  }
});
it.each([0, 4, NaN, 1.5])(
  "rejects invalid trusted concurrency %s before provider access",
  async (n) => {
    const f = sourceFixture({ count: 1 }),
      a = new GuardSnapshotAdapter(f.source, undefined, undefined, {
        blobConcurrency: n,
      });
    await expect(a.acquire(f.grant, f.request)).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(f.source.authorize).not.toHaveBeenCalled();
  },
);
it("parallel reservations enforce file and aggregate bytes bounds before more requests", async () => {
  const f = sourceFixture({ count: 330, bytes: 65536 }),
    a = new GuardSnapshotAdapter(f.source, undefined, undefined, {
      blobConcurrency: 3,
    });
  const s = await a.acquire(f.grant, f.request);
  try {
    expect(s.coverage.bytes).toBeLessThanOrEqual(20000000);
    expect(s.files.length).toBe(305);
    expect(f.blob).toHaveBeenCalledTimes(305);
    expect(s.coverage.status).toBe("partial");
    expect(f.metrics().peak).toBeLessThanOrEqual(3);
  } finally {
    await a.dispose(s);
  }
}, 20000);

it("post-download revocation prevents source handoff and filesystem allocation", async () => {
  const f = sourceFixture({ count: 7 });
  const allowed = await f.source.authorize();
  vi.mocked(f.source.authorize)
    .mockReset()
    .mockResolvedValueOnce(allowed)
    .mockRejectedValueOnce(
      Object.assign(Error("PRIVATE_REASON"), { code: "forbidden" }),
    );
  const a = new GuardSnapshotAdapter(f.source, undefined, undefined, {
    blobConcurrency: 3,
  });
  const e = await a.acquire(f.grant, f.request).catch((e) => e);
  expect(e.code).toBe("forbidden");
  expect(sourceFailureMetadata(e)).toMatchObject({
    phase: "final_authorize",
    cleanup: "NOT_CREATED",
    retrievedFiles: 7,
  });
  expect(f.metrics().active).toBe(0);
  expect(f.close).toHaveBeenCalledOnce();
});
it("parallel acquisition never fetches sensitive paths, symlinks or submodules", async () => {
  const f = sourceFixture({ count: 2 }),
    sample = f.entries[0];
  f.entries.push(
    { ...sample, path: ".env" },
    { ...sample, path: "secrets/token.key" },
    { ...sample, path: "link.js", mode: "120000" },
    { ...sample, path: "vendor/sub", type: "commit", mode: "160000" },
  );
  const a = new GuardSnapshotAdapter(f.source, undefined, undefined, {
      blobConcurrency: 3,
    }),
    s = await a.acquire(f.grant, f.request);
  try {
    expect(f.blob).toHaveBeenCalledTimes(2);
    expect(s.files).toHaveLength(2);
    expect(s.coverage.exclusions).toHaveLength(4);
    expect(s.coverage.status).toBe("partial");
  } finally {
    await a.dispose(s);
  }
});
it("parallel acquisition reserves at most1000 files, including in-flight reads", async () => {
  const f = sourceFixture({ count: 1002 }),
    a = new GuardSnapshotAdapter(f.source, undefined, undefined, {
      blobConcurrency: 3,
    }),
    s = await a.acquire(f.grant, f.request);
  try {
    expect(s.files).toHaveLength(1000);
    expect(f.blob).toHaveBeenCalledTimes(1000);
    expect(
      s.coverage.exclusions.filter((x) => x.reason === "file_limit"),
    ).toHaveLength(2);
  } finally {
    await a.dispose(s);
  }
}, 20000);
