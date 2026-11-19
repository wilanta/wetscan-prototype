import { expect, it } from "vitest";
import {
  operatorSandboxEvidence,
  type SandboxEvidenceRecord,
} from "../../../worker/guard/sandbox-evidence";
import { sandboxControls } from "../../../worker/guard/sandbox";
const binding = {
  specDigest: "a".repeat(64),
  daemonVersion: "unit-version",
  daemonId: "unit-daemon",
  kernelVersion: "unit-kernel",
  imageId: "sha256:" + "b".repeat(64),
  image: "ghcr.io/fixture/probe@sha256:" + "c".repeat(64),
};
function record(): SandboxEvidenceRecord {
  return {
    schemaVersion: 1,
    module: "guard-sandbox",
    status: "PASS",
    verifiedBy: "synthetic-unit-fixture-not-real-proof",
    verifiedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    binding,
    controls: sandboxControls.map((control) => ({
      control,
      status: "PASS",
      artifactSha256: "d".repeat(64),
    })),
  };
}
it("accepts only complete, current, exact-bound operator evidence and clones it", async () => {
  const r = record(),
    evidence = operatorSandboxEvidence(r);
  r.controls = [];
  expect(await evidence.verify(binding)).toMatchObject({
    verified: sandboxControls,
    artifactRef: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
  });
});
it.each([
  "daemonId",
  "daemonVersion",
  "kernelVersion",
  "imageId",
  "image",
  "specDigest",
] as const)("rejects a changed %s", async (field) => {
  expect(
    await operatorSandboxEvidence(record()).verify({
      ...binding,
      [field]: "other",
    }),
  ).toBeNull();
});
it("rejects missing, expired, incomplete, duplicate and overlong evidence", async () => {
  const r = record();
  for (const invalid of [
    null,
    {},
    { ...r, expiresAt: new Date(Date.now() - 1).toISOString() },
    { ...r, controls: r.controls.slice(1) },
    { ...r, controls: [...r.controls.slice(1), r.controls[1]] },
    { ...r, expiresAt: new Date(Date.now() + 7200000).toISOString() },
  ]) {
    expect(await operatorSandboxEvidence(invalid).verify(binding)).toBeNull();
  }
});
