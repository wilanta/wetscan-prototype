import { it, expect } from "vitest";
import { scannerFixture } from "./scanner-fixture";
import { sourceFixture } from "./source-fixture";
import { createJob } from "../../../src/features/guard/pipeline";
import { ProductSessionBroker } from "../../../worker/guard/product-broker";
import { operationalRepositoryScanner } from "../../../worker/guard/scanner-adapter";
import { bindGuardJob } from "../../../worker/guard/approval";
import { executeScopedJob } from "../../../worker/guard/orchestrator";
import { sandboxControls } from "../../../worker/guard/sandbox";
import { fingerprint } from "../../../src/platform/identity";
it("authorized real fixture files reach the actual broker/snapshot adapter and operational scanner/sandbox/normalizer; completion follows cleanup (Docker/provider doubles)", async () => {
  const f = await scannerFixture("sast");
  try {
    let stored = await createJob(f.grant, {
      ...f.request,
      engines: ["sast"],
      idempotencyKey: "g02-live-handoff-integration-fixture",
    });
    stored.audit.push({
      actorId: f.grant.actorId,
      at: new Date().toISOString(),
      action: "repository_scan_requested",
      subjectId: stored.id,
      reason: "OFFLINE_INTEGRATION_NOT_LIVE",
    });
    const binding = bindGuardJob(stored),
      source = sourceFixture({ count: 7 }),
      policy = {
        version: 1 as const,
        id: "offline-handoff",
        workspaceId: stored.workspaceId,
        projectId: stored.projectId,
        repositoryId: stored.repository.repositoryId,
        branches: ["main"],
        engines: ["sast" as const],
        scannerTimeoutMs: 1000,
        jobTimeoutMs: 120000,
        maxAttempts: 1 as const,
      };
    const q = {
      version: 1 as const,
      classification: "LIVE_VERIFIED_SANDBOX" as const,
      engine: "sast" as const,
      specDigest: fingerprint(f.input.spec),
      imageId: f.input.permit.imageId,
      scannerVersion: f.input.permit.scannerVersion,
      rulePack: f.input.permit.rulePack,
      rulePackSha256: f.input.permit.rulePackSha256,
      installationArtifactSha256: f.input.permit.installationArtifactSha256,
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
      artifactRef: "OFFLINE_DOUBLE_NOT_RUNTIME_QUALIFICATION",
    });
    f.setOutput({
      paths: { scanned: ["/source/src/file0000.js"] },
      results: [
        {
          check_id: "UNIT-RULE",
          path: "/source/src/file0000.js",
          start: { line: 1 },
          extra: { severity: "ERROR", message: "UNTRUSTED_FIXTURE_EXCERPT" },
        },
      ],
      errors: [],
    });
    const broker = new ProductSessionBroker(stored, policy, source.source);
    const scanner = operationalRepositoryScanner({
      ...f.input,
      binding,
      qualification: q,
      policy,
      sourceOwner: broker.owner,
      freshGrant: () => broker.freshGrant(),
    });
    const received: string[] = [];
    const original = scanner.execute.bind(scanner);
    scanner.execute = async (snapshot, signal) => {
      received.push(await broker.owner.directory(snapshot));
      expect(snapshot.files).toHaveLength(7);
      expect(broker.sourceCoverage()?.retrievedFiles).toBe(7);
      return original(snapshot, signal);
    };
    const transitions: string[] = [];
    const result = await executeScopedJob(
      {
        freshGrant: () => broker.freshGrant(),
        storage: {
          create: async (_g, j) => structuredClone(j),
          get: async () => structuredClone(stored),
          save: async (_g, j) => {
            stored = structuredClone(j);
            transitions.push(j.status);
            if (j.status === "completed") expect(f.driver.entries.size).toBe(0);
          },
        },
        snapshots: broker.snapshots,
        scanners: [scanner],
        sandbox: {
          ready: true,
          readOnly: true,
          nonRoot: true,
          egressControlled: true,
          cpuLimit: 1,
          memoryMb: 256,
          pidsLimit: 64,
          timeoutMs: 1000,
        },
      },
      await broker.freshGrant(),
      stored,
      stored.id,
      new AbortController().signal,
    );
    await broker.close();
    expect(result.status).toBe("completed_partial");
    expect(result.sourceCoverage?.retrievedFiles).toBe(7);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].evidence[0].commit).toBe(
      stored.repository.commit,
    );
    expect(JSON.stringify(result.findings)).not.toContain(
      "UNTRUSTED_FIXTURE_EXCERPT",
    );
    expect(result.runs.find((x) => x.engine === "sast")).toMatchObject({
      status: "completed",
      executionEvidence: { cleanup: "VERIFIED" },
    });
    expect(f.driver.entries.size).toBe(0);
    expect(transitions).toContain("running");
    const { access } = await import("node:fs/promises");
    for (const root of received)
      await expect(access(root)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await f.cleanup();
  }
}, 20000);
