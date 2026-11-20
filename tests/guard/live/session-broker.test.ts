import { pipelineFailureReason } from "../../../worker/guard/source-failure";
import { it, expect, vi } from "vitest";
import { ProductSessionBroker } from "../../../worker/guard/product-broker";
import {
  authority,
  deploymentFixture,
  operationalJobFixture,
} from "./operational-fixture";
import type { GuardSnapshotAdapter } from "../../../src/features/guard/live/snapshot";
async function fixture() {
  const job = await operationalJobFixture(),
    authorize = vi.fn(async () => structuredClone(authority)),
    snapshot = {
      ...job,
      repository: job.repository,
      files: [],
      digest: "a".repeat(64),
      expiresAt: Date.now() + 60000,
      coverage: {
        status: "complete" as const,
        retrievedFiles: 0,
        eligibleFiles: 0,
        bytes: 0,
        treeTruncated: false,
        exclusions: [],
      },
    };
  const owner = {
    acquire: vi.fn(async () => snapshot),
    refresh: vi.fn(async () => ({ ...snapshot })),
    dispose: vi.fn(async () => {}),
  };
  const broker = new ProductSessionBroker(
    job,
    deploymentFixture().policies[0],
    { authorize, open: vi.fn() },
    owner as unknown as GuardSnapshotAdapter,
  );
  const request = { ...job, engines: job.requestedEngines };
  return { job, broker, owner, authorize, snapshot, request };
}
it("requires original owner/repository on every fresh grant and never extends an old grant", async () => {
  const f = await fixture(),
    g = await f.broker.freshGrant();
  f.authorize.mockResolvedValue({
    ...authority,
    grant: { ...authority.grant, actorId: "github-user-8" },
  });
  await expect(f.broker.freshGrant()).rejects.toThrow();
  expect(g.expiresAt).toBe(authority.grant.expiresAt);
});
it("acquires exactly once and refreshes only its own source capability", async () => {
  const f = await fixture(),
    s = await f.broker.snapshots.acquire(
      authority.grant,
      f.request,
      new AbortController().signal,
    );
  await expect(
    f.broker.snapshots.acquire(authority.grant, f.request),
  ).rejects.toThrow();
  await expect(
    f.broker.snapshots.refresh!({ ...s }, authority.grant),
  ).rejects.toThrow();
  const next = await f.broker.snapshots.refresh!(s, authority.grant);
  await f.broker.snapshots.dispose(next);
  expect(f.owner.dispose).toHaveBeenCalledOnce();
  expect(f.broker.sourceCoverage()).toMatchObject({
    status: "complete",
    bytes: 0,
    retrievedFiles: 0,
  });
  await f.broker.close();
  expect(f.owner.dispose).toHaveBeenCalledOnce();
});
it("revocation denies acquisition, but existing owned source can still be normally disposed", async () => {
  const f = await fixture(),
    s = await f.broker.snapshots.acquire(authority.grant, f.request);
  f.authorize.mockRejectedValue(Error("revoked"));
  await expect(f.broker.freshGrant()).rejects.toThrow();
  await f.broker.snapshots.dispose(s);
  expect(f.owner.dispose).toHaveBeenCalledOnce();
});
it("rejects modified pinned requests before source acquisition", async () => {
  const f = await fixture();
  await expect(
    f.broker.snapshots.acquire(authority.grant, {
      ...f.request,
      repository: { ...f.job.repository, commit: "b".repeat(40) },
    }),
  ).rejects.toThrow();
  expect(f.owner.acquire).not.toHaveBeenCalled();
});
it("does not repeat a failed normal cleanup", async () => {
  const f = await fixture(),
    s = await f.broker.snapshots.acquire(authority.grant, f.request);
  f.owner.dispose.mockRejectedValue(Error("unknown"));
  await expect(f.broker.snapshots.dispose(s)).rejects.toThrow("cleanup_failed");
  await expect(f.broker.close()).rejects.toThrow("cleanup_failed");
  expect(f.owner.dispose).toHaveBeenCalledOnce();
});
it("historical jobs are refused without consulting the owner session", async () => {
  const f = await fixture();
  expect(
    () =>
      new ProductSessionBroker(
        { ...f.job, idempotencyKey: "g01-old" },
        deploymentFixture().policies[0],
        { authorize: f.authorize, open: vi.fn() },
      ),
  ).toThrow();
  expect(f.authorize).not.toHaveBeenCalled();
});

it("broker authorization failure is distinct from source acquisition failure without leaking provider text", async () => {
  const f = await fixture();
  f.authorize.mockRejectedValue(
    Object.assign(Error("PRIVATE_TOKEN"), { code: "forbidden" }),
  );
  const e = await f.broker.freshGrant().catch((e) => e);
  expect(
    JSON.parse(pipelineFailureReason(e, "snapshot_acquire")),
  ).toMatchObject({ component: "broker", code: "forbidden" });
  expect(f.owner.acquire).not.toHaveBeenCalled();
  expect(pipelineFailureReason(e, "snapshot_acquire")).not.toContain(
    "PRIVATE_TOKEN",
  );
});
