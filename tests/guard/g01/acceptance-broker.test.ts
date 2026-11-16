import { expect, it, vi } from "vitest";
import { fingerprint } from "../../../src/platform/identity";
import { createJob } from "../../../src/features/guard/pipeline";
import { FoundationBroker } from "../../../worker/guard/acceptance/broker";
import { sourcePermit } from "../../../worker/guard/acceptance/subpermit";
import {
  probeProgram,
  makeProbeSpec,
  expectedManifest,
} from "../../../worker/guard/acceptance/probe-spec";
import { acceptanceFixture } from "./acceptance-fixture";
async function setup() {
  const f = await acceptanceFixture(),
    spec = makeProbeSpec(await probeProgram(), { mode: "manifest", holdMs: 0 });
  f.packet.specDigests = [fingerprint(spec)];
  const approval = f.approve(),
    permit = sourcePermit(f.packet, approval, 0);
  f.job = await createJob(f.grant, {
    ...f.request,
    idempotencyKey: f.binding.idempotencyKey,
  });
  f.lease = {
    ...f.lease,
    workerId: permit.workerId,
    job: {
      ...f.lease.job,
      jobId: f.job.id,
      subjectRef: f.job.id,
      idempotencyKey: f.binding.idempotencyKey,
    },
  };
  f.deps.load = vi.fn(async () => ({
    job: f.job,
    revision: 1,
    coverage: null,
  }));
  const output = () =>
    JSON.stringify({
      version: 1,
      manifest: expectedManifest(f.snapshot),
      files: f.snapshot.files.length,
      bytes: 7,
      checks: Object.fromEntries(
        [
          "non_root",
          "read_only_root",
          "read_only_source",
          "source_readable",
          "no_socket",
          "no_host_secrets",
        ].map((c) => [c, true]),
      ),
    });
  const execute = vi.fn(async () => output()),
    broker = new FoundationBroker(
      f.packet,
      approval,
      permit,
      f.deps,
      spec,
      execute,
    );
  return { ...f, broker, execute, approval };
}
it("composes fresh Auth + exact lease + owned snapshot + probe proof over a private handle only", async () => {
  const f = await setup(),
    signal = new AbortController().signal;
  const result = (await f.broker.handle(
    {
      op: "acquire",
      lease: f.lease,
      request: { ...f.request, idempotencyKey: f.binding.idempotencyKey },
    },
    signal,
  )) as { handle: string };
  expect(JSON.stringify(result)).not.toMatch(
    /hostPath|providerToken|sourceDirectory/,
  );
  expect(
    await f.broker.handle(
      { op: "probe", lease: f.lease, handle: result.handle },
      signal,
    ),
  ).toEqual({
    manifest: expectedManifest(f.snapshot),
    specDigest: f.packet.specDigests[0],
  });
  expect(f.deps.current.mock.calls.length).toBeGreaterThanOrEqual(3);
  expect(f.deps.verifyLease).toHaveBeenCalled();
  await f.broker.handle(
    { op: "dispose", lease: f.lease, handle: result.handle },
    signal,
  );
  expect(f.deps.snapshots.dispose).toHaveBeenCalledOnce();
  await f.broker.close();
});
it("denies forged/cross-lease handles and arbitrary probe argv before any driver", async () => {
  const f = await setup(),
    signal = new AbortController().signal;
  await expect(
    f.broker.handle({ op: "probe", lease: f.lease, handle: "unknown" }, signal),
  ).rejects.toThrow();
  expect(f.execute).not.toHaveBeenCalled();
  const r = (await f.broker.handle(
    {
      op: "acquire",
      lease: f.lease,
      request: { ...f.request, idempotencyKey: f.binding.idempotencyKey },
    },
    signal,
  )) as { handle: string };
  await expect(
    f.broker.handle(
      {
        op: "probe",
        lease: { ...f.lease, leaseToken: "2:wrong" },
        handle: r.handle,
      },
      signal,
    ),
  ).rejects.toThrow();
  await expect(
    f.broker.handle(
      { op: "probe", lease: f.lease, handle: r.handle, args: ["untrusted"] },
      signal,
    ),
  ).rejects.toThrow();
  await f.broker.close();
});
it("revocation after probe prevents metadata proof; owner disposal remains possible", async () => {
  const f = await setup(),
    signal = new AbortController().signal;
  const r = (await f.broker.handle(
    {
      op: "acquire",
      lease: f.lease,
      request: { ...f.request, idempotencyKey: f.binding.idempotencyKey },
    },
    signal,
  )) as { handle: string };
  f.execute.mockImplementation(async () => {
    f.deps.current.mockRejectedValue(new Error("revoked"));
    return JSON.stringify({});
  });
  await expect(
    f.broker.handle({ op: "probe", lease: f.lease, handle: r.handle }, signal),
  ).rejects.toThrow();
  await f.broker.handle(
    { op: "dispose", lease: f.lease, handle: r.handle },
    signal,
  );
  expect(f.deps.snapshots.dispose).toHaveBeenCalledOnce();
  await f.broker.close();
});
