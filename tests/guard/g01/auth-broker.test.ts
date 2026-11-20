import { expect, it, vi } from "vitest";
import { GuardSessionBroker } from "../../../worker/guard/auth-broker";
import { validateWorkerApproval } from "../../../worker/guard/approval";
import { LiveGuardError } from "../../../src/features/guard/live/model";
import { brokerFixture } from "./broker-fixture";
it("rejects a general review message and approvals for another target/action/job or expired window", async () => {
  const f = await brokerFixture();
  expect(
    validateWorkerApproval(f.permit, f.binding, f.permit.migrationPlanSha256)
      .execution,
  ).toBe("prepare_only");
  for (const bad of [
    "Approve mas, aman.",
    undefined,
    {
      ...f.permit,
      target: { ...f.permit.target, database: "wetscan_s01_test" },
    },
    { ...f.permit, actions: [...f.permit.actions, "scanner_execute"] },
    { ...f.permit, actions: ["worker_start"] },
    { ...f.permit, binding: { ...f.binding, actorId: "github-user-999" } },
    { ...f.permit, expiresAt: "2000-01-01" },
    { ...f.permit, approvedAt: new Date(Date.now() - 7200000).toISOString() },
    { ...f.permit, migrationPlanSha256: "f".repeat(64) },
  ])
    expect(() =>
      validateWorkerApproval(bad, f.binding, f.permit.migrationPlanSha256),
    ).toThrow("approval_required");
});
it("resolves fresh authorization each attempt and checks persisted actor/repository binding", async () => {
  const f = await brokerFixture(),
    broker = new GuardSessionBroker(f.permit, f.deps);
  await broker.handle(
    { op: "resolve", lease: f.lease },
    new AbortController().signal,
  );
  await broker.handle(
    { op: "resolve", lease: f.lease },
    new AbortController().signal,
  );
  expect(f.deps.current).toHaveBeenCalledTimes(2);
  f.deps.load.mockResolvedValue({
    job: {
      ...f.job,
      repository: { ...f.job.repository, commit: "c".repeat(40) },
    },
    revision: 1,
    coverage: null,
  });
  await expect(broker.admission()).rejects.toThrow("not_found");
});
it("denies wrong project/worker/stale lease before calling existing Auth", async () => {
  const f = await brokerFixture(),
    broker = new GuardSessionBroker(f.permit, f.deps);
  for (const lease of [
    { ...f.lease, workerId: "other" },
    { ...f.lease, expiresAt: "2000-01-01" },
    { ...f.lease, job: { ...f.lease.job, projectId: "github-999" } },
  ])
    await expect(
      broker.handle({ op: "resolve", lease }, new AbortController().signal),
    ).rejects.toThrow();
  f.deps.verifyLease.mockRejectedValue(new LiveGuardError("lease_lost", 409));
  await expect(
    broker.handle(
      { op: "resolve", lease: f.lease },
      new AbortController().signal,
    ),
  ).rejects.toThrow("lease_lost");
  expect(f.deps.current).not.toHaveBeenCalled();
});
it("does not replace existing logout/revocation or workspace checks with a cached grant", async () => {
  const f = await brokerFixture(),
    broker = new GuardSessionBroker(f.permit, f.deps);
  f.deps.current.mockResolvedValue({
    ...(await f.deps.current()),
    grant: { ...f.grant, workspaceId: "other" },
  });
  await expect(broker.admission()).rejects.toThrow();
  f.deps.current.mockResolvedValue({
    ...(await f.deps.current()),
    grant: f.grant,
    repositoryName: "other/repo",
  });
  await expect(broker.admission()).rejects.toThrow("not_found");
  f.deps.current.mockRejectedValue(
    new Error("synthetic logout/private-provider-message"),
  );
  await expect(
    broker.handle(
      { op: "resolve", lease: f.lease },
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  expect(f.deps.snapshots.acquire).not.toHaveBeenCalled();
});
it("allows only the stored scan request and private owned cleanup even after lease expiry", async () => {
  const f = await brokerFixture(),
    broker = new GuardSessionBroker(f.permit, f.deps),
    signal = new AbortController().signal;
  await expect(
    broker.handle(
      {
        op: "acquire",
        lease: f.lease,
        request: {
          ...f.request,
          repository: { ...f.request.repository, commit: "e".repeat(40) },
        },
      },
      signal,
    ),
  ).rejects.toThrow("invalid_input");
  const result = (await broker.handle(
    { op: "acquire", lease: f.lease, request: f.request },
    signal,
  )) as { handle: string; snapshot: unknown };
  expect(JSON.stringify(result)).not.toMatch(
    /sessionToken|installationToken|access_token|temporaryDirectory/,
  );
  await expect(
    broker.handle({ op: "dispose", lease: f.lease, handle: "forged" }, signal),
  ).rejects.toThrow("not_found");
  await broker.handle(
    {
      op: "dispose",
      lease: { ...f.lease, expiresAt: "2000-01-01" },
      handle: result.handle,
    },
    signal,
  );
  expect(f.deps.snapshots.dispose).toHaveBeenCalledWith(f.snapshot);
});
it("disposes source if authorization or lease is revoked after snapshot acquisition", async () => {
  const f = await brokerFixture(),
    broker = new GuardSessionBroker(f.permit, f.deps);
  f.deps.verifyLease
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new LiveGuardError("lease_lost", 409));
  await expect(
    broker.handle(
      { op: "acquire", lease: f.lease, request: f.request },
      new AbortController().signal,
    ),
  ).rejects.toThrow("lease_lost");
  expect(f.deps.snapshots.dispose).toHaveBeenCalledOnce();
});
it("rejects extra credential fields, closes owned snapshots, and surfaces cleanup failure", async () => {
  const f = await brokerFixture(),
    broker = new GuardSessionBroker(f.permit, f.deps),
    signal = new AbortController().signal;
  await expect(
    broker.handle(
      { op: "resolve", lease: f.lease, token: "synthetic-not-real" },
      signal,
    ),
  ).rejects.toThrow("invalid_input");
  await broker.handle(
    { op: "acquire", lease: f.lease, request: f.request },
    signal,
  );
  f.deps.snapshots.dispose.mockRejectedValueOnce(
    new Error("synthetic cleanup failure"),
  );
  await expect(broker.close()).rejects.toThrow("cleanup_failed");
  await broker.close();
  await expect(broker.admission()).rejects.toThrow("source_unavailable");
});

it("reserves the one-snapshot budget while acquisition is pending", async () => {
  const f = await brokerFixture(),
    broker = new GuardSessionBroker(f.permit, f.deps);
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  f.deps.snapshots.acquire.mockImplementation(async () => {
    await gate;
    return f.snapshot;
  });
  const packet = { op: "acquire", lease: f.lease, request: f.request };
  const first = broker.handle(packet, new AbortController().signal);
  try {
    await vi.waitFor(() =>
      expect(f.deps.snapshots.acquire).toHaveBeenCalledOnce(),
    );
    await expect(
      broker.handle(packet, new AbortController().signal),
    ).rejects.toThrow("invalid_input");
    expect(f.deps.snapshots.acquire).toHaveBeenCalledOnce();
  } finally {
    release();
    await first;
    await broker.close();
  }
});
