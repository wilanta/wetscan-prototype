import { it, expect, vi } from "vitest";
import { repositoryAdmission } from "../../../src/features/guard/live/product-admission";
import {
  authority,
  deploymentFixture,
  operationalJobFixture,
} from "./operational-fixture";
async function fixture() {
  const job = await operationalJobFixture(),
    create = vi.fn(),
    queued = vi.fn(async () => {}),
    close = vi.fn(async () => {}),
    head = vi.fn(async () => ({
      commit: job.repository.commit,
      tree: "b".repeat(40),
    })),
    authorize = vi.fn(async () => authority),
    storage = {
      get: async () => ({ job, revision: 1, coverage: null }),
      create,
    };
  const admission = repositoryAdmission({
    storage: storage as never,
    source: () => ({ authorize, open: async () => ({ head, close }) as never }),
    policy: deploymentFixture().policies[0],
    verifyReady: async () => {},
    onQueued: queued,
  });
  return { job, create, queued, close, head, authorize, admission };
}
it("resume rebinds current authorization and pin without creating a second durable job", async () => {
  const f = await fixture();
  expect(
    await f.admission.resume!(
      authority,
      f.job.id,
      new AbortController().signal,
    ),
  ).toMatchObject({ scanId: f.job.id, status: "queued" });
  expect(f.create).not.toHaveBeenCalled();
  expect(f.queued).toHaveBeenCalledOnce();
  expect(f.close).toHaveBeenCalledOnce();
});
it.each([
  "historical",
  "already_running",
  "actor",
  "revoked",
  "pin",
  "attempt_used",
])("resume refuses %s without enqueue/relaunch", async (mode) => {
  const f = await fixture();
  if (mode === "historical") f.job.idempotencyKey = "g01-historical";
  if (mode === "already_running") f.job.status = "running";
  if (mode === "actor") f.job.audit[0].actorId = "github-user-8";
  if (mode === "revoked") f.authorize.mockRejectedValue(Error("revoked"));
  if (mode === "pin")
    f.head.mockResolvedValue({ commit: "c".repeat(40), tree: "b".repeat(40) });
  if (mode === "attempt_used")
    f.queued.mockRejectedValue(Error("attempt_already_used"));
  await expect(
    f.admission.resume!(authority, f.job.id, new AbortController().signal),
  ).rejects.toThrow();
  expect(f.create).not.toHaveBeenCalled();
  if (mode !== "attempt_used") expect(f.queued).not.toHaveBeenCalled();
});
