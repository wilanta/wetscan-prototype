import { it, expect } from "vitest";
import { scannerFixture } from "./scanner-fixture";
import { createJob } from "../../../src/features/guard/pipeline";
import { bindGuardJob } from "../../../worker/guard/approval";
import { operationalRepositoryScanner } from "../../../worker/guard/scanner-adapter";
import { pipelineFailureReason } from "../../../worker/guard/source-failure";
import { fingerprint } from "../../../src/platform/identity";
import { sandboxControls } from "../../../worker/guard/sandbox";
async function configured() {
  const f = await scannerFixture("sast");
  const job = await createJob(f.grant, {
    ...f.request,
    engines: ["sast"],
    idempotencyKey: "g02-live-diagnostic-fixture",
  });
  const binding = bindGuardJob(job),
    p = f.input.permit;
  const q = {
    version: 1 as const,
    classification: "LIVE_VERIFIED_SANDBOX" as const,
    engine: "sast" as const,
    specDigest: fingerprint(f.input.spec),
    imageId: p.imageId,
    scannerVersion: p.scannerVersion,
    rulePack: p.rulePack,
    rulePackSha256: p.rulePackSha256,
    installationArtifactSha256: p.installationArtifactSha256,
    verifiedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    evidenceSha256: "b".repeat(64),
    daemonId: "unit-daemon",
    daemonVersion: "unit-version",
    kernelVersion: "unit-kernel",
    controls: sandboxControls,
  };
  f.input.evidence.verify.mockResolvedValue({
    expiresAt: Date.parse(q.expiresAt),
    verified: sandboxControls,
    artifactRef: "OFFLINE_DOUBLE",
  });
  const policy = {
    version: 1 as const,
    id: "offline-component",
    workspaceId: binding.workspaceId,
    projectId: binding.projectId,
    repositoryId: binding.repository.repositoryId,
    branches: ["main"],
    engines: ["sast" as const],
    scannerTimeoutMs: 1000,
    jobTimeoutMs: 120000,
    maxAttempts: 1 as const,
  };
  return {
    f,
    scanner: operationalRepositoryScanner({
      ...f.input,
      binding,
      qualification: q,
      policy,
    }),
  };
}
it("sandbox qualification refusal is distinct from scanner-output validation", async () => {
  const { f, scanner } = await configured();
  try {
    f.input.evidence.verify.mockResolvedValue(null as never);
    const e = await scanner
      .execute(f.snapshot, new AbortController().signal)
      .catch((e) => e);
    expect(JSON.parse(pipelineFailureReason(e, "scanner")).component).toBe(
      "sandbox",
    );
    expect(f.driver.entries.size).toBe(0);
  } finally {
    await f.cleanup();
  }
});
it("out-of-manifest scanner output stays scanner failure after verified exact-owned cleanup", async () => {
  const { f, scanner } = await configured();
  try {
    f.setOutput({
      results: [
        {
          check_id: "UNIT-RULE",
          path: "/source/outside.js",
          start: { line: 1 },
          extra: { message: "PRIVATE_DATA", severity: "ERROR" },
        },
      ],
      errors: [],
      paths: { scanned: ["/source/fixture.ts"] },
    });
    const e = await scanner
      .execute(f.snapshot, new AbortController().signal)
      .catch((e) => e);
    const reason = pipelineFailureReason(e, "scanner");
    expect(JSON.parse(reason)).toMatchObject({
      component: "scanner",
      code: "forbidden",
    });
    expect(reason).not.toContain("PRIVATE_DATA");
    expect(f.driver.entries.size).toBe(0);
  } finally {
    await f.cleanup();
  }
});
