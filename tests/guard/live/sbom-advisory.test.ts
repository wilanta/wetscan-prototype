import { it, expect } from "vitest";
import {
  normalizeOSV,
  normalizeOSVInventory,
} from "../../../src/features/guard/evidence";
import { repositorySbom } from "../../../src/features/guard/sbom";
import {
  canonicalOutput,
  operationalRepositoryScanner,
} from "../../../worker/guard/scanner-adapter";
import { scannerFixture } from "./scanner-fixture";
import { createJob } from "../../../src/features/guard/pipeline";
import { bindGuardJob } from "../../../worker/guard/approval";
import { fingerprint } from "../../../src/platform/identity";
import { sandboxControls } from "../../../worker/guard/sandbox";
import {
  orderedRepositoryEngines,
  repositoryProfiles,
} from "../../../src/features/guard/live/scan-profiles";
const ctx = {
  mode: "live" as const,
  workspaceId: "w",
  projectId: "p",
  commit: "a".repeat(40),
  recordedAt: new Date().toISOString(),
  artifactDigest: "b".repeat(64),
  synthetic: false,
  scannerVersion: "2.7.1",
  rulePack: "official npm",
};
const output = {
  results: [
    {
      source: { path: "package-lock.json" },
      packages: [
        {
          package: { name: "lodash", version: "4.17.15", ecosystem: "npm" },
          vulnerabilities: [
            {
              id: "GHSA-EXAMPLE",
              aliases: ["CVE-EXAMPLE"],
              severity: [
                {
                  type: "CVSS_V3",
                  score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
                },
              ],
              affected: [
                {
                  package: { name: "lodash", ecosystem: "npm" },
                  ranges: [
                    { events: [{ introduced: "0" }, { fixed: "4.17.21" }] },
                  ],
                },
                {
                  package: { name: "OTHER", ecosystem: "npm" },
                  ranges: [{ events: [{ fixed: "99" }] }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
it("retains advisory aliases, matching-package fixes and CVSS vectors without inventing a numeric severity or license", async () => {
  const [f] = await normalizeOSV(output, ctx);
  expect(f.severityKnown).toBe(false);
  expect(f.advisory).toMatchObject({
    id: "GHSA-EXAMPLE",
    aliases: ["CVE-EXAMPLE"],
    fixedVersions: ["4.17.21"],
    cvss: [{ type: "CVSS_V3" }],
  });
  expect(normalizeOSVInventory(output)[0].license).toBeNull();
  const bom = repositorySbom(
    normalizeOSVInventory(output),
    {
      provider: "github",
      repositoryId: "123",
      branch: "main",
      commit: ctx.commit,
    },
    ctx.artifactDigest,
  );
  expect(bom.components).toHaveLength(1);
  expect(bom.components[0]).not.toHaveProperty("licenses");
  expect(bom.metadata.properties).toContainEqual({
    name: "wetscan:commit",
    value: ctx.commit,
  });
});
it("operational profile order is deterministic, excludes DAST and requires container coverage only in Full", () => {
  expect(orderedRepositoryEngines(["sbom", "sast", "iac"])).toEqual([
    "sast",
    "iac",
    "sbom",
  ]);
  expect(repositoryProfiles.quick).toEqual(["sast", "sca", "secrets"]);
  expect(repositoryProfiles.standard).toContain("sbom");
  expect(repositoryProfiles.full).toContain("container");
  expect(repositoryProfiles.full).not.toContain("dast");
});
it("SBOM is produced from a qualified real-port result, retains provenance and does not turn advisories into duplicate findings (Docker double)", async () => {
  const f = await scannerFixture("sbom");
  try {
    f.setOutput({
      ...output,
      results: output.results.map((r) => ({
        ...r,
        source: { path: "/source/package-lock.json" },
      })),
    });
    const q = {
      ...f.input.permit,
      version: 1 as const,
      classification: "LIVE_VERIFIED_SANDBOX" as const,
      verifiedAt: new Date().toISOString(),
      evidenceSha256: "b".repeat(64),
      daemonId: "unit-daemon",
      daemonVersion: "unit-version",
      kernelVersion: "unit-kernel",
      controls: sandboxControls,
      specDigest: fingerprint(f.input.spec),
    };
    f.input.evidence.verify.mockResolvedValue({
      expiresAt: Date.parse(q.expiresAt),
      verified: sandboxControls,
      artifactRef: "EXPLICIT_DOUBLE",
    });
    const policy = {
      version: 1 as const,
      id: "unit",
      workspaceId: f.input.binding.workspaceId,
      projectId: f.input.binding.projectId,
      repositoryId: f.input.binding.repository.repositoryId,
      branches: ["main"],
      engines: ["sbom" as const],
      scannerTimeoutMs: 1000,
      jobTimeoutMs: 120000,
      maxAttempts: 1 as const,
    };
    const job = await createJob(f.grant, {
      ...f.request,
      engines: ["sbom"],
      idempotencyKey: "g02-live-unit-sbom-fixture",
    });
    const scanner = operationalRepositoryScanner({
      ...f.input,
      binding: bindGuardJob(job),
      qualification: q,
      policy,
    });
    const result = await scanner.execute(
      f.snapshot,
      new AbortController().signal,
    );
    expect(result.findings).toEqual([]);
    expect(result.sbom?.components).toHaveLength(1);
    expect(result.run.executionEvidence?.cleanup).toBe("VERIFIED");
    expect(() =>
      canonicalOutput(
        { results: [{ source: { path: "/source/unlisted.json" } }] },
        "sbom",
        f.snapshot,
      ),
    ).toThrow();
  } finally {
    await f.cleanup();
  }
});
