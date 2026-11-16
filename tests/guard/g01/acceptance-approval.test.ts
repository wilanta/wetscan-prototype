import { expect, it } from "vitest";
import { acceptanceFixture } from "./acceptance-fixture";
import { caseLimits, spentJob } from "../../../worker/guard/acceptance/catalog";
import {
  validateExecution,
  validatePacket,
  hash,
} from "../../../worker/guard/acceptance/approval";
it.each(Object.keys(caseLimits) as (keyof typeof caseLimits)[])(
  "%s binds exact case limits and new prospective identity",
  async (id) => {
    const f = await acceptanceFixture(id);
    expect(validateExecution(f.packet, f.approve()).packet.caseId).toBe(id);
    const bad = structuredClone(f.packet);
    bad.limits.launches++;
    expect(() => validatePacket(bad)).toThrow();
  },
);
it("denies plans/old permits, spent job, changed mode/scope, extra fields and expiry before any ports", async () => {
  const f = await acceptanceFixture();
  for (const approval of [
    f.permit,
    {},
    null,
    { ...f.approve(), expiresAt: new Date(Date.now() - 1).toISOString() },
    { ...f.approve(), packetSha256: "0".repeat(64) },
    { ...f.approve(), scanner: true },
  ])
    expect(() => validateExecution(f.packet, approval)).toThrow();
  for (const change of [
    { execution: "prepare_only" },
    { target: { ...f.packet.target, port: 55432 } },
    { binding: { ...f.binding, jobId: spentJob } },
    { binding: { ...f.binding, actorId: "github-user-9" } },
    { artifacts: [{ file: "worker/guard/../.env", sha256: "a".repeat(64) }] },
    { scanner: true },
  ])
    expect(() => validatePacket({ ...f.packet, ...change })).toThrow();
  const changed = structuredClone(f.packet);
  changed.binding!.repository.commit = "f".repeat(40);
  expect(() => validateExecution(changed, f.approve())).toThrow();
});
it("cleanup window B cannot borrow window A or run before actual notBefore", async () => {
  const f = await acceptanceFixture("C02B");
  f.packet.cleanupReference!.notBefore = new Date(
    Date.now() + 3600000,
  ).toISOString();
  expect(() => validateExecution(f.packet, f.approve())).toThrow();
  const at = Date.parse(f.packet.cleanupReference!.notBefore);
  const a = {
    ...f.approve(),
    approvedAt: new Date(at).toISOString(),
    expiresAt: new Date(at + 60000).toISOString(),
    packetSha256: hash(JSON.stringify(f.packet)),
  };
  expect(validateExecution(f.packet, a, at + 1).packet.caseId).toBe("C02B");
});
