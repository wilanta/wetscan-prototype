import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join, resolve, relative } from "node:path";
import { tmpdir } from "node:os";
vi.mock("server-only", () => ({}));
import { FileCanvasGraphStore } from "../../src/features/canvas/server/graph-cache";
import { CanvasGraphService } from "../../src/features/canvas/server/graph-service";
import type { CanvasCacheIdentity } from "../../src/features/canvas/cache-contracts";
import { SnapshotCanvasSource } from "../../src/features/canvas/adapters/snapshot-source";
import { memorySnapshot } from "../../src/features/canvas/discovery/snapshot";
const shaA = "a".repeat(40),
  shaB = "b".repeat(40);
const identity: CanvasCacheIdentity = {
  workspace: "github-user-1:workspace",
  userId: 1,
  provider: "github",
  installationId: 77,
  repositoryId: 101,
  repositoryName: "private/repository",
};
let directory: string;
let store: FileCanvasGraphStore;
async function graph(revision = shaA, target = identity) {
  const snapshot = memorySnapshot(
    {
      "package.json": '{"dependencies":{"next":"16"}}',
      [`src/app/api/${revision === shaA ? "orders" : "billing"}/route.ts`]:
        "export async function GET() { return Response.json({ ok: true }); }",
    },
    {
      sourceKind: "github",
      repositoryRef: `github-user-${target.userId}/github-${target.repositoryId}`,
      revision,
    },
  );
  return SnapshotCanvasSource(snapshot).loadGraph({
    projectRef: snapshot.repositoryRef,
  });
}
function provider() {
  return {
    authorize: vi.fn(async () => identity),
    head: vi.fn(async () => shaA),
    analyze: vi.fn(async (_identity: CanvasCacheIdentity, revision: string) =>
      graph(revision),
    ),
    validateSession: vi.fn(async () => undefined),
  };
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "wetscan-canvas-cache-"));
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("hex"));
  vi.stubEnv("AUTH_DATA_DIR", directory);
});
beforeEach(() => {
  store = new FileCanvasGraphStore();
});
afterEach(async () => {
  await store.purge(identity);
});
afterAll(async () => {
  if (
    !relative(resolve(tmpdir()), resolve(directory)).startsWith(
      "wetscan-canvas-cache-",
    )
  )
    throw new Error("Unsafe cleanup");
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
it("analyzes first visit, then serves disk cache without a HEAD check or source download", async () => {
  const source = provider(),
    service = new CanvasGraphService(store, source);
  const first = await service.load("load"),
    second = await service.load("load");
  expect(first).toMatchObject({ state: "ready", cached: false });
  expect(second).toMatchObject({ state: "ready", cached: true });
  expect(source.authorize).toHaveBeenCalledTimes(3);
  expect(source.head).toHaveBeenCalledTimes(1);
  expect(source.analyze).toHaveBeenCalledTimes(1);
});
it("survives a fresh storage/service instance and encrypts its private graph", async () => {
  await store.put(identity, await graph());
  const recreated = new CanvasGraphService(
    new FileCanvasGraphStore(),
    provider(),
  );
  expect(await recreated.cached()).toMatchObject({
    repositoryName: identity.repositoryName,
    graph: { revision: shaA },
  });
  const files = await readdir(join(directory, "canvas-graphs-v1"));
  expect(files.length).toBeGreaterThan(0);
  expect(
    (await readFile(join(directory, "canvas-graphs-v1", files[0]))).toString(),
  ).not.toContain("orders");
});
it("same commit is up to date without analyzing again", async () => {
  const source = provider(),
    service = new CanvasGraphService(store, source);
  await service.load("load");
  expect(await service.load("check")).toEqual({
    state: "up_to_date",
    revision: shaA,
  });
  expect(source.analyze).toHaveBeenCalledTimes(1);
});
it("reports a new commit while keeping old graph, then swaps only after a successful refresh", async () => {
  const source = provider(),
    service = new CanvasGraphService(store, source);
  await service.load("load");
  source.head.mockResolvedValue(shaB);
  expect(await service.load("check")).toEqual({
    state: "new_revision",
    revision: shaB,
  });
  expect((await service.cached())?.graph.revision).toBe(shaA);
  expect(await service.load("refresh")).toMatchObject({
    state: "ready",
    entry: { graph: { revision: shaB } },
  });
  expect(
    (await service.cached())?.graph.nodes.some(
      (n) => n.label === "/api/billing",
    ),
  ).toBe(true);
});
it("failed refresh retains the previous valid graph and only returns a nonblocking failure after reauthorization", async () => {
  const source = provider(),
    service = new CanvasGraphService(store, source);
  await service.load("load");
  source.head.mockResolvedValue(shaB);
  source.analyze.mockRejectedValue(new Error("provider failure"));
  expect(await service.load("refresh")).toMatchObject({
    state: "refresh_failed",
  });
  expect((await service.cached())?.graph.revision).toBe(shaA);
});
it("fails closed when cached graph authorization is revoked", async () => {
  const source = provider(),
    service = new CanvasGraphService(store, source);
  await service.load("load");
  source.authorize.mockRejectedValue(new Error("revoked"));
  const read = vi.spyOn(store, "latest");
  await expect(service.cached()).rejects.toThrow("revoked");
  expect(read).not.toHaveBeenCalled();
  await expect(service.load("check")).rejects.toThrow("revoked");
});
it("cannot read another repository, workspace, user or installation cache", async () => {
  await store.put(identity, await graph());
  for (const other of [
    { ...identity, repositoryId: 202 },
    { ...identity, userId: 2 },
    { ...identity, workspace: "other" },
    { ...identity, installationId: 78 },
    { ...identity, repositoryName: "other/renamed" },
  ])
    expect(await store.latest(other)).toBeNull();
});
it("analyzer and schema versions invalidate incompatible entries", async () => {
  await store.put(identity, await graph());
  expect(
    await new FileCanvasGraphStore("next-analyzer/2").latest(identity),
  ).toBeNull();
  expect(
    await new FileCanvasGraphStore(undefined, 2).latest(identity),
  ).toBeNull();
});
it("simultaneous requests share exactly one analysis and all authorize", async () => {
  const source = provider();
  let release!: () => void;
  const latch = new Promise<void>((resolve) => {
    release = resolve;
  });
  source.analyze.mockImplementation(async (_id, rev) => {
    await latch;
    return graph(rev);
  });
  const a = new CanvasGraphService(store, source).load("load"),
    b = new CanvasGraphService(store, source).load("load");
  await vi.waitFor(() => expect(source.analyze).toHaveBeenCalledTimes(1));
  release();
  expect((await Promise.all([a, b])).every((r) => r.state === "ready")).toBe(
    true,
  );
  expect(source.authorize).toHaveBeenCalledTimes(4);
});
it("forces source analysis only for explicit reanalysis", async () => {
  const source = provider(),
    service = new CanvasGraphService(store, source);
  await service.load("load");
  await service.load("refresh");
  expect(source.analyze).toHaveBeenCalledTimes(1);
  await service.load("reanalyze");
  expect(source.analyze).toHaveBeenCalledTimes(2);
});
it("corrupt, malicious revision and invalid graphs never become cache hits", async () => {
  await store.put(identity, await graph());
  const files = await readdir(join(directory, "canvas-graphs-v1"));
  await writeFile(join(directory, "canvas-graphs-v1", files[0]), "corrupt");
  expect(await store.latest(identity)).toBeNull();
  expect(await store.latest(identity, "../escape")).toBeNull();
  const wrong = await graph();
  wrong.projectRef = "other-project";
  await expect(store.put(identity, wrong)).rejects.toThrow("scope");
});
it("does not persist arbitrary provider credentials or raw source fields", async () => {
  const input = Object.assign(await graph(), {
    installationToken: "must-not-persist",
    rawSource: "private source",
  });
  Object.assign(input.nodes[0], { token: "must-not-persist" });
  input.nodes[0].metadata = { token: "must-not-persist", framework: "Next.js" };
  await store.put(identity, input);
  const saved = await store.latest(identity);
  expect(JSON.stringify(saved)).not.toContain("must-not-persist");
  expect(JSON.stringify(saved)).not.toContain("private source");
  expect(saved?.graph.nodes[0].metadata?.framework).toBe("Next.js");
});
it("purges every version of a user's revoked project while retaining another user's graph", async () => {
  const other = { ...identity, userId: 2 };
  await store.put(identity, await graph());
  await store.put(other, await graph(shaA, other));
  await store.purge(identity);
  expect(await store.latest(identity)).toBeNull();
  expect(await store.latest(other)).not.toBeNull();
  await store.purge(other);
});
